package com.apexintelligence.research

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Opt-in periodic refresh: public Binance Spot 24h prices ONLY for the
 * currently saved favorites (max 10). The manually selected asset is never
 * added to this background workload. WorkManager is periodic (15m minimum).
 * One batched ticker GET limits network usage. A failed GET preserves Room data.
 */
class ApexSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        ApexApiLedger.install(applicationContext)
        val settings = try { ApexPreferences.read(applicationContext) }
                       catch (_: Exception) { return Result.retry() }
        if (!settings.backgroundSyncEnabled) return Result.success()
        val favorites = settings.favorites
            .filter { Regex("^[A-Z0-9]{5,20}$").matches(it) }
            .distinct().take(ApexPreferences.MAX_FAVORITES)
        if (favorites.isEmpty()) return Result.success()

        return try {
            val dao = ApexDatabase.get(applicationContext).researchDao()
            withContext(Dispatchers.IO) {
                // The public Binance REST API accepts an exact JSON symbol list.
                // One 24h request serves at most ten favorites; no catalog-wide GET.
                try {
                    val symbols = URLEncoder.encode(JSONArray(favorites).toString(), "UTF-8")
                    val url = URL("https://data-api.binance.vision/api/v3/ticker/24hr?symbols=$symbols")
                    val connection = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 7500
                        readTimeout = 7500
                        useCaches = false
                        setRequestProperty("Accept", "application/json")
                    }
                    try {
                        val rows = ApexApiLedger.observe("binance","spot-24h") { probe ->
                            val code = connection.responseCode
                            probe.httpStatus(code)
                            if (code != 200) null else {
                                val data = JSONArray(connection.inputStream.bufferedReader()
                                    .use { it.readText() })
                                // HTTP 200 is NOT proof that the batched response
                                // contains valid observations for the exact favorites.
                                // Malformed, stale and mismatched batches are recorded
                                // as INVALID, without inventing a successful API sample.
                                val seen = HashSet<String>()
                                val receivedAt = System.currentTimeMillis()
                                var validBatch = data.length() == favorites.size
                                var newestSourceAt = 0L
                                for (i in 0 until data.length()) {
                                    val item = data.optJSONObject(i)
                                    val symbol = item?.optString("symbol") ?: ""
                                    val closeAt = item?.optLong("closeTime", -1L) ?: -1L
                                    val price = item?.optString("lastPrice", "")?.toDoubleOrNull()
                                    val change = item?.optString("priceChangePercent", "")?.toDoubleOrNull()
                                    val volume = item?.optString("quoteVolume", "")?.toDoubleOrNull()
                                    if (symbol !in favorites || !seen.add(symbol) ||
                                        closeAt < receivedAt - 180_000L ||
                                        closeAt > receivedAt + 60_000L ||
                                        price == null || !price.isFinite() || price <= 0 ||
                                        change == null || !change.isFinite() ||
                                        kotlin.math.abs(change) > 1000.0 ||
                                        volume == null || !volume.isFinite() || volume <= 0)
                                        validBatch = false
                                    if (closeAt > newestSourceAt) newestSourceAt = closeAt
                                }
                                if (validBatch && seen.size == favorites.size)
                                    probe.validated(newestSourceAt)
                                data
                            }
                        }
                        if (rows != null) {
                            val received = System.currentTimeMillis()
                            val allowed = favorites.toSet()
                            for (i in 0 until minOf(rows.length(), ApexPreferences.MAX_FAVORITES)) {
                                val json = rows.optJSONObject(i) ?: continue
                                val asset = json.optString("symbol")
                                if (asset !in allowed) continue
                                val observed = json.optLong("closeTime", -1L)
                                val price = json.optString("lastPrice", "").toDoubleOrNull()
                                val percent = json.optString("priceChangePercent", "").toDoubleOrNull()
                                val quoteVolume = json.optString("quoteVolume", "").toDoubleOrNull()
                                // Preserve the exact as-published evidence contract
                                // shared by WebView snapshots and ApexEvidenceContext.
                                if (observed < received - 180_000L ||
                                    observed > received + 60_000L ||
                                    price == null || price <= 0 || !price.isFinite() ||
                                    percent == null || !percent.isFinite() ||
                                    kotlin.math.abs(percent) > 1000.0 ||
                                    quoteVolume == null || quoteVolume <= 0 ||
                                    !quoteVolume.isFinite()) continue
                                dao.saveObservation(ResearchObservation(
                                    id = "background:$asset:$observed",
                                    asset = asset,
                                    source = "binance:spot:24h",
                                    kind = "market",
                                    sourceState = "OK",
                                    observedAt = observed,
                                    collectedAt = received,
                                    payloadJson = JSONObject()
                                        .put("price", price)
                                        .put("changePercent24h", percent)
                                        .put("quoteVolume", quoteVolume)
                                        .put("symbol", asset)
                                        .put("source", "Binance 24h spot ticker")
                                        .toString()
                                ))
                            }
                        }
                    } finally { connection.disconnect() }
                } catch (_: Exception) {
                    // Keep previously saved prices and continue favorite-only H1/M5.
                }
                dao.pruneObservations(System.currentTimeMillis() - TimeUnit.DAYS.toMillis(14))
            }
            // User opted in: scan at most ten favorites for reproducible H1
            // hypotheses while Android permits background network activity.
            // All actual observation logic is in the same Kotlin core as foreground.
            if (favorites.isNotEmpty()) {
                ApexAutoForecast.syncAll(applicationContext, favorites)
            }
            // Independent persistent Radar state is collected without opening WebView.
            // Scheduling is deferrable: source timestamp, never wall-clock assumptions.
            ApexRadarMonitor.sync(applicationContext, favorites, dao)
            // Reuse genuine Radar M15/H4 candles; no duplicated download loop.
            ApexMultiFrameForecast.syncAll(applicationContext, favorites, dao)
            // M15/H4 stages are appended after ApexAutoForecast has already
            // dispatched H1 alerts. Dispatch once more for these new stages.
            // The durable per-forecast/stage ledger prevents duplicates.
            try { ApexForecastNotifier.dispatch(applicationContext, favorites, dao) }
            catch (_: Exception) { /* Alerts must not fail source synchronization. */ }
            Result.success()
        } catch (_: java.io.IOException) {
            Result.retry()
        } catch (_: Exception) {
            // Unexpected faults should be visible in system logs, not loop rapidly.
            Result.failure()
        }
    }
}

object ApexSyncScheduler {
    const val UNIQUE_NAME = "apex-mobile-research-sync-v1"

    fun reconcile(context: Context, enabled: Boolean) {
        val manager = WorkManager.getInstance(context.applicationContext)
        if (!enabled) {
            manager.cancelUniqueWork(UNIQUE_NAME)
            return
        }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()
        val request = PeriodicWorkRequestBuilder<ApexSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        manager.enqueueUniquePeriodicWork(
            UNIQUE_NAME, ExistingPeriodicWorkPolicy.UPDATE, request
        )
    }
}

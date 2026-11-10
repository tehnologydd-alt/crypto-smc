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
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Opt-in periodic refresh: public Binance Spot 24h prices ONLY for the
 * currently saved favorites (max 10). The manually selected asset is never
 * added to this background workload. WorkManager is periodic (15m minimum).
 * All failures are per asset; one unavailable ticker cannot hide other favorites.
 */
class ApexSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
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
                for (asset in favorites) {
                    // Never retry the whole favorite set for an individual HTTP error.
                    val record = try {
                        val url = URL("https://data-api.binance.vision/api/v3/ticker/24hr?symbol=$asset")
                        val connection = (url.openConnection() as HttpURLConnection).apply {
                            requestMethod = "GET"
                            connectTimeout = 7500
                            readTimeout = 7500
                            useCaches = false
                            setRequestProperty("Accept", "application/json")
                        }
                        try {
                            if (connection.responseCode != 200) null
                            else {
                                val json = JSONObject(connection.inputStream.bufferedReader()
                                    .use { it.readText() })
                                val received = System.currentTimeMillis()
                                val observed = json.optLong("closeTime", -1L)
                                val price = json.optString("lastPrice", "").toDoubleOrNull()
                                val percent = json.optString("priceChangePercent", "").toDoubleOrNull()
                                if (json.optString("symbol") != asset ||
                                    observed < received - 180_000L ||
                                    observed > received + 60_000L ||
                                    price == null || price <= 0 || !price.isFinite() ||
                                    percent == null || !percent.isFinite()) null
                                else ResearchObservation(
                                    id = "background:$asset:$observed",
                                    asset = asset,
                                    source = "binance:spot:24h",
                                    kind = "market",
                                    sourceState = "OK",
                                    observedAt = observed,
                                    collectedAt = received,
                                    payloadJson = JSONObject()
                                        .put("price", price)
                                        .put("priceChangePercent24h", percent)
                                        .put("symbol", asset)
                                        .put("source", "Binance 24h spot ticker")
                                        .toString()
                                )
                            }
                        } finally { connection.disconnect() }
                    } catch (_: Exception) {
                        null
                    }
                    if (record != null) {
                        dao.saveObservation(record)
                    }
                }
                dao.pruneObservations(System.currentTimeMillis() - TimeUnit.DAYS.toMillis(14))
            }
            // User opted in: scan at most ten favorites for reproducible H1
            // hypotheses while Android permits background network activity.
            // All actual observation logic is in the same Kotlin core as foreground.
            if (favorites.isNotEmpty()) {
                ApexAutoForecast.syncAll(applicationContext, favorites)
            }
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

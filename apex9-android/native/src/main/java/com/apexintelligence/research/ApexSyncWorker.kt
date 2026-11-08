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
 * Opt-in periodic refresh: public Binance spot 24h price only for one selected
 * asset. Android chooses execution time; this is not a live monitoring service.
 */
class ApexSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val settings = try { ApexPreferences.read(applicationContext) }
                       catch (_: Exception) { return Result.retry() }
        if (!settings.backgroundSyncEnabled) return Result.success()
        val asset = settings.asset
        if (!Regex("^[A-Z0-9]{5,20}$").matches(asset)) return Result.failure()

        return try {
            val record = withContext(Dispatchers.IO) {
                val url = URL("https://data-api.binance.vision/api/v3/ticker/24hr?symbol=$asset")
                val connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 7500
                    readTimeout = 7500
                    useCaches = false
                    setRequestProperty("Accept", "application/json")
                }
                try {
                    val status = connection.responseCode
                    if (status == 429 || status >= 500) throw java.io.IOException("Temporary API failure $status")
                    if (status != 200) return@withContext null
                    val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                    val received = System.currentTimeMillis()
                    val observed = json.optLong("closeTime", -1L)
                    val price = json.optString("lastPrice", "").toDoubleOrNull()
                    val percent = json.optString("priceChangePercent", "").toDoubleOrNull()
                    if (json.optString("symbol") != asset ||
                        observed < received - 180_000L || observed > received + 60_000L ||
                        price == null || price <= 0 || !price.isFinite() ||
                        percent == null || !percent.isFinite()) return@withContext null
                    ResearchObservation(
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
                } finally { connection.disconnect() }
            }
            if (record != null) {
                val dao = ApexDatabase.get(applicationContext).researchDao()
                dao.saveObservation(record)
                dao.pruneObservations(System.currentTimeMillis() - TimeUnit.DAYS.toMillis(14))
            }
            // No source coverage if unavailable; never save synthetic data.
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
        val request = PeriodicWorkRequestBuilder<ApexSyncWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        manager.enqueueUniquePeriodicWork(
            UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request
        )
    }
}

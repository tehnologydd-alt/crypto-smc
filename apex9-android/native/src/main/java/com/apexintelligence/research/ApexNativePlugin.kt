package com.apexintelligence.research

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Narrow read-only research bridge. No order/account operations.
 * All Room/DataStore operations run off the WebView UI thread.
 */
@CapacitorPlugin(name = "ApexNative")
class ApexNativePlugin : Plugin() {
    private val tasks = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val assetRegex = Regex("^[A-Z0-9]{5,20}$")
    private val sourceRegex = Regex("^[a-zA-Z0-9:._-]{2,80}$")
    private val kindSet = setOf("market", "liquidity", "onchain", "news", "macro", "social", "context")

    @PluginMethod
    fun getStatus(call: PluginCall) {
        tasks.launch {
            try {
                val app = context.applicationContext
                val db = ApexDatabase.get(app).researchDao()
                val prefs = ApexPreferences.read(app)
                ApexSyncScheduler.reconcile(app, prefs.backgroundSyncEnabled)
                val result = JSObject()
                result.put("native", true)
                result.put("asset", prefs.asset)
                result.put("backgroundSyncEnabled", prefs.backgroundSyncEnabled)
                result.put("observationCount", db.observationCount())
                result.put("candleCount", db.candleCount())
                result.put("forecastCount", db.forecastCount())
                result.put("latestObservationAt", db.latestObservationAt() ?: 0L)
                result.put("storage", "Room")
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Native storage unavailable: " + (e.message ?: "unknown"))
            }
        }
    }

    @PluginMethod
    fun saveObservation(call: PluginCall) {
        val asset = call.getString("asset")
        val source = call.getString("source")
        val kind = call.getString("kind")
        val id = call.getString("id")
        val payload = call.getString("payload")
        val observedAt = call.data.optLong("observedAt", 0L)
        val collectedAt = call.data.optLong("collectedAt", 0L)
        val now = System.currentTimeMillis()
        if (asset == null || !assetRegex.matches(asset) ||
            source == null || !sourceRegex.matches(source) ||
            kind == null || !kindSet.contains(kind) ||
            id.isNullOrBlank() || id.length > 125 ||
            payload == null || payload.length > 16_384 ||
            observedAt <= 0L || observedAt > now + 60_000L ||
            collectedAt < observedAt || collectedAt > now + 60_000L) {
            call.reject("Invalid or oversized source observation")
            return
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                dao.saveObservation(
                    ResearchObservation(
                        id = id, asset = asset, source = source, kind = kind,
                        sourceState = "OK", observedAt = observedAt,
                        collectedAt = collectedAt, payloadJson = payload
                    )
                )
                dao.pruneObservations(System.currentTimeMillis() - 14L * 86_400_000L)
                val result = JSObject()
                result.put("saved", true)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to persist observation: " + (e.message ?: "unknown"))
            }
        }
    }

    @PluginMethod
    fun getObservations(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val limit = call.data.optInt("limit", 15).coerceIn(1, 50)
        if (!assetRegex.matches(asset)) {
            call.reject("Invalid asset")
            return
        }
        tasks.launch {
            try {
                val observations = ApexDatabase.get(context).researchDao().observations(asset, limit)
                val rows = JSArray()
                for (row in observations) {
                    val item = JSObject()
                    item.put("id", row.id)
                    item.put("asset", row.asset)
                    item.put("source", row.source)
                    item.put("kind", row.kind)
                    item.put("observedAt", row.observedAt)
                    item.put("collectedAt", row.collectedAt)
                    item.put("sourceState", row.sourceState)
                    item.put("payload", row.payloadJson)
                    rows.put(item)
                }
                val result = JSObject()
                result.put("observations", rows)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Failed to load history: " + (e.message ?: "unknown"))
            }
        }
    }


    private val intervals = mapOf(
        "15m" to 900_000L, "1h" to 3_600_000L,
        "4h" to 14_400_000L, "1d" to 86_400_000L
    )

    /** Save only genuine FINISHED source candles; batch sizes bounded for phones. */
    @PluginMethod
    fun saveCandles(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val interval = call.getString("interval") ?: ""
        val step = intervals[interval]
        val rows = call.data.optJSONArray("candles")
        val now = System.currentTimeMillis()
        if (!assetRegex.matches(asset) || step == null || rows == null ||
            rows.length() < 1 || rows.length() > 600) {
            call.reject("Invalid candle batch")
            return
        }
        val candles = ArrayList<MarketCandle>(rows.length())
        var previous = -1L
        for (i in 0 until rows.length()) {
            val x = rows.optJSONObject(i)
            if (x == null) {
                call.reject("Malformed candle data")
                return
            }
            val t = x.optLong("t", -1L)
            val closeAt = x.optLong("closeAt", -1L)
            val o = x.optDouble("open", Double.NaN)
            val h = x.optDouble("high", Double.NaN)
            val l = x.optDouble("low", Double.NaN)
            val c = x.optDouble("close", Double.NaN)
            val v = x.optDouble("volume", Double.NaN)
            if (t <= 0 || t % step != 0L || t <= previous ||
                closeAt != t + step - 1L || closeAt >= now ||
                !o.isFinite() || !h.isFinite() || !l.isFinite() ||
                !c.isFinite() || !v.isFinite() ||
                o <= 0.0 || l <= 0.0 || c <= 0.0 ||
                h < maxOf(o, c, l) || l > minOf(o, c, h) || v < 0.0) {
                call.reject("Inconsistent or unfinished OHLCV record")
                return
            }
            previous = t
            candles.add(MarketCandle(asset, interval, t, closeAt, o, h, l, c, v, now))
        }
        tasks.launch {
            try {
                val dao = ApexDatabase.get(context).researchDao()
                dao.saveCandles(candles)
                val cutoff = maxOf(0L, candles.last().openTime - 500L * step)
                dao.pruneCandles(asset, interval, cutoff)
                call.resolve(JSObject().put("saved", candles.size))
            } catch (e: Exception) {
                call.reject("Could not save native candles: " + (e.message ?: "unknown"))
            }
        }
    }

    /** Offline candle history is always labelled cache by the web bridge. */
    @PluginMethod
    fun getCandles(call: PluginCall) {
        val asset = call.getString("asset") ?: ""
        val interval = call.getString("interval") ?: ""
        val limit = call.data.optInt("limit", 500).coerceIn(1, 600)
        if (!assetRegex.matches(asset) || !intervals.containsKey(interval)) {
            call.reject("Invalid candle query")
            return
        }
        tasks.launch {
            try {
                val saved = ApexDatabase.get(context).researchDao().candles(asset, interval, limit)
                val rows = JSArray()
                for (record in saved.asReversed()) {
                    rows.put(JSObject()
                        .put("t", record.openTime).put("closeAt", record.closeTime)
                        .put("open", record.open).put("high", record.high)
                        .put("low", record.low).put("close", record.close)
                        .put("volume", record.volume).put("closed", true)
                        .put("recordedAt", record.recordedAt))
                }
                call.resolve(JSObject()
                    .put("candles", rows)
                    .put("source", "LOCAL_ROOM_CACHE")
                    .put("asset", asset).put("interval", interval))
            } catch (e: Exception) {
                call.reject("Could not load cached candles: " + (e.message ?: "unknown"))
            }
        }
    }

    @PluginMethod
    fun setSettings(call: PluginCall) {
        val asset = call.getString("asset")
        val enabled = if (call.data.has("backgroundSyncEnabled"))
            call.data.optBoolean("backgroundSyncEnabled") else null
        if (asset != null && !assetRegex.matches(asset)) {
            call.reject("Invalid asset")
            return
        }
        tasks.launch {
            try {
                val app = context.applicationContext
                val settings = ApexPreferences.update(app, asset, enabled)
                ApexSyncScheduler.reconcile(app, settings.backgroundSyncEnabled)
                val result = JSObject()
                result.put("asset", settings.asset)
                result.put("backgroundSyncEnabled", settings.backgroundSyncEnabled)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Could not save native settings: " + (e.message ?: "unknown"))
            }
        }
    }
}

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

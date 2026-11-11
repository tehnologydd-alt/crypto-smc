package com.apexintelligence.research

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.util.concurrent.TimeUnit

/**
 * Local, bounded native HTTP attempt ledger. No URLs, keys, response bodies,
 * symbols, account identifiers or prediction results are retained.
 * WorkManager is deferrable: this never schedules network requests itself.
 * Native events stay in their own lane; web observations are never replayed.
 */
object ApexApiLedger {
    const val VERSION = "APEX_NATIVE_API_LEDGER_V1"
    private const val STORE = "apex-native-api-ledger-v1"
    private const val MAX_AGE = 30L * 24L * 60L * 60L * 1000L
    private const val MAX_PER_LANE = 120
    private const val MAX_LANES = 12
    private val NAME = Regex("^[a-z0-9:-]{2,40}$")
    private val guard = Any()
    @Volatile private var app: Context? = null

    fun install(context: Context) { app = context.applicationContext }

    class Probe internal constructor() {
        internal var http: Int? = null
        internal var valid = false
        internal var providerTime: Long? = null
        fun httpStatus(code: Int) { http = code }
        fun validated(providerObservedAt: Long? = null) {
            valid = true
            if (providerObservedAt != null && providerObservedAt > 0)
                providerTime = providerObservedAt
        }
    }

    private fun classification(probe: Probe, error: Throwable?): String {
        val http = probe.http
        return when {
            http == 429 -> "RATE_LIMITED"
            http == 401 || http == 403 -> "ACCESS_DENIED"
            http != null && http != HttpURLConnection.HTTP_OK -> "HTTP_ERROR"
            error != null && http == null -> "OFFLINE"
            error != null || !probe.valid -> "INVALID"
            else -> "OK"
        }
    }

    /** Call only around a genuine native HTTP GET, never around Room/cache. */
    fun <T> observe(provider: String, lane: String, block: (Probe) -> T): T {
        val started = System.currentTimeMillis()
        val probe = Probe()
        var failure: Throwable? = null
        try {
            return block(probe)
        } catch (error: Throwable) {
            failure = error
            throw error
        } finally {
            val finished = System.currentTimeMillis()
            val status = classification(probe, failure)
            try { record(provider, lane, started, finished, status, probe.providerTime) }
            catch (_: Exception) { /* Metric recording must never break research. */ }
        }
    }

    private fun record(provider: String, lane: String, start: Long, end: Long,
                       state: String, sourceAt: Long?) {
        val context = app ?: return
        if (!NAME.matches(provider) || !NAME.matches(lane) || end < start ||
            end - start > 120_000L || start <= 0L) return
        synchronized(guard) {
            val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
            val root = try { JSONObject(prefs.getString("events", "{}") ?: "{}") }
                       catch (_: Exception) { JSONObject() }
            val key = "$provider:$lane"
            val cutoff = end - MAX_AGE
            val cleaned = JSONObject()
            val knownKeys = root.keys().asSequence().toList().filter(NAME::matches)
            for (id in knownKeys.take(MAX_LANES)) {
                val input = root.optJSONArray(id) ?: continue
                val output = JSONArray()
                for (i in maxOf(0, input.length() - MAX_PER_LANE) until input.length()) {
                    val event = input.optJSONObject(i) ?: continue
                    val t = event.optLong("at", 0L)
                    if (t in cutoff..(end + 60_000L) &&
                        event.optString("state") in setOf(
                            "OK", "INVALID", "OFFLINE", "HTTP_ERROR",
                            "RATE_LIMITED", "ACCESS_DENIED")) output.put(event)
                }
                if (output.length() > 0) cleaned.put(id, output)
            }
            if (!cleaned.has(key) && cleaned.length() >= MAX_LANES) return
            val records = cleaned.optJSONArray(key) ?: JSONArray()
            val event = JSONObject().put("at", end).put("state", state)
                .put("ms", end - start)
            // Only a genuine provider timestamp may back a freshness claim.
            if (sourceAt != null && sourceAt in 1..(end + 60_000L))
                event.put("providerAt", sourceAt)
            records.put(event)
            val bounded = JSONArray()
            for (i in maxOf(0, records.length() - MAX_PER_LANE) until records.length())
                bounded.put(records.get(i))
            cleaned.put(key, bounded)
            prefs.edit().putString("events", cleaned.toString()).apply()
        }
    }

    /** One read-only device-local snapshot; no request is triggered by this. */
    fun snapshot(context: Context): JSONObject {
        install(context)
        val at = System.currentTimeMillis()
        synchronized(guard) {
            val prefs = context.applicationContext
                .getSharedPreferences(STORE, Context.MODE_PRIVATE)
            val root = try { JSONObject(prefs.getString("events", "{}") ?: "{}") }
                       catch (_: Exception) { JSONObject() }
            val rows = JSONArray()
            for (key in root.keys().asSequence().toList().sorted().take(MAX_LANES)) {
                if (!NAME.matches(key)) continue
                val events = root.optJSONArray(key) ?: continue
                var attempts = 0; var good = 0; var invalid = 0
                var limited = 0; var failures = 0; var lastAt = 0L
                val days = HashSet<Long>()
                val latencies = mutableListOf<Long>()
                var checked = 0; var fresh = 0
                for (i in maxOf(0, events.length() - MAX_PER_LANE) until events.length()) {
                    val row = events.optJSONObject(i) ?: continue
                    val t = row.optLong("at", 0L)
                    if (t < at - MAX_AGE || t > at + 60_000L) continue
                    val state = row.optString("state")
                    if (state !in setOf("OK", "INVALID", "OFFLINE", "HTTP_ERROR",
                            "RATE_LIMITED", "ACCESS_DENIED")) continue
                    attempts++; days.add(t / TimeUnit.DAYS.toMillis(1))
                    lastAt = maxOf(lastAt, t)
                    if (state == "OK") good++ else failures++
                    if (state == "INVALID") invalid++
                    if (state == "RATE_LIMITED") limited++
                    val duration = row.optLong("ms", -1L)
                    if (duration in 0..120_000) latencies.add(duration)
                    val seen = row.optLong("providerAt", -1L)
                    if (seen > 0L && seen <= t + 60_000L && state == "OK") {
                        checked++
                        if (t - seen <= 3 * 60_000L) fresh++
                    }
                }
                if (attempts == 0) continue
                latencies.sort()
                val median = if (latencies.isEmpty()) JSONObject.NULL else
                    latencies[latencies.size / 2]
                val enough = attempts >= 12 && days.size >= 2
                rows.put(JSONObject()
                    .put("lane", key).put("state", if (enough) "OBSERVED" else "COLLECTING")
                    .put("attempts", attempts).put("uniqueDays", days.size)
                    .put("ok", good).put("failures", failures)
                    .put("invalid", invalid).put("rateLimited", limited)
                    .put("availabilityPercent", if (enough)
                        (1000L * good / attempts).toDouble() / 10.0 else JSONObject.NULL)
                    .put("latencyMedianMs", median)
                    .put("freshnessChecked", checked).put("freshnessConfirmed", fresh)
                    .put("lastAt", lastAt))
            }
            return JSONObject().put("native", true).put("version", VERSION)
                .put("source", "ANDROID_NATIVE_REQUEST_LEDGER")
                .put("capturedAt", at).put("rows", rows)
                .put("note", "Only actual native HTTP attempts. Not prediction accuracy.")
        }
    }
}

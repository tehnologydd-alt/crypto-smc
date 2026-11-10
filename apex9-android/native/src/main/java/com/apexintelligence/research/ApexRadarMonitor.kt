package com.apexintelligence.research

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * Opt-in, read-only Radar collector shared by WorkManager and the foreground UI.
 * The public endpoint returns closed Spot OHLCV; no polling services, orders,
 * price guesses, unclosed candles or notifications.
 *
 * M15 is evaluated once per observed M15 close; H1 reuses the H1 Room archive
 * already populated by ApexAutoForecast; H4/D1 fetch only on new closes.
 * Android's periodic jobs are deferrable and cannot promise exact boundaries.
 */
object ApexRadarMonitor {
    private const val STORE = "apex_radar_native_v1"
    private const val MAX_HTTP_PER_WORK = 16
    private const val LIMIT = 60
    private const val GRACE_MS = 30_000L
    private val symbolPattern = Regex("^[A-Z0-9]{2,16}USDT$")
    private val periods = linkedMapOf(
        "15m" to 900_000L, "1h" to 3_600_000L,
        "4h" to 14_400_000L, "1d" to 86_400_000L
    )

    private fun median(values: List<Double>): Double {
        val list = values.sorted()
        return if (list.size % 2 == 0)
            (list[list.size / 2 - 1] + list[list.size / 2]) / 2.0
        else list[list.size / 2]
    }
    private fun round4(n: Double): Double = round(n * 10000.0) / 10000.0
    private fun latestExpected(now: Long, step: Long): Long =
        ((now - GRACE_MS) / step) * step - 1L

    private fun parseJsonRows(raw: JSONArray, symbol: String, frame: String,
                              now: Long): List<MarketCandle>? {
        val step = periods[frame] ?: return null
        if (raw.length() < 22 || raw.length() > LIMIT) return null
        val data = ArrayList<MarketCandle>(raw.length())
        var lastTime = -1L
        for (i in 0 until raw.length()) {
            val r = raw.optJSONArray(i) ?: return null
            if (r.length() < 7) return null
            val openAt = r.optLong(0, -1L)
            val end = r.optLong(6, -1L)
            val o = r.optString(1).toDoubleOrNull() ?: return null
            val h = r.optString(2).toDoubleOrNull() ?: return null
            val l = r.optString(3).toDoubleOrNull() ?: return null
            val c = r.optString(4).toDoubleOrNull() ?: return null
            val v = r.optString(5).toDoubleOrNull() ?: return null
            if (openAt <= lastTime || openAt <= 0 || openAt % step != 0L ||
                end != openAt + step - 1L ||
                listOf(o,h,l,c,v).any { !it.isFinite() } ||
                min(o,min(l,c)) <= 0 || h < max(o,max(l,c)) || v < 0) return null
            lastTime = openAt
            if (end < now) {
                data.add(MarketCandle(symbol,frame,openAt,end,o,h,l,c,v,now))
            }
        }
        return data
    }

    private fun download(symbol: String, frame: String, now: Long): List<MarketCandle>? {
        val url = URL("https://data-api.binance.vision/api/v3/klines?symbol=$symbol&interval=$frame&limit=$LIMIT")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod="GET"
            connectTimeout=6500
            readTimeout=7500
            useCaches=false
            setRequestProperty("Accept","application/json")
        }
        try {
            if (connection.responseCode != 200) return null
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            if (raw.length > 90_000) return null
            return parseJsonRows(JSONArray(raw),symbol,frame,now)
        } finally { connection.disconnect() }
    }

    /** Keep formulas and thresholds aligned with market-core.mjs. */
    private fun analyze(symbol: String, frame: String, candles: List<MarketCandle>,
                        now: Long): JSONObject? {
        val step = periods[frame] ?: return null
        val recent = candles.sortedBy { it.openTime }.takeLast(30)
        if (recent.size < 22) return null
        for (i in 1 until recent.size) {
            if (recent[i].openTime-recent[i-1].openTime != step) return null
        }
        val last = recent.last()
        if (last.closeTime > now || now - last.closeTime > 2 * step + 60_000L ||
            last.closeTime+1L != last.openTime+step) return null
        val returns = recent.zipWithNext { a,b -> ln(b.close/a.close) }
        if (returns.any { !it.isFinite() } || returns.size < 8) return null
        val current4 = returns.takeLast(4).average()
        val previous4 = returns.takeLast(8).take(4).average()
        val velocity = 100.0*current4
        val acceleration = 100.0*(current4-previous4)
        val volumeMedian = median(recent.takeLast(21).dropLast(1).map { it.volume })
        val volumeRatio = if (volumeMedian > 0) last.volume/volumeMedian else null
        val window = recent.takeLast(20)
        val path = window.zipWithNext { a,b -> abs(ln(b.close/a.close)) }.sum()
        val distance = ln(last.close/window.first().close)
        val efficiency = if (path > 1e-12) min(1.0,abs(distance)/path) else 0.0
        val direction = if (abs(distance) < 1e-10) "FLAT" else if (distance > 0) "UP" else "DOWN"
        val mode = if (efficiency >= .57) "DIRECTIONAL" else if (efficiency <= .28) "RANGE" else "MIXED"
        if (!velocity.isFinite() || !acceleration.isFinite() ||
            abs(velocity) > 1000 || abs(acceleration) > 1000 ||
            (volumeRatio != null && (!volumeRatio.isFinite() ||
                volumeRatio < 0 || volumeRatio >= 1e6))) return null
        return JSONObject()
            .put("version",1)
            .put("symbol",symbol).put("interval",frame)
            .put("candleAt",last.closeTime).put("observedAt",now)
            .put("direction",direction).put("mode",mode)
            .put("movement",round4(velocity))
            .put("acceleration",round4(acceleration))
            .put("volumeRatio",if (volumeRatio == null) JSONObject.NULL
                else round4(volumeRatio))
            .put("source","Binance Spot")
    }

    private fun save(context: Context, observation: JSONObject) {
        val prefs=context.getSharedPreferences(STORE,Context.MODE_PRIVATE)
        val records=try{JSONObject(prefs.getString("records","{}") ?: "{}")}
            catch (_: Exception){JSONObject()}
        val symbol=observation.getString("symbol")
        val frame=observation.getString("interval")
        val key="$symbol|$frame"
        val old=records.optJSONObject(key)
        val latest=old?.optJSONObject("latest")
        val clock=observation.getLong("candleAt")
        if (latest != null && latest.optLong("candleAt",0) >= clock) return
        // A missing intermediate candle cannot be reported as an exact reversal:
        // the JS comparator separately classifies gaps.
        val previous=latest ?: JSONObject.NULL
        records.put(key,JSONObject().put("latest",observation).put("previous",previous))
        // Bounded to <=10 favorites and four timeframes. Forget non-favorites.
        prefs.edit().putString("records",records.toString()).commit()
    }

    fun read(context: Context, favorites: List<String>): JSONArray {
        val allowed=favorites.filter { symbolPattern.matches(it) }.take(10).toSet()
        val prefs=context.getSharedPreferences(STORE,Context.MODE_PRIVATE)
        val saved=try{JSONObject(prefs.getString("records","{}") ?: "{}")}
            catch (_: Exception){JSONObject()}
        val out=JSONArray()
        for (key in saved.keys()) {
            val pair=saved.optJSONObject(key) ?: continue
            val latest=pair.optJSONObject("latest") ?: continue
            if (!allowed.contains(latest.optString("symbol"))) continue
            out.put(pair)
            if (out.length() >= 40) break
        }
        return out
    }

    suspend fun sync(context: Context, favorites: List<String>, dao: ResearchDao) =
        withContext(Dispatchers.IO) {
            val selected=favorites.filter { symbolPattern.matches(it) }.distinct().take(10)
            if (selected.isEmpty()) return@withContext
            val prefs=context.getSharedPreferences(STORE,Context.MODE_PRIVATE)
            var networkCalls=0
            // Start with newest events; longer horizons are only checked at close.
            for (frame in listOf("15m","1h","4h","1d")) {
                val step=periods[frame] ?: continue
                for (asset in selected) {
                    val now=System.currentTimeMillis()
                    val expected=latestExpected(now,step)
                    if (expected <= 0) continue
                    val key="$asset|$frame"
                    val cached=try{JSONObject(prefs.getString("records","{}") ?: "{}")
                        .optJSONObject(key)?.optJSONObject("latest")}
                        catch (_: Exception){null}
                    if (cached != null && cached.optLong("candleAt",0) >= expected)
                        continue
                    val attempts=prefs.getLong("attempt:$key",0L)
                    // One attempt per expected close unless the last call was >15m ago;
                    // after a rate limit or outage no fast retry loop is possible.
                    if (attempts >= expected && now-attempts<15*60_000L) continue
                    val rows=if (frame=="1h") {
                        dao.candles(asset,frame,LIMIT).reversed()
                    } else {
                        if (networkCalls >= MAX_HTTP_PER_WORK) continue
                        networkCalls++
                        prefs.edit().putLong("attempt:$key",now).commit()
                        try{download(asset,frame,now)}catch (_: Exception){null}
                    }
                    if (rows==null) continue
                    val item=analyze(asset,frame,rows,now) ?: continue
                    save(context,item)
                }
            }
        }
}

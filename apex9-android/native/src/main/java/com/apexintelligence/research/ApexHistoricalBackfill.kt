package com.apexintelligence.research

import android.content.Context
import androidx.room.withTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** User-initiated, read-only public-source acquisition, never forecast creation. */
object ApexHistoricalBackfill {
    const val STEP = 3_600_000L
    const val MAX_BARS = 240
    private const val MAX_DAYS = 180L
    private const val MAX_REPLY = 130_000
    private val assetPattern = Regex("^[A-Z0-9]{5,20}$")
    private val mutex = Mutex()

    data class Report(
        val asset: String, val startTime: Long, val endExclusive: Long,
        val bars: Int, val added: Int, val existing: Int,
        val state: String, val source: String
    )

    private fun equivalent(a: MarketCandle, b: MarketCandle): Boolean {
        fun close(x: Double, y: Double): Boolean =
            abs(x - y) <= max(1e-10, max(abs(x), abs(y)) * 1e-9)
        return a.openTime == b.openTime && a.closeTime == b.closeTime &&
            close(a.open, b.open) && close(a.high, b.high) &&
            close(a.low, b.low) && close(a.close, b.close) &&
            close(a.volume, b.volume)
    }

    private fun download(asset: String, start: Long, endExclusive: Long, now: Long): List<MarketCandle> {
        val expected = ((endExclusive - start) / STEP).toInt()
        val endpoint = "https://data-api.binance.vision/api/v3/klines?" +
            "symbol=$asset&interval=1h&startTime=$start&endTime=" +
            (endExclusive - 1L) + "&limit=$MAX_BARS"
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 6500
            readTimeout = 7500
            useCaches = false
            setRequestProperty("Accept", "application/json")
        }
        try {
            val status = connection.responseCode
            if (status == 418 || status == 429)
                throw IllegalStateException("Binance ограничил запросы (HTTP $status); автоповтор отключён")
            if (status != 200) throw IllegalStateException("Binance H1 недоступен: HTTP $status")
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            if (body.length > MAX_REPLY) throw IllegalStateException("Превышен размер ответа H1")
            val raw = JSONArray(body)
            if (raw.length() != expected)
                throw IllegalStateException("Получено " + raw.length() + " свечей вместо $expected: пропуски в источнике")
            val result = ArrayList<MarketCandle>(expected)
            for (i in 0 until expected) {
                val row = raw.optJSONArray(i) ?: throw IllegalStateException("Нет строки H1")
                if (row.length() < 7) throw IllegalStateException("Неполная свеча Binance")
                val t = row.optLong(0, -1L)
                val closeTime = row.optLong(6, -1L)
                val o = row.optString(1).toDoubleOrNull()
                val h = row.optString(2).toDoubleOrNull()
                val l = row.optString(3).toDoubleOrNull()
                val c = row.optString(4).toDoubleOrNull()
                val v = row.optString(5).toDoubleOrNull()
                if (t != start + i * STEP || closeTime != t + STEP - 1L ||
                    closeTime >= now || o == null || h == null || l == null ||
                    c == null || v == null || !o.isFinite() || !h.isFinite() ||
                    !l.isFinite() || !c.isFinite() || !v.isFinite() ||
                    o <= 0.0 || l <= 0.0 || c <= 0.0 || v < 0.0 ||
                    h < max(o, max(c, l)) || l > min(o, c))
                    throw IllegalStateException("Незакрытая, пропущенная или неверная свеча Binance H1")
                result.add(MarketCandle(asset, "1h", t, closeTime, o, h, l, c, v, now))
            }
            return result
        } finally {
            connection.disconnect()
        }
    }

    suspend fun repair(context: Context, asset: String, start: Long, endExclusive: Long):
        Report = mutex.withLock { withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val currentHour = now / STEP * STEP
        val barsLong = (endExclusive - start) / STEP
        require(assetPattern.matches(asset) && start > 0L &&
            start % STEP == 0L && endExclusive % STEP == 0L &&
            endExclusive > start && barsLong in 1L..MAX_BARS.toLong() &&
            endExclusive <= currentHour &&
            start >= currentHour - MAX_DAYS * 24L * STEP &&
            endExclusive - start == barsLong * STEP) {
            "Неверный или незакрытый диапазон восстановления H1"
        }
        val db = ApexDatabase.get(context.applicationContext)
        val dao = db.researchDao()
        val prior = dao.candlesInRange(asset, "1h", start, endExclusive)
        val expected = barsLong.toInt()
        if (prior.size == expected &&
            prior.indices.all { prior[it].openTime == start + it * STEP }) {
            return@withContext Report(asset, start, endExclusive, expected,
                0, expected, "ALREADY_STORED", "LOCAL_ROOM_CACHE")
        }
        // Reject malformed provider data before any write.
        val source = download(asset, start, endExclusive, now)
        db.withTransaction {
            val existing = dao.candlesInRange(asset, "1h", start, endExclusive)
            val savedByTime = existing.associateBy { it.openTime }
            if (savedByTime.size != existing.size ||
                source.any { candle ->
                    val saved = savedByTime[candle.openTime]
                    saved != null && !equivalent(saved, candle)
                }) throw IllegalStateException("Старые и новые H1 расходятся; записи не изменены")
            // IGNORE: existing OHLCV is never overwritten by this repair.
            val added = dao.insertHistoricalCandlesOnce(source).count { it != -1L }
            Report(asset, start, endExclusive, expected,
                added, expected - added, "VERIFIED", "BINANCE_SPOT_H1")
        }
    } }
}

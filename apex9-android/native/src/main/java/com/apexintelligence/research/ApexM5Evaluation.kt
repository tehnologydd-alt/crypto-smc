package com.apexintelligence.research

import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.max
import kotlin.math.min

/**
 * Read-only M5 evaluation of an immutable H1 directional hypothesis.
 * No trade execution. A single M5 bar touching competing levels is ambiguous.
 * Missing or pre-publication history is never interpolated or counted as a win.
 */
object ApexM5Evaluation {
    const val INTERVAL = "5m"
    const val STEP = 300_000L
    const val METHOD = "M5_CLOSED_LEVEL_ORDER_V1"
    private const val LIMIT = 500 // 41h 40m, covering a 24h observation
    private const val HOUR = 3_600_000L
    private const val HORIZON = 24
    private fun price(n: Double) = n.isFinite() && n > 0.0

    class SourceUnavailable(message: String) : Exception(message)

    fun download(asset: String, now: Long): List<MarketCandle> =
        request(asset, now)

    private fun request(
        asset: String, now: Long,
        startOpen: Long? = null, endOpenExclusive: Long? = null
    ): List<MarketCandle> {
        require(Regex("^[A-Z0-9]{5,20}$").matches(asset))
        val range = if (startOpen != null && endOpenExclusive != null) {
            require(startOpen > 0L && startOpen % STEP == 0L &&
                endOpenExclusive > startOpen &&
                (endOpenExclusive - startOpen) % STEP == 0L &&
                endOpenExclusive - startOpen <= LIMIT * STEP)
            "&startTime=$startOpen&endTime=${endOpenExclusive - 1L}"
        } else ""
        val conn = (URL("https://data-api.binance.vision/api/v3/klines?symbol=$asset&interval=5m&limit=$LIMIT$range")
            .openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 6500
            readTimeout = 7500
            useCaches = false
            setRequestProperty("Accept", "application/json")
        }
        return ApexApiLedger.observe("binance","klines-5m") { probe ->
        try {
            val status = conn.responseCode
            probe.httpStatus(status)
            if (status != 200) throw SourceUnavailable("Binance M5 HTTP $status")
            val response = conn.inputStream.bufferedReader().use { reader ->
                val body = reader.readText()
                if (body.length > 500_000)
                    throw SourceUnavailable("Слишком длинная история M5")
                JSONArray(body)
            }
            if (response.length() !in 1..LIMIT)
                throw SourceUnavailable("Пустая или неполная история M5")
            if (startOpen != null && endOpenExclusive != null &&
                response.length().toLong() != (endOpenExclusive - startOpen) / STEP)
                throw SourceUnavailable("В диапазоне M5 не хватает свечей")
            val rows = ArrayList<MarketCandle>(LIMIT)
            var previous = -1L
            for (i in 0 until response.length()) {
                val raw = response.optJSONArray(i)
                    ?: throw SourceUnavailable("Неверная свеча M5")
                if (raw.length() < 7) throw SourceUnavailable("Неполная свеча M5")
                val start = raw.optLong(0, -1L)
                val end = raw.optLong(6, -1L)
                if (start <= previous || start <= 0 || start % STEP != 0L ||
                    end != start + STEP - 1)
                    throw SourceUnavailable("Нарушено время M5")
                if (previous > 0 && start - previous != STEP)
                    throw SourceUnavailable("В M5-ответе пропущены свечи")
                if (startOpen != null && start != startOpen + i * STEP)
                    throw SourceUnavailable("Источник M5 вернул другое временное окно")
                previous = start
                val open = raw.optString(1).toDoubleOrNull()
                val high = raw.optString(2).toDoubleOrNull()
                val low = raw.optString(3).toDoubleOrNull()
                val close = raw.optString(4).toDoubleOrNull()
                val volume = raw.optString(5).toDoubleOrNull()
                if (open == null || high == null || low == null ||
                    close == null || volume == null ||
                    !price(open) || !price(high) || !price(low) || !price(close) ||
                    !volume.isFinite() || volume < 0 ||
                    low > min(open, close) || high < max(open, close) ||
                    low > high)
                    throw SourceUnavailable("Недостоверные M5 OHLCV")
                if (end < now)
                    rows.add(MarketCandle(asset, INTERVAL, start, end,
                        open, high, low, close, volume, now))
            }
            probe.validated()
            rows
        } finally {
            conn.disconnect()
        }
        }
    }

    suspend fun downloadAndSave(asset: String, dao: ResearchDao, now: Long) {
        val bars = download(asset, now)
        if (bars.isEmpty()) throw SourceUnavailable("Нет завершённых свечей M5")
        dao.saveCandles(bars)
        // Keep a bounded local window, but never synthesize missing history.
        dao.pruneCandles(asset, INTERVAL, max(0L, now - 14 * 24 * HOUR))
    }

    /**
     * Repair only GENUINELY missing CLOSED M5 windows. In particular H4
     * needs 1,152 M5 candles, larger than the default Binance 500-bar page.
     * Fixed 500-bar pages, at most four calls, favorite-scoped and no
     * invented history. Previously stored OHLCV is never overwritten.
     */
    suspend fun ensureWindow(
        asset: String, dao: ResearchDao, now: Long,
        anchor: Long, target: Long
    ) {
        if (anchor <= 0L || anchor % STEP != STEP - 1L ||
            target <= anchor || target - anchor > 4L * 24 * HOUR)
            throw SourceUnavailable("Недопустимый диапазон M5")
        val due = ((min(target, now - 1L) - anchor) / STEP).coerceAtLeast(0L)
        if (due == 0L) return
        val count = due.toInt()
        val firstOpen = anchor + 1L
        val known = dao.candlesInRange(
            asset, INTERVAL, firstOpen, firstOpen + due * STEP
        ).map { it.openTime }.toHashSet()
        var pages = 0
        var offset = 0
        while (offset < count) {
            val batch = min(LIMIT, count - offset)
            val start = firstOpen + offset * STEP
            val complete = (0 until batch).all { known.contains(start + it * STEP) }
            if (!complete) {
                pages++
                if (pages > 4) throw SourceUnavailable("Превышен лимит дозагрузки M5")
                val source = request(asset, now, start, start + batch * STEP)
                if (source.size != batch ||
                    source.indices.any { source[it].openTime != start + it * STEP })
                    throw SourceUnavailable("Невозможно подтвердить последовательность M5")
                dao.insertHistoricalCandlesOnce(source)
            }
            offset += batch
        }
        // Room may refuse a duplicate or contain damaged records. The
        // chronological evaluator verifies all OHLCV before any outcome.
    }

    suspend fun progress(
        forecast: ResearchForecast, dao: ResearchDao, now: Long,
        anchor: Long, target: Long, side: String, entry: Double,
        stop: Double, take: List<Double>, limitSemantics: Boolean = false,
        horizonMs: Long = HORIZON * HOUR
    ): String {
        val id = forecast.id
        if (dao.researchResult(id) != null) return "COMPLETED"
        if (horizonMs <= 0L || horizonMs % STEP != 0L ||
            horizonMs > 4L * 24 * HOUR ||
            target != anchor + horizonMs || take.size != 3 ||
            !price(entry) || !price(stop) || take.any { !price(it) } ||
            side != "UP" && side != "DOWN") return "INVALID"
        if (side == "UP" &&
            !(stop < entry && entry < take[0] && take[0] < take[1] && take[1] < take[2]))
            return "INVALID"
        if (side == "DOWN" &&
            !(take[2] < take[1] && take[1] < take[0] && take[0] < entry && entry < stop))
            return "INVALID"

        val earliest = anchor + 1
        val maxExclusive = min(target + 1, now)
        val candles = dao.candlesInRange(forecast.asset, INTERVAL, earliest,
            maxExclusive)
        val byClose = candles.associateBy { it.closeTime }
        if (byClose.size != candles.size) return "DUE_UNVERIFIED"
        val count = (horizonMs / STEP).toInt()
        var entryAt: Long? = null
        var firstTakeAt: Long? = null
        var limitReadyAt: Long? = null
        val targets = ArrayList<Pair<Int, Long>>()
        var highestTarget = 0
        var terminal: String? = null
        var terminalAt: Long? = null
        var observed = 0
        var lastClose = entry
        var ambiguityReason: String? = null

        for (index in 1..count) {
            val end = anchor + index * STEP
            if (end >= now) break
            val candle = byClose[end] ?: return "DUE_UNVERIFIED"
            if (candle.interval != INTERVAL || candle.asset != forecast.asset ||
                candle.openTime != end - STEP + 1L ||
                candle.recordedAt < candle.closeTime ||
                !price(candle.open) || !price(candle.high) ||
                !price(candle.low) || !price(candle.close) ||
                !candle.volume.isFinite() || candle.volume < 0 ||
                candle.low > min(candle.open, candle.close) ||
                candle.high < max(candle.open, candle.close))
                return "DUE_UNVERIFIED"
            observed++
            lastClose = candle.close
            // Confirm the limit-ready state only after a genuinely closed M5
            // whose entire interval follows the immutable publication time.
            if (limitSemantics && limitReadyAt == null &&
                candle.openTime >= forecast.publishedAt)
                limitReadyAt = end
            val entered = candle.low <= entry && candle.high >= entry
            val stopped = if (side == "UP") candle.low <= stop else candle.high >= stop
            fun touched(level: Int): Boolean =
                if (side == "UP") candle.high >= take[level - 1]
                else candle.low <= take[level - 1]

            // This M5 started BEFORE the immutable publication timestamp.
            // A touch could have occurred before publishing the scenario.
            if (candle.openTime < forecast.publishedAt) {
                // A partially elapsed bar contains pre-publication movement.
                // Its OHLC cannot establish a post-publication entry or TP.
                // Skip it entirely; never manufacture an AMBIGUOUS terminal.
                // The first eligible close comes from a fully post-publish M5.
                continue
            }
            if (entryAt == null) {
                if (!entered) continue
                entryAt = end
                if (stopped || touched(1)) {
                    terminal = "AMBIGUOUS"
                    terminalAt = end
                    ambiguityReason = if (stopped && touched(1))
                        "M5: после входа в одной свече достигнуты TP1 и SL"
                    else if (stopped)
                        "M5: касание входа и SL в одной свече"
                    else "M5: касание входа и TP1 в одной свече"
                    break
                }
                continue
            }
            val newlyTouched = ((highestTarget + 1)..3).filter { touched(it) }
            if (stopped && newlyTouched.isNotEmpty()) {
                terminal = "AMBIGUOUS"
                terminalAt = end
                ambiguityReason = "M5: SL и новый TP в одной свече"
                break
            }
            if (stopped) {
                terminal = "STOP"
                terminalAt = end
                break
            }
            if (newlyTouched.isNotEmpty()) {
                for (number in newlyTouched) targets.add(number to end)
                highestTarget = newlyTouched.last()
                if (firstTakeAt == null) firstTakeAt = end
                if (highestTarget == 3) {
                    terminal = "TP3"
                    terminalAt = end
                    break
                }
            }
        }

        if (limitSemantics && limitReadyAt != null)
            dao.appendResearchStage(ResearchForecastStage(id, "LIMIT_READY",
                limitReadyAt, now,
                "Лимитный сценарий: первая полностью закрытая M5 после публикации; не ордер"))
        if (entryAt != null)
            dao.appendResearchStage(ResearchForecastStage(id, "CONFIRMED",
                entryAt, now, "Касание входа по закрытой M5; не исполненная сделка"))
        if (firstTakeAt != null)
            dao.appendResearchStage(ResearchForecastStage(id, "ACTIVE",
                firstTakeAt, now, "TP1 подтверждён M5 после точки входа"))
        for ((number, at) in targets)
            dao.appendResearchStage(ResearchForecastStage(id, "TP$number",
                at, now, "Наблюдалось касание TP$number на завершённой M5"))
        if (terminal == null && now > target && observed == count) {
            terminal = if (entryAt == null) "NOT_ENTERED" else "HORIZON"
            terminalAt = target
        }
        if (terminal != null && terminalAt != null) {
            val stage = when (terminal) {
                "STOP" -> "SL"
                "AMBIGUOUS" -> "ORDER_UNKNOWN"
                "NOT_ENTERED" -> "NO_ENTRY"
                "HORIZON" -> "TIMEOUT"
                else -> null
            }
            if (stage != null)
                dao.appendResearchStage(ResearchForecastStage(id, stage,
                    terminalAt, now, ambiguityReason ?:
                        "M5: $terminal · зафиксированная закрытая свеча"))
            dao.recordResearchResult(ResearchForecastResult(id,
                terminal, now, target, lastClose, (lastClose / entry - 1.0) * 100.0))
            dao.appendResearchStage(ResearchForecastStage(id, "COMPLETED",
                terminalAt, now,
                "Итог по закрытым M5: $terminal, достигнуто TP: $highestTarget" +
                    (ambiguityReason?.let { " · $it" } ?: "")))
            return "COMPLETED"
        }
        return when {
            firstTakeAt != null || (limitSemantics && entryAt != null) -> "ACTIVE"
            entryAt != null || (limitSemantics && limitReadyAt != null) -> "CONFIRMED"
            else -> "PENDING_CONFIRMATION"
        }
    }
}

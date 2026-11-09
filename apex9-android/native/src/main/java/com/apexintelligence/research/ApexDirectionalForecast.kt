package com.apexintelligence.research

import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max

/**
 * Read-only directional research. Single published side; no live order or fill.
 * Strictly abstains when six-bar direction is weak. Later assessments use
 * genuine closed H1 OHLC and never guess intrabar TP/SL ordering.
 */
object ApexDirectionalForecast {
    const val METHOD = "EMPIRICAL_DIRECTION_LEVELS_V2"
    const val VERSION = "H1_SINGLE_LEVELS_V2"
    const val HORIZON = 24
    private const val STEP = 3_600_000L
    private fun price(n: Double) = n.isFinite() && n > 0.0
    private fun near(a: Double, b: Double) =
        price(a) && price(b) && abs(a - b) <= max(1e-9, abs(b) * 2e-11)

    fun direction(recent: List<MarketCandle>, width: Double): String? {
        if (recent.size < 7 || !price(width)) return null
        val window = recent.takeLast(7)
        var total = 0.0
        for (i in 1 until window.size) {
            if (!price(window[i].close) || !price(window[i - 1].close)) return null
            total += abs(ln(window[i].close / window[i - 1].close))
        }
        val net = ln(window.last().close / window.first().close)
        if (!net.isFinite() || !total.isFinite() || total <= 0.0 ||
            abs(net) < max(0.0012, width * .22) ||
            abs(net) / total < .58) return null
        return if (net > 0.0) "UP" else "DOWN"
    }

    fun build(anchor: Double, low: Double, high: Double, side: String): JSONObject {
        require(side == "UP" || side == "DOWN")
        val legacy = ApexResearchLevels.build(anchor, low, high).getJSONObject(side)
        return JSONObject()
            .put("version", VERSION).put("direction", side)
            .put("entry", anchor)
            .put("tp1", legacy.getDouble("tp1"))
            .put("tp2", legacy.getDouble("tp2"))
            .put("tp3", legacy.getDouble("tp3"))
            .put("sl", legacy.getDouble("sl"))
    }

    suspend fun progress(forecast: ResearchForecast, dao: ResearchDao, now: Long): String {
        val id = forecast.id
        if (dao.researchResult(id) != null) return "COMPLETED"
        val h = try { JSONObject(forecast.hypothesisJson) }
                catch (_: Exception) { return "INVALID" }
        if (h.optString("model") != METHOD || forecast.horizon != "1h") return "INVALID"
        val anchor = h.optLong("anchorCloseAt", -1L)
        val target = h.optLong("targetCloseAt", -1L)
        val direction = h.optString("direction")
        val levels = h.optJSONObject("levelStudy") ?: return "INVALID"
        val side = levels.optString("direction")
        val entry = levels.optDouble("entry", Double.NaN)
        val sl = levels.optDouble("sl", Double.NaN)
        val targets = listOf("tp1", "tp2", "tp3").map {
            levels.optDouble(it, Double.NaN)
        }
        if (anchor < 1L || target != anchor + HORIZON * STEP ||
            h.optInt("horizonBars") != HORIZON ||
            h.optString("decisionMethod") != "SIX_BAR_EFFICIENCY_V1" ||
            levels.optString("version") != VERSION ||
            side != direction || (side != "UP" && side != "DOWN") ||
            !price(entry) || !price(sl) || targets.any { !price(it) } ||
            !near(entry, h.optDouble("anchorClose", Double.NaN)) ||
            forecast.publishedAt < anchor || forecast.publishedAt >= anchor + STEP ||
            !id.equals("direction2:${forecast.asset}:1h:$anchor")) return "INVALID"
        val expected = try {
            build(entry,
                h.optDouble("bandLow", Double.NaN),
                h.optDouble("bandHigh", Double.NaN), side)
        } catch (_: Exception) { return "INVALID" }
        if (!near(sl, expected.getDouble("sl")) ||
            targets.indices.any { !near(targets[it], expected.getDouble("tp${it + 1}")) })
            return "INVALID"

        val anchorCandle = dao.candleAtClose(forecast.asset, "1h", anchor)
        if (anchorCandle == null || !near(anchorCandle.close, entry))
            return "DUE_UNVERIFIED"
        var activatedAt: Long? = null
        var firstTargetAt: Long? = null
        val targetTouches = ArrayList<Pair<Int, Long>>()
        var highestTarget = 0
        var terminal: String? = null
        var terminalAt: Long? = null
        var lastClose = entry
        var observed = 0
        for (index in 1..HORIZON) {
            val at = anchor + index * STEP
            if (at >= now) break
            val candle = dao.candleAtClose(forecast.asset, "1h", at)
                ?: return "DUE_UNVERIFIED"
            if (candle.openTime != at - STEP + 1 ||
                !price(candle.open) || !price(candle.high) ||
                !price(candle.low) || !price(candle.close) ||
                candle.low > minOf(candle.open, candle.close) ||
                candle.high < maxOf(candle.open, candle.close) ||
                candle.recordedAt < candle.closeTime)
                return "INVALID"
            observed++
            lastClose = candle.close
            if (candle.openTime < forecast.publishedAt) continue
            val touchedEntry = candle.low <= entry && candle.high >= entry
            val touchedSl = if (side == "UP") candle.low <= sl else candle.high >= sl
            fun touchedTp(indexTp: Int): Boolean =
                if (side == "UP") candle.high >= targets[indexTp - 1]
                else candle.low <= targets[indexTp - 1]
            if (activatedAt == null) {
                if (!touchedEntry) continue
                activatedAt = at
                // The first-touch candle cannot establish what came after entry.
                if (touchedSl || touchedTp(1)) {
                    terminal = "AMBIGUOUS"
                    terminalAt = at
                    break
                }
                continue
            }
            val newTargets = ((highestTarget + 1)..3).filter { touchedTp(it) }
            if (touchedSl && newTargets.isNotEmpty()) {
                terminal = "AMBIGUOUS"
                terminalAt = at
                break
            }
            if (touchedSl) {
                terminal = "STOP"
                terminalAt = at
                break
            }
            if (newTargets.isNotEmpty()) {
                for (targetIndex in newTargets)
                    targetTouches.add(targetIndex to at)
                highestTarget = newTargets.last()
                if (firstTargetAt == null) firstTargetAt = at
                if (highestTarget == 3) {
                    terminal = "TP3"
                    terminalAt = at
                    break
                }
            }
        }
        if (activatedAt != null) dao.appendResearchStage(ResearchForecastStage(
            id, "CONFIRMED", activatedAt, now,
            "Опорная цена наблюдалась в завершённой H1 после публикации, не исполнение ордера"
        ))
        if (firstTargetAt != null) dao.appendResearchStage(ResearchForecastStage(
            id, "ACTIVE", firstTargetAt, now,
            "TP1 наблюдался на H1 после подтверждённой опорной цены"
        ))
        // Each accepted point is persisted independently and exactly once.
        // If SL and a new TP occur in the same H1, neither point is credited.
        for ((indexTp, at) in targetTouches)
            dao.appendResearchStage(ResearchForecastStage(
                id, "TP$indexTp", at, now,
                "Касание TP$indexTp в закрытой H1 после опорной цены; не исполнение сделки"
            ))
        if (terminal == null && now > target && observed == HORIZON) {
            terminal = if (activatedAt == null) "NOT_ENTERED" else "HORIZON"
            terminalAt = target
        }
        if (terminal != null && terminalAt != null) {
            val terminalStage = when (terminal) {
                "STOP" -> "SL"
                "AMBIGUOUS" -> "ORDER_UNKNOWN"
                "NOT_ENTERED" -> "NO_ENTRY"
                "HORIZON" -> "TIMEOUT"
                else -> null
            }
            if (terminalStage != null)
                dao.appendResearchStage(ResearchForecastStage(
                    id, terminalStage, terminalAt, now,
                    "Контрольное событие $terminal: только фактическая закрытая H1"
                ))
            dao.recordResearchResult(ResearchForecastResult(
                id, terminal, now, target, lastClose, (lastClose / entry - 1.0) * 100
            ))
            dao.appendResearchStage(ResearchForecastStage(
                id, "COMPLETED", terminalAt, now,
                "Итог сценария: $terminal, TP наблюдений: $highestTarget. Только закрытые H1"
            ))
            return "COMPLETED"
        }
        return when {
            firstTargetAt != null -> "ACTIVE"
            activatedAt != null -> "CONFIRMED"
            else -> "PENDING_CONFIRMATION"
        }
    }
}

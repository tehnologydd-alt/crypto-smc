package com.cryptosmc.app.smc

import com.cryptosmc.app.market.Candle
import kotlin.math.abs

enum class MarketRegime { TREND_UP, TREND_DOWN, RANGE, UNDEFINED }

data class SmcEventOutcome(
    val event: StructureEvent,
    val knownAtIndex: Int,
    val horizonHours: Int,
    val regime: MarketRegime,
    val directionalMovePercent: Double,
    val correct: Boolean
)

data class SmcValidationStats(
    val horizonHours: Int,
    val regime: MarketRegime?,
    val kind: StructureKind?,
    val correct: Int,
    val total: Int,
    val averageDirectionalMovePercent: Double
)

/**
 * Research-only event study for chronological 1H candles.
 * Signals are included only at the first prefix where the event becomes observable.
 * Future candles are used exclusively for outcome measurement.
 */
object HistoricalSmcValidator {
    private const val ONE_HOUR_MS = 60L * 60L * 1000L
    private const val REGIME_WINDOW = 48
    private val defaultHorizons = listOf(1, 4, 24)

    fun validateHourly(
        candles: List<Candle>,
        horizons: List<Int> = defaultHorizons,
        swingLookback: Int = 2
    ): List<SmcEventOutcome> {
        if (swingLookback < 1 || candles.size < swingLookback * 2 + 4 || horizons.isEmpty()) return emptyList()
        if (horizons.any { it <= 0 }) return emptyList()
        if (candles.zipWithNext().any { (a, b) -> b.openTime <= a.openTime }) return emptyList()

        val seen = mutableSetOf<StructureEvent>()
        val outcomes = mutableListOf<SmcEventOutcome>()

        for (knownAt in (swingLookback * 2 + 2) until candles.lastIndex) {
            val prefix = candles.subList(0, knownAt + 1)
            val events = SmcEngine.analyze(prefix, swingLookback).structure
            val newlyKnown = events.filter { seen.add(it) }
            if (newlyKnown.isEmpty()) continue

            val entry = candles[knownAt].close
            if (!entry.isFinite() || entry <= 0.0) continue
            val regime = classifyRegime(candles, knownAt)

            for (event in newlyKnown) {
                for (horizon in horizons) {
                    val targetTime = candles[knownAt].openTime + horizon * ONE_HOUR_MS
                    val targetIndex = (knownAt + 1 until candles.size)
                        .firstOrNull { candles[it].openTime >= targetTime }
                        ?: continue
                    val targetClose = candles[targetIndex].close
                    if (!targetClose.isFinite() || targetClose <= 0.0) continue

                    val rawMove = (targetClose - entry) / entry * 100.0
                    val directionalMove = if (event.direction == Direction.BULLISH) rawMove else -rawMove
                    outcomes += SmcEventOutcome(
                        event = event,
                        knownAtIndex = knownAt,
                        horizonHours = horizon,
                        regime = regime,
                        directionalMovePercent = directionalMove,
                        correct = directionalMove > 0.0
                    )
                }
            }
        }
        return outcomes
    }

    /**
     * Uses only the 48 candles ending at knownAt.
     * Efficiency = net displacement / total close-to-close path.
     * A strong normalized slope with efficient movement is a provisional trend;
     * otherwise the market is classified as range.
     */
    fun classifyRegime(candles: List<Candle>, knownAt: Int): MarketRegime {
        if (knownAt !in candles.indices || knownAt + 1 < REGIME_WINDOW) return MarketRegime.UNDEFINED
        val window = candles.subList(knownAt + 1 - REGIME_WINDOW, knownAt + 1)
        val closes = window.map { it.close }
        if (closes.any { !it.isFinite() || it <= 0.0 }) return MarketRegime.UNDEFINED

        val first = closes.first()
        val last = closes.last()
        val path = closes.zipWithNext().sumOf { (a, b) -> abs(b - a) }
        if (path <= 0.0) return MarketRegime.RANGE

        val efficiency = abs(last - first) / path
        val mean = closes.average()
        val slope = linearSlope(closes) / mean
        return when {
            efficiency >= 0.35 && slope >= 0.0008 -> MarketRegime.TREND_UP
            efficiency >= 0.35 && slope <= -0.0008 -> MarketRegime.TREND_DOWN
            else -> MarketRegime.RANGE
        }
    }

    fun statistics(
        outcomes: List<SmcEventOutcome>,
        horizonHours: Int,
        regime: MarketRegime? = null,
        kind: StructureKind? = null
    ): SmcValidationStats {
        val selected = outcomes.filter {
            it.horizonHours == horizonHours &&
                (regime == null || it.regime == regime) &&
                (kind == null || it.event.kind == kind)
        }
        return SmcValidationStats(
            horizonHours = horizonHours,
            regime = regime,
            kind = kind,
            correct = selected.count { it.correct },
            total = selected.size,
            averageDirectionalMovePercent = selected
                .map { it.directionalMovePercent }
                .average()
                .takeIf { it.isFinite() } ?: 0.0
        )
    }

    private fun linearSlope(values: List<Double>): Double {
        val n = values.size.toDouble()
        val meanX = (n - 1.0) / 2.0
        val meanY = values.average()
        var numerator = 0.0
        var denominator = 0.0
        values.forEachIndexed { index, value ->
            val dx = index - meanX
            numerator += dx * (value - meanY)
            denominator += dx * dx
        }
        return if (denominator == 0.0) 0.0 else numerator / denominator
    }
}

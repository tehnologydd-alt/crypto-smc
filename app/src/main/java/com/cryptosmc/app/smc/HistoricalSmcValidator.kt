package com.cryptosmc.app.smc

import com.cryptosmc.app.market.Candle

/**
 * Historical check for 1H candles.
 *
 * Each prefix is analyzed independently. A structure event is counted only when it
 * first appears in that prefix, and its result is measured from that point forward.
 * This avoids evaluating a signal from candles that were not yet available to it.
 */
data class SmcEventOutcome(
    val event: StructureEvent,
    val knownAtIndex: Int,
    val horizonHours: Int,
    val directionalMovePercent: Double,
    val correct: Boolean
)

data class SmcValidationStats(
    val horizonHours: Int,
    val correct: Int,
    val total: Int,
    val averageDirectionalMovePercent: Double
)

object HistoricalSmcValidator {
    private const val ONE_HOUR_MS = 60L * 60L * 1000L
    private val defaultHorizons = listOf(1, 4, 24)

    fun validateHourly(
        candles: List<Candle>,
        horizons: List<Int> = defaultHorizons,
        swingLookback: Int = 2
    ): List<SmcEventOutcome> {
        if (candles.size < swingLookback * 2 + 4 || horizons.isEmpty()) return emptyList()
        if (horizons.any { it <= 0 }) return emptyList()

        val seen = mutableSetOf<StructureEvent>()
        val outcomes = mutableListOf<SmcEventOutcome>()

        for (knownAt in (swingLookback * 2 + 2) until candles.lastIndex) {
            val prefix = candles.subList(0, knownAt + 1)
            val events = SmcEngine.analyze(prefix, swingLookback).structure
            for (event in events) {
                if (!seen.add(event)) continue

                val entry = candles[knownAt].close
                if (!entry.isFinite() || entry <= 0.0) continue

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
                        directionalMovePercent = directionalMove,
                        correct = directionalMove > 0.0
                    )
                }
            }
        }
        return outcomes
    }

    fun statistics(
        outcomes: List<SmcEventOutcome>,
        horizonHours: Int
    ): SmcValidationStats {
        val selected = outcomes.filter { it.horizonHours == horizonHours }
        return SmcValidationStats(
            horizonHours = horizonHours,
            correct = selected.count { it.correct },
            total = selected.size,
            averageDirectionalMovePercent = selected
                .map { it.directionalMovePercent }
                .average()
                .takeIf { it.isFinite() } ?: 0.0
        )
    }
}

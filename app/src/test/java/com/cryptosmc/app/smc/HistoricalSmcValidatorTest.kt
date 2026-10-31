package com.cryptosmc.app.smc

import com.cryptosmc.app.market.Candle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HistoricalSmcValidatorTest {

    @Test
    fun shortHistoryProducesNoOutcomes() {
        val candles = (0..4).map { index ->
            Candle(index * 3_600_000L, 10.0, 11.0, 9.0, 10.0, 100.0)
        }
        assertTrue(HistoricalSmcValidator.validateHourly(candles).isEmpty())
    }

    @Test
    fun statisticsUseDirectionalMoveAndRequestedHorizon() {
        val bullish = StructureEvent(5, 100.0, StructureKind.BOS, Direction.BULLISH)
        val bearish = StructureEvent(9, 101.0, StructureKind.CHOCH, Direction.BEARISH)
        val outcomes = listOf(
            SmcEventOutcome(bullish, 7, 1, 0.50, true),
            SmcEventOutcome(bearish, 11, 1, -0.25, false),
            SmcEventOutcome(bullish, 13, 4, 0.80, true)
        )

        val oneHour = HistoricalSmcValidator.statistics(outcomes, 1)
        assertEquals(1, oneHour.correct)
        assertEquals(2, oneHour.total)
        assertEquals(0.125, oneHour.averageDirectionalMovePercent, 0.000001)

        val fourHour = HistoricalSmcValidator.statistics(outcomes, 4)
        assertEquals(1, fourHour.correct)
        assertEquals(1, fourHour.total)
    }
}

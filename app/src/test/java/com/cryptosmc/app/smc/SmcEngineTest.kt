package com.cryptosmc.app.smc

import com.cryptosmc.app.market.Candle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmcEngineTest {
    private fun candle(index: Int, open: Double, high: Double, low: Double, close: Double) =
        Candle(index * 60_000L, open, high, low, close, 100.0)

    @Test
    fun insufficientHistoryReturnsEmptyAnalysis() {
        val result = SmcEngine.analyze(listOf(candle(0, 10.0, 11.0, 9.0, 10.0)))
        assertTrue(result.swings.isEmpty())
        assertTrue(result.structure.isEmpty())
        assertTrue(result.zones.isEmpty())
        assertEquals(null, result.premiumDiscount)
    }

    @Test
    fun detectsBullishFairValueGapFromThreeCandles() {
        val candles = listOf(
            candle(0, 10.0, 11.0, 9.0, 10.5),
            candle(1, 10.5, 13.0, 10.0, 12.5),
            candle(2, 12.5, 14.0, 12.0, 13.5),
            candle(3, 13.5, 14.0, 12.5, 13.0),
            candle(4, 13.0, 13.5, 12.0, 12.8),
            candle(5, 12.8, 13.2, 11.8, 12.4),
            candle(6, 12.4, 13.0, 12.0, 12.7)
        )
        val gaps = SmcEngine.analyze(candles).zones.filter { it.kind == ZoneKind.FAIR_VALUE_GAP }
        assertTrue(gaps.any { it.direction == Direction.BULLISH && it.low == 11.0 && it.high == 12.0 })
    }

    @Test
    fun allZonesHaveOrderedPriceBounds() {
        val candles = (0..20).map { i ->
            val base = 100.0 + (i % 5) * 2.0
            candle(i, base, base + 1.5, base - 1.5, base + if (i % 2 == 0) 0.8 else -0.8)
        }
        val result = SmcEngine.analyze(candles)
        assertFalse(result.zones.any { it.low > it.high })
    }
}

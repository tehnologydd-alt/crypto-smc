package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class ResearchRulesTest {
    private fun candles(lastVolume: Double = 2.0): List<Candle> =
        (0 until 40).map { i ->
            val start = i * 60_000L
            Candle(start,start+59_999L,100.0,101.0,99.0,100.0,
                if (i == 39) lastVolume else 1.0)
        }
    @Test fun frozenRulesAreNestedAndDistinct() {
        assertEquals(listOf("v0.1","v0.2","v0.3"),ResearchRules.keys)
        assertEquals(3,ResearchRules.all.map { ResearchRules.signature(it) }.toSet().size)
        assertFalse(ResearchRules.all[0].useVolume)
        assertTrue(ResearchRules.all[1].useVolume)
        assertFalse(ResearchRules.all[1].useHtf)
        assertTrue(ResearchRules.all[2].useHtf)
    }
    @Test fun relativeVolumeReadsOnlyClosedPriorTwentyCandles() {
        val history = candles()
        assertEquals(2.0,ResearchRules.volumeRatio(history,39)!!,1e-9)
        assertTrue(ResearchRules.passesVolume(history,39))
        assertFalse(ResearchRules.passesVolume(candles(1.0),39))
        assertNull(ResearchRules.volumeRatio(history,10))
        val future = history + Candle(40*60_000L,41*60_000L-1,100.0,101.0,99.0,100.0,9999.0)
        assertEquals(2.0,ResearchRules.volumeRatio(future,39)!!,1e-9)
    }
}

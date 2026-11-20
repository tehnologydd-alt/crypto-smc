package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class EngineTest {
    private fun bullish(): List<Candle> = (0 until 40).map { i ->
        val base = Candle(i * 3_600_000L, (i + 1) * 3_600_000L - 1, 100.0, 101.0, 99.0, 100.0, 1.0)
        when (i) {
            30 -> base.copy(high = 103.0)
            38 -> base.copy(open = 101.0, close = 100.0, high = 102.0)
            39 -> base.copy(open = 102.5, low = 102.5, high = 107.0, close = 106.0)
            else -> base
        }
    }
    @Test fun detectsFvgSignalAndKeepsTimeframesDistinct() {
        val m5 = Strategy.detect(bullish(), "spot", "BTCUSDT", "5m")
        val h4 = Strategy.detect(bullish(), "spot", "BTCUSDT", "4h")
        assertNotNull(m5); assertNotNull(h4)
        assertEquals("LONG", m5!!.side)
        assertEquals(101.0, m5.imbalance.low, 0.001)
        assertEquals(102.5, m5.imbalance.high, 0.001)
        assertNotEquals(m5.id, h4!!.id)
    }
    @Test fun stopWinsWhenMinuteAlsoTouchesTargets() {
        val signal = Strategy.detect(bullish(), "spot", "BTCUSDT", "5m")!!
        val entry = Candle(0, signal.detectedAt + 60_000, 100.0, signal.entry + 1, signal.entry - 1, signal.entry, 1.0)
        assertEquals(listOf("ENTRY"), Strategy.advance(signal, entry).map { it.type })
        val ambiguous = entry.copy(end = entry.end + 60_000, high = signal.targets.last() + 1, low = signal.stop - 1)
        assertEquals(listOf("STOP"), Strategy.advance(signal, ambiguous).map { it.type })
        assertEquals(0, signal.hitTargets)
    }
    @Test fun modelLearnsEachResolvedSignalOnce() {
        val model = Model(); val signal = Strategy.detect(bullish(), "spot", "BTCUSDT", "5m")!!
        signal.quality = model.score(signal.features); signal.state = "STOPPED"
        assertTrue(model.learn(signal)); assertFalse(model.learn(signal))
        assertEquals(1, model.samples); assertEquals(0, model.successes)
    }
}

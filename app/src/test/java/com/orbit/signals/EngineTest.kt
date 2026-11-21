package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class EngineTest {
    private val hour=3_600_000L
    private fun bullish(step:Long=hour,start:Long=0L,size:Int=40):List<Candle> =
        (0 until size).map { i ->
            val t=start+i*step
            val b=Candle(t,t+step-1,100.0,101.0,99.0,100.0,1.0)
            when(i) {
                size-10->b.copy(high=103.0)
                size-2->b.copy(open=101.0,high=102.0)
                size-1->b.copy(open=102.5,high=107.0,low=102.5,close=106.0)
                else->b
            }
        }
    private fun parentFor(b:List<Candle>):List<Candle> =
        bullish(4*hour,b.last().end-20*4*hour+1,20)

    @Test fun confirmsSwingsAfterTwoClosedRightBars() {
        val b=bullish()
        assertFalse(MarketStructureEngine.analyze(b.take(32)).swings.any{it.time==b[30].time})
        assertTrue(MarketStructureEngine.analyze(b.take(33)).swings.any{it.time==b[30].time})
    }
    @Test fun breakRequiresClosingBeyondSwing() {
        val b=bullish()
        val wick=b.toMutableList()
        wick[39]=wick[39].copy(open=100.0,low=99.0,close=102.0)
        assertTrue(MarketStructureEngine.analyze(wick).breaks.isEmpty())
        val structure=MarketStructureEngine.analyze(b)
        assertEquals("BOS",structure.breaks.last().type)
        assertEquals("up",structure.regime)
    }
    @Test fun detectsAndUpdatesFvgStates() {
        val b=bullish()
        val g=ZonesDetector.fvg(b).first{it.time==b.last().time&&it.direction=="up"}
        assertEquals("active",g.status)
        assertEquals(101.0,g.low,0.00001)
        val touch=b.last().copy(time=b.last().end+1,end=b.last().end+hour,open=105.0,high=106.0,low=102.0,close=105.0)
        val partially=ZonesDetector.fvg(b+touch).first{it.id==g.id}
        assertEquals("mitigated",partially.status)
        val filled=touch.copy(time=touch.end+1,end=touch.end+hour,low=100.0,close=104.0)
        assertEquals("filled",ZonesDetector.fvg(b+touch+filled).first{it.id==g.id}.status)
    }
    @Test fun requiresMatchingClosedHigherTimeframe() {
        val b=bullish()
        assertNull(Strategy.detect(b,"spot","BTCUSDT","1h"))
        val signal=Strategy.detect(b,"spot","BTCUSDT","1h",parentFor(b))
        assertNotNull(signal)
        assertEquals(3,signal!!.strategyVersion)
        assertEquals("BOS",signal.breakType)
        assertEquals(100.5,signal.entry,0.00001)
        assertEquals(3,signal.targets.size)
    }
    @Test fun stopBeforeTargetOnAmbiguousMinute() {
        val signal=Strategy.detect(bullish(),"spot","BTCUSDT","1h",parentFor(bullish()))!!
        val entry=signal.entry
        val touch=Candle(0,signal.detectedAt+60_000,entry,entry+0.5,entry-0.5,entry,1.0)
        assertEquals(listOf("ENTRY"),Strategy.advance(signal,touch).map{it.type})
        val conflict=touch.copy(end=touch.end+60_000,high=signal.targets.last()+1,low=signal.stop-1)
        assertEquals(listOf("STOP"),Strategy.advance(signal,conflict).map{it.type})
        assertEquals(0,signal.hitTargets)
    }
    @Test fun modelIgnoresOldStrategyOutcomes() {
        val model=Model()
        val signal=Strategy.detect(bullish(),"spot","BTCUSDT","1h",parentFor(bullish()))!!
        signal.quality=model.score(signal.features);signal.state="STOPPED"
        assertTrue(model.learn(signal));assertFalse(model.learn(signal))
        assertEquals(1,model.samples)
        assertFalse(model.learn(signal.copyWithOldVersion()))
    }
    private fun Signal.copyWithOldVersion()=Signal(id,market,symbol,timeframe,side,detectedAt,blockTime,
        entryLow,entryHigh,entry,stop,targets,swing,imbalance,features,expiresAt,
        state="STOPPED",quality=quality,strategyVersion=2)
}

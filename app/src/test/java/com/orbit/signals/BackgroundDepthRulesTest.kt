package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class BackgroundDepthRulesTest {
    private val started=1_800_000_000_000L
    private fun sample(index:Int,imbalance:Double=.66,source:String="binance_ws_depth",
        observedSince:Long=started+10_000)=OrderBookSnapshot(
        source,"spot","BTCUSDT",started+(index+1)*10_000L,
        1_000L+index,100,100.0,100.01,.01,
        100_000.0*imbalance,100_000.0*(1-imbalance),imbalance,
        .1,.1,observedSince=observedSince,observationMs=(index+1)*10_000L,
        observations=index+1,updates=20+index,averageImbalance=imbalance
    )
    private fun window()=(0 until 29).map{sample(it)}
    @Test fun continuousFiveMinuteObservationCanConfirmLong() {
        val result=BackgroundDepthRules.evaluate(window(),"spot","BTCUSDT",
            "LONG",started,started+300_000L)
        assertTrue(result.reason,result.accepted)
        assertEquals("FIVE_MINUTE_WS_CONFIRMED",result.reason)
        assertTrue(result.evidence!!.observationMs>=240_000L)
        assertEquals(29,result.evidence!!.observations)
        assertEquals(started+10_000L,result.evidence!!.observedSince)
    }
    @Test fun shortAndTransientImbalanceCannotConfirm() {
        assertFalse(BackgroundDepthRules.evaluate(window(),"spot","BTCUSDT",
            "SHORT",started,started+300_000L).accepted)
        val weak=window().mapIndexed{i,s->if(i==28)s.copy(imbalance=.51) else s}
        assertEquals("BOOK_IMBALANCE_UNSTABLE",BackgroundDepthRules.evaluate(
            weak,"spot","BTCUSDT","LONG",started,started+300_000L).reason)
    }
    @Test fun gapAndReconnectedWsCannotBecomeEvidence() {
        val rows=window()
        val gap=rows.filterIndexed{i,_->i !in 4..9}
        assertEquals("INTERRUPTED_WS_CONTINUITY",BackgroundDepthRules.evaluate(
            gap,"spot","BTCUSDT","LONG",started,started+300_000L).reason)
        val restarted=rows.mapIndexed{i,s->if(i>16)s.copy(observedSince=started+200_000) else s}
        assertEquals("INTERRUPTED_WS_CONTINUITY",BackgroundDepthRules.evaluate(
            restarted,"spot","BTCUSDT","LONG",started,started+300_000L).reason)
    }
    @Test fun lateStaleRestAndShortSessionsAreRejected() {
        val rows=window()
        assertFalse(BackgroundDepthRules.evaluate(rows.take(5),"spot","BTCUSDT",
            "LONG",started,started+300_000L).accepted)
        assertFalse(BackgroundDepthRules.evaluate(rows.map{it.copy(source="binance_rest_depth")},
            "spot","BTCUSDT","LONG",started,started+300_000L).accepted)
        assertEquals("INCOMPLETE_FIVE_MINUTE_OBSERVATION",BackgroundDepthRules.evaluate(
            rows.take(17),"spot","BTCUSDT","LONG",started,started+300_000L).reason)
    }
    @Test fun oldCandlesOrTouchedEntryCannotBeRetroactive() {
        val zone=Zone(started-3_600_000L,99.0,101.0,"up")
        val base=Signal("spot:BTCUSDT:15m:100:LONG:v0.1","spot","BTCUSDT","15m","LONG",
            started-3_000_000L,started-4_000_000L,99.0,101.0,100.0,98.0,
            listOf(102.0,104.0,106.0),101.0,zone,List(8){.1},
            started+10_000_000L)
        val m1=listOf(Candle(started-30_000L,started+29_999L,
            101.0,101.5,99.5,100.5,100.0))
        assertEquals("ENTRY_OR_STOP_ALREADY_TOUCHED",BackgroundDepthRules.checkUntouched(
            base,m1,started+300_000L))
    }
}

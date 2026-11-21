package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class ResearchRulesTest {
    private fun book(capturedAt:Long=5002000L)=OrderBookSnapshot(
        "binance_ws_depth","spot","BTCUSDT",capturedAt,1122334L,100,
        106.0,106.01,0.00943,21190.0,10605.0,21190.0/(21190.0+10605.0),
        0.09,0.09,observedSince=4980000L,observationMs=22000L,
        observations=9,updates=22,averageImbalance=0.664
    )
    @Test fun frozenRulesKeepOldVersionsAsArchive() {
        assertEquals(listOf("v0.1","v0.2-D2","v0.3-D2","v0.2-B5","v0.3-B5"),ResearchRules.all.map{it.key})
        assertTrue("v0.2" in ResearchRules.keys)
        assertTrue("v0.3-L1" in ResearchRules.keys)
        assertTrue("v0.2-D1" in ResearchRules.keys)
        assertEquals(5,ResearchRules.all.map { ResearchRules.signature(it) }.toSet().size)
        assertFalse(ResearchRules.all[0].useLiquidity)
        assertTrue(ResearchRules.all[1].useLiquidity)
        assertFalse(ResearchRules.all[1].useHtf)
        assertTrue(ResearchRules.all[2].useHtf)
    }
    @Test fun recordedDepthUsesUsdtNotionalAndKeepsOriginalMetadata() {
        val result=book()
        assertEquals(100,result.levels)
        assertEquals(1122334L,result.lastUpdateId)
        assertTrue(result.bidUsdt>result.askUsdt)
        assertEquals(result.bidUsdt/(result.bidUsdt+result.askUsdt),result.imbalance,1e-10)
        assertEquals("binance_ws_depth",result.source)
    }
    @Test fun snapshotMustBeCapturedAfterCloseAndBeforeSignal() {
        val result=book()
        assertTrue(BookDepth.gate(result,"spot","BTCUSDT","LONG",5000000L,5003000L).allowed)
        assertFalse(BookDepth.gate(result,"spot","BTCUSDT","SHORT",5000000L,5003000L).allowed)
        assertFalse(BookDepth.gate(result,"futures","BTCUSDT","LONG",5000000L,5003000L).allowed)
        assertFalse(BookDepth.gate(result,"spot","BTCUSDT","LONG",5005000L,5007000L).allowed)
        assertFalse(BookDepth.gate(result,"spot","BTCUSDT","LONG",5000000L,5030000L).allowed)
    }
}

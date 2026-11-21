package com.orbit.signals

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ResearchRulesTest {
    private fun rawDepth(bidsQty:Double=2.0,asksQty:Double=1.0)=JSONObject().apply {
        put("lastUpdateId",1122334L)
        put("bids",JSONArray().apply {
            for(i in 0 until 100)put(JSONArray(listOf(106.0-i*0.001,bidsQty)))
        })
        put("asks",JSONArray().apply {
            for(i in 0 until 100)put(JSONArray(listOf(106.01+i*0.001,asksQty)))
        })
    }
    @Test fun frozenRulesKeepOldVersionsAsArchive() {
        assertEquals(listOf("v0.1","v0.2-D1","v0.3-D1"),ResearchRules.all.map{it.key})
        assertTrue("v0.2" in ResearchRules.keys)
        assertTrue("v0.3-L1" in ResearchRules.keys)
        assertEquals(3,ResearchRules.all.map { ResearchRules.signature(it) }.toSet().size)
        assertFalse(ResearchRules.all[0].useLiquidity)
        assertTrue(ResearchRules.all[1].useLiquidity)
        assertFalse(ResearchRules.all[1].useHtf)
        assertTrue(ResearchRules.all[2].useHtf)
    }
    @Test fun realDepthUsesNotionalFromOneHundredLevelsEachSide() {
        val book=BookDepth.parse(rawDepth(),"spot","BTCUSDT",5002000L)
        assertNotNull(book)
        assertEquals(100,book!!.levels)
        assertEquals(1122334L,book.lastUpdateId)
        assertTrue(book.bidUsdt>20000)
        assertTrue(book.askUsdt>10000)
        assertTrue(book.imbalance>0.6)
        assertEquals(book.bidUsdt,OrderBookSnapshot.fromJson(book.json())!!.bidUsdt,0.00001)
    }
    @Test fun snapshotMustBeCapturedAfterCloseAndBeforeSignal() {
        val book=BookDepth.parse(rawDepth(),"spot","BTCUSDT",5002000L)!!
        assertTrue(BookDepth.gate(book,"spot","BTCUSDT","LONG",5000000L,5003000L).allowed)
        assertFalse(BookDepth.gate(book,"spot","BTCUSDT","SHORT",5000000L,5003000L).allowed)
        assertFalse(BookDepth.gate(book,"futures","BTCUSDT","LONG",5000000L,5003000L).allowed)
        assertFalse(BookDepth.gate(book,"spot","BTCUSDT","LONG",5005000L,5007000L).allowed)
        assertFalse(BookDepth.gate(book,"spot","BTCUSDT","LONG",5000000L,5030000L).allowed)
    }
}

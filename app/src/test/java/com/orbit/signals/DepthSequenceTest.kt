package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class DepthSequenceTest {
    @Test fun futuresDepthGoesToPublicNotMarketRoute() {
        assertEquals(
            "wss://fstream.binance.com/public/stream?streams=xrpusdt@depth",
            DepthSequence.depthStreamUrl("futures","xrpusdt@depth"))
        assertEquals(
            "wss://stream.binance.com:9443/stream?streams=xrpusdt@depth",
            DepthSequence.depthStreamUrl("spot","xrpusdt@depth"))
    }
    @Test fun spotBootstrapBridgesNextUpdate() {
        assertTrue(DepthSequence.bridge("spot",100,99,101))
        assertTrue(DepthSequence.bridge("spot",100,101,102))
        assertFalse(DepthSequence.bridge("spot",100,102,103))
        assertFalse(DepthSequence.bridge("spot",100,98,100))
    }
    @Test fun futuresBootstrapCanIncludeSnapshotBoundary() {
        assertTrue(DepthSequence.bridge("futures",100,99,100))
        assertTrue(DepthSequence.bridge("futures",100,99,101))
        assertFalse(DepthSequence.bridge("futures",100,101,103))
        assertFalse(DepthSequence.bridge("futures",100,97,99))
    }
    @Test fun futuresContinuityUsesPreviousFinalPu() {
        assertTrue(DepthSequence.continuous("futures",103,110,120,103))
        assertFalse(DepthSequence.continuous("futures",103,104,120,102))
        assertFalse(DepthSequence.continuous("futures",103,104,120,null))
        assertFalse(DepthSequence.continuous("futures",103,102,103,103))
    }
    @Test fun spotContinuityUsesUpdateRange() {
        assertTrue(DepthSequence.continuous("spot",103,103,105,null))
        assertFalse(DepthSequence.continuous("spot",103,105,107,null))
        assertFalse(DepthSequence.continuous("spot",103,103,102,null))
    }
    @Test fun retriesRemainBounded() {
        assertEquals(2000L,DepthSequence.retryDelayMs(1))
        assertEquals(4000L,DepthSequence.retryDelayMs(2))
        assertEquals(20000L,DepthSequence.retryDelayMs(30))
    }
}

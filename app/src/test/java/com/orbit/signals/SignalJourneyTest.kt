package com.orbit.signals

import org.junit.Assert.*
import org.junit.Test

class SignalJourneyTest {
    private fun signal(side:String="LONG",state:String="OPEN") = Signal(
        id="futures:BTCUSDT:1h:1000:LONG",market="futures",symbol="BTCUSDT",
        timeframe="1h",side=side,detectedAt=1000L,blockTime=800L,
        entryLow=99.0,entryHigh=101.0,entry=100.0,stop=98.0,
        targets=listOf(102.0,104.0,106.0),swing=101.0,
        imbalance=Zone(900L,101.0,102.0,"up"),features=List(8){1.0},
        expiresAt=100000L,state=state,events=mutableListOf(
            SignalEvent("CREATED",1000L,103.0),SignalEvent("ENTRY",2000L,100.0)
        ),strategyVersion=3
    )
    @Test fun terminalStatusesOnlyGoToCompleted() {
        listOf("WAITING","OPEN","UNCERTAIN").forEach { assertFalse(SignalJourney.isFinished(it)) }
        listOf("STOPPED","COMPLETED","CANCELLED","EXPIRED").forEach { assertTrue(SignalJourney.isFinished(it)) }
        assertEquals("active",SignalJourney.bucket("UNCERTAIN"))
        assertEquals("finished",SignalJourney.bucket("STOPPED"))
    }
    @Test fun longStopAfterFirstTargetHasAnExactExitAndNegativeMovement() {
        val s=signal(state="STOPPED")
        s.hitTargets=1
        s.events.add(SignalEvent("TP1",3000L,102.0))
        s.events.add(SignalEvent("STOP",4000L,98.0))
        val path=SignalJourney.trace(s)
        assertTrue(path.finished);assertEquals(2000L,path.entry!!.at)
        assertEquals(4000L,path.exit!!.at);assertEquals(1,path.lastTarget)
        assertEquals(-2.0,path.priceMovePercent!!,0.00001)
    }
    @Test fun shortCompletesAtThirdTargetAndPriceMoveIsPositive() {
        val s=signal(side="SHORT",state="COMPLETED")
        s.events.add(SignalEvent("TP3",5000L,94.0))
        val path=SignalJourney.trace(s)
        assertEquals(6.0,path.priceMovePercent!!,0.00001)
        assertEquals("TP3",path.exit!!.type)
    }
    @Test fun expiredBeforeEntryHasNoInventedTrade() {
        val s=signal(state="EXPIRED")
        s.events.removeAt(1)
        s.events.add(SignalEvent("EXPIRED",5000L,99.0))
        val path=SignalJourney.trace(s)
        assertNull(path.entry);assertNull(path.priceMovePercent)
        assertEquals("Завершён без входа",path.result)
    }
    @Test fun uncertainRemainsVisibleWithNoInventedExit() {
        val s=signal(state="UNCERTAIN")
        s.events.add(SignalEvent("DATA_GAP",3000L,101.0))
        val path=SignalJourney.trace(s)
        assertFalse(path.finished);assertNull(path.exit);assertNull(path.priceMovePercent)
    }
    @Test fun historicalLinesEndAtEachLevelLastTouch() {
        val s=signal(state="STOPPED")
        s.events.add(SignalEvent("TP1",3000L,102.0))
        s.events.add(SignalEvent("TP1",3500L,102.0))
        s.events.add(SignalEvent("STOP",5000L,98.0))
        val lines=SignalJourney.levelSegments(s,9000L)
        assertEquals(listOf("ENTRY","SL","TP1","TP2","TP3"),lines.map{it.name})
        assertTrue(lines.all{it.startAt==1000L})
        assertEquals(2000L, lines.first{it.name=="ENTRY"}.endAt)
        assertEquals(5000L, lines.first{it.name=="SL"}.endAt)
        assertEquals(3500L, lines.first{it.name=="TP1"}.endAt)
        assertTrue(lines.first{it.name=="TP1"}.touched)
        assertEquals(5000L, lines.first{it.name=="TP2"}.endAt)
        assertFalse(lines.first{it.name=="TP2"}.touched)
    }
    @Test fun pendingUnreachedLevelsContinueOnlyThroughLatestClosedCandle() {
        val levels=SignalJourney.levelSegments(signal(state="OPEN"),9000L)
        assertEquals(2000L,levels.first{it.name=="ENTRY"}.endAt)
        assertEquals(9000L,levels.first{it.name=="TP1"}.endAt)
        assertEquals(9000L,levels.first{it.name=="SL"}.endAt)
    }
    @Test fun cancelledExpiredAndUncertainLevelsNeverProjectAfterFinalEvent() {
        for ((status,eventType) in listOf("CANCELLED" to "INVALIDATED",
            "EXPIRED" to "EXPIRED","UNCERTAIN" to "DATA_GAP")) {
            val s=signal(state=status)
            s.events.add(SignalEvent(eventType,5000L,99.0))
            assertTrue(SignalJourney.levelSegments(s,10000L).all { it.endAt <= 5000L })
        }
    }

}

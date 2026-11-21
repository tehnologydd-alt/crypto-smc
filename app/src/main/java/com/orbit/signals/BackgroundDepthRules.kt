package com.orbit.signals

/** A separate hypothesis: depth persistence AFTER structural candle close.
 * It must never be evaluated as D2 evidence, which requires history before close.
 */
data class BackgroundDepthResult(
    val accepted:Boolean,
    val reason:String,
    val evidence:OrderBookSnapshot?=null,
    val samples:Int=0,
    val observedMs:Long=0L
)
object BackgroundDepthRules {
    const val MAX_SESSION_MS=5*60_000L
    const val MIN_OBSERVED_MS=4*60_000L
    const val MAX_SAMPLE_GAP_MS=35_000L
    const val MAX_LAST_AGE_MS=15_000L
    const val MAX_QUEUE_AGE_MS=20*60_000L

    fun evaluate(observations:List<OrderBookSnapshot>,market:String,symbol:String,
        side:String,startedAt:Long,endedAt:Long):BackgroundDepthResult {
        if(side!="LONG"&&side!="SHORT")return BackgroundDepthResult(false,"BAD_SIDE")
        val ordered=observations.sortedBy{it.capturedAt}.distinctBy{it.capturedAt}
        if(ordered.size<12)return BackgroundDepthResult(false,"TOO_FEW_DEPTH_SAMPLES",samples=ordered.size)
        if(startedAt<=0||endedAt<startedAt||endedAt-startedAt>MAX_SESSION_MS+30_000L)
            return BackgroundDepthResult(false,"INVALID_SESSION_TIME",samples=ordered.size)
        if(ordered.any{it.source!="binance_ws_depth"||it.status!="live"||
                it.market!=market||it.symbol!=symbol||it.levels!=100||
                it.lastUpdateId<=0||it.capturedAt<startedAt||it.capturedAt>endedAt||
                it.bidUsdt<=0||it.askUsdt<=0||!it.imbalance.isFinite()||
                !it.spreadPct.isFinite()||it.spreadPct<0||
                !it.averageImbalance.isFinite()||it.observedSince<=0})
            return BackgroundDepthResult(false,"INVALID_SEQUENCE_EVIDENCE",samples=ordered.size)
        val first=ordered.first();val last=ordered.last()
        val span=last.capturedAt-first.capturedAt
        if(span<MIN_OBSERVED_MS || last.capturedAt<endedAt-MAX_LAST_AGE_MS ||
            first.capturedAt>startedAt+45_000L)
            return BackgroundDepthResult(false,"INCOMPLETE_FIVE_MINUTE_OBSERVATION",samples=ordered.size,observedMs=span)
        if(ordered.zipWithNext().any{(a,b)->
                b.capturedAt-a.capturedAt>MAX_SAMPLE_GAP_MS ||
                b.lastUpdateId<=a.lastUpdateId ||
                b.observedSince>first.capturedAt})
            return BackgroundDepthResult(false,"INTERRUPTED_WS_CONTINUITY",samples=ordered.size,observedMs=span)
        val mean=ordered.map{it.imbalance}.average()
        val sideNow=if(side=="LONG")last.imbalance else 1-last.imbalance
        val sideAverage=if(side=="LONG")mean else 1-mean
        if(last.spreadPct>0.2||sideNow<.55||sideAverage<.53)
            return BackgroundDepthResult(false,"BOOK_IMBALANCE_UNSTABLE",samples=ordered.size,observedMs=span)
        val evidence=last.copy(observedSince=first.capturedAt,observationMs=span,
            observations=ordered.size,averageImbalance=mean)
        return BackgroundDepthResult(true,"FIVE_MINUTE_WS_CONFIRMED",evidence,ordered.size,span)
    }

    /** A late limit entry cannot be retrospectively advertised as a new signal. */
    fun checkUntouched(base:Signal,closedBars:List<Candle>,confirmedAt:Long):String? {
        if(confirmedAt<=base.detectedAt||confirmedAt>=base.expiresAt)
            return "EXPIRED_BEFORE_CONFIRMATION"
        val after=closedBars.filter{it.end>base.detectedAt&&it.end<=confirmedAt}.sortedBy{it.end}
        if(after.isEmpty())return "MISSING_M1_FOR_CONFIRMATION"
        if(after.zipWithNext().any{it.second.time-it.first.time>61_000L})
            return "M1_GAP_BEFORE_CONFIRMATION"
        val candidate=base.copy(state="WAITING",hitTargets=0,events=mutableListOf(
            SignalEvent("CREATED",base.detectedAt,base.entry)))
        for(bar in after) {
            Strategy.advance(candidate,bar)
            if(candidate.state!="WAITING")return "ENTRY_OR_STOP_ALREADY_TOUCHED"
        }
        return null
    }
}

package com.apexintelligence.research

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.math.MathContext
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max

/** Immutable, forward-only M15 and H4 cohorts. H1/M5 remains unchanged.
 * Same Room journal, independently timed levels and outcomes, no live orders. */
object ApexMultiFrameForecast {
    const val MODEL="EMPIRICAL_MULTIFRAME_DIRECTION_V1"
    const val LEVEL_VERSION="MULTIFRAME_SINGLE_LEVELS_V1"
    const val SEMANTICS="SAME_FRAME_LIMIT_V1" // immutable legacy studies
    const val M5_SEMANTICS="M5_CLOSED_LIMIT_V2" // immutable M5 cohort
    const val M1_SEMANTICS="M1_CLOSED_LIMIT_V1" // newly published studies
    private const val SAMPLE=96
    private val precision=MathContext(13)
    private val mutex=Mutex()
    private val symbol=Regex("^[A-Z0-9]{5,20}$")
    data class Spec(val interval:String,val step:Long,val bars:Int)
    private val specs=listOf(Spec("15m",900_000L,16),Spec("4h",14_400_000L,24))
    data class Report(val asset:String,val interval:String,val state:String,val stage:String)
    private fun positive(x:Double)=x.isFinite()&&x>0
    private fun round(x:Double)=x.toBigDecimal().round(precision).toDouble()
    private fun near(a:Double,b:Double)=positive(a)&&positive(b)&&
        abs(a-b)<=max(1e-9,abs(b)*2e-11)

    suspend fun syncAll(context:Context,favorites:List<String>,dao:ResearchDao):List<Report> =
        mutex.withLock { withContext(Dispatchers.IO) {
            ApexApiLedger.install(context)
            val results=ArrayList<Report>()
            for(asset in favorites.filter{symbol.matches(it)}.distinct().take(10))
                for(spec in specs) {
                    try { results.add(syncOne(context,asset,spec,dao)) }
                    catch (_:Exception) {
                        results.add(Report(asset,spec.interval,"ERROR","DUE_UNVERIFIED"))
                    }
                }
            results
        } }

    private fun levels(entry:Double,width:Double,side:String):JSONObject {
        require(side=="UP"||side=="DOWN")
        val low=round(entry*exp(-width))
        val high=round(entry*exp(width))
        require(positive(low)&&positive(high)&&low<entry&&entry<high)
        val source=ApexResearchLevels.build(entry,low,high).getJSONObject(side)
        return JSONObject().put("version",LEVEL_VERSION).put("direction",side)
            .put("entry",entry).put("sl",source.getDouble("sl"))
            .put("tp1",source.getDouble("tp1"))
            .put("tp2",source.getDouble("tp2"))
            .put("tp3",source.getDouble("tp3"))
    }

    /** As-of-publication radar features are training context, never a proven filter. */
    private fun contextAtPublication(context:Context,asset:String,now:Long):JSONObject {
        val results=JSONObject()
        val observations=ApexRadarMonitor.read(context,listOf(asset))
        for(i in 0 until observations.length()) {
            val item=observations.optJSONObject(i)?.optJSONObject("latest")?:continue
            val interval=item.optString("interval")
            val close=item.optLong("candleAt",0L)
            val received=item.optLong("observedAt",0L)
            if(item.optString("symbol")!=asset||close<=0||close>=now||
                received<close||received>now||
                interval !in listOf("15m","1h","4h","1d"))continue
            results.put(interval,JSONObject()
                .put("direction",item.optString("direction"))
                .put("mode",item.optString("mode"))
                .put("movement",item.opt("movement")?:JSONObject.NULL)
                .put("acceleration",item.opt("acceleration")?:JSONObject.NULL)
                .put("volumeRatio",item.opt("volumeRatio")?:JSONObject.NULL)
                .put("candleAt",close).put("observedAt",received))
        }
        return results
    }

    private suspend fun syncOne(context:Context,asset:String,spec:Spec,
                                dao:ResearchDao):Report {
        val now=System.currentTimeMillis()
        val latest=dao.latestMultiFrameForecast(asset,spec.interval)
        if(latest!=null&&dao.researchResult(latest.id)==null){
            // A H4 forecast spans 1,152 M5 bars. Background WorkManager
            // may skip runs; repair missing source-time pages on demand.
            val hypothesis=try{JSONObject(latest.hypothesisJson)}
                           catch (_:Exception){JSONObject()}
            if(hypothesis.optString("evaluationInterval")==ApexM1Evaluation.INTERVAL){
                try {
                    ApexM1Evaluation.downloadAndSave(asset, dao, now)
                    ApexM1Evaluation.ensureWindow(asset,dao,now,
                        hypothesis.optLong("anchorCloseAt",-1L),
                        hypothesis.optLong("targetCloseAt",-1L))
                } catch (_:Exception) {
                    return Report(asset,spec.interval,"M1_UNAVAILABLE","DUE_UNVERIFIED")
                }
            }
            if(hypothesis.optString("evaluationInterval")==ApexM5Evaluation.INTERVAL){
                try {
                    ApexM5Evaluation.ensureWindow(asset,dao,now,
                        hypothesis.optLong("anchorCloseAt",-1L),
                        hypothesis.optLong("targetCloseAt",-1L))
                } catch (_:Exception) {
                    return Report(asset,spec.interval,"M5_UNAVAILABLE","DUE_UNVERIFIED")
                }
            }
            val state=progress(latest,spec,dao,now)
            if(state!="COMPLETED")return Report(asset,spec.interval,"UPDATED",state)
        }
        val candles=dao.candles(asset,spec.interval,SAMPLE).reversed()
        if(candles.size<SAMPLE)
            return Report(asset,spec.interval,"INSUFFICIENT","UNKNOWN")
        if(candles.any{it.asset!=asset||it.interval!=spec.interval||
            !positive(it.open)||!positive(it.high)||!positive(it.low)||
            !positive(it.close)||!it.volume.isFinite()||it.volume<0||
            it.high<max(it.open,max(it.close,it.low))||
            it.low>minOf(it.open,it.close)})
            return Report(asset,spec.interval,"INVALID","UNKNOWN")
        if((1 until SAMPLE).any{candles[it].openTime-candles[it-1].openTime!=spec.step})
            return Report(asset,spec.interval,"GAP","UNKNOWN")
        val last=candles.last()
        val anchor=last.closeTime
        if(anchor!=last.openTime+spec.step-1||anchor>=now||
            now-anchor>spec.step+90_000L)
            return Report(asset,spec.interval,"STALE","UNKNOWN")
        if(latest!=null){
            val old=try{JSONObject(latest.hypothesisJson).optLong("anchorCloseAt",0L)}
                    catch (_:Exception){0L}
            if(old>=anchor)return Report(asset,spec.interval,"ALREADY_EXISTS","COMPLETED")
        }
        val changes=ArrayList<Double>()
        for(i in 4 until SAMPLE){
            val value=abs(ln(candles[i].close/candles[i-4].close))
            if(!value.isFinite())return Report(asset,spec.interval,"INVALID","UNKNOWN")
            changes.add(value)
        }
        changes.sort()
        val width=changes[(ceil(changes.size*.8).toInt()-1).coerceIn(0,changes.lastIndex)]
        if(!positive(width))return Report(asset,spec.interval,"INSUFFICIENT","UNKNOWN")
        val side=ApexDirectionalForecast.direction(candles,width)
            ?:return Report(asset,spec.interval,"NO_CLEAR_DIRECTION","UNKNOWN")
        val entry=round(last.close)
        val controls=try{levels(entry,width,side)}
                     catch (_:Exception){return Report(asset,spec.interval,"INVALID","UNKNOWN")}
        val frame=spec.interval
        val id="direction3:$asset:$frame:$anchor"
        val published=JSONObject()
            .put("model",MODEL).put("interval",frame).put("direction",side)
            .put("decisionMethod","SIX_BAR_EFFICIENCY_V1")
            .put("anchorCloseAt",anchor).put("anchorClose",entry)
            .put("targetCloseAt",anchor+spec.step*spec.bars)
            .put("horizonBars",spec.bars).put("evaluationInterval",ApexM1Evaluation.INTERVAL)
            .put("observationMethod",ApexM1Evaluation.METHOD)
            .put("stageSemantics",M1_SEMANTICS).put("levelStudy",controls)
            .put("sampleBars",SAMPLE).put("empiricalSamples",changes.size)
            .put("historicalPercentile",.8).put("empiricalWidth",width)
            .put("preOutcomeStrength",
                ApexPreOutcomeStrength.snapshot(candles,width,now))
            .put("calibratedProbability",JSONObject.NULL)
            .put("contextAsPublished",contextAtPublication(context,asset,now))
            .put("evidenceAsPublished",
                ApexEvidenceContext.capture(context,dao,asset,now))
            .put("whaleCheckAsPublished",
                ApexWhalePrepublication.capture(dao,asset,now))
            .put("source","Binance Spot closed "+frame+" candles")
        val inserted=dao.publishResearchForecast(ResearchForecast(
            id,asset,frame,"PUBLISHED",now,now,published.toString()))
        if(inserted!=-1L)dao.appendResearchStage(ResearchForecastStage(
            id,"PENDING_CONFIRMATION",now,now,"Forward-only "+frame+" research"))
        return Report(asset,frame,if(inserted!=-1L)"CREATED" else "ALREADY_EXISTS",
            "PENDING_CONFIRMATION")
    }

    private suspend fun progress(row:ResearchForecast,spec:Spec,dao:ResearchDao,now:Long):String {
        val h=try{JSONObject(row.hypothesisJson)}catch (_:Exception){return "INVALID"}
        val side=h.optString("direction")
        val frame=spec.interval
        val anchor=h.optLong("anchorCloseAt",-1)
        val target=h.optLong("targetCloseAt",-1)
        val controls=h.optJSONObject("levelStudy")?:return "INVALID"
        val entry=controls.optDouble("entry",Double.NaN)
        val sl=controls.optDouble("sl",Double.NaN)
        val tp=(1..3).map{controls.optDouble("tp$it",Double.NaN)}
        val m5=h.optString("evaluationInterval")==ApexM5Evaluation.INTERVAL&&
            h.optString("observationMethod")==ApexM5Evaluation.METHOD&&
            h.optString("stageSemantics")==M5_SEMANTICS
        val m1=h.optString("evaluationInterval")==ApexM1Evaluation.INTERVAL&&
            h.optString("observationMethod")==ApexM1Evaluation.METHOD&&
            h.optString("stageSemantics")==M1_SEMANTICS
        val legacy=h.optString("evaluationInterval")==frame&&
            h.optString("stageSemantics")==SEMANTICS
        val ordered=if(side=="UP")
            sl<entry&&entry<tp[0]&&tp[0]<tp[1]&&tp[1]<tp[2]
        else if(side=="DOWN")
            tp[2]<tp[1]&&tp[1]<tp[0]&&tp[0]<entry&&entry<sl
        else false
        val expected=try{levels(entry,h.optDouble("empiricalWidth"),side)}
                     catch (_:Exception){return "INVALID"}
        val originalId="direction3:"+row.asset+":"+frame+":"+anchor
        if(h.optString("model")!=MODEL||h.optString("interval")!=frame||
            !(legacy||m5||m1)||
            h.optString("decisionMethod")!="SIX_BAR_EFFICIENCY_V1"||
            h.optInt("sampleBars")!=SAMPLE||h.optInt("horizonBars")!=spec.bars||
            row.horizon!=frame||row.id!=originalId||
            controls.optString("version")!=LEVEL_VERSION||
            controls.optString("direction")!=side||
            !positive(entry)||!positive(sl)||tp.any{!positive(it)}||!ordered||
            anchor<=0||anchor%spec.step!=spec.step-1||
            target!=anchor+spec.bars*spec.step||
            row.publishedAt<anchor||row.publishedAt>=anchor+spec.step||
            !near(entry,h.optDouble("anchorClose",Double.NaN))||
            listOf("entry","sl","tp1","tp2","tp3").any{
                !near(controls.optDouble(it,Double.NaN),expected.optDouble(it,Double.NaN))
            })return "INVALID"
        val baseline=dao.candleAtClose(row.asset,frame,anchor)?:return "DUE_UNVERIFIED"
        if(!near(baseline.close,entry))return "DUE_UNVERIFIED"
        if(m1)return ApexM1Evaluation.progress(
            row,dao,now,anchor,target,side,entry,sl,tp,
            limitSemantics=true,horizonMs=spec.step*spec.bars
        )
        if(m5)return ApexM5Evaluation.progress(
            row,dao,now,anchor,target,side,entry,sl,tp,
            limitSemantics=true,horizonMs=spec.step*spec.bars
        )
        // Old published records keep their original timeframe methodology.
        val bars=dao.candlesInRange(row.asset,frame,anchor+1,target+1)
        val byTime=bars.associateBy{it.closeTime}
        if(byTime.size!=bars.size)return "DUE_UNVERIFIED"
        var readyAt:Long?=null
        var enteredAt:Long?=null
        var firstTp:Long?=null
        var highest=0
        val targets=ArrayList<Pair<Int,Long>>()
        var terminal:String?=null
        var terminalAt:Long?=null
        var observed=0
        var lastClose=entry
        for(i in 1..spec.bars){
            val at=anchor+i*spec.step
            if(at>=now)break
            val candle=byTime[at]?:return "DUE_UNVERIFIED"
            if(candle.asset!=row.asset||candle.interval!=frame||
                candle.openTime!=at-spec.step+1||
                candle.recordedAt<candle.closeTime||
                !positive(candle.open)||!positive(candle.high)||
                !positive(candle.low)||!positive(candle.close)||
                !candle.volume.isFinite()||candle.volume<0||
                candle.low>minOf(candle.open,candle.close)||
                candle.high<max(candle.open,candle.close))
                return "DUE_UNVERIFIED"
            observed++
            lastClose=candle.close
            // Never count a candle that began before immutable publication.
            if(candle.openTime<row.publishedAt)continue
            if(readyAt==null)readyAt=at
            val entered=candle.low<=entry&&candle.high>=entry
            val stopHit=if(side=="UP")candle.low<=sl else candle.high>=sl
            fun touched(n:Int)=if(side=="UP")candle.high>=tp[n-1]
                               else candle.low<=tp[n-1]
            if(enteredAt==null){
                if(!entered)continue
                enteredAt=at
                if(stopHit||touched(1)){
                    terminal="AMBIGUOUS";terminalAt=at;break
                }
                continue
            }
            val next=((highest+1)..3).filter{touched(it)}
            if(stopHit&&next.isNotEmpty()){
                terminal="AMBIGUOUS";terminalAt=at;break
            }
            if(stopHit){terminal="STOP";terminalAt=at;break}
            if(next.isNotEmpty()){
                for(n in next)targets.add(n to at)
                highest=next.last()
                if(firstTp==null)firstTp=at
                if(highest==3){terminal="TP3";terminalAt=at;break}
            }
        }
        if(readyAt!=null)dao.appendResearchStage(ResearchForecastStage(
            row.id,"LIMIT_READY",readyAt,now,"First fully closed "+frame+" after publication"))
        if(enteredAt!=null)dao.appendResearchStage(ResearchForecastStage(
            row.id,"CONFIRMED",enteredAt,now,"Entry touched; not an order"))
        if(firstTp!=null)dao.appendResearchStage(ResearchForecastStage(
            row.id,"ACTIVE",firstTp,now,"TP1 touched"))
        for((n,at)in targets)dao.appendResearchStage(ResearchForecastStage(
            row.id,"TP$n",at,now,"Closed "+frame+" TP observation"))
        if(terminal==null&&now>target&&observed==spec.bars){
            terminal=if(enteredAt==null)"NOT_ENTERED" else "HORIZON"
            terminalAt=target
        }
        if(terminal!=null&&terminalAt!=null){
            val ending=when(terminal){
                "STOP"->"SL";"AMBIGUOUS"->"ORDER_UNKNOWN"
                "NOT_ENTERED"->"NO_ENTRY";"HORIZON"->"TIMEOUT";else->null
            }
            if(ending!=null)dao.appendResearchStage(ResearchForecastStage(
                row.id,ending,terminalAt,now,"Terminal "+frame+" observation"))
            dao.recordResearchResult(ResearchForecastResult(
                row.id,terminal,now,target,lastClose,(lastClose/entry-1)*100))
            dao.appendResearchStage(ResearchForecastStage(
                row.id,"COMPLETED",terminalAt,now,"Immutable "+frame+" result: "+terminal))
            return "COMPLETED"
        }
        return when{
            enteredAt!=null->"ACTIVE"
            readyAt!=null->"CONFIRMED"
            else->"PENDING_CONFIRMATION"
        }
    }
}

package com.orbit.signals

import android.content.Context
import android.os.SystemClock
import java.util.concurrent.atomic.AtomicBoolean

/** JobScheduler can stop this experiment at any moment; no interrupted run
 * may create a signal. Each run examines ONE market/symbol and at most
 * five queued structural candidates (timeframes share the same WS feed).
 */
object BackgroundDepthRunner {
    fun run(context:Context,cancel:AtomicBoolean):String {
        val prefs=Preferences(context)
        if(prefs.mode!="local")return "Local background depth is disabled in server mode"
        val store=LocalStore(context)
        var active:List<PendingDepth> = emptyList()
        try {
            store.pruneDepth()
            val queued=store.nextDepth(limit=20)
            if(queued.isEmpty())return "No pending structural candidates"
            val first=queued.first()
            val now=System.currentTimeMillis()
            active=queued.filter{it.market==first.market&&it.symbol==first.symbol}.take(5)
            if(cancel.get())return "Job stopped before depth observation"
            store.startDepth(active,now)
            val begin=SystemClock.elapsedRealtime()
            val observations=ArrayList<OrderBookSnapshot>(36)
            var lastCaptured=0L
            var interrupted=false
            LiveDepthClient.startBackground(first.market,first.symbol)
            try {
                while(SystemClock.elapsedRealtime()-begin<BackgroundDepthRules.MAX_SESSION_MS){
                    if(cancel.get()||Thread.currentThread().isInterrupted) {
                        interrupted=true;break
                    }
                    val snapshot=LiveDepthClient.snapshot(first.market,first.symbol)
                    if(snapshot!=null&&snapshot.capturedAt>lastCaptured) {
                        observations.add(snapshot)
                        lastCaptured=snapshot.capturedAt
                        store.checkpointDepth(active,snapshot)
                    }
                    val remaining=BackgroundDepthRules.MAX_SESSION_MS-
                        (SystemClock.elapsedRealtime()-begin)
                    if(remaining>0)try{Thread.sleep(minOf(10_000L,remaining))}
                        catch(_:InterruptedException){interrupted=true;break}
                }
            }finally{
                LiveDepthClient.stopBackground()
            }
            if(interrupted||cancel.get()) {
                store.finishDepth(active,"INTERRUPTED","ANDROID_JOB_STOPPED")
                return "Interrupted: ${active.size} depth checks"
            }
            val end=System.currentTimeMillis()
            val history=runCatching{Binance.candles(first.market,first.symbol,"1m",1000)}
                .getOrNull()
            var confirmed=0
            for(item in active){
                val outcome=BackgroundDepthRules.evaluate(observations,item.market,item.symbol,
                    item.candidate.side,now,end)
                if(!outcome.accepted){
                    store.finishDepth(listOf(item),"INCOMPLETE",outcome.reason,end)
                    continue
                }
                val timeCheck=if(history==null)"M1_UNAVAILABLE"
                    else BackgroundDepthRules.checkUntouched(item.candidate,history,end)
                if(timeCheck!=null) {
                    store.finishDepth(listOf(item),"REJECTED",timeCheck,end)
                    continue
                }
                val possible=if(item.htfAllowed)listOf("v0.2-B5","v0.3-B5")
                    else listOf("v0.2-B5")
                val already=store.signals(item.market,item.symbol)
                var created=0
                for(key in possible){
                    val id=item.candidate.id.removeSuffix(":v0.1")+":"+key
                    if(store.signalExists(id)||already.any{
                            it.ruleVersion==key&&it.timeframe==item.candidate.timeframe&&
                                it.state in listOf("WAITING","OPEN","UNCERTAIN")})continue
                    val evidence=outcome.evidence?:continue
                    val base=item.candidate
                    val signal=base.copy(id=id,ruleVersion=key,ruleSpec=ResearchRules.signature(
                        ResearchRules.all.first{it.key==key}),
                        detectedAt=end,originClosedAt=base.detectedAt,
                        expiresAt=end+12L*TIMEFRAMES.getValue(base.timeframe)*60_000L,
                        bookEvidence=evidence,events=mutableListOf(
                            SignalEvent("CREATED",end,base.entry)),
                        learned=false,outcome=null,quality=null,state="WAITING",hitTargets=0)
                    signal.quality=store.ruleModel(key).score(signal.features)
                    store.saveSignal(signal)
                    LocalNotifier(context,prefs).send(signal,signal.events.first())
                    created++
                }
                store.finishDepth(listOf(item),if(created>0)"CONFIRMED" else "REJECTED",
                    if(created>0)"${outcome.reason}; ${created} frozen rules" else "EXISTING_ACTIVE_RULE",
                    end)
                confirmed+=created
            }
            return "Depth ${first.market} ${first.symbol}: ${observations.size} samples; ${confirmed} signals"
        }catch(error:Exception){
            if(active.isNotEmpty())store.finishDepth(active,"FAILED",
                "DEPTH_JOB_ERROR: "+(error.message?:error.javaClass.simpleName))
            return "Background depth error: "+(error.message?:error.javaClass.simpleName)
        }finally{
            store.close()
        }
    }
}

package com.orbit.signals

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Rule identifiers are immutable; old volume-based v0.2/v0.3 are archived. */
data class ResearchRule(val key:String, val title:String, val useLiquidity:Boolean, val useHtf:Boolean)
data class LiquidityEvidence(
    val allowed:Boolean, val reason:String, val poolPrice:Double?=null,
    val sweepAt:Long?=null, val kind:String?=null, val penetrationAtr:Double?=null
)
object ResearchRules {
    val all = listOf(
        ResearchRule("v0.1","Структура + OB/FVG",false,false),
        ResearchRule("v0.2-D2","Структура + OB/FVG + стакан Binance",true,false),
        ResearchRule("v0.3-D2","Стакан Binance + старший TF",true,true)
    )
    // Previous experimental revisions kept for their durable snapshots and models.
    val archivedKeys = listOf("v0.2","v0.3","v0.2-L1","v0.3-L1","v0.2-D1","v0.3-D1")
    val keys = all.map { it.key } + archivedKeys
    fun signature(rule:ResearchRule):String = when(rule.key) {
        "v0.1" -> "BOS_CHoCH_L2R2|OB_ACTIVE|FVG_ACTIVE|STOP_OB_ATR0.1|TP_1R_2R_3R|M1"
        "v0.2-D2" -> "BOS_CHoCH_L2R2|OB_ACTIVE|FVG_ACTIVE|BINANCE_WS_DIFF_SYNC_100L_USDT_SIDE_SHARE_GE_0.55_OBSERVE_10S_4SAMPLES|STOP_OB_ATR0.1|TP_1R_2R_3R|M1"
        "v0.3-D2" -> "BOS_CHoCH_L2R2|OB_ACTIVE|FVG_ACTIVE|BINANCE_WS_DIFF_SYNC_100L_USDT_SIDE_SHARE_GE_0.55_OBSERVE_10S_4SAMPLES|PARENT_CLOSED_TF_REGIME|STOP_OB_ATR0.1|TP_1R_2R_3R|M1"
        else -> error("Unknown research rule")
    }
    private fun atrBefore(b:List<Candle>,index:Int):Double? {
        if(index<14)return null
        var sum=0.0
        for(i in index-14 until index) {
            val c=b[i];val previous=b.getOrNull(i-1)?.close?:c.open
            if(listOf(c.high,c.low,c.open,c.close,previous).any{!it.isFinite()})return null
            sum+=max(c.high-c.low,max(abs(c.high-previous),abs(c.low-previous)))
        }
        return sum/14.0
    }
    private fun pivot(b:List<Candle>,i:Int,long:Boolean,span:Int):Boolean {
        if(i<span||i+span>=b.size)return false
        val extreme=if(long)b[i].low else b[i].high
        if(!extreme.isFinite())return false
        val neighbours=(i-span until i).toList()+(i+1..i+span).toList()
        val comparisons=neighbours.map { j ->
            val other=if(long)b[j].low else b[j].high
            if(long) extreme<=other else extreme>=other
        }
        val strict=neighbours.any { j ->
            val other=if(long)b[j].low else b[j].high
            if(long) extreme<other else extreme>other
        }
        return comparisons.all{it}&&strict
    }
    /**
     * Stop-pool hypothesis, not actual measured resting orders:
     * two confirmed near-equal pivots, then a closed sweep/reclaim candle
     * within 12 bars before the structural break. No future candles or volumes.
     */
    fun sweep(b:List<Candle>,breakIndex:Int,direction:String,
              lookback:Int=48,window:Int=12,span:Int=2):LiquidityEvidence {
        if(direction !in listOf("up","down")||breakIndex<20||breakIndex>=b.size)
            return LiquidityEvidence(false,"NO_CLOSED_STRUCTURE")
        val atr=atrBefore(b,breakIndex)?:return LiquidityEvidence(false,"NO_ATR")
        if(atr<=0.0)return LiquidityEvidence(false,"NO_ATR")
        val isLong=direction=="up"
        val first=max(span,breakIndex-lookback)
        val sweepStart=max(first+2*span+4,breakIndex-window)
        for(sweepIndex in breakIndex-1 downTo sweepStart) {
            val c=b[sweepIndex]
            if(listOf(c.high,c.low,c.close).any{!it.isFinite()})continue
            val confirmed=mutableListOf<Int>()
            for(i in first until sweepIndex-span)if(pivot(b,i,isLong,span))confirmed+=i
            for(second in confirmed.lastIndex downTo 1) {
                for(primary in second-1 downTo 0) {
                    val a=confirmed[primary];val z=confirmed[second]
                    if(z-a<3)continue
                    val p1=if(isLong)b[a].low else b[a].high
                    val p2=if(isLong)b[z].low else b[z].high
                    if(abs(p1-p2)>0.20*atr)continue
                    val pool=(p1+p2)/2
                    val swept=if(isLong)c.low<pool-0.05*atr&&c.close>pool
                        else c.high>pool+0.05*atr&&c.close<pool
                    if(!swept)continue
                    return LiquidityEvidence(true,"CONFIRMED_POOL_SWEEP_RECLAIM",
                        pool,c.end,if(isLong)"EQUAL_LOWS" else "EQUAL_HIGHS",
                        if(isLong)(pool-c.low)/atr else (c.high-pool)/atr)
                }
            }
        }
        return LiquidityEvidence(false,"NO_CONFIRMED_POOL_SWEEP")
    }
}

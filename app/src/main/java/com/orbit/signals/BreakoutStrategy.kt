package com.orbit.signals

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

object BreakoutStrategy {
    fun detect(bars:List<Candle>,market:String,symbol:String,tf:String,parent:List<Candle>?):Signal? {
        if(market!="futures"||tf !in TIMEFRAMES||bars.size<35||bars.zipWithNext().any{it.first.time>=it.second.time}||
            bars.any{listOf(it.open,it.high,it.low,it.close,it.volume).any{v->!v.isFinite()}||
                it.high<max(it.open,max(it.close,it.low))||it.low>min(it.open,min(it.close,it.high))||it.volume<0})return null
        val i=bars.lastIndex;val bar=bars[i];val previous=bars.subList(i-20,i)
        val atr=(i-14 until i).sumOf{k->val c=bars[k];val p=bars.getOrNull(k-1)?.close?:c.open
            max(c.high-c.low,max(abs(c.high-p),abs(c.low-p)))}/14.0
        if(!atr.isFinite()||atr<=0)return null
        val high=previous.maxOf{it.high};val low=previous.minOf{it.low}
        val up=bar.close>high&&bars[i-1].close<=high
        val down=bar.close<low&&bars[i-1].close>=low
        if(up==down)return null
        val meanVolume=previous.sumOf{it.volume}/20
        val volumeRatio=if(meanVolume>0)bar.volume/meanVolume else 0.0
        val range=bar.high-bar.low
        val closeLocation=if(range>0)(bar.close-bar.low)/range else .5
        val body=abs(bar.close-bar.open)
        if(body<1.2*atr||volumeRatio<1.5||
            (up&&(bar.close<=bar.open||closeLocation<.75))||
            (down&&(bar.close>=bar.open||closeLocation>.25)))return null
        val direction=if(up)"up" else "down"
        val event=Break(bar.time,if(up)high else low,direction,null,"BOS",index=i,occurredAt=bar.end)
        if(!ContextRegimeFilter.evaluate(event,bars,parent,tf).allowed)return null
        val side=if(up)"LONG" else "SHORT";val sign=if(up)1.0 else -1.0
        val entry=bar.close;val level=if(up)high else low
        return Signal("$market:$symbol:$tf:${bar.time}:$side:breakout",market,symbol,tf,side,bar.end,bar.time,
            entry-.25*atr,entry+.25*atr,entry,entry-sign*atr,(1..3).map{entry+sign*it*atr},level,
            Zone(bar.time,min(level,entry),max(level,entry),direction,status="breakout",kind="BREAKOUT"),
            listOf(1.0,min(3.0,body/atr),min(3.0,abs(entry-level)/atr),min(3.0,volumeRatio),
                closeLocation,min(3.0,100*atr/entry),if(down)1.0 else 0.0,
                ln(TIMEFRAMES.getValue(tf)/5.0)/ln(48.0)),
            bar.end+60_000L,events=mutableListOf(SignalEvent("CREATED",bar.end,bar.close)),
            strategyVersion=4,breakType="BREAKOUT",ruleVersion="breakout",volumeRatio=volumeRatio,
            ruleSpec=ResearchRules.signature(ResearchRules.all.first{it.key=="breakout"}),
            originClosedAt=bar.end,strategyKey="breakout",entryMode="NEXT_M1_OPEN",entryAtr=atr)
    }
}

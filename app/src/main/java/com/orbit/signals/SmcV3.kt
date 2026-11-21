package com.orbit.signals

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

data class DetailedStructure(val swings:List<Swing>, val breaks:List<Break>, val regime:String)
data class DetectedZones(val blocks:List<Zone>, val gaps:List<Zone>)
data class ContextDecision(val allowed:Boolean, val reason:String)
private val PARENTS=mapOf("5m" to "1h","15m" to "1h","30m" to "1h","1h" to "4h","4h" to "1d")
private val MINUTES=TIMEFRAMES+("1d" to 1440)
private fun valid(c:Candle)=listOf(c.open,c.high,c.low,c.close).all{it.isFinite()} &&
    c.high>=max(c.open,max(c.close,c.low)) && c.low<=min(c.open,min(c.close,c.high)) && c.end>=c.time
private fun atrBefore(b:List<Candle>,i:Int):Double {
    if(i<14)return 0.0
    return (i-14 until i).sumOf{k->val c=b[k];val p=b.getOrNull(k-1)?.close?:c.open
        max(c.high-c.low,max(abs(c.high-p),abs(c.low-p)))}/14.0
}
object MarketStructureEngine {
    fun analyze(b:List<Candle>):DetailedStructure {
        val sw=mutableListOf<Swing>();val br=mutableListOf<Break>();val used=mutableSetOf<String>()
        var h:Swing?=null;var l:Swing?=null;var regime="range"
        for(i in 4 until b.size){
            val j=i-2;val c=b[j]
            if(!valid(c)||!valid(b[i]))continue
            if(listOf(j-2,j-1,j+1,j+2).all{c.high>b[it].high}){
                h=Swing(c.time,c.high,"high",b[i].end,j,"H:"+c.time);sw.add(h)
            }
            if(listOf(j-2,j-1,j+1,j+2).all{c.low<b[it].low}){
                l=Swing(c.time,c.low,"low",b[i].end,j,"L:"+c.time);sw.add(l)
            }
            if(i<5||!valid(b[i-1]))continue
            val bar=b[i];val prev=b[i-1]
            val up=h!=null&&h.id !in used&&prev.close<=h.price&&bar.close>h.price
            val down=l!=null&&l.id !in used&&prev.close>=l.price&&bar.close<l.price
            if(up==down)continue
            val dir=if(up)"up" else "down";val swing=if(up)h!! else l!!
            val type=if(regime!="range"&&regime!=dir)"CHoCH" else "BOS"
            val id=dir+":"+swing.id+":"+bar.time
            br.add(Break(bar.time,swing.price,dir,null,type,id,i,bar.end,swing.time,regime,dir))
            used.add(swing.id);regime=dir
        }
        return DetailedStructure(sw,br,regime)
    }
}
object ZonesDetector {
    private fun status(z:Zone,b:List<Candle>,br:List<Break>,origin:Int,through:Int):Zone {
        var name="active";var mitigated:Long?=null;var filled:Long?=null;var invalid:Long?=null;var expired:Long?=null
        for(i in origin+1..min(through,b.lastIndex)){
            val c=b[i]
            val reverse=br.any{it.index==i&&it.type=="CHoCH"&&it.direction!=z.direction}
            val broken=z.kind=="OB"&&(if(z.direction=="up")c.close<z.low-z.atr*.1 else c.close>z.high+z.atr*.1)
            if(reverse||broken){name="invalidated";invalid=c.end;break}
            if(i>origin+12){name="expired";expired=c.end;break}
            val full=if(z.direction=="up")c.low<=z.low else c.high>=z.high
            val touch=if(z.direction=="up")c.low<=z.high else c.high>=z.low
            if(full){name="filled";filled=c.end;break}
            if(touch&&name=="active"){name="mitigated";mitigated=c.end}
        }
        return z.copy(status=name,mitigatedAt=mitigated,filledAt=filled,invalidatedAt=invalid,
            expiredAt=expired,expiresAt=b.getOrNull(origin+12)?.end?:b.lastOrNull()?.end)
    }
    fun fvg(b:List<Candle>,br:List<Break> = emptyList(),through:Int=b.lastIndex):List<Zone>{
        val out=mutableListOf<Zone>()
        for(i in 2..min(through,b.lastIndex)){
            val a=b[i-2];val c=b[i];val atr=atrBefore(b,i)
            if(atr<=0||!valid(a)||!valid(c))continue
            val dir=if(a.high<c.low)"up" else if(a.low>c.high)"down" else continue
            val low=if(dir=="up")a.high else c.high;val high=if(dir=="up")c.low else a.low
            if(high-low+1e-12<.05*atr)continue
            out.add(status(Zone(c.time,low,high,dir,id="FVG:"+c.time+":"+dir,kind="FVG",
                originIndex=i,atr=atr),b,br,i,through))
        }
        return out
    }
    fun ob(b:List<Candle>,br:List<Break>,through:Int=b.lastIndex):List<Zone>{
        val out=mutableListOf<Zone>()
        for(e in br.filter{it.index<=through}){
            val i=e.index;val atr=atrBefore(b,i)
            if(atr<=0||abs(b[i].close-b[i].open)+1e-12<1.2*atr)continue
            if(e.direction=="up"&&b[i].close<=b[i].open)continue
            if(e.direction=="down"&&b[i].close>=b[i].open)continue
            val k=(i-1 downTo max(0,i-8)).firstOrNull{j->
                if(e.direction=="up")b[j].close<b[j].open else b[j].close>b[j].open
            }?:continue
            val c=b[k];if(c.high-c.low>2*atr)continue
            out.add(status(Zone(c.time,c.low,c.high,e.direction,id="OB:"+e.id,kind="OB",
                originIndex=i,originEventId=e.id,atr=atr),b,br,i,through))
        }
        return out
    }
    fun scan(b:List<Candle>,s:DetailedStructure=MarketStructureEngine.analyze(b))=
        DetectedZones(ob(b,s.breaks),fvg(b,s.breaks))
}
object ContextRegimeFilter {
    fun evaluate(e:Break,b:List<Candle>,parentBars:List<Candle>?,tf:String):ContextDecision{
        val parent=PARENTS[tf]?:return ContextDecision(false,"BAD_TIMEFRAME")
        if(parentBars==null||parentBars.size<16)return ContextDecision(false,"NO_HTF_DATA")
        val available=parentBars.filter{it.end<=b.last().end}
        if(available.size<16||b.last().end-available.last().end>2*MINUTES.getValue(parent)*60000L)
            return ContextDecision(false,"STALE_HTF")
        val regime=MarketStructureEngine.analyze(available).regime
        if(e.type=="BOS"&&regime!=e.direction)return ContextDecision(false,"HTF_CONFLICT")
        if(e.type=="CHoCH"&&regime!=e.direction&&regime!="range")
            return ContextDecision(false,"HTF_OPPOSITE_BOS")
        return ContextDecision(true,regime)
    }
}
object ExecutionRiskManager {
    fun create(b:List<Candle>,market:String,symbol:String,tf:String,e:Break,ob:Zone,fvg:Zone):Signal?{
        val c=b.last();val side=if(e.direction=="up")"LONG" else "SHORT"
        val entry=(ob.low+ob.high)/2;val stop=if(side=="LONG")ob.low-.1*ob.atr else ob.high+.1*ob.atr
        val risk=abs(entry-stop)
        if(!risk.isFinite()||risk<=1e-12||(if(side=="LONG")c.close<=ob.high else c.close>=ob.low))return null
        val sign=if(side=="LONG")1.0 else -1.0
        val features=listOf(1.0,min(3.0,abs(b[e.index].close-b[e.index].open)/ob.atr),
            min(3.0,(ob.high-ob.low)/ob.atr),min(3.0,abs(b[e.index].close-e.level)/ob.atr),
            min(3.0,abs(c.close-entry)/ob.atr),if(market=="futures")1.0 else 0.0,
            if(side=="SHORT")1.0 else 0.0,ln(TIMEFRAMES.getValue(tf)/5.0)/ln(48.0))
        return Signal(market+":"+symbol+":"+tf+":"+c.time+":"+side,market,symbol,tf,side,c.end,
            ob.time,ob.low,ob.high,entry,stop,(1..3).map{entry+sign*it*risk},e.level,fvg,features,
            c.end+12L*TIMEFRAMES.getValue(tf)*60000L,
            events=mutableListOf(SignalEvent("CREATED",c.end,c.close)),strategyVersion=3,breakType=e.type)
    }
}
object SmcV3 {
    fun structure(b:List<Candle>):Structure{
        val s=MarketStructureEngine.analyze(b);val z=ZonesDetector.scan(b,s)
        val blocks=z.blocks.associateBy{it.originEventId}
        return Structure(s.swings.takeLast(14),s.breaks.takeLast(8).map{it.copy(block=blocks[it.id])},
            z.gaps.takeLast(12),s.regime)
    }
    fun detect(b:List<Candle>,market:String,symbol:String,tf:String,parent:List<Candle>?,requireHtf:Boolean=true):Signal?{
        if(b.size<35||market !in listOf("spot","futures")||tf !in PARENTS||
            b.any{!valid(it)}||b.zipWithNext().any{it.first.time>=it.second.time})return null
        val s=MarketStructureEngine.analyze(b);val e=s.breaks.lastOrNull()?:return null
        val last=b.lastIndex
        if(e.index!=last&&!(e.type=="CHoCH"&&e.index==last-1))return null
        if(e.type=="CHoCH"&&!(e.index==last-1&&
            (if(e.direction=="up")b[last].close>e.level else b[last].close<e.level)))return null
        if(market=="spot"&&e.direction=="down")return null
        val atr=atrBefore(b,e.index)
        if(atr<=0||abs(b[e.index].close-b[e.index].open)<1.2*atr)return null
        if(if(e.direction=="up")b[e.index].close<=b[e.index].open else b[e.index].close>=b[e.index].open)return null
        val z=ZonesDetector.scan(b,s)
        val ob=z.blocks.firstOrNull{it.originEventId==e.id&&it.status=="active"}?:return null
        val fvg=z.gaps.lastOrNull{it.originIndex>=e.index-3&&it.originIndex<=e.index&&
            it.direction==e.direction&&it.status=="active"}?:return null
        if(requireHtf && !ContextRegimeFilter.evaluate(e,b,parent,tf).allowed)return null
        return ExecutionRiskManager.create(b,market,symbol,tf,e,ob,fvg)
    }
    /** A separate, auditable L2 snapshot gates D1 variants; the base is unaffected. */
    fun detectVariants(b:List<Candle>,market:String,symbol:String,tf:String,
        parent:List<Candle>?,book:OrderBookSnapshot?=null,observedAt:Long=System.currentTimeMillis()):List<Signal> {
        val candidate=detect(b,market,symbol,tf,parent,requireHtf=false) ?: return emptyList()
        val breaking=MarketStructureEngine.analyze(b).breaks.lastOrNull() ?: return emptyList()
        val depth=BookDepth.gate(book,market,symbol,candidate.side,candidate.detectedAt,observedAt)
        val htf=if(depth.allowed) ContextRegimeFilter.evaluate(breaking,b,parent,tf).allowed else false
        return ResearchRules.all.filter { rule ->
            (!rule.useLiquidity || depth.allowed) && (!rule.useHtf || htf)
        }.map { rule ->
            val observed=if(rule.useLiquidity) book!!.capturedAt else candidate.detectedAt
            candidate.copy(id=candidate.id+":"+rule.key,ruleVersion=rule.key,
                ruleSpec=ResearchRules.signature(rule),
                bookEvidence=if(rule.useLiquidity) book else null,
                detectedAt=observed,
                expiresAt=observed+12L*TIMEFRAMES.getValue(tf)*60000L,
                // Mutable state MUST be independent between concurrent rule arms.
                events=mutableListOf(SignalEvent("CREATED",observed,b.last().close)))
        }
    }

}

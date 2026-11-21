// Orbit Signals SMC v3 — deterministic closed-candle research engines.
import { RULES } from './strategy-rules.js';
import { depthGate } from './order-book.js';
const EPS = 1e-12;
export const TF_MINUTES = Object.freeze({ '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 });
export const PARENT_TF = Object.freeze({ '5m': '1h', '15m': '1h', '30m': '1h', '1h': '4h', '4h': '1d' });

export function previousAtr(bars, i, periods = 14) {
  if (i < periods) return 0;
  let sum = 0;
  for (let k = i - periods; k < i; k++) {
    const previous = bars[k - 1]?.close ?? bars[k].open;
    sum += Math.max(bars[k].high - bars[k].low, Math.abs(bars[k].high - previous), Math.abs(bars[k].low - previous));
  }
  return sum / periods;
}
const valid = c => [c.open,c.high,c.low,c.close,c.end,c.time].every(Number.isFinite) &&
  c.high >= Math.max(c.open,c.close,c.low) && c.low <= Math.min(c.open,c.close,c.high) && c.end >= c.time;

export class MarketStructureEngine {
  static analyze(bars) {
    const swings=[], breaks=[];
    let high=null, low=null, regime='range';
    const used=new Set();
    for (let i=4;i<bars.length;i++) {
      const j=i-2, c=bars[j];
      if (!valid(c) || !valid(bars[i])) continue;
      if ([j-2,j-1,j+1,j+2].every(k=>c.high>bars[k].high)) {
        high={ id:'H:'+c.time, time:c.time, confirmedAt:bars[i].end, price:c.high, kind:'high', index:j };
        swings.push(high);
      }
      if ([j-2,j-1,j+1,j+2].every(k=>c.low<bars[k].low)) {
        low={ id:'L:'+c.time, time:c.time, confirmedAt:bars[i].end, price:c.low, kind:'low', index:j };
        swings.push(low);
      }
      if (i<5 || !valid(bars[i-1])) continue;
      const candle=bars[i], prev=bars[i-1];
      const up=high && !used.has(high.id) && prev.close<=high.price && candle.close>high.price;
      const down=low && !used.has(low.id) && prev.close>=low.price && candle.close<low.price;
      if (Boolean(up)===Boolean(down)) continue;
      const direction=up?'up':'down', swing=up?high:low;
      const type=regime!=='range' && regime!==direction?'CHoCH':'BOS';
      const previous=regime;
      regime=direction;
      used.add(swing.id);
      breaks.push({ id:direction+':'+swing.id+':'+candle.time, type, direction, time:candle.time,
        occurredAt:candle.end, index:i, level:swing.price, swingId:swing.id, swingTime:swing.time,
        structureBefore:previous, structureAfter:regime });
    }
    return { swings, breaks, regime };
  }
}

function statusAt(zone,bars,through,otherBreaks=[]) {
  const end=Math.min(through,bars.length-1);
  let status='active', mitigatedAt=null, filledAt=null, invalidatedAt=null, expiredAt=null;
  const origin=zone.originIndex;
  const expiryIndex=origin+12;
  for (let i=origin+1;i<=end;i++) {
    const c=bars[i];
    if (otherBreaks.some(e=>e.index===i && e.type==='CHoCH' && e.direction!==zone.direction) ||
        (zone.type==='OB' && (zone.direction==='up' ? c.close < zone.low-zone.atr*0.1 : c.close > zone.high+zone.atr*0.1))) {
      status='invalidated'; invalidatedAt=c.end; break;
    }
    if (i>expiryIndex) { status='expired'; expiredAt=c.end; break; }
    const fully=zone.direction==='up'?c.low<=zone.low:c.high>=zone.high;
    const touched=zone.direction==='up'?c.low<=zone.high:c.high>=zone.low;
    if (fully) { status='filled'; filledAt=c.end; break; }
    if (touched && status==='active') { status='mitigated'; mitigatedAt=c.end; }
  }
  return { ...zone, status, mitigatedAt, filledAt, invalidatedAt, expiredAt, expiresAt:bars[Math.min(expiryIndex,bars.length-1)]?.end??null };
}

export class ZonesDetector {
  static fvg(bars, breaks=[], through=bars.length-1) {
    const zones=[];
    for(let i=2;i<=through;i++){
      const first=bars[i-2],third=bars[i],atr=previousAtr(bars,i);
      if(!atr || !valid(first) || !valid(third)) continue;
      const dir=first.high<third.low?'up':first.low>third.high?'down':null;
      if(!dir) continue;
      const lo=dir==='up'?first.high:third.high, hi=dir==='up'?third.low:first.low;
      if(hi-lo+EPS<0.05*atr)continue;
      zones.push(statusAt({ id:'FVG:'+third.time+':'+dir, type:'FVG', time:third.time, firstTime:first.time,
        originIndex:i, direction:dir, low:lo, high:hi, atr },bars,through,breaks));
    }
    return zones;
  }
  static ob(bars, breaks, through=bars.length-1) {
    const zones=[];
    for (const e of breaks.filter(x=>x.index<=through)) {
      const atr=previousAtr(bars,e.index);
      if(!atr || Math.abs(bars[e.index].close-bars[e.index].open)+EPS<1.2*atr)continue;
      if(e.direction==='up' && bars[e.index].close<=bars[e.index].open)continue;
      if(e.direction==='down' && bars[e.index].close>=bars[e.index].open)continue;
      let k=e.index-1;
      while(k>=Math.max(0,e.index-8) && (e.direction==='up'?bars[k].close>=bars[k].open:bars[k].close<=bars[k].open)) k--;
      if(k<Math.max(0,e.index-8))continue;
      const b=bars[k];
      if(b.high-b.low>2*atr)continue;
      zones.push(statusAt({ id:'OB:'+e.id, type:'OB', time:b.time, originEventId:e.id,
        originIndex:e.index, candleIndex:k, direction:e.direction, low:b.low, high:b.high, atr },bars,through,breaks));
    }
    return zones;
  }
  static scan(bars,structure=MarketStructureEngine.analyze(bars)){
    return { ob:this.ob(bars,structure.breaks), fvg:this.fvg(bars,structure.breaks) };
  }
}

export class ContextRegimeFilter {
  static evaluate(event, bars, parentBars, timeframe) {
    const parent=PARENT_TF[timeframe];
    if(!parent || !Array.isArray(parentBars) || parentBars.length<16)return {allowed:false,reason:'NO_HTF_DATA'};
    const available=parentBars.filter(c=>c.end<=bars.at(-1).end);
    if(available.length<16 || bars.at(-1).end-available.at(-1).end>2*TF_MINUTES[parent]*60000)
      return {allowed:false,reason:'STALE_HTF'};
    const context=MarketStructureEngine.analyze(available);
    if(event.type==='BOS' && context.regime!==event.direction) return {allowed:false,reason:'HTF_CONFLICT'};
    if(event.type==='CHoCH' && context.regime!==event.direction && context.regime!=='range')
      return {allowed:false,reason:'HTF_OPPOSITE_BOS'};
    return {allowed:true,regime:context.regime,parent};
  }
}
export class ExecutionRiskManager {
  static create({bars, market,symbol,timeframe,event,ob,fvg}){
    const last=bars.at(-1),side=event.direction==='up'?'LONG':'SHORT';
    const atr=ob.atr,entry=(ob.low+ob.high)/2;
    const stop=side==='LONG'?ob.low-0.1*atr:ob.high+0.1*atr;
    const risk=Math.abs(entry-stop), sign=side==='LONG'?1:-1;
    if(!Number.isFinite(risk) || risk<=EPS || (side==='LONG'?last.close<=ob.high:last.close>=ob.low))return null;
    return { id:market+':'+symbol+':'+timeframe+':'+last.time+':'+side, market,symbol,timeframe,side,
      strategyVersion:3,structureEvent:{ id:event.id,type:event.type,direction:event.direction,level:event.level,occurredAt:event.occurredAt },
      detectedAt:last.end,blockTime:ob.time,entryLow:ob.low,entryHigh:ob.high,entry,stop,
      targets:[1,2,3].map(n=>entry+sign*n*risk),swing:event.level,
      imbalance:{time:fvg.time,firstTime:fvg.firstTime,direction:fvg.direction,low:fvg.low,high:fvg.high,
        status:fvg.status,filledAt:fvg.filledAt},
      features:[1,Math.min(3,Math.abs(bars[event.index].close-bars[event.index].open)/atr),
        Math.min(3,(ob.high-ob.low)/atr),Math.min(3,Math.abs(bars[event.index].close-event.level)/atr),
        Math.min(3,Math.abs(last.close-entry)/atr),market==='futures'?1:0,side==='SHORT'?1:0,
        Math.log(TF_MINUTES[timeframe]/5)/Math.log(48)],
      state:'WAITING',hitTargets:0,events:[{type:'CREATED',at:last.end,price:last.close}],
      expiresAt:last.end+12*TF_MINUTES[timeframe]*60000 };
  }
}

export function detectV3(bars,market,symbol,timeframe,parentBars,options={}) {
  if(!Array.isArray(bars) || bars.length<35 || !['spot','futures'].includes(market) || !PARENT_TF[timeframe] ||
     bars.some((c,i)=>!valid(c) || i>0 && c.time<=bars[i-1].time))return null;
  const structure=MarketStructureEngine.analyze(bars);
  const last=bars.length-1, event=structure.breaks.at(-1);
  if(!event || (event.index!==last && !(event.type==='CHoCH' && event.index===last-1)))return null;
  if(event.type==='CHoCH' && !(event.index===last-1 &&
      (event.direction==='up'?bars[last].close>event.level:bars[last].close<event.level)))return null;
  if(market==='spot' && event.direction==='down')return null;
  const atr=previousAtr(bars,event.index);
  if(!atr || Math.abs(bars[event.index].close-bars[event.index].open)<1.2*atr)return null;
  if(event.direction==='up'?bars[event.index].close<=bars[event.index].open:bars[event.index].close>=bars[event.index].open)return null;
  const zones=ZonesDetector.scan(bars,structure);
  const ob=zones.ob.find(z=>z.originEventId===event.id && z.status==='active');
  const fvg=zones.fvg.findLast(z=>z.originIndex>=event.index-3 && z.originIndex<=event.index &&
      z.direction===event.direction && z.status==='active');
  if(!ob || !fvg)return null;
  if (options.requireHtf !== false) {
    const htf=ContextRegimeFilter.evaluate(event,bars,parentBars,timeframe);
    if(!htf.allowed)return null;
  }
  return ExecutionRiskManager.create({bars,market,symbol,timeframe,event,ob,fvg});
}

/**
 * Run one closed-candle base candidate through three immutable nested gates.
 * These are parallel *research* signal streams with unique ids and histories.
 * The pre-existing SMC v3 stream is left untouched.
 */
export function detectRuleVariants(bars,market,symbol,timeframe,parentBars,bookSnapshot=null,observedAt=Date.now()) {
  const candidate=detectV3(bars,market,symbol,timeframe,parentBars,{requireHtf:false});
  if(!candidate)return [];
  const event=candidate.structureEvent;
  const depth=depthGate(bookSnapshot,{market,symbol,side:candidate.side,
    closedAt:candidate.detectedAt,observedAt});
  const htf=ContextRegimeFilter.evaluate(event,bars,parentBars,timeframe);
  return RULES.filter(rule=>(!rule.liquidity || depth.allowed) && (!rule.htf || htf.allowed))
    .map(rule=>{
      const observed=rule.liquidity ? bookSnapshot.capturedAt : candidate.detectedAt;
      return {...candidate,id:candidate.id+':'+rule.key,ruleVersion:rule.key,
        detectedAt:observed,events:[{type:'CREATED',at:observed,price:bars.at(-1).close}],
        expiresAt:observed+12*TF_MINUTES[timeframe]*60000,
        ruleSnapshot:{...rule,book:rule.liquidity?{...bookSnapshot}:null,
          htfRegime:htf.regime||null,evaluatedAt:observed}
      };
    });
}

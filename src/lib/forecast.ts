import type { AISignalResponse, PriceSnapshot, WhaleRadarData, SentimentData } from '../types/crypto';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const round=(x:number)=>Number(x.toFixed(x>=1000?2:x>=1?4:7));
const clipped=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x));
export function forecast(snapshot:PriceSnapshot, whale:WhaleRadarData|null, sentiment:SentimentData|null):AISignalResponse {
  const price=snapshot.exchanges.binance.price||snapshot.exchanges.bybit.price;
  const candles=snapshot.klinesSummary?.candles||[];
  if(!Number.isFinite(price)||price<=0||candles.length<12) throw new Error('Недостаточно настоящих рыночных данных для прогноза');
  if(Date.now()-snapshot.timestamp>2*60*60*1000) throw new Error('Данные устарели: обновите цены и свечи');
  const recent=candles.slice(-12);
  const change=snapshot.exchanges.binance.price>0?snapshot.exchanges.binance.change24h:snapshot.exchanges.bybit.change24h;
  const momentum=(recent.at(-1)!.close/recent[0].open-1)*100;
  const structure=snapshot.smc.marketStructure;
  const bullish=structure.startsWith('BULLISH');
  const bids=[...snapshot.exchanges.binance.orderBook.topBids,...snapshot.exchanges.bybit.orderBook.topBids];
  const asks=[...snapshot.exchanges.binance.orderBook.topAsks,...snapshot.exchanges.bybit.orderBook.topAsks];
  const bidUsd=bids.reduce((s,x)=>s+x.price*x.amount,0);
  const askUsd=asks.reduce((s,x)=>s+x.price*x.amount,0);
  const imbalance=(bidUsd+askUsd)>0?(bidUsd-askUsd)/(bidUsd+askUsd):0;
  const hasBook=(bidUsd+askUsd)>0;
  const fng=sentiment?.fearAndGreedAvailable?sentiment.fearAndGreed.value:null;
  const factors=[{label:'Структура H1',value:bullish?1:-1,weight:2},{label:'Движение 12h',value:Math.sign(momentum),weight:2},{label:'Движение 24h',value:Math.sign(change),weight:1},{label:'Заявки стакана',value:hasBook?Math.sign(imbalance):0,weight:1}];
  const weighted=factors.reduce((s,x)=>s+x.value*x.weight,0);
  const direction:'LONG'|'SHORT'|'WAIT'=Math.abs(weighted)<2?'WAIT':weighted>0?'LONG':'SHORT';
  const isLong=direction==='LONG'||(direction==='WAIT'&&weighted>=0);
  const obs=snapshot.smc.orderBlocks.filter(o=>o.type===(isLong?'bullish':'bearish')&&!o.mitigated);
  const possible=obs.length?obs:[...snapshot.smc.orderBlocks.filter(o=>o.type===(isLong?'bullish':'bearish'))];
  const chosen=possible.sort((a,b)=>Math.abs(a.levelHigh-price)-Math.abs(b.levelHigh-price))[0];
  const support=[...snapshot.smc.supportLevels].sort((a,b)=>b-a)[0];
  const resistance=[...snapshot.smc.resistanceLevels].sort((a,b)=>a-b)[0];
  const observedLow=Math.min(...recent.map(x=>x.low));
  const observedHigh=Math.max(...recent.map(x=>x.high));
  // Entry is an observed SMC OB boundary, otherwise nearby swing level or current market price.
  let entry=isLong?(chosen?.levelHigh??support??price):(chosen?.levelLow??resistance??price);
  if(!Number.isFinite(entry)||entry<=0) entry=price;
  let stop=isLong?(chosen?.levelLow??support??observedLow):(chosen?.levelHigh??resistance??observedHigh);
  if(isLong&&stop>=entry) stop=Math.min(observedLow,entry*(1-0.002));
  if(!isLong&&stop<=entry) stop=Math.max(observedHigh,entry*(1+0.002));
  stop=isLong?stop*(1-0.001):stop*(1+0.001);
  const risk=Math.abs(entry-stop);
  if(!Number.isFinite(risk)||risk<=0) throw new Error('Не удалось оценить структурный риск');
  const sign=isLong?1:-1;
  const tp1=entry+sign*risk*1.5, tp2=entry+sign*risk*2.8, tp3=entry+sign*risk*4.2;
  if(Math.min(tp1,tp2,tp3)<=0) throw new Error('Уровни цели вышли за допустимые цены');
  const agree=factors.filter(x=>x.value !== 0&&x.value===sign).reduce((s,x)=>s+x.weight,0);
  const conflict=factors.filter(x=>x.value !== 0&&x.value!==sign).reduce((s,x)=>s+x.weight,0);
  const strength=clipped(40+agree*7-conflict*5,20,90);
  const hasOnchain=whale?.onchainAvailable===true,hasSocial=sentiment?.socialDataAvailable===true;
  const fromOB=Boolean(chosen);
  const algoName='Локальный прогноз (4 аналитических роли)';
  const findingsSMC=[`${structure} · 12h импульс ${momentum.toFixed(2)}%`, fromOB?`Ордер-блок ${chosen!.label} ${round(chosen!.levelLow)}–${round(chosen!.levelHigh)}`:'Вблизи цены нет подтверждённого OB; использован наблюдаемый swing/рыночная цена'];
  const findingsWhale=[hasBook?`Лимитный BID/ASK дисбаланс: ${(imbalance*100).toFixed(1)}%`:'Стакан недоступен',hasOnchain?'Ончейн-источник подключён':'Ончейн-переводы/ETF не подтверждены и не учитываются'];
  const findingsSentiment=[fng!==null?`Рыночный Fear & Greed: ${fng}`:'Fear & Greed недоступен',hasSocial?'Социальные данные подтверждены':'X/Reddit/Telegram не подключены; социальный балл в консенсусе не участвует'];
  const scoreSMC=clipped(40+Math.abs(momentum)*3+(fromOB?12:0),20,85);
  const scoreWhale=hasBook?clipped(50+Math.abs(imbalance)*35,25,75):0;
  const scoreSentiment=hasSocial?50:0;
  return {
    signal:{direction,entryPrice:round(entry),entryZone:`${round(entry*0.998)}–${round(entry*1.002)} USDT`,stopLoss:round(stop),stopLossPercent:round(risk/entry*100),takeProfit1:round(tp1),takeProfit1Percent:round(Math.abs(tp1-entry)/entry*100),takeProfit2:round(tp2),takeProfit2Percent:round(Math.abs(tp2-entry)/entry*100),takeProfit3:round(tp3),takeProfit3Percent:round(Math.abs(tp3-entry)/entry*100),riskRewardRatio:'1:2.8',winProbability:direction==='WAIT'?0:strength,riskLevel:direction==='WAIT'?'Повышенный':'Умеренный',orderBlockTarget:fromOB?chosen!.label:'Нет подтверждённого OB рядом с ценой',validationRationale:direction==='WAIT'?'Агенты не согласны по направлению. Уровни показаны только как сценарий, не сигнал на вход.':`Локальный ${algoName}: ${factors.map(x=>`${x.label}: ${x.value>0?'↑':x.value<0?'↓':'—'}`).join('; ')}. Балл силы — эвристика, не измеренная вероятность выигрыша.`},
    agents:{smcAgent:{name:'SMC & Order Block Specialist',verdict:bullish?'Смещение структуры вверх':'Смещение структуры вниз',keyFindings:findingsSMC,score:round(scoreSMC)},whaleAgent:{name:'Whale Flow Detective',verdict:hasBook?'Анализ видимых заявок, не переводов кошельков':'Нет данных о заявках',keyFindings:findingsWhale,score:round(scoreWhale)},sentimentAgent:{name:'Social ML Sentiment Analyst',verdict:hasSocial?'Социальный источник доступен':'Данных соцсетей нет; учитывается только Fear & Greed как фон',keyFindings:findingsSentiment,score:round(scoreSentiment)},chiefArbiter:{name:'Chief Signal Architect',verdict:direction==='WAIT'?'WAIT: конфликт сигналов':`Сценарий ${direction}, совпадение технических признаков: ${agree} из 6 весов`,executionPlan:direction==='WAIT'?'Ожидать нового закрытия 1H свечи и обновить прогноз.':'Наблюдать за достижением ценовой зоны, сверять со свежим стаканом. TP1–TP3 и SL являются модельными уровнями, не распоряжением на сделку.',consensusConfidence:direction==='WAIT'?0:strength}},
  };
}

// Optional direct Gemini API: never needed for app startup or local forecasts.
// API key is supplied for this request by the user and NEVER stored in the APK or localStorage.
export async function optionalGeminiForecast(key:string, snapshot:PriceSnapshot, local:AISignalResponse):Promise<AISignalResponse> {
  if(!key.trim()) return local;
  const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
  const prompt=`Ты анализируешь BTC/альткоины на основе ТОЛЬКО фактических исходных данных. Не изобретай ETF, кошельки, X/Reddit. Текущий снимок: ${JSON.stringify({symbol:snapshot.symbol,exchanges:snapshot.exchanges,smc:snapshot.smc,candles:snapshot.klinesSummary?.candles.slice(-24)})}. Локальный расчёт: ${JSON.stringify(local)}. Верни JSON точно такого же формата как локальный расчёт, с signal и agents (smcAgent,whaleAgent,sentimentAgent,chiefArbiter). По возможности сохрани уровни входа, SL, TP и валидируй их; winProbability должен быть баллом уверенности 0..100, а НЕ предсказанной вероятностью успеха. Если данных недостаточно — WAIT. Только JSON.`;
  const body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.2}};
  let json:any;
  if(Capacitor.isNativePlatform()){
    const r=await CapacitorHttp.post({url,headers:{'Content-Type':'application/json','x-goog-api-key':key.trim()},data:body,connectTimeout:12000,readTimeout:30000});
    if(r.status<200||r.status>=300) throw new Error(`Gemini HTTP ${r.status}`);
    json=typeof r.data==='string'?JSON.parse(r.data):r.data;
  } else {
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key.trim()},body:JSON.stringify(body)});
    if(!r.ok)throw new Error(`Gemini HTTP ${r.status}`);
    json=await r.json();
  }
  const text=json?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('')||'';
  const model=JSON.parse(text) as AISignalResponse;
  if(!model?.signal?.direction||!model?.agents?.chiefArbiter||!['LONG','SHORT','WAIT'].includes(model.signal.direction))throw new Error('Неожиданный формат прогноза Gemini');
  const {entryPrice,stopLoss,takeProfit1,takeProfit2,takeProfit3}=model.signal;
  if(![entryPrice,stopLoss,takeProfit1,takeProfit2,takeProfit3].every(x=>Number.isFinite(x)&&x>0))throw new Error('Неверные уровни цены от Gemini');
  if(model.signal.direction==='LONG'&&!(stopLoss<entryPrice&&entryPrice<takeProfit1&&takeProfit1<takeProfit2&&takeProfit2<takeProfit3))throw new Error('Противоречивые уровни LONG от Gemini');
  if(model.signal.direction==='SHORT'&&!(stopLoss>entryPrice&&entryPrice>takeProfit1&&takeProfit1>takeProfit2&&takeProfit2>takeProfit3))throw new Error('Противоречивые уровни SHORT от Gemini');
  return model;
}

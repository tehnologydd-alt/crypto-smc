/** Optional Gemini extension. The Android app itself and local forecasts do not need Google AI Studio. */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { AISignalResponse, PriceSnapshot } from '../types/crypto';

const API = 'https://generativelanguage.googleapis.com/v1beta';
type Direction = 'LONG' | 'SHORT' | 'WAIT';
type ApiResult = { status: number; data: any };

function jsonData(value: any): any {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return { error: { message: value.slice(0, 300) } }; }
  }
  return value ?? {};
}
function safeMessage(message: string, secret: string): string {
  return String(message).replaceAll(secret, '[скрыт]').replace(/(key=)[^\s&]+/gi, '$1[скрыт]').slice(0, 350);
}
function apiError(status: number, data: any, key: string): Error {
  const reason = safeMessage(data?.error?.message || data?.message || '', key);
  const friendly: Record<number,string> = {
    400:'Gemini отклонил запрос. Возможны ограничения проекта, региона или параметров.',
    401:'Ключ Gemini не принят. Проверьте, что это действующий API-ключ.',
    403:'Доступ к Gemini запрещён для этого ключа или проекта. Проверьте разрешения и доступность API.',
    404:'Выбранная модель Gemini недоступна для этого ключа или версии API.',
    429:'Лимит Gemini исчерпан. Проверьте квоты проекта; локальный прогноз остаётся доступен.',
    500:'Внутренняя ошибка Gemini. Попробуйте позже.',
    503:'Сервис Gemini временно перегружен. Попробуйте позже.',
  };
  return new Error('HTTP '+status+': '+(friendly[status] || 'Ошибка Gemini.')+(reason?' Ответ API: '+reason:''));
}
async function requestGemini(method:'GET'|'POST',endpoint:string,key:string,payload?:unknown):Promise<any> {
  const authKey=key.trim();
  if(!authKey)throw new Error('Введите API-ключ Gemini.');
  const url=API+'/'+endpoint;
  let response:ApiResult;
  try {
    if(Capacitor.isNativePlatform()){
      const headers:Record<string,string>={'x-goog-api-key':authKey};
      if(method==='POST')headers['Content-Type']='application/json';
      const opts={url,headers,connectTimeout:15000,readTimeout:60000};
      response=method==='GET'?await CapacitorHttp.get(opts):await CapacitorHttp.post({...opts,data:payload});
    }else{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),60000);
      try{
        const res=await fetch(url,{method,signal:controller.signal,
          headers:{'x-goog-api-key':authKey,...(method==='POST'?{'Content-Type':'application/json'}:{})},
          ...(method==='POST'?{body:JSON.stringify(payload)}:{})});
        response={status:res.status,data:await res.json()};
      }finally{clearTimeout(timer);}
    }
  }catch(e){
    const msg=e instanceof Error?e.message:String(e);
    throw new Error('Нет связи с Gemini API: '+safeMessage(msg,authKey)+'. Проверьте интернет и доступ к generativelanguage.googleapis.com.');
  }
  const data=jsonData(response.data);
  if(response.status<200||response.status>=300)throw apiError(response.status,data,authKey);
  return data;
}
function chooseModel(models:any[]):string{
  const names=models.filter(m=>Array.isArray(m?.supportedGenerationMethods)&&m.supportedGenerationMethods.includes('generateContent'))
    .map(m=>String(m.name||'').replace(/^models\//,''))
    .filter(n=>/^gemini-/.test(n)&&/flash/.test(n));
  const preferred=['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-3-flash','gemini-3.8-flash'];
  return preferred.find(n=>names.includes(n))||names.find(n=>!/exp|preview/i.test(n))||names[0]||'';
}
/** Validate the key with ListModels; this call generates no text and uses no forecast tokens. */
export async function checkGeminiKey(key:string):Promise<string>{
  const data=await requestGemini('GET','models?pageSize=100',key);
  const name=chooseModel(Array.isArray(data.models)?data.models:[]);
  if(!name)throw new Error('Ключ принят, но доступная Gemini Flash-модель для generateContent не обнаружена.');
  return name;
}
function parseAssessment(data:any):{direction:Direction;rationale:string;smc:string;whale:string;sentiment:string}{
  const parts=data?.candidates?.[0]?.content?.parts;
  const output=Array.isArray(parts)?parts.map((p:any)=>p?.text||'').join('').trim():'';
  if(!output)throw new Error('Gemini не вернул текст анализа ('+String(data?.candidates?.[0]?.finishReason||data?.promptFeedback?.blockReason||'пустой ответ')+').');
  let value:any;
  try{value=JSON.parse(output.replace(/^`(?:json)?\s*/i,'').replace(/\s*`$/,''));}
  catch{throw new Error('Gemini вернул некорректный формат JSON; локальный прогноз сохранён.');}
  if(!['LONG','SHORT','WAIT'].includes(value?.direction))throw new Error('Gemini не указал направление LONG/SHORT/WAIT.');
  const clip=(x:any)=>typeof x==='string'?x.trim().slice(0,500):'';
  return {direction:value.direction,rationale:clip(value.rationale)||'Без пояснения.',smc:clip(value.smc),whale:clip(value.whale),sentiment:clip(value.sentiment)};
}
export async function optionalGeminiForecast(key:string,snapshot:PriceSnapshot,local:AISignalResponse,selectedModel?:string):Promise<{report:AISignalResponse;model:string}>{
  const model=selectedModel||await checkGeminiKey(key);
  if(!/^gemini-[a-z0-9.\-]+$/i.test(model))throw new Error('Некорректное имя модели Gemini.');
  const price=snapshot.exchanges.binance.price||snapshot.exchanges.bybit.price;
  const facts={
    symbol:snapshot.symbol,price,capturedAt:snapshot.timestamp,
    change24h:snapshot.exchanges.binance.price>0?snapshot.exchanges.binance.change24h:snapshot.exchanges.bybit.change24h,
    structure:snapshot.smc.marketStructure,
    orderBlocks:snapshot.smc.orderBlocks.slice(0,5).map(o=>({side:o.type,low:o.levelLow,high:o.levelHigh,mitigated:o.mitigated})),
    support:snapshot.smc.supportLevels.slice(0,4),resistance:snapshot.smc.resistanceLevels.slice(0,4),fvg:snapshot.smc.fvg,
    confirmedH1Candles:(snapshot.klinesSummary?.candles||[]).slice(-24).map(c=>[c.time,c.open,c.high,c.low,c.close,c.volume]),
    localScenario:{direction:local.signal.direction,entry:local.signal.entryPrice,sl:local.signal.stopLoss,
      tp:[local.signal.takeProfit1,local.signal.takeProfit2,local.signal.takeProfit3]},
    unavailableSources:['verified onchain transfers','ETF inflows','social media ML'],
  };
  const prompt='Проанализируй рыночные данные: это независимое мнение к локальному прогнозу. Отвечай по-русски. Только факты, без выдуманных новостей, ETF, ончейн и соцсетей. Не обещай прибыль. Дай JSON с полями direction (LONG/SHORT/WAIT), rationale, smc, whale, sentiment. Данные: '+JSON.stringify(facts);
  const payload={contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.2,maxOutputTokens:2048}};
  const raw=await requestGemini('POST','models/'+model+':generateContent',key,payload);
  const result=parseAssessment(raw);
  const disagree=result.direction!==local.signal.direction;
  const direction:Direction=disagree?'WAIT':result.direction;
  const report:AISignalResponse={
    ...local,
    signal:{...local.signal,direction,...(disagree?{winProbability:0,riskLevel:'Повышенный' as const}:{}),
      validationRationale:'Gemini ('+model+'): '+result.rationale+'. Локальный прогноз: '+local.signal.direction+'. '+(disagree?'Мнения расходятся: Gemini '+result.direction+'. WAIT — уровни только для сравнения.':'Направления совпадают; уровни основаны на локальной структуре.')},
    agents:{
      smcAgent:{...local.agents.smcAgent,keyFindings:[...local.agents.smcAgent.keyFindings,...(result.smc?['Gemini: '+result.smc]:[])]},
      whaleAgent:{...local.agents.whaleAgent,keyFindings:[...local.agents.whaleAgent.keyFindings,...(result.whale?['Gemini: '+result.whale]:[])]},
      sentimentAgent:{...local.agents.sentimentAgent,keyFindings:[...local.agents.sentimentAgent.keyFindings,...(result.sentiment?['Gemini: '+result.sentiment]:[])]},
      chiefArbiter:{...local.agents.chiefArbiter,verdict:disagree?'WAIT: Gemini '+result.direction+' / локальный '+local.signal.direction:'Gemini и локальный: '+direction,
        executionPlan:'Gemini ('+model+'): '+result.rationale+'. '+local.agents.chiefArbiter.executionPlan,
        consensusConfidence:disagree?0:local.agents.chiefArbiter.consensusConfidence},
    },
  };
  return {report,model};
}

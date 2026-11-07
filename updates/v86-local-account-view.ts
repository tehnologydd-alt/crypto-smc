/** APEX 8.6 — isolated, READ-ONLY local account snapshot inspector.
 * Accepts ONLY user-prepared, anonymized balance snapshots (no API keys,
 * bearer tokens, credentials, exchange account IDs, signed endpoints).
 * NO authenticated exchange account connection or order execution.
 * This does not alter DEMO portfolios, cash books or position history.
 */
export type ReviewVenue='binance'|'bybit';
export type ViewBalance={asset:string;available:number;locked:number;total:number};
export type ViewSnapshot={
 venue:ReviewVenue;asOf:number;balances:ViewBalance[];
 importedAt:number;origin:'local-anonymized-snapshot';strictReadOnly:true;
};
export const MAX_SNAPSHOT_TEXT=5000,MAX_ASSETS=12;
const safeCount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9;
const safeSymbol=(v:unknown):v is string=>
 typeof v==='string'&&/^[A-Z0-9]{2,12}$/.test(v);
const safeObj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
export function inspectAccountSnapshot(raw:string,now=Date.now()):ViewSnapshot{
 if(typeof raw!=='string'||!raw.trim()||raw.length>MAX_SNAPSHOT_TEXT)
  throw Error('Нужен короткий обезличенный JSON-снимок (до 5000 символов).');
 let input:unknown;
 try{input=JSON.parse(raw);}catch{throw Error('Не удалось прочитать JSON. Проверь структуру снимка.');}
 if(!safeObj(input))throw Error('Снимок должен быть объектом JSON.');
 const keys=Object.keys(input);
 if(keys.length!==3||keys.some(x=>!['venue','asOf','balances'].includes(x)))
  throw Error('Допустимые поля: venue, asOf и balances. Личные поля и ключи не принимаются.');
 if(input.venue!=='binance'&&input.venue!=='bybit')
  throw Error('Допустимы только отдельные снимки Binance или Bybit.');
 if(!Number.isSafeInteger(input.asOf)||Number(input.asOf)<=0||
  Number(input.asOf)>now+60_000||Number(input.asOf)<now-90*86_400_000)
  throw Error('Укажи дату снимка asOf в миллисекундах (за последние 90 дней).');
 if(!Array.isArray(input.balances)||input.balances.length<1||input.balances.length>MAX_ASSETS)
  throw Error('Укажи от 1 до 12 остатков активов без идентификаторов счёта.');
 const used=new Set<string>(),balances:ViewBalance[]=[];
 for(const item of input.balances){
  if(!safeObj(item)||Object.keys(item).length!==3||
   Object.keys(item).some(x=>!['asset','available','locked'].includes(x))||
   !safeSymbol(item.asset)||!safeCount(item.available)||!safeCount(item.locked)||
   used.has(item.asset)||Number(item.available)+Number(item.locked)>1e9)
   throw Error('Неверный остаток. Разрешены только asset, available и locked, без ключей и личных сведений.');
  used.add(item.asset);
  balances.push({asset:item.asset,available:Number(item.available),
   locked:Number(item.locked),
   total:Number((Number(item.available)+Number(item.locked)).toFixed(8))});
 }
 return {venue:input.venue,asOf:Number(input.asOf),balances,
  importedAt:now,origin:'local-anonymized-snapshot',strictReadOnly:true};
}
export function sampleAccountSnapshot(now=Date.now()):string{
 return JSON.stringify({
  venue:'binance',asOf:now,balances:[
   {asset:'USDT',available:100,locked:20},
   {asset:'BTC',available:0.002,locked:0}
  ]
 },null,2);
}
export function sampleStatus(s:ViewSnapshot|null,now=Date.now()):
 'EMPTY'|'STALE'|'RECENT'{
 if(!s)return 'EMPTY';
 return now-s.asOf>15*60_000?'STALE':'RECENT';
}

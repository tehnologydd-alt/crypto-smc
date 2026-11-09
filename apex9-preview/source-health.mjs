/**
 * Present only observed source states, never turn "adapter installed" into
 * "API connected". Time and freshness come from actual budget results.
 */
const LABELS=Object.freeze({
 OK:'Данные получены',EMPTY:'Ответ получен · данных нет',
 STALE:'Только локальный архив',OFFLINE:'Не удалось получить данные',
 RATE_LIMITED:'Сервис ответил 429',UNSUPPORTED:'Нет сопоставимого актива',
 INVALID:'Ответ не прошёл проверку',WAIT_INTERVAL:'Пауза локального лимита',
 DAILY_LIMIT:'Локальный дневной лимит',MONTHLY_LIMIT:'Локальный месячный лимит',
 STORAGE_UNAVAILABLE:'Локальный учёт недоступен',
 CLOCK_ERROR:'Время устройства требует проверки'
});
const atLabel=at=>Number.isSafeInteger(at)&&at>0?
 new Date(at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit'}):null;
const sanitized=s=>typeof s==='string'?s.slice(0,85):null;
export function sourceHealth(result,{checkedAt=Date.now(),
 asset=null}={}){
 if(!result)return {state:'NOT_QUERIED',usable:false,
  message:'Запрос ещё не выполнялся',checkedAt:null};
 const raw=typeof result.state==='string'?result.state:'INVALID';
 const q=result.quota;
 const actual=result.sourceState||raw;
 const cached=result.source==='CACHE'||result.source==='STALE_CACHE';
 const observedAt=Number.isSafeInteger(result?.data?.observedAt)?
  result.data.observedAt:null;
 const fetchedAt=Number.isSafeInteger(result.fetchedAt)?result.fetchedAt:null;
 const isCurrent=['OK','EMPTY'].includes(raw);
 const title=LABELS[raw]||'Ответ не распознан';
 const explain=raw==='STALE'&&LABELS[actual]?' · причина: '+LABELS[actual]:
  raw==='OK'?(cached?' · сохранённый ответ':' · проверенный формат API'):
  raw==='EMPTY'?(cached?' · сохранённый пустой ответ':' · формат ответа проверен'):'';
 const parts=[title+explain];
 if(asset)parts.push('пара '+asset);
 if(fetchedAt)parts.push('загружено '+atLabel(fetchedAt));
 if(observedAt)parts.push('наблюдение '+atLabel(observedAt));
 if(q?.nextAt>checkedAt&&['WAIT_INTERVAL','STALE','RATE_LIMITED'].includes(raw))
  parts.push('повтор не раньше '+atLabel(q.nextAt));
 if(!['OK','EMPTY','STALE','UNSUPPORTED'].includes(raw)&&result.reason)
  parts.push('детали: '+sanitized(result.reason));
 return {state:raw,usable:isCurrent,checkedAt,
  fetchedAt,observedAt,cached,
  sourceState:actual,message:parts.join(' · ')};
}

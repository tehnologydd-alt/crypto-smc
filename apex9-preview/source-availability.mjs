/**
 * Observable source availability on a user-selected favorite.
 * Local Room history != current API response and token != native network.
 * Never equate "no samples" with "pair delisted" without a provider error.
 */
export const DEPTH_VENUES=Object.freeze(['binance','bybit']);
export function describeDepthAvailability(venue,source,samples=0){
 if(!DEPTH_VENUES.includes(venue)||!Number.isSafeInteger(samples)||samples<0)
  return {state:'INVALID',label:'Ошибка данных',reason:'Некорректный источник'};
 const status=source?.state;
 const detail=typeof source?.error==='string'?
  source.error.replace(/[\x00-\x1f]/g,' ').slice(0,110):'';
 if(status==='OK'){
  return samples?
   {state:'OBSERVED',label:'Есть история',reason:'Источник ответил; история сохраняется локально'}:
   {state:'SAVE_PENDING',label:'Нет сохранённых снимков',
    reason:'Источник ответил, но локальная история ещё не появилась. Проверьте сохранение в Room.'};
 }
 if(status==='NOT_LISTED')
  return {state:'NOT_LISTED',label:'Нет Spot-пары',
   reason:'Биржа сообщила, что Spot-пара недоступна. '+
    'Фьючерсный рынок не подменяем. '+
    (detail?'Ответ: '+detail:'')};
 if(status==='RATE_LIMITED')
  return {state:'RATE_LIMITED',label:'Лимит API',
   reason:'Источник временно ограничил число запросов.'};
 if(status==='ACCESS_DENIED')
  return {state:'ACCESS_DENIED',label:'Доступ ограничен',
   reason:'API отклонил обращение (регион или политика доступа).'};
 if(status==='STALE')
  return {state:'STALE',label:'Устаревший ответ',
   reason:'Биржа вернула устаревший снимок стакана. '+
    (detail?'Причина: '+detail:'')};
 if(status==='CLOCK_SKEW')
  return {state:'CLOCK_SKEW',label:'Проверить часы телефона',
   reason:'Время Android и время биржи расходятся. '+
    'Проверьте автоматическую дату и время. '+detail};
 if(status==='INVALID')
  return {state:'INVALID',label:'Ответ не прошёл проверку',
   reason:'Проверка данных стакана: '+(detail||
    'неверная структура, цены или время ответа.')};
 if(status==='OFFLINE')
  return {state:'OFFLINE',label:'Ошибка источника',
   reason:detail?'Не получен ответ: '+detail:'Нет подтверждённого ответа API.'};
 return {state:'NOT_CHECKED',label:samples?'История без свежей проверки':'Источник не проверен',
  reason:samples?'Есть старые записи; свежий ответ API ещё не подтверждён.':
   'Ещё не было успешной проверки этой пары на данной бирже.'};
}

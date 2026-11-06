/** APEX 7.3: offline, deterministic, evidence-bound Research Mentor for DEMO.
 * No LLM/API call; never claims to be sentient, to learn, or to trade.
 * It only explains structured research reports that already exist in the app.
 * Every numeric statement is derived from the supplied same-protocol snapshot.
 */
import type {StudyProtocol,StudyReport} from './v66-forward-study';
import type {StudyDiagnostics} from './v67-study-diagnostics';
import type {DiscoveryReport} from './v70-hypothesis-discovery';
import type {V71Report} from './v71-forward-validation';
import type {ShadowReport} from './v72-shadow-lab';

export type MentorTopic='overview'|'questions'|'contradictions'|'missing'|'hypotheses'|'experiments'|'unknown'|'no-trading-advice';
export type MentorContext={
 protocol:StudyProtocol|null;study:StudyReport;diagnostics:StudyDiagnostics;
 discovery:DiscoveryReport;verification:V71Report;shadows:ShadowReport;
};
export type MentorReply={topic:MentorTopic;title:string;answer:string;facts:string[];
 nextQuestion:string;notice:string;asOf:number};
export const MENTOR_SUGGESTIONS=[
 'Что сейчас известно?',
 'Есть ли противоречия?',
 'Почему мало данных?',
 'Что с гипотезами?',
 'Как идут эксперименты?',
 'Что исследовать дальше?'
] as const;
export const MENTOR_NOTICE='Это локальный помощник по исследовательским отчётам, а не подключённая языковая модель. Он не торгует, не предсказывает цену, не меняет гипотезы и не доказывает доходность.';
const integer=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
const number=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
const issue=(d:StudyDiagnostics)=>{
 const missing=d.excludedMissingContext+d.excludedModelMismatch+d.dataGaps+d.unscoredClosed;
 return {missing,waiting:d.active,expired:d.expiredOrCancelled,prior:d.excludedBeforeStart};
};
function topicOf(question:string):MentorTopic{
 const q=String(question||'').trim().toLowerCase().slice(0,320);
 if(!q)return 'unknown';
 // Guard against live-order, speculative or investment advice. The mentor is
 // not an execution router and must not even describe a "buy/sell now" tactic.
 if(/(купить|продать|покупать|продавать|войти в сделк|открыть ордер|реальн.{0,12}ордер|заработать|плечо|какой актив|где войти|тейк постав|стоп постав)/i.test(q))
  return 'no-trading-advice';
 if(/(противореч|ошиб|не совпал|опроверг|разошл|провал|расхожд)/i.test(q))return 'contradictions';
 if(/(эксперимент|верси|лаборатор|фильтр|сравнени.{0,10}модел)/i.test(q))return 'experiments';
 if(/(гипотез|предположен|закреплен|зафиксир)/i.test(q))return 'hypotheses';
 if(/(данн|недостат|исключ|почему мало|пропуск|разрыв|качество|свеч|ожидан)/i.test(q))return 'missing';
 if(/(дальше|следующ|проверить|исследовать|вопрос|план|начать)/i.test(q))return 'questions';
 if(/(итог|статист|извест|состояни|прогресс|отчет|отчёт|сколько|сейчас|объясн|обзор)/i.test(q))return 'overview';
 return 'unknown';
}
function safeContext(c:MentorContext):boolean{
 const p=c.protocol;
 return !!p&&c.study.startedAt===p.startedAt&&c.study.modelVersion===p.modelVersion&&
  c.discovery.protocolId===p.id&&c.verification.protocolId===p.id&&
  c.shadows.protocolId===p.id;
}
function note(have:boolean):string{
 return have?'Вся сводка ограничена виртуальными данными и временем запроса. Совпадения не доказывают закономерность.':
  'Данных для подтверждений недостаточно. Это нормальный результат исследования, а не ошибка приложения.';
}
const name=(s:'binance'|'bybit')=>s==='binance'?'Binance':'Bybit';
const fmt=(v:number|null)=>v===null||!number(v)?'нет оценки':v.toFixed(1)+'%';
const sum=(items:number[])=>items.reduce((a,b)=>a+b,0);
export function explainResearchQuestion(query:string,ctx:MentorContext,now=Date.now()):MentorReply{
 const topic=topicOf(query);
 const base={topic,title:'Исследовательский наставник',facts:[] as string[],
  nextQuestion:'Что исследовать дальше?',notice:MENTOR_NOTICE,asOf:now};
 if(topic==='no-trading-advice')return {...base,topic,title:'Только исследования DEMO',
  answer:'Я объясняю наблюдения и ограничения учебных экспериментов, но не подбираю активы, сделки, уровни или реальные торговые действия. Можем разобрать достоверность данных и противоречия в уже сохранённых виртуальных сценариях.',
  nextQuestion:'Есть ли противоречия?'};
 if(!safeContext(ctx))return {...base,topic,title:'Нет согласованного протокола',
  answer:'Независимая Futures DEMO-проверка ещё не запущена или исследовательские отчёты относятся к разным протоколам. Я не буду объединять несопоставимые данные или придумывать отсутствующую историю.',
  nextQuestion:'Почему мало данных?'};
 const s=ctx.study,d=ctx.diagnostics,g=ctx.discovery,v=ctx.verification,sh=ctx.shadows;
 const missing=issue(d),validated=v.items.filter(i=>i.verdict!=='COLLECTING');
 const opposed=validated.filter(i=>i.verdict==='OPPOSITE_DIRECTION');
 const aligned=validated.filter(i=>i.verdict==='SAME_DIRECTION');
 const neutral=validated.filter(i=>i.verdict==='NO_CLEAR_DIFFERENCE');
 const studying=sh.items.filter(i=>i.status==='COLLECTING');
 const explainable=sh.items.filter(i=>i.status==='DESCRIPTIVE');
 const allReasons=sum([d.dataGaps,d.excludedMissingContext,d.excludedModelMismatch,d.unscoredClosed]);
 if(topic==='overview')return {...base,title:'Состояние независимой проверки',
  answer:'Исследовательский протокол действует '+s.daysObserved+' полных дней. В оценке Futures DEMO пригодных завершённых наблюдений: '+s.reviewable+
   ' из '+s.eligible+' подходящих планов. Из них Binance: '+s.binance.complete+', Bybit: '+s.bybit.complete+
   '. Гипотезы оцениваются отдельно и только на новых данных. '+note(s.reviewable>=30),
  facts:['Источник: APEX 6.6 — независимый протокол и раздельные журналы.',
   'Источник: APEX 7.0 — исследовательских кандидатов '+g.candidates.length+'.',
   'Источник: APEX 7.1 — сохранённых гипотез '+v.hypotheses+'; описательных проверок '+v.ready+'.',
   'Источник: APEX 7.2 — экспериментальных версий '+sh.experiments+'; описательных сводок '+sh.descriptive+'.'],
  nextQuestion:'Есть ли противоречия?'};
 if(topic==='contradictions')return {...base,title:'Противоречия, а не только совпадения',
  answer:validated.length===0?
   'Пока нет гипотез с достаточным количеством новых наблюдений для описательного сравнения. Отсутствие противоречий сейчас не означает, что гипотезы верны.':
   'Из '+validated.length+' описательных проверок будущих данных: совпадение направления — '+aligned.length+
    ', противоположное направление — '+opposed.length+', нет выраженного различия — '+neutral.length+
    '. Важно смотреть на каждое расхождение, не скрывая неудачные проверки.',
  facts:['Источник: APEX 7.1 — противоположные результаты: '+opposed.map(i=>name(i.source)+' / '+i.focusLabel+
    ' ('+i.focus.n+'+'+i.comparison.n+' наблюдений)').join('; ').slice(0,450)+(opposed.length?'':'пока нет оценённых противоречий')+'.',
   'Источник: APEX 7.2 — '+explainable.length+' экспериментов имеют лишь описательную выборку; пересечение исходов делает их зависимыми.',
   'Источник: APEX 6.7 — исключено из-за качества/неоднозначности '+allReasons+' записей.'],
  nextQuestion:'Что исследовать дальше?'};
 if(topic==='missing')return {...base,title:'Почему некоторые наблюдения не засчитываются',
  answer:'Проверка не добавляет старые позиции в новую выборку и не засчитывает неясные исходы. Сейчас ожидаются или ещё открыты '+
    missing.waiting+' планов; пропуски данных — '+d.dataGaps+'; без корректного контекста — '+d.excludedMissingContext+
    '; другая версия модели — '+d.excludedModelMismatch+'; неоднозначные закрытия — '+d.unscoredClosed+
    '; истекли или отменены — '+missing.expired+'.',
  facts:['Источник: APEX 6.7 — до начала исследования исключено '+missing.prior+' записей.',
    'Источник: APEX 7.1 — '+v.collecting+' гипотез ещё накапливают будущее подтверждаемое наблюдение.',
    'Источник: APEX 7.2 — '+studying.length+' экспериментальных сравнений не достигли минимальных порогов.'],
  nextQuestion:'Что сейчас известно?'};
 if(topic==='hypotheses')return {...base,title:'Гипотезы и их независимая проверка',
  answer:'APEX нашёл '+g.candidates.length+' текущих исследовательских кандидатов. Пользователь закрепил '+
   v.hypotheses+' гипотез текущего протокола. Из них '+v.collecting+' ещё собирают новые наблюдения, '+v.ready+
   ' достигли лишь описательного уровня проверки. Нельзя выбирать гипотезу по красивой старой статистике.',
  facts:['Источник: APEX 7.0 — по 4 заранее заданных сравнений на Binance и Bybit; не происходит настройки весов.',
   'Источник: APEX 7.1 — совпадение '+aligned.length+', противоречие '+opposed.length+
    ', нет ясного различия '+neutral.length+' (только среди достигших порога).'],
  nextQuestion:'Есть ли противоречия?'};
 if(topic==='experiments')return {...base,title:'Сравнение учебных версий модели',
  answer:'В лаборатории создано '+sh.experiments+' исследовательских версий. '+studying.length+
   ' ещё накапливают данные; '+explainable.length+' имеют описательные сводки. Это не второй набор сделок: выделенные сценарии являются частью той же общей выборки.',
  facts:['Источник: APEX 7.2 — '+(sh.items.length?sh.items.slice(0,4).map(i=>
    name(i.source)+': '+i.shadowCount+' из '+i.baselineCount+' наблюдений, охват '+fmt(i.coveragePct)).join('; '):
    'пока нет экспериментов')+'.',
   'Внутри одной будущей выборки сравниваются частоты виртуальных защитных выходов, а не независимая доходность.',
   'Ни один исследовательский вариант не влияет на сигналы или DEMO-журнал.'],
  nextQuestion:'Почему мало данных?'};
 if(topic==='questions'){
  let question:string,reason:string;
  if(v.hypotheses===0){question='Есть ли достаточно свежих завершённых наблюдений для первой гипотезы?';reason='Сохранённых гипотез нет — сперва нужна исследовательская выборка.';}
  else if(opposed.length>0){question='Повторяется ли противоположное направление различия в следующих, неиспользованных периодах?';reason='У '+opposed.length+' гипотез новые наблюдения уже разошлись с исходными.';}
  else if(v.collecting>0){question='Накопились ли хотя бы 10 исходов каждой группы минимум за 3 разных дня?';reason=v.collecting+' гипотез ещё не прошли порог описательной проверки.';}
  else if(sh.experiments===0){question='Сохраняется ли разница частоты защитных выходов при заранее зафиксированном учебном фильтре?';reason='Есть закреплённые гипотезы, но ещё нет отдельных исследовательских сравнений.';}
  else {question='Стабильно ли наблюдаемое различие по независимым временным периодам без изменения правил?';reason='Порог описания достигнут, но это ещё не доказательство устойчивости или причинности.';}
  return {...base,title:'Следующий исследовательский вопрос',
   answer:question+' '+reason+' Следующий шаг — собрать новые закрытые DEMO-наблюдения при неизменных правилах и задокументировать как совпадения, так и отрицательные результаты.',
   facts:['Основание: APEX 7.0 — '+v.hypotheses+' сохранённых гипотез.',
    'Основание: APEX 7.1 — '+v.collecting+' на стадии накопления и '+opposed.length+' противоречат исходному предположению.',
    'Основание: APEX 7.2 — '+sh.experiments+' экспериментальных версий.'],
   nextQuestion:'Что сейчас известно?'};
 }
 return {...base,topic:'unknown',title:'Уточни исследовательский вопрос',
  answer:'Я пока поддерживаю вопросы о состоянии проверки, недостатке данных, гипотезах, противоречиях, экспериментальных версиях и дальнейших исследованиях. Произвольный вопрос может выходить за пределы доступных структурированных отчётов — придумывать ответ я не буду.',
  facts:['Доступны только подтверждённые сводки APEX 6.6–7.2 для текущего протокола.'],
  nextQuestion:'Что сейчас известно?'};
}

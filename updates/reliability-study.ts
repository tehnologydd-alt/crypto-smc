/** APEX 3.7: conservative, descriptive evidence quality on prospective paper outcomes.
 * Does not infer causation or change signal generation, ranking or trading.
 */
import type {ContextReport,ContextClass} from './context-study';
export type EvidenceLevel='insufficient'|'exploratory'|'observed';
export type EvidenceRow={
 kind:ContextClass;title:string;completed:number;tp3:number;stop:number;
 rate:number|null;lower:number|null;upper:number|null;level:EvidenceLevel;
};
export type EvidenceReport={
 rows:EvidenceRow[];comparison:'insufficient'|'overlap'|'separated';
 note:string;
};
export function wilson95(success:number,total:number):[number,number]|null{
 if(!Number.isInteger(success)||!Number.isInteger(total)||total<=0||success<0||success>total)return null;
 const z=1.96,p=success/total,d=1+z*z/total;
 const c=(p+z*z/(2*total))/d;
 const h=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
 return [100*Math.max(0,c-h),100*Math.min(1,c+h)];
}
export function evidenceReport(report:ContextReport):EvidenceReport{
 const rows=report.groups.map(g=>{
  const completed=g.tp3+g.stop;
  const valid=Number.isInteger(g.tp3)&&Number.isInteger(g.stop)&&g.tp3>=0&&g.stop>=0;
  const level:EvidenceLevel=!valid||completed<20?'insufficient':completed<50?'exploratory':'observed';
  // Hide rates for small groups to avoid false precision.
  const interval=valid&&completed>=20?wilson95(g.tp3,completed):null;
  return {kind:g.kind,title:g.title,completed, tp3:g.tp3,stop:g.stop,
   rate:interval?100*g.tp3/completed:null,
   lower:interval?interval[0]:null,upper:interval?interval[1]:null,level};
 });
 const a=rows.find(r=>r.kind==='with-pulse'),b=rows.find(r=>r.kind==='against-pulse');
 let comparison:EvidenceReport['comparison']='insufficient';
 if(a&&b&&a.completed>=50&&b.completed>=50&&a.lower!==null&&b.lower!==null&&a.upper!==null&&b.upper!==null){
  comparison=(a.lower>b.upper||b.lower>a.upper)?'separated':'overlap';
 }
 return {rows,comparison,note:'95% интервал Уилсона описывает неопределённость доли TP3 среди TP3/SL. Сравнение доступно от 50 завершений в каждой из двух групп. Различия не доказывают преимущество и не учитывают зависимость сигналов между собой.'};
}

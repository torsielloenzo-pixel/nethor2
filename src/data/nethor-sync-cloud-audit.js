// Audit consultatif des semaines publiées : ne contacte pas le poste Windows,
// n'exécute aucun import et ne contourne pas les droits Supabase.
const dateISO = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x||'')) ? String(x) : null;
const monday = value => {
 const d=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(d.getTime()))return null;
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 return d.toISOString().slice(0,10);
};
const addDays=(value,n)=>{
 const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
};
export function auditPlanningWeeks(rows,history=[],reference=new Date()){
 const weeks=(Array.isArray(rows)?rows:[]).filter(r=>dateISO(r.week_start));
 const byWeek=new Map(weeks.map(r=>[r.week_start,r]));
 const sourceHistory=new Map();
 for(const h of Array.isArray(history)?history:[]){
  if(dateISO(h.week_start))sourceHistory.set(h.week_start,(sourceHistory.get(h.week_start)||0)+1);
 }
 const today=reference.toISOString().slice(0,10);
 const start=addDays(monday(today),-8*7);
 const end=addDays(monday(today),8*7);
 const missing=[],issues=[];
 for(let d=start;d<=end;d=addDays(d,7)){
  if(!byWeek.has(d))missing.push(d);
 }
 for(const w of weeks){
  if(w.imported===false)issues.push({week:w.week_start,message:'Semaine enregistrée mais non marquée importée'});
  if(!w.source_file)issues.push({week:w.week_start,message:'Fichier source non renseigné'});
  if(!w.data||typeof w.data!=='object')issues.push({week:w.week_start,message:'Contenu du planning manquant'});
  if(!sourceHistory.has(w.week_start))issues.push({week:w.week_start,message:'Aucune entrée dans l’historique des imports'});
 }
 return {checkedAt:new Date().toISOString(),total:weeks.length,missing,issues,historyCount:history.length,windowStart:start,windowEnd:end};
}
export async function readPlanningCloudAudit(client){
 const all=[];
 for(let offset=0;offset<10000;offset+=1000){
  const {data,error}=await client.from('planning_weeks').select('week_start,imported,source_file,data').order('week_start',{ascending:true}).range(offset,offset+999);
  if(error)throw Error('Lecture des semaines refusée : '+error.message);
  all.push(...(data||[]));if(!data||data.length<1000)break;
 }
 const history=[];
 for(let offset=0;offset<10000;offset+=1000){
  const {data,error}=await client.from('planning_import_history').select('week_start').order('week_start',{ascending:true}).range(offset,offset+999);
  if(error)throw Error('Lecture de l’historique refusée : '+error.message);
  history.push(...(data||[]));if(!data||data.length<1000)break;
 }
 return auditPlanningWeeks(all,history);
}

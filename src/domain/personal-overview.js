// Accueil personnel Nethor 2 : règles pures alignées sur les codes du planning Nethor 1.
// "g"/"b" = travail, "y" = congé planifié, "r"/"o"/vide = repos.
// Une case jaune ne prouve pas qu'une demande de congé a été approuvée.
export function dateInParis(instant=new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const values=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return values.year+'-'+values.month+'-'+values.day;
}
export function moveDate(day,offset) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day)))throw new TypeError('Date invalide');
  const dt=new Date(day+'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate()+offset);
  return dt.toISOString().slice(0,10);
}
export function mondayFor(day) {
  const weekday=new Date(day+'T12:00:00Z').getUTCDay();
  if(Number.isNaN(weekday))throw new TypeError('Date invalide');
  return moveDate(day,-((weekday+6)%7));
}
function norm(value) {
  return String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
}
export function personalEmployeeIndices(model,profile) {
 if(!Array.isArray(model?.employees)||!profile)return [];
 const names=[...(Array.isArray(profile.planning_aliases)?profile.planning_aliases:[]),profile.planning_name,profile.display_name]
   .map(norm).filter(Boolean);
 const allowed=new Set(names);
 // Les alias sont affectés explicitement par l'administrateur; jamais de correspondance approximative.
 return model.employees.map((e,i)=>allowed.has(norm(e.name))?i:-1).filter(i=>i>=0);
}
export function personalEmployeeIndex(model,profile) {
 const indices=personalEmployeeIndices(model,profile);
 return indices.length===1?indices[0]:-1;
}
export function personalDay(model,profile,date) {
 if(!model?.days?.[date])return {date,kind:'unknown',hours:0,ranges:[]};
 const indices=personalEmployeeIndices(model,profile);
 if(!indices.length)return {date,kind:'unlinked',hours:0,ranges:[]};
 const rows=indices.map(i=>model.days[date]?.cells?.[i]).filter(Array.isArray);
 if(rows.length!==indices.length||!rows.length||!rows[0].length||rows.some(r=>r.length!==rows[0].length))
  return {date,kind:'unknown',hours:0,ranges:[]};
 const cells=rows[0].map((_,i)=>{
  const values=rows.map(r=>r[i]);
  return values.some(c=>c==='g'||c==='b')?'g':values.some(c=>c==='y')?'y':values.some(c=>c==='r'||c==='o')?'r':'';
 });
 const step=Number(model.slotMinutes)||15,start=Number(model.startTime??6)*60;
 const ranges=[];let begin=null;
 for(let i=0;i<=cells.length;i++){
  const working=i<cells.length&&cells[i]==='g';
  if(working&&begin===null)begin=i;
  if(!working&&begin!==null){ranges.push({start:start+begin*step,end:start+i*step});begin=null;}
 }
 if(ranges.length){
  const mins=ranges.reduce((total,r)=>total+r.end-r.start,0);
  return {date,kind:'work',hours:mins/60,ranges};
 }
 if(cells.some(c=>c==='y'))return {date,kind:'leave',hours:0,ranges:[]};
 if(cells.every(c=>!c||c==='r'||c==='o'))return {date,kind:'rest',hours:0,ranges:[]};
 return {date,kind:'unknown',hours:0,ranges:[]};
}
function weekModelByDate(weeks,date) {
  const key=mondayFor(date);
  return weeks.find(w=>String(w?.weekStart||w?.week_start||w?.__planningWeekStart||'')===key)?.model
    ||weeks.find(w=>String(w?.weekStart||w?.week_start||w?.__planningWeekStart||'')===key)?.data
    ||weeks.find(w=>String(w?.weekStart||w?.week_start||w?.__planningWeekStart||'')===key)
    ||null;
}
function daysInRange(weeks,profile,first,count) {
  return Array.from({length:count},(_,i)=>{
    const date=moveDate(first,i);
    return personalDay(weekModelByDate(weeks,date),profile,date);
  });
}
function plannedLeaveFrom(days) {
  const first=days.findIndex(d=>d.kind==='leave');
  if(first<0)return null;
  let end=days[first].date;
  for(let i=first+1;i<days.length;i++){
    if(days[i].date!==moveDate(end,1)||days[i].kind!=='leave')break;
    end=days[i].date;
  }
  return {start:days[first].date,end,status:'planned'};
}
function nextLeave(days,absences,today) {
  const planned=plannedLeaveFrom(days);
  const requests=(Array.isArray(absences)?absences:[])
    .filter(a=>a?.type==='leave'&&['approved','pending'].includes(a.status)&&a.end_date>=today&&a.start_date&&a.end_date)
    .map(a=>({start:a.start_date,end:a.end_date,status:a.status}))
    .sort((a,b)=>a.start.localeCompare(b.start)||(a.status==='approved'?-1:1));
  const requested=requests[0]||null;
  if(!planned)return requested;
  if(!requested)return planned;
  // Un congé inscrit au planning ET présent dans les demandes reprend le statut serveur.
  const covering=requests.find(r=>r.start<=planned.end&&r.end>=planned.start);
  const chosen=covering?{start:covering.start,end:covering.end,status:covering.status}:planned;
  if(requested.start<chosen.start && requested.end<planned.start)return requested;
  return chosen;
}
export function personalOverview(weeks,profile,absences,today,{calendarDays=7,lookaheadDays=84}={}){
  const items=Array.isArray(weeks)?weeks:[];
  const current=daysInRange(items,profile,today,calendarDays);
  const future=daysInRange(items,profile,moveDate(today,1),lookaheadDays);
  const remaining=daysInRange(items,profile,today,lookaheadDays+1);
  const total=current.reduce((sum,day)=>sum+day.hours,0);
  return {
    days:current,
    hours:Math.round(total*100)/100,
    nextRest:future.find(d=>d.kind==='rest')?.date||null,
    nextLeave:nextLeave(remaining,absences,today),
    linked:current.some(d=>!['unlinked','unknown'].includes(d.kind))||future.some(d=>!['unlinked','unknown'].includes(d.kind)),
    hasPublishedDays:remaining.some(d=>d.kind!=='unknown'),
  };
}

// Vue d'ensemble Desktop: cartes courtes, détail au clic, sans modifier les plannings.
import {syncOverviewStatus,formatSyncTimestamp,renderSyncOverviewCard} from './nethor-sync-overview.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(Math.round(m%60)).padStart(2,'0');
const weekdays=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const monday=date=>{
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 return d.toISOString().slice(0,10);
};
const plus=(date,n)=>{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
};
function mergedRanges(rows){
 const all=rows.flatMap(row=>(Array.isArray(row?.ranges)?row.ranges:[]))
 .map(r=>({start:Number(r.startMinutes),end:Number(r.endMinutes)}))
 .filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start)
 .sort((a,b)=>a.start-b.start||a.end-b.end);
 const output=[];
 for(const r of all){
  const previous=output.at(-1);
  if(previous&&r.start<=previous.end)previous.end=Math.max(previous.end,r.end);
  else output.push({...r});
 }
 return output;
}
function dayInfo(people,index){
 const rows=people.map(p=>p.days?.[index]).filter(Boolean);
 const ranges=mergedRanges(rows);
 const leave=rows.some(r=>r.cells?.includes('y'));
 const available=rows.some(r=>Array.isArray(r.cells));
 const label=ranges.length?ranges.map(r=>fmt(r.start)+'–'+fmt(r.end)).join(' · '):leave?'Congés':available?'Repos':'Non renseigné';
 const minutes=ranges.reduce((n,r)=>n+r.end-r.start,0);
 return {label,minutes,ranges,leave};
}
export function buildDashboardPeople(people=[]){
 const grouped=new Map();
 for(const person of people){
  const id=person.profile?.id||'unlinked:'+String(person.name||'').trim().toLocaleLowerCase('fr');
  if(!grouped.has(id)){
   grouped.set(id,{id,name:person.profile?.display_name||person.name,linked:!!person.profile,people:[]});
  }
  grouped.get(id).people.push(person);
 }
 return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
}
const modalIcon='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
export function renderOverviewDashboard({people=[],week='',today='',sync={},open=null,syncPeriod=7,hasPlanning=false}={}){
 const currentWeek=monday(today)===week;
 const todayIndex=currentWeek?Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(week+'T12:00:00Z'))/86400000):-1;
 const roster=buildDashboardPeople(people);
 const currentlyWorking=todayIndex>=0?roster.filter(p=>dayInfo(p.people,todayIndex).minutes>0).length:null;
 const currentStatus=syncOverviewStatus(sync);
 const statusLabel={online:'Connecté',offline:'Hors ligne','not-seen':'En attente du premier contact','not-configured':'Non configuré',loading:'Vérification…',error:'État indisponible'}[currentStatus]||'État inconnu';
 const lastCheck=sync?.status?.lastCheckAt?formatSyncTimestamp(sync.status.lastCheckAt):null;
 const dateTitle=currentWeek?"Aujourd’hui · "+new Date(today+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',timeZone:'UTC'}):'Semaine consultée · '+week;
 const cards=roster.map((item,index)=>{
  const day=todayIndex>=0?dayInfo(item.people,todayIndex):null;
  const dateLabel=day?day.label:'Voir les horaires de la semaine';
  const names=[...new Set(item.people.map(p=>p.name))];
  return '<button type="button" class="n2dash-person" data-action="dashboard-person" data-dashboard-person="'+index+'"><span class="n2dash-avatar" aria-hidden="true">'+esc(item.name.slice(0,1).toLocaleUpperCase('fr'))+'</span><span class="n2dash-person-main"><strong>'+esc(item.name)+'</strong><small>'+esc(dateTitle)+'</small></span><span class="n2dash-person-time">'+esc(dateLabel)+'</span><span class="n2dash-chevron" aria-hidden="true">›</span></button>';
 }).join('');
 const totals='<div class="n2dash-kpis"><div><small>Collaborateurs au planning</small><strong>'+roster.length+'</strong></div><div><small>En poste aujourd’hui</small><strong>'+(currentlyWorking===null?'—':currentlyWorking)+'</strong></div><div><small>État NethorSync</small><strong>'+esc(statusLabel)+'</strong></div></div>';
 const peopleSection='<section class="card n2dash-section"><div class="n2dash-section-head"><div><h2>Équipe</h2><p>'+esc(hasPlanning?'Clique sur un collaborateur pour consulter ses sept jours.':'Aucun planning publié pour cette semaine.')+'</p></div><button type="button" class="n2dash-text-action" data-action="go-planning">Planning complet ›</button></div><div class="n2dash-roster">'+(cards||'<div class="n2dash-empty">Aucun collaborateur à afficher.</div>')+'</div></section>';
 const syncSummary='<section class="card n2dash-section n2dash-sync"><div class="n2dash-section-head"><div><h2>NethorSync</h2><p>Synchronisation des fichiers Excel</p></div></div><button type="button" class="n2dash-sync-button" data-action="dashboard-sync"><span class="n2dash-sync-dot" data-status="'+esc(currentStatus)+'"></span><span class="n2dash-sync-main"><strong>'+esc(statusLabel)+'</strong><small>'+(sync?.status?.installed?'Poste : '+esc(sync.status.deviceLabel||'Inconnu'):'Poste non lié')+'</small><small>'+(lastCheck?'Dernier contrôle : '+esc(lastCheck.date)+' à '+esc(lastCheck.time):'Aucun contrôle enregistré')+'</small></span><span class="n2dash-chevron" aria-hidden="true">›</span></button><p class="n2dash-footnote">Ouvrir pour consulter les transferts, vérifications et erreurs signalées.</p></section>';
 let modal='';
 if(open?.type==='person'){
  const item=roster[Number(open.index)];
  if(item){
   const aliases=[...new Set(item.people.map(p=>p.name))];
   const rows=Array.from({length:7},(_,i)=>{
    const date=plus(week,i),day=dayInfo(item.people,i);
    return '<div class="n2dash-day'+(date===today?' n2dash-today':'')+'"><span><strong>'+weekdays[i]+'</strong><small>'+esc(date.slice(8,10)+'/'+date.slice(5,7))+'</small></span><b>'+esc(day.label)+'</b></div>';
   }).join('');
   const totalMinutes=Array.from({length:7},(_,i)=>dayInfo(item.people,i).minutes).reduce((a,b)=>a+b,0);
   modal='<div class="n2dash-overlay" data-dashboard-backdrop><section class="n2dash-modal" role="dialog" aria-modal="true" aria-label="Semaine de '+esc(item.name)+'"><header class="n2dash-modal-head"><div><p>PLANNING DE LA SEMAINE</p><h2>'+esc(item.name)+'</h2><small>'+esc(week)+' au '+esc(plus(week,6))+'</small></div><button type="button" class="n2dash-close" data-action="dashboard-close" aria-label="Fermer">'+modalIcon+'</button></header><div class="n2dash-modal-body">'+(aliases.length>1?'<p class="n2dash-alias-label">Noms reconnus : '+esc(aliases.join(' · '))+'</p>':'')+'<div class="n2dash-days">'+rows+'</div><p class="n2dash-week-total">Total hebdomadaire <strong>'+(totalMinutes/60).toLocaleString('fr-FR',{maximumFractionDigits:2})+' h</strong></p></div><footer><button type="button" class="btn" data-action="dashboard-close">Fermer</button><button type="button" class="btn primary" data-action="dashboard-open-planning">Ouvrir le planning complet</button></footer></section></div>';
  }
 }
 if(open?.type==='sync'){
  modal='<div class="n2dash-overlay" data-dashboard-backdrop><section class="n2dash-modal n2dash-modal-wide" role="dialog" aria-modal="true" aria-label="Détails NethorSync"><header class="n2dash-modal-head"><div><p>ÉTAT DU POSTE ET DU CLOUD</p><h2>NethorSync</h2><small>Contrôles, historique, transferts et diagnostics</small></div><button type="button" class="n2dash-close" data-action="dashboard-close" aria-label="Fermer">'+modalIcon+'</button></header><div class="n2dash-modal-body">'+renderSyncOverviewCard(sync,Date.now(),syncPeriod)+'</div><footer><button type="button" class="btn" data-action="dashboard-close">Fermer</button><button type="button" class="btn primary" data-action="dashboard-sync-settings">Paramètres NethorSync</button></footer></section></div>';
 }
 return '<div class="n2dash">'+totals+'<div class="n2dash-columns">'+peopleSection+syncSummary+'</div>'+modal+'</div>';
}

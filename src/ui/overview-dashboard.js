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
 return {label,minutes,ranges,leave,available};
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
const serviceKind=day=>day.leave?'leave':!day.ranges.length?'rest':day.ranges[0].start<720?'morning':'afternoon';
const serviceText=kind=>({morning:'Matin',afternoon:'Après-midi',leave:'Congés',rest:'Repos'})[kind];
const humanDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',timeZone:'UTC'});
const modalIcon='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
/** Fiche collaborateur partagée entre Vue d'ensemble et Planning Desktop/PWA. */
export function renderCollaboratorSheet({item,week='',today='',open=null,hasPlanning=false,personDetail=null,personIssues=[],personSource='',personRevision=null}={}){
 if(!item||open?.type!=='person')return '';
 let modal='';
   const focus=personDetail?.week&&personDetail.week!==week?personDetail:null;
   const focusedWeek=focus?.week||week;
   const knownNames=new Set(item.people.map(p=>String(p.name||'').trim().toLocaleLowerCase('fr')));
   const selected=focus?(focus.people?.find(p=>p.id===item.id)||
     focus.people?.find(p=>p.people?.some(entry=>knownNames.has(String(entry.name||'').trim().toLocaleLowerCase('fr'))))):item;
   const published=focus?Boolean(focus.published):Boolean(hasPlanning);
   const loading=Boolean(focus?.loading);
   const failure=String(focus?.error||'');
   const tab=open.tab==='suivi'?'suivi':'planning';
   const days=published&&!loading&&!failure&&selected?Array.from({length:7},(_,i)=>dayInfo(selected.people,i)):null;
   const totalMinutes=days?.reduce((sum,day)=>sum+day.minutes,0);
   const workedDays=days?.filter(day=>day.minutes>0).length;
   const restDays=days?.filter(day=>day.available&&!day.leave&&day.minutes===0).length;
   const issues=focus?focus.issues||[]:personIssues;
   const aliases=[...new Set(item.people.map(p=>p.name).concat(selected?.people?.map(p=>p.name)||[]))];
   const rangeText=humanDate(focusedWeek)+' – '+humanDate(plus(focusedWeek,6));
   const stats='<div class="n2dash-person-stats n2dash-person-stats-three">'+
    '<div><small>Heures planifiées</small><strong>'+(totalMinutes==null?'—':(totalMinutes/60).toLocaleString('fr-FR',{maximumFractionDigits:2})+' h')+'</strong></div>'+
    '<div><small>Jours travaillés</small><strong>'+(workedDays==null?'—':workedDays+' / 7')+'</strong></div>'+
    '<div><small>Jours de repos</small><strong>'+(restDays==null?'—':restDays)+'</strong></div></div>';
   const rows=days?days.map((day,i)=>{
     const date=plus(focusedWeek,i),kind=day.available?serviceKind(day):'unknown';
     return '<div class="n2dash-day'+(date===today?' n2dash-today':'')+'"><span class="n2dash-day-date"><strong>'+weekdays[i]+(date===today?' <em>Aujourd’hui</em>':'')+'</strong><small>'+esc(humanDate(date))+'</small></span><span class="n2dash-shift" data-kind="'+kind+'"><span class="n2dash-shift-kind">'+esc(serviceText(kind)||'Non renseigné')+'</span><b>'+esc(kind==='rest'||kind==='unknown'?'':day.label)+'</b></span></div>';
   }).join(''):'';
   const availability=loading?'<div class="n2dash-detail-empty" role="status">Chargement du planning de la semaine…</div>':
    failure?'<div class="n2dash-detail-empty" role="alert">'+esc(failure)+'</div>':
    !published?'<div class="n2dash-detail-empty">Aucun planning publié pour cette semaine. Les journées ne sont pas considérées comme des repos.</div>':
    !selected?'<div class="n2dash-detail-empty">Ce collaborateur n’apparaît pas sur le planning de cette semaine.</div>':'';
   const nav='<div class="n2dash-period"><div><strong>Planning hebdomadaire</strong><small>'+esc(rangeText)+'</small></div><div class="n2dash-period-controls">'+
    '<button type="button" data-action="dashboard-week-prev" aria-label="Semaine précédente"'+(plus(focusedWeek,-7)<'2025-01-01'?' disabled':'')+'>‹</button>'+
    '<button type="button" data-action="dashboard-week-today" aria-label="Retour à la semaine actuelle">Aujourd’hui</button>'+
    '<button type="button" data-action="dashboard-week-next" aria-label="Semaine suivante">›</button></div></div>';
   const source=focus?focus.sourceFile:personSource;
   const revision=focus?focus.revision:personRevision;
   const formattedRevision=revision&&!Number.isNaN(Date.parse(revision))?new Date(revision).toLocaleString('fr-FR',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}):null;
   const issuesHtml=published&&!loading&&!failure&&selected?
    (issues.length?'<div class="n2dash-follow-issues">'+issues.map(issue=>{
      const label=({SHORT_SHIFT:'Créneau très court',LONG_BREAK:'Longue coupure',LONG_DAY:'Journée longue',INVALID_ROW:'Données incohérentes',CONTRACT_DIFFERENCE:'Écart avec le volume contractuel',ABSENCE_CONFLICT:'Conflit avec une absence'})[issue.code]||'Point à vérifier';
      return '<div class="n2dash-follow-issue"><strong>'+esc(label)+'</strong><small>'+(issue.date?esc(humanDate(issue.date)):'Sur la semaine')+(issue.difference!=null?' · '+esc(Number(issue.difference).toLocaleString('fr-FR',{maximumFractionDigits:2}))+' h':'')+'</small></div>';
     }).join('')+'</div>':'<div class="n2dash-follow-ok">Aucune anomalie individuelle détectée sur cette semaine.</div>'):
    '<p class="n2dash-follow-muted">Les alertes seront visibles lorsqu’un planning publié est disponible.</p>';
   const follow='<div class="n2dash-follow"><section><h3>Informations du collaborateur</h3><dl>'+
    '<div><dt>Compte NETHOR</dt><dd>'+(item.linked?'Associé':'Aucun compte associé')+'</dd></div>'+
    '<div><dt>Nom de planning</dt><dd>'+esc(item.people[0]?.name||item.name)+'</dd></div>'+
    '<div><dt>Noms reconnus</dt><dd>'+esc(aliases.join(' · '))+'</dd></div></dl></section>'+
    '<section><h3>Contrôle de la semaine</h3>'+issuesHtml+'</section>'+
    '<section><h3>Traçabilité du planning</h3><dl>'+
    '<div><dt>Fichier source</dt><dd>'+esc(source||'Non renseigné')+'</dd></div>'+
    '<div><dt>Dernière publication connue</dt><dd>'+esc(formattedRevision||'Non renseignée')+'</dd></div></dl>'+
    '<p class="n2dash-follow-muted">Les heures indiquées sont planifiées, et non pointées. L’historique des changements individuels nécessite des versions archivées et une autorisation serveur adaptée ; aucune modification passée n’est déduite de ce seul planning.</p></section></div>';
   modal='<div class="n2dash-overlay" data-dashboard-backdrop><section class="n2dash-modal n2dash-person-modal n2dash-person-sheet" role="dialog" aria-modal="true" aria-label="Fiche de '+esc(item.name)+'"><header class="n2dash-modal-head"><div class="n2dash-person-heading"><span class="n2dash-avatar" aria-hidden="true">'+esc(item.name.slice(0,1).toLocaleUpperCase('fr'))+'</span><span><h2>'+esc(item.name)+'</h2><small>Collaborateur · Netto Le Thor</small></span></div><button type="button" class="n2dash-close" data-action="dashboard-close" aria-label="Fermer">'+modalIcon+'</button></header>'+
    '<div class="n2dash-person-tabs" role="tablist" aria-label="Sections de la fiche"><button type="button" role="tab" aria-selected="'+(tab==='planning')+'" class="'+(tab==='planning'?'active':'')+'" data-action="dashboard-tab-planning">Planning</button><button type="button" role="tab" aria-selected="'+(tab==='suivi')+'" class="'+(tab==='suivi'?'active':'')+'" data-action="dashboard-tab-suivi">Suivi</button></div>'+
    '<div class="n2dash-modal-body">'+nav+(tab==='planning'?availability+((days&&selected)?stats+'<div class="n2dash-days">'+rows+'</div>':''):follow)+'</div>'+
    '<footer><button type="button" class="btn primary" data-action="dashboard-open-planning">Ouvrir le planning mensuel ↗</button></footer></section></div>';

 return modal;
}


/**
 * Indicateurs de gestion fondés exclusivement sur les créneaux publiés.
 * Les alias d'un même compte sont fusionnés avant chaque calcul.
 * « Planifié » ne signifie jamais « présent/pointé ».
 */
export function dashboardMetrics({people=[],week='',today='',issues=[],hasPlanning=false}={}){
 const roster=buildDashboardPeople(people);
 const todayIndex=week&&today&&monday(today)===week
  ? Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(week+'T12:00:00Z'))/86400000):-1;
 const days=Array.from({length:7},(_,index)=>{
  const entries=roster.map(item=>({item,day:dayInfo(item.people,index)}));
  return {date:plus(week,index),count:entries.filter(entry=>entry.day.minutes>0).length,
   minutes:entries.reduce((sum,entry)=>sum+entry.day.minutes,0),entries};
 });
 const weeklyMinutes=days.reduce((sum,day)=>sum+day.minutes,0);
 const todayDay=todayIndex>=0?days[todayIndex]:null;
 const buckets=[];
 if(hasPlanning&&todayDay){
  const ranges=todayDay.entries.flatMap(entry=>entry.day.ranges);
  if(ranges.length){
   const first=Math.max(0,Math.floor(Math.min(...ranges.map(r=>r.start))/60));
   const last=Math.min(24,Math.ceil(Math.max(...ranges.map(r=>r.end))/60));
   for(let hour=first;hour<last;hour++){
    const start=hour*60,end=start+60;
    buckets.push({hour,count:todayDay.entries.filter(entry=>
     entry.day.ranges.some(range=>range.start<end&&range.end>start)).length});
   }
  }
 }
 return {roster,days,todayIndex,todayDay,weeklyMinutes,buckets,
  issueCount:hasPlanning?(Array.isArray(issues)?issues.length:0):null};
}

function dashboardHours(minutes){
 if(!Number.isFinite(minutes))return '—';
 const value=Number((minutes/60).toFixed(2));
 return value.toLocaleString('fr-FR',{maximumFractionDigits:2})+' h';
}
function dashboardIssueLabel(issue){
 return ({
  INVALID_ROW:'Ligne de planning incohérente',
  SHORT_SHIFT:'Créneau très court',
  LONG_BREAK:'Coupure importante',
  LONG_DAY:'Journée longue',
  CONTRACT_DIFFERENCE:'Écart avec les heures contractuelles',
  ABSENCE_CONFLICT:'Conflit avec une absence',
  LOW_COVERAGE:'Couverture réduite détectée'
 })[issue?.code]||'Point à vérifier';
}
function dashboardPersonButton(entry,index){
 const kind=entry.day.available?serviceKind(entry.day):'unknown';
 const label=entry.day.available?entry.day.label:'Non renseigné';
 const note=kind==='rest'?'Repos':kind==='leave'?'Congés':kind==='morning'?'Service du matin':kind==='afternoon'?'Service de l’après-midi':'Horaire non renseigné';
 const item=entry.item;
 return '<button type="button" class="n2dash-person" data-action="dashboard-person" data-dashboard-person="'+index+'">'+
  '<span class="n2dash-avatar" aria-hidden="true">'+esc(item.name.slice(0,1).toLocaleUpperCase('fr'))+'</span>'+
  '<span class="n2dash-person-main"><strong>'+esc(item.name)+'</strong><small>'+esc(note)+'</small></span>'+
  '<span class="n2dash-person-time" data-kind="'+kind+'">'+esc(label)+'</span>'+
  '<span class="n2dash-chevron" aria-hidden="true">›</span></button>';
}
export function renderOverviewDashboard({
 people=[],week='',today='',sync={},open=null,syncPeriod=7,hasPlanning=false,
 personDetail=null,personIssues=[],personSource='',personRevision=null,issues=[],expanded=false
}={}){
 const data=dashboardMetrics({people,week,today,issues,hasPlanning});
 const {roster,days,todayDay,weeklyMinutes,buckets}=data;
 const currentStatus=syncOverviewStatus(sync);
 const statusLabel={
  online:'En ligne',offline:'Hors ligne','not-seen':'En attente',
  'not-configured':'Non configuré',loading:'Vérification…',error:'Indisponible'
 }[currentStatus]||'Non vérifié';
 const lastCheck=sync?.status?.lastCheckAt?formatSyncTimestamp(sync.status.lastCheckAt):null;
 const dateLabel=today?new Date(today+'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'Semaine en cours';
 const kpi=(title,value,note,kind='')=>'<article class="n2dash-kpi"'+(kind?' data-kind="'+kind+'"':'')+'><small>'+esc(title)+'</small><strong>'+esc(value)+'</strong><span>'+esc(note)+'</span></article>';
 const totals='<div class="n2dash-kpis" aria-label="Indicateurs du planning">'+
  kpi('Équipe planifiée aujourd’hui',hasPlanning&&todayDay?String(todayDay.count):'—',
    hasPlanning&&todayDay?'Sur '+roster.length+' collaborateurs du planning':'Planning non disponible')+
  kpi('Heures planifiées cette semaine',hasPlanning?dashboardHours(weeklyMinutes):'—',
    hasPlanning?'Total des créneaux publiés':'Planning non disponible')+
  kpi('Points à vérifier',data.issueCount===null?'—':String(data.issueCount),
    hasPlanning?'Contrôles du planning actuel':'Aucun contrôle possible',
    data.issueCount>0?'attention':'')+
  kpi('NethorSync',statusLabel,lastCheck?'Dernier contrôle · '+lastCheck.date:'Dernier contrôle non renseigné',
    currentStatus==='online'?'ok':currentStatus==='offline'||currentStatus==='error'?'attention':'')+
  '</div>';
 const dateHead='<div class="n2dash-topline"><div><span class="n2dash-overline">TABLEAU DE BORD MAGASIN</span>'+
  '<p>'+esc(dateLabel)+' · Netto Le Thor</p></div><span class="n2dash-readonly">Données planifiées · non pointées</span></div>';
 const sortedEntries=todayDay?[...todayDay.entries].sort((a,b)=>{
  const pa=a.day.minutes>0?0:a.day.leave?1:2,pb=b.day.minutes>0?0:b.day.leave?1:2;
  return pa-pb||(a.day.ranges[0]?.start??1440)-(b.day.ranges[0]?.start??1440)||
    a.item.name.localeCompare(b.item.name,'fr');
 }):[];
 const peopleRows=sortedEntries.slice(0,expanded?sortedEntries.length:6).map(entry=>{
  const index=roster.indexOf(entry.item);
  return dashboardPersonButton(entry,index);
 }).join('');
 const rosterSection='<section class="card n2dash-section n2dash-team">'+
  '<div class="n2dash-section-head"><div><h2>Équipe aujourd’hui</h2><p>'+
  (hasPlanning?'Horaires prévus · '+roster.length+' collaborateurs au planning':'Planning de la semaine non publié')+
  '</p></div><button type="button" class="n2dash-text-action" data-action="go-planning">Planning complet ↗</button></div>'+
  '<div class="n2dash-roster">'+(hasPlanning?(peopleRows||'<div class="n2dash-empty">Aucun collaborateur renseigné.</div>'):
  '<div class="n2dash-empty">Aucun planning publié pour cette semaine. Les journées ne sont pas considérées comme des repos.</div>')+
  '</div>'+(hasPlanning&&sortedEntries.length>6?'<button type="button" class="n2dash-expand" data-action="dashboard-toggle-roster" aria-expanded="'+expanded+'">'+
  (expanded?'Afficher moins':'Voir les '+roster.length+' collaborateurs')+' <span aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button>':'')+
  '</section>';
 const max=Math.max(1,...buckets.map(item=>item.count));
 const chart=buckets.length?
  '<div class="n2dash-coverage-chart" role="group" aria-label="Effectifs prévus sur tout ou partie de chaque heure">'+
  buckets.map(item=>{
   const height=item.count?Math.max(7,Math.round(item.count/max*100)):0;
   const hour=String(item.hour).padStart(2,'0')+' h';
   return '<div class="n2dash-coverage-bar" role="img" aria-label="'+hour+' : '+item.count+' collaborateur'+(item.count>1?'s':'')+' planifié'+(item.count>1?'s':'')+'">'+
    '<strong>'+item.count+'</strong><div class="n2dash-coverage-track"><span style="height:'+height+'%"></span></div>'+
    '<small>'+String(item.hour).padStart(2,'0')+'h</small></div>';
  }).join('')+'</div>':
  '<p class="n2dash-empty n2dash-coverage-empty">'+(hasPlanning?'Aucun créneau de travail prévu aujourd’hui.':'Graphique disponible après publication du planning.')+'</p>';
 const coverageSection='<section class="card n2dash-section n2dash-coverage">'+
  '<div class="n2dash-section-head"><div><h2>Couverture horaire</h2><p>Collaborateurs planifiés par heure · aujourd’hui</p></div></div>'+
  '<div class="n2dash-coverage-content">'+chart+
  '<p class="n2dash-footnote">Une personne est comptée si au moins une partie de son créneau recoupe l’heure. Ce graphique ne mesure ni la présence réelle ni les besoins d’effectifs.</p></div></section>';
 const weekCards=days.map((day,i)=>{
  const isToday=day.date===today;
  return '<button type="button" class="n2dash-weekday'+(isToday?' is-today':'')+'" data-action="dashboard-open-day" data-dashboard-date="'+esc(day.date)+'" aria-label="'+esc(weekdays[i]+' '+humanDate(day.date)+' : '+(hasPlanning?day.count+' collaborateurs planifiés':'planning non disponible'))+'">'+
   '<small>'+weekdays[i].slice(0,3)+'</small><strong>'+esc(humanDate(day.date).split(' ')[0])+'</strong>'+
   '<span>'+ (hasPlanning?day.count+' pers.':'—')+'</span>'+
   '<em>'+esc(hasPlanning?dashboardHours(day.minutes):'—')+'</em></button>';
 }).join('');
 const weekSection='<section class="card n2dash-section n2dash-week">'+
  '<div class="n2dash-section-head"><div><h2>Semaine en cours</h2><p>'+esc(humanDate(week))+' – '+esc(humanDate(plus(week,6)))+' · effectifs et heures planifiés</p></div>'+
  '<button type="button" class="n2dash-text-action" data-action="go-planning">Ouvrir ↗</button></div>'+
  '<div class="n2dash-week-days">'+weekCards+'</div>'+
  '<p class="n2dash-footnote">Sélectionner un jour ouvre le planning détaillé. Les heures sont calculées sur les créneaux publiés.</p></section>';
 const warnings=[];
 if(!hasPlanning)warnings.push({kind:'warning',title:'Planning de la semaine indisponible',detail:'Vérifier la publication avant de consulter les effectifs.',action:'go-planning',label:'Consulter'});
 if(hasPlanning&&issues.length){
  const byCode=new Map();
  for(const issue of issues)byCode.set(issue.code,(byCode.get(issue.code)||0)+1);
  const details=[...byCode.entries()].slice(0,2).map(([code,count])=>dashboardIssueLabel({code})+' ('+count+')').join(' · ');
  warnings.push({kind:'warning',title:issues.length+' point'+(issues.length>1?'s':'')+' de planning à vérifier',
   detail:details+(byCode.size>2?' · autres contrôles':''),
   action:'go-planning',label:'Voir le planning'});
 }
 if(currentStatus==='offline'||currentStatus==='error'||currentStatus==='not-configured')
  warnings.push({kind:'warning',title:'Synchronisation · '+statusLabel,
   detail:lastCheck?'Dernier contrôle Windows : '+lastCheck.date+' à '+lastCheck.time:'Dernier contrôle non confirmé.',
   action:'dashboard-sync',label:'Détails'});
 const publications=Array.isArray(sync?.autoPublications)?sync.autoPublications:[];
 const latest=publications[0];
 if(latest&&['failed','rejected','skipped'].includes(latest.status))
  warnings.push({kind:'warning',title:'Dernière publication automatique à vérifier',
   detail:(latest.fileName||'Fichier Excel')+' · '+({failed:'Échec de traitement',rejected:'Fichier refusé',skipped:'Publication ignorée'}[latest.status]),
   action:'dashboard-sync',label:'Examiner'});
 const follow=warnings.length?
  warnings.slice(0,4).map(item=>'<div class="n2dash-action-item" data-kind="'+item.kind+'"><div>'+
   '<strong>'+esc(item.title)+'</strong><p>'+esc(item.detail)+'</p></div>'+
   '<button type="button" data-action="'+item.action+'">'+esc(item.label)+' ↗</button></div>').join(''):
  '<div class="n2dash-action-item"><div><strong>'+(
   sync?.loaded&&sync?.autoLoaded?'Aucune alerte prioritaire signalée':'Contrôles en cours ou non vérifiables')+
   '</strong><p>'+(hasPlanning?'Aucun point de planning ou incident NethorSync prioritaire dans les données disponibles.':'Les données ne sont pas encore disponibles.')+
   '</p></div></div>';
 const followSection='<section class="card n2dash-section n2dash-attention">'+
  '<div class="n2dash-section-head"><div><h2>À surveiller</h2><p>Priorités de gestion, sans inventer d’alertes</p></div>'+
  (warnings.length?'<span class="n2dash-count">'+warnings.length+'</span>':'')+'</div>'+
  '<div class="n2dash-action-list">'+follow+'</div></section>';
 const syncSummary='<section class="card n2dash-section n2dash-sync-mini">'+
  '<button type="button" class="n2dash-sync-button" data-action="dashboard-sync">'+
  '<span class="n2dash-sync-dot" data-status="'+esc(currentStatus)+'"></span>'+
  '<span class="n2dash-sync-main"><strong>Suivi NethorSync <span class="n2dash-sync-state">· '+esc(statusLabel)+'</span></strong>'+
  '<small>'+(lastCheck?'Dernier contrôle · '+esc(lastCheck.date)+' à '+esc(lastCheck.time):'Dernier contrôle non confirmé')+
  ' · Ouvrir le détail des imports et erreurs</small></span><span class="n2dash-chevron" aria-hidden="true">›</span></button></section>';
 let modal='';
 if(open?.type==='person')modal=renderCollaboratorSheet({
  item:roster[Number(open.index)],week,today,open,hasPlanning,
  personDetail,personIssues,personSource,personRevision
 });
 if(open?.type==='sync'){
  modal='<div class="n2dash-overlay" data-dashboard-backdrop><section class="n2dash-modal n2dash-modal-wide" role="dialog" aria-modal="true" aria-label="Détails NethorSync"><header class="n2dash-modal-head"><div><p>ÉTAT DU POSTE ET DU CLOUD</p><h2>NethorSync</h2><small>Contrôles, historique, transferts et diagnostics</small></div><button type="button" class="n2dash-close" data-action="dashboard-close" aria-label="Fermer">'+modalIcon+'</button></header><div class="n2dash-modal-body">'+renderSyncOverviewCard(sync,Date.now(),syncPeriod)+'</div><footer><button type="button" class="btn" data-action="dashboard-close">Fermer</button><button type="button" class="btn primary" data-action="dashboard-sync-settings">Paramètres NethorSync</button></footer></section></div>';
 }
 return '<div class="n2dash n2dash-manager">'+dateHead+totals+
  '<div class="n2dash-main-grid"><div class="n2dash-stack">'+coverageSection+rosterSection+'</div>'+
  '<div class="n2dash-stack">'+followSection+weekSection+syncSummary+'</div></div>'+modal+'</div>';
}

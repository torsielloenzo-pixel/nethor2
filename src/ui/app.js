import { buildImportPreview } from '../import/import-preview.js';
import { readPlanningFile } from '../import/excel-structure.js';

const WEEKDAYS = ['Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.','Dim.'];
const PAGE_TITLES = {dashboard:"Vue d'ensemble",planning:"Planning",anomalies:"Anomalies",import:"Importer un planning",team:"Équipe",settings:"Paramètres"};
const PEOPLE = [
  {id:'demo-1',name:'Camille',initials:'CA',role:'Responsable',color:''},
  {id:'demo-2',name:'Alex',initials:'AL',role:'Employé',color:'alt'},
  {id:'demo-3',name:'Morgan',initials:'MO',role:'Employé',color:'warm'},
  {id:'demo-4',name:'Lou',initials:'LO',role:'Employé',color:''},
  {id:'demo-5',name:'Noa',initials:'NO',role:'Employé',color:'alt'},
  {id:'demo-6',name:'Sam',initials:'SA',role:'Employé',color:'warm'}
];
const DEMO_SHIFTS = [
  [[[6,13.5]],[[7,14]],[[6,13]],[],[[10,17]],[[7,12]],[]],
  [[[12,20]],[[12,20]],[],[[9,17]],[[9,17]],[[9,16]],[]],
  [[[8,14]],[[8,14]],[[8,14]],[[8,14]],[[14,14.25]],[],[]],
  [[[7,15]],[[7,15]],[[7,15]],[[7,15]],[[7,15]],[],[]],
  [[[9,14]],[[10,13],[15.25,18]],[[13,20]],[[13,20]],[],[[8,14]],[]],
  [[],[[9,17]],[[9,17]],[[10,18]],[[9,17]],[[8,13]],[]]
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
function parseDate(s){return new Date(s+'T12:00:00');}
function iso(d){return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');}
function plusDays(date,n){const d=parseDate(date);d.setDate(d.getDate()+n);return iso(d);}
function mondayOf(date){const d=parseDate(date);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);}
function frenchDate(date,opts={day:'numeric',month:'long',year:'numeric'}){return parseDate(date).toLocaleDateString('fr-FR',opts);}
const time = minutes => pad(Math.floor(minutes/60))+':'+pad(minutes%60);
const duration = n => Number.isFinite(n) ? (Number.isInteger(n)?String(n):n.toFixed(2).replace('.',','))+' h' : '—';
function datesFor(week){return Array.from({length:7},(_,i)=>plusDays(week,i));}
function makeDemo(week){
  const employees=PEOPLE.map(p=>({name:p.name}));
  const dates=datesFor(week);
  const days=Object.fromEntries(dates.map((date,di)=>{
    const cells=DEMO_SHIFTS.map(shifts=>{
      const row=Array(58).fill(null);
      for(const [start,end] of shifts[di]){
        for(let j=Math.max(0,Math.round((start-6)*4));j<Math.min(58,Math.round((end-6)*4));j++)row[j]='g';
      }
      return row;
    });
    return [date,{date,cells}];
  }));
  return {version:4,weekStart:week,startTime:6,endTime:20.5,slotMinutes:15,slotCount:58,employees,days,sourceFile:'Démonstration fictive'};
}
const demoOptions={
  profiles:PEOPLE.map(p=>({id:p.id,account_enabled:true})),
  aliases:PEOPLE.map(p=>({planningName:p.name,userId:p.id}))
};
const today=iso(new Date());
const state={page:'dashboard',week:mondayOf(today),day:today,view:'week',mode:'demo',imported:null,importPreview:null,importError:'',importName:'',busy:false,search:''};
if(!datesFor(state.week).includes(state.day))state.day=state.week;
let current={model:null,analysis:null};
function activeModel(){
  if(state.mode==='file')return state.imported?.weekStart===state.week?state.imported:null;
  return makeDemo(state.week);
}
function analyze(model){
  if(!model)return null;
  if(state.mode==='file')return buildImportPreview(model);
  const base=buildImportPreview(model,demoOptions);
  const contracts=Object.fromEntries(base.employees.map((e,i)=>[PEOPLE[i].id,e.hours+(i===0?2:0)]));
  return buildImportPreview(model,{...demoOptions,contracts});
}
function refresh(){current.model=activeModel();current.analysis=analyze(current.model);}
function personLabel(name,index){
  const p=PEOPLE.find(x=>x.name===name);
  const initials=p?.initials || String(name).trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
  const color=p?.color || ['','alt','warm'][index%3];
  return '<span class="person"><span class="person-bubble '+esc(color)+'">'+esc(initials)+'</span>'+esc(name)+'</span>';
}
function formatRanges(ranges){
  if(!ranges?.length)return '<div class="off">Repos</div>';
  return '<div class="shift">'+ranges.map(r=>time(r.startMinutes)+'–'+time(r.endMinutes)).join('<i>puis</i>')+'</div>';
}
function issueInfo(w){
  const descriptions={
    SHORT_SHIFT:['Créneau très court','Une plage de travail de 30 minutes ou moins a été détectée.'],
    LONG_BREAK:['Coupure prolongée','Une interruption de 2 heures ou davantage sépare deux créneaux.'],
    LONG_DAY:['Journée longue','La durée planifiée dépasse 10 heures : contrôle nécessaire.'],
    ABSENCE_CONFLICT:['Conflit avec une absence','Un horaire est présent alors qu’une absence a été approuvée.'],
    ACCOUNT_UNLINKED:['Compte non associé','Le nom Excel doit être associé à un compte par un administrateur.'],
    ACCOUNT_AMBIGUOUS:['Association ambiguë','Plusieurs comptes correspondent à la même identité Excel.'],
    ACCOUNT_DISABLED:['Compte désactivé','L’identité est liée à un compte désactivé.'],
    ACCOUNT_MISSING_PROFILE:['Profil introuvable','Le compte associé ne possède pas de profil utilisable.'],
    CONTRACT_DIFFERENCE:['Écart au contrat','La somme des heures planifiées diffère du volume contractuel.']
  };
  const fallback=['Vérification nécessaire','Une incohérence a été relevée dans le planning.'];
  return descriptions[w.code]||fallback;
}
function issueRow(w){
  const [title,detail]=issueInfo(w);
  const critical=w.severity==='error';
  return '<div class="alert-item"><span class="alert-icon '+(critical?'error':'')+'">'+(critical?'!':'◇')+'</span><div><strong>'+esc(w.employee||'Planning')+' · '+esc(title)+'</strong><p>'+esc(detail)+(w.date?' · '+esc(frenchDate(w.date,{day:'numeric',month:'short'})):'')+(Number.isFinite(w.differenceHours)?' · '+esc(duration(w.differenceHours)):'')+'</p></div></div>';
}
function header(eyebrow,title,description,actions=''){
  return '<div class="page-header"><div><p class="eyebrow">'+esc(eyebrow)+'</p><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div>'+(actions?'<div class="actions">'+actions+'</div>':'')+'</div>';
}
function button(label,action,primary=false,extra=''){
  return '<button type="button" class="btn '+(primary?'primary':'')+'" data-action="'+esc(action)+'" '+extra+'>'+esc(label)+'</button>';
}
function sourceNotice(){
  return '<div class="notice"><strong>'+ (state.mode==='file'?'Fichier local — aperçu temporaire.':'Démonstration indépendante.')+'</strong> '+(state.mode==='file'?'Les noms et horaires sont uniquement analysés dans cet onglet. Aucune donnée n’est envoyée ni publiée.':'Les personnes et horaires présentés sont fictifs. Les vrais comptes et plannings ne sont pas raccordés.')+'</div>';
}
function summary(){
  const count=current.analysis?.employeeCount||0;
  const hours=current.analysis?.employees.reduce((s,e)=>s+e.hours,0)||0;
  const warnings=current.analysis?.warnings.length||0;
  const stats=[['Collaborateurs planifiés',String(count),'♧','Sur la semaine sélectionnée'],['Heures planifiées',duration(Math.round(hours*100)/100),'◷','Total de la semaine'],['Points à vérifier',String(warnings),'◇','Analyse automatique des créneaux']];
  return '<section class="stat-grid" aria-label="Indicateurs">'+stats.map((s,i)=>'<div class="card stat '+(i===2?'warning':'')+'"><div class="stat-top"><span>'+s[0]+'</span><span class="stat-symbol">'+s[2]+'</span></div><div class="stat-number">'+s[1]+'</div><div class="stat-hint">'+s[3]+'</div></div>').join('')+'</section>';
}
function weekControls(){
  return '<div class="tools"><div class="week-pager"><button type="button" class="icon-btn" data-action="prev-week" aria-label="Semaine précédente">‹</button><strong>'+esc(frenchDate(state.week,{day:'numeric',month:'short'}))+' – '+esc(frenchDate(plusDays(state.week,6),{day:'numeric',month:'short'}))+'</strong><button type="button" class="icon-btn" data-action="next-week" aria-label="Semaine suivante">›</button></div><div class="segmented"><button type="button" data-action="week-view" class="'+(state.view==='week'?'selected':'')+'">Semaine</button><button type="button" data-action="day-view" class="'+(state.view==='day'?'selected':'')+'">Jour</button></div></div>';
}
function weeklyTable(){
  if(!current.analysis)return '<div class="empty"><strong>Aucun planning chargé</strong>Retourne sur la semaine du fichier ou ouvre la démonstration.</div>';
  const dates=datesFor(state.week);
  let str='<div class="table-scroll"><table class="table"><thead><tr><th>Collaborateur</th>'+dates.map((d,i)=>'<th>'+WEEKDAYS[i]+'<br>'+esc(frenchDate(d,{day:'numeric',month:'short'}))+'</th>').join('')+'</tr></thead><tbody>';
  current.analysis.employees.forEach((e,i)=>{
    str+='<tr><td>'+personLabel(e.name,i)+'</td>'+e.days.map(d=>'<td>'+formatRanges(d.ranges)+'</td>').join('')+'</tr>';
  });
  return str+'</tbody></table></div>';
}
function dailyTable(){
  if(!current.analysis)return '<div class="empty">Aucun planning pour cette semaine.</div>';
  const dates=datesFor(state.week);
  if(!dates.includes(state.day))state.day=state.week;
  const index=dates.indexOf(state.day);
  const pills='<div class="day-pills">'+dates.map((d,i)=>'<button type="button" data-day="'+esc(d)+'" class="'+(state.day===d?'active':'')+'">'+WEEKDAYS[i]+'<br>'+esc(frenchDate(d,{day:'numeric',month:'short'}))+'</button>').join('')+'</div>';
  return pills+'<div class="day-list">'+current.analysis.employees.map((e,i)=>'<div class="day-card">'+personLabel(e.name,i)+'<div style="margin-top:12px">'+formatRanges(e.days[index]?.ranges)+'</div><div class="sub" style="margin-top:9px">'+duration(e.days[index]?.hours||0)+' travaillées</div></div>').join('')+'</div>';
}
function planningCard(short=false){
  return '<section class="card"><div class="card-head"><div><h2 class="card-title">Planning de l’équipe</h2><p class="sub">'+(state.mode==='file'?'Fichier importé · lecture seule':'Semaine fictive de démonstration')+'</p></div>'+(short?'<button class="text-link" type="button" data-page="planning">Voir tout →</button>':'')+'</div>'+weekControls()+(state.view==='week'?weeklyTable():dailyTable())+'</section>';
}
function alertsCard(short=false){
  const warnings=current.analysis?.warnings||[];
  const shown=short?warnings.slice(0,4):warnings;
  return '<section class="card"><div class="card-head"><div><h2 class="card-title">Points à vérifier</h2><p class="sub">'+warnings.length+' élément(s) détecté(s) sur cette semaine</p></div>'+(short?'<button class="text-link" type="button" data-page="anomalies">Tout voir →</button>':'')+'</div>'+(shown.length?'<div class="alerts">'+shown.map(issueRow).join('')+'</div>':'<div class="empty"><strong>Aucune anomalie détectée</strong>Les règles de contrôle n’ont pas relevé de point particulier.</div>')+'</section>';
}
function coverageCard(){
  if(!current.analysis)return '<section class="card"><div class="card-head"><h2 class="card-title">Couverture de la semaine</h2></div><div class="empty">Aucune donnée</div></section>';
  const totals=datesFor(state.week).map((date,i)=>current.analysis.employees.filter(e=>e.days[i]?.hours>0).length);
  const max=Math.max(...totals,1);
  return '<section class="card"><div class="card-head"><div><h2 class="card-title">Couverture magasin</h2><p class="sub">Effectifs planifiés par journée</p></div></div><div class="coverage">'+totals.map((n,i)=>'<div class="coverage-row"><div class="overview-bar"><span>'+WEEKDAYS[i]+'</span><span>'+n+' / '+current.analysis.employeeCount+' personnes</span></div><div class="progress"><span style="width:'+(n/max*100)+'%"></span></div></div>').join('')+'</div></section>';
}
function dashboard(){
  return header('BIENVENUE SUR NETHOR 2','Votre espace planning','Une vue claire du planning, des horaires et des points à vérifier.',button('Importer un fichier Excel','go-import',true)+button('Voir le planning','go-planning'))+sourceNotice()+summary()+'<div class="layout"><div class="stack">'+planningCard(true)+'</div><div class="stack">'+alertsCard(true)+coverageCard()+'</div></div>';
}
function planning(){
  return header('ORGANISATION','Planning des collaborateurs','Consulte les horaires au jour ou à la semaine.',button('Importer un planning','go-import',true)+(state.mode==='file'?button('Revenir à la démo','reset-demo'):''))+sourceNotice()+summary()+planningCard()+ '<div style="height:19px"></div>'+coverageCard();
}
function anomalies(){
  const warnings=current.analysis?.warnings||[];
  return header('CONTRÔLE DES HORAIRES','Analyse des anomalies','Contrôles indicatifs calculés à partir des créneaux importés ou fictifs.',button('Importer un planning','go-import',true))+sourceNotice()+summary()+(warnings.length?'<div class="alert-full">'+warnings.map(issueRow).join('')+'</div>':'<div class="card empty"><strong>Aucun point à vérifier</strong>L’analyse de cette semaine ne signale aucune anomalie.</div>')+'<p class="muted" style="margin-top:16px">Les alertes ne constituent pas une qualification juridique et doivent être vérifiées selon les règles internes applicables.</p>';
}
function team(){
  const employees=current.analysis?.employees||[];
  const filter=state.search.trim().toLowerCase();
  const list=employees.filter(e=>e.name.toLocaleLowerCase('fr').includes(filter));
  return header('COLLABORATEURS','Équipe & associations','Visualisation des noms détectés dans le planning, sans accès aux vrais comptes.')+sourceNotice()+'<div class="filter-row"><input id="teamSearch" value="'+esc(state.search)+'" placeholder="Rechercher une personne" aria-label="Rechercher une personne"></div><section class="card"><div class="card-head"><div><h2 class="card-title">Personnes dans le planning</h2><p class="sub">'+employees.length+' personne(s) détectée(s)</p></div></div><div class="mini-list">'+(list.length?list.map((e,i)=>'<div class="mini-row"><div>'+personLabel(e.name,i)+'<small>'+duration(e.hours)+' planifiées</small></div><span class="chip '+(e.link.status==='linked'?'':'warn')+'">'+(e.link.status==='linked'?'Associé (démo)':'À associer')+'</span></div>').join(''):'<div class="empty">Aucun résultat.</div>')+'</div></section><p class="muted" style="margin-top:16px">La création, la désactivation et l’association des comptes réels exigent les permissions serveur et ne sont pas activées dans cet aperçu.</p>';
}
function importResult(){
  if(state.busy)return '<div class="import-meta"><span>◷</span><div><strong>Analyse du classeur en cours…</strong><p>Lecture locale, vérification des feuilles et des créneaux.</p></div></div>';
  if(state.importError)return '<div class="import-meta error" role="alert"><span>!</span><div><strong>Import non validé</strong><p>'+esc(state.importError)+'</p></div></div>';
  if(!state.importPreview)return '';
  const p=state.importPreview;
  return '<div class="import-meta"><span>✓</span><div><strong>'+esc(state.importName)+'</strong><p>Semaine du '+esc(frenchDate(p.weekStart))+' · '+p.employeeCount+' personnes · '+p.warnings.length+' vérifications</p></div><span>Analyse effectuée</span></div>'+
   '<div class="actions" style="margin-bottom:20px">'+button('Afficher cette semaine (aperçu)','activate-file',true)+button('Effacer le fichier','clear-file')+'</div>'+
   '<section class="card"><div class="card-head"><h2 class="card-title">Aperçu des heures</h2></div><div class="mini-list">'+p.employees.map((e,i)=>'<div class="mini-row"><div>'+personLabel(e.name,i)+'</div><span class="chip info">'+duration(e.hours)+'</span></div>').join('')+'</div></section>';
}
function importer(){
  return header('IMPORTATION EXCEL','Importer un planning','Analyse locale d’un fichier .xls, .xlsx ou .xlsm, sans publication en production.',button('Revenir à la démo','reset-demo'))+
  '<div class="notice warning"><strong>Publication désactivée.</strong> Le fichier n’est pas transmis à Supabase. Les feuilles LUNDI à DIMANCHE, les noms en colonne B et les styles des créneaux sont contrôlés. Si les couleurs ne peuvent pas être interprétées avec fiabilité, l’import est refusé.</div>'+
  '<div class="layout"><div class="stack"><section class="card"><div class="card-head"><div><h2 class="card-title">Sélection du fichier</h2><p class="sub">Analyse du contenu dans le navigateur</p></div></div><label class="dropzone" id="dropzone"><span class="drop-icon">⇧</span><strong>Glissez votre fichier ici</strong><small>ou cliquez pour parcourir vos fichiers</small><small>Excel .xls / .xlsx / .xlsm · 10 Mo maximum</small><input type="file" id="workbookFile" accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><div class="card-body">'+importResult()+'</div></section></div><div class="stack"><section class="card"><div class="card-head"><h2 class="card-title">Fonctionnement</h2></div><div class="steps"><div class="step"><span class="step-num">1</span><div><strong>Lecture du fichier</strong><small>Vérification de la structure et des 7 jours du planning.</small></div></div><div class="step"><span class="step-num">2</span><div><strong>Analyse des créneaux</strong><small>Calcul des heures et identification des écarts ou interruptions.</small></div></div><div class="step"><span class="step-num">3</span><div><strong>Prévisualisation</strong><small>Consultation de la semaine sans écriture côté serveur.</small></div></div></div></section><section class="card"><div class="card-head"><h2 class="card-title">État du raccordement</h2></div><div class="card-body"><span class="chip warn">Publication en attente de sécurisation</span><p class="muted" style="margin-top:13px">Les comptes et la synchronisation des plannings réels seront activés après validation des permissions.</p></div></section></div></div>';
}
function settings(){
  return header('CONFIGURATION','Paramètres de l’aperçu','Cette première version fonctionne sans accéder aux données du magasin.')+
  '<div class="layout"><section class="card"><div class="card-head"><h2 class="card-title">Environnement</h2></div><div class="mini-list"><div class="mini-row"><span>Mode</span><span class="chip info">Démonstration</span></div><div class="mini-row"><span>Connexion aux comptes</span><span class="chip warn">Non activée</span></div><div class="mini-row"><span>Publication en base</span><span class="chip warn">Désactivée</span></div><div class="mini-row"><span>Prévisualisation Excel</span><span class="chip">Locale uniquement</span></div><div class="mini-row"><span>Installation PWA</span><span class="chip info">Sur serveur HTTPS</span></div></div></section><section class="card"><div class="card-head"><h2 class="card-title">Réinitialiser la démonstration</h2></div><div class="card-body"><p class="muted" style="margin-bottom:16px">Revient aux horaires fictifs. Les fichiers analysés ne sont pas enregistrés par l’application.</p>'+button('Revenir au planning fictif','reset-demo',true)+'</div></section></div>';
}
function render(){
  refresh();
  document.title='Nethor 2 · '+PAGE_TITLES[state.page];
  document.getElementById('breadcrumb').textContent=PAGE_TITLES[state.page];
  document.querySelectorAll('[data-page]').forEach(el=>{
    const on=el.dataset.page===state.page;
    el.classList.toggle('active',on);
    if(on)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  const pages={dashboard,planning,anomalies,import:importer,team,settings};
  document.getElementById('screen').innerHTML=pages[state.page]();
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileMenu').setAttribute('aria-expanded','false');
}
function setPage(page){
  if(!(page in PAGE_TITLES))return;
  state.page=page;
  render();
  window.scrollTo({top:0,behavior:'instant'});
}
function changeWeek(amount){
  state.week=plusDays(state.week,amount*7);
  state.day=state.week;
  render();
}
function colorFor({cell,workbook}){
  if(!cell)return null;
  const raw=String(cell.v??'').trim().toLowerCase();
  if(['g','b','r','y','o','w'].includes(raw))return raw;
  let fill=null;
  const s=cell.s;
  if(s && typeof s==='object') fill=s.fill||s;
  else if(Number.isInteger(s)&&s>0){
    const style=workbook?.Styles?.CellXf?.[s];
    if(style)fill=workbook.Styles?.Fills?.[style.fillId];
    if(!fill)return undefined;
  }
  const rgb=String(fill?.fgColor?.rgb||fill?.bgColor?.rgb||fill?.fgColor?.value||'').replace(/^#|^FF(?=[0-9A-F]{6}$)/i,'').toUpperCase();
  if(rgb.length===6&&/^[A-F0-9]{6}$/.test(rgb)){
    const r=parseInt(rgb.slice(0,2),16),g=parseInt(rgb.slice(2,4),16),b=parseInt(rgb.slice(4,6),16);
    if(r>235&&g>235&&b>235)return 'w';
    if(g>r*1.17&&g>b*.9)return 'g';
    if(b>r*1.25&&b>g*1.12)return 'b';
    if(r>175&&g<125&&b<150)return 'r';
    if(r>175&&g>130&&b<125)return 'o';
    if(r>175&&g>175&&b<145)return 'y';
  }
  if(s!==undefined&&s!==null&&s!==0)return undefined;
  return cell.v==null||cell.v===''||cell.v===0?null:undefined;
}
function loadXlsx(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(window.__nethorXlsxPromise)return window.__nethorXlsxPromise;
  window.__nethorXlsxPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Lecteur Excel indisponible.'));
    script.onerror=()=>reject(new Error('Impossible de charger le lecteur Excel. Vérifiez votre connexion à Internet.'));
    document.head.appendChild(script);
  }).catch(err=>{window.__nethorXlsxPromise=null;throw err;});
  return window.__nethorXlsxPromise;
}
async function handleFile(file){
  if(!file)return;
  state.importError='';state.importPreview=null;state.importName=file.name;
  if(!/\.(xls|xlsx|xlsm)$/i.test(file.name)){state.importError='Ce fichier n’est pas au format Excel pris en charge.';render();return;}
  if(file.size>10*1024*1024){state.importError='Le fichier dépasse la limite de 10 Mo.';render();return;}
  if(file.size===0){state.importError='Le fichier est vide.';render();return;}
  state.busy=true;render();
  try{
    const XLSX=await loadXlsx();
    const model=await readPlanningFile(file,XLSX,colorFor);
    if(model.employees.length>200)throw new Error('Plus de 200 noms détectés : vérifiez le modèle Excel.');
    const preview=buildImportPreview(model);
    state.imported=model;
    state.importPreview=preview;
    state.importError='';
  }catch(err){
    state.imported=null;state.importPreview=null;
    state.importError=String(err?.message||'La lecture du classeur a échoué.');
  }finally{state.busy=false;render();}
}
document.addEventListener('click',event=>{
  const page=event.target.closest('[data-page]');
  if(page){setPage(page.dataset.page);return;}
  const day=event.target.closest('[data-day]');
  if(day){state.day=day.dataset.day;state.view='day';render();return;}
  const el=event.target.closest('[data-action]');
  if(!el)return;
  const action=el.dataset.action;
  if(action==='go-import')setPage('import');
  else if(action==='go-planning')setPage('planning');
  else if(action==='week-view'||action==='day-view'){state.view=action==='week-view'?'week':'day';render();}
  else if(action==='prev-week')changeWeek(-1);
  else if(action==='next-week')changeWeek(1);
  else if(action==='activate-file'&&state.imported){state.mode='file';state.week=state.imported.weekStart;state.day=state.week;setPage('planning');}
  else if(action==='clear-file'){state.imported=null;state.importPreview=null;state.importError='';state.importName='';render();}
  else if(action==='reset-demo'){state.mode='demo';state.imported=null;state.importPreview=null;state.importError='';state.week=mondayOf(today);state.day=today;setPage('dashboard');}
});
document.addEventListener('change',event=>{
  if(event.target.id==='workbookFile')handleFile(event.target.files?.[0]);
});
document.addEventListener('input',event=>{
  if(event.target.id==='teamSearch'){
    const start=event.target.selectionStart||0;
    state.search=event.target.value;render();
    const field=document.getElementById('teamSearch');
    field?.focus();field?.setSelectionRange(start,start);
  }
});
document.addEventListener('dragover',event=>{
  if(event.target.closest('#dropzone')){event.preventDefault();event.target.closest('#dropzone').classList.add('dragging');}
});
document.addEventListener('dragleave',event=>event.target.closest('#dropzone')?.classList.remove('dragging'));
document.addEventListener('drop',event=>{
  const zone=event.target.closest('#dropzone');
  if(!zone)return;
  event.preventDefault();zone.classList.remove('dragging');
  handleFile(event.dataTransfer?.files?.[0]);
});
document.getElementById('mobileMenu').addEventListener('click',()=>{
  const sidebar=document.getElementById('sidebar');
  const open=sidebar.classList.toggle('open');
  document.getElementById('mobileMenu').setAttribute('aria-expanded',String(open));
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){document.getElementById('sidebar').classList.remove('open');document.getElementById('mobileMenu').setAttribute('aria-expanded','false');}
});
render();
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
}

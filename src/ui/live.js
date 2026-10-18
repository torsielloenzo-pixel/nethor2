import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from '../config/public.js';
import {loadAuthorizedSession} from '../auth/session-gate.js';
import {resolveLoginEmail} from '../auth/login-identifier.js';
import {getPlanningWeek,getImportHistory,publishPlanningWeek,verifyPublishedWeek} from '../data/planning-repository.js';
import {analyzeEmployeeDay,compareContractHours} from '../domain/planning-core.js';
import {normalizeName} from '../domain/employee-linker.js';
import {readPlanningFile} from '../import/excel-structure.js';

const ROOT=document.getElementById('app');
const DAYS=['Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.','Dim.'];
const TITLES={home:'Vue d’ensemble',planning:'Planning',anomalies:'Anomalies',import:'Importer',team:'Équipe',history:'Historique',settings:'Paramètres'};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const padded=value=>String(value).padStart(2,'0');
const parseDate=value=>new Date(value+'T12:00:00');
const iso=date=>[date.getFullYear(),padded(date.getMonth()+1),padded(date.getDate())].join('-');
const plusDays=(day,n)=>{const d=parseDate(day);d.setDate(d.getDate()+n);return iso(d);};
const mondayOf=day=>{const d=parseDate(day);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);};
const datesFor=week=>Array.from({length:7},(_,i)=>plusDays(week,i));
const shortDate=day=>parseDate(day).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
const longDate=day=>parseDate(day).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
const hhmm=n=>padded(Math.floor(n/60))+':'+padded(Math.round(n%60));
const hours=n=>Number.isFinite(n)?Number(n.toFixed(2)).toLocaleString('fr-FR')+' h':'—';
const button=(text,action,primary=false)=>'<button type="button" class="btn '+(primary?'primary':'')+'" data-action="'+escapeHtml(action)+'">'+escapeHtml(text)+'</button>';
const person=name=>{const initials=String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();return '<span class="person"><span class="person-bubble">'+escapeHtml(initials)+'</span>'+escapeHtml(name)+'</span>';};
const listRole=role=>({'admin':'Administrateur','role_point-de-vente':'Point de vente','responsable':'Responsable','employe':'Employé'})[role]||role;
const state={week:mondayOf(iso(new Date())),day:iso(new Date()),page:'home',view:'week',access:'none',user:null,profile:null,profiles:[],weekData:null,loading:false,busy:false,importFile:null,importModel:null,importAnalysis:null,importExisting:null,importError:'',history:[],notice:'',error:'',search:'',lastCheck:0};
let client;
let booted=false;

function showMessage(text,kind='error'){
  const block=ROOT.querySelector('#authMessage');
  if(block){block.textContent=text;block.className=kind==='error'?'form-error':'live-message';block.hidden=false;}
}
function renderLogin(message=''){
  document.title='Nethor 2 · Connexion';
  ROOT.innerHTML='<div class="login-page"><section class="login-brandpanel"><div class="login-brand">NETHOR²<small>PLANNING · LE THOR</small></div><div><h1>Le planning, plus clair. L’équipe, mieux organisée.</h1><p>Votre espace de travail sécurisé pour consulter les horaires, contrôler les anomalies et gérer les importations autorisées.</p></div><footer>Application interne — accès réservé aux comptes habilités</footer></section><div class="login-main"><form class="login-card" id="loginForm" autocomplete="on"><div class="eyebrow">ESPACE PROFESSIONNEL</div><h2>Connexion</h2><p>Connectez-vous avec votre adresse e-mail ou votre identifiant Nethor habituel.</p><label for="loginEmail">Identifiant ou adresse e-mail</label><input type="text" id="loginEmail" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="254" placeholder="Identifiant ou adresse e-mail"><label for="loginPassword">Mot de passe</label><input type="password" id="loginPassword" required autocomplete="current-password"><div id="authMessage" class="form-error" role="alert" '+(message?'':'hidden')+'>'+escapeHtml(message)+'</div><button type="submit" class="btn primary" id="loginSubmit">Se connecter</button><div class="form-note">Aucun nouveau compte n’est créé ici. La désactivation et les autorisations sont vérifiées côté serveur.</div></form></div></div>';
}
function renderShell(){
  ROOT.innerHTML='<div class="app"><aside class="sidebar live-sidebar" id="sidebar"><div class="brand"><span class="brand-symbol"><i></i><i></i><i></i><i></i></span><span><strong>NETHOR<span class="brand-number">2</span></strong><small>PLANNING · LE THOR</small></span></div><p class="nav-caption">VOTRE ESPACE</p><nav aria-label="Navigation">'+Object.entries(TITLES).map(([key,name])=>'<button type="button" class="nav-item" data-page="'+key+'" data-nav="'+key+'"><span>'+({'home':'▦','planning':'▤','anomalies':'◇','import':'⇧','team':'♧','history':'▥','settings':'⚙'}[key])+'</span>'+name+'</button>').join('')+'</nav><div class="side-bottom"><div class="side-info"><span class="status-dot"></span> Connecté à Nethor<small>Accès contrôlé par Supabase</small></div></div></aside><div class="workspace live-workspace"><header class="topbar"><div class="top-left"><button type="button" class="mobile-brand" id="mobileMenu" aria-label="Ouvrir la navigation">☰</button><div><span class="breadcrumb">NETHOR 2 <span class="sep">/</span><span id="breadPage">Accueil</span></span><span class="top-context">Netto Le Thor · Planning du personnel</span></div></div><div class="top-actions"><span class="live-tag">● CONNECTÉ</span><span class="live-account" id="liveName"></span><button type="button" class="logout-btn" data-action="logout">Déconnexion</button></div></header><main id="screen" tabindex="-1" aria-live="polite"></main><footer class="live-bottom"><span>Nethor 2 · Application officielle</span><span>Comptes et planning reliés à Supabase</span></footer></div></div><nav class="live-navigator" aria-label="Navigation rapide"><button data-page="home">▦ <span>Accueil</span></button><button data-page="planning">▤ <span>Planning</span></button><button data-page="anomalies">◇ <span>Alertes</span></button><button data-page="team">♧ <span>Équipe</span></button></nav>';
  ROOT.querySelector('#liveName').textContent=state.profile.display_name||listRole(state.profile.role);
  ROOT.querySelectorAll('[data-nav="import"],[data-nav="history"]').forEach(el=>{
    if(el.dataset.nav==='import'&&state.access!=='manage')el.hidden=true;
    if(el.dataset.nav==='history'&&state.profile.role!=='admin')el.hidden=true;
  });
}
async function checkSession(){
  const gate=await loadAuthorizedSession(client);
  if(gate.status!=='authorized')return null;
  const {data,error}=await client.rpc('nethor2_my_planning_permission');
  if(error)throw Error('Impossible de vérifier les droits Planning : '+error.message);
  const access=String(data||'none');
  if(!['view','operate','manage'].includes(access))return null;
  return {gate,access};
}
async function signOut(){
  try{await client.auth.signOut();}catch(err){console.warn('Déconnexion',err);}
  state.user=null;state.profile=null;state.weekData=null;state.profiles=[];state.importFile=null;state.importModel=null;state.importAnalysis=null;
  renderLogin();
}
async function startAuthorized(access){
  state.user=access.gate.user;
  state.profile=access.gate.profile;
  state.access=access.access;
  state.lastCheck=Date.now();
  renderShell();
  await loadProfiles();
  await loadWeek();
}
async function loadProfiles(){
  const {data,error}=await client.from('profiles').select('id,display_name,planning_name,contract_hours,account_enabled,role').order('display_name',{ascending:true});
  if(error){state.profiles=[];console.warn('Liste des profils restreinte par les autorisations.');return;}
  state.profiles=Array.isArray(data)?data:[];
  const own=state.profiles.find(profile=>profile.id===state.user?.id);
  if(own)state.profile={...state.profile,planning_name:own.planning_name,contract_hours:own.contract_hours};
}
function visibleModel(){
  const source=state.weekData?.model;
  if(!source||!Array.isArray(source.employees)||!source.days)return null;
  const disabled=new Set();
  for(const p of state.profiles){
    if(p.account_enabled===false){if(p.planning_name)disabled.add(normalizeName(p.planning_name));if(p.display_name)disabled.add(normalizeName(p.display_name));}
  }
  const keep=source.employees.map((e,i)=>({e,i})).filter(x=>!disabled.has(normalizeName(x.e.name)));
  if(keep.length===source.employees.length)return source;
  const days=Object.fromEntries(Object.entries(source.days).map(([date,day])=>[date,{...day,cells:keep.map(x=>day.cells?.[x.i])}]));
  return {...source,employees:keep.map(x=>x.e),days};
}
function analyze(model){
  if(!model||!Array.isArray(model.employees)||!model.days)return {people:[],issues:[],coverage:[]};
  const dates=datesFor(model.weekStart),people=[],issues=[];
  const slots=Number(model.slotCount)||58;
  const minutes=Number(model.slotMinutes)||15;
  const start=Number(model.startTime??6)*60;
  for(let i=0;i<model.employees.length;i++){
    const employee=model.employees[i];
    const profile=state.profiles.find(p=>normalizeName(p.planning_name||p.display_name)===normalizeName(employee.name));
    const days=dates.map(date=>{
      const cells=model.days[date]?.cells?.[i];
      if(!Array.isArray(cells)||cells.length!==slots)return {date,hours:0,ranges:[],issues:[{code:'INVALID_ROW',severity:'error'}]};
      try{
        return {date,...analyzeEmployeeDay({employeeId:profile?.id||null,cells,startMinutes:start,minutesPerSlot:minutes})};
      }catch{return {date,hours:0,ranges:[],issues:[{code:'INVALID_ROW',severity:'error'}]};}
    });
    const total=Number(days.reduce((sum,d)=>sum+d.hours,0).toFixed(2));
    const fromExcel=Number(employee.excelContractHours);
    const fromProfile=Number(profile?.contract_hours);
    const contract=Number.isFinite(fromExcel)&&employee.excelContractHours!=null?fromExcel:profile?.contract_hours!=null&&Number.isFinite(fromProfile)?fromProfile:null;
    const difference=contract===null?null:compareContractHours(total,contract);
    for(const d of days)for(const issue of d.issues)issues.push({...issue,name:employee.name,date:d.date});
    if(difference!==null&&difference!==0)issues.push({code:'CONTRACT_DIFFERENCE',name:employee.name,difference,contract,total,severity:'info'});
    people.push({name:employee.name,profile,total,contract,difference,days});
  }
  const coverage=dates.map((date,di)=>{
    const cells=model.days[date]?.cells||[];
    const working=Array.from({length:slots},(_,s)=>cells.reduce((sum,row)=>sum+(row?.[s]==='g'||row?.[s]==='b'?1:0),0));
    const present=people.filter(p=>p.days[di].hours>0).length;
    const active=working.filter(n=>n>0);
    if(active.length && active.filter(n=>n===1).length>=4){
      issues.push({code:'LOW_COVERAGE',name:'Magasin',date,minutes:active.filter(n=>n===1).length*minutes,severity:'info'});
    }
    return {date,present,max:Math.max(0,...working),min:active.length?Math.min(...active):0};
  });
  return {people,issues,coverage};
}
async function loadWeek(){
  state.loading=true;state.error='';render();
  try{
    const result=await getPlanningWeek(client,state.week);
    state.weekData=result;
  }catch(err){state.weekData=null;state.error='Lecture du planning impossible : '+String(err.message||err);}
  finally{state.loading=false;render();}
}
function renderPageHeader(category,title,description,actions=''){
  return '<div class="page-header"><div><p class="eyebrow">'+escapeHtml(category)+'</p><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(description)+'</p></div>'+(actions?'<div class="actions">'+actions+'</div>':'')+'</div>';
}
function shift(ranges){
  if(!ranges?.length)return '<div class="off">Repos</div>';
  return '<div class="shift">'+ranges.map(r=>hhmm(r.startMinutes)+'–'+hhmm(r.endMinutes)).join('<i>puis</i>')+'</div>';
}
function summary(metrics){
  const planned=metrics.people.filter(p=>p.total>0).length;
  const total=metrics.people.reduce((sum,p)=>sum+p.total,0);
  return '<section class="live-summary"><article class="live-stat"><label>Collaborateurs planifiés</label><strong>'+planned+'</strong><small>Sur la semaine</small></article><article class="live-stat"><label>Heures planifiées</label><strong>'+hours(total)+'</strong><small>Total calculé</small></article><article class="live-stat"><label>Points à vérifier</label><strong>'+metrics.issues.length+'</strong><small>Contrôles automatiques</small></article></section>';
}
function weekNav(){
  return '<div class="live-week-wrapper"><div class="live-paging"><button class="icon-btn" data-action="prev" aria-label="Semaine précédente">‹</button><strong>'+shortDate(state.week)+' – '+shortDate(plusDays(state.week,6))+'</strong><button class="icon-btn" data-action="next" aria-label="Semaine suivante">›</button></div><div class="segmented"><button data-action="week-view" class="'+(state.view==='week'?'selected':'')+'">Semaine</button><button data-action="day-view" class="'+(state.view==='day'?'selected':'')+'">Jour</button></div></div>';
}
function planningCard(metrics){
  let content='';
  const dates=datesFor(state.week);
  if(!state.weekData)content='<div class="live-empty"><strong>Aucun planning publié pour cette semaine</strong>Utilise les flèches pour choisir une semaine existante.</div>';
  else if(state.view==='week'){
    content='<div class="table-scroll"><table class="table"><thead><tr><th>Collaborateur</th>'+dates.map((d,i)=>'<th>'+DAYS[i]+'<br>'+shortDate(d)+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+metrics.people.map(p=>'<tr><td>'+person(p.name)+'</td>'+p.days.map(day=>'<td>'+shift(day.ranges)+'</td>').join('')+'<td class="live-hours">'+hours(p.total)+'</td></tr>').join('')+'</tbody></table></div>';
  }else{
    if(!dates.includes(state.day))state.day=state.week;
    const di=dates.indexOf(state.day);
    content='<div class="live-day-nav">'+dates.map((d,i)=>'<button data-day="'+d+'" class="'+(d===state.day?'active':'')+'">'+DAYS[i]+'<br>'+shortDate(d)+'</button>').join('')+'</div><div class="live-day-grid">'+metrics.people.map(p=>'<div class="live-day-item">'+person(p.name)+shift(p.days[di].ranges)+'<div class="sub">'+hours(p.days[di].hours)+' travaillées</div></div>').join('')+'</div>';
  }
  return '<section class="card live-week-card"><div class="card-head"><div><h2 class="card-title">Planning de l’équipe</h2><p class="sub">'+(state.weekData?escapeHtml(state.weekData.sourceFile||'Semaine publiée'):'Aucune version enregistrée')+'</p></div><button type="button" class="text-link" data-action="refresh">Actualiser ↻</button></div>'+weekNav()+content+'</section>';
}
const issueLabels={SHORT_SHIFT:['Créneau très court','Plage de travail de 30 minutes ou moins'],LONG_BREAK:['Longue coupure','Interruption d’au moins 2 heures'],LONG_DAY:['Journée longue','Plus de 10 heures planifiées sur une journée'],CONTRACT_DIFFERENCE:['Différence heures contrat','Écart informatif entre heures planifiées et volume contractuel'],LOW_COVERAGE:['Couverture limitée','Une seule personne planifiée pendant une période prolongée'],INVALID_ROW:['Données incohérentes','Le tableau ne correspond pas à la structure attendue']};
function issueRows(issues,limit=Infinity){
  const selected=issues.slice(0,limit);
  if(!selected.length)return '<div class="live-empty"><strong>Aucune anomalie relevée</strong>Les contrôles automatiques ne signalent rien pour cette semaine.</div>';
  return selected.map(item=>{
    const info=issueLabels[item.code]||['Point à vérifier','Contrôle manuel nécessaire'];
    return '<div class="live-alert"><span class="alert-icon '+(item.severity==='error'?'error':'')+'">◇</span><div><strong>'+escapeHtml(item.name)+' · '+info[0]+'</strong><p>'+info[1]+(item.date?' · '+shortDate(item.date):'')+(item.difference!=null?' · '+hours(item.difference):'')+'</p></div></div>';
  }).join('');
}
function alertsCard(metrics,limited){
  return '<section class="card"><div class="card-head"><div><h2 class="card-title">Détection d’anomalies</h2><p class="sub">'+metrics.issues.length+' point(s) à vérifier</p></div>'+(limited?'<button class="text-link" data-page="anomalies">Tout voir →</button>':'')+'</div>'+issueRows(metrics.issues,limited?5:Infinity)+'</section>';
}
function coverageCard(metrics){
  const max=Math.max(1,...metrics.coverage.map(d=>d.present));
  return '<section class="card"><div class="card-head"><div><h2 class="card-title">Couverture du magasin</h2><p class="sub">Effectifs planifiés par journée</p></div></div><div class="card-body">'+metrics.coverage.map((r,i)=>'<div class="live-coverage-row"><span><b>'+DAYS[i]+' '+shortDate(r.date)+'</b>'+r.present+' personne(s)</span><div class="live-progress"><div style="width:'+(r.present/max*100)+'%"></div></div></div>').join('')+'</div></section>';
}
function pageHome(metrics){
  const me=state.profile.planning_name||state.profile.display_name;
  const mine=metrics.people.find(p=>normalizeName(p.name)===normalizeName(me));
  let personal='';
  if(mine)personal='<div class="live-message ok">Mon planning cette semaine : <strong>'+hours(mine.total)+'</strong> · '+escapeHtml(mine.name)+'</div>';
  return renderPageHeader('NETTO LE THOR','Bonjour '+(state.profile.display_name||'')+',','Retrouve les horaires de l’équipe et les contrôles de la semaine.',state.access==='manage'?button('Importer un planning','go-import',true):button('Voir le planning','go-planning',true))+personal+summary(metrics)+'<div class="layout"><div class="stack">'+planningCard(metrics)+coverageCard(metrics)+'</div><div class="stack">'+alertsCard(metrics,true)+'</div></div>';
}
function pagePlanning(metrics){
  return renderPageHeader('PLANNING','Planning du personnel','Horaires publiés et contrôlés selon tes autorisations.',state.access==='manage'?button('Importer Excel','go-import',true):'')+summary(metrics)+planningCard(metrics);
}
function pageAnomalies(metrics){
  return renderPageHeader('ANALYSE','Points à vérifier','Contrôles indicatifs : créneaux, pauses, journées longues et heures contractuelles.')+summary(metrics)+alertsCard(metrics,false)+'<p class="live-muted" style="margin-top:17px">Une anomalie de planning n’équivaut pas nécessairement à une infraction. Les règles métier doivent être vérifiées.</p>';
}
function pageTeam(metrics){
  const filter=normalizeName(state.search);
  const visible=metrics.people.filter(p=>normalizeName(p.name).includes(filter));
  const accounts=state.profiles.filter(p=>p.account_enabled===true);
  const rows=visible.map(p=>{
    const details='<div>'+person(p.name)+'<p class="live-small">'+hours(p.total)+' · '+(p.contract===null?'Contrat non renseigné':'Contrat : '+hours(p.contract))+'</p></div>';
    let right='<span class="chip '+(p.profile?'':'warn')+'">'+(p.profile?'Profil associé':'Association à contrôler')+'</span>';
    if(state.profile.role==='admin'){
      const opts='<option value="">Choisir un compte</option>'+accounts.map(a=>'<option value="'+escapeHtml(a.id)+'" '+(a.id===p.profile?.id?'selected':'')+'>'+escapeHtml(a.display_name||'Utilisateur')+'</option>').join('');
      right='<div class="live-controls"><select class="btn" aria-label="Compte à associer à '+escapeHtml(p.name)+'" data-link-select="'+escapeHtml(p.name)+'">'+opts+'</select><button type="button" class="btn" data-link-save="'+escapeHtml(p.name)+'">Associer</button></div>';
    }
    return '<div class="live-person">'+details+right+'</div>';
  }).join('');
  return renderPageHeader('ÉQUIPE','Collaborateurs planifiés','Identités lues depuis le planning publié et associées aux profils autorisés.')+
    '<div class="filter-row"><input id="searchTeam" value="'+escapeHtml(state.search)+'" placeholder="Rechercher un collaborateur" aria-label="Rechercher"></div>'+
    '<section class="card"><div class="card-head"><div><h2 class="card-title">Personnes présentes dans la semaine</h2><p class="sub">'+metrics.people.length+' personne(s) dans le planning</p></div></div>'+
    '<div class="live-person-list">'+(rows||'<div class="live-empty">Aucun résultat.</div>')+'</div></section>'+
    '<p class="live-muted" style="margin-top:14px">Les profils désactivés visibles par l’administrateur sont masqués de cette interface. La création et la désactivation des comptes restent administrées par les outils existants.</p>';
}
function pageSettings(){
  return renderPageHeader('SESSION','Paramètres','Droits et informations de ton accès Nethor.')+'<div class="layout"><div class="stack"><section class="card"><div class="card-head"><h2 class="card-title">Mon compte</h2></div><div class="mini-list"><div class="mini-row"><span>Nom</span><strong>'+escapeHtml(state.profile.display_name||'—')+'</strong></div><div class="mini-row"><span>Rôle</span><strong>'+escapeHtml(listRole(state.profile.role))+'</strong></div><div class="mini-row"><span>Accès Planning</span><span class="chip">'+escapeHtml(state.access)+'</span></div><div class="mini-row"><span>Source</span><span class="chip info">Supabase connecté</span></div></div></section></div><div class="stack"><section class="card"><div class="card-head"><h2 class="card-title">Sécurité</h2></div><div class="card-body"><p class="muted">Les sessions sont contrôlées et les données personnelles ne sont pas enregistrées dans le cache applicatif.</p><div style="margin-top:16px">'+button('Déconnexion','logout')+'</div></div></section></div></div>';
}
function pageImport(){
  if(state.access!=='manage')return '<div class="live-error">Tu n’as pas les droits de gérer le planning.</div>';
  let body='<section class="card"><div class="card-head"><div><h2 class="card-title">Fichier Excel</h2><p class="sub">Glisser-déposer ou sélection · .xls / .xlsx / .xlsm · maximum 10 Mo</p></div></div><label class="live-import-drop" id="importDrop"><strong>⇧ Importer un fichier planning</strong><span>Le fichier est analysé localement avant validation</span><input type="file" id="excelFile" accept=".xls,.xlsx,.xlsm"></label></section>';
  if(state.busy)body+='<div class="live-message">Traitement en cours…</div>';
  if(state.importError)body+='<div class="live-error">'+escapeHtml(state.importError)+'</div>';
  if(state.importAnalysis){
    const a=state.importAnalysis;
    const old=state.importExisting?.model;
    const oldName=old?(old.sourceFile||'Version précédente'):'Aucune version publiée';
    body+='<section class="card"><div class="card-head"><div><h2 class="card-title">Aperçu avant publication</h2><p class="sub">Semaine du '+longDate(state.importModel.weekStart)+' · '+a.people.length+' collaborateurs</p></div></div><div class="live-file-meta"><strong>'+escapeHtml(state.importFile.name)+'</strong><span>Version actuelle : '+escapeHtml(oldName)+'</span><span>'+a.issues.length+' point(s) à vérifier avant validation</span></div><div class="table-scroll"><table class="live-import-table"><thead><tr><th>Collaborateur</th><th>Heures importées</th><th>Ancienne version</th></tr></thead><tbody>'+a.people.map(p=>{const oldEmployee=old?.employees?.find(e=>normalizeName(e.name)===normalizeName(p.name));let oldTotal='—';if(oldEmployee){const idx=old.employees.indexOf(oldEmployee);const min=Number(old.slotMinutes)||15;let n=0;for(const d of Object.values(old.days||{})){const row=d.cells?.[idx]||[];n+=row.filter(c=>c==='g'||c==='b').length*min/60;}oldTotal=hours(n);}return '<tr><td>'+escapeHtml(p.name)+'</td><td>'+hours(p.total)+'</td><td>'+oldTotal+'</td></tr>';}).join('')+'</tbody></table></div><div class="live-publish"><strong>Confirmation de publication</strong>La publication remplacera la semaine active après vérification de sa révision. Le fichier Excel d’origine sera archivé dans un espace privé.<label class="live-ack"><input id="publishAck" type="checkbox">Je confirme avoir vérifié les horaires, la période et les anomalies avant de publier.</label><div style="margin-top:14px">'+button('Publier ce planning','publish',true)+' '+button('Annuler','clear-import')+'</div></div></section>';
  }
  return renderPageHeader('IMPORT EXCEL','Importer un planning','Analyse, comparaison et validation avant publication en base.')+'<div class="live-banner">Seuls les comptes disposant du droit <strong>Gestion du planning</strong> peuvent publier. Les imports sont versionnés : un autre changement de semaine provoque un conflit plutôt qu’un écrasement silencieux.</div>'+body;
}
function pageHistory(){
  if(state.profile.role!=='admin')return '<div class="live-error">Historique réservé à l’administration.</div>';
  return renderPageHeader('TRAÇABILITÉ','Historique des imports','Fichiers et versions archivés dans Supabase.',button('Actualiser','history-refresh'))+'<section class="card"><div class="card-head"><h2 class="card-title">Archives Excel</h2></div><div class="mini-list">'+(state.history.length?state.history.map(x=>'<div class="mini-row"><div><strong>'+escapeHtml(x.file_name)+'</strong><small>Semaine '+escapeHtml(x.week_start)+' · '+escapeHtml(x.imported_by_name)+' · '+escapeHtml(x.imported_at?new Date(x.imported_at).toLocaleString('fr-FR'):'')+'</small></div>'+(x.storage_path?'<button class="btn" data-download="'+escapeHtml(String(x.storage_path))+'">Télécharger</button>':'')+'</div>').join(''):'<div class="live-empty"><strong>Aucune archive disponible</strong>Les imports publiés et archivés apparaîtront ici.</div>')+'</div></section>';
}
function render(){
  const screen=ROOT.querySelector('#screen');
  if(!screen||!state.profile)return;
  if(state.page==='import'&&state.access!=='manage')state.page='planning';
  if(state.page==='history'&&state.profile.role!=='admin')state.page='planning';
  document.title='Nethor 2 · '+TITLES[state.page];
  ROOT.querySelector('#breadPage').textContent=TITLES[state.page];
  ROOT.querySelectorAll('[data-page]').forEach(el=>{
    el.classList.toggle('active',el.dataset.page===state.page);
    if(el.dataset.page===state.page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  const model=visibleModel(),metrics=analyze(model);
  const pages={home:()=>pageHome(metrics),planning:()=>pagePlanning(metrics),anomalies:()=>pageAnomalies(metrics),import:pageImport,team:()=>pageTeam(metrics),history:pageHistory,settings:pageSettings};
  let top='';
  if(state.loading)top+='<div class="live-message">Chargement du planning…</div>';
  if(state.error)top+='<div class="live-error">'+escapeHtml(state.error)+'</div>';
  if(state.notice)top+='<div class="live-message ok">'+escapeHtml(state.notice)+'</div>';
  screen.innerHTML=top+pages[state.page]();
}
function go(page){
  if(!(page in TITLES))return;
  state.page=page;state.notice='';state.error='';
  ROOT.querySelector('#sidebar')?.classList.remove('open');
  if(page==='history')void loadHistory();else render();
  window.scrollTo({top:0,behavior:'instant'});
}
async function loadHistory(){
  state.loading=true;render();
  try{state.history=await getImportHistory(client,{limit:100});state.error='';}
  catch(err){state.error='Impossible de charger l’historique : '+String(err.message||err);}
  finally{state.loading=false;render();}
}
function resolveExcelColor({cell,workbook}){
  if(!cell)return null;
  const raw=String(cell.v??'').trim().toLowerCase();
  if(['g','b','r','y','o','w'].includes(raw))return raw;
  let fill=null;
  const s=cell.s;
  if(s&&typeof s==='object')fill=s.fill||s;
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
    if(r>205&&g>205&&b<160)return 'y';
    if(r>175&&g>130&&b<125)return 'o';
  }
  if(s!==undefined&&s!==null&&s!==0)return undefined;
  return cell.v==null||cell.v===''||cell.v===0?null:undefined;
}
let xlsxPromise;
async function getXlsx(){
  if(window.XLSX)return window.XLSX;
  if(xlsxPromise)return xlsxPromise;
  xlsxPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('Lecteur Excel indisponible.'));
    script.onerror=()=>reject(Error('Le module Excel ne peut pas être chargé.'));
    document.head.appendChild(script);
  });
  try{return await xlsxPromise;}catch(err){xlsxPromise=null;throw err;}
}
async function selectFile(file){
  if(!file)return;
  state.importFile=null;state.importModel=null;state.importExisting=null;state.importAnalysis=null;state.importError='';
  if(!/\.(xls|xlsx|xlsm)$/i.test(file.name)){state.importError='Extension non reconnue.';render();return;}
  if(file.size===0||file.size>10*1024*1024){state.importError='Le fichier doit contenir entre 1 octet et 10 Mo.';render();return;}
  state.busy=true;render();
  try{
    const XLSX=await getXlsx();
    const model=await readPlanningFile(file,XLSX,resolveExcelColor);
    if(model.employees.length>200)throw Error('Plus de 200 collaborateurs détectés.');
    const data=analyze(model);
    const existing=await getPlanningWeek(client,model.weekStart);
    state.importFile=file;state.importModel=model;state.importAnalysis=data;state.importExisting=existing;
  }catch(err){state.importError='Impossible de lire ce planning : '+String(err.message||err);}
  finally{state.busy=false;render();}
}
async function publish(){
  if(state.busy||state.access!=='manage'||!state.importModel||!state.importFile)return;
  const ack=ROOT.querySelector('#publishAck');
  if(!ack?.checked){state.importError='Veuillez confirmer la vérification du planning.';render();return;}
  if(!window.confirm('Publier le planning du '+longDate(state.importModel.weekStart)+' et remplacer sa version actuelle ?'))return;
  state.busy=true;state.importError='';render();
  let uploadedPath=null;
  let publicationAttempted=false;
  try{
    const gate=await checkSession();
    if(!gate||gate.access!=='manage')throw Error('Vos autorisations ont changé. Publication refusée.');
    const model=state.importModel;
    const latest=await getPlanningWeek(client,model.weekStart);
    if((latest?.revision||null)!==(state.importExisting?.revision||null))throw Error('Le planning a changé depuis la prévisualisation. Rechargez le fichier avant publication.');
    const safe=state.importFile.name.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,96);
    const path='nethor2/'+model.weekStart+'/'+crypto.randomUUID()+'/'+safe;
    const mime=/\.xls$/i.test(state.importFile.name)?'application/vnd.ms-excel':/\.xlsm$/i.test(state.importFile.name)?'application/vnd.ms-excel.sheet.macroenabled.12':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const upload=await client.storage.from('planning-files').upload(path,state.importFile,{upsert:false,contentType:mime,cacheControl:'3600'});
    if(upload.error)throw Error('Archivage du fichier impossible : '+upload.error.message);
    uploadedPath=path;
    const data={...model,sourceFile:state.importFile.name,sourcePath:path,importedAt:new Date().toISOString()};
    publicationAttempted=true;
    const outcome=await publishPlanningWeek(client,{weekStart:model.weekStart,expectedRevision:latest?.revision||null,model:data});
    if(outcome.status==='conflict')throw Error('Une autre publication a eu lieu. Rien n’a été écrasé.');
    const verified=await verifyPublishedWeek(client,model.weekStart,outcome.revision);
    if(!verified)throw Error('La publication a été acceptée mais sa révision reste non confirmée. Vérifiez le planning avant toute nouvelle opération.');
    uploadedPath=null;
    state.week=model.weekStart;state.day=model.weekStart;state.importFile=null;state.importModel=null;state.importAnalysis=null;state.importExisting=null;state.page='planning';
    state.notice='Planning publié et vérifié. Le fichier original est archivé.';
    state.weekData=await getPlanningWeek(client,state.week);
  }catch(err){
    state.importError=String(err.message||err);
    if(uploadedPath&&!publicationAttempted){
      try{await client.storage.from('planning-files').remove([uploadedPath]);}catch(e){console.warn('Archive temporaire à vérifier',e);}
    }
    // Si une écriture a peut-être eu lieu, conserver l'original pour éviter une perte de traçabilité.
  }finally{state.busy=false;render();}
}
async function saveLink(name){
  if(state.profile.role!=='admin'||!state.user)throw Error('Accès administrateur obligatoire.');
  const select=[...ROOT.querySelectorAll('[data-link-select]')].find(el=>el.dataset.linkSelect===name);
  const id=select?.value;
  if(!id)throw Error('Sélectionne un compte.');
  const profile=state.profiles.find(p=>p.id===id&&p.account_enabled===true);
  if(!profile)throw Error('Compte désactivé ou introuvable.');
  const duplicate=state.profiles.some(p=>p.id!==id&&p.account_enabled===true&&normalizeName(p.planning_name)===normalizeName(name));
  if(duplicate)throw Error('Ce nom est déjà associé à un autre compte actif.');
  if(!window.confirm('Associer '+name+' au compte '+(profile.display_name||'sélectionné')+' ?'))return;
  const gate=await checkSession();
  if(!gate||gate.gate.profile.role!=='admin')throw Error('Session administrateur non validée.');
  const {data,error}=await client.from('profiles').update({planning_name:name}).eq('id',id).eq('account_enabled',true).select('id,planning_name').maybeSingle();
  if(error||!data)throw Error(error?.message||'Association non confirmée.');
  await loadProfiles();
  state.notice='Association enregistrée pour '+name;state.error='';
  render();
}
async function downloadHistory(path){
  if(state.profile.role!=='admin')return;
  const record=state.history.find(x=>x.storage_path===path);
  if(!record)return;
  const {data,error}=await client.storage.from('planning-files').download(path);
  if(error){state.error='Téléchargement refusé : '+error.message;render();return;}
  const u=URL.createObjectURL(data);const a=document.createElement('a');a.href=u;a.download=record.file_name||'planning.xls';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
async function verifyResume(){
  if(!state.user||Date.now()-state.lastCheck<30000)return;
  state.lastCheck=Date.now();
  try{
    const gate=await checkSession();
    if(!gate){await signOut();return;}
    state.access=gate.access;
    if(state.access!=='manage'&&state.page==='import')state.page='planning';
    render();
  }catch{await signOut();}
}
ROOT.addEventListener('submit',async event=>{
  if(event.target.id!=='loginForm')return;
  event.preventDefault();
  const identifier=ROOT.querySelector('#loginEmail')?.value||'';
  const password=ROOT.querySelector('#loginPassword')?.value||'';
  const submit=ROOT.querySelector('#loginSubmit');
  if(submit){submit.disabled=true;submit.textContent='Connexion…';}
  try{
    const email=resolveLoginEmail(identifier);
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error)throw Error('Identifiants incorrects ou accès indisponible.');
    const gate=await checkSession();
    if(!gate){await client.auth.signOut();throw Error('Votre compte ne dispose pas d’un accès actif au planning.');}
    await startAuthorized(gate);
  }catch(err){showMessage(String(err.message||err));if(submit){submit.disabled=false;submit.textContent='Se connecter';}}
});
ROOT.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-page]');
  if(nav){go(nav.dataset.page);return;}
  const day=event.target.closest('[data-day]');
  if(day){state.day=day.dataset.day;state.view='day';render();return;}
  const link=event.target.closest('[data-link-save]');
  if(link){try{await saveLink(link.dataset.linkSave);}catch(err){state.error=String(err.message||err);render();}return;}
  const dl=event.target.closest('[data-download]');
  if(dl){await downloadHistory(dl.dataset.download);return;}
  const b=event.target.closest('[data-action]');
  if(!b)return;
  const action=b.dataset.action;
  if(action==='logout')await signOut();
  else if(action==='go-import')go('import');
  else if(action==='go-planning')go('planning');
  else if(action==='prev'||action==='next'){state.week=plusDays(state.week,action==='prev'?-7:7);state.day=state.week;await loadWeek();}
  else if(action==='refresh')await loadWeek();
  else if(action==='week-view'||action==='day-view'){state.view=action==='week-view'?'week':'day';render();}
  else if(action==='clear-import'){state.importFile=null;state.importModel=null;state.importAnalysis=null;state.importExisting=null;state.importError='';render();}
  else if(action==='publish')await publish();
  else if(action==='history-refresh')await loadHistory();
});
ROOT.addEventListener('change',event=>{if(event.target.id==='excelFile')void selectFile(event.target.files?.[0]);});
ROOT.addEventListener('input',event=>{
  if(event.target.id!=='searchTeam')return;
  state.search=event.target.value;
  const position=event.target.selectionStart||0;
  render();
  const el=ROOT.querySelector('#searchTeam');el?.focus();el?.setSelectionRange(position,position);
});
ROOT.addEventListener('dragover',event=>{if(event.target.closest('#importDrop'))event.preventDefault();});
ROOT.addEventListener('drop',event=>{if(event.target.closest('#importDrop')){event.preventDefault();void selectFile(event.dataTransfer?.files?.[0]);}});
ROOT.addEventListener('click',event=>{
  if(event.target.id==='mobileMenu')ROOT.querySelector('#sidebar')?.classList.toggle('open');
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void verifyResume();});
window.addEventListener('focus',()=>void verifyResume());
document.addEventListener('keydown',event=>{if(event.key==='Escape')ROOT.querySelector('#sidebar')?.classList.remove('open');});
async function boot(){
  if(booted)return;booted=true;
  try{
    if(!window.supabase?.createClient)throw Error('La bibliothèque de connexion est inaccessible. Vérifiez votre réseau.');
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'nethor2-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const access=await checkSession();
    if(access)await startAuthorized(access);else renderLogin();
  }catch(err){renderLogin('Connexion indisponible : '+String(err.message||err));}
  if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();

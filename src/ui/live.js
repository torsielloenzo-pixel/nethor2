import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from '../config/public.js';
import {loadAuthorizedSession} from '../auth/session-gate.js';
import {canViewTeam,canNavigate} from './team-access.js';
import {resolveLoginEmail} from '../auth/login-identifier.js';
import {getPlanningWeek,getImportHistory,publishPlanningWeek,verifyPublishedWeek} from '../data/planning-repository.js';
import {analyzeEmployeeDay,compareContractHours} from '../domain/planning-core.js';
import {normalizeName} from '../domain/employee-linker.js';
import {dateInParis,moveDate,mondayFor,personalOverview} from '../domain/personal-overview.js';
import {readPlanningFile} from '../import/excel-structure.js';

const ROOT=document.getElementById('app');
let pendingInstall=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pendingInstall=event;});
window.addEventListener('appinstalled',()=>{pendingInstall=null;ROOT.querySelector('#pwaHomeCard')?.remove();});
function mobileInstallInstructions(){
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return 'Nethor est déjà ouvert en mode application.';
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent))return 'Sur iPhone : ouvre https://nethor.fr/ dans Safari, touche Partager, puis « Sur l’écran d’accueil » et « Ajouter ».';
  if(/Android/i.test(navigator.userAgent))return 'Sur Android : dans Chrome, ouvre ⋮ puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».';
  return 'Sur nethor.fr, dans Chrome ou Edge, utilise le menu « Installer l’application » si cette option est disponible.';
}
async function installPwa(){
  const note=ROOT.querySelector('#installInstructions');
  if(location.origin!=='https://nethor.fr'){
    if(note){note.hidden=false;note.textContent='Pour installer la seule application Nethor, ouvre d’abord https://nethor.fr/ puis utilise ce bouton depuis l’accueil.';}
    return;
  }
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true){
    if(note){note.hidden=false;note.textContent='Nethor est déjà installé sur cet appareil.';}
    return;
  }
  if(pendingInstall){
    const install=pendingInstall;pendingInstall=null;
    try{await install.prompt();await install.userChoice;}catch(err){console.warn('Installation PWA indisponible',err);}
  }else{
    if(note){note.hidden=false;note.textContent=mobileInstallInstructions();}
    else window.alert(mobileInstallInstructions());
  }
}
function closeMobileMenu(){
  ROOT.querySelector('#sidebar')?.classList.remove('open');
  ROOT.classList.remove('menu-open');
  ROOT.querySelector('#mobileMenu')?.setAttribute('aria-expanded','false');
}

const DAYS=['Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.','Dim.'];
const TITLES={home:'Vue d’ensemble',planning:'Planning',anomalies:'Anomalies',import:'Importer',team:'Équipe',history:'Historique',settings:'Paramètres'};

// Pictogrammes SVG communs : desktop, mobile et PWA.
const NAV_ICON_PATHS=Object.freeze({"home":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\"/><path d=\"M9 21v-8h6v8\"/>","planning":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18\"/><path d=\"m9 16 2 2 4-4\"/>","anomalies":"<path d=\"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z\"/><path d=\"M12 9v4M12 17h.01\"/>","import":"<path d=\"M12 16V3m-5 5 5-5 5 5\"/><path d=\"M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3\"/>","team":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/>","history":"<path d=\"M3 12a9 9 0 1 0 3-6.71L3 8\"/><path d=\"M3 3v5h5M12 7v5l4 2\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42\"/>","logout":"<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><path d=\"M16 17l5-5-5-5M21 12H9\"/>"});
function navIcon(name){
  const paths=NAV_ICON_PATHS[name];
  if(!paths)return "";
  return '<span class="nav-icon-wrap" aria-hidden="true"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">'+paths+'</svg></span>';
}
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
const state={week:mondayOf(iso(new Date())),day:iso(new Date()),page:'home',view:'week',access:'none',user:null,profile:null,profiles:[],weekData:null,loading:false,busy:false,importFile:null,importModel:null,importAnalysis:null,importExisting:null,importError:'',history:[],notice:'',error:'',search:'',lastCheck:0,personal:{weeks:[],absences:[],loadedAt:0,today:'',loading:false,weeksError:false,leaveError:false}};
let client;
let booted=false;
let personalRequestId=0;
const isMobileHome=()=>window.matchMedia('(max-width:760px)').matches;

function showMessage(text,kind='error'){
  const block=ROOT.querySelector('#authMessage');
  if(block){block.textContent=text;block.className=kind==='error'?'form-error':'live-message';block.hidden=false;}
}
function renderLogin(message=''){
  ROOT.classList.remove('menu-open');
  document.title='Nethor · Connexion';
  ROOT.innerHTML='<div class="login-page"><section class="login-brandpanel"><div class="login-brand"><img class="nethor-login-logo" src="./assets/icon.svg" width="50" height="50" alt=""><span>NETHOR²<small>PLANNING · LE THOR</small></span></div><div><h1>Le planning, plus clair. L’équipe, mieux organisée.</h1><p>Votre espace de travail sécurisé pour consulter les horaires, contrôler les anomalies et gérer les importations autorisées.</p></div><footer>Application interne — accès réservé aux comptes habilités</footer></section><div class="login-main"><form class="login-card" id="loginForm" autocomplete="on"><div class="eyebrow">ESPACE PROFESSIONNEL</div><h2>Connexion</h2><p>Connectez-vous avec votre adresse e-mail ou votre identifiant Nethor habituel.</p><label for="loginEmail">Identifiant ou adresse e-mail</label><input type="text" id="loginEmail" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="254" placeholder="Identifiant ou adresse e-mail"><label for="loginPassword">Mot de passe</label><input type="password" id="loginPassword" required autocomplete="current-password"><div id="authMessage" class="form-error" role="alert" '+(message?'':'hidden')+'>'+escapeHtml(message)+'</div><button type="submit" class="btn primary" id="loginSubmit">Se connecter</button><div class="form-note">Aucun nouveau compte n’est créé ici. La désactivation et les autorisations sont vérifiées côté serveur.</div></form></div></div>';
}
function renderShell(){
  ROOT.innerHTML='<div class="app"><button id="sidebarBackdrop" type="button" class="mobile-drawer-backdrop" aria-label="Fermer le menu"></button><aside class="sidebar live-sidebar" id="sidebar"><div class="brand"><img class="nethor-sidebar-logo" src="./assets/icon.svg" width="43" height="43" alt=""><span><strong>NETHOR<span class="brand-number">2</span></strong><small>PLANNING · LE THOR</small></span></div><p class="nav-caption">VOTRE ESPACE</p><nav aria-label="Navigation">'+Object.entries(TITLES).filter(([key])=>canNavigate(key,state.profile)).map(([key,name])=>'<button type="button" class="nav-item" data-page="'+key+'" data-nav="'+key+'">'+navIcon(key)+name+'</button>').join('')+'</nav><div class="side-bottom"><div class="side-info"><span class="status-dot"></span> Connecté à Nethor<small>Accès contrôlé par Supabase</small></div><button type="button" class="nav-item drawer-signout" data-action="logout">'+navIcon('logout')+'Déconnexion</button></div></aside><div class="workspace live-workspace"><header class="topbar"><div class="top-left"><img class="nethor-header-logo" src="./assets/icon.svg" width="32" height="32" alt="Nethor"><button type="button" class="mobile-brand" id="mobileMenu" aria-label="Ouvrir la navigation" aria-controls="sidebar" aria-expanded="false">☰</button><div><span class="breadcrumb">NETHOR 2 <span class="sep">/</span><span id="breadPage">Accueil</span></span><span class="top-context">Netto Le Thor · Planning du personnel</span></div></div><div class="top-actions"><span class="live-tag">● CONNECTÉ</span><span class="live-account" id="liveName"></span><button type="button" class="logout-btn" data-action="logout">Déconnexion</button></div></header><main id="screen" tabindex="-1" aria-live="polite"></main><footer class="live-bottom"><span>Nethor 2 · Application officielle</span><span>Comptes et planning reliés à Supabase</span></footer></div></div><nav class="live-navigator '+(canViewTeam(state.profile)?'nav-count-4':'nav-count-3')+'" aria-label="Navigation rapide"><button type="button" data-page="home">'+navIcon('home')+'<span class="nav-label">Accueil</span></button><button type="button" data-page="planning">'+navIcon('planning')+'<span class="nav-label">Planning</span></button><button type="button" data-page="anomalies">'+navIcon('anomalies')+'<span class="nav-label">Alertes</span></button>'+(canViewTeam(state.profile)?'<button type="button" data-page="team">'+navIcon('team')+'<span class="nav-label">Équipe</span></button>':'')+'</nav>';
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
  personalRequestId++;
  state.personal={weeks:[],absences:[],loadedAt:0,today:'',loading:false,weeksError:false,leaveError:false};
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
  if(isMobileHome())void loadPersonalHome();
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
    content='<div class="desktop-planning-table table-scroll"><table class="table"><thead><tr><th>Collaborateur</th>'+dates.map((d,i)=>'<th>'+DAYS[i]+'<br>'+shortDate(d)+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+metrics.people.map(p=>'<tr><td>'+person(p.name)+'</td>'+p.days.map(day=>'<td>'+shift(day.ranges)+'</td>').join('')+'<td class="live-hours">'+hours(p.total)+'</td></tr>').join('')+'</tbody></table></div>'+
    '<div class="mobile-week-list">'+(metrics.people.length?metrics.people.map(p=>'<article class="mobile-week-person"><header><div>'+person(p.name)+'<small>'+p.days.filter(d=>d.hours>0).length+' jour(s) planifié(s)</small></div><span class="mobile-hours">'+hours(p.total)+'</span></header><div class="mobile-week-days">'+p.days.map((d,i)=>'<button type="button" class="mobile-week-day" data-day="'+dates[i]+'"><span class="mobile-week-date"><b>'+DAYS[i]+'</b><small>'+shortDate(d.date)+'</small></span><span class="mobile-week-shift">'+shift(d.ranges)+'</span><span class="mobile-week-duration">'+(d.hours?hours(d.hours):'')+'</span></button>').join('')+'</div></article>').join(''):'<div class="live-empty">Aucun collaborateur planifié.</div>')+'</div>';
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
function homePwaInstall(){
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return '';
  return '<section class="pwa-home-install" id="pwaHomeCard" aria-label="Installer Nethor sur le téléphone">'+
    '<img class="pwa-home-logo" src="./assets/nethor-logo-192-v8.png" alt="" width="60" height="60">'+
    '<div class="pwa-home-copy"><strong>Nethor</strong><span>Ajoute le planning à ton écran d’accueil.</span><small>nethor.fr · Une seule application</small></div>'+
    '<button type="button" class="btn primary pwa-home-action" data-action="install-pwa">Installer</button>'+
    '<p class="pwa-home-help" id="installInstructions" hidden aria-live="polite"></p>'+
  '</section>';
}

/* Accueil compact personnel (mobile et PWA) : aucune donnée RH dans le cache PWA. */
async function loadPersonalHome(){
  if(!state.user||!isMobileHome()||state.personal.loading)return;
  const requestId=++personalRequestId, userId=state.user.id, today=dateInParis();
  state.personal.loading=true;
  if(state.page==='home')render();
  // Même période de recherche (12 semaines) que l'ancien accueil mobile.
  const monday=mondayFor(today), until=moveDate(monday,77);
  const [weeksRes,leaveRes]=await Promise.allSettled([
    client.from('planning_weeks').select('week_start,data').gte('week_start',monday).lte('week_start',until).order('week_start',{ascending:true}).limit(12),
    client.from('planning_absences').select('type,start_date,end_date,status')
      .eq('user_id',userId).eq('type','leave').in('status',['pending','approved'])
      .gte('end_date',today).order('start_date',{ascending:true}).limit(30)
  ]);
  if(requestId!==personalRequestId||state.user?.id!==userId)return;
  const w=weeksRes.status==='fulfilled'?weeksRes.value:null;
  const l=leaveRes.status==='fulfilled'?leaveRes.value:null;
  state.personal={
    weeks:!w?.error&&Array.isArray(w?.data)?w.data:[],
    absences:!l?.error&&Array.isArray(l?.data)?l.data:[],
    loadedAt:Date.now(),
    today,
    loading:false,
    weeksError:!!w?.error||!w,
    leaveError:!!l?.error||!l
  };
  if(state.page==='home')render();
}
function mobileOverviewDate(date,weekday=true){
  const day=new Date(date+'T12:00:00Z');
  return day.toLocaleDateString('fr-FR',{timeZone:'UTC',...(weekday?{weekday:'short'}:{}),day:'2-digit',month:'2-digit'}).replaceAll('.','');
}
function mobileOverviewHours(ranges){
  return ranges.map(r=>hhmm(r.start)+'–'+hhmm(r.end)).join(' · ');
}
function mobileOverviewPage(){
  const today=dateInParis(), name=String(state.profile?.display_name||'').split(' ')[0];
  const snapshot=state.personal, ready=!!snapshot.loadedAt&&!snapshot.loading;
  const data=ready?personalOverview(snapshot.weeks,state.profile,snapshot.absences,today):null;
  const linked=data?.linked!==false;
  const loadedPlanning=ready&&!snapshot.weeksError;
  const schedule=(data?.days||Array.from({length:7},(_,i)=>({date:moveDate(today,i),kind:'unknown'})))
    .map(row=>{
      const weekday=mobileOverviewDate(row.date);
      const now=row.date===today;
      const kind=ready?row.kind:'unknown';
      const description=kind==='work'?mobileOverviewHours(row.ranges):
        kind==='leave'?'Congé planifié':kind==='rest'?'Repos':
        kind==='unlinked'?'Compte non associé':ready?(snapshot.weeksError?'Planning indisponible':'Non publié'):'Chargement…';
      const duration=kind==='work'?hours(row.hours):'';
      return '<div class="n2h-day n2h-day-'+escapeHtml(kind)+(now?' today':'')+'">'+
        '<span class="n2h-day-date">'+escapeHtml(weekday)+'</span>'+
        '<strong class="n2h-day-value">'+escapeHtml(description)+'</strong>'+
        '<span class="n2h-day-hours">'+escapeHtml(duration)+'</span></div>';
    }).join('');
  const leave=data?.nextLeave||null;
  const leaveLabel=!loadedPlanning&&snapshot.weeksError&&snapshot.leaveError?'Données indisponibles':
    !ready?'Chargement…':leave?(leave.start<=today&&leave.end>=today?'En cours':mobileOverviewDate(leave.start,false)):'Aucun congé renseigné';
  const leaveRange=leave?(leave.start===leave.end?'Le '+mobileOverviewDate(leave.start,false):
    'Du '+mobileOverviewDate(leave.start,false)+' au '+mobileOverviewDate(leave.end,false)):'Aucune date connue';
  const leaveStatus=leave?.status==='approved'?'Validé':leave?.status==='pending'?'En attente':
    leave?.status==='planned'?'Inscrit au planning':snapshot.leaveError?'Statut indisponible':'Non renseigné';
  const leaveTone=leave?.status==='approved'?'approved':leave?.status==='pending'?'pending':
    leave?.status==='planned'?'planned':'unknown';
  const rest=data?.nextRest||null;
  const restLabel=!ready?'Chargement…':snapshot.weeksError?'Planning indisponible':
    rest?(rest===moveDate(today,1)?'Demain':mobileOverviewDate(rest)):'Non déterminé';
  const restDetail=rest?'Prochain jour sans horaire de travail':
    'Selon les plannings publiés';
  const dayWord=new Date(today+'T12:00:00Z').toLocaleDateString('fr-FR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
  return '<div class="n2h-home" aria-label="Mon accueil personnel">'+
    '<header class="n2h-greeting"><div><span class="n2h-overline">MON ESPACE · NETTO LE THOR</span><h1>Bonjour'+(name?' '+escapeHtml(name):'')+'</h1><p>'+escapeHtml(dayWord)+'</p></div>'+homePwaInstall()+'</header>'+
    '<section class="n2h-card n2h-schedule" aria-label="Mes horaires">'+
       '<div class="n2h-heading"><div>'+navIcon('planning')+'<h2>Mes horaires</h2></div><span class="n2h-week-total">'+(ready&&loadedPlanning&&linked?escapeHtml(hours(data.hours)):'7 jours')+'</span></div>'+
       '<div class="n2h-days">'+schedule+'</div>'+
    '</section>'+
    '<section class="n2h-card n2h-leave" aria-label="Prochains congés">'+
       '<div class="n2h-meta"><div class="n2h-meta-label">'+navIcon('planning')+'<h2>Prochains congés</h2></div><span class="n2h-leave-state '+leaveTone+'">'+escapeHtml(leaveStatus)+'</span></div>'+
       '<strong class="n2h-meta-value">'+escapeHtml(leaveLabel)+'</strong><small>'+escapeHtml(leave?leaveRange:ready?'Selon les demandes et plannings accessibles':'Vérification en cours')+'</small>'+
    '</section>'+
    '<section class="n2h-card n2h-rest" aria-label="Prochain jour de repos">'+
       '<div class="n2h-meta"><div class="n2h-meta-label">'+navIcon('history')+'<h2>Prochain repos</h2></div></div>'+
       '<strong class="n2h-meta-value">'+escapeHtml(restLabel)+'</strong><small>'+escapeHtml(restDetail)+'</small>'+
    '</section>'+
    '</div>';
}

function pageHome(metrics){
  if(isMobileHome())return mobileOverviewPage();
  const me=state.profile.planning_name||state.profile.display_name;
  const mine=metrics.people.find(p=>normalizeName(p.name)===normalizeName(me));
  let personal='';
  if(mine)personal='<div class="live-message ok">Mon planning cette semaine : <strong>'+hours(mine.total)+'</strong> · '+escapeHtml(mine.name)+'</div>';
  return renderPageHeader('NETTO LE THOR','Bonjour '+(state.profile.display_name||'')+',','Retrouve les horaires de l’équipe et les contrôles de la semaine.',state.access==='manage'?button('Importer un planning','go-import',true):button('Voir le planning','go-planning',true))+personal+homePwaInstall()+summary(metrics)+'<div class="layout"><div class="stack">'+planningCard(metrics)+coverageCard(metrics)+'</div><div class="stack">'+alertsCard(metrics,true)+'</div></div>';
}
function pagePlanning(metrics){
  return renderPageHeader('PLANNING','Planning du personnel','Horaires publiés et contrôlés selon tes autorisations.',state.access==='manage'?button('Importer Excel','go-import',true):'')+summary(metrics)+planningCard(metrics);
}
function pageAnomalies(metrics){
  return renderPageHeader('ANALYSE','Points à vérifier','Contrôles indicatifs : créneaux, pauses, journées longues et heures contractuelles.')+summary(metrics)+alertsCard(metrics,false)+'<p class="live-muted" style="margin-top:17px">Une anomalie de planning n’équivaut pas nécessairement à une infraction. Les règles métier doivent être vérifiées.</p>';
}
function pageTeam(metrics){
  if(!canViewTeam(state.profile))return '';
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
  if(!canNavigate(state.page,state.profile))state.page='planning';
  ROOT.classList.toggle('personal-home-active',state.page==='home'&&isMobileHome());
  document.title='Nethor · '+TITLES[state.page];
  ROOT.querySelector('#breadPage').textContent=TITLES[state.page];
  ROOT.querySelectorAll('[data-page]').forEach(el=>{
    el.classList.toggle('active',el.dataset.page===state.page);
    if(el.dataset.page===state.page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  const model=visibleModel(),metrics=analyze(model);
  const pages={home:()=>pageHome(metrics),planning:()=>pagePlanning(metrics),anomalies:()=>pageAnomalies(metrics),import:pageImport,team:()=>pageTeam(metrics),history:pageHistory,settings:pageSettings};
  let top='';
  if(state.loading&&!(state.page==='home'&&isMobileHome()))top+='<div class="live-message">Chargement du planning…</div>';
  if(state.error&&!(state.page==='home'&&isMobileHome()))top+='<div class="live-error">'+escapeHtml(state.error)+'</div>';
  if(state.notice&&!(state.page==='home'&&isMobileHome()))top+='<div class="live-message ok">'+escapeHtml(state.notice)+'</div>';
  screen.innerHTML=top+pages[state.page]();
}
function go(page){
  if(!(page in TITLES)||!canNavigate(page,state.profile))return;
  state.page=page;state.notice='';state.error='';
  closeMobileMenu();
  if(page==='history')void loadHistory();else render();
  if(page==='home'&&isMobileHome()&&!state.personal.loading&&(!state.personal.loadedAt||Date.now()-state.personal.loadedAt>120000||state.personal.today!==dateInParis()))void loadPersonalHome();
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
    const roleChanged=state.profile?.role!==gate.gate.profile?.role;
    state.profile={...state.profile,...gate.gate.profile};
    if(state.access!=='manage'&&state.page==='import')state.page='planning';
    if(!canNavigate(state.page,state.profile))state.page='planning';
    if(roleChanged)renderShell();
    render();
    if(state.page==='home'&&isMobileHome()&&!state.personal.loading&&(Date.now()-state.personal.loadedAt>120000||state.personal.today!==dateInParis()))void loadPersonalHome();
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
  else if(action==='install-pwa')await installPwa();
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
  if(event.target.id==='mobileMenu'){
    const shown=ROOT.querySelector('#sidebar')?.classList.toggle('open')===true;
    ROOT.classList.toggle('menu-open',shown);
    event.target.setAttribute('aria-expanded',String(shown));
  }else if(event.target.id==='sidebarBackdrop')closeMobileMenu();
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void verifyResume();});
window.addEventListener('focus',()=>void verifyResume());
window.matchMedia('(max-width:760px)').addEventListener?.('change',()=>{
  if(!state.user)return;
  render();
  if(isMobileHome()&&!state.personal.loading)void loadPersonalHome();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMobileMenu();});
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

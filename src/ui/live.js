import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from '../config/public.js';
import {loadAuthorizedSession} from '../auth/session-gate.js';
import {canViewTeam,canNavigate} from './team-access.js';
import {resolveLoginEmail} from '../auth/login-identifier.js';
import {validateRecoveryEmail,validateNewPassword,RESET_REQUEST_MESSAGE} from '../auth/account-security.js';
import {renderSettingsPage} from './settings-security.js';
import {shouldOfferRecoveryPrompt,renderRecoveryPrompt} from './recovery-prompt.js';
import {installMobileZoomLock} from './mobile-zoom.js';
import {getPlanningWeek,getImportHistory,publishPlanningWeek,verifyPublishedWeek,getPublishedWeeksForYear} from '../data/planning-repository.js';
import {analyzeEmployeeDay,compareContractHours} from '../domain/planning-core.js';
import {normalizeName} from '../domain/employee-linker.js';
import {dateInParis,moveDate,mondayFor,personalOverview} from '../domain/personal-overview.js';
import {renderMobilePlanning} from './planning-mobile.js';
import {renderPlanningYear} from './planning-year.js';
import {renderDesktopPlanningDay,renderDesktopPlanningLegend} from './planning-desktop-colors.js';
import {readSyncStatus,readSyncHistory,readSyncFileChanges,readSyncAutoPublications,readSyncDiagnostics,readSyncHistoricalSummary} from '../data/nethor-sync-control.js';
import {importSyncHealth,renderImportSyncGuide,confirmImportManually} from './nethor-sync-import-guide.js';
import {mergeImportHistory,renderImportHistory} from './import-history.js';
import {readMobileSyncSummary} from '../data/mobile-sync-summary.js';
import {renderMobileSyncSummary} from './mobile-sync-summary.js';
import {createSyncController} from './nethor-sync-ui.js';
import {isSyncOverviewRole,renderSyncOverviewCard,NETHOR_SYNC_INSTALLER_URL} from './nethor-sync-overview.js';
import {isStaffDesktopLayout,usesCompactLayout} from './layout-role.js';
import {readPlanningFile} from '../import/excel-structure.js';

const ROOT=document.getElementById('app');
installMobileZoomLock();
let pendingInstall=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pendingInstall=event;});
window.addEventListener('appinstalled',()=>{pendingInstall=null;ROOT.querySelector('#pwaHomeCard')?.remove();});
function mobileInstallInstructions(){
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return 'NETHOR est déjà ouvert en mode application.';
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent))return 'Sur iPhone : ouvre https://nethor.fr/ dans Safari, touche Partager, puis « Sur l’écran d’accueil » et « Ajouter ».';
  if(/Android/i.test(navigator.userAgent))return 'Sur Android : dans Chrome, ouvre ⋮ puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».';
  return 'Sur nethor.fr, dans Chrome ou Edge, utilise le menu « Installer l’application » si cette option est disponible.';
}
async function installPwa(){
  const note=ROOT.querySelector('#installInstructions');
  if(location.origin!=='https://nethor.fr'){
    if(note){note.hidden=false;note.textContent='Pour installer la seule application NETHOR, ouvre d’abord https://nethor.fr/ puis utilise ce bouton depuis l’accueil.';}
    return;
  }
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true){
    if(note){note.hidden=false;note.textContent='NETHOR est déjà installé sur cet appareil.';}
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
const MOBILE_PAGE_TITLES={home:'Accueil',planning:'Planning',anomalies:'NethorSync',import:'Importer',team:'Équipe',history:'Historique',settings:'Paramètres'};

// Pictogrammes SVG communs : desktop, mobile et PWA.
const NAV_ICON_PATHS=Object.freeze({"sync":"<path d=\"M3 12a9 9 0 0 1 15.4-6.3L21 8m0-5v5h-5\"/><path d=\"M21 12A9 9 0 0 1 5.6 18.3L3 16m0 5v-5h5\"/>","home":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\"/><path d=\"M9 21v-8h6v8\"/>","planning":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18\"/><path d=\"m9 16 2 2 4-4\"/>","anomalies":"<path d=\"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z\"/><path d=\"M12 9v4M12 17h.01\"/>","import":"<path d=\"M12 16V3m-5 5 5-5 5 5\"/><path d=\"M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3\"/>","team":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/>","history":"<path d=\"M3 12a9 9 0 1 0 3-6.71L3 8\"/><path d=\"M3 3v5h5M12 7v5l4 2\"/>","settings":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42\"/>","logout":"<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><path d=\"M16 17l5-5-5-5M21 12H9\"/>"});
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
const APP_VERSION='2.2-mobile-2026.10.31';
const state={week:mondayOf(iso(new Date())),day:iso(new Date()),page:'home',view:'week',access:'none',user:null,profile:null,profiles:[],weekData:null,planningLoadedAt:0,networkOnline:navigator.onLine,pwaUpdateReady:false,loading:false,busy:false,importFile:null,importModel:null,importAnalysis:null,importExisting:null,importError:'',history:[],notice:'',error:'',search:'',desktopPlanningSearch:'',desktopSidebarCollapsed:false,lastCheck:0,nethorSync:{loaded:false,loading:false,status:null,error:''},importSync:{loaded:false,loading:false,status:null,error:'',checkedAt:0},mobileSync:{loaded:false,loading:false,planning:null,planningError:false,sync:null,syncError:false,checkedAt:0},accountSecurity:{loaded:false,loading:false,configured:false,busy:false,error:false,message:'',kind:'',lastRequestAt:0},settingsPanel:'home',settingsFeedback:'',planningPreference:'week',mobilePlanning:{dayFilter:'all',awayExpanded:false,year:Number(dateInParis().slice(0,4)),annual:{year:null,weeks:[],loading:false,loaded:false,error:''}},personal:{weeks:[],absences:[],loadedAt:0,today:'',loading:false,weeksError:false,leaveError:false}};
let client;
let syncController=null;
let syncChartPeriod=7;
let booted=false;
let swRegistration=null;
let swReloading=false;
let weekLoadBusy=false;
let weekRequestId=0;
let personalRequestId=0;
let annualRequestId=0;
let collaboratorsRequestId=0;
const collaboratorHistory={loaded:false,loading:false,items:[],error:'',open:false,search:''};
let recoveryPrompt={step:'closed',dismissed:false,saving:false,error:'',mailStatus:''};
// Préférence de planning locale, cloisonnée par compte et par navigateur.
const planningPreferenceKey=id=>'nethor2-planning-start-v1:'+id;
function readPlanningPreference(id){
 try{
  const value=localStorage.getItem(planningPreferenceKey(id));
  return ['day','week','year'].includes(value)?value:'week';
 }catch(_){return 'week';}
}
function savePlanningPreference(id,value){
 try{localStorage.setItem(planningPreferenceKey(id),value);return true;}
 catch(_){return false;}
}
// Mémorise uniquement la semaine consultée, jamais les données RH du planning.
const desktopSidebarKey=id=>'nethor2-desktop-sidebar-v1:'+id;
function readDesktopSidebar(id){try{return localStorage.getItem(desktopSidebarKey(id))==='1';}catch(_){return false;}}
function saveDesktopSidebar(id,value){try{localStorage.setItem(desktopSidebarKey(id),value?'1':'0');return true;}catch(_){return false;}}
const planningWeekKey=id=>'nethor2-planning-week-v1:'+id;
function readPlanningWeek(id){
 try{
  const value=localStorage.getItem(planningWeekKey(id))||'';
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&mondayOf(value)===value?value:null;
 }catch(_){return null;}
}
function savePlanningWeek(id,value){
 try{if(id&&/^\d{4}-\d{2}-\d{2}$/.test(value))localStorage.setItem(planningWeekKey(id),value);}catch(_){/* préférence non critique */}
}
const isInstalledPwa=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const settingsDate=value=>{
 const date=new Date(value||'');
 return Number.isFinite(date.getTime())?date.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'Non disponible';
};
const settingsDiagnostics=()=>{
 const lines=[
  'NETHOR 2 — informations de diagnostic',
  'Version interface : '+APP_VERSION,
  'Mode : '+(isInstalledPwa()?'PWA':'Navigateur'),
  'Format : '+(smallScreen()?'Mobile':'Ordinateur'),
  'Réseau (navigateur) : '+(navigator.onLine?'En ligne':'Hors ligne'),
  'Service Worker : '+(navigator.serviceWorker?.controller?'Actif':'Inactif'),
  'Mise à jour PWA : '+(state.pwaUpdateReady?'Disponible':'À jour'),
  'Dernier planning chargé : '+settingsDate(state.planningLoadedAt),
  'Dernière vérification d’accès : '+settingsDate(state.lastCheck)
 ];
 return lines.join('\n');
};
const recoveryDismissKey=userId=>'nethor-recovery-later:'+userId;
function recoveryDismissed(userId){
 try{return sessionStorage.getItem(recoveryDismissKey(userId))==='1';}catch{return false;}
}
function clearRecoveryDismissed(userId){
 try{sessionStorage.removeItem(recoveryDismissKey(userId));}catch(_){/* stockage optionnel */}
}

// Le même contenu personnel et la même logique Jour/Semaine sur desktop
// pour Responsable et Employé seulement, sans toucher aux administrateurs/PDV.
const smallScreen=()=>window.matchMedia('(max-width:760px)').matches;
const isMobileHome=()=>usesCompactLayout(state.profile?.role,smallScreen());
const isStaffDesktop=()=>isStaffDesktopLayout(state.profile?.role,smallScreen());

function showMessage(text,kind='error'){
  const block=ROOT.querySelector('#authMessage');
  if(block){block.textContent=text;block.className=kind==='error'?'form-error':'live-message';block.hidden=false;}
}
function renderLogin(message=''){
  // La fenêtre est montée dans body : elle doit être retirée à toute déconnexion,
  // perte de session ou retour sur l'écran de connexion.
  document.getElementById('firstLoginRecoveryPrompt')?.remove();
  recoveryPrompt.step='closed';
  ROOT.classList.remove('menu-open','staff-desktop-layout','personal-home-active','mobile-planning-active','mobile-sync-active','mobile-content-scroll');
  document.title='NETHOR · Connexion';
  ROOT.innerHTML='<div class="login-page"><section class="login-brandpanel"><div class="login-brand"><img class="nethor-login-logo" src="./assets/icon.svg" width="50" height="50" alt=""><span>NETHOR²<small>PLANNING · LE THOR</small></span></div><div><h1>Le planning, plus clair. L’équipe, mieux organisée.</h1><p>Votre espace de travail sécurisé pour consulter les horaires, contrôler les anomalies et gérer les importations autorisées.</p></div><footer>Application interne — accès réservé aux comptes habilités</footer></section><div class="login-main"><form class="login-card" id="loginForm" autocomplete="on"><div class="eyebrow">ESPACE PROFESSIONNEL</div><h2>Connexion</h2><p>Connectez-vous avec votre adresse e-mail ou votre identifiant NETHOR habituel.</p><label for="loginEmail">Identifiant ou adresse e-mail</label><input type="text" id="loginEmail" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="254" placeholder="Identifiant ou adresse e-mail"><label for="loginPassword">Mot de passe</label><input type="password" id="loginPassword" required autocomplete="current-password"><div id="authMessage" class="form-error" role="alert" '+(message?'':'hidden')+'>'+escapeHtml(message)+'</div><button type="submit" class="btn primary" id="loginSubmit">Se connecter</button><button type="button" class="n2sec-forgot" data-action="forgot-password">Mot de passe oublié ?</button><div class="form-note">Aucun nouveau compte n’est créé ici. La désactivation et les autorisations sont vérifiées côté serveur.</div></form></div></div>';
}
function renderShell(){
  ROOT.classList.toggle('staff-desktop-layout',isStaffDesktop());
  ROOT.classList.toggle('desktop-sidebar-collapsed',!smallScreen()&&state.desktopSidebarCollapsed);
  ROOT.innerHTML='<div class="app"><button id="sidebarBackdrop" type="button" class="mobile-drawer-backdrop" aria-label="Fermer le menu"></button><aside class="sidebar live-sidebar" id="sidebar"><div class="brand"><img class="nethor-sidebar-logo" src="./assets/icon.svg" width="43" height="43" alt=""><span class="nethor-sidebar-labels"><span class="nethor-sidebar-desktop"><strong>NETHOR</strong><small>Planning</small></span><span class="nethor-sidebar-mobile"><strong>NETHOR<span class="brand-number">2</span></strong><small>PLANNING · LE THOR</small></span></span><button type="button" class="n2-sidebar-toggle" data-action="sidebar-toggle" aria-label="Réduire la barre latérale" title="Réduire la barre latérale">‹</button></div><p class="nav-caption">VOTRE ESPACE</p><nav aria-label="Navigation">'+Object.entries(TITLES).filter(([key])=>canNavigate(key,state.profile,true)).map(([key,name])=>'<button type="button" class="nav-item" data-page="'+key+'" data-nav="'+key+'"'+(canNavigate(key,state.profile,smallScreen())?'':' hidden style="display:none"')+'>'+navIcon(smallScreen()&&key==='anomalies'?'sync':key)+(smallScreen()&&key==='anomalies'?'NethorSync':name)+'</button>').join('')+'</nav><div class="side-bottom"><div class="side-info"><span class="status-dot"></span> Connecté à NETHOR<small>Accès contrôlé par Supabase</small></div><button type="button" class="nav-item drawer-signout" data-action="logout">'+navIcon('logout')+'Déconnexion</button></div></aside><div class="workspace live-workspace"><header class="topbar"><div class="top-left"><button type="button" class="mobile-brand" id="mobileMenu" aria-label="Ouvrir la navigation" aria-controls="sidebar" aria-expanded="false"><span aria-hidden="true">≡</span></button><img class="nethor-header-logo" src="./assets/icon.svg" width="32" height="32" alt=""><div class="nethor-header-titles"><div class="nethor-desktop-titles"><span class="breadcrumb"><strong class="nethor-desktop-name">NETHOR</strong><span class="sep">/</span><span id="breadPage">Accueil</span></span></div><div class="nethor-mobile-titles"><strong>NETHOR</strong><span id="mobileCurrentPage">Accueil</span></div></div></div><div class="top-actions"><span class="live-tag" id="connectionStatus" data-online="true">● EN LIGNE</span><span class="live-account" id="liveName"></span><button type="button" class="logout-btn" data-action="logout">Déconnexion</button></div></header><main id="screen" tabindex="-1" aria-live="polite"></main><footer class="live-bottom"><span>NETHOR 2 · Application officielle</span><span>Comptes et planning reliés à Supabase</span></footer></div></div><nav class="live-navigator '+(canViewTeam(state.profile)?'nav-count-4':'nav-count-3')+'" aria-label="Navigation rapide"><button type="button" data-page="home">'+navIcon('home')+'<span class="nav-label">Accueil</span></button><button type="button" data-page="planning">'+navIcon('planning')+'<span class="nav-label">Planning</span></button><button type="button" data-page="anomalies">'+navIcon(smallScreen()?'sync':'anomalies')+'<span class="nav-label">'+(smallScreen()?'NethorSync':'Alertes')+'</span></button>'+(canViewTeam(state.profile)?'<button type="button" data-page="team">'+navIcon('team')+'<span class="nav-label">Équipe</span></button>':'')+'</nav>';
  ROOT.querySelector('#liveName').textContent=state.profile.display_name||listRole(state.profile.role);
  ROOT.classList.toggle('desktop-sidebar-collapsed',!smallScreen()&&state.desktopSidebarCollapsed);
  const sidebarToggle=ROOT.querySelector('.n2-sidebar-toggle');if(sidebarToggle){sidebarToggle.textContent=state.desktopSidebarCollapsed?'›':'‹';sidebarToggle.setAttribute('aria-label',state.desktopSidebarCollapsed?'Déployer la barre latérale':'Réduire la barre latérale');}
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
  closeFirstLoginRecovery();
  personalRequestId++;
  annualRequestId++;
  if(state.user?.id)clearRecoveryDismissed(state.user.id);
  recoveryPrompt={step:'closed',dismissed:false,saving:false,error:'',mailStatus:''};
  state.nethorSync={loaded:false,loading:false,status:null,error:''};
  state.importSync={loaded:false,loading:false,status:null,error:'',checkedAt:0};
  state.mobileSync={loaded:false,loading:false,planning:null,planningError:false,sync:null,syncError:false,checkedAt:0};
  state.accountSecurity={loaded:false,loading:false,configured:false,busy:false,error:false,message:'',kind:'',lastRequestAt:0};
  state.settingsPanel='home';state.settingsFeedback='';state.planningPreference='week';
  state.planningLoadedAt=0;state.pwaUpdateReady=false;state.networkOnline=navigator.onLine;
  state.personal={weeks:[],absences:[],loadedAt:0,today:'',loading:false,weeksError:false,leaveError:false};
  try{await client.auth.signOut();}catch(err){console.warn('Déconnexion',err);}
  syncController?.dispose();
  syncController=null;
  state.user=null;state.profile=null;state.weekData=null;state.profiles=[];state.importFile=null;state.importModel=null;state.importAnalysis=null;
  renderLogin();
}
async function startAuthorized(access){
  annualRequestId++;
  state.mobilePlanning.year=Number(dateInParis().slice(0,4));
  state.mobilePlanning.annual={year:null,weeks:[],loading:false,loaded:false,error:''};
  state.user=access.gate.user;
  state.profile=access.gate.profile;
  state.settingsPanel='home';state.settingsFeedback='';
  state.networkOnline=navigator.onLine;
  state.planningPreference=readPlanningPreference(state.user.id);
  state.desktopSidebarCollapsed=!smallScreen()&&readDesktopSidebar(state.user.id);
  if(smallScreen()){
    const rememberedWeek=readPlanningWeek(state.user.id);
    if(rememberedWeek){state.week=rememberedWeek;state.day=datesFor(rememberedWeek).includes(dateInParis())?dateInParis():rememberedWeek;}
  }
  recoveryPrompt={step:'closed',dismissed:recoveryDismissed(state.user.id),saving:false,error:'',mailStatus:''};
  state.nethorSync={loaded:false,loading:false,status:null,error:''};
  state.importSync={loaded:false,loading:false,status:null,error:'',checkedAt:0};
  state.mobileSync={loaded:false,loading:false,planning:null,planningError:false,sync:null,syncError:false,checkedAt:0};
  state.accountSecurity={loaded:false,loading:false,configured:false,busy:false,error:false,message:'',kind:'',lastRequestAt:0};
  state.access=access.access;
  state.lastCheck=Date.now();
  renderShell();
  syncController=createSyncController(client,ROOT,state.profile);
  syncController?.mount();
  await loadProfiles();
  if(isMobileHome())void loadPersonalHome();
  await loadWeek();
  // Vérifier une fois la page mobile complètement montée : aucun écran de chargement
  // ni rendu du planning ne doit masquer la fenêtre de récupération.
  if(shouldCheckRecoveryOnLogin())void maybeOfferRecoveryAfterLogin();
  if(state.page==='home'&&isSyncOverviewRole(state.profile?.role,!smallScreen()))void loadNethorSyncStatus();
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
        return {date,cells,...analyzeEmployeeDay({employeeId:profile?.id||null,cells,startMinutes:start,minutesPerSlot:minutes})};
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
  if(weekLoadBusy)return;
  const requestedWeek=state.week;
  const request=++weekRequestId;
  const previous=state.weekData;
  weekLoadBusy=true;
  state.loading=true;state.error='';render();
  try{
    const result=await getPlanningWeek(client,requestedWeek);
    if(request!==weekRequestId||state.week!==requestedWeek)return;
    state.weekData=result;
    state.planningLoadedAt=Date.now();
    if(smallScreen()&&state.user?.id)savePlanningWeek(state.user.id,requestedWeek);
  }catch(err){
    if(request!==weekRequestId)return;
    const sameWeek=previous?.model?.weekStart===requestedWeek;
    state.weekData=sameWeek?previous:null;
    state.error='Lecture du planning impossible : '+String(err.message||err)+(navigator.onLine?'':' · Appareil hors ligne.');
  }
  finally{
    if(request===weekRequestId){weekLoadBusy=false;state.loading=false;render();}
  }
}
function renderPageHeader(category,title,description,actions=''){
  return '<div class="page-header"><div><p class="eyebrow">'+escapeHtml(category)+'</p><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(description)+'</p></div>'+(actions?'<div class="actions">'+actions+'</div>':'')+'</div>';
}
function shift(ranges){
  if(!ranges?.length)return '<div class="off">Repos</div>';
  return '<div class="shift">'+ranges.map(r=>hhmm(r.startMinutes)+'–'+hhmm(r.endMinutes)).join('<i>puis</i>')+'</div>';
}
const adminPlanningDesktop=()=>!smallScreen()&&state.page==='planning'&&state.profile?.role==='admin';
async function loadCollaboratorHistory(){
 if(!adminPlanningDesktop()||collaboratorHistory.loading||collaboratorHistory.loaded)return;
 const request=++collaboratorsRequestId;
 collaboratorHistory.loading=true;collaboratorHistory.error='';render();
 try{
  const history=new Map();
  for(let from=0;from<100000;from+=500){
   const {data,error}=await client.from('planning_weeks').select('week_start,data').order('week_start',{ascending:true}).range(from,from+499);
   if(error)throw error;
   if(request!==collaboratorsRequestId)return;
   for(const row of data||[]){
    for(const employee of row.data?.employees||[]){
     const name=String(employee?.name||'').trim();const key=normalizeName(name);
     if(!key)continue;
     const current=history.get(key)||{name,first:row.week_start,last:row.week_start,weeks:0};
     current.last=row.week_start;
     current.weeks+=1;
     history.set(key,current);
    }
   }
   if(!data||data.length<500)break;
   if(from>=99500)throw Error('Historique trop volumineux pour être affiché intégralement.');
  }
  collaboratorHistory.items=[...history.entries()].map(([key,item])=>{
   const profile=state.profiles.find(p=>normalizeName(p.planning_name||p.display_name)===key);
   return {...item,profileId:profile?.id||null,accountEnabled:profile?.account_enabled??null,displayName:profile?.display_name||''};
  }).sort((a,b)=>a.first.localeCompare(b.first)||a.name.localeCompare(b.name,'fr'));
  collaboratorHistory.loaded=true;
 }catch(_){collaboratorHistory.error='Lecture de l’historique indisponible. Réessayer ultérieurement.';}
 finally{if(request===collaboratorsRequestId){collaboratorHistory.loading=false;render();}}
}
function summary(metrics){
  const planned=metrics.people.filter(p=>p.total>0).length;
  const total=metrics.people.reduce((sum,p)=>sum+p.total,0);
  const third=adminPlanningDesktop()?'<article class="live-stat n2collab-stat"><button type="button" class="n2collab-trigger" data-action="collaborators-toggle" aria-expanded="'+collaboratorHistory.open+'"><label>Collaborateurs</label><strong>'+(collaboratorHistory.loaded?collaboratorHistory.items.length:'—')+'</strong><small>Historique des plannings · Ouvrir ↗</small></button></article>':'<article class="live-stat"><label>Points à vérifier</label><strong>'+metrics.issues.length+'</strong><small>Contrôles automatiques</small></article>';
  return '<section class="live-summary"><article class="live-stat"><label>Collaborateurs planifiés</label><strong>'+planned+'</strong><small>Sur la semaine</small></article><article class="live-stat"><label>Heures planifiées</label><strong>'+hours(total)+'</strong><small>Total calculé</small></article>'+third+'</section>';
}
const desktopAnnualAllowed=()=>!smallScreen()&&['admin','responsable','employe'].includes(state.profile?.role);
const annualAllowed=()=>smallScreen()||desktopAnnualAllowed();
function weekNav(){
  const desktop=!smallScreen();
  const today=dateInParis();
  const currentWeek=mondayOf(today)===state.week;
  return '<div class="live-week-wrapper n2-week-toolbar"><div class="live-paging"><button class="icon-btn" data-action="prev" aria-label="Semaine précédente" title="Alt + ←">‹</button><strong>'+shortDate(state.week)+' – '+shortDate(plusDays(state.week,6))+'</strong><button class="icon-btn" data-action="next" aria-label="Semaine suivante" title="Alt + →">›</button></div>'+
   (desktop?'<div class="n2-week-direct"><button type="button" class="btn n2-today-btn" data-action="today"'+(currentWeek?' disabled':'')+'>Aujourd’hui</button><label class="n2-date-jump"><span class="sr-only">Aller à une date</span><input type="date" id="desktopPlanningDate" value="'+escapeHtml(state.day||state.week)+'" aria-label="Aller à une date"></label></div>':'')+
   '<div class="segmented"><button data-action="week-view" class="'+(state.view==='week'?'selected':'')+'">Semaine</button><button data-action="day-view" class="'+(state.view==='day'?'selected':'')+'">Jour</button>'+(desktopAnnualAllowed()?'<button data-action="year-view" class="'+(state.view==='year'?'selected':'')+'">Année</button>':'')+'</div></div>';
}
function planningCard(metrics){
  let content='';
  const dates=datesFor(state.week);
  const desktop=!smallScreen();
  const query=desktop&&state.page==='planning'?normalizeName(state.desktopPlanningSearch):'';
  const people=query?metrics.people.filter(p=>normalizeName(p.name).includes(query)):metrics.people;
  const freshness=state.planningLoadedAt?new Date(state.planningLoadedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Non vérifié';
  const planningDay=day=>{
    if(day?.issues?.some(issue=>issue.code==='INVALID_ROW'))return '<div class="n2pday-chip n2pday-status n2pday-data-error" data-tone="unknown">Donnée incomplète</div>';
    return desktopColors?renderDesktopPlanningDay(day.cells,first,step):shift(day.ranges);
  };
  // La palette est réservée à la consultation sur la page Planning Desktop/PWA.
  const desktopColors=state.page==='planning'&&!smallScreen();
  const first=Number(state.weekData?.model?.startTime??6)*60;
  const step=Number(state.weekData?.model?.slotMinutes)||15;
  if(!state.weekData)content='<div class="live-empty"><strong>Aucun planning publié pour cette semaine</strong>Utilise les flèches pour choisir une semaine existante.</div>';
  else if(state.view==='week'){
    content='<div class="desktop-planning-table table-scroll"><table class="table"><thead><tr><th>Collaborateur</th>'+dates.map((d,i)=>'<th>'+DAYS[i]+'<br>'+shortDate(d)+'</th>').join('')+'<th>Total</th></tr></thead><tbody>'+people.map(p=>'<tr><td>'+person(p.name)+'</td>'+p.days.map(day=>'<td>'+planningDay(day)+'</td>').join('')+'<td class="live-hours">'+hours(p.total)+'</td></tr>').join('')+'</tbody></table></div>'+
    '<div class="mobile-week-list">'+(metrics.people.length?people.map(p=>'<article class="mobile-week-person"><header><div>'+person(p.name)+'<small>'+p.days.filter(d=>d.hours>0).length+' jour(s) planifié(s)</small></div><span class="mobile-hours">'+hours(p.total)+'</span></header><div class="mobile-week-days">'+p.days.map((d,i)=>'<button type="button" class="mobile-week-day" data-day="'+dates[i]+'"><span class="mobile-week-date"><b>'+DAYS[i]+'</b><small>'+shortDate(d.date)+'</small></span><span class="mobile-week-shift">'+shift(d.ranges)+'</span><span class="mobile-week-duration">'+(d.hours?hours(d.hours):'')+'</span></button>').join('')+'</div></article>').join(''):'<div class="live-empty">Aucun collaborateur planifié.</div>')+'</div>';
  }else{
    if(!dates.includes(state.day))state.day=state.week;
    const di=dates.indexOf(state.day);
    content='<div class="live-day-nav">'+dates.map((d,i)=>'<button data-day="'+d+'" class="'+(d===state.day?'active':'')+'">'+DAYS[i]+'<br>'+shortDate(d)+'</button>').join('')+'</div><div class="live-day-grid">'+people.map(p=>'<div class="live-day-item">'+person(p.name)+planningDay(p.days[di])+(desktopColors&&!p.days[di].hours?'':'<div class="sub">'+hours(p.days[di].hours)+' travaillées</div>')+'</div>').join('')+'</div>';
  }
  return '<section class="card live-week-card'+(desktopColors?' n2-desktop-planning-palette':'')+'"><div class="card-head n2-planning-head"><div><h2 class="card-title">Planning de l’équipe</h2><p class="sub">'+(state.weekData?escapeHtml(state.weekData.sourceFile||'Semaine publiée'):'Aucune version enregistrée')+'</p></div><div class="n2-planning-meta"><span class="n2-freshness" data-online="'+state.networkOnline+'">Vérifié à '+escapeHtml(freshness)+'</span><button type="button" class="text-link" data-action="refresh">Actualiser ↻</button></div></div>'+weekNav()+(desktop&&state.page==='planning'?'<div class="n2-planning-search"><label for="desktopPlanningSearch">Rechercher un collaborateur</label><input id="desktopPlanningSearch" type="search" value="'+escapeHtml(state.desktopPlanningSearch)+'" placeholder="Nom du collaborateur" autocomplete="off"><span>'+people.length+' / '+metrics.people.length+' affiché(s)</span></div>':'')+(state.pwaUpdateReady&&desktop?'<div class="n2-pwa-update-banner"><span>Une version plus récente de NETHOR est prête.</span><button type="button" class="btn" data-action="pwa-update">Mettre à jour</button></div>':'')+(desktopColors&&state.weekData?renderDesktopPlanningLegend():'')+(query&&!people.length?'<div class="live-empty"><strong>Aucun collaborateur trouvé</strong>Modifie la recherche pour réafficher le planning.</div>':content)+'</section>';
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
  return '<section class="pwa-home-install" id="pwaHomeCard" aria-label="Installer NETHOR sur le téléphone">'+
    '<img class="pwa-home-logo" src="./assets/nethor-logo-192-v8.png" alt="" width="60" height="60">'+
    '<div class="pwa-home-copy"><strong>NETHOR</strong><span>Ajoute le planning à ton écran d’accueil.</span><small>nethor.fr · Une seule application</small></div>'+
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
  const days=data?.days||[];
  const todayRow=days.find(row=>row.date===today);
  const todayWork=ready&&todayRow?.kind==='work';
  const todayHours=todayWork?mobileOverviewHours(todayRow.ranges):
    !ready?'Chargement…':todayRow?.kind==='leave'?'En congé':todayRow?.kind==='rest'?'Repos':
    snapshot.weeksError?'Planning indisponible':'Aucun horaire publié';
  const todayDuration=todayWork?hours(todayRow.hours):'';
  const nextWork=days.find(row=>row.kind==='work'&&row.date>today);
  const nextWorkDate=nextWork?mobileOverviewDate(nextWork.date,false):'Non déterminé';
  const nextWorkHours=nextWork?mobileOverviewHours(nextWork.ranges):'Selon les plannings publiés';
  const knownDays=days.filter(row=>row.kind==='work');
  const totalHours=knownDays.reduce((sum,row)=>sum+(Number(row.hours)||0),0);
  const summaryHours=!ready?'…':snapshot.weeksError?'—':hours(totalHours);
  const dataCaption=linked?'Selon les plannings accessibles':'Compte non associé au planning';
  const homeFreshAt=Math.max(Number(state.planningLoadedAt)||0,Number(state.personal.loadedAt)||0);
  const homeFreshness=homeFreshAt?'Vérifié à '+new Date(homeFreshAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Planning non vérifié';
  const homeNetwork=state.networkOnline?'En ligne':'Hors ligne · données déjà chargées seulement';
  return '<div class="n2h-home n2h-dashboard" aria-label="Mon accueil personnel">'+
    '<header class="n2h-greeting"><div><span class="n2h-overline">MON ESPACE · NETTO LE THOR</span><h1>Bonjour'+(name?' '+escapeHtml(name):'')+'</h1><p>'+escapeHtml(dayWord)+'</p></div>'+homePwaInstall()+'</header>'+
    '<section class="n2h-today" aria-label="Mes horaires aujourd’hui">'+
      '<div class="n2h-today-top"><span>MES HORAIRES AUJOURD’HUI</span><span class="n2h-today-tag">'+(todayWork?'AU PLANNING':ready?'INFORMATION':'CHARGEMENT')+'</span></div>'+
      '<strong class="n2h-today-hours">'+escapeHtml(todayHours)+'</strong>'+
      '<div class="n2h-today-bottom"><span>'+escapeHtml(todayDuration?todayDuration+' prévues':dataCaption)+'</span><span>NETTO LE THOR</span></div>'+
    '</section>'+
    '<div class="n2h-kpis">'+
      '<section class="n2h-kpi"><span class="n2h-kpi-label">7 PROCHAINS JOURS</span><strong>'+escapeHtml(summaryHours)+'</strong><small>Heures planifiées</small></section>'+
      '<section class="n2h-kpi"><span class="n2h-kpi-label">PROCHAINS HORAIRES</span><strong>'+escapeHtml(ready?nextWorkDate:'…')+'</strong><small>'+escapeHtml(ready?nextWorkHours:'Chargement…')+'</small></section>'+
    '</div>'+
    '<section class="n2h-card n2h-schedule" aria-label="Mes horaires">'+
      '<div class="n2h-heading"><div>'+navIcon('planning')+'<h2>Ma semaine</h2></div><button type="button" class="n2h-week-link" data-page="planning">Voir le planning →</button></div>'+
      '<div class="n2h-days">'+schedule+'</div>'+
    '</section>'+
    '<div class="n2h-bottom-grid">'+
      '<section class="n2h-card n2h-leave" aria-label="Prochains congés">'+
        '<div class="n2h-meta"><div class="n2h-meta-label">'+navIcon('planning')+'<h2>Prochains congés</h2></div></div>'+
        '<strong class="n2h-meta-value">'+escapeHtml(leaveLabel)+'</strong><small>'+escapeHtml(leave?leaveRange:ready?'Selon les demandes accessibles':'Vérification en cours')+'</small>'+
        '<span class="n2h-leave-state '+leaveTone+'">'+escapeHtml(leaveStatus)+'</span>'+
      '</section>'+
      '<section class="n2h-card n2h-rest" aria-label="Prochain jour de repos">'+
        '<div class="n2h-meta"><div class="n2h-meta-label">'+navIcon('history')+'<h2>Prochain repos</h2></div></div>'+
        '<strong class="n2h-meta-value">'+escapeHtml(restLabel)+'</strong><small>'+escapeHtml(restDetail)+'</small>'+
      '</section>'+
    '</div>'+
    '<section class="n2h-activity" aria-label="Informations de planning"><div class="n2h-activity-head">'+navIcon('history')+'<h2>Informations de planning</h2></div><p>'+escapeHtml(!ready?'Chargement des informations…':snapshot.weeksError?'Certaines données de planning sont temporairement indisponibles.':dataCaption+'. Consulte le planning pour les détails et les mises à jour.')+'</p><div class="n2h-app-state"><span data-online="'+state.networkOnline+'">'+escapeHtml(homeNetwork)+'</span><span>'+escapeHtml(homeFreshness)+'</span></div>'+(state.pwaUpdateReady?'<button type="button" class="n2h-update" data-action="pwa-update">Mettre à jour NETHOR</button>':'')+'</section>'+
    '</div>';
}


/* Etat du poste NethorSync: serveur seul, aucun secret de poste dans le navigateur. */
async function loadNethorSyncStatus(){
 if(!state.user||!isSyncOverviewRole(state.profile?.role,!smallScreen())||state.nethorSync.loading)return;
 const userId=state.user.id;
 state.nethorSync.loading=true;
 if(state.page==='home')render();
 const [current,history,auto,diags,historical]=await Promise.allSettled([readSyncStatus(client),readSyncHistory(client),readSyncAutoPublications(client,{limit:20}),readSyncDiagnostics(client,{limit:8}),readSyncHistoricalSummary(client)]);
 if(state.user?.id!==userId)return;
 state.nethorSync={
  loaded:current.status==='fulfilled',loading:false,
  status:current.status==='fulfilled'?current.value:null,
  error:current.status==='fulfilled'?'':'État temporairement indisponible',
  checkedAt:Date.now(),
  historyLoaded:history.status==='fulfilled',
  history:history.status==='fulfilled'?history.value:[],
  historyError:history.status==='fulfilled'?'':'Historique temporairement indisponible',
  autoLoaded:auto.status==='fulfilled',
  autoPublications:auto.status==='fulfilled'?auto.value:[],
  autoError:auto.status==='fulfilled'?'':'Suivi temporairement indisponible',
  historicalImport:historical.status==='fulfilled'?historical.value:null,
  diagnostics:diags.status==='fulfilled'?diags.value:[]
 };
 if(state.page==='home')render();
}

async function loadImportSyncStatus(force=false){
  if(!state.user||state.page!=='import'||smallScreen()||state.importSync.loading)return;
  if(!force&&state.importSync.checkedAt&&Date.now()-state.importSync.checkedAt<60000)return;
  const userId=state.user.id;
  state.importSync={...state.importSync,loading:true,error:''};
  render();
  let status=null,error='';
  try{status=await readSyncStatus(client);}
  catch(_){error='État NethorSync non vérifiable';}
  if(state.user?.id!==userId)return;
  state.importSync={loaded:!error,loading:false,status,error,checkedAt:Date.now()};
  if(state.page==='import'&&!smallScreen())render();
}

function pageHome(metrics){
  if(isMobileHome())return mobileOverviewPage();
  const me=state.profile.planning_name||state.profile.display_name;
  const mine=metrics.people.find(p=>normalizeName(p.name)===normalizeName(me));
  let personal='';
  if(mine)personal='<div class="live-message ok">Mon planning cette semaine : <strong>'+hours(mine.total)+'</strong> · '+escapeHtml(mine.name)+'</div>';
  if(isSyncOverviewRole(state.profile?.role,!smallScreen())){
    const top=renderPageHeader('NETTO LE THOR','Bonjour '+(state.profile.display_name||'')+',',
      'Le planning de la semaine et l’état de synchronisation NethorSync.',
      state.access==='manage'?button('Importer un planning','go-import',true):button('Voir le planning','go-planning',true));
    // Vue d'ensemble Admin / Point de vente : planning complet d'abord,
    // NethorSync et son historique en pleine largeur ensuite, sans KPIs en double.
    return top+personal+
      '<div class="n2sync-home-content">'+planningCard(metrics)+
      renderSyncOverviewCard(state.nethorSync,Date.now(),syncChartPeriod)+'</div>';
  }
  return renderPageHeader('NETTO LE THOR','Bonjour '+(state.profile.display_name||'')+',','Retrouve les horaires de l’équipe et les contrôles de la semaine.',state.access==='manage'?button('Importer un planning','go-import',true):button('Voir le planning','go-planning',true))+personal+homePwaInstall()+summary(metrics)+'<div class="layout"><div class="stack">'+planningCard(metrics)+coverageCard(metrics)+'</div><div class="stack">'+alertsCard(metrics,true)+'</div></div>';
}
async function loadAnnualWeeks(force=false){
 if(!state.user||!annualAllowed()||state.page!=='planning'||state.view!=='year')return;
 const year=state.mobilePlanning.year;
 if(!force&&state.mobilePlanning.annual.loaded&&state.mobilePlanning.annual.year===year)return;
 if(!force&&state.mobilePlanning.annual.loading&&state.mobilePlanning.annual.year===year)return;
 const request=++annualRequestId,userId=state.user.id;
 state.mobilePlanning.annual={year,weeks:[],loading:true,loaded:false,error:''};
 render();
 try{
  const weeks=await getPublishedWeeksForYear(client,year);
  if(request!==annualRequestId||state.user?.id!==userId||state.mobilePlanning.year!==year)return;
  state.mobilePlanning.annual={year,weeks,loading:false,loaded:true,error:''};
 }catch(_){
  if(request!==annualRequestId||state.user?.id!==userId||state.mobilePlanning.year!==year)return;
  state.mobilePlanning.annual={year,weeks:[],loading:false,loaded:true,error:'Impossible de consulter les semaines publiées.'};
 }finally{
  if(request===annualRequestId&&state.user?.id===userId&&state.page==='planning'&&state.view==='year'&&annualAllowed())render();
 }
}
function collaboratorPanel(){
 if(!adminPlanningDesktop()||!collaboratorHistory.open)return '';
 const c=collaboratorHistory;
 const query=normalizeName(c.search);
 const items=query?c.items.filter(item=>normalizeName(item.name+' '+item.displayName).includes(query)):c.items;
 const rows=items.map(item=>{
   const account=item.profileId?(item.accountEnabled===false?'<span class="chip warn">Compte désactivé</span>':'<span class="chip">Compte actif</span>'):'<span class="chip info">Sans compte associé</span>';
   return '<article class="n2collab-row"><div class="n2collab-person">'+person(item.name)+'<small>'+(item.displayName&&normalizeName(item.displayName)!==normalizeName(item.name)?'Compte : '+escapeHtml(item.displayName):'Nom lu dans les plannings')+'</small></div><div class="n2collab-dates"><span><b>Première apparition</b>'+escapeHtml(longDate(item.first))+'</span><span><b>Dernière apparition</b>'+escapeHtml(longDate(item.last))+'</span><span><b>Semaines disponibles</b>'+item.weeks+'</span></div>'+account+'</article>';
 }).join('');
 const content=c.loading?'<div class="live-empty">Recherche de l’historique des collaborateurs…</div>':c.error?'<div class="live-error">'+escapeHtml(c.error)+'</div><button class="btn" data-action="collaborators-retry">Réessayer</button>':!c.items.length?'<div class="live-empty">Aucun collaborateur trouvé dans les plannings publiés.</div>':
 '<div class="n2collab-tools"><input id="collaboratorHistorySearch" type="search" value="'+escapeHtml(c.search)+'" placeholder="Rechercher dans tout l’historique" autocomplete="off"><span>'+items.length+' / '+c.items.length+'</span></div><div class="n2collab-list">'+(rows||'<div class="live-empty">Aucun résultat.</div>')+'</div>';
 return '<section class="card n2collab-panel" aria-label="Historique des collaborateurs"><div class="card-head"><div><h2 class="card-title">Collaborateurs</h2><p class="sub">Apparitions dans les plannings publiés. Une absence de semaine publiée reste distincte d’un repos réel.</p></div><button type="button" class="btn" data-action="collaborators-toggle">Fermer ✕</button></div>'+content+'</section>';
}
function pagePlanning(metrics){
  if(annualAllowed()&&state.view==='year'){
    return renderPlanningYear({...state.mobilePlanning.annual,year:state.mobilePlanning.year,
      today:dateInParis(),selectedDay:state.day});
  }
  if(isMobileHome())return renderMobilePlanning({
    weekStart:state.week,selectedDay:state.day,view:state.view,
    model:visibleModel(),profiles:state.profiles,
    currentProfile:state.profile,allowYear:annualAllowed(),filter:state.mobilePlanning.dayFilter,
    awayExpanded:state.mobilePlanning.awayExpanded,loading:state.loading,error:state.error,
    updatedAt:state.planningLoadedAt,isOnline:state.networkOnline,updateReady:state.pwaUpdateReady
  });
  const actions=(state.access==='manage'?button('Importer Excel','go-import',true):'')+(!smallScreen()?button('Imprimer','print-planning'):'');
   return renderPageHeader('PLANNING','Planning du personnel','Horaires publiés et contrôlés selon tes autorisations.',actions)+summary(metrics)+collaboratorPanel()+planningCard(metrics);
}

async function loadMobileSyncStatus(force=false){
 if(!state.user||!smallScreen()||state.page!=='anomalies'||state.mobileSync.loading)return;
 if(!force&&state.mobileSync.loaded&&Date.now()-state.mobileSync.checkedAt<120000)return;
 const userId=state.user.id;
 state.mobileSync.loading=true;
 render();
 try{
  const result=await readMobileSyncSummary(client);
  if(state.user?.id!==userId)return;
  state.mobileSync={...result,loading:false};
 }catch(_){
  if(state.user?.id!==userId)return;
  state.mobileSync={loaded:true,loading:false,planning:null,planningError:true,sync:null,syncError:true,checkedAt:Date.now()};
 }finally{
  if(state.user?.id===userId){state.mobileSync.loading=false;if(state.page==='anomalies'&&smallScreen())render();}
 }
}

function pageAnomalies(metrics){
  if(smallScreen())return renderMobileSyncSummary(state.mobileSync);
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

async function invokeAccountFunction(name,body){
 const {data,error}=await client.functions.invoke(name,{body});
 if(error)throw Error('Service indisponible. Réessaie plus tard.');
 if(data?.error)throw Error(String(data.error).slice(0,210));
 return data||{};
}
function accountNotice(message,kind='info'){
 state.accountSecurity.message=message;
 state.accountSecurity.kind=kind;
 if(state.page==='settings')render();
}
async function loadAccountRecoveryStatus(){
 if(!state.user||state.accountSecurity.loading)return;
 const userId=state.user.id;
 state.accountSecurity.loading=true;
 state.accountSecurity.error=false;
 if(state.page==='settings')render();
 try{
  const response=await invokeAccountFunction('profile-email',{action:'status'});
  if(state.user?.id!==userId)return;
  if(response.success!==true||typeof response.configured!=='boolean')throw Error('Réponse de vérification invalide.');
  state.accountSecurity.configured=response.configured;
  state.accountSecurity.loaded=true;
 }catch(_){
  if(state.user?.id!==userId)return;
  state.accountSecurity.error=true;state.accountSecurity.loaded=false;
  state.accountSecurity.message='Vérification de l’adresse indisponible.';
  state.accountSecurity.kind='error';
 }finally{
  if(state.user?.id===userId){state.accountSecurity.loading=false;if(state.page==='settings')render();}
 }
}

function shouldCheckRecoveryOnLogin(){
 return smallScreen()&&(state.profile?.role==='employe'||state.profile?.role==='responsable')&&!recoveryPrompt.dismissed;
}
function closeFirstLoginRecovery(remember=false){
 document.getElementById('firstLoginRecoveryPrompt')?.remove();
 recoveryPrompt.step='closed';
 recoveryPrompt.error='';
 if(remember){
  recoveryPrompt.dismissed=true;
  if(state.user?.id)try{sessionStorage.setItem(recoveryDismissKey(state.user.id),'1');}catch(_){/* sessionStorage optionnel */}
 }
}
function presentFirstLoginRecovery(step='offer'){
 if(!smallScreen()||!state.user||!['employe','responsable'].includes(state.profile?.role))return;
 if(step==='offer'&&!shouldOfferRecoveryPrompt({
  role:state.profile?.role,mobile:smallScreen(),loaded:state.accountSecurity.loaded,
  configured:state.accountSecurity.configured,error:state.accountSecurity.error,dismissed:recoveryPrompt.dismissed
 }))return;
 recoveryPrompt.step=step;
 const current=document.getElementById('firstLoginRecoveryPrompt');
 if(current)current.remove();
 document.body.insertAdjacentHTML('beforeend',renderRecoveryPrompt({
  step,busy:recoveryPrompt.saving,error:recoveryPrompt.error,mailStatus:recoveryPrompt.mailStatus
 }));
 const dialog=document.getElementById('firstLoginRecoveryPrompt');
 (step='form'?dialog?.querySelector('#firstLoginRecoveryEmail'):dialog?.querySelector('button'))?.focus({preventScroll:true});
}
async function maybeOfferRecoveryAfterLogin(){
 if(!shouldCheckRecoveryOnLogin())return;
 const userId=state.user.id;
 if(!state.accountSecurity.loaded&&!state.accountSecurity.loading)await loadAccountRecoveryStatus();
 if(state.user?.id!==userId||!shouldCheckRecoveryOnLogin())return;
 presentFirstLoginRecovery('offer');
}
function setFirstLoginRecoveryError(message){
 const form=document.getElementById('firstLoginRecoveryForm');
 if(!form)return;
 let error=form.querySelector('.n2rp-error');
 if(!error){error=document.createElement('p');error.className='n2rp-error';error.setAttribute('role','alert');form.querySelector('#firstLoginRecoveryEmail')?.insertAdjacentElement('afterend',error);}
 error.textContent=message;
}
async function saveFirstLoginRecovery(form){
 if(recoveryPrompt.step!=='form'||recoveryPrompt.saving||!state.user)return;
 const field=form.querySelector('#firstLoginRecoveryEmail');
 let email;
 try{email=validateRecoveryEmail(field?.value);}
 catch(err){setFirstLoginRecoveryError(err.message);field?.focus();return;}
 const id=state.user.id;
 recoveryPrompt.saving=true;
 const submit=form.querySelector('[type="submit"]');
 if(submit){submit.disabled=true;submit.textContent='Enregistrement…';}
 if(field)field.disabled=true;
 try{
  const result=await invokeAccountFunction('profile-email',{action:'save',old_email:'',new_email:email});
  if(state.user?.id!==id||recoveryPrompt.step!=='form')return;
  if(result.configured!==true)throw Error("L’enregistrement de l’adresse n’a pas été confirmé.");
  state.accountSecurity.configured=true;
  state.accountSecurity.loaded=true;
  state.accountSecurity.error=false;
  recoveryPrompt.mailStatus=result.mail_status||'';
  recoveryPrompt.error='';
  recoveryPrompt.saving=false;
  presentFirstLoginRecovery('success');
 }catch(err){
  if(state.user?.id===id&&recoveryPrompt.step==='form')setFirstLoginRecoveryError(String(err.message||'Enregistrement indisponible. Réessaie plus tard.'));
 }finally{
  recoveryPrompt.saving=false;
  if(state.user?.id===id&&recoveryPrompt.step==='form'){
   if(submit){submit.disabled=false;submit.textContent='Associer cette adresse';}
   if(field)field.disabled=false;
  }
 }
}

async function saveRecoveryEmail(form){
 if(state.accountSecurity.busy||!state.user)return;
 let newEmail;
 try{newEmail=validateRecoveryEmail(form.querySelector('#newRecoveryEmail')?.value);}
 catch(err){accountNotice(err.message,'error');return;}
 const oldEmail=String(form.querySelector('#oldRecoveryEmail')?.value||'').trim().toLowerCase();
 const userId=state.user.id;
 state.accountSecurity.busy=true;
 const submit=form.querySelector('button[type="submit"]');
 if(submit){submit.disabled=true;submit.textContent='Enregistrement…';}
 try{
  const result=await invokeAccountFunction('profile-email',{action:'save',old_email:oldEmail,new_email:newEmail});
  if(state.user?.id!==userId)return;
  state.accountSecurity.configured=result.configured===true;
  state.accountSecurity.loaded=true;state.accountSecurity.error=false;
  accountNotice('Adresse de récupération enregistrée.'+
   (result.mail_status==='sent'?' Un message d’information a été envoyé.':' L’envoi du message d’information n’est pas confirmé.'),'success');
 }catch(err){if(state.user?.id===userId)accountNotice(err.message,'error');}
 finally{if(submit)submit.disabled=false;if(state.user?.id===userId){state.accountSecurity.busy=false;if(state.page==='settings')render();}}
}
async function changeMyPassword(form){
 if(state.accountSecurity.busy||!state.user)return;
 let changes;
 try{changes=validateNewPassword(form.querySelector('#oldPassword')?.value,form.querySelector('#newPassword')?.value,form.querySelector('#confirmPassword')?.value);}
 catch(err){accountNotice(err.message,'error');return;}
 const userId=state.user.id;
 const submit=form.querySelector('button[type="submit"]');
 state.accountSecurity.busy=true;
 if(submit){submit.disabled=true;submit.textContent='Modification…';}
 try{
  // Le SDK traduit currentPassword en current_password côté Supabase Auth.
  const {error}=await client.auth.updateUser(changes);
  if(error)throw error;
  if(state.user?.id===userId)accountNotice('Ton mot de passe a été modifié. Utilise-le à ta prochaine connexion.','success');
 }catch(error){
  if(state.user?.id===userId)accountNotice(error?.code==='reauthentication_needed'?
   'Supabase demande une vérification complémentaire. Utilise le lien de récupération par e-mail.':
   'Impossible de changer le mot de passe. Vérifie le mot de passe actuel et réessaie.','error');
 }finally{
  for(const name of ['oldPassword','newPassword','confirmPassword']){const input=form.querySelector('#'+name);if(input)input.value='';}
  if(submit)submit.disabled=false;
  if(state.user?.id===userId){state.accountSecurity.busy=false;if(state.page==='settings')render();}
 }
}
async function requestRecoveryEmail(identifier,fromLogin=false){
 const text=String(identifier||'').trim();
 if(!text){if(fromLogin)showMessage('Saisis ton identifiant avant de demander un lien.');return;}
 if(!fromLogin&&Date.now()-state.accountSecurity.lastRequestAt<120000){
  accountNotice('Une demande vient d’être faite. Vérifie d’abord tes e-mails.');return;
 }
 try{
  // Lien Auth généré côté serveur et envoyé par Resend, jamais par le navigateur.
  await invokeAccountFunction('password-recovery-email',{action:'request',identifier:text});
  if(fromLogin)showMessage(RESET_REQUEST_MESSAGE,'info');
  else{state.accountSecurity.lastRequestAt=Date.now();accountNotice(RESET_REQUEST_MESSAGE,'success');}
 }catch(_){
  if(fromLogin)showMessage('Service momentanément indisponible. Réessaie plus tard.');
  else accountNotice('Impossible de transmettre la demande pour le moment.','error');
 }
}

function pageSettings(){
 const syncMarkup=syncController?.settingsMarkup()||'';
 return renderPageHeader('MON ESPACE','Paramètres','Informations personnelles, sécurité et préférences de ton compte.')+
  renderSettingsPage({
   view:state.settingsPanel,account:state.accountSecurity,
   displayName:state.profile?.display_name||'—',
   identifier:state.user?.email||'Non disponible',
   role:listRole(state.profile?.role),access:state.access,
   lastSignIn:settingsDate(state.user?.last_sign_in_at),
   preferredView:state.planningPreference,allowYear:annualAllowed(),
   isPwa:isInstalledPwa(),isOnline:state.networkOnline,
   workerActive:Boolean(navigator.serviceWorker?.controller),
   appVersion:APP_VERSION,lastPlanningCheck:settingsDate(state.planningLoadedAt),updateReady:state.pwaUpdateReady,
   lastCheck:settingsDate(state.lastCheck),
   syncMarkup,feedback:state.settingsFeedback
  });
}
function pageImport(){
  if(state.access!=='manage')return '<div class="live-error">Tu n’as pas les droits de gérer le planning.</div>';
  let body='<section class="card"><div class="card-head"><div><h2 class="card-title">Fichier Excel</h2><p class="sub">Glisser-déposer ou sélection · .xls / .xlsx / .xlsm · maximum 10 Mo</p></div></div><label class="live-import-drop" id="importDrop"><strong>⇧ Importer un fichier planning</strong><span>Le fichier est analysé localement avant validation</span><input type="file" id="excelFile" accept=".xls,.xlsx,.xlsm"></label></section>';
  if(!smallScreen())body+=renderImportSyncGuide(state.importSync);
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
  return renderPageHeader('TRAÇABILITÉ','Historique des imports','Imports manuels et transferts NethorSync · versions et remplacements.',button('Actualiser','history-refresh'))+
    '<section class="card n2hist-card"><div class="card-head"><div><h2 class="card-title">Historique des fichiers</h2>'+
    '<p class="sub">Les plannings récents remplacés peuvent être publiés automatiquement après une analyse complète. Une version refusée reste archivée sans modifier les horaires.</p></div></div>'+
    '<div class="n2hist-list">'+renderImportHistory(state.history)+'</div></section>';
}
function render(){
  const screen=ROOT.querySelector('#screen');
  if(!screen||!state.profile)return;
  if(state.page==='import'&&state.access!=='manage')state.page='planning';
  if(state.page==='history'&&state.profile.role!=='admin')state.page='planning';
  if(!canNavigate(state.page,state.profile,smallScreen()))state.page='planning';
  ROOT.classList.toggle('staff-desktop-layout',isStaffDesktop());
  ROOT.classList.toggle('personal-home-active',state.page==='home'&&isMobileHome());
  ROOT.classList.toggle('mobile-planning-active',state.page==='planning'&&isMobileHome());
  ROOT.classList.toggle('desktop-year-active',state.page==='planning'&&state.view==='year'&&desktopAnnualAllowed());
  ROOT.classList.toggle('mobile-sync-active',state.page==='anomalies'&&smallScreen());
  // Mobile / PWA : entête NETHOR hors défilement pour les autres écrans.
  // Accueil personnel, Planning personnel et NethorSync conservent leur structure dédiée.
  ROOT.classList.toggle('mobile-content-scroll',smallScreen()&&
    !(state.page==='home'&&isMobileHome())&&
    !(state.page==='planning'&&isMobileHome())&&state.page!=='anomalies');
  document.title='NETHOR · '+(smallScreen()?MOBILE_PAGE_TITLES[state.page]:TITLES[state.page]);
  ROOT.querySelector('#breadPage').textContent=TITLES[state.page];
  ROOT.querySelector('#mobileCurrentPage').textContent=MOBILE_PAGE_TITLES[state.page]||TITLES[state.page];
  const anomaliesNav=ROOT.querySelector('[data-nav="anomalies"]');
  if(anomaliesNav){
    const permitted=canNavigate('anomalies',state.profile,smallScreen());
    anomaliesNav.hidden=!permitted;
    anomaliesNav.style.display=permitted?'':'none';
    if(anomaliesNav.lastChild?.nodeType===3)anomaliesNav.lastChild.textContent=smallScreen()?'NethorSync':'Anomalies';
  }
  const syncTab=ROOT.querySelector('.live-navigator [data-page="anomalies"] .nav-label');
  if(syncTab)syncTab.textContent=smallScreen()?'NethorSync':'Alertes';
  const connectionStatus=ROOT.querySelector('#connectionStatus');
  if(connectionStatus){
    connectionStatus.dataset.online=String(state.networkOnline);
    connectionStatus.textContent=state.networkOnline?'● EN LIGNE':'● HORS LIGNE';
  }
  ROOT.querySelectorAll('[data-page]').forEach(el=>{
    el.classList.toggle('active',el.dataset.page===state.page);
    if(el.dataset.page===state.page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  const model=visibleModel(),metrics=analyze(model);
  const pages={home:()=>pageHome(metrics),planning:()=>pagePlanning(metrics),anomalies:()=>pageAnomalies(metrics),import:pageImport,team:()=>pageTeam(metrics),history:pageHistory,settings:pageSettings};
  let top='';
  if(state.loading&&!((state.page==='home'||state.page==='planning')&&isMobileHome()))top+='<div class="live-message">Chargement du planning…</div>';
  if(state.error&&!((state.page==='home'||state.page==='planning')&&isMobileHome()))top+='<div class="live-error">'+escapeHtml(state.error)+'</div>';
  if(state.notice&&!((state.page==='home'||state.page==='planning')&&isMobileHome()))top+='<div class="live-message ok">'+escapeHtml(state.notice)+'</div>';
  screen.innerHTML=top+pages[state.page]();
  syncController?.paint();
}
function go(page){
  if(!(page in TITLES)||!canNavigate(page,state.profile,smallScreen()))return;
  const previousPage=state.page;
  state.page=page;state.notice='';state.error='';
  if(page==='settings'&&previousPage!==page){state.settingsPanel='home';state.settingsFeedback='';}
  if(page==='planning'&&previousPage!==page){
   state.view=state.planningPreference==='year'&&!annualAllowed()?'week':state.planningPreference;
   if(state.view==='year'){
    state.mobilePlanning.year=Number((state.day||dateInParis()).slice(0,4));
    state.mobilePlanning.annual={year:null,weeks:[],loading:false,loaded:false,error:''};
   }
  }
  closeMobileMenu();
  if(page==='history')void loadHistory();else render();
  if(page==='anomalies'&&smallScreen())void loadMobileSyncStatus();
  if(page==='import'&&!smallScreen())void loadImportSyncStatus();
  if(page==='home'&&isSyncOverviewRole(state.profile?.role,!smallScreen())&&!state.nethorSync.loading)void loadNethorSyncStatus();
  if(page==='settings'&&!state.accountSecurity.loaded&&!state.accountSecurity.loading)void loadAccountRecoveryStatus();
  if(page==='planning'&&state.view==='year'&&annualAllowed())void loadAnnualWeeks(true);
  if(page==='home'&&isMobileHome()&&!state.personal.loading&&(!state.personal.loadedAt||Date.now()-state.personal.loadedAt>120000||state.personal.today!==dateInParis()))void loadPersonalHome();
  const mobileScroller=ROOT.querySelector('#screen');
  if(smallScreen()&&mobileScroller)mobileScroller.scrollTop=0;
  window.scrollTo({top:0,behavior:'instant'});
}
async function loadHistory(){
  if(state.profile?.role!=='admin')return;
  state.loading=true;state.error='';render();
  try{
    const [manual,sync]=await Promise.allSettled([
      getImportHistory(client,{limit:200}),readSyncFileChanges(client,{limit:200})
    ]);
    if(manual.status==='rejected'&&sync.status==='rejected'){
      throw Error('Les deux historiques sont temporairement indisponibles.');
    }
    state.history=mergeImportHistory(
      manual.status==='fulfilled'?manual.value:[],
      sync.status==='fulfilled'?sync.value:[]
    );
    state.error=manual.status==='rejected'?'Imports manuels temporairement indisponibles.':
      sync.status==='rejected'?'Historique NethorSync temporairement indisponible.':'';
  }catch(err){state.error='Impossible de charger l’historique : '+String(err.message||err);}
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
  const selectedFile=state.importFile,selectedModel=state.importModel;
  if(!smallScreen()){
    // Lire le poste au moment de publier, pas uniquement lors de l'ouverture de la page.
    let health='error';
    try{
      const status=await readSyncStatus(client);
      state.importSync={loaded:true,loading:false,status,error:'',checkedAt:Date.now()};
      health=importSyncHealth(state.importSync);
    }catch(_){
      state.importSync={loaded:false,loading:false,status:null,error:'État NethorSync non vérifiable',checkedAt:Date.now()};
    }
    if(!await confirmImportManually({health,weekLabel:longDate(selectedModel.weekStart),fileName:selectedFile.name}))return;
  }else if(!window.confirm('Publier le planning du '+longDate(selectedModel.weekStart)+' et remplacer sa version actuelle ?'))return;
  if(state.page!=='import'||state.busy||state.importFile!==selectedFile||state.importModel!==selectedModel)return;
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
  const record=state.history.find(x=>x.source==='manual'&&x.storage_path===path);
  if(!record)return;
  const {data,error}=await client.storage.from('planning-files').download(path);
  if(error){state.error='Téléchargement refusé : '+error.message;render();return;}
  const u=URL.createObjectURL(data);const a=document.createElement('a');a.href=u;a.download=record.file_name||'planning.xls';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
// Lorsqu'une semaine est remplacée depuis le MSI, les écrans ouverts doivent
// recevoir la nouvelle révision sans rechargement manuel de l'application.
let weekRefreshBusy=false;
let lastWeekRefresh=0;
async function refreshPublishedWeekQuietly(){
 if(!state.user||weekRefreshBusy||state.loading||state.busy||document.visibilityState!=='visible')return;
 if(state.page!=='planning'&&state.page!=='home')return;
 if(Date.now()-lastWeekRefresh<45000)return;
 weekRefreshBusy=true;lastWeekRefresh=Date.now();
 const requestedWeek=state.week,requestedUser=state.user.id;
 try{
  const updated=await getPlanningWeek(client,requestedWeek);
  if(state.user?.id!==requestedUser||state.week!==requestedWeek)return;
  state.planningLoadedAt=Date.now();
  if((state.weekData?.revision||null)!==(updated?.revision||null)){
    state.weekData=updated;
    render();
    if(isMobileHome()&&!state.personal.loading)void loadPersonalHome();
  }
 }catch(err){console.warn('Actualisation silencieuse du planning indisponible',String(err?.message||err));}
 finally{weekRefreshBusy=false;}
}
setInterval(()=>{
 if(!state.user||document.visibilityState!=='visible')return;
 void refreshPublishedWeekQuietly();
 if(state.page==='home'&&isSyncOverviewRole(state.profile?.role,!smallScreen())&&
    !state.nethorSync.loading&&Date.now()-(state.nethorSync.checkedAt||0)>60000){
   void loadNethorSyncStatus();
 }
  if(state.page==='import'&&!smallScreen()&&!state.importSync.loading&&Date.now()-(state.importSync.checkedAt||0)>60000){
   void loadImportSyncStatus();
  }
},60000);

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
    if(!canNavigate(state.page,state.profile,smallScreen()))state.page='planning';
    if(roleChanged){
      closeFirstLoginRecovery();
      renderShell();
    }
    render();
    void refreshPublishedWeekQuietly();
    if(state.page==='home'&&isMobileHome()&&!state.personal.loading&&(Date.now()-state.personal.loadedAt>120000||state.personal.today!==dateInParis()))void loadPersonalHome();
    if(state.page==='anomalies'&&smallScreen()&&(!state.mobileSync.loaded||Date.now()-state.mobileSync.checkedAt>120000))void loadMobileSyncStatus(true);
  }catch{await signOut();}
}
// Le dialogue est monté directement sur <body> : hors des conteneurs à overflow
// hidden de l'accueil mobile, et au-dessus du menu et du planning.
document.addEventListener('submit',async event=>{
  if(event.target.id==='firstLoginRecoveryForm'){
    event.preventDefault();
    await saveFirstLoginRecovery(event.target);
  }
});
document.addEventListener('click',event=>{
  const actionButton=event.target.closest('#firstLoginRecoveryPrompt [data-action^="recovery-"]');
  if(!actionButton)return;
  const action=actionButton.dataset.action;
  if(action==='recovery-add')presentFirstLoginRecovery('form');
  else if(action==='recovery-back')presentFirstLoginRecovery('offer');
  else if(action==='recovery-later')closeFirstLoginRecovery(true);
  else if(action==='recovery-done')closeFirstLoginRecovery();
});

ROOT.addEventListener('submit',async event=>{
  if(event.target.id==='recoveryEmailForm'){
    event.preventDefault();await saveRecoveryEmail(event.target);return;
  }
  if(event.target.id==='changePasswordForm'){
    event.preventDefault();await changeMyPassword(event.target);return;
  }
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
    clearRecoveryDismissed(gate.gate.user.id);
    await startAuthorized(gate);
  }catch(err){showMessage(String(err.message||err));if(submit){submit.disabled=false;submit.textContent='Se connecter';}}
});
ROOT.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-page]');
  if(nav){go(nav.dataset.page);return;}

  // La vue annuelle NETHOR 1 est volontairement réservée au téléphone et à sa PWA.
  const yearDate=event.target.closest('[data-year-day]');
  if(yearDate&&state.page==='planning'&&state.view==='year'&&annualAllowed()){
    const day=yearDate.dataset.yearDay;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
    state.day=day;
    state.week=mondayFor(day);
    state.view='week';
    state.mobilePlanning.dayFilter='all';
    await loadWeek();
    const scroller=ROOT.querySelector('#screen');if(scroller)scroller.scrollTop=0;
    return;
  }
  const mobileDay=event.target.closest('[data-mobile-planning-day]');
  if(mobileDay&&isMobileHome()){
    state.day=mobileDay.dataset.mobilePlanningDay;render();return;
  }
  const mobileOpen=event.target.closest('[data-mobile-planning-open]');
  if(mobileOpen&&isMobileHome()){
    state.day=mobileOpen.dataset.mobilePlanningOpen;state.view='day';render();return;
  }
  const mobileFilter=event.target.closest('[data-mobile-planning-filter]');
  if(mobileFilter&&isMobileHome()&&mobileFilter.dataset.filterMode==='day'){
    state.mobilePlanning.dayFilter=mobileFilter.dataset.mobilePlanningFilter;
    const y=ROOT.querySelector('#screen')?.scrollTop||0;
    render();
    const scroller=ROOT.querySelector('#screen');if(scroller)scroller.scrollTop=y;
    return;
  }
  const mobileAway=event.target.closest('[data-mobile-planning-away]');
  if(mobileAway&&isMobileHome()){
    event.preventDefault();
    state.mobilePlanning.awayExpanded=!state.mobilePlanning.awayExpanded;
    const y=ROOT.querySelector('#screen')?.scrollTop||0;
    render();
    const scroller=ROOT.querySelector('#screen');if(scroller)scroller.scrollTop=y;
    return;
  }
  const day=event.target.closest('[data-day]');
  if(day){state.day=day.dataset.day;state.view='day';render();return;}
  const link=event.target.closest('[data-link-save]');
  if(link){try{await saveLink(link.dataset.linkSave);}catch(err){state.error=String(err.message||err);render();}return;}
  const dl=event.target.closest('[data-download]');
  if(dl){await downloadHistory(dl.dataset.download);return;}
  const b=event.target.closest('[data-action]');
  if(!b)return;
  const action=b.dataset.action;
  if(state.page==='settings'){
   if(action==='settings-open'){
    const allowed=['profile','permissions','password','email','sessions','planning','notifications','application','diagnostic','sync'];
    const view=b.dataset.settingsView;
    if(!allowed.includes(view)||(view==='sync'&&!syncController))return;
    state.settingsPanel=view;state.settingsFeedback='';render();
    ROOT.querySelector('#screen')?.scrollTo({top:0});return;
   }
   if(action==='settings-back'){
    state.settingsPanel='home';state.settingsFeedback='';render();
    ROOT.querySelector('#screen')?.scrollTo({top:0});return;
   }
   if(action==='settings-planning-view'){
    const choice=b.dataset.settingsChoice;
    if(!['week','day','year'].includes(choice)||(choice==='year'&&!annualAllowed())||!state.user?.id)return;
    if(savePlanningPreference(state.user.id,choice)){
     state.planningPreference=choice;
     state.settingsFeedback='Vue enregistrée pour cet appareil.';
    }else state.settingsFeedback='Impossible d’enregistrer la préférence dans ce navigateur.';
    render();return;
   }
   if(action==='settings-copy-diagnostic'){
    try{
     if(!navigator.clipboard?.writeText)throw Error('Presse-papiers indisponible');
     await navigator.clipboard.writeText(settingsDiagnostics());
     state.settingsFeedback='Diagnostic copié, sans données de compte.';
    }catch(_){state.settingsFeedback='Copie impossible. Vérifie les autorisations du navigateur.';}
    render();return;
   }
  }
  if(state.page==='planning'&&annualAllowed()&&['year-view','year-prev','year-next','year-current','year-close'].includes(action)){
    if(action==='year-close'){state.view='week';annualRequestId++;render();return;}
    if(action==='year-view'){
      state.mobilePlanning.year=Number((state.day||dateInParis()).slice(0,4));
      state.view='year';
      render();
      const scroller=ROOT.querySelector('#screen');if(scroller)scroller.scrollTop=0;
      void loadAnnualWeeks(true);
      return;
    }
    const targetYear=action==='year-current'
      ?Number(dateInParis().slice(0,4))
      :state.mobilePlanning.year+(action==='year-prev'?-1:1);
    if(targetYear<1900||targetYear>2100)return;
    state.mobilePlanning.year=targetYear;
    state.mobilePlanning.annual={year:null,weeks:[],loading:false,loaded:false,error:''};
    render();
    const scroller=ROOT.querySelector('#screen');if(scroller)scroller.scrollTop=0;
    void loadAnnualWeeks();
    return;
  }
  if(action==='collaborators-toggle'&&adminPlanningDesktop()){
    collaboratorHistory.open=!collaboratorHistory.open;render();
    if(collaboratorHistory.open)void loadCollaboratorHistory();return;
  }
  if(action==='collaborators-retry'&&adminPlanningDesktop()){
    collaboratorHistory.loaded=false;void loadCollaboratorHistory();return;
  }
  if(action==='nethor-sync-mobile-refresh'){
    if(state.page==='anomalies'&&smallScreen())await loadMobileSyncStatus(true);
    return;
  }
  if(action==='nethor-sync-refresh'){await loadNethorSyncStatus();return;}
   if(action==='nethor-sync-chart-7'||action==='nethor-sync-chart-30'){
     if(!isSyncOverviewRole(state.profile?.role,!smallScreen())||state.page!=='home')return;
     syncChartPeriod=action==='nethor-sync-chart-30'?30:7;
     const scrollY=window.scrollY;render();window.scrollTo(0,scrollY);return;
   }
  if(action==='nethor-sync-install'){
    if(!isSyncOverviewRole(state.profile?.role,!smallScreen())||state.nethorSync.error||!state.nethorSync.loaded)return;
    const download=document.createElement('a');
    download.href=NETHOR_SYNC_INSTALLER_URL;
    download.rel='noopener noreferrer';
    document.body.appendChild(download);download.click();download.remove();
    const help=ROOT.querySelector('#n2sync-install-help');
    if(help){help.hidden=false;help.textContent='L’installateur NethorSync-Setup.exe (version corrigée 2.1.5) est téléchargé depuis GitHub Releases. Ouvre-le sur ce PC Windows puis sélectionne le dossier de tes plannings.';}
    return;
  }
  if(action==='sidebar-toggle'&&!smallScreen()){
    state.desktopSidebarCollapsed=!state.desktopSidebarCollapsed;
    if(state.user?.id)saveDesktopSidebar(state.user.id,state.desktopSidebarCollapsed);
    ROOT.classList.toggle('desktop-sidebar-collapsed',state.desktopSidebarCollapsed);
    const toggle=ROOT.querySelector('.n2-sidebar-toggle');if(toggle){toggle.textContent=state.desktopSidebarCollapsed?'›':'‹';toggle.setAttribute('aria-label',state.desktopSidebarCollapsed?'Déployer la barre latérale':'Réduire la barre latérale');}
    return;
  }
  if(action==='print-planning'&&!smallScreen()){window.print();return;}
  if(action==='forgot-password')await requestRecoveryEmail(ROOT.querySelector('#loginEmail')?.value,true);
  else if(action==='request-password-email'){
    if(!state.accountSecurity.configured){accountNotice('Associe d’abord une adresse e-mail de récupération.','error');return;}
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user?.email){accountNotice('Impossible d’identifier ton compte.','error');return;}
    await requestRecoveryEmail(data.user.email);
  }
  else if(action==='logout')await signOut();
  else if(action==='pwa-update'){
    const waiting=swRegistration?.waiting;
    if(waiting)waiting.postMessage({type:'SKIP_WAITING'});
    else{state.pwaUpdateReady=false;render();}
  }
  else if(action==='install-pwa')await installPwa();
  else if(action==='go-import')go('import');
  else if(action==='go-planning')go('planning');
  else if(action==='today'){
    if(weekLoadBusy)return;
    const today=dateInParis();state.week=mondayOf(today);state.day=today;state.mobilePlanning.dayFilter='all';await loadWeek();
  }
  else if(action==='prev'||action==='next'){
    if(weekLoadBusy)return;
    const dayIndex=datesFor(state.week).indexOf(state.day);
    state.week=plusDays(state.week,action==='prev'?-7:7);
    state.day=isMobileHome()&&dayIndex>=0?plusDays(state.week,dayIndex):state.week;
    await loadWeek();
  }
  else if(action==='refresh'){if(!weekLoadBusy)await loadWeek();}
  else if(action==='week-view'||action==='day-view'){state.view=action==='week-view'?'week':'day';render();}
  else if(action==='clear-import'){state.importFile=null;state.importModel=null;state.importAnalysis=null;state.importExisting=null;state.importError='';render();}
  else if(action==='publish')await publish();
  else if(action==='history-refresh')await loadHistory();
  else if(action.startsWith('sync-')&&syncController)await syncController.action(action);
});
ROOT.addEventListener('change',event=>{
  if(event.target.id==='excelFile'){void selectFile(event.target.files?.[0]);return;}
  if(event.target.id==='desktopPlanningDate'&&!smallScreen()){
    const value=event.target.value;
    if(/^\d{4}-\d{2}-\d{2}$/.test(value)){state.day=value;state.week=mondayOf(value);state.view='week';void loadWeek();}
  }
});
ROOT.addEventListener('input',event=>{
  const id=event.target.id;
  if(!['searchTeam','desktopPlanningSearch','collaboratorHistorySearch'].includes(id))return;
  const position=event.target.selectionStart||0;
  if(id==='searchTeam')state.search=event.target.value;
  else if(id==='desktopPlanningSearch')state.desktopPlanningSearch=event.target.value;
  else collaboratorHistory.search=event.target.value;
  render();
  const el=ROOT.querySelector('#'+id);el?.focus();el?.setSelectionRange(position,position);
});
ROOT.addEventListener('dragover',event=>{if(event.target.closest('#importDrop'))event.preventDefault();});
ROOT.addEventListener('drop',event=>{if(event.target.closest('#importDrop')){event.preventDefault();void selectFile(event.dataTransfer?.files?.[0]);}});
ROOT.addEventListener('click',event=>{
  // Un appui sur le symbole ≡ touche le span enfant, et non le bouton lui-même.
  // closest() corrige aussi les clics sur l'icône intérieure du bouton.
  const menuButton=event.target.closest('#mobileMenu');
  if(menuButton){
    const shown=ROOT.querySelector('#sidebar')?.classList.toggle('open')===true;
    ROOT.classList.toggle('menu-open',shown);
    menuButton.setAttribute('aria-expanded',String(shown));
  }else if(event.target.closest('#sidebarBackdrop'))closeMobileMenu();
});
function handleNetworkChange(){
 state.networkOnline=navigator.onLine;
 if(!state.user)return;
 render();
 if(state.networkOnline){
  void refreshPublishedWeekQuietly();
  if(isMobileHome()&&!state.personal.loading)void loadPersonalHome();
 }
}
window.addEventListener('online',handleNetworkChange);
window.addEventListener('offline',handleNetworkChange);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void verifyResume();});
window.addEventListener('focus',()=>void verifyResume());
window.matchMedia('(max-width:760px)').addEventListener?.('change',()=>{
  if(!smallScreen()){
    closeFirstLoginRecovery();
    if(state.view==='year'){annualRequestId++;state.view='week';}
  }
  if(!state.user)return;
  render();
  if(state.page==='anomalies'&&smallScreen())void loadMobileSyncStatus();
  if(isMobileHome()&&!state.personal.loading)void loadPersonalHome();
});
document.addEventListener('keydown',event=>{
 if(!document.getElementById('firstLoginRecoveryPrompt')){
  if(event.key==='Escape'){closeMobileMenu();return;}
  const target=event.target;
  const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||target?.isContentEditable;
  if(!typing&&!smallScreen()&&state.user&&state.page==='planning'&&event.altKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')&&!weekLoadBusy){
    event.preventDefault();
    state.week=plusDays(state.week,event.key==='ArrowLeft'?-7:7);state.day=state.week;void loadWeek();
  }
  return;
 }
 if(event.key==='Escape'){event.preventDefault();closeFirstLoginRecovery(true);return;}
 if(event.key==='Tab'){
  const buttons=[...document.querySelectorAll('#firstLoginRecoveryPrompt button:not(:disabled),#firstLoginRecoveryPrompt input:not(:disabled)')];
  if(!buttons.length)return;
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
async function registerPwaWorker(){
 if(!('serviceWorker' in navigator)||location.protocol!=='https:')return;
 try{
  swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
  const markUpdate=()=>{
   if(!navigator.serviceWorker.controller||!swRegistration?.waiting)return;
   state.pwaUpdateReady=true;
   if(state.user)render();
  };
  markUpdate();
  swRegistration.addEventListener('updatefound',()=>{
   const worker=swRegistration?.installing;
   if(!worker)return;
   worker.addEventListener('statechange',()=>{
    if(worker.state==='installed'&&navigator.serviceWorker.controller)markUpdate();
   });
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
   if(swReloading)return;
   swReloading=true;
   location.reload();
  });
 }catch(err){console.warn('Service Worker indisponible',err);}
}
async function boot(){
  if(booted)return;booted=true;
  void registerPwaWorker();
  try{
    if(!window.supabase?.createClient)throw Error('La bibliothèque de connexion est inaccessible. Vérifiez votre réseau.');
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'nethor2-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const access=await checkSession();
    if(access)await startAuthorized(access);else renderLogin();
  }catch(err){renderLogin('Connexion indisponible : '+String(err.message||err));}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();

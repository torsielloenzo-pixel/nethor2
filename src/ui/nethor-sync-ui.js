import {canManageSync,readSyncStatus,readSyncDiagnostics,requestManualSync,resetSyncDevice,syncHealth} from '../data/nethor-sync-control.js';
const INSTALLER='https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync-Setup.exe';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>{const ms=Date.parse(v||'');return Number.isFinite(ms)?new Date(ms).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'Jamais';};
// Le succès de la liaison Windows n'est PAS une preuve de synchronisation complète.
export function renderManualSyncPipeline(status){
 const stage=String(status?.manualStage||'none');
 if(stage==='none')return '';
 const pcDone=Boolean(status?.manualPcCompletedAt);
 const cloudStarted=Boolean(status?.manualCloudCheckId);
 const completed=['done','cloud_review'].includes(stage);
 const pcLabel=stage==='pc_error'?'Échec du traitement Windows':
   pcDone?'Fichiers vérifiés et transférés':
   stage==='pc_contact'?'Poste en contact · traitement non terminé':'En attente du poste Windows';
 const cloudLabel=stage==='cloud_error'?'Contrôle Supabase en échec':
   cloudStarted?(completed?'Contrôle Supabase terminé':'Contrôle Supabase en cours'):
   pcDone?'Contrôle Supabase à lancer':'Après confirmation du poste';
 const published=Number(status?.manualCloudProcessed||0);
 const refused=Number(status?.manualCloudRefused||0);
 const publishLabel=completed?
   (refused>0?'Publication partielle · fichiers à vérifier':
   published>0?published+' planning'+(published>1?'s':'')+' publié'+(published>1?'s':''):
   'Plannings vérifiés · aucun remplacement nécessaire'):
   'Après vérification serveur';
 const items=[
  ['Demande manuelle enregistrée','done'],
  [pcLabel,stage==='pc_error'?'error':pcDone?'done':stage==='pc_contact'?'current':'waiting'],
  [cloudLabel,stage==='cloud_error'?'error':completed?'done':cloudStarted?'current':'waiting'],
  [publishLabel,completed?'done':'waiting']
 ];
 return '<div class="sync-manual-pipeline" role="status" aria-label="Avancement synchronisation manuelle">'+
   '<strong>Synchronisation manuelle · suivi réel</strong>'+
   items.map(([label,flag],i)=>'<span class="sync-manual-step" data-step="'+esc(flag)+'">'+
     '<b>'+(i+1)+'</b>'+esc(label)+'</span>').join('')+
   (stage==='pc_error'?'<small class="sync-error">Le poste a signalé une erreur. La demande est conservée : consulter le rapport NethorSync sur Windows.</small>':'')+
   (status?.manualCloudError?'<small>Contrôle Supabase : '+esc(status.manualCloudError)+'</small>':'')+
   '</div>';
}

// Historique accessible uniquement aux gestionnaires (autorisation serveur).
export function renderSyncDiagnostics(records,error=''){
 const stages={file_scan:'Lecture Excel',storage_upload:'Transfert Supabase',file_history:'Historisation',sync_report:'Confirmation Windows',startup:'Démarrage'};
 const codes={file_access:'Accès au fichier',http_error:'Erreur HTTP',request_rejected:'Requête rejetée',timeout:'Délai dépassé',network:'Réseau indisponible',authorization:'Accès refusé',unexpected:'Erreur technique',mixed:'Plusieurs erreurs'};
 if(error)return '<p class="sync-diagnostic-empty">Rapports d’erreurs indisponibles pour le moment.</p>';
 if(!Array.isArray(records)||records.length===0)
   return '<p class="sync-diagnostic-empty">Aucun rapport automatique reçu. Une nouvelle version de l’agent doit être installée pour transmettre les erreurs Windows.</p>';
 return '<div class="sync-diagnostic-history">'+records.slice(0,12).map(report=>{
   const code=String(report.code||'unexpected');
   const stage=String(report.stage||'startup');
   const http=Number(report.httpStatus);
   const showHttp=Number.isInteger(http)&&http>=100&&http<=599;
   const groups=Array.isArray(report.breakdown)?report.breakdown.slice(0,5):[];
   return '<article class="sync-diagnostic-item">'+
     '<div><strong>'+esc(stages[stage]||'Étape inconnue')+' · '+esc(codes[code]||'Erreur technique')+
     (showHttp?' · HTTP '+http:'')+'</strong><time>'+esc(time(report.at))+'</time></div>'+
     '<p>'+esc(report.failed||0)+' erreur(s) sur '+esc(report.scanned||0)+' fichiers analysés · '+esc(report.transferred||0)+' transfert(s)</p>'+
     (groups.length>1?'<small>'+groups.map(g=>
       esc(stages[g.stage]||'Étape inconnue')+' : '+esc(g.count||0)+' × '+esc(codes[g.code]||'Erreur')).join(' · ')+'</small>':'')+
     '<small>Agent '+esc(report.clientVersion||'—')+' · Diagnostic #'+esc(report.id||'—')+'</small>'+
     '</article>';
 }).join('')+'</div>';
}

export function createSyncController(client,root,profile){
 if(!canManageSync(profile?.role))return null;
 const admin=profile.role==='admin';
 let status=null,error='',loading=false,notice='',watchTimer=null,requestStartedAt=0;
 let diagnostics=[],diagnosticsError='';
 const isInstalled=()=>status?.installed===true;
 function markup(){
  const state=syncHealth(status);
  const label=error&&!status?'État indisponible':state==='online'?'NethorSync opérationnel':isInstalled()?'NethorSync lié · hors ligne':'NethorSync non configuré';
  const details=isInstalled()
   ? '<div class="sync-side-details"><span>Poste : <strong>'+esc(status.deviceLabel||'Inconnu')+'</strong></span><span>Dépend de : '+esc(status.registeredBy||'Compte inconnu')+'</span><span>Dernière synchronisation : '+esc(time(status.lastCheckAt))+'</span><span>Dernier transfert Excel : '+esc(time(status.lastTransferAt))+'</span></div>'
   : '<p class="sync-side-small">Aucun poste NethorSync autorisé.</p>';
  const actions=error
   ? '<button class="sync-action" type="button" data-action="sync-state-refresh">Réessayer la vérification</button>'
   : !isInstalled()
   ? '<button class="sync-action" type="button" data-action="sync-download">Installer NethorSync</button>'
   : '<button class="sync-action" type="button" data-action="sync-request-manual"'+(status?.pendingManual&&status?.manualStage!=='pc_error'?' disabled':'')+'>'+(status?.manualStage==='pc_error'?'Réessayer la vérification':status?.pendingManual?'Traitement en cours…':'Synchroniser')+'</button><button class="sync-subaction" type="button" data-action="sync-state-refresh">Actualiser l’état</button><button class="sync-subaction" type="button" data-action="sync-download">Télécharger le correctif 2.1.6</button>';
  return '<div class="sync-side-heading"><span class="sync-indicator '+(state==='online'?'ok':isInstalled()?'warn':'muted')+'"></span><strong>'+label+'</strong></div>'+details+
   (error?'<p class="sync-side-small sync-error">'+esc(error)+'</p>':'')+
   (notice?'<p class="sync-side-small">'+esc(notice)+'</p>':'')+
   renderManualSyncPipeline(status)+actions;
 }
 function settingsMarkup(){
  return '<section class="card nethor-sync-settings" id="syncSettings"><div class="card-head"><div><h2 class="card-title">NethorSync · Poste maître</h2><p class="sub">Un seul ordinateur peut être lié à la fois.</p></div></div><div class="card-body">'+
   '<p>Poste : <strong>'+esc(isInstalled()?status.deviceLabel||'Inconnu':'Non installé/configuré')+'</strong></p>'+
   '<p>Lié par : '+esc(status?.registeredBy||'—')+'</p>'+
   '<p>Dernier contrôle : '+esc(time(status?.lastCheckAt))+' · Dernier transfert : '+esc(time(status?.lastTransferAt))+'</p>'+
   '<p class="live-muted">Sur Supabase : audit des fichiers Excel stockés à 00 h, 04 h, 08 h, 12 h, 16 h et 20 h UTC, suivi d’une publication automatique des versions valides si nécessaire. Après chaque contrôle Windows terminé et chaque nouveau transfert, analyse côté serveur également. Aucun ordre n’est envoyé au PC par cet audit. Sur le MSI : les tâches Windows restent à 19 h du lundi au samedi et à 12 h le dimanche. Le bouton « Synchroniser » conserve uniquement sa fonction de demande ponctuelle au MSI.</p>'+
   '<p><strong>Mode : Automatique</strong></p>'+
   '<p class="live-muted">Les versions Excel réellement modifiées et récentes sont publiées après vérification automatique ; les fichiers inconnus ou refusés ne remplacent jamais le planning.</p>'+
   (isInstalled()?'<button type="button" class="btn" data-action="sync-download">Télécharger la version corrigée 2.1.6</button>':'')+
   (admin&&isInstalled()?'<button type="button" class="btn" data-action="sync-reset-device">Révoquer / réinitialiser ce poste</button>':'')+
   '<section class="sync-diagnostic-panel"><h3>Rapports d’erreurs NethorSync</h3><p class="live-muted">Diagnostics techniques automatiques, sans données personnelles ni noms de fichiers. Conservation : 30 jours.</p>'+renderSyncDiagnostics(diagnostics,diagnosticsError)+'</section></div></section>';
 }
 function paint(){
  const side=root.querySelector('#syncSideCard');if(side)side.innerHTML=markup();
  const settings=root.querySelector('#syncSettings');if(settings)settings.outerHTML=settingsMarkup();
 }
 async function refresh(){
  if(loading)return;
  loading=true;
  try{
   const wasPending=status?.pendingManual===true;
   const [state,diag]=await Promise.allSettled([readSyncStatus(client),readSyncDiagnostics(client,{limit:12})]);
   if(state.status!=='fulfilled')throw state.reason;
   const next=state.value;status=next;error='';
   diagnostics=diag.status==='fulfilled'?diag.value:[];
   diagnosticsError=diag.status==='fulfilled'?'':'Rapports temporairement indisponibles';
   if(wasPending&&!next.pendingManual&&next.installed)notice='Vérification ponctuelle terminée sur le poste '+(next.deviceLabel||'autorisé')+'.';
  }
  catch(e){error=String(e.message||e);status=null;}
  finally{loading=false;if(!status?.pendingManual)requestStartedAt=0;paint();}
 }
 function mount(){
  const container=root.querySelector('.side-bottom');if(!container)return;
  container.insertAdjacentHTML('afterbegin','<section class="nethor-sync-side" id="syncSideCard" aria-live="polite"></section>');
  paint();void refresh();
  if(!watchTimer)watchTimer=setInterval(()=>{if((status?.pendingManual||['cloud_processing','cloud_pending','cloud_review'].includes(status?.manualStage))&&!loading){void refresh();}},5000);
 }
 async function action(name){
  if(name==='sync-download'){
    window.open(INSTALLER,'_blank','noopener,noreferrer');
    notice='Version 2.1.6 : ouvrez NethorSync-Setup.exe sur Windows, en conservant le dossier suivi et la liaison du poste.';
    paint();return true;
  }
  if(name==='sync-state-refresh'){await refresh();return true;}
  if(name==='sync-request-manual'){
    if(!isInstalled()||(status?.pendingManual&&status?.manualStage!=='pc_error'))return true;
    try{await requestManualSync(client);requestStartedAt=Date.now();notice='Demande conservée pour '+(status.deviceLabel||'le poste')+' : nouvelle tentative au prochain passage du contrôle Windows.';error='';await refresh();}
    catch(e){error=String(e.message||e);}paint();return true;
  }
  if(name==='sync-reset-device'){
    if(!admin||!isInstalled())return true;
    const label=status.deviceLabel||'ce poste';
    if(!window.confirm('Révoquer '+label+' ? L’ancien ordinateur ne pourra plus synchroniser, même après redémarrage.'))return true;
    try{await resetSyncDevice(client,status.generation);notice='L’ancien poste a été révoqué. Nouveau poste installable.';error='';await refresh();}
    catch(e){error=String(e.message||e);}paint();return true;
  }
  return false;
 }
 return {mount,refresh,settingsMarkup,paint,action,dispose(){if(watchTimer){clearInterval(watchTimer);watchTimer=null;}}};
}

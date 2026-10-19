import {canManageSync,readSyncStatus,requestManualSync,resetSyncDevice,syncHealth,setSyncMode} from '../data/nethor-sync-control.js';
const INSTALLER='https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync2-Setup.exe';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>{const ms=Date.parse(v||'');return Number.isFinite(ms)?new Date(ms).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'Jamais';};
export function createSyncController(client,root,profile){
 if(!canManageSync(profile?.role))return null;
 const admin=profile.role==='admin';
 let status=null,error='',loading=false,notice='';
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
   : '<button class="sync-action" type="button" data-action="sync-request-manual">Synchroniser manuellement</button><button class="sync-subaction" type="button" data-action="sync-state-refresh">Actualiser l’état</button>';
  return '<div class="sync-side-heading"><span class="sync-indicator '+(state==='online'?'ok':isInstalled()?'warn':'muted')+'"></span><strong>'+label+'</strong></div>'+details+
   (error?'<p class="sync-side-small sync-error">'+esc(error)+'</p>':'')+
   (notice?'<p class="sync-side-small">'+esc(notice)+'</p>':'')+
   (status?.pendingManual?'<p class="sync-side-small">Demande manuelle en attente du poste.</p>':'')+actions;
 }
 function settingsMarkup(){
  return '<section class="card nethor-sync-settings" id="syncSettings"><div class="card-head"><div><h2 class="card-title">NethorSync · Poste maître</h2><p class="sub">Un seul ordinateur peut être lié à la fois.</p></div></div><div class="card-body">'+
   '<p>Poste : <strong>'+esc(isInstalled()?status.deviceLabel||'Inconnu':'Non installé/configuré')+'</strong></p>'+
   '<p>Lié par : '+esc(status?.registeredBy||'—')+'</p>'+
   '<p>Dernier contrôle : '+esc(time(status?.lastCheckAt))+' · Dernier transfert : '+esc(time(status?.lastTransferAt))+'</p>'+
   '<p class="live-muted">Automatique : lundi au samedi 19 h ; dimanche 12 h (heure du poste réglée sur Europe/Paris). Manuel : via demande, contrôlée toutes les 5 minutes lorsque le PC est allumé.</p>'+
   (isInstalled()?'<p>Mode : <strong>'+esc(status.mode==='manual'?'Manuel':'Automatique')+'</strong></p><button type="button" class="btn" data-action="sync-mode-manual">Manuel</button> <button type="button" class="btn" data-action="sync-mode-automatic">Automatique</button>':'')+
   '<p class="live-muted">Les fichiers transférés restent soumis à la validation du planning dans Nethor2.</p>'+
   (admin&&isInstalled()?'<button type="button" class="btn" data-action="sync-reset-device">Révoquer / réinitialiser ce poste</button>':'')+'</div></section>';
 }
 function paint(){
  const side=root.querySelector('#syncSideCard');if(side)side.innerHTML=markup();
  const settings=root.querySelector('#syncSettings');if(settings)settings.outerHTML=settingsMarkup();
 }
 async function refresh(){
  if(loading)return;
  loading=true;
  try{status=await readSyncStatus(client);error='';}
  catch(e){error=String(e.message||e);status=null;}
  finally{loading=false;paint();}
 }
 function mount(){
  const container=root.querySelector('.side-bottom');if(!container)return;
  container.insertAdjacentHTML('afterbegin','<section class="nethor-sync-side" id="syncSideCard" aria-live="polite"></section>');
  paint();void refresh();
 }
 async function action(name){
  if(name==='sync-download'){
    window.open(INSTALLER,'_blank','noopener,noreferrer');
    notice='Ouvrez NethorSync2-Setup.exe sur Windows pour sélectionner le dossier des plannings.';
    paint();return true;
  }
  if(name==='sync-state-refresh'){await refresh();return true;}
  if(name==='sync-request-manual'){
    if(!isInstalled())return true;
    try{await requestManualSync(client);notice='Synchronisation demandée au poste actif.';error='';await refresh();}
    catch(e){error=String(e.message||e);}paint();return true;
  }
  if(name==='sync-mode-manual'||name==='sync-mode-automatic'){
    if(!isInstalled())return true;
    try{await setSyncMode(client,name==='sync-mode-manual'?'manual':'automatic');notice='Mode de synchronisation mis à jour.';error='';await refresh();}
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
 return {mount,refresh,settingsMarkup,paint,action};
}

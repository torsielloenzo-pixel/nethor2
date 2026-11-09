import {syncHealth} from '../data/nethor-sync-control.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const validDate=value=>{const n=typeof value==='number'?value:Date.parse(String(value||''));return Number.isFinite(n)?new Date(n):null;};

export function formatPublicSyncTime(value,{includeDate=true}={}){
 const d=validDate(value);
 if(!d)return {date:'—',time:'—',short:'—'};
 const opts={timeZone:'Europe/Paris'};
 const date=new Intl.DateTimeFormat('fr-FR',{...opts,day:'numeric',month:'short',year:'numeric'}).format(d);
 const time=new Intl.DateTimeFormat('fr-FR',{...opts,hour:'2-digit',minute:'2-digit'}).format(d);
 return {date:includeDate?date:'',time,short:date+' · '+time};
}
export function scheduledTime(value){
 const stamp=formatPublicSyncTime(value);
 return {time:stamp.time,date:stamp.date};
}
export function formatPublishedWeek(weekStart){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart||'')))return 'Semaine non renseignée';
 const monday=new Date(weekStart+'T12:00:00Z');
 if(!Number.isFinite(monday.getTime())||monday.getUTCDay()!==1)return 'Semaine non renseignée';
 const sunday=new Date(monday.getTime()+6*86400000);
 const date=d=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'short'}).format(d);
 return 'Du '+date(monday)+' au '+date(sunday);
}
export function mobileSyncState(snapshot,now=Date.now()){
 if(!snapshot?.loaded||snapshot.loading)return 'loading';
 if(snapshot.syncError)return 'unknown';
 return syncHealth(snapshot.sync,now);
}

function parisDayKey(value){
 const d=validDate(value);
 if(!d)return '';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const pick=type=>parts.find(part=>part.type===type)?.value||'';
 return pick('year')+'-'+pick('month')+'-'+pick('day');
}
function formatCheckMoment(value,now=Date.now()){
 const d=validDate(value);
 if(!d)return '—';
 const stamp=formatPublicSyncTime(d);
 return parisDayKey(d)===parisDayKey(now)?'Aujourd’hui, '+stamp.time:stamp.date+', '+stamp.time;
}
function publicPlanningStatus(snapshot,published,cloudStatus,cloudPending,cloudPublished,cloudRejected){
 if(!snapshot?.loaded||snapshot.loading)return {key:'loading',title:'Vérification en cours',message:'Nethor vérifie l’état de ton planning.'};
 if(snapshot.planningError||snapshot.syncError)return {key:'error',title:'État indisponible',message:'Ton planning reste consultable, mais son actualisation n’a pas pu être confirmée.'};
 if(!published)return {key:'warning',title:'Aucun planning publié',message:'Aucun planning publié n’est disponible pour le moment.'};
 if(cloudStatus==='failed')return {key:'warning',title:'Vérification retardée',message:'Le dernier contrôle automatique n’a pas abouti. Une nouvelle tentative sera effectuée.'};
 if(cloudStatus==='running')return {key:'loading',title:'Vérification en cours',message:'Nethor recherche actuellement une nouvelle version du planning.'};
 if(cloudPending>0)return {key:'warning',title:'Mise à jour en attente',message:'Une nouvelle version a été détectée et doit encore être publiée.'};
 if(cloudRejected>0)return {key:'warning',title:'Planning vérifié',message:'Le dernier contrôle est terminé, mais une version n’a pas été publiée.'};
 if(cloudStatus==='completed')return {
  key:'ok',
  title:'Planning à jour',
  message:cloudPublished>0?'Ton planning a été actualisé lors du dernier contrôle.':'Ton planning est disponible et aucune nouvelle modification n’a été détectée lors du dernier contrôle.'
 };
 return {key:'available',title:'Planning disponible',message:'Ton planning est disponible. La prochaine vérification automatique confirmera s’il existe une nouvelle version.'};
}
function technicalCloudLabel(status){
 return status==='completed'?'Base vérifiée':status==='running'?'Contrôle en cours':status==='failed'?'Contrôle en échec':'Pas encore contrôlé';
}
function technicalCloudResult(status,{pending=0,published=0,rejected=0,queued=0}={}){
 if(status==='none')return 'Aucun contrôle';
 if(status==='failed')return 'Contrôle en échec';
 if(pending>0)return pending+' version'+(pending>1?'s':'')+' en attente';
 if(published>0)return published+' version'+(published>1?'s':'')+' publiée'+(published>1?'s':'');
 if(rejected>0)return rejected+' version'+(rejected>1?'s':'')+' refusée'+(rejected>1?'s':'');
 return queued===0?'Aucune mise à jour':'Aucun changement';
}

export function renderMobileSyncSummary(snapshot={},now=Date.now()){
 const state=mobileSyncState(snapshot,now);
 const published=snapshot?.planning&&!snapshot.planningError?snapshot.planning:null;
 const publication=formatPublicSyncTime(published?.publishedAt);
 const publishedState=snapshot?.planningError?'indisponible':!snapshot?.loaded?'chargement':!published?'vide':'ok';
 const publicationDate=publishedState==='ok'?publication.date:publishedState==='indisponible'?'Indisponible':publishedState==='chargement'?'Chargement…':'Aucun planning publié';
 const publicationTime=publishedState==='ok'?'à '+publication.time:'';
 const weekLabel=published?formatPublishedWeek(published.weekStart):'En attente de publication';

 const sync=snapshot?.sync||{};
 const schedule=sync.controlIntervalHours===4;
 const slots=Array.isArray(sync.controlLocalHours)&&sync.controlLocalHours.length===6
  ?sync.controlLocalHours:['00:00','04:00','08:00','12:00','16:00','20:00'];
 const cloudStatus=sync.lastCloudCheckStatus||'none';
 const cloudScanned=sync.lastCloudScanned||0;
 const cloudQueued=sync.lastCloudQueued||0;
 const cloudPublished=sync.lastCloudPublished||0;
 const cloudRejected=sync.lastCloudRejected||0;
 const cloudPending=sync.lastCloudPending||0;
 const status=publicPlanningStatus(snapshot,published,cloudStatus,cloudPending,cloudPublished,cloudRejected);

 const lastVerification=formatCheckMoment(sync.lastCloudCheckAt,now);
 const nextVerification=schedule?formatCheckMoment(sync.nextControlAt,now):'—';
 const lastTransfer=formatPublicSyncTime(sync.lastTransferAt);
 const refreshed=formatPublicSyncTime(snapshot?.checkedAt);
 const cloudLabel=technicalCloudLabel(cloudStatus);
 const cloudResult=technicalCloudResult(cloudStatus,{pending:cloudPending,published:cloudPublished,rejected:cloudRejected,queued:cloudQueued});
 const transferLabel=lastTransfer.date==='—'?'Aucun transfert':lastTransfer.date+' à '+lastTransfer.time;
 const scheduleLabel=schedule?slots.join(' · ')+' · Paris':'Horaires indisponibles';
 const verifiedLabel=lastVerification==='—'?'Pas encore vérifié':lastVerification;
 const nextLabel=nextVerification==='—'?'À venir':nextVerification;

 return '<section class="n2ms" aria-label="Informations de synchronisation du planning" data-state="'+esc(state)+'" data-public-state="'+esc(status.key)+'">'+
  '<header class="n2ms-head"><div><span>INFORMATIONS PLANNING</span><h1>Synchronisation</h1></div>'+
   '<button type="button" data-action="nethor-sync-mobile-refresh" aria-label="Actualiser les informations" title="Actualiser les informations"'+(snapshot?.loading?' disabled':'')+'>'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.4-4.8L3 9m0-5v5h5"/><path d="M4 13a8 8 0 0 0 14.4 4.8L21 15m0 5v-5h-5"/></svg>'+
   '</button></header>'+
  '<div class="n2ms-status-card" data-status="'+esc(status.key)+'">'+
   '<div class="n2ms-status-title"><i aria-hidden="true"></i><strong>'+esc(status.title)+'</strong></div>'+
   '<p>'+esc(status.message)+'</p>'+
  '</div>'+
  '<section class="n2ms-publication" data-publication="'+esc(publishedState)+'">'+
   '<span>Dernière publication</span>'+
   '<strong>'+esc(publicationDate)+(publicationTime?'<small>'+esc(publicationTime)+'</small>':'')+'</strong>'+
   '<p>'+esc(weekLabel)+'</p>'+
  '</section>'+
  '<section class="n2ms-checks" aria-label="Vérification automatique">'+
   '<header><span>Vérification automatique</span><small>'+esc(schedule?'Toutes les 4 h':'Automatique')+'</small></header>'+
   '<div class="n2ms-check-grid">'+
    '<div><span>Dernière vérification</span><strong>'+esc(verifiedLabel)+'</strong></div>'+
    '<div><span>Prochaine vérification</span><strong>'+esc(nextLabel)+'</strong></div>'+
   '</div>'+
   '<p>Nethor vérifie automatiquement si de nouveaux plannings sont disponibles. Aucune action n’est nécessaire.</p>'+
  '</section>'+
  '<details class="n2ms-tech">'+
   '<summary><span>Informations techniques</span><i aria-hidden="true"></i></summary>'+
   '<div class="n2ms-tech-body">'+
    '<div class="n2ms-tech-grid">'+
     '<div><span>État du contrôle</span><strong>'+esc(snapshot?.syncError?'État indisponible':cloudLabel)+'</strong></div>'+
     '<div><span>Résultat</span><strong>'+esc(cloudResult)+'</strong></div>'+
     '<div><span>Fichiers vérifiés</span><strong>'+esc(cloudScanned)+' fichier'+(cloudScanned>1?'s':'')+'</strong></div>'+
     '<div><span>Versions analysées</span><strong>'+esc(cloudQueued)+' version'+(cloudQueued>1?'s':'')+'</strong></div>'+
     '<div><span>Dernier transfert NethorSync</span><strong>'+esc(transferLabel)+'</strong></div>'+
     '<div><span>Horaires de contrôle</span><strong>'+esc(scheduleLabel)+'</strong></div>'+
    '</div>'+
   '</div>'+
  '</details>'+
  '<div class="n2ms-updated">'+esc(snapshot?.loaded?(refreshed.time==='—'?'Informations actualisées':'Informations actualisées à '+refreshed.time):'Vérification en cours…')+'</div>'+
 '</section>';
}

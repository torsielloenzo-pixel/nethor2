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
export function renderMobileSyncSummary(snapshot={},now=Date.now()){
 const state=mobileSyncState(snapshot,now);
 const titles={online:'Opérationnel',offline:'Hors ligne','not-seen':'En attente','not-configured':'Non configuré',unknown:'État indisponible',loading:'Vérification…'};
 const published=snapshot?.planning&&!snapshot.planningError?snapshot.planning:null;
 const publication=formatPublicSyncTime(published?.publishedAt);
 const publishedState=snapshot?.planningError?'indisponible':!snapshot?.loaded?'chargement':!published?'vide':'ok';
 const dateLabel=publishedState==='ok'?publication.date:publishedState==='indisponible'?'Indisponible':publishedState==='chargement'?'Chargement…':'Aucun planning publié';
 const timeLabel=publishedState==='ok'?'à '+publication.time:'';
 const weekLabel=published?formatPublishedWeek(published.weekStart):'En attente de publication';
 const lastCheck=formatPublicSyncTime(snapshot?.sync?.lastCheckAt);
 const lastTransfer=formatPublicSyncTime(snapshot?.sync?.lastTransferAt);
 const checkText=lastCheck.date==='—'?'Aucune vérification':lastCheck.date;
 const transferText=lastTransfer.date==='—'?'Aucun transfert':lastTransfer.date;
 const refreshed=formatPublicSyncTime(snapshot?.checkedAt);
 const foot=snapshot?.planningError?'La date de publication n’a pas pu être vérifiée. Réessaie avec le bouton Actualiser.':
   'Les fichiers transférés par NethorSync doivent être publiés pour apparaître dans le planning.';
 return '<section class="n2ms" aria-label="Informations NethorSync" data-state="'+esc(state)+'">'+
  '<header class="n2ms-head"><div><span>INFORMATIONS PLANNING</span><h1>NethorSync</h1></div>'+
  '<button type="button" data-action="nethor-sync-mobile-refresh" aria-label="Actualiser les informations" title="Actualiser les informations"'+(snapshot?.loading?' disabled':'')+'>'+
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.4-4.8L3 9m0-5v5h5"/><path d="M4 13a8 8 0 0 0 14.4 4.8L21 15m0 5v-5h-5"/></svg></button></header>'+
  '<div class="n2ms-primary" data-publication="'+publishedState+'"><div class="n2ms-primary-label"><span class="n2ms-primary-dot" aria-hidden="true"></span>DERNIÈRE PUBLICATION DU PLANNING</div>'+
  '<div class="n2ms-primary-time"><strong>'+esc(dateLabel)+'</strong>'+(timeLabel?'<span>'+esc(timeLabel)+'</span>':'')+'</div>'+
  '<p>'+esc(weekLabel)+'</p></div>'+
  '<div class="n2ms-subtitle"><span>NethorSync · Activité du poste</span><span class="n2ms-state" data-state="'+esc(state)+'"><i aria-hidden="true"></i>'+esc(titles[state]||'État indisponible')+'</span></div>'+
  '<div class="n2ms-grid">'+
   '<div class="n2ms-tile"><span>Dernier contrôle</span><strong>'+esc(checkText)+'</strong><small>'+esc(lastCheck.date==='—'?'Pas encore effectué':'à '+lastCheck.time)+'</small></div>'+
   '<div class="n2ms-tile"><span>Dernier transfert</span><strong>'+esc(transferText)+'</strong><small>'+esc(lastTransfer.date==='—'?'Pas encore effectué':'à '+lastTransfer.time)+'</small></div>'+
  '</div>'+
  '<footer class="n2ms-foot"><p>'+esc(foot)+'</p><small>'+esc(snapshot?.loaded?'Informations vérifiées '+(refreshed.time==='—'?'': 'à '+refreshed.time):'Vérification en cours…')+'</small></footer>'+
  '</section>';
}

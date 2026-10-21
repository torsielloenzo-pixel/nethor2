import {canManageSync,syncHealth} from '../data/nethor-sync-control.js';

// Version Windows compatible 2.1.8 : les fichiers déjà transmis sont reconnus sans nouvel upload.
// Le téléchargement est direct depuis GitHub Releases ; installation manuelle sur Windows.
export const NETHOR_SYNC_INSTALLER_URL='https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync-Setup.exe';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
export const isSyncOverviewRole=(role,isDesktop=true)=>Boolean(isDesktop)&&canManageSync(role);

export function formatSyncTimestamp(timestamp,options={}){
 const epoch=Date.parse(String(timestamp||''));
 if(!Number.isFinite(epoch))return {date:'—',time:'—'};
 const instant=new Date(epoch);
 const zone=options.timeZone||'Europe/Paris';
 return {
  date:new Intl.DateTimeFormat('fr-FR',{timeZone:zone,day:'2-digit',month:'long',year:'numeric'}).format(instant),
  time:new Intl.DateTimeFormat('fr-FR',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(instant)
 };
}

export function syncOverviewStatus(snapshot,now=Date.now()){
 if(snapshot?.loading)return 'loading';
 if(snapshot?.error)return 'error';
 if(!snapshot?.loaded)return 'loading';
 return syncHealth(snapshot.status,now);
}

// La dernière erreur Windows est distincte de l'activité de synchronisation.
function renderRecentDiagnostic(snapshot){
 if(!Array.isArray(snapshot?.diagnostics)||snapshot.diagnostics.length===0)return '';
 const item=snapshot.diagnostics[0];
 const stages={storage_upload:'Transfert Supabase',file_scan:'Lecture fichier',file_history:'Historique Excel',sync_report:'Confirmation du contrôle',startup:'Connexion/démarrage'};
 const codes={file_access:'Accès au fichier',http_error:'Erreur HTTP',request_rejected:'Requête rejetée',timeout:'Délai dépassé',network:'Erreur réseau',authorization:'Autorisation refusée',unexpected:'Erreur technique',mixed:'Plusieurs erreurs'};
 const http=Number(item.httpStatus);
 const detail=(stages[item.stage]||'Opération Windows')+' · '+(codes[item.code]||'Erreur technique')+
   (Number.isInteger(http)&&http>=100&&http<=599?' · HTTP '+http:'');
 const at=formatSyncTimestamp(item.at);
 return '<div class="n2sync-auto" data-state="rejected"><strong>Dernier rapport d’erreur Windows · '+escapeHtml(at.date)+' à '+escapeHtml(at.time)+'</strong>'+
  '<p>'+escapeHtml(detail)+' · '+escapeHtml(item.failed||0)+' erreur(s) / '+escapeHtml(item.scanned||0)+' fichiers analysés</p>'+
  '<p>Rapport #'+escapeHtml(item.id||'—')+' · Détails dans Paramètres → NethorSync</p></div>';
}

// Ne jamais annoncer un planning publié sur la seule foi du transfert Excel.
function renderAutoPublication(snapshot){
 if(snapshot?.autoError)return '<section class="n2sync-auto"><strong>Publication automatique</strong><p>Suivi des publications temporairement indisponible.</p></section>';
 const entries=Array.isArray(snapshot?.autoPublications)?snapshot.autoPublications:[];
 const last=entries[0];
 if(!last)return '<section class="n2sync-auto"><strong>Publication automatique</strong><p>Active côté Supabase : les nouveaux transferts sont comparés aux semaines déjà publiées. Aucune nouvelle version traitée pour le moment.</p></section>';
 const labels={queued:'En attente de traitement',processing:'Analyse Excel en cours',published:'Planning publié pour toute l’équipe',unchanged:'Horaires déjà à jour',skipped:'Publication ignorée pour sécurité',rejected:'Fichier Excel refusé',failed:'Échec de traitement'};
 const state=String(last.status||'');
 const when=formatSyncTimestamp(last.when);
 return '<section class="n2sync-auto" data-state="'+escapeHtml(state)+'"><strong>Publication automatique · '+escapeHtml(labels[state]||'État inconnu')+'</strong>'+
   '<p>'+escapeHtml(last.fileName||'Planning Excel')+' · '+escapeHtml(when.date)+' à '+escapeHtml(when.time)+'</p>'+
   (last.weekStart?'<p>Semaine du '+escapeHtml(last.weekStart)+'</p>':'')+
   (last.detail?'<p>'+escapeHtml(last.detail)+'</p>':'')+'</section>';
}

export function renderSyncOverviewCard(snapshot,now=Date.now(),period=7){
 const current=syncOverviewStatus(snapshot,now);
 const status=snapshot?.status;
 const bound=Boolean(status?.installed)&&current!=='error'&&current!=='loading';
 const titles={online:'Opérationnel',offline:'Poste hors ligne','not-seen':'Poste lié · jamais connecté','not-configured':'Non installé / configuré',loading:'Vérification…',error:'État indisponible'};
 const details=bound
  ? (()=>{
     const check=formatSyncTimestamp(status?.lastCheckAt);
     const transfer=formatSyncTimestamp(status?.lastTransferAt);
     const seen=formatSyncTimestamp(status?.lastSeenAt);
     return '<div class="n2sync-details">'+
      '<div class="n2sync-detail"><span>Dernière synchronisation</span><strong>'+escapeHtml(check.date)+'</strong><small>À '+escapeHtml(check.time)+'</small></div>'+
      '<div class="n2sync-detail"><span>Poste d’installation</span><strong>'+escapeHtml(status?.deviceLabel||'Non renseigné')+'</strong><small>Enregistré dans Nethor</small></div>'+
      '<div class="n2sync-detail"><span>Dernier transfert de fichier</span><strong>'+escapeHtml(transfer.date)+'</strong><small>À '+escapeHtml(transfer.time)+'</small></div>'+
      '<div class="n2sync-detail"><span>Dernier contact</span><strong>'+escapeHtml(seen.date)+'</strong><small>À '+escapeHtml(seen.time)+'</small></div>'+
      '</div>';
    })()
  : '<div class="n2sync-empty">'+(current==='loading'?'Recherche de l’installation NethorSync…':
    current==='error'?'Impossible de vérifier le poste actuellement. Aucune nouvelle installation ne doit être lancée avant vérification.':
    'Aucun poste Windows n’est actuellement enregistré pour synchroniser les plannings.')+'</div>';
 const showInstall=current==='not-configured';
 const action=showInstall?
  '<button type="button" class="btn primary" data-action="nethor-sync-install">Installer NethorSync 2.1.8</button>':
  '<button type="button" class="btn" data-action="nethor-sync-refresh"'+(current==='loading'?' disabled':'')+'>Actualiser l’état</button>'+
  (bound?'<button type="button" class="btn" data-action="nethor-sync-install">Télécharger la correction 2.1.8</button>':'');
 const guide=showInstall?
  '<p class="n2sync-footnote">Sur le poste Windows : télécharger puis exécuter <strong>NethorSync-Setup.exe</strong>. Choisissez le dossier des plannings, puis connectez votre compte Nethor autorisé.</p>':
  bound?'<p class="n2sync-footnote">Correctif Windows 2.1.8 disponible : réutilise la liaison existante et reconnaît les fichiers déjà envoyés. Les plannings sont publiés côté Supabase. L’état du poste dépend de son dernier contact (moins de 30 minutes).</p>':'';
 return '<section class="card n2sync-card" id="nethorSyncHomeCard" aria-labelledby="n2sync-title">'+
   '<div class="card-head"><div><h2 class="card-title" id="n2sync-title">NethorSync</h2><p class="sub">Synchronisation des plannings · Windows</p></div>'+
   '<span class="n2sync-status" data-state="'+escapeHtml(current)+'"><i aria-hidden="true"></i>'+escapeHtml(titles[current]||'État inconnu')+'</span></div>'+
   '<div class="card-body">'+details+(status?.installed?renderSyncHistory(snapshot,now,period):'')+
     renderRecentDiagnostic(snapshot)+
     renderAutoPublication(snapshot)+
     '<div class="n2sync-actions">'+action+'</div>'+guide+
     '<p id="n2sync-install-help" class="n2sync-install-help" hidden role="status"></p>'+
   '</div></section>';
}


// Graphique historique : seules les données issues du serveur sont affichées.
// Le rapport NethorSync compte une exécution, et non le nombre exact de fichiers Excel.
export function prepareSyncChart(history,now=Date.now(),period=7){
 const days=period===30?30:7;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date(now)).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
 const midnight=Date.UTC(parts.year,parts.month-1,parts.day);
 const records=new Map((Array.isArray(history)?history:[]).map(d=>[String(d.date),d]));
 const safe=value=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
 const rows=Array.from({length:days},(_,i)=>{
  const date=new Date(midnight-(days-1-i)*86400000).toISOString().slice(0,10);
  const item=records.get(date)||{};
  return {date,success:safe(item.success),errors:safe(item.errors),transfers:safe(item.transfers)};
 });
 const batches=[];
 for(let start=0;start<rows.length;start+=(days===30?5:1)){
  const group=rows.slice(start,start+(days===30?5:1));
  const first=group[0].date,last=group[group.length-1].date;
  const labelDate=d=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
  batches.push({label:first===last?labelDate(first):labelDate(first)+' – '+labelDate(last),
   success:group.reduce((n,d)=>n+d.success,0),
   errors:group.reduce((n,d)=>n+d.errors,0),
   transfers:group.reduce((n,d)=>n+d.transfers,0)});
 }
 return {rows,batches,success:rows.reduce((n,d)=>n+d.success,0),
  errors:rows.reduce((n,d)=>n+d.errors,0),
  transfers:rows.reduce((n,d)=>n+d.transfers,0)};
}

function renderSyncHistory(snapshot,now,period){
 const loading=!snapshot?.historyLoaded&&!snapshot?.historyError;
 const series=prepareSyncChart(snapshot?.history,now,period);
 const title='<div class="n2sync-history-top"><div><h3>Historique des synchronisations</h3>'+
  '<p>Suivi réel des contrôles de NethorSync</p></div>'+
  '<div class="n2sync-period" role="group" aria-label="Période du graphique">'+
  [7,30].map(days=>'<button type="button" data-action="nethor-sync-chart-'+days+'"'+
   (period===days?' class="active" aria-pressed="true"':' aria-pressed="false"')+'>'+days+' jours</button>').join('')+'</div></div>';
 if(snapshot?.historyError)return '<section class="n2sync-history" aria-label="Historique NethorSync">'+title+
  '<p class="n2sync-history-placeholder" role="status">Historique indisponible. L’état du poste reste consultable ci-dessus.</p></section>';
 if(loading)return '<section class="n2sync-history" aria-label="Historique NethorSync">'+title+
  '<p class="n2sync-history-placeholder" role="status">Chargement de l’historique…</p></section>';
 const total=series.success+series.errors;
 const metrics='<div class="n2sync-metrics">'+[
  ['Vérifications réussies',series.success,'success'],
  ['Échecs',series.errors,'error'],
  ['Cycles avec transfert',series.transfers,'transfer']
 ].map(([label,value,kind])=>'<div class="n2sync-metric '+kind+'"><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'</div>';
 if(total===0)return '<section class="n2sync-history" aria-label="Historique NethorSync">'+title+metrics+
  '<p class="n2sync-history-placeholder">Aucune vérification enregistrée sur cette période. Le suivi démarre à compter de son activation.</p></section>';
 const max=Math.max(1,...series.batches.flatMap(d=>[d.success,d.errors,d.transfers]));
 const bars=series.batches.map(d=>{
  const aria=escapeHtml(d.label+': '+d.success+' réussies, '+d.errors+' échecs, '+d.transfers+' cycles avec transfert');
  const columns=[['success',d.success],['error',d.errors],['transfer',d.transfers]]
   .map(([kind,n])=>'<span class="n2sync-chart-bar '+kind+'" style="height:'+(n?Math.max(3,Math.round(n/max*100)):0)+'%"></span>').join('');
  return '<div class="n2sync-chart-group" role="img" aria-label="'+aria+'"><div class="n2sync-chart-bars">'+columns+'</div>'+
    '<small>'+escapeHtml(d.label)+'</small></div>';
 }).join('');
 const percent=Math.round(series.success/total*100);
 return '<section class="n2sync-history" aria-label="Historique NethorSync">'+title+metrics+
  '<div class="n2sync-chart-legend"><span><i class="success"></i>Réussies</span><span><i class="error"></i>Échecs</span><span><i class="transfer"></i>Avec transfert</span></div>'+
  '<div class="n2sync-chart" role="group" aria-label="Activité de NethorSync">'+bars+'</div>'+
  '<div class="n2sync-chart-foot"><span>Taux de réussite</span><strong>'+percent+' %</strong></div>'+
  '<div class="n2sync-chart-progress"><span style="width:'+percent+'%"></span></div>'+
  '<p class="n2sync-history-note">Un transfert correspond à un cycle ayant envoyé au moins un fichier, pas au nombre de fichiers envoyés.</p>'+
  '</section>';
}

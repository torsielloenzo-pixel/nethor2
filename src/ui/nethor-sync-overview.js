import {canManageSync,syncHealth} from '../data/nethor-sync-control.js';

// Installeur Windows 2.1.11 : correctif de démarrage intégré, sans ZIP séparé.
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
 if(!last)return '<section class="n2sync-auto"><strong>Publication automatique</strong><p>Active côté Supabase : les nouvelles semaines peuvent être créées et les semaines existantes comparées aux versions plus récentes. Aucun nouveau fichier traité pour le moment.</p></section>';
 const labels={queued:'En attente de traitement',processing:'Analyse Excel en cours',published:'Planning publié pour toute l’équipe',unchanged:'Horaires déjà à jour',skipped:'Publication ignorée pour sécurité',rejected:'Fichier Excel refusé',failed:'Échec de traitement'};
 const state=String(last.status||'');
 const when=formatSyncTimestamp(last.when);
 return '<section class="n2sync-auto" data-state="'+escapeHtml(state)+'"><strong>Publication automatique · '+escapeHtml(labels[state]||'État inconnu')+'</strong>'+
   '<p>'+escapeHtml(last.fileName||'Planning Excel')+' · '+escapeHtml(when.date)+' à '+escapeHtml(when.time)+'</p>'+
   (last.weekStart?'<p>Semaine du '+escapeHtml(last.weekStart)+'</p>':'')+
   (last.detail?'<p>'+escapeHtml(last.detail)+'</p>':'')+'</section>';
}

// Progression de l'import initial, sans exposer des chemins de fichiers privés.
export function renderSyncHistoricalImport(snapshot){
 const info=snapshot?.historicalImport;
 if(!info||info.mode!=='historical_and_future')return '';
 const count=n=>Math.max(0,Number.isFinite(Number(n))?Math.trunc(Number(n)):0);
 const added=count(info.imported),rejected=count(info.rejected),skipped=count(info.skipped),
   pending=count(info.pending),analyzed=count(info.analyzed);
 const byYear=Array.isArray(info.years)?info.years:[];
 const years=byYear.filter(x=>Number.isInteger(x.year)&&count(x.weeks)>0)
   .map(x=>x.year+' : '+count(x.weeks)+' sem.').join(' · ');
 return '<section class="n2sync-auto" data-module="historical-import">'+
   '<strong>Importation historique et futurs plannings</strong>'+
   '<p><strong>'+escapeHtml(added)+'</strong> semaines créées · '+
   '<strong>'+escapeHtml(pending)+'</strong> en cours ou en attente · '+
   '<strong>'+escapeHtml(rejected)+'</strong> fichiers à contrôler</p>'+
   '<p>'+escapeHtml(analyzed)+' fichiers pris en charge · '+
   escapeHtml(skipped)+' ignorés sans écraser les plannings existants</p>'+
   (years?'<p>Archives publiées par année · '+escapeHtml(years)+'</p>':'')+
   '<p>Un fichier Excel invalide reste archivé sans être publié. Les nouvelles semaines fiables sont créées automatiquement.</p>'+
   '</section>';
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
      '<div class="n2sync-detail"><span>Poste d’installation</span><strong>'+escapeHtml(status?.deviceLabel||'Non renseigné')+'</strong><small>Enregistré dans NETHOR</small></div>'+
      '<div class="n2sync-detail"><span>Dernier transfert de fichier</span><strong>'+escapeHtml(transfer.date)+'</strong><small>À '+escapeHtml(transfer.time)+'</small></div>'+
      '<div class="n2sync-detail"><span>Dernier contact</span><strong>'+escapeHtml(seen.date)+'</strong><small>À '+escapeHtml(seen.time)+'</small></div>'+
      '</div>';
    })()
  : '<div class="n2sync-empty">'+(current==='loading'?'Recherche de l’installation NethorSync…':
    current==='error'?'Impossible de vérifier le poste actuellement. Aucune nouvelle installation ne doit être lancée avant vérification.':
    'Aucun poste Windows n’est actuellement enregistré pour synchroniser les plannings.')+'</div>';
 const showInstall=current==='not-configured';
 const action=showInstall?
  '<button type="button" class="btn primary" data-action="nethor-sync-install">Installer NethorSync 2.1.11</button>':
  '<button type="button" class="btn" data-action="nethor-sync-refresh"'+(current==='loading'?' disabled':'')+'>Actualiser l’état</button>'+
  (bound?'<button type="button" class="btn" data-action="nethor-sync-install">Télécharger NethorSync 2.1.11</button>':'');
 const guide=showInstall?
  '<p class="n2sync-footnote">Sur le poste Windows : télécharger puis exécuter <strong>NethorSync-Setup.exe</strong>. Choisissez le dossier des plannings, puis connectez votre compte NETHOR autorisé.</p>':
  bound?'<p class="n2sync-footnote">NethorSync 2.1.11 intègre le correctif de démarrage et conserve la liaison du poste ainsi que les fichiers Excel déjà transmis. Les plannings sont publiés côté Supabase. L’état du poste dépend de son dernier contact (moins de 30 minutes).</p>':'';
 return '<section class="card n2sync-card" id="nethorSyncHomeCard" aria-labelledby="n2sync-title">'+
   '<div class="card-head"><div><h2 class="card-title" id="n2sync-title">NethorSync</h2><p class="sub">Synchronisation des plannings · Windows</p></div>'+
   '<span class="n2sync-status" data-state="'+escapeHtml(current)+'"><i aria-hidden="true"></i>'+escapeHtml(titles[current]||'État inconnu')+'</span></div>'+
   '<div class="card-body">'+details+(status?.installed?renderSyncHistory(snapshot,now,period):'')+
     renderRecentDiagnostic(snapshot)+
     renderSyncHistoricalImport(snapshot)+
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
 const title='<div class="n2sync-history-top"><div><h3>Fiabilité des contrôles</h3>'+
  '<p>Rapports réels du poste Windows · les vérifications sans transfert comptent aussi</p></div>'+
  '<div class="n2sync-period" role="group" aria-label="Période du graphique">'+
  [7,30].map(days=>'<button type="button" data-action="nethor-sync-chart-'+days+'"'+
   (period===days?' class="active" aria-pressed="true"':' aria-pressed="false"')+'>'+days+' jours</button>').join('')+'</div></div>';
 const wrapper=html=>'<section class="n2sync-history" aria-label="Historique NethorSync">'+title+html+'</section>';
 if(snapshot?.historyError)return wrapper('<p class="n2sync-history-placeholder" role="status">Historique indisponible. Impossible de calculer une fiabilité vérifiée actuellement.</p>');
 if(loading)return wrapper('<p class="n2sync-history-placeholder" role="status">Chargement des contrôles enregistrés…</p>');
 const total=series.success+series.errors;
 const withoutTransfer=Math.max(0,series.success-series.transfers);
 const metrics='<div class="n2sync-metrics">'+[
  ['Vérifications réussies',series.success,'success'],
  ['Échecs enregistrés',series.errors,'error'],
  ['Cycles avec transfert',series.transfers,'transfer'],
  ['Réussites sans transfert',withoutTransfer,'no-transfer']
 ].map(([label,value,kind])=>'<div class="n2sync-metric '+kind+'"><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'</div>';
 if(total===0)return wrapper(metrics+
  '<p class="n2sync-history-placeholder">Aucune vérification enregistrée sur cette période. Aucun taux n’est affiché sans résultat confirmé.</p>');
 const recentRows=series.rows.slice(-3);
 const recentSuccess=recentRows.reduce((n,row)=>n+row.success,0);
 const recentErrors=recentRows.reduce((n,row)=>n+row.errors,0);
 const recentTotal=recentSuccess+recentErrors;
 const recentPercent=recentTotal?Math.round(recentSuccess/recentTotal*100):null;
 const percent=Math.round(series.success/total*100);
 const trend=recentTotal===0?'empty':recentErrors===0?'ok':'attention';
 const recentText=recentTotal===0
  ? 'Aucun contrôle Windows enregistré sur ces trois jours.'
  : recentSuccess+' '+(recentSuccess===1?'contrôle réussi':'contrôles réussis')+' sur '+recentTotal+
    ' · '+recentErrors+' '+(recentErrors===1?'échec':'échecs')+' enregistré'+(recentErrors===1?'':'s')+'.';
 const reliability='<div class="n2sync-reliability">'+
  '<div class="n2sync-recent" data-state="'+trend+'">'+
   '<span class="n2sync-reliability-label">Tendance récente · 3 jours calendaires</span>'+
   '<strong class="n2sync-reliability-number">'+(recentPercent===null?'—':recentPercent+' %')+'</strong>'+
   '<p>'+escapeHtml(recentText)+'</p>'+
  '</div>'+
  '<div class="n2sync-period-summary">'+
   '<span class="n2sync-reliability-label">Taux de réussite · '+period+' jours</span>'+
   '<strong class="n2sync-reliability-number">'+percent+' %</strong>'+
   '<p>'+series.success+' contrôles réussis / '+total+' vérifications</p>'+
   '<div class="n2sync-chart-progress" role="img" aria-label="'+percent+' % de contrôles réussis sur '+period+' jours"><span style="width:'+percent+'%"></span></div>'+
   '<small>'+series.errors+' '+(series.errors===1?'échec':'échecs')+' conservé'+(series.errors===1?'':'s')+' dans ce calcul</small>'+
  '</div>'+
 '</div>';
 const lastResultLabels={
  transferred:'Fichier transmis au serveur (publication vérifiée séparément)',
  unchanged:'Aucun nouveau transfert nécessaire',
  no_files:'Aucun fichier éligible à transmettre',
  error:'Échec enregistré'
 };
 const lastResult=lastResultLabels[snapshot?.status?.lastResult];
 const lastCheck=snapshot?.status?.lastCheckAt?formatSyncTimestamp(snapshot.status.lastCheckAt):null;
 const lastReport=lastResult&&lastCheck
  ? '<p class="n2sync-last-report" data-state="'+(snapshot.status.lastResult==='error'?'error':'success')+'">'+
    'Dernier contrôle Windows · '+escapeHtml(lastCheck.date)+' à '+escapeHtml(lastCheck.time)+' : '+escapeHtml(lastResult)+'</p>'
  : '';
 const max=Math.max(1,...series.batches.flatMap(d=>[d.success,d.errors,d.transfers]));
 const bars=series.batches.map(d=>{
  const aria=escapeHtml(d.label+': '+d.success+' réussies, '+d.errors+' échecs, '+d.transfers+' cycles avec transfert');
  const columns=[['success',d.success],['error',d.errors],['transfer',d.transfers]]
   .map(([kind,n])=>'<span class="n2sync-chart-bar '+kind+'" style="height:'+(n?Math.max(3,Math.round(n/max*100)):0)+'%"></span>').join('');
  return '<div class="n2sync-chart-group" role="img" aria-label="'+aria+'"><div class="n2sync-chart-bars">'+columns+'</div>'+
    '<small>'+escapeHtml(d.label)+'</small></div>';
 }).join('');
 return wrapper(reliability+lastReport+metrics+
  '<div class="n2sync-chart-legend"><span><i class="success"></i>Réussites</span><span><i class="error"></i>Échecs</span><span><i class="transfer"></i>Avec transfert (inclus dans les réussites)</span></div>'+
  '<div class="n2sync-chart" role="group" aria-label="Activité de NethorSync">'+bars+'</div>'+
  '<p class="n2sync-history-note">Méthode : contrôles Windows confirmés par NethorSync. Un contrôle réussi sans fichier à importer compte comme une réussite. Les transferts font partie des réussites, et les échecs restent comptabilisés sur la période. Les contrôles automatiques de Supabase ne sont pas ajoutés à ce taux.</p>');
}

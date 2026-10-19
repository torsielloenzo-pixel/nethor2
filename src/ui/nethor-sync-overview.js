import {canManageSync,syncHealth} from '../data/nethor-sync-control.js';

// Archive officielle empaquetée dans GitHub Pages à partir des scripts Windows du dépôt.
// Le navigateur télécharge les fichiers ; l'installation exige un geste explicite sur le PC.
export const NETHOR_SYNC_INSTALLER_URL='https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync2-Setup.exe';

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

export function renderSyncOverviewCard(snapshot,now=Date.now()){
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
  '<button type="button" class="btn primary" data-action="nethor-sync-install">Installer NethorSync</button>':
  '<button type="button" class="btn" data-action="nethor-sync-refresh"'+(current==='loading'?' disabled':'')+'>Actualiser l’état</button>';
 const guide=showInstall?
  '<p class="n2sync-footnote">Sur le poste Windows : télécharger puis exécuter <strong>NethorSync2-Setup.exe</strong>. Choisissez le dossier des plannings, puis connectez votre compte Nethor autorisé.</p>':
  bound?'<p class="n2sync-footnote">Un poste peut être associé à la fois. L’état opérationnel dépend de son dernier contact avec Supabase (moins de 30 minutes).</p>':'';
 return '<section class="card n2sync-card" id="nethorSyncHomeCard" aria-labelledby="n2sync-title">'+
   '<div class="card-head"><div><h2 class="card-title" id="n2sync-title">NethorSync</h2><p class="sub">Synchronisation des plannings · Windows</p></div>'+
   '<span class="n2sync-status" data-state="'+escapeHtml(current)+'"><i aria-hidden="true"></i>'+escapeHtml(titles[current]||'État inconnu')+'</span></div>'+
   '<div class="card-body">'+details+
     '<div class="n2sync-actions">'+action+'</div>'+guide+
     '<p id="n2sync-install-help" class="n2sync-install-help" hidden role="status"></p>'+
   '</div></section>';
}

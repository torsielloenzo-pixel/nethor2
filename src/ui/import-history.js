// Historique commun: les importations manuelles restent téléchargeables,
// les remplacements NethorSync indiquent les dates de modification Windows.
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
export function formatHistoryDate(value,{fallback='Date de modification inconnue'}={}){
 const instant=Date.parse(String(value||''));
 if(!Number.isFinite(instant))return fallback;
 return new Intl.DateTimeFormat('fr-FR',{
  timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',
  hour:'2-digit',minute:'2-digit'
 }).format(new Date(instant));
}
const time=row=>Date.parse(row?.occurredAt||row?.imported_at||'')||0;
export function mergeImportHistory(manual=[],sync=[]){
 const list=[
 ...manual.map(item=>({...item,source:String(item.storage_path||'').startsWith('sync-inbox/')?'auto':'manual',occurredAt:item.imported_at})),
 ...sync.map(item=>({...item,source:'sync'}))
 ];
 return list.sort((a,b)=>time(b)-time(a)||String(b.id).localeCompare(String(a.id)));
}
function syncVersionMarkup(row){
 const filename=esc(row.fileName||'Fichier inconnu');
 const oldName=esc(row.previousFileName||row.fileName||'Fichier inconnu');
 const from=esc(formatHistoryDate(row.previousModifiedAt));
 const to=esc(formatHistoryDate(row.modifiedAt));
 if(row.kind==='replaced'){
  return '<div class="n2hist-version-flow"><div class="n2hist-version"><span>Version précédente</span><strong>'+oldName+'</strong><small>Dernière modification : '+from+'</small></div>'+
    '<div class="n2hist-arrow" aria-hidden="true">→</div>'+
    '<div class="n2hist-version latest"><span>Nouvelle version</span><strong>'+filename+'</strong><small>Dernière modification : '+to+'</small></div></div>';
 }
 return '<div class="n2hist-single"><strong>'+filename+'</strong><small>'+(row.kind==='moved'?'Fichier déplacé ou copié':'Fichier transféré')+
    ' · Dernière modification : '+to+'</small></div>';
}
export function renderImportHistory(entries=[]){
 if(!entries.length)return '<div class="live-empty"><strong>Aucun historique disponible</strong>Les imports manuels et transferts NethorSync apparaîtront ici.</div>';
 return entries.map(row=>{
  const occurred=esc(formatHistoryDate(row.occurredAt,{fallback:'Date du transfert inconnue'}));
  if(row.source==='sync'){
   const replaced=row.kind==='replaced';
   return '<article class="n2hist-entry sync" data-origin="sync"><div class="n2hist-top"><span class="n2hist-source sync">NethorSync</span>'+
     '<time>'+occurred+'</time></div>'+
     '<h3>'+(replaced?'Fichier remplacé':row.kind==='moved'?'Fichier déplacé / copié':'Fichier transféré')+'</h3>'+
     syncVersionMarkup(row)+
     '<p class="n2hist-note">Transféré par NethorSync · Publication automatique seulement si ce fichier modifié est récent, lisible et plus récent que le planning publié.</p></article>';
  }
  return '<article class="n2hist-entry '+(row.source==='auto'?'sync':'manual')+'" data-origin="'+esc(row.source)+'"><div class="n2hist-top"><span class="n2hist-source '+(row.source==='auto'?'sync':'manual')+'">'+(row.source==='auto'?'NethorSync · Publication':'Import manuel')+'</span>'+
   '<time>'+occurred+'</time></div>'+
   '<h3>'+esc(row.file_name||'Fichier inconnu')+'</h3>'+
   '<p class="n2hist-meta">Semaine du '+esc(row.week_start||'—')+' · '+esc(row.imported_by_name||'Utilisateur inconnu')+'</p>'+
   (row.storage_path?'<button class="btn" type="button" data-download="'+esc(row.storage_path)+'">Télécharger l’archive</button>':'')+
   '</article>';
 }).join('');
}

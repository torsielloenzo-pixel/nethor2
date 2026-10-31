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
     '<p class="n2hist-note">Transféré par NethorSync · Les nouvelles semaines datées et lisibles peuvent être publiées automatiquement ; une semaine déjà publiée reste protégée contre un ancien fichier.</p></article>';
  }
  return '<article class="n2hist-entry '+(row.source==='auto'?'sync':'manual')+'" data-origin="'+esc(row.source)+'"><div class="n2hist-top"><span class="n2hist-source '+(row.source==='auto'?'sync':'manual')+'">'+(row.source==='auto'?'NethorSync · Publication':'Import manuel')+'</span>'+
   '<time>'+occurred+'</time></div>'+
   '<h3>'+esc(row.file_name||'Fichier inconnu')+'</h3>'+
   '<p class="n2hist-meta">Semaine du '+esc(row.week_start||'—')+' · '+esc(row.imported_by_name||'Utilisateur inconnu')+'</p>'+
   (row.storage_path?'<button class="btn" type="button" data-download="'+esc(row.storage_path)+'">Télécharger l’archive</button>':'')+
   '</article>';
 }).join('');
}


// Index consultatif : recherche par fichier, semaine, utilisateur et version.
export function historyDisplayTime(row){
 const value=Date.parse(String(row?.occurredAt||row?.imported_at||''));
 return Number.isFinite(value)?value:0;
}
export function historyMonthKey(row){
 const stamp=historyDisplayTime(row);
 if(!stamp)return 'unknown';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'})
  .formatToParts(new Date(stamp));
 const get=type=>parts.find(part=>part.type===type)?.value||'';
 return get('year')+'-'+get('month');
}
export function filterHistory(entries=[],{query='',source='all',year='all',sort='newest'}={}){
 const search=String(query||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
 const matches=row=>{
  if(source!=='all'&&row.source!==source)return false;
  const month=historyMonthKey(row);
  if(year!=='all'&&!month.startsWith(String(year)+'-'))return false;
  if(!search)return true;
  const text=[row.file_name,row.fileName,row.previousFileName,row.imported_by_name,row.week_start,
    row.kind,row.source,row.storage_path,row.occurredAt,row.modifiedAt,row.previousModifiedAt,formatHistoryDate(row.occurredAt),row.week_start&&row.week_start.slice(8,10)+'/'+row.week_start.slice(5,7)+'/'+row.week_start.slice(0,4)]
    .map(v=>String(v??'')).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  return text.includes(search);
 };
 return (Array.isArray(entries)?entries:[]).filter(matches).sort((a,b)=>{
  const diff=historyDisplayTime(a)-historyDisplayTime(b);
  return (sort==='oldest'?diff:-diff)||String(a.id||'').localeCompare(String(b.id||''));
 });
}
const monthLabel=key=>{
 if(key==='unknown')return 'Date non renseignée';
 const [year,month]=key.split('-').map(Number);
 if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)return 'Date non renseignée';
 return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
};
export function renderHistoryBrowser(entries=[],preferences={}){
 const {query='',source='all',year='all',sort='newest',openMonths=[],expandedAll=false}=preferences;
 const all=Array.isArray(entries)?entries:[];
 const shown=filterHistory(all,{query,source,year,sort});
 const months=new Map();
 for(const row of shown){const key=historyMonthKey(row);if(!months.has(key))months.set(key,[]);months.get(key).push(row);}
 const years=[...new Set(all.map(historyMonthKey).filter(key=>key!=='unknown').map(key=>key.slice(0,4)))].sort((a,b)=>b.localeCompare(a));
 const option=(value,label,selected)=>'<option value="'+esc(value)+'"'+(selected===value?' selected':'')+'>'+esc(label)+'</option>';
 const controls='<div class="n2hist-browser-tools">'+
  '<label class="n2hist-search"><span>Rechercher un fichier, une semaine ou un nom</span><input type="search" id="historySearch" placeholder="Ex. 09/11, Semaine B, version, Enzo…" value="'+esc(query)+'" autocomplete="off"></label>'+
  '<label><span>Origine</span><select id="historySource">'+option('all','Toutes',source)+option('manual','Import manuel',source)+option('auto','Publication NethorSync',source)+option('sync','Transfert NethorSync',source)+'</select></label>'+
  '<label><span>Année</span><select id="historyYear">'+option('all','Toutes les années',year)+years.map(v=>option(v,v,year)).join('')+'</select></label>'+
  '<label><span>Classement</span><select id="historySort">'+option('newest','Plus récents',sort)+option('oldest','Plus anciens',sort)+'</select></label></div>';
 const searching=Boolean(String(query).trim()||source!=='all'||year!=='all');
 const blocks=[...months.entries()].map(([key,rows],i)=>{
  const expanded=expandedAll||openMonths.includes(key)||searching&&i===0||!searching&&i===0;
  return '<details class="n2hist-month" data-history-month="'+esc(key)+'"'+(expanded?' open':'')+'><summary><span class="n2hist-month-icon" aria-hidden="true">▦</span><strong>'+esc(monthLabel(key))+'</strong><small>'+rows.length+' opération'+(rows.length>1?'s':'')+'</small><span class="n2hist-disclosure" aria-hidden="true">⌄</span></summary>'+
    '<div class="n2hist-month-list">'+renderImportHistory(rows)+'</div></details>';
 }).join('');
 return controls+'<div class="n2hist-results"><span><strong>'+shown.length+'</strong> résultat'+(shown.length>1?'s':'')+' sur '+all.length+' opérations chargées</span><button type="button" class="n2hist-reset" data-action="history-filter-reset">Réinitialiser les filtres</button></div>'+
 (shown.length?'<div class="n2hist-months">'+blocks+'</div>':
 '<div class="n2hist-no-results"><strong>Aucune importation trouvée.</strong><p>Modifie les filtres ou réinitialise la recherche.</p></div>')+
 '<p class="n2hist-info">Recherche effectuée dans les opérations chargées. Les événements plus anciens peuvent nécessiter une consultation de l’historique complet côté serveur.</p>';
}

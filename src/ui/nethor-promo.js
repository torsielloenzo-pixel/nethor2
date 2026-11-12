/**
 * Tableau de bord Promotions : lecture seule des métadonnées collectées.
 * La collecte quotidienne est exécutée côté publication, jamais côté client.
 * Aucune offre ni disponibilité magasin n'est inventée.
 */
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[character]);

function officialUrl(url){
  try{
    const parsed=new URL(String(url));
    if(parsed.protocol!=='https:'||parsed.hostname!=='www.netto.fr')return null;
    if(!/^\/prospectus\/[a-z0-9-]+\/?$/i.test(parsed.pathname))return null;
    return parsed.origin+parsed.pathname;
  }catch{return null;}
}
function displayDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date??'')))return '—';
  const value=new Date(date+'T12:00:00Z');
  if(Number.isNaN(value.getTime()))return '—';
  return value.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
}
function displayCheck(date){
  if(!date)return 'Pas encore de collecte';
  const value=new Date(date);
  return Number.isNaN(value.getTime())?'Date inconnue':
    value.toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'});
}
function catalogCard(item,checkedOn){
  const url=officialUrl(item?.url);
  if(!url)return '';
  const future=String(item.start_date)>String(checkedOn);
  const category=item.category==='thematic'?'Thématique':future?'À venir':'En cours';
  return '<article class="n2promo-item">'+
    '<span class="n2promo-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span>'+
    '<div class="n2promo-item-main"><span class="n2promo-item-tag">'+esc(category)+'</span>'+
    '<h3>'+esc(item.title)+'</h3>'+
    '<p>Du '+esc(displayDate(item.start_date))+' au '+esc(displayDate(item.end_date))+'</p></div>'+
    '<a class="n2promo-official-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le prospectus officiel '+esc(item.title)+'">Voir le prospectus <span aria-hidden="true">↗</span></a>'+
    '</article>';
}
function catalogSection(title,description,items,checkedOn){
  return '<section class="n2promo-card n2promo-list" aria-label="'+esc(title)+'">'+
    '<div class="n2promo-card-head"><div><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div>'+
    '<span class="n2promo-count">'+items.length+'</span></div>'+
    (items.length?'<div class="n2promo-list-body">'+items.map(item=>catalogCard(item,checkedOn)).join('')+'</div>':
    '<div class="n2promo-empty"><strong>Aucun prospectus confirmé</strong><p>La recherche quotidienne continue. Aucun catalogue ne sera ajouté sans dates vérifiables.</p></div>')+
    '</section>';
}

export function renderNethorPromo({loading=false,error='',data=null}={}){
  const catalogs=Array.isArray(data?.catalogs)?data.catalogs.filter(item=>
    item&&officialUrl(item.url)&&/^\d{4}-\d{2}-\d{2}$/.test(item.start_date)&&
    /^\d{4}-\d{2}-\d{2}$/.test(item.end_date)
  ):[];
  const weekly=catalogs.filter(item=>item.category!=='thematic');
  const thematic=catalogs.filter(item=>item.category==='thematic');
  const day=data?.checked_on||'';
  const current=weekly.filter(item=>item.start_date<=day);
  const upcoming=weekly.filter(item=>item.start_date>day);
  const status=data?.status;
  const report=error?'Résultats indisponibles':loading?'Chargement des résultats…':
    status==='ok'?'Collecte terminée':status==='partial'?'Collecte partielle':
    status==='none_found'?'Aucun catalogue confirmé':
    status==='blocked'?'Collecte non autorisée':
    status==='unavailable'?'Source indisponible':'En attente de première collecte';
  const health=status==='ok'?'ok':status==='partial'?'warn':'neutral';
  const checked=displayCheck(data?.collected_at);
  return '<div class="n2promo">'+
    '<section class="n2promo-hero"><div class="n2promo-hero-copy">'+
      '<span class="n2promo-overline">SUIVI COMMERCIAL · NETTO</span>'+
      '<h2>Les prospectus, au même endroit.</h2>'+
      '<p>Retrouvez les catalogues officiels de cette semaine et de la suivante, ainsi que les opérations thématiques.</p>'+
      '<div class="n2promo-hero-meta"><span class="n2promo-status" data-health="'+health+'"><span class="n2promo-dot"></span>'+esc(report)+'</span>'+
      '<span>Vérification automatique quotidienne</span></div>'+
    '</div><button type="button" class="n2promo-refresh" data-action="promo-refresh"'+(loading?' disabled':'')+'><span aria-hidden="true">↻</span> Actualiser les résultats</button></section>'+
    '<div class="n2promo-metrics" aria-label="Statistiques des prospectus">'+
      '<div class="n2promo-metric"><small>Catalogues confirmés</small><strong>'+catalogs.length+'</strong><span>Sur la période suivie</span></div>'+
      '<div class="n2promo-metric"><small>Prospectus hebdomadaires</small><strong>'+weekly.length+'</strong><span>En cours et à venir</span></div>'+
      '<div class="n2promo-metric"><small>Catalogues thématiques</small><strong>'+thematic.length+'</strong><span>Opérations spéciales</span></div>'+
    '</div>'+
    (error?'<div class="n2promo-notice" role="alert">'+esc(error)+'</div>':'')+
    ((status==='blocked'||status==='unavailable'||status==='partial')?
    '<div class="n2promo-notice" role="status">La source Netto n’a pas pu être vérifiée entièrement. Les résultats sont limités aux documents confirmés. Consultez au besoin <a href="https://www.netto.fr/prospectus" target="_blank" rel="noopener noreferrer">la page officielle</a>.</div>':'')+
    '<div class="n2promo-layout"><div class="n2promo-main">'+
      catalogSection('Cette semaine','Prospectus hebdomadaires en cours de validité',current,day)+
      catalogSection('À venir','Promotions de la prochaine semaine',upcoming,day)+
      catalogSection('Opérations thématiques','Catalogues spéciaux sur la période',thematic,day)+
    '</div><aside class="n2promo-aside">'+
      '<section class="n2promo-card n2promo-aside-section"><div class="n2promo-card-head"><div><h2>État de la collecte</h2><p>Contrôle automatisé des publications</p></div></div>'+
      '<dl class="n2promo-details"><div><dt>Dernière exécution</dt><dd>'+esc(checked)+'</dd></div>'+
      '<div><dt>Période suivie</dt><dd>'+esc(displayDate(data?.window_start))+' – '+esc(displayDate(data?.window_end))+'</dd></div>'+
      '<div><dt>Source</dt><dd>Site officiel Netto</dd></div><div><dt>Fréquence</dt><dd>Quotidienne</dd></div></dl>'+
      '<p class="n2promo-footnote">Le bouton d’actualisation recharge les derniers résultats publiés. Il ne déclenche pas une nouvelle collecte à distance.</p></section>'+
      '<section class="n2promo-card n2promo-aside-section"><div class="n2promo-card-head"><div><h2>Préparation des rayons</h2><p>Prochaine étape du module</p></div></div>'+
      '<div class="n2promo-upcoming"><span>1</span><p>Extraction et vérification des produits, prix et remises</p></div>'+
      '<div class="n2promo-upcoming"><span>2</span><p>Répartition des promotions par rayon</p></div>'+
      '<div class="n2promo-upcoming"><span>3</span><p>Liste de contrôle et suggestions de mises en avant</p></div>'+
      '<p class="n2promo-footnote">Ces fonctions ne sont pas encore activées. La présence d’un catalogue ne confirme pas sa disponibilité dans le magasin.</p></section>'+
    '</aside></div></div>';
}

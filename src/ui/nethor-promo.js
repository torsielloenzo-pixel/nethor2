/**
 * Point d'entrée Nethor Promo : présentation de la configuration retenue.
 * Aucun collecteur ni traitement automatique n'est activé à ce stade.
 * Cette interface ne lit ni ne modifie les données de planning.
 */
export function renderNethorPromo(){
  return '<section class="card" aria-label="Nethor Promo — collecteur">'+
    '<div class="card-head"><div><h2 class="card-title">Collecteur de catalogues Netto</h2>'+
    '<p class="sub">Espace de préparation des opérations commerciales</p></div></div>'+
    '<div class="live-banner" role="status"><strong>Module en préparation.</strong> La recherche automatique des catalogues n’est pas encore activée. Aucun prospectus n’est analysé à ce stade.</div>'+
    '<h3>Configuration prévue</h3>'+
    '<ul>'+
      '<li><strong>Période :</strong> semaine en cours et semaine suivante</li>'+
      '<li><strong>Fréquence :</strong> vérification automatique quotidienne (non activée)</li>'+
      '<li><strong>Catalogues :</strong> hebdomadaires et thématiques</li>'+
      '<li><strong>Source :</strong> site officiel de Netto, sous réserve d’accès autorisé</li>'+
    '</ul>'+
    '</section>'+
    '<section class="card" aria-label="Préparation des rayons">'+
    '<div class="card-head"><div><h2 class="card-title">Préparation magasin</h2>'+
    '<p class="sub">Fonctionnalités à raccorder au collecteur</p></div></div>'+
    '<p>Après mise en service : identification des promotions, classement par rayon, vérification des offres et préparation des mises en avant.</p>'+
    '<p class="live-muted">Les stocks, les quantités disponibles et l’applicabilité locale devront être confirmés avant toute action en magasin.</p>'+
    '</section>';
}

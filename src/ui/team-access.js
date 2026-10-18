/**
 * Navigation de l'espace Équipe : réservé au rôle Administrateur Nethor.
 * Le rôle vient du profil authentifié, pas de l'interface ou des métadonnées utilisateur.
 * Ce contrôle pilote uniquement l'UI ; les droits sur les données restent sous RLS.
 */
export function canViewTeam(profile) {
  return profile?.role === 'admin';
}

export function canNavigate(page, profile) {
  return page !== 'team' || canViewTeam(profile);
}

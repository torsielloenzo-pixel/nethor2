/**
 * Autorisations de navigation UI : dérivées du rôle authentifié.
 * Elles ne remplacent jamais les politiques RLS Supabase.
 */
export function canViewTeam(profile) {
  return profile?.role === 'admin';
}

/** Le rôle Point de vente conserve NethorSync sur téléphone, mais n'accède
 * plus à la page Anomalies sur Desktop/PWA Desktop.
 * isSmallScreen reflète la largeur effective de l'interface (<= 760px).
 */
export function canNavigate(page, profile, isSmallScreen = false) {
  if(page === 'team') return canViewTeam(profile);
  if(page === 'anomalies' && profile?.role === 'role_point-de-vente' && !isSmallScreen) return false;
  return true;
}

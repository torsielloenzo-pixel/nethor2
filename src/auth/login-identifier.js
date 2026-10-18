/**
 * Compatibilité avec la connexion Nethor historique (auth/auth-login.js).
 * Ne recherche jamais de comptes par nom et ne révèle aucune adresse personnelle.
 * Les identifiants historiques sont des alias de boîte @stock-fl.local.
 */
export function resolveLoginEmail(value) {
  const raw=String(value??'').trim().toLowerCase();
  if(!raw)throw new Error('Saisis ton identifiant ou ton adresse e-mail.');
  if(raw.length>254)throw new Error('Identifiant invalide.');
  if(raw.includes('@'))return raw;
  const username=raw.replace(/[^a-z0-9._-]/g,'');
  if(!username)throw new Error('Identifiant invalide.');
  return username+'@stock-fl.local';
}

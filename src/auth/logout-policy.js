// Politique de déconnexion NETHOR.
// Netto.magasin porte la session technique NethorSync du poste maître :
// ses déconnexions dans l'interface doivent rester locales à l'appareil courant.
export const NETHOR_SYNC_ACCOUNT_ID='82de1cef-96c7-4935-ad7e-aa44d3b19778';

export function logoutScopeForUser(userId){
  return String(userId||'')===NETHOR_SYNC_ACCOUNT_ID?'local':'global';
}

export async function signOutNethorSession(client,userId){
  if(!client?.auth?.signOut)throw new TypeError('Client Supabase incomplet');
  return client.auth.signOut({scope:logoutScopeForUser(userId)});
}

// Interface RPC: l'etat serveur est la seule source de verite du poste actif.
// Aucun secret d'appareil n'est transmis au navigateur.
export const canManageSync = role => role==='admin'||role==='role_point-de-vente';
function rpcResult({data,error}) {
  if(error)throw Error(error.message||'Erreur de synchronisation');
  if(!data || typeof data!=='object')throw Error('Reponse de synchronisation invalide');
  return data;
}
export async function readSyncStatus(client) {
  return rpcResult(await client.rpc('nethor_sync_status'));
}
// Agrégats d'exécutions depuis le serveur (30 jours au maximum).
// Les données sont agrégées sans exposer les noms ou chemins des fichiers.
export async function readSyncHistory(client){
 const {data,error}=await client.rpc('nethor_sync_history',{p_days:30});
 if(error)throw Error(error.message||'Historique indisponible');
 if(!Array.isArray(data))throw Error('Format historique invalide');
 return data;
}

export async function requestManualSync(client) {
  return rpcResult(await client.rpc('nethor_sync_request_manual'));
}
export async function resetSyncDevice(client,generation) {
  if(!Number.isSafeInteger(generation)||generation<1)throw new Error('Generation invalide');
  return rpcResult(await client.rpc('nethor_sync_reset',{p_expected_generation:generation}));
}
export function syncHealth(status,now=Date.now()){
  if(!status?.installed)return 'not-configured';
  const seen=Date.parse(status.lastSeenAt||'');
  if(!Number.isFinite(seen))return 'not-seen';
  return now-seen<=30*60*1000 && now>=seen-60000 ? 'online':'offline';
}

export async function setSyncMode(client,mode){
 if(!['manual','automatic'].includes(mode))throw new Error('Mode invalide');
 return rpcResult(await client.rpc('nethor_sync_set_mode',{p_mode:mode}));
}

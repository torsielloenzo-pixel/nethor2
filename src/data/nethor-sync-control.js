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

// Historique détaillé réservé aux administrateurs (fonction SQL avec session active).
// Les informations de device, chemins et secrets ne sont pas renvoyées.
export async function readSyncFileChanges(client,{limit=200}={}){
 if(!Number.isInteger(limit)||limit<1||limit>500)throw new RangeError('Limite invalide');
 const {data,error}=await client.rpc('nethor_sync_file_history',{p_limit:limit});
 if(error)throw Error(error.message||'Historique NethorSync indisponible');
 if(!Array.isArray(data))throw Error('Format d’historique NethorSync invalide');
 return data;
}

// État des publications automatiques, visible uniquement aux rôles gérant NethorSync.
export async function readSyncAutoPublications(client,{limit=20}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new RangeError('Limite invalide');
 const {data,error}=await client.rpc('nethor_sync_auto_publications',{p_limit:limit});
 if(error)throw Error(error.message||'Publications automatiques indisponibles');
 if(!Array.isArray(data))throw Error('Format publications automatiques invalide');
 return data;
}

// Import historique initial et intégration des nouvelles semaines manquantes.
// Les statistiques sont agrégées : aucun nom de fichier n'est divulgué ici.
export async function readSyncHistoricalSummary(client){
 const {data,error}=await client.rpc('nethor_sync_historical_summary');
 if(error)throw Error(error.message||'Import historique indisponible');
 if(!data||typeof data!=='object'||!Number.isInteger(data.imported))
   throw Error('État de l’import historique invalide');
 return data;
}

// Rapports techniques expurgés (30 jours). Les jetons, chemins et noms de
// fichiers ne sont jamais transférés par cette RPC.
export async function readSyncDiagnostics(client,{limit=20}={}){
 if(!Number.isInteger(limit)||limit<1||limit>50)throw new RangeError('Limite invalide');
 const {data,error}=await client.rpc('nethor_sync_diagnostic_history',{p_limit:limit});
 if(error)throw Error(error.message||'Diagnostics NethorSync indisponibles');
 if(!Array.isArray(data))throw Error('Format des diagnostics invalide');
 return data;
}


export async function readSyncUpdateHistory(client,{limit=12}={}){
 if(!Number.isInteger(limit)||limit<1||limit>40)throw new RangeError('Limite invalide');
 const {data,error}=await client.rpc('nethor_sync_update_recent',{p_limit:limit});
 if(error)throw Error(error.message||'Historique des mises à jour indisponible');
 if(!Array.isArray(data))throw Error('Format de mise à jour invalide');
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

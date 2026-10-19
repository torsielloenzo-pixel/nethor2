// Synthèse NethorSync visible par les comptes autorisés à consulter le planning.
// La date de publication provient de planning_weeks (RLS).
// La fonction RPC exposée ne divulgue ni identité du poste, ni fichier, ni secret.
export async function readLatestPublishedPlanning(client){
 const {data,error}=await client.from('planning_weeks')
   .select('week_start,updated_at')
   .order('updated_at',{ascending:false})
   .limit(1)
   .maybeSingle();
 if(error)throw Error('Dernière publication indisponible.');
 if(!data)return null;
 return {weekStart:String(data.week_start||''),publishedAt:String(data.updated_at||'')};
}
export async function readStaffSyncStatus(client){
 const {data,error}=await client.rpc('nethor_sync_public_status');
 if(error)throw Error('État NethorSync indisponible.');
 if(!data||typeof data!=='object'||typeof data.installed!=='boolean')
   throw Error('Réponse NethorSync invalide.');
 return {installed:data.installed===true,lastSeenAt:data.lastSeenAt||null,
   lastCheckAt:data.lastCheckAt||null,lastTransferAt:data.lastTransferAt||null};
}
export async function readMobileSyncSummary(client){
 const [planning,sync]=await Promise.allSettled([
   readLatestPublishedPlanning(client),readStaffSyncStatus(client)
 ]);
 return {
   loaded:true,loading:false,checkedAt:Date.now(),
   planning:planning.status==='fulfilled'?planning.value:null,
   planningError:planning.status==='rejected',
   sync:sync.status==='fulfilled'?sync.value:null,
   syncError:sync.status==='rejected'
 };
}

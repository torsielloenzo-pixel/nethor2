// Notifications internes de changement d'horaire.
// RLS sur planning_notifications garantit qu'un utilisateur ne lit/modifie que ses propres lignes.
export async function getPlanningNotificationAccess(client){
  const {data,error}=await client.rpc('nethor2_my_planning_change_notification_access');
  if(error)throw error;
  return data===true;
}
export async function listPlanningChangeNotifications(client,{limit=40}={}){
  const safeLimit=Math.min(100,Math.max(1,Number(limit)||40));
  const {data,error}=await client
    .from('planning_notifications')
    .select('id,kind,title,message,planning_date,week_start,read_at,created_at')
    .eq('kind','planning_shift_change')
    .order('created_at',{ascending:false})
    .limit(safeLimit);
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
export async function markPlanningChangeNotificationRead(client,id){
  const numeric=Number(id);
  if(!Number.isSafeInteger(numeric)||numeric<=0)throw new TypeError('Identifiant de notification invalide');
  const {error}=await client
    .from('planning_notifications')
    .update({read_at:new Date().toISOString()})
    .eq('id',numeric)
    .eq('kind','planning_shift_change')
    .is('read_at',null);
  if(error)throw error;
}
export async function markAllPlanningChangeNotificationsRead(client){
  const {error}=await client
    .from('planning_notifications')
    .update({read_at:new Date().toISOString()})
    .eq('kind','planning_shift_change')
    .is('read_at',null);
  if(error)throw error;
}

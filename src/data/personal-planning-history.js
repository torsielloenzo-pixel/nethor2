// Historique personnel des versions de planning.
// La RLS Supabase limite chaque requête aux seules versions du compte connecté.
export async function listPersonalPlanningHistory(client,{limit=160,weekStart=null}={}){
  const safeLimit=Number(limit);
  if(!Number.isInteger(safeLimit)||safeLimit<1||safeLimit>400)throw new RangeError('Limite d’historique invalide');
  if(weekStart!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart)))throw new TypeError('Semaine invalide');
  let query=client
    .from('personal_planning_history')
    .select('id,week_start,revision_at,change_kind,schedule,source_file')
    .gte('week_start','2025-01-01')
    .order('revision_at',{ascending:false})
    .limit(safeLimit);
  if(weekStart!==null)query=query.eq('week_start',String(weekStart));
  const {data,error}=await query;
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

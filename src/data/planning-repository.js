// Nethor 2 - accès minimal aux semaines.
// Le client Supabase doit utiliser une session utilisateur et rester soumis à la RLS.
function checkWeekKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new TypeError('Date de semaine invalide');
  const date = new Date(value + 'T12:00:00Z');
  if (Number.isNaN(+date) || date.toISOString().slice(0,10) !== value || date.getUTCDay() !== 1)
    throw new TypeError('Le début de semaine doit être un lundi valide');
  return value;
}
export async function getPlanningWeek(client, weekStart) {
  checkWeekKey(weekStart);
  const {data,error} = await client.from('planning_weeks')
    .select('week_start,data,week_label,source_file,updated_at')
    .eq('week_start',weekStart).maybeSingle();
  if(error) throw error;
  return data ? {weekStart:data.week_start,model:data.data,revision:data.updated_at,
    label:data.week_label,sourceFile:data.source_file} : null;
}
export async function getImportHistory(client,{limit=100}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>500) throw new RangeError('Limite invalide');
  const {data,error}=await client.from('planning_import_history')
    .select('id,week_start,file_name,storage_path,imported_at,imported_by_name,file_size,mime_type')
    .order('imported_at',{ascending:false}).limit(limit);
  if(error) throw error;
  return data||[];
}
export async function publishPlanningWeek(client,{weekStart,expectedRevision=null,model}) {
  checkWeekKey(weekStart);
  if(!model || model.weekStart!==weekStart || !Array.isArray(model.employees) || !model.days)
    throw new TypeError('Planning incohérent avec la semaine publiée');
  if(expectedRevision!==null && typeof expectedRevision!=='string') throw new TypeError('Révision invalide');
  const params={p_week_start:weekStart,p_expected_revision:expectedRevision,
    p_data:model,p_employee_order:model.employees.map(x=>x.name),
    p_week_label:model.weekLabel||null,p_source_file:model.sourceFile||null,
    p_source_path:model.sourcePath||null,p_imported_at:model.importedAt||null};
  const {data,error}=await client.rpc('planning_save_week_if_revision',params);
  if(error) throw error;
  if(data?.status==='conflict') return {status:'conflict',revision:null};
  if(data?.status!=='ok'||!data.revision) throw new Error('Publication non confirmée');
  return {status:'accepted-pending-verification',revision:String(data.revision)};
}
export async function verifyPublishedWeek(client,weekStart,expectedRevision) {
  const current=await getPlanningWeek(client,weekStart);
  return !!current && current.revision===expectedRevision;
}

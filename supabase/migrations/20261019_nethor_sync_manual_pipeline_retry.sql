-- Si un rapport Windows réussi arrive pendant un verrou d'audit cloud,
-- relancer plus tard son chaînage sans réexécuter NethorSync sur l'ordinateur.
begin;
create or replace function private.nethor_sync_manual_cloud_retry()
returns integer language plpgsql security definer set search_path=''
as $fn$
declare f private.nethor_sync_manual_pipeline%rowtype;
  result jsonb;
  queued integer:=0;
begin
 for f in
   select * from private.nethor_sync_manual_pipeline
   where pc_completed_at is not null and cloud_check_id is null
     and pc_result in ('transferred','unchanged','no_files')
     and requested_at>=now()-interval '7 days'
   order by pc_completed_at asc limit 3 for update skip locked
 loop
   begin
     result=private.nethor_sync_cloud_audit(true);
     if (result->>'started')::boolean is true then
       update private.nethor_sync_manual_pipeline
       set cloud_check_id=(result->>'id')::bigint,cloud_error=null where id=f.id;
       queued:=queued+1;
     else
       update private.nethor_sync_manual_pipeline
       set cloud_error='Contrôle différé : '||coalesce(result->>'reason','indisponible')
       where id=f.id;
     end if;
   exception when others then
     update private.nethor_sync_manual_pipeline
     set cloud_error=left(SQLERRM,320) where id=f.id;
   end;
 end loop;
 return queued;
end
$fn$;
revoke all on function private.nethor_sync_manual_cloud_retry() from public,anon,authenticated;
select cron.schedule('nethor-sync-manual-cloud-handoff','*/5 * * * *',
  $schedule$select private.nethor_sync_manual_cloud_retry();$schedule$);
commit;
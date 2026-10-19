-- Autoriser des essais de décodage sur des classeurs existants SANS changer les plannings.
alter table private.nethor_sync_auto_jobs add column if not exists dry_run boolean not null default false;
create or replace function public.nethor_sync_auto_claim(p_job_id uuid,p_proof uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare j private.nethor_sync_auto_jobs%rowtype; c private.nethor_sync_file_changes%rowtype;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'NETHOR_AUTO_UNAUTHORIZED' using errcode='42501';
 end if;
 update private.nethor_sync_auto_jobs
 set status='processing',attempts=attempts+1,started_at=now()
 where id=p_job_id and proof=p_proof and attempts<4
   and ((status='queued' and next_attempt_at<=now())
       or (status='processing' and started_at<now()-interval '4 minutes'))
 returning * into j;
 if not found then return jsonb_build_object('claimed',false);end if;
 select * into c from private.nethor_sync_file_changes where id=j.change_id;
 return jsonb_build_object(
   'claimed',true,'id',j.id,'storagePath',c.storage_path,'sha256',c.sha256,
   'fileName',c.file_name,'modifiedAt',c.modified_at,
   'previousModifiedAt',c.previous_modified_at,'generation',c.generation,'dryRun',j.dry_run
 );
end
$fn$;

revoke all on function public.nethor_sync_auto_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nethor_sync_auto_claim(uuid,uuid) to service_role;

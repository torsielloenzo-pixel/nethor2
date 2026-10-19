-- Reprise des erreurs déjà signalées avant activation du suivi.
begin;
create or replace function public.nethor_sync_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare r public.nethor_sync_binding%rowtype;
f private.nethor_sync_manual_pipeline%rowtype;
c private.nethor_sync_cloud_checks%rowtype;
v_open integer:=0;
v_published integer:=0;
v_refused integer:=0;
v_stage text:='none';
begin
 if (select auth.uid()) is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 select * into f from private.nethor_sync_manual_pipeline
 where generation=r.generation order by manual_version desc limit 1;
 if f.id is not null then
   if f.pc_completed_at is null then
     v_stage=case
      when f.pc_result='error' or (r.last_result='error' and r.last_check_at is not null and r.pending_manual>r.acknowledged_manual) then 'pc_error'
      when r.last_seen_at>=f.requested_at
        and r.pending_manual>r.acknowledged_manual then 'pc_contact'
      else 'waiting_pc' end;
   elsif f.cloud_check_id is null then v_stage='cloud_pending';
   else
     select * into c from private.nethor_sync_cloud_checks where id=f.cloud_check_id;
     select count(*) filter(where status in ('queued','processing')),
       count(*) filter(where status='published'),
       count(*) filter(where status in ('failed','rejected'))
     into v_open,v_published,v_refused
     from private.nethor_sync_auto_jobs where cloud_check_id=f.cloud_check_id;
     v_stage=case
       when c.status='failed' then 'cloud_error'
       when v_open>0 then 'cloud_processing'
       when v_refused>0 then 'cloud_review'
       when c.status='completed' then 'done'
       else 'cloud_pending' end;
   end if;
 end if;
 return jsonb_build_object(
 'installed',r.device_id is not null,'deviceId',r.device_id,
 'deviceLabel',r.device_label,'generation',r.generation,
 'registeredAt',r.registered_at,'lastSeenAt',r.last_seen_at,
 'lastCheckAt',r.last_check_at,'lastTransferAt',r.last_transfer_at,
 'lastResult',r.last_result,'mode',r.mode,
 'pendingManual',r.pending_manual>r.acknowledged_manual,
 'registeredBy',(select p.display_name from public.profiles p where p.id=r.registered_by),
 'manualStage',v_stage,
 'manualRequestedAt',f.requested_at,
 'manualLegacy',coalesce(f.legacy_request,false),
 'manualPcCompletedAt',f.pc_completed_at,
 'manualPcResult',f.pc_result,
 'manualCloudCheckId',f.cloud_check_id,
 'manualCloudError',f.cloud_error,
 'manualCloudProcessed',v_published,
 'manualCloudRefused',v_refused,
 'manualCloudOpen',v_open
 );
end
$fn$;

revoke all on function public.nethor_sync_status() from public,anon;
grant execute on function public.nethor_sync_status() to authenticated;
commit;
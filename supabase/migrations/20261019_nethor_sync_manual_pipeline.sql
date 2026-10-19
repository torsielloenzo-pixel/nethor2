-- Pipeline explicit : demande manuelle -> transfert Windows -> confirmation -> audit Supabase.
-- Aucune action distante n'est déclenchée par les vérifications cloud de quatre heures.
begin;

create table if not exists private.nethor_sync_manual_pipeline (
 id bigint generated always as identity primary key,
 generation bigint not null,
 manual_version bigint not null,
 requested_at timestamptz not null default clock_timestamp(),
 legacy_request boolean not null default false,
 pc_completed_at timestamptz,
 pc_result text,
 cloud_check_id bigint references private.nethor_sync_cloud_checks(id),
 cloud_error text,
 unique(generation,manual_version)
);
alter table private.nethor_sync_manual_pipeline enable row level security;
revoke all on private.nethor_sync_manual_pipeline from public,anon,authenticated;
create index if not exists nethor_sync_manual_pipeline_recent_idx
  on private.nethor_sync_manual_pipeline(requested_at desc);

-- Récupération du suivi pour les demandes déjà en attente, sans les réémettre.
insert into private.nethor_sync_manual_pipeline
 (generation,manual_version,legacy_request)
select generation,pending_manual,true from public.nethor_sync_binding
where singleton_id=1 and device_id is not null and pending_manual>acknowledged_manual
on conflict(generation,manual_version) do nothing;

create or replace function public.nethor_sync_request_manual()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare r public.nethor_sync_binding%rowtype;
begin
 if (select auth.uid()) is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 update public.nethor_sync_binding
 set pending_manual=case when pending_manual>acknowledged_manual
      then pending_manual else pending_manual+1 end
 where singleton_id=1 and device_id is not null returning * into r;
 if not found then raise exception 'NETHOR_SYNC_NOT_INSTALLED'; end if;
 insert into private.nethor_sync_manual_pipeline(generation,manual_version)
 values(r.generation,r.pending_manual)
 on conflict(generation,manual_version) do nothing;
 return jsonb_build_object('requested',true,'pending',true,'generation',r.generation);
end
$fn$;
revoke all on function public.nethor_sync_request_manual() from public,anon;
grant execute on function public.nethor_sync_request_manual() to authenticated;

-- L'agent 2.1.2 envoie nethor_sync_report seulement lorsque l'upload et
-- son historique ont fini. L'accusé de réception est l'unique déclencheur
-- autorisé à lancer le contrôle cloud complémentaire.
create or replace function private.nethor_sync_manual_after_report()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_flow private.nethor_sync_manual_pipeline%rowtype;
v_check jsonb;
begin
 if new.singleton_id<>1 or new.device_id is null then return new; end if;
 if new.acknowledged_manual>old.acknowledged_manual
   and new.last_result in ('transferred','unchanged','no_files')
   and new.last_check_at is distinct from old.last_check_at then

   insert into private.nethor_sync_manual_pipeline
     (generation,manual_version,legacy_request,pc_completed_at,pc_result)
   values(new.generation,new.acknowledged_manual,true,new.last_check_at,new.last_result)
   on conflict(generation,manual_version)
   do update set pc_completed_at=excluded.pc_completed_at,
                 pc_result=excluded.pc_result,cloud_error=null
   returning * into v_flow;

   begin
     -- La fonction lit storage.objects depuis Supabase et lance ses
     -- vérifications réseau seulement après le commit de ce rapport.
     v_check=private.nethor_sync_cloud_audit(true);
     if (v_check->>'started')::boolean is true then
       update private.nethor_sync_manual_pipeline
       set cloud_check_id=(v_check->>'id')::bigint,cloud_error=null
       where id=v_flow.id;
     else
       update private.nethor_sync_manual_pipeline
       set cloud_error='Contrôle différé : '||coalesce(v_check->>'reason','indisponible')
       where id=v_flow.id;
     end if;
   exception when others then
     -- Ne pas faire échouer le rapport PC à cause d'un contrôle cloud :
     -- le prochain cron cloud reprendra la recherche des fichiers.
     update private.nethor_sync_manual_pipeline
       set cloud_error=left(SQLERRM,320) where id=v_flow.id;
   end;
 elsif new.last_result='error'
    and new.last_check_at is distinct from old.last_check_at
    and new.pending_manual>new.acknowledged_manual then
   update private.nethor_sync_manual_pipeline
   set pc_result='error'
   where generation=new.generation and manual_version=new.pending_manual
     and pc_completed_at is null;
 end if;
 return new;
end
$fn$;
drop trigger if exists nethor_sync_manual_report_audit on public.nethor_sync_binding;
create trigger nethor_sync_manual_report_audit
after update of acknowledged_manual,last_check_at on public.nethor_sync_binding
for each row execute function private.nethor_sync_manual_after_report();

-- Informations d'étape sans supposer qu'un simple heartbeat veut dire
-- que l'analyse Excel est terminée.
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
      when f.pc_result='error' then 'pc_error'
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

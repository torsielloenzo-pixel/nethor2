-- Uniquement Supabase: audit des fichiers Excel stockés à minuit puis
-- 04/08/12/16/20 heure de Paris. Aucun appel à l'ordinateur Windows.
begin;

-- Annuler le mauvais contrôle distant des quatre heures.
do $block$ begin
  if exists(select 1 from cron.job where jobname='nethor-sync-four-hour-control') then
    perform cron.unschedule('nethor-sync-four-hour-control');
  end if;
end $block$;
-- Fonction héritée désactivée pour éviter toute nouvelle demande distante.
create or replace function private.nethor_sync_control_tick(p_kind text default 'scheduled')
returns jsonb language plpgsql security definer set search_path=''
as $fn$
begin
  return jsonb_build_object('queued',false,'reason','retired_cloud_only');
end
$fn$;
revoke all on function private.nethor_sync_control_tick(text) from public,anon,authenticated;

create table if not exists private.nethor_sync_cloud_checks (
 id bigint generated always as identity primary key,
 kind text not null check(kind in ('scheduled','immediate')),
 local_slot timestamp without time zone,
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','failed')),
 objects_seen integer not null default 0,
 candidates integer not null default 0,
 jobs_queued integer not null default 0,
 detail text,
 unique(kind,local_slot)
);
alter table private.nethor_sync_cloud_checks enable row level security;
revoke all on private.nethor_sync_cloud_checks from public,anon,authenticated;
alter table private.nethor_sync_auto_jobs
  add column if not exists cloud_check_id bigint references private.nethor_sync_cloud_checks(id);

create or replace function private.nethor_sync_cloud_audit(p_immediate boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 v_local timestamp := clock_timestamp() at time zone 'Europe/Paris';
 v_slot timestamp;
 v_id bigint;
 v_item record;
 v_existing private.nethor_sync_auto_jobs%rowtype;
 v_job private.nethor_sync_auto_jobs%rowtype;
 v_seen integer := 0;
 v_candidates integer := 0;
 v_enqueued integer := 0;
 v_week_min date := date_trunc('week',clock_timestamp() at time zone 'Europe/Paris')::date;
begin
 -- L'horaire local est évalué dans Supabase ; DST France pris en charge.
 if not p_immediate then
   if extract(minute from v_local)::integer<>0 or
      mod(extract(hour from v_local)::integer,4)<>0 then
     return jsonb_build_object('started',false,'reason','outside_paris_four_hour_slot');
   end if;
   v_slot:=date_trunc('hour',v_local);
 end if;

 if not pg_try_advisory_xact_lock(20261019,4004) then
   return jsonb_build_object('started',false,'reason','cloud_audit_running');
 end if;

 if not p_immediate and exists (
   select 1 from private.nethor_sync_cloud_checks c
   where c.kind='scheduled' and c.local_slot=v_slot
 ) then
   return jsonb_build_object('started',false,'reason','slot_already_checked');
 end if;

 insert into private.nethor_sync_cloud_checks(kind,local_slot)
 values(case when p_immediate then 'immediate' else 'scheduled' end,v_slot)
 returning id into v_id;

 select count(*) into v_seen from storage.objects
 where bucket_id='planning-files' and name like 'sync-inbox/%';

 -- Uniquement le fichier le PLUS RÉCENT de chaque semaine déjà publiée.
 -- Jamais une archive ancienne ni une feuille inconnue qui pourrait
 -- effacer l'organisation actuellement visible dans Nethor2.
 for v_item in
   select distinct on (w.week_start)
      o.name,o.created_at,o.owner_id,
      substring(o.name from '^sync-inbox/([a-f0-9]{64})-') sha,
      substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)$') filename,
      b.generation,b.registered_by,w.week_start
   from storage.objects o
   join public.nethor_sync_binding b on b.singleton_id=1 and b.device_id is not null
   join public.profiles p on p.id=b.registered_by
      and p.account_enabled and p.role in ('admin','role_point-de-vente')
   join public.planning_weeks w
      on regexp_replace(upper(regexp_replace(w.source_file,'\.[^.]+$','','i')),'[^A-Z0-9]','','g')
       =regexp_replace(upper(regexp_replace(
          substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)$'),
           '\.[^.]+$','','i')),'[^A-Z0-9]','','g')
   where o.bucket_id='planning-files'
     and o.name ~ '^sync-inbox/[a-f0-9]{64}-[^/]+\.(xls|xlsx|xlsm)$'
     and o.owner_id=b.registered_by::text
     and o.created_at<=now()-interval '25 seconds'
     and w.week_start >= v_week_min
     and w.week_start <= v_week_min+70
     and w.source_path is distinct from o.name
     and (
       (coalesce(w.source_path,'') not like 'sync-inbox/%'
         and o.created_at>w.updated_at)
       or
       (coalesce(w.source_path,'') like 'sync-inbox/%'
         and (w.data->>'sourceUploadedAt') is not null
         and o.created_at>(w.data->>'sourceUploadedAt')::timestamptz)
     )
   order by w.week_start,o.created_at desc,o.name desc
   limit 30
 loop
   v_candidates:=v_candidates+1;
   select * into v_existing from private.nethor_sync_auto_jobs
     where storage_path=v_item.name for update;

   if found then
     if v_existing.dry_run and v_existing.status in
        ('unchanged','skipped','rejected','failed') then
       -- Ancienne lecture de diagnostic : lancer son premier VRAI traitement.
       update private.nethor_sync_auto_jobs
       set dry_run=false,status='queued',attempts=0,
           next_attempt_at=now(),started_at=null,completed_at=null,
           detail=null,cloud_check_id=v_id
       where id=v_existing.id returning * into v_job;
     else
       continue;
     end if;
   else
     insert into private.nethor_sync_auto_jobs
       (source_kind,storage_path,storage_name,storage_sha256,
        storage_uploaded_at,storage_generation,storage_owner,cloud_check_id)
     values ('storage',v_item.name,v_item.filename,lower(v_item.sha),
             v_item.created_at,v_item.generation,v_item.registered_by,v_id)
     on conflict(storage_path) do nothing returning * into v_job;
     if not found then continue;end if;
   end if;
   perform private.nethor_sync_auto_dispatch(v_job.id,v_job.proof);
   v_enqueued:=v_enqueued+1;
 end loop;

 update private.nethor_sync_cloud_checks
 set completed_at=clock_timestamp(),status='completed',
     objects_seen=v_seen,candidates=v_candidates,jobs_queued=v_enqueued,
     detail='Lecture Supabase terminée ; traitement des fichiers éligibles lancé.'
 where id=v_id;
 return jsonb_build_object('started',true,'id',v_id,
     'objectsSeen',v_seen,'candidates',v_candidates,'jobsQueued',v_enqueued,
     'source','supabase_only');
end
$fn$;
revoke all on function private.nethor_sync_cloud_audit(boolean) from public,anon,authenticated;

-- Cron UTC chaque heure pleine ; la fonction n'agit qu'aux 6 heures France.
select cron.schedule('nethor-sync-cloud-audit-four-hours','0 * * * *',
  $schedule$select private.nethor_sync_cloud_audit(false);$schedule$);

-- L'agent local conserve ses contrôles 19 h / 12 h.
-- Le scan des imports cloud reste exécuté chaque minute (cron existant).
-- Vue mobile: distinguer activité du MSI et contrôle autonome Supabase.
create or replace function public.nethor_sync_public_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
 caller_id uuid:=(select auth.uid());
 r public.nethor_sync_binding%rowtype;
 v_cloud private.nethor_sync_cloud_checks%rowtype;
 v_local timestamp := now() at time zone 'Europe/Paris';
 v_next timestamp;
 v_pending integer := 0;
 v_published integer := 0;
 v_rejected integer := 0;
 v_last_published timestamptz;
begin
 if caller_id is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p
       where p.id=caller_id and p.account_enabled
         and private.can_module(caller_id,'planning','view'))
 then raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501'; end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 select * into v_cloud from private.nethor_sync_cloud_checks
     order by started_at desc,id desc limit 1;
 v_next := date_trunc('day',v_local)
   + (4*(floor(extract(hour from v_local)/4)::integer+1))*interval '1 hour';
 if v_cloud.id is not null then
   select count(*) filter(where status in ('queued','processing')),
          count(*) filter(where status='published'),
          count(*) filter(where status in ('rejected','failed'))
   into v_pending,v_published,v_rejected
   from private.nethor_sync_auto_jobs where cloud_check_id=v_cloud.id;
 end if;
 select max(completed_at) into v_last_published
 from private.nethor_sync_auto_jobs where status='published' and not dry_run;
 return jsonb_build_object(
   'installed',r.device_id is not null,
   'lastSeenAt',r.last_seen_at,
   'lastCheckAt',r.last_check_at,
   'lastTransferAt',r.last_transfer_at,
   'lastResult',r.last_result,
   'controlIntervalHours',4,'controlTimezone','Europe/Paris',
   'controlLocalHours',jsonb_build_array('00:00','04:00','08:00','12:00','16:00','20:00'),
   'nextControlAt',v_next at time zone 'Europe/Paris',
   'lastCloudCheckAt',v_cloud.completed_at,
   'lastCloudCheckStatus',coalesce(v_cloud.status,'none'),
   'lastCloudScanned',coalesce(v_cloud.objects_seen,0),
   'lastCloudCandidates',coalesce(v_cloud.candidates,0),
   'lastCloudQueued',coalesce(v_cloud.jobs_queued,0),
   'lastCloudPending',coalesce(v_pending,0),
   'lastCloudPublished',coalesce(v_published,0),
   'lastCloudRejected',coalesce(v_rejected,0),
   'lastCloudPublishedAt',v_last_published
 );
end
$fn$;
revoke all on function public.nethor_sync_public_status() from public,anon;
grant execute on function public.nethor_sync_public_status() to authenticated;
commit;

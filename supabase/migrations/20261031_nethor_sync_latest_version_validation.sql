-- Validation technique NETHOR2 — garantir que le fichier le plus récent
-- soit réellement comparé à la semaine publiée.
-- Préparé le 2026-10-31. À tester avant déploiement production.

create or replace function private.nethor_sync_auto_queue_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_job private.nethor_sync_auto_jobs%rowtype;
begin
  -- Un remplacement est éligible si le mtime avance OU si le contenu change.
  -- Certains fichiers Excel conservent le même mtime après remplacement :
  -- le SHA-256 devient alors la preuve de changement.
  if new.change_kind <> 'replaced'
     or new.modified_at is null
     or (
       (new.previous_modified_at is null or new.modified_at <= new.previous_modified_at)
       and (
         new.previous_sha256 is null
         or new.sha256 is null
         or new.sha256 is not distinct from new.previous_sha256
       )
     )
     or new.modified_at < now() - interval '14 days'
     or new.modified_at > now() + interval '5 minutes'
  then
    return new;
  end if;

  insert into private.nethor_sync_auto_jobs(change_id)
  values(new.id)
  on conflict(change_id) do nothing
  returning * into v_job;

  if found then
    perform private.nethor_sync_auto_dispatch(v_job.id,v_job.proof);
  end if;
  return new;
end
$function$;

create or replace function private.nethor_sync_cloud_audit(p_immediate boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
 v_local timestamp := clock_timestamp() at time zone 'UTC';
 v_slot timestamp;
 v_id bigint;
 v_item record;
 v_existing private.nethor_sync_auto_jobs%rowtype;
 v_job private.nethor_sync_auto_jobs%rowtype;
 v_seen integer := 0;
 v_candidates integer := 0;
 v_enqueued integer := 0;
 v_new_missing integer := 0;
 v_week_min date := date_trunc('week',clock_timestamp() at time zone 'Europe/Paris')::date;
begin
 if not p_immediate then
   if extract(minute from v_local)::integer<>0 or
      mod(extract(hour from v_local)::integer,4)<>0 then
     return jsonb_build_object('started',false,'reason','outside_utc_four_hour_slot');
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

 -- Le fichier le plus récent de chaque semaine publiée doit être comparé,
 -- y compris si la version courante provient du flux "change" et n'a donc
 -- pas de sourceUploadedAt.
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
       (
         coalesce(w.source_path,'') like 'sync-inbox/%'
         and (
           ((w.data->>'sourceUploadedAt') is not null
             and o.created_at>(w.data->>'sourceUploadedAt')::timestamptz)
           or
           ((w.data->>'sourceUploadedAt') is null
             and o.created_at>w.updated_at)
         )
       )
     )
   order by w.week_start,o.created_at desc,o.name desc
   limit 30
 loop
   v_candidates:=v_candidates+1;
   select * into v_existing from private.nethor_sync_auto_jobs
     where storage_path=v_item.name for update;

   if found then
     if v_existing.missing_week_only
        and v_existing.status='skipped'
        and v_existing.detail='Semaine déjà publiée : import historique sans écrasement'
     then
       -- Le flux historique a vu le fichier avant le contrôle de fraîcheur.
       -- Le même job est requalifié : le parseur comparera alors réellement
       -- son modèle avec la semaine publiée.
       update private.nethor_sync_auto_jobs
       set missing_week_only=false,dry_run=false,status='queued',attempts=0,
           next_attempt_at=now(),started_at=null,completed_at=null,
           detail=null,cloud_check_id=v_id
       where id=v_existing.id
       returning * into v_job;
     elsif v_existing.dry_run and v_existing.status in
        ('unchanged','skipped','rejected','failed')
     then
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

 v_new_missing=private.nethor_sync_queue_missing_weeks(24,v_id);
 v_enqueued=v_enqueued+v_new_missing;
 v_candidates=v_candidates+v_new_missing;

 update private.nethor_sync_cloud_checks
 set completed_at=clock_timestamp(),status='completed',
     objects_seen=v_seen,candidates=v_candidates,jobs_queued=v_enqueued,
     detail='Lecture Supabase terminée ; traitement des fichiers éligibles lancé.'
 where id=v_id;

 return jsonb_build_object('started',true,'id',v_id,
     'objectsSeen',v_seen,'candidates',v_candidates,'jobsQueued',v_enqueued,
     'source','supabase_only');
end
$function$;

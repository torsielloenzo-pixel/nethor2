-- NETHOR 2 — borne chronologique des plannings
-- À partir de cette migration, aucun planning antérieur au 01/01/2025
-- ne peut être publié, importé ou remis en file par NethorSync.

create or replace function private.nethor_planning_filename_date(p_name text)
returns date
language plpgsql
immutable
set search_path to ''
as $function$
declare
  m text[];
  y integer;
begin
  if p_name is null then return null; end if;
  m:=regexp_match(p_name,'(^|[^0-9])([0-3]?[0-9])[._-]([01]?[0-9])[._-]([0-9]{2}|[0-9]{4})([^0-9]|$)');
  if m is null then return null; end if;
  y:=m[4]::integer;
  if length(m[4])=2 then y:=y+2000; end if;
  begin
    return make_date(y,m[3]::integer,m[2]::integer);
  exception when others then
    return null;
  end;
end
$function$;

-- Retirer les anciennes données du site. Les révisions et accusés de lecture
-- sont supprimés en cascade depuis planning_weeks.
delete from public.planning_import_history
 where week_start is not null and week_start < date '2025-01-01';

delete from public.planning_notifications
 where (week_start is not null and week_start < date '2025-01-01')
    or (planning_date is not null and planning_date < date '2025-01-01');

delete from public.planning_weeks
 where week_start < date '2025-01-01';

alter table public.planning_weeks
  drop constraint if exists planning_weeks_min_2025_check;
alter table public.planning_weeks
  add constraint planning_weeks_min_2025_check
  check (week_start >= date '2025-01-01');

alter table public.planning_import_history
  drop constraint if exists planning_import_history_min_2025_check;
alter table public.planning_import_history
  add constraint planning_import_history_min_2025_check
  check (week_start is null or week_start >= date '2025-01-01');

create or replace function private.planning_save_week_if_revision(
  p_week_start date,
  p_expected_revision timestamp with time zone,
  p_data jsonb,
  p_employee_order jsonb,
  p_week_label text,
  p_source_file text,
  p_source_path text,
  p_imported_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_saved_revision timestamptz;
  v_current_revision timestamptz;
begin
  if v_actor is null
     or not (select private.session_is_active())
     or not (select private.can_module(v_actor,'planning','manage')) then
    return pg_catalog.jsonb_build_object('status','forbidden');
  end if;
  if p_week_start is null
     or p_week_start < date '2025-01-01'
     or extract(isodow from p_week_start)::integer <> 1
     or p_data is null
     or coalesce(p_data->>'version','') not in ('3','4')
     or p_data->>'weekStart' is distinct from p_week_start::text
     or pg_catalog.jsonb_typeof(p_data->'employees') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_data->'days') is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_employee_order) is distinct from 'array' then
    return pg_catalog.jsonb_build_object('status','invalid');
  end if;

  if p_expected_revision is null then
    insert into public.planning_weeks(
      week_start,data,employee_order,week_label,source_file,source_path,
      imported,imported_at,updated_by
    )
    values (
      p_week_start,p_data,p_employee_order,p_week_label,p_source_file,p_source_path,
      true,coalesce(p_imported_at,pg_catalog.clock_timestamp()),v_actor
    )
    on conflict (week_start) do nothing
    returning updated_at into v_saved_revision;
  else
    update public.planning_weeks
       set data=p_data,
           employee_order=p_employee_order,
           week_label=p_week_label,
           source_file=p_source_file,
           source_path=p_source_path,
           imported=true,
           imported_at=coalesce(p_imported_at,imported_at,pg_catalog.clock_timestamp()),
           updated_by=v_actor
     where week_start=p_week_start
       and updated_at=p_expected_revision
    returning updated_at into v_saved_revision;
  end if;

  if v_saved_revision is null then
    select updated_at into v_current_revision
    from public.planning_weeks
    where week_start=p_week_start;
    return pg_catalog.jsonb_build_object(
      'status','conflict',
      'current_revision',v_current_revision
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status','ok',
    'revision',v_saved_revision
  );
end;
$function$;

create or replace function public.nethor_sync_record_file_changes(
  p_device_id uuid,
  p_secret text,
  p_generation bigint,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
 r public.nethor_sync_binding%rowtype;
 item jsonb;
 v_name text; v_path text; v_storage text; v_hash text; v_prior text;
 v_kind text; v_prev_name text; v_modified timestamptz; v_prev_modified timestamptz;
 inserted_count integer:=0;
 ignored_count integer:=0;
begin
 if (select auth.uid()) is null or not private.session_is_active() then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into r from public.nethor_sync_binding where singleton_id=1 for update;
 if r.device_id is distinct from p_device_id or r.generation<>p_generation
    or r.registered_by is distinct from (select auth.uid())
    or p_secret is null or r.secret_digest is null
    or r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex')
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501';
 end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'array'
    or jsonb_array_length(p_changes)>150 then
   raise exception 'NETHOR_SYNC_INVALID_CHANGES' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_changes) loop
   v_name=trim(coalesce(item->>'fileName',''));
   v_path=trim(coalesce(item->>'relativePath',''));
   v_storage=trim(coalesce(item->>'storageKey',''));
   v_hash=lower(trim(coalesce(item->>'sha256','')));
   v_prior=nullif(lower(trim(coalesce(item->>'previousSha256',''))),'');
   v_kind=item->>'kind';
   v_prev_name=nullif(trim(coalesce(item->>'previousFileName','')),'');
   if length(v_name) not between 1 and 180 or v_name ~ '[/\\]'
      or length(v_path) not between 1 and 500 or v_path like '%..%'
      or v_hash !~ '^[0-9a-f]{64}$'
      or (v_prior is not null and v_prior !~ '^[0-9a-f]{64}$')
      or v_kind not in ('added','replaced','moved')
      or length(v_storage)>350
      or left(v_storage,length('sync-inbox/'||v_hash||'-')) is distinct from 'sync-inbox/'||v_hash||'-'
      or not exists(select 1 from storage.objects o where o.bucket_id='planning-files' and o.name=v_storage)
   then
     raise exception 'NETHOR_SYNC_INVALID_FILE_CHANGE' using errcode='22023';
   end if;

   -- Un ancien client peut encore signaler des archives 2020-2024 :
   -- elles sont ignorées côté serveur, sans faire échouer tout le lot.
   if private.nethor_planning_filename_date(v_name) is null
      or private.nethor_planning_filename_date(v_name) < date '2025-01-01' then
     ignored_count:=ignored_count+1;
     continue;
   end if;

   v_modified=nullif(item->>'modifiedUtc','')::timestamptz;
   v_prev_modified=nullif(item->>'previousModifiedUtc','')::timestamptz;
   if v_kind='added' then
     v_prev_name=null;v_prior=null;v_prev_modified=null;
   end if;
   insert into private.nethor_sync_file_changes
     (generation,relative_path,file_name,previous_file_name,change_kind,previous_modified_at,modified_at,previous_sha256,sha256,storage_path)
   values
     (r.generation,v_path,v_name,v_prev_name,v_kind,v_prev_modified,v_modified,v_prior,v_hash,v_storage)
   on conflict (generation,relative_path,sha256) do nothing;
   if found then inserted_count=inserted_count+1;end if;
 end loop;
 return jsonb_build_object('accepted',true,'created',inserted_count,'ignoredBefore2025OrUndated',ignored_count);
end
$function$;

create or replace function private.nethor_sync_auto_queue_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_job private.nethor_sync_auto_jobs%rowtype;
begin
 if private.nethor_planning_filename_date(new.file_name) is null
    or private.nethor_planning_filename_date(new.file_name) < date '2025-01-01'
 then return new; end if;

 if new.change_kind <> 'replaced'
   or new.previous_modified_at is null
   or new.modified_at is null
   or new.modified_at <= new.previous_modified_at
   or new.modified_at < now() - interval '14 days'
   or new.modified_at > now() + interval '5 minutes'
 then return new; end if;
 insert into private.nethor_sync_auto_jobs(change_id)
 values(new.id) on conflict(change_id) do nothing returning * into v_job;
 if found then
   perform private.nethor_sync_auto_dispatch(v_job.id,v_job.proof);
 end if;
 return new;
end
$function$;

create or replace function private.nethor_sync_queue_missing_weeks(
  p_limit integer default 12,
  p_cloud_id bigint default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item record;
  v_job private.nethor_sync_auto_jobs%rowtype;
  v_count integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>40 then
    raise exception 'NETHOR_HISTORY_INVALID_LIMIT' using errcode='22023';
  end if;
  for v_item in
    select o.name,o.created_at,o.owner_id,
      substring(o.name from '^sync-inbox/([a-f0-9]{64})-') sha,
      substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)$') filename,
      b.generation,b.registered_by,j.id as existing_job
    from storage.objects o
    join public.nethor_sync_binding b on b.singleton_id=1 and b.device_id is not null
    join public.profiles p on p.id=b.registered_by
      and p.account_enabled and p.role in ('admin','role_point-de-vente')
    left join private.nethor_sync_auto_jobs j on j.storage_path=o.name
    where o.bucket_id='planning-files'
      and o.name ~ '^sync-inbox/[a-f0-9]{64}-[^/]+[.](xls|xlsx|xlsm)$'
      and o.owner_id=b.registered_by::text
      and o.created_at<=now()-interval '25 seconds'
      and substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)$') ~* '^PLANNING[ _-]'
      and private.nethor_planning_filename_date(
        substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)$')
      ) >= date '2025-01-01'
      and (j.id is null or (j.status='skipped'
        and j.detail='Aucune semaine de référence déjà publiée'))
    order by o.created_at desc,o.name desc
    limit p_limit
  loop
    if v_item.existing_job is null then
      insert into private.nethor_sync_auto_jobs
        (source_kind,storage_path,storage_name,storage_sha256,
         storage_uploaded_at,storage_generation,storage_owner,
         cloud_check_id,missing_week_only)
      values ('storage',v_item.name,v_item.filename,lower(v_item.sha),
              v_item.created_at,v_item.generation,v_item.registered_by,
              p_cloud_id,true)
      on conflict(storage_path) do nothing returning * into v_job;
    else
      update private.nethor_sync_auto_jobs
      set status='queued',attempts=0,next_attempt_at=now(),
          started_at=null,completed_at=null,detail=null,week_start=null,
          storage_generation=v_item.generation,storage_owner=v_item.registered_by,
          cloud_check_id=p_cloud_id,missing_week_only=true
      where id=v_item.existing_job and status='skipped'
        and detail='Aucune semaine de référence déjà publiée'
      returning * into v_job;
    end if;
    if found then
      v_count=v_count+1;
      perform private.nethor_sync_auto_dispatch(v_job.id,v_job.proof);
    end if;
  end loop;
  return v_count;
end
$function$;

create or replace function public.nethor_sync_historical_summary()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_total integer;
  v_published integer;
  v_rejected integer;
  v_skipped integer;
  v_pending integer;
  v_last timestamptz;
  v_years jsonb;
begin
  if auth.uid() is null or not private.session_is_active()
     or not exists(select 1 from public.profiles p where p.id=auth.uid()
       and p.account_enabled and p.role in ('admin','role_point-de-vente')) then
    raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select count(*),
    count(*) filter(where status='published'),
    count(*) filter(where status='rejected'),
    count(*) filter(where status='skipped'),
    count(*) filter(where status in ('queued','processing')),
    max(completed_at)
  into v_total,v_published,v_rejected,v_skipped,v_pending,v_last
  from private.nethor_sync_auto_jobs
  where missing_week_only
    and coalesce(week_start,private.nethor_planning_filename_date(storage_name)) >= date '2025-01-01';

  select coalesce(jsonb_agg(jsonb_build_object('year',x.y,'weeks',x.n)
      order by x.y desc),'[]'::jsonb)
  into v_years
  from (
    select extract(year from week_start)::integer y,count(*) n
    from public.planning_weeks
    where source_path like 'sync-inbox/%'
      and week_start >= date '2025-01-01'
    group by 1
  ) x;
  return jsonb_build_object(
    'imported',v_published,'rejected',v_rejected,
    'skipped',v_skipped,'pending',v_pending,'analyzed',v_total,
    'lastProcessedAt',v_last,'years',v_years,
    'mode','from_2025_and_future');
end
$function$;

create or replace function public.nethor_sync_file_history(p_limit integer default 200)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
 if (select auth.uid()) is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role='admin') then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_limit is null or p_limit not between 1 and 500 then
   raise exception 'NETHOR_SYNC_INVALID_LIMIT' using errcode='22023';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'id',recent.id,'occurredAt',recent.occurred_at,'fileName',recent.file_name,
    'previousFileName',recent.previous_file_name,'kind',recent.change_kind,
    'previousModifiedAt',recent.previous_modified_at,'modifiedAt',recent.modified_at
  ) order by recent.occurred_at desc,recent.id desc)
  from (
    select *
    from private.nethor_sync_file_changes
    where private.nethor_planning_filename_date(file_name) >= date '2025-01-01'
    order by occurred_at desc,id desc
    limit p_limit
  ) recent
 ),'[]'::jsonb);
end
$function$;

create or replace function public.nethor_sync_auto_publications(p_limit integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
 if auth.uid() is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=auth.uid()
       and p.account_enabled and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_limit is null or p_limit<1 or p_limit>100 then
   raise exception 'NETHOR_SYNC_INVALID_LIMIT' using errcode='22023';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'fileName',coalesce(j.storage_name,c.file_name),'weekStart',j.week_start,'status',j.status,
    'when',coalesce(j.completed_at,j.created_at),'detail',j.detail
  ) order by j.created_at desc)
  from (
    select *
    from private.nethor_sync_auto_jobs
    where not dry_run
      and coalesce(week_start,private.nethor_planning_filename_date(storage_name)) >= date '2025-01-01'
    order by created_at desc
    limit p_limit
  ) j
  left join private.nethor_sync_file_changes c on c.id=j.change_id
 ),'[]'::jsonb);
end
$function$;

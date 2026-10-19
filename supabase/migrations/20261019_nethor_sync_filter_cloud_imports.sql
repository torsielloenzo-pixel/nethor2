-- Les imports cloud instantanés ne doivent pas consommer des centaines
-- d'archives 2021-2023 ni masquer les vrais plannings actuels.
-- Le contrôle complet Supabase toutes les 4h reste inchangé.
begin;
create or replace function private.nethor_sync_auto_scan_storage()
returns integer language plpgsql security definer set search_path=''
as $fn$
declare
  item record;
  j private.nethor_sync_auto_jobs%rowtype;
  count_queued integer:=0;
begin
  -- Le curseur d'activation est fixé au déploiement : pas de backfill.
  for item in
    select o.name, o.created_at, o.owner_id,
      substring(o.name from '^sync-inbox/([a-f0-9]{64})-') as sha,
      substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)$') as filename,
      b.generation, b.registered_by
    from storage.objects o
    join private.nethor_sync_auto_storage_settings settings on settings.singleton_id=1
    join public.nethor_sync_binding b on b.singleton_id=1 and b.device_id is not null
    join public.profiles p on p.id=b.registered_by and p.account_enabled
       and p.role in ('admin','role_point-de-vente')
    join public.planning_weeks w
      on regexp_replace(upper(regexp_replace(w.source_file,'\\.[^.]+
      and o.name ~* '^sync-inbox/[a-f0-9]{64}-[^/]+\.(xls|xlsx|xlsm)$'
      and o.created_at>settings.enabled_at
      and o.created_at<=now()-interval '25 seconds'
      and o.owner_id=b.registered_by::text
      and w.week_start >= date_trunc('week',now() at time zone 'Europe/Paris')::date-7
      and w.week_start <= date_trunc('week',now() at time zone 'Europe/Paris')::date+70
      and w.source_path is distinct from o.name
      and (
        (coalesce(w.source_path,'') not like 'sync-inbox/%'
           and o.created_at>w.updated_at)
        or (coalesce(w.source_path,'') like 'sync-inbox/%'
           and (w.data->>'sourceUploadedAt') is not null
           and o.created_at>(w.data->>'sourceUploadedAt')::timestamptz)
      )
      and not exists(select 1 from private.nethor_sync_auto_jobs old
        where old.storage_path=o.name)
      and not exists(select 1 from private.nethor_sync_file_changes changes
        where changes.storage_path=o.name)
    order by o.created_at asc
    limit 12
  loop
    insert into private.nethor_sync_auto_jobs
      (source_kind,storage_path,storage_name,storage_sha256,
       storage_uploaded_at,storage_generation,storage_owner)
    values
      ('storage',item.name,item.filename,lower(item.sha),
       item.created_at,item.generation,item.registered_by)
    on conflict(storage_path) do nothing returning * into j;
    if found then
      count_queued=count_queued+1;
      perform private.nethor_sync_auto_dispatch(j.id,j.proof);
    end if;
  end loop;
  return count_queued;
end
$fn$;
,'','i')),'[^A-Z0-9]','','g')
       =regexp_replace(upper(regexp_replace(
          substring(o.name from '^sync-inbox/[a-f0-9]{64}-(.+)
      and o.name ~* '^sync-inbox/[a-f0-9]{64}-[^/]+\.(xls|xlsx|xlsm)$'
      and o.created_at>settings.enabled_at
      and o.created_at<=now()-interval '25 seconds'
      and o.owner_id=b.registered_by::text
      and not exists(select 1 from private.nethor_sync_auto_jobs old
        where old.storage_path=o.name)
      and not exists(select 1 from private.nethor_sync_file_changes changes
        where changes.storage_path=o.name)
    order by o.created_at asc
    limit 12
  loop
    insert into private.nethor_sync_auto_jobs
      (source_kind,storage_path,storage_name,storage_sha256,
       storage_uploaded_at,storage_generation,storage_owner)
    values
      ('storage',item.name,item.filename,lower(item.sha),
       item.created_at,item.generation,item.registered_by)
    on conflict(storage_path) do nothing returning * into j;
    if found then
      count_queued=count_queued+1;
      perform private.nethor_sync_auto_dispatch(j.id,j.proof);
    end if;
  end loop;
  return count_queued;
end
$fn$;
),
           '\\.[^.]+
      and o.name ~* '^sync-inbox/[a-f0-9]{64}-[^/]+\.(xls|xlsx|xlsm)$'
      and o.created_at>settings.enabled_at
      and o.created_at<=now()-interval '25 seconds'
      and o.owner_id=b.registered_by::text
      and not exists(select 1 from private.nethor_sync_auto_jobs old
        where old.storage_path=o.name)
      and not exists(select 1 from private.nethor_sync_file_changes changes
        where changes.storage_path=o.name)
    order by o.created_at asc
    limit 12
  loop
    insert into private.nethor_sync_auto_jobs
      (source_kind,storage_path,storage_name,storage_sha256,
       storage_uploaded_at,storage_generation,storage_owner)
    values
      ('storage',item.name,item.filename,lower(item.sha),
       item.created_at,item.generation,item.registered_by)
    on conflict(storage_path) do nothing returning * into j;
    if found then
      count_queued=count_queued+1;
      perform private.nethor_sync_auto_dispatch(j.id,j.proof);
    end if;
  end loop;
  return count_queued;
end
$fn$;
,'','i')),'[^A-Z0-9]','','g')
    where o.bucket_id='planning-files'
      and o.name ~* '^sync-inbox/[a-f0-9]{64}-[^/]+\.(xls|xlsx|xlsm)$'
      and o.created_at>settings.enabled_at
      and o.created_at<=now()-interval '25 seconds'
      and o.owner_id=b.registered_by::text
      and not exists(select 1 from private.nethor_sync_auto_jobs old
        where old.storage_path=o.name)
      and not exists(select 1 from private.nethor_sync_file_changes changes
        where changes.storage_path=o.name)
    order by o.created_at asc
    limit 12
  loop
    insert into private.nethor_sync_auto_jobs
      (source_kind,storage_path,storage_name,storage_sha256,
       storage_uploaded_at,storage_generation,storage_owner)
    values
      ('storage',item.name,item.filename,lower(item.sha),
       item.created_at,item.generation,item.registered_by)
    on conflict(storage_path) do nothing returning * into j;
    if found then
      count_queued=count_queued+1;
      perform private.nethor_sync_auto_dispatch(j.id,j.proof);
    end if;
  end loop;
  return count_queued;
end
$fn$;

revoke all on function private.nethor_sync_auto_scan_storage() from public,anon,authenticated;
commit;

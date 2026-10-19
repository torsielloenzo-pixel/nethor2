-- NethorSync 2.1.2 : traitement cloud des fichiers déjà déposés dans storage.
-- Le PC ne connaît aucun changement et aucun fichier préexistant n'est retraité.
begin;
create table if not exists private.nethor_sync_auto_storage_settings (
  singleton_id integer primary key default 1 check(singleton_id=1),
  enabled_at timestamptz not null default clock_timestamp()
);
alter table private.nethor_sync_auto_storage_settings enable row level security;
revoke all on private.nethor_sync_auto_storage_settings from public,anon,authenticated;
insert into private.nethor_sync_auto_storage_settings(singleton_id) values(1)
on conflict(singleton_id) do nothing;

alter table private.nethor_sync_auto_jobs alter column change_id drop not null;
alter table private.nethor_sync_auto_jobs
  add column if not exists source_kind text not null default 'change'
    check(source_kind in ('change','storage'));
alter table private.nethor_sync_auto_jobs
  add column if not exists storage_path text unique;
alter table private.nethor_sync_auto_jobs
  add column if not exists storage_name text;
alter table private.nethor_sync_auto_jobs
  add column if not exists storage_sha256 text;
alter table private.nethor_sync_auto_jobs
  add column if not exists storage_uploaded_at timestamptz;
alter table private.nethor_sync_auto_jobs
  add column if not exists storage_generation bigint;
alter table private.nethor_sync_auto_jobs
  add column if not exists storage_owner uuid;
alter table private.nethor_sync_auto_jobs
  add constraint nethor_sync_auto_job_origin_check
  check(
    (source_kind='change' and change_id is not null)
    or (source_kind='storage' and change_id is null
      and storage_path is not null and storage_name is not null
      and storage_sha256 ~ '^[a-f0-9]{64}$'
      and storage_uploaded_at is not null and storage_owner is not null
      and storage_generation is not null)
  );

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
    where o.bucket_id='planning-files'
      and o.name ~* '^sync-inbox/[a-f0-9]{64}-[^/]+\.(xls|xlsx|xlsm)$'
      and o.name=lower(left(o.name,75))||substr(o.name,76) -- SHA toujours en minuscules
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

select cron.schedule('nethor-sync-storage-ingest','* * * * *',
  'select private.nethor_sync_auto_scan_storage();');
commit;

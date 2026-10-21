-- NethorSync 2.1.7: canal de mise a jour controle depuis Supabase.
-- Le binaire Windows reste sur une release GitHub versionnee avec SHA-256 epingle.
create table if not exists private.nethor_sync_update_channel(
 channel text primary key check(channel='stable'),
 version text not null check(version ~ '^2[.]1[.][0-9]{1,2}$'),
 download_url text not null check(download_url like
  'https://github.com/torsielloenzo-pixel/nethor2/releases/download/%'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false,
 released_at timestamptz,
 notes text,
 updated_at timestamptz not null default now()
);
alter table private.nethor_sync_update_channel enable row level security;
revoke all on private.nethor_sync_update_channel from public,anon,authenticated;
insert into private.nethor_sync_update_channel
 (channel,version,download_url,sha256,enabled,notes)
values ('stable','2.1.7',
 'https://github.com/torsielloenzo-pixel/nethor2/releases/download/nethor-sync2-latest/NethorSync2-Setup-Compatibility-217.exe',
 repeat('0',64),false,'Premiere version avec mises a jour gerees depuis Supabase')
on conflict (channel) do nothing;

create or replace function public.nethor_sync_update_manifest()
returns jsonb language sql stable security definer set search_path=''
as $fn$
 select coalesce((
  select jsonb_build_object(
    'enabled',c.enabled,'version',c.version,
    'downloadUrl',case when c.enabled then c.download_url else null end,
    'sha256',case when c.enabled then c.sha256 else null end,
    'releasedAt',c.released_at,'channel',c.channel)
  from private.nethor_sync_update_channel c
  where c.channel='stable'
 ),'{"enabled":false}'::jsonb)
$fn$;
revoke all on function public.nethor_sync_update_manifest() from public;
grant execute on function public.nethor_sync_update_manifest() to anon,authenticated;

create table if not exists private.nethor_sync_update_events(
 id bigint generated always as identity primary key,
 reported_at timestamptz not null default clock_timestamp(),
 generation bigint not null,
 device_id uuid not null,
 installed_version text not null,
 target_version text,
 status text not null check(status in
 ('available','downloading','verified','installed','failed','rolled_back','up_to_date')),
 error_code text,
 constraint update_event_installed_version_chk check(installed_version ~ '^2[.]1[.][0-9]{1,2}$'),
 constraint update_event_target_version_chk check(target_version is null or target_version ~ '^2[.]1[.][0-9]{1,2}$'),
 constraint update_event_error_chk check(error_code is null or error_code ~ '^[a-z0-9_]{1,48}$')
);
create index if not exists nethor_sync_update_events_recent_idx
 on private.nethor_sync_update_events(reported_at desc);
alter table private.nethor_sync_update_events enable row level security;
revoke all on private.nethor_sync_update_events from public,anon,authenticated;

create or replace function public.nethor_sync_update_report(
 p_device_id uuid,p_secret text,p_generation bigint,
 p_installed_version text,p_target_version text,
 p_status text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare r public.nethor_sync_binding%rowtype;
begin
 if auth.uid() is null or not private.session_is_active() then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501'; end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 if r.device_id is distinct from p_device_id
    or r.generation is distinct from p_generation
    or r.registered_by is distinct from auth.uid()
    or p_secret is null or r.secret_digest is null
    or r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex')
    or not exists(select 1 from public.profiles p
       where p.id=auth.uid() and p.account_enabled
       and p.role in ('admin','role_point-de-vente'))
 then raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501'; end if;
 if p_installed_version is null or p_installed_version !~ '^2[.]1[.][0-9]{1,2}$'
    or (p_target_version is not null and p_target_version !~ '^2[.]1[.][0-9]{1,2}$')
    or p_status not in ('available','downloading','verified','installed','failed','rolled_back','up_to_date')
    or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,48}$')
 then raise exception 'NETHOR_SYNC_UPDATE_REPORT_INVALID' using errcode='22023'; end if;
 insert into private.nethor_sync_update_events
    (generation,device_id,installed_version,target_version,status,error_code)
 values(p_generation,p_device_id,p_installed_version,p_target_version,p_status,p_error_code);
 return jsonb_build_object('accepted',true);
end
$fn$;
revoke all on function public.nethor_sync_update_report(
 uuid,text,bigint,text,text,text,text) from public,anon;
grant execute on function public.nethor_sync_update_report(
 uuid,text,bigint,text,text,text,text) to authenticated;

-- Les roles ayant le droit de gerer les plannings peuvent lire l'etat d'update.
create or replace function public.nethor_sync_update_recent(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
begin
 if auth.uid() is null or not private.session_is_active() or
    not exists(select 1 from public.profiles p
      where p.id=auth.uid() and p.account_enabled and p.role in ('admin','role_point-de-vente'))
 then raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'at',x.reported_at,'installedVersion',x.installed_version,
   'targetVersion',x.target_version,'status',x.status,'errorCode',x.error_code,
   'generation',x.generation) order by x.reported_at desc)
 from (select * from private.nethor_sync_update_events
       order by reported_at desc limit least(greatest(coalesce(p_limit,20),1),40)) x),'[]'::jsonb);
end
$fn$;
revoke all on function public.nethor_sync_update_recent(integer) from public,anon;
grant execute on function public.nethor_sync_update_recent(integer) to authenticated;
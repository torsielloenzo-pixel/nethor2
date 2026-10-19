-- Nethor Sync 2 - binding serveur d'un seul poste par magasin (premiere installation)
-- Aucune publication directe de planning n'est faite par ces RPC.
create table if not exists public.nethor_sync_binding (
  singleton_id integer primary key default 1 check (singleton_id=1),
  generation bigint not null default 1,
  device_id uuid,
  device_label text,
  registered_by uuid references auth.users(id),
  registered_at timestamptz,
  secret_digest text,
  last_seen_at timestamptz,
  last_check_at timestamptz,
  last_transfer_at timestamptz,
  last_result text,
  mode text not null default 'automatic' check (mode in ('automatic','manual')),
  pending_manual bigint not null default 0,
  acknowledged_manual bigint not null default 0
);
insert into public.nethor_sync_binding(singleton_id) values(1) on conflict do nothing;
alter table public.nethor_sync_binding enable row level security;
revoke all on table public.nethor_sync_binding from anon, authenticated, public;
-- Table strictly private to PostgreSQL owner; clients use audited RPCs.

create or replace function public.nethor_sync_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
begin
  if (select auth.uid()) is null or not private.session_is_active()
     or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
    raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select * into r from public.nethor_sync_binding where singleton_id=1;
  return jsonb_build_object('installed',r.device_id is not null,'deviceId',r.device_id,
    'deviceLabel',r.device_label,'generation',r.generation,'registeredAt',r.registered_at,
    'lastSeenAt',r.last_seen_at,'lastCheckAt',r.last_check_at,'lastTransferAt',r.last_transfer_at,
    'lastResult',r.last_result,'mode',r.mode,'pendingManual',r.pending_manual > r.acknowledged_manual,
    'registeredBy', (select p.display_name from public.profiles p where p.id=r.registered_by));
end $$;

create or replace function public.nethor_sync_register(
  p_device_id uuid,p_secret text,p_device_label text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype; u uuid := (select auth.uid());
begin
  if u is null or not private.session_is_active() or
    not exists(select 1 from public.profiles p where p.id=u and p.account_enabled=true
      and p.role in ('admin','role_point-de-vente')) then
    raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if p_device_id is null or p_secret is null or p_device_label is null or p_secret !~ '^[a-fA-F0-9]{64}
    or length(btrim(p_device_label)) not between 2 and 80 then
    raise exception 'NETHOR_SYNC_INVALID_DEVICE';
  end if;
  select * into r from public.nethor_sync_binding where singleton_id=1 for update;
  if r.device_id is not null then
    if r.device_id<>p_device_id or r.registered_by<>u or
      r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex') then
      raise exception 'NETHOR_SYNC_ALREADY_BOUND';
    end if;
    return jsonb_build_object('generation',r.generation,'registered',true);
  end if;
  update public.nethor_sync_binding set device_id=p_device_id,
    device_label=btrim(p_device_label), registered_by=u, registered_at=now(),
    secret_digest=encode(extensions.digest(p_secret,'sha256'),'hex'),
    last_result='registered',last_seen_at=now(), last_check_at=null, last_transfer_at=null
    where singleton_id=1 returning * into r;
  return jsonb_build_object('generation',r.generation,'registered',true);
end $$;

create or replace function public.nethor_sync_heartbeat(
  p_device_id uuid,p_secret text,p_generation bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
begin
  if (select auth.uid()) is null or not private.session_is_active() then
    raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select * into r from public.nethor_sync_binding where singleton_id=1 for update;
  if r.device_id is distinct from p_device_id
    or r.generation<>p_generation or r.registered_by is distinct from (select auth.uid())
    or p_secret is null or r.secret_digest is null
    or r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex')
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
      and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
    raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501';
  end if;
  update public.nethor_sync_binding set last_seen_at=now()
    where singleton_id=1;
  return jsonb_build_object('active',true,'generation',r.generation,
    'pendingManual',r.pending_manual>r.acknowledged_manual,
    'manualRequestVersion',r.pending_manual,'mode',r.mode);
end $$;

create or replace function public.nethor_sync_report(
  p_device_id uuid,p_secret text,p_generation bigint,p_manual_version bigint,
  p_result text,p_transferred boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
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
    and p.account_enabled=true and p.role in ('admin','role_point-de-vente'))
  then raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501'; end if;
  if p_result not in ('unchanged','transferred','error','no_files') then
    raise exception 'NETHOR_SYNC_INVALID_RESULT';
  end if;
  update public.nethor_sync_binding set last_seen_at=now(),last_check_at=now(),
    last_result=p_result,
    last_transfer_at=case when p_transferred and p_result='transferred' then now()
       else last_transfer_at end,
    acknowledged_manual=greatest(acknowledged_manual,
        least(p_manual_version,pending_manual))
  where singleton_id=1;
  return jsonb_build_object('accepted',true);
end $$;

create or replace function public.nethor_sync_request_manual()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
begin
  if (select auth.uid()) is null or not private.session_is_active() or
    not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
    raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
  end if;
  update public.nethor_sync_binding set pending_manual=pending_manual+1
    where singleton_id=1 and device_id is not null returning * into r;
  if not found then raise exception 'NETHOR_SYNC_NOT_INSTALLED'; end if;
  return jsonb_build_object('requested',true,'generation',r.generation);
end $$;

create or replace function public.nethor_sync_reset(p_expected_generation bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
begin
  if (select auth.uid()) is null or not private.session_is_active() or
    not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role='admin') then
    raise exception 'NETHOR_SYNC_ADMIN_ONLY' using errcode='42501';
  end if;
  update public.nethor_sync_binding set generation=generation+1,
    device_id=null,device_label=null,registered_by=null,registered_at=null,
    secret_digest=null,last_seen_at=null,last_check_at=null,last_transfer_at=null,
    last_result='reset',mode='automatic',pending_manual=0,acknowledged_manual=0
  where singleton_id=1 and generation=p_expected_generation returning * into r;
  if not found then raise exception 'NETHOR_SYNC_STATE_CHANGED'; end if;
  return jsonb_build_object('reset',true,'generation',r.generation);
end $$;

create or replace function public.nethor_sync_set_mode(p_mode text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
begin
 if (select auth.uid()) is null or not private.session_is_active() or
  not exists(select 1 from public.profiles p where p.id=(select auth.uid())
    and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
  raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_mode not in ('manual','automatic') or p_mode is null then raise exception 'NETHOR_SYNC_MODE_INVALID'; end if;
 update public.nethor_sync_binding set mode=p_mode
 where singleton_id=1 and device_id is not null returning * into r;
 if not found then raise exception 'NETHOR_SYNC_NOT_INSTALLED'; end if;
 return jsonb_build_object('mode',r.mode);
end $$;

revoke execute on function public.nethor_sync_status() from public,anon;
revoke execute on function public.nethor_sync_register(uuid,text,text) from public,anon;
revoke execute on function public.nethor_sync_heartbeat(uuid,text,bigint) from public,anon;
revoke execute on function public.nethor_sync_report(uuid,text,bigint,bigint,text,boolean) from public,anon;
revoke execute on function public.nethor_sync_request_manual() from public,anon;
revoke execute on function public.nethor_sync_reset(bigint) from public,anon;
revoke execute on function public.nethor_sync_set_mode(text) from public,anon;
grant execute on function public.nethor_sync_status() to authenticated;
grant execute on function public.nethor_sync_register(uuid,text,text) to authenticated;
grant execute on function public.nethor_sync_heartbeat(uuid,text,bigint) to authenticated;
grant execute on function public.nethor_sync_report(uuid,text,bigint,bigint,text,boolean) to authenticated;
grant execute on function public.nethor_sync_request_manual() to authenticated;
grant execute on function public.nethor_sync_reset(bigint) to authenticated;
grant execute on function public.nethor_sync_set_mode(text) to authenticated;

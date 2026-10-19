-- Historique du graphique NethorSync (à partir de l'installation de cette migration).
-- Rapports d'exécution, sans nom de collaborateur, chemin ou contenu Excel.
create table if not exists private.nethor_sync_events (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(),
 generation bigint not null,
 result text not null check (result in ('unchanged','transferred','error','no_files')),
 transferred boolean not null default false
);
alter table private.nethor_sync_events enable row level security;
revoke all on private.nethor_sync_events from public, anon, authenticated;
create index if not exists nethor_sync_events_generation_time
 on private.nethor_sync_events(generation,occurred_at desc);

-- Conserve l'autorisation et le format de nethor_sync_report utilisés par l'agent Windows.
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
     and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501';
 end if;
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
 insert into private.nethor_sync_events(generation,result,transferred)
   values(r.generation,p_result,p_transferred and p_result='transferred');
 return jsonb_build_object('accepted',true);
end $$;

-- Ne révèle que les totaux par journée au gestionnaire autorisé.
create or replace function public.nethor_sync_history(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare current_generation bigint;
begin
 if (select auth.uid()) is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
      and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_days is null or p_days not between 1 and 30 then
   raise exception 'NETHOR_SYNC_INVALID_PERIOD' using errcode='22023';
 end if;
 select generation into current_generation
   from public.nethor_sync_binding where singleton_id=1;
 return coalesce((
   select jsonb_agg(jsonb_build_object('date',to_char(d.day,'YYYY-MM-DD'),
     'success',d.success,'errors',d.errors,'transfers',d.transfers) order by d.day)
   from (
     select (occurred_at at time zone 'Europe/Paris')::date as day,
       count(*) filter (where result<>'error')::integer as success,
       count(*) filter (where result='error')::integer as errors,
       count(*) filter (where transferred)::integer as transfers
     from private.nethor_sync_events
     where generation=current_generation
       and occurred_at >= (
         ((now() at time zone 'Europe/Paris')::date - (p_days-1))::timestamp
         at time zone 'Europe/Paris'
       )
     group by 1
   ) d
 ),'[]'::jsonb);
end $$;
revoke execute on function public.nethor_sync_history(integer) from public,anon;
grant execute on function public.nethor_sync_history(integer) to authenticated;

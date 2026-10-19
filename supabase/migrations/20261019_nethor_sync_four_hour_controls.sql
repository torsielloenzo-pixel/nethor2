-- Demandes de contrôle toutes les 4 heures, horaires locaux Paris :
-- 00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00.
-- L'agent Windows NethorSync 2.1.2 ne change pas : il récupère simplement
-- pending_manual à sa prochaine interrogation, s'il est connecté.
begin;

create table if not exists private.nethor_sync_control_requests (
 id bigserial primary key,
 kind text not null check (kind in ('scheduled','immediate')),
 requested_at timestamptz not null default clock_timestamp(),
 local_slot timestamp without time zone,
 generation bigint not null,
 manual_version bigint not null,
 reused_pending boolean not null default false,
 constraint nethor_sync_control_slot_kind_unique unique(kind,local_slot)
);
alter table private.nethor_sync_control_requests enable row level security;
revoke all on private.nethor_sync_control_requests from public,anon,authenticated;
create index if not exists nethor_sync_control_recent_idx
  on private.nethor_sync_control_requests(requested_at desc);

create or replace function private.nethor_sync_control_tick(p_kind text default 'scheduled')
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_local timestamp := clock_timestamp() at time zone 'Europe/Paris';
 v_slot timestamp;
 v_binding public.nethor_sync_binding%rowtype;
 v_pending boolean;
 v_request bigint;
begin
 if p_kind not in ('scheduled','immediate') then
   raise exception 'NETHOR_SYNC_CONTROL_BAD_KIND' using errcode='22023';
 end if;

 if p_kind='scheduled' then
   if extract(minute from v_local)::integer<>0
      or mod(extract(hour from v_local)::integer,4)<>0 then
     return jsonb_build_object('queued',false,'reason','outside_schedule');
   end if;
   v_slot=date_trunc('hour',v_local);
   if exists(select 1 from private.nethor_sync_control_requests
             where kind='scheduled' and local_slot=v_slot) then
     return jsonb_build_object('queued',false,'reason','already_requested');
   end if;
 end if;

 -- Acquérir le verrou sur le seul poste et conserver le fonctionnement
 -- existant : ne pas empiler inutilement les demandes si l'ordinateur est éteint.
 select * into v_binding from public.nethor_sync_binding
 where singleton_id=1 for update;
 if v_binding.device_id is null or v_binding.mode<>'automatic'
   or not exists(
     select 1 from public.profiles p
      where p.id=v_binding.registered_by and p.account_enabled=true
        and p.role in ('admin','role_point-de-vente')
   )
 then return jsonb_build_object('queued',false,'reason','device_unavailable');end if;

 v_pending:=v_binding.pending_manual>v_binding.acknowledged_manual;
 v_request:=case when v_pending then v_binding.pending_manual
                 else v_binding.pending_manual+1 end;

 update public.nethor_sync_binding
 set pending_manual=v_request
 where singleton_id=1;

 insert into private.nethor_sync_control_requests
    (kind,requested_at,local_slot,generation,manual_version,reused_pending)
 values
    (p_kind,clock_timestamp(),v_slot,v_binding.generation,v_request,v_pending);
 return jsonb_build_object('queued',true,'pending',true,'version',v_request,
                            'reusedPending',v_pending,'kind',p_kind);
end
$fn$;
revoke all on function private.nethor_sync_control_tick(text) from public,anon,authenticated;

select cron.schedule('nethor-sync-four-hour-control',
  '0 * * * *',
  $schedule$select private.nethor_sync_control_tick('scheduled');$schedule$);

-- Même contrôle de droits que l'ancienne vue publique NethorSync ;
-- aucun nom du PC, identité du détenteur, chemin Excel ni secret n'est exposé.
create or replace function public.nethor_sync_public_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
 caller_id uuid:=(select auth.uid());
 r public.nethor_sync_binding%rowtype;
 v_last private.nethor_sync_control_requests%rowtype;
 v_schedule private.nethor_sync_control_requests%rowtype;
 v_local_now timestamp:=(now() at time zone 'Europe/Paris');
 v_next_local timestamp;
 v_pending boolean;
 v_outcome text;
begin
 if caller_id is null
   or not private.session_is_active()
   or not exists(
     select 1 from public.profiles p
     where p.id=caller_id and p.account_enabled=true
       and private.can_module(caller_id,'planning','view')
   ) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 select * into v_last from private.nethor_sync_control_requests
   where generation=r.generation order by requested_at desc,id desc limit 1;
 select * into v_schedule from private.nethor_sync_control_requests
   where generation=r.generation and kind='scheduled'
   order by requested_at desc,id desc limit 1;

 v_next_local=date_trunc('day',v_local_now)
   + (4*(floor(extract(hour from v_local_now)/4)::integer+1))*interval '1 hour';
 v_pending:=r.pending_manual>r.acknowledged_manual;
 v_outcome:=case
    when v_last.id is null then 'none'
    when r.acknowledged_manual>=v_last.manual_version
       and r.last_check_at>=v_last.requested_at and r.last_result <> 'error'
      then 'completed'
    when r.last_check_at>=v_last.requested_at and r.last_result='error'
      then 'error'
    else 'pending' end;
 return jsonb_build_object(
   'installed',r.device_id is not null,
   'lastSeenAt',r.last_seen_at,
   'lastCheckAt',r.last_check_at,
   'lastTransferAt',r.last_transfer_at,
   'lastResult',r.last_result,
   'controlIntervalHours',4,
   'controlTimezone','Europe/Paris',
   'controlLocalHours',jsonb_build_array('00:00','04:00','08:00','12:00','16:00','20:00'),
   'nextControlAt',(v_next_local at time zone 'Europe/Paris'),
   'lastScheduledAt',v_schedule.requested_at,
   'lastRequestedAt',v_last.requested_at,
   'lastRequestedKind',v_last.kind,
   'lastRequestStatus',v_outcome,
   'controlPending',v_pending
 );
end
$fn$;
revoke all on function public.nethor_sync_public_status() from public,anon;
grant execute on function public.nethor_sync_public_status() to authenticated;

commit;

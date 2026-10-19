-- NethorSync 2 : un seul mode automatique (les contrôles ponctuels n'en changent pas la nature).
-- Les demandes déjà en attente restent en attente jusqu'à un contrôle réussi.
update public.nethor_sync_binding set mode='automatic' where singleton_id=1;
alter table public.nethor_sync_binding drop constraint if exists nethor_sync_binding_mode_check;
alter table public.nethor_sync_binding
 add constraint nethor_sync_binding_mode_check check (mode='automatic');

-- Au plus une synchronisation ponctuelle en attente. Evite les multiples clics.
create or replace function public.nethor_sync_request_manual()
returns jsonb language plpgsql security definer set search_path=''
as $$
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
  return jsonb_build_object('requested',true,'pending',true,'generation',r.generation);
end $$;

-- Compatibilité ancienne API : impossible de passer en mode manuel.
create or replace function public.nethor_sync_set_mode(p_mode text)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.uid()) is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
      and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_mode is distinct from 'automatic' then
   raise exception 'NETHOR_SYNC_AUTOMATIC_ONLY' using errcode='22023';
 end if;
 return jsonb_build_object('mode','automatic');
end $$;
revoke execute on function public.nethor_sync_request_manual() from public,anon;
revoke execute on function public.nethor_sync_set_mode(text) from public,anon;
grant execute on function public.nethor_sync_request_manual() to authenticated;
grant execute on function public.nethor_sync_set_mode(text) to authenticated;

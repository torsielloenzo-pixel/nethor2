-- Lecture publique limitée aux sessions Nethor actives pouvant voir le planning.
-- Aucun identifiant, nom de poste, fichier, chemin ou jeton n'est exposé.
begin;
create or replace function public.nethor_sync_public_status()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  caller_id uuid := (select auth.uid());
  r public.nethor_sync_binding%rowtype;
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
  return jsonb_build_object(
    'installed',r.device_id is not null,
    'lastSeenAt',r.last_seen_at,
    'lastCheckAt',r.last_check_at,
    'lastTransferAt',r.last_transfer_at
  );
end;
$function$;
revoke all on function public.nethor_sync_public_status() from public,anon;
grant execute on function public.nethor_sync_public_status() to authenticated;
commit;

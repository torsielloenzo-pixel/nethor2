-- Consultation rapide et non mutante des demandes ponctuelles par le seul appareil maître.
-- Le heartbeat normal continue séparément, moins fréquemment.
create or replace function public.nethor_sync_poll(
 p_device_id uuid,p_secret text,p_generation bigint)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare r public.nethor_sync_binding%rowtype;
begin
 if (select auth.uid()) is null or not private.session_is_active() then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 if r.device_id is distinct from p_device_id or r.generation<>p_generation
  or r.registered_by is distinct from (select auth.uid())
  or p_secret is null or r.secret_digest is null
  or r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex')
  or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
     and p.account_enabled=true and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501';
 end if;
 return jsonb_build_object('active',true,
  'pending',r.pending_manual>r.acknowledged_manual,
  'version',r.pending_manual,'generation',r.generation);
end $$;
revoke execute on function public.nethor_sync_poll(uuid,text,bigint) from public,anon;
grant execute on function public.nethor_sync_poll(uuid,text,bigint) to authenticated;

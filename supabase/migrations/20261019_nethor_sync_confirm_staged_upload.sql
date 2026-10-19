-- Windows peut recevoir HTTP 400 "Duplicate" pour un objet déjà stocké.
-- Vérification ciblée et sécurisée, sans permission de téléchargement générale.
begin;
create or replace function public.nethor_sync_staged_exists(
 p_device_id uuid,p_secret text,p_generation bigint,p_storage_key text
) returns boolean
language plpgsql stable security definer set search_path=''
as $fn$
declare
 r public.nethor_sync_binding%rowtype;
begin
 if (select auth.uid()) is null or not private.session_is_active() then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 if r.device_id is distinct from p_device_id
   or r.generation is distinct from p_generation
   or r.registered_by is distinct from (select auth.uid())
   or p_secret is null
   or r.secret_digest is null
   or r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex')
   or not exists (
     select 1 from public.profiles p
      where p.id=(select auth.uid())
        and p.account_enabled
        and p.role in ('admin','role_point-de-vente')
   ) then
   raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501';
 end if;
 if p_storage_key is null or
    length(p_storage_key)>170 or
    p_storage_key !~ '^sync-inbox/[a-f0-9]{64}-[A-Za-z0-9._-]{1,85}$'
 then return false; end if;
 return exists (
   select 1 from storage.objects o
   where o.bucket_id='planning-files'
     and o.name=p_storage_key
     and o.owner_id=r.registered_by::text
 );
end
$fn$;
revoke all on function public.nethor_sync_staged_exists(uuid,text,bigint,text) from public,anon;
grant execute on function public.nethor_sync_staged_exists(uuid,text,bigint,text) to authenticated;
commit;
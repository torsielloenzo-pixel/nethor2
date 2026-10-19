-- NethorSync file-level audit (read-only admin history).
-- Old metadata is recorded from the Windows file manifest, NOT from the upload time.
-- Prior staged files are seeded with unknown modification dates, never fabricated.
begin;
create table if not exists private.nethor_sync_file_changes (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(),
 generation bigint not null,
 relative_path text not null,
 file_name text not null,
 previous_file_name text,
 change_kind text not null check(change_kind in ('added','replaced','moved')),
 previous_modified_at timestamptz,
 modified_at timestamptz,
 previous_sha256 text,
 sha256 text not null,
 storage_path text not null,
 constraint nethor_sync_file_change_once unique(generation,relative_path,sha256)
);
alter table private.nethor_sync_file_changes enable row level security;
revoke all on table private.nethor_sync_file_changes from public,anon,authenticated;
create index if not exists nethor_sync_file_changes_recent
 on private.nethor_sync_file_changes(occurred_at desc,id desc);

create or replace function public.nethor_sync_record_file_changes(
 p_device_id uuid,p_secret text,p_generation bigint,p_changes jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $func$
declare
 r public.nethor_sync_binding%rowtype;
 item jsonb;
 v_name text; v_path text; v_storage text; v_hash text; v_prior text;
 v_kind text; v_prev_name text; v_modified timestamptz; v_prev_modified timestamptz;
 inserted_count integer:=0;
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
 if p_changes is null or jsonb_typeof(p_changes)<>'array'
    or jsonb_array_length(p_changes)>150 then
   raise exception 'NETHOR_SYNC_INVALID_CHANGES' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_changes) loop
   v_name=trim(coalesce(item->>'fileName',''));
   v_path=trim(coalesce(item->>'relativePath',''));
   v_storage=trim(coalesce(item->>'storageKey',''));
   v_hash=lower(trim(coalesce(item->>'sha256','')));
   v_prior=nullif(lower(trim(coalesce(item->>'previousSha256',''))),'');
   v_kind=item->>'kind';
   v_prev_name=nullif(trim(coalesce(item->>'previousFileName','')),'');
   if length(v_name) not between 1 and 180 or v_name ~ '[/\\]'
      or length(v_path) not between 1 and 500 or v_path like '%..%'
      or v_hash !~ '^[0-9a-f]{64}$'
      or (v_prior is not null and v_prior !~ '^[0-9a-f]{64}$')
      or v_kind not in ('added','replaced','moved')
      or length(v_storage)>350
      or left(v_storage,length('sync-inbox/'||v_hash||'-')) is distinct from 'sync-inbox/'||v_hash||'-'
      or not exists(select 1 from storage.objects o where o.bucket_id='planning-files' and o.name=v_storage)
   then
     raise exception 'NETHOR_SYNC_INVALID_FILE_CHANGE' using errcode='22023';
   end if;
   v_modified=nullif(item->>'modifiedUtc','')::timestamptz;
   v_prev_modified=nullif(item->>'previousModifiedUtc','')::timestamptz;
   if v_kind='added' then
     v_prev_name=null;v_prior=null;v_prev_modified=null;
   end if;
   insert into private.nethor_sync_file_changes
     (generation,relative_path,file_name,previous_file_name,change_kind,previous_modified_at,modified_at,previous_sha256,sha256,storage_path)
   values
     (r.generation,v_path,v_name,v_prev_name,v_kind,v_prev_modified,v_modified,v_prior,v_hash,v_storage)
   on conflict (generation,relative_path,sha256) do nothing;
   if found then inserted_count=inserted_count+1;end if;
 end loop;
 return jsonb_build_object('accepted',true,'created',inserted_count);
end
$func$;
revoke all on function public.nethor_sync_record_file_changes(uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.nethor_sync_record_file_changes(uuid,text,bigint,jsonb) to authenticated;

create or replace function public.nethor_sync_file_history(p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=''
as $func$
begin
 if (select auth.uid()) is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=(select auth.uid())
       and p.account_enabled=true and p.role='admin') then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_limit is null or p_limit not between 1 and 500 then
   raise exception 'NETHOR_SYNC_INVALID_LIMIT' using errcode='22023';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'id',recent.id,'occurredAt',recent.occurred_at,'fileName',recent.file_name,
    'previousFileName',recent.previous_file_name,'kind',recent.change_kind,
    'previousModifiedAt',recent.previous_modified_at,'modifiedAt',recent.modified_at
  ) order by recent.occurred_at desc,recent.id desc)
  from (select * from private.nethor_sync_file_changes order by occurred_at desc,id desc limit p_limit) recent
 ),'[]'::jsonb);
end
$func$;
revoke all on function public.nethor_sync_file_history(integer) from public,anon;
grant execute on function public.nethor_sync_file_history(integer) to authenticated;

-- Backfill existing storage objects (origin file modification timestamp unavailable).
insert into private.nethor_sync_file_changes
 (occurred_at,generation,relative_path,file_name,change_kind,modified_at,sha256,storage_path)
select o.created_at,b.generation,'legacy:'||o.name,
 regexp_replace(o.name,'^sync-inbox/[0-9a-f]{64}-',''),
 'added',null,substring(o.name from '^sync-inbox/([0-9a-f]{64})-'),o.name
from storage.objects o cross join public.nethor_sync_binding b
where b.singleton_id=1 and o.bucket_id='planning-files'
  and o.name ~ '^sync-inbox/[0-9a-f]{64}-.+'
on conflict(generation,relative_path,sha256) do nothing;
commit;

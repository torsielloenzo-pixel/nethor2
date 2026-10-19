-- Rapports de diagnostic techniques NethorSync sans chemins, noms de fichiers,
-- contenu Excel, IP, email, identifiants, jetons ni message d'exception brut.
begin;
create table if not exists private.nethor_sync_diagnostics (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 generation bigint not null,
 device_id uuid not null,
 stage text not null check(stage in ('file_scan','storage_upload','file_history','sync_report','startup')),
 error_code text not null check(error_code in ('file_access','http_error','request_rejected','timeout','network','authorization','unexpected','mixed')),
 http_status integer check(http_status is null or http_status between 100 and 599),
 scanned integer not null check(scanned between 0 and 100000),
 failed integer not null check(failed between 1 and 100000),
 transferred integer not null check(transferred between 0 and 100000),
 client_version text not null check(client_version ~ '^2[.]1[.][0-9]{1,2}$'),
 breakdown jsonb not null default '[]'::jsonb
);
alter table private.nethor_sync_diagnostics enable row level security;
revoke all on private.nethor_sync_diagnostics from public,anon,authenticated;
create index if not exists nethor_sync_diagnostics_recent_idx
 on private.nethor_sync_diagnostics (occurred_at desc,id desc);

create or replace function public.nethor_sync_submit_diagnostic(
 p_device_id uuid,p_secret text,p_generation bigint,
 p_stage text,p_error_code text,p_http_status integer,
 p_scanned integer,p_failed integer,p_transferred integer,
 p_client_version text,p_breakdown jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
 r public.nethor_sync_binding%rowtype;
 part jsonb;
 inserted_id bigint;
begin
 if auth.uid() is null or not private.session_is_active() then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into r from public.nethor_sync_binding where singleton_id=1;
 if r.device_id is distinct from p_device_id
   or r.generation is distinct from p_generation
   or r.registered_by is distinct from auth.uid()
   or p_secret is null or r.secret_digest is null
   or r.secret_digest<>encode(extensions.digest(p_secret,'sha256'),'hex')
   or not exists(select 1 from public.profiles p
      where p.id=auth.uid() and p.account_enabled=true
        and p.role in ('admin','role_point-de-vente'))
 then raise exception 'NETHOR_SYNC_DEVICE_REVOKED' using errcode='42501';
 end if;
 if p_stage not in ('file_scan','storage_upload','file_history','sync_report','startup')
   or p_error_code not in ('file_access','http_error','request_rejected','timeout','network','authorization','unexpected','mixed')
   or (p_http_status is not null and (p_http_status<100 or p_http_status>599))
   or p_scanned is null or p_scanned<0 or p_scanned>100000
   or p_failed is null or p_failed<1 or p_failed>100000
   or p_transferred is null or p_transferred<0 or p_transferred>100000
   or p_client_version is null or p_client_version !~ '^2[.]1[.][0-9]{1,2}$'
   or p_breakdown is null or jsonb_typeof(p_breakdown)<>'array'
   or jsonb_array_length(p_breakdown)>12
 then raise exception 'NETHOR_SYNC_INVALID_DIAGNOSTIC' using errcode='22023';end if;

 for part in select value from jsonb_array_elements(p_breakdown) loop
   if jsonb_typeof(part)<>'object'
     or (part->>'stage') not in ('file_scan','storage_upload','file_history','sync_report','startup')
     or (part->>'code') not in ('file_access','http_error','request_rejected','timeout','network','authorization','unexpected','mixed')
     or (part->>'count') !~ '^[0-9]{1,6}$'
     or (part->>'count')::integer<1 or (part->>'count')::integer>p_failed
     or (part ? 'httpStatus' and (part->>'httpStatus') !~ '^[0-9]{3}$')
     or exists (select 1 from jsonb_object_keys(part) k where k not in ('stage','code','count','httpStatus'))
   then raise exception 'NETHOR_SYNC_INVALID_DIAGNOSTIC_GROUP' using errcode='22023';end if;
 end loop;

 insert into private.nethor_sync_diagnostics(
  generation,device_id,stage,error_code,http_status,
  scanned,failed,transferred,client_version,breakdown)
 values(p_generation,p_device_id,p_stage,p_error_code,p_http_status,
        p_scanned,p_failed,p_transferred,p_client_version,p_breakdown)
 returning id into inserted_id;
 return jsonb_build_object('accepted',true,'reportId',inserted_id);
end
$fn$;
revoke all on function public.nethor_sync_submit_diagnostic(uuid,text,bigint,text,text,integer,integer,integer,integer,text,jsonb)
 from public,anon;
grant execute on function public.nethor_sync_submit_diagnostic(uuid,text,bigint,text,text,integer,integer,integer,integer,text,jsonb)
 to authenticated;

create or replace function public.nethor_sync_diagnostic_history(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
begin
 if auth.uid() is null or not private.session_is_active()
   or not exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.account_enabled=true and p.role in ('admin','role_point-de-vente'))
 then raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';end if;
 if p_limit is null or p_limit<1 or p_limit>50 then
   raise exception 'NETHOR_SYNC_INVALID_LIMIT' using errcode='22023';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',d.id,'at',d.occurred_at,'generation',d.generation,
  'stage',d.stage,'code',d.error_code,'httpStatus',d.http_status,
  'scanned',d.scanned,'failed',d.failed,'transferred',d.transferred,
  'clientVersion',d.client_version,'breakdown',d.breakdown
 ) order by d.occurred_at desc,d.id desc)
 from (select * from private.nethor_sync_diagnostics
  order by occurred_at desc,id desc limit p_limit) d),'[]'::jsonb);
end
$fn$;
revoke all on function public.nethor_sync_diagnostic_history(integer) from public,anon;
grant execute on function public.nethor_sync_diagnostic_history(integer) to authenticated;

-- Rétention courte (30 jours), exécution automatique côté serveur.
select cron.schedule('nethor-sync-diagnostics-retention','15 3 * * *',
  $schedule$delete from private.nethor_sync_diagnostics where occurred_at < now()-interval '30 days';$schedule$);
commit;
-- NETHOR 2 — bêta notifications internes de changement d'horaire.
-- Migration appliquée le 2026-11-01 sur le projet NETHOR.
-- Architecture générique ; activation initiale limitée au compte netto.enzo.
create table private.planning_change_notification_testers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.planning_change_notification_testers enable row level security;
create policy planning_change_notification_testers_read_own on private.planning_change_notification_testers
for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table private.planning_change_notification_testers from anon, authenticated;
grant select on table private.planning_change_notification_testers to authenticated;
grant usage on schema private to authenticated;

create function public.nethor2_my_planning_change_notification_access()
returns boolean language sql stable security invoker set search_path=''
as $$select exists(select 1 from private.planning_change_notification_testers t where t.user_id=(select auth.uid()) and t.enabled=true);$$;
revoke all on function public.nethor2_my_planning_change_notification_access() from public;
revoke all on function public.nethor2_my_planning_change_notification_access() from anon;
grant execute on function public.nethor2_my_planning_change_notification_access() to authenticated;

create function private.nethor_planning_name_key(p_value text)
returns text language sql immutable set search_path=''
as $$select lower(regexp_replace(btrim(coalesce(p_value,'')),'[[:space:]]+',' ','g'));$$;
revoke all on function private.nethor_planning_name_key(text) from public,anon,authenticated;

create function private.nethor_planning_shift_text(p_cells jsonb,p_start_minutes integer,p_slot_minutes integer)
returns text language plpgsql immutable set search_path=''
as $$
declare
 v_len integer:=case when jsonb_typeof(p_cells)='array' then jsonb_array_length(p_cells) else 0 end;
 v_i integer;v_begin integer:=null;v_working boolean;v_parts text[]:=array[]::text[];
 v_from integer;v_to integer;v_part text;
begin
 p_start_minutes:=coalesce(p_start_minutes,360);p_slot_minutes:=coalesce(nullif(p_slot_minutes,0),15);
 for v_i in 0..v_len loop
  v_working:=v_i<v_len and coalesce(p_cells->>v_i,'') in ('g','b');
  if v_working and v_begin is null then v_begin:=v_i;
  elsif not v_working and v_begin is not null then
   v_from:=p_start_minutes+(v_begin*p_slot_minutes);v_to:=p_start_minutes+(v_i*p_slot_minutes);
   v_part:=lpad((v_from/60)::text,2,'0')||':'||lpad((v_from%60)::text,2,'0')||'–'||lpad((v_to/60)::text,2,'0')||':'||lpad((v_to%60)::text,2,'0');
   v_parts:=array_append(v_parts,v_part);v_begin:=null;
  end if;
 end loop;
 if cardinality(v_parts)=0 then return 'Repos';end if;
 return array_to_string(v_parts,' / ');
end;$$;
revoke all on function private.nethor_planning_shift_text(jsonb,integer,integer) from public,anon,authenticated;

alter table public.planning_notifications drop constraint planning_notifications_kind_check;
alter table public.planning_notifications add constraint planning_notifications_kind_check check(kind=any(array[
 'manual_edit','import_new','import_replace','reset_day','reset_week','planning_shift_change','password_reset_request',
 'admin_message','absence_request','absence_decision','chat_message','chat_direct','chat_group','chat_general','app_update','maintenance'
]::text[]));

create or replace function private.notification_rule_for_kind(p_kind text)
returns text language sql immutable set search_path=''
as $$select case
 when p_kind in ('manual_edit','import_new','import_replace','reset_day','reset_week','planning_shift_change') then 'planning_changes'
 when p_kind='chat_direct' then 'direct_message'
 when p_kind in ('chat_group','chat_general','chat_message') then 'group_message'
 when p_kind in ('absence_request','absence_decision') then 'absence'
 when p_kind='admin_message' then 'admin_message'
 when p_kind='app_update' then 'app_update'
 when p_kind='maintenance' then 'maintenance'
 when p_kind='password_reset_request' then 'security'
 else null end;$$;

create or replace function private.filter_planning_notification_portal()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_rule_key text;v_global_enabled boolean;v_global_portal_enabled boolean;v_control_enabled boolean;v_portal_enabled boolean;
begin
 v_rule_key:=case
  when new.kind=any(array['manual_edit','import_new','import_replace','reset_day','reset_week','planning_shift_change']) then 'planning_changes'
  when new.kind='chat_direct' then 'direct_message'
  when new.kind=any(array['chat_group','chat_general','chat_message']) then 'group_message'
  when new.kind=any(array['absence_request','absence_decision']) then 'absence'
  when new.kind='admin_message' then 'admin_message'
  when new.kind='app_update' then 'app_update'
  when new.kind='maintenance' then 'maintenance'
  when new.kind='password_reset_request' then 'security' else null end;
 if v_rule_key is null then return new;end if;
 select r.enabled,r.portal_enabled into v_global_enabled,v_global_portal_enabled from public.notification_rules r where r.key=v_rule_key;
 if v_global_enabled is false or v_global_portal_enabled is false then return null;end if;
 select c.enabled into v_control_enabled from public.notification_controls c where c.user_id=new.user_id;
 if v_control_enabled is false then return null;end if;
 select p.portal_enabled into v_portal_enabled from public.notification_preferences p where p.user_id=new.user_id and p.rule_key=v_rule_key;
 if v_portal_enabled is false then return null;end if;
 return new;
end;$$;
revoke all on function private.filter_planning_notification_portal() from public,anon,authenticated;

create function private.notify_planning_shift_changes()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_target record;v_names text[];v_old_index integer;v_new_index integer;v_day date;v_old_cells jsonb;v_new_cells jsonb;
 v_old_start integer;v_new_start integer;v_old_slot integer;v_new_slot integer;v_old_label text;v_new_label text;
 v_today date:=(current_timestamp at time zone 'Europe/Paris')::date;
begin
 if old.data is not distinct from new.data then return new;end if;
 for v_target in
  select p.id,p.display_name,p.planning_name,p.planning_aliases
  from private.planning_change_notification_testers t
  join public.profiles p on p.id=t.user_id
  join public.notification_preferences pref on pref.user_id=p.id and pref.rule_key='planning_changes'
  left join public.notification_controls ctrl on ctrl.user_id=p.id
  where t.enabled=true and p.account_enabled=true and pref.enabled=true and pref.portal_enabled=true and coalesce(ctrl.enabled,true)=true
 loop
  select array(select distinct private.nethor_planning_name_key(v)
   from unnest(array_remove(array[v_target.planning_name,v_target.display_name],null)||coalesce(v_target.planning_aliases,'{}'::text[])) names(v)
   where private.nethor_planning_name_key(v)<>'' order by private.nethor_planning_name_key(v)) into v_names;
  if cardinality(v_names)=0 then continue;end if;
  v_old_index:=null;v_new_index:=null;
  select (e.ord-1)::integer into v_old_index from jsonb_array_elements(coalesce(old.data->'employees','[]'::jsonb)) with ordinality e(item,ord)
   where private.nethor_planning_name_key(e.item->>'name')=any(v_names) order by e.ord limit 1;
  select (e.ord-1)::integer into v_new_index from jsonb_array_elements(coalesce(new.data->'employees','[]'::jsonb)) with ordinality e(item,ord)
   where private.nethor_planning_name_key(e.item->>'name')=any(v_names) order by e.ord limit 1;
  if v_old_index is null and v_new_index is null then continue;end if;
  v_old_start:=round(coalesce(nullif(old.data->>'startTime','')::numeric,6)*60)::integer;
  v_new_start:=round(coalesce(nullif(new.data->>'startTime','')::numeric,6)*60)::integer;
  v_old_slot:=coalesce(nullif(old.data->>'slotMinutes','')::integer,15);v_new_slot:=coalesce(nullif(new.data->>'slotMinutes','')::integer,15);
  for v_day in select gs::date from generate_series(new.week_start,new.week_start+6,interval '1 day') gs loop
   if v_day<v_today then continue;end if;
   v_old_cells:=case when v_old_index is null then '[]'::jsonb else coalesce(old.data->'days'->(v_day::text)->'cells'->v_old_index,'[]'::jsonb) end;
   v_new_cells:=case when v_new_index is null then '[]'::jsonb else coalesce(new.data->'days'->(v_day::text)->'cells'->v_new_index,'[]'::jsonb) end;
   v_old_label:=private.nethor_planning_shift_text(v_old_cells,v_old_start,v_old_slot);v_new_label:=private.nethor_planning_shift_text(v_new_cells,v_new_start,v_new_slot);
   if v_old_label is distinct from v_new_label then
    insert into public.planning_notifications(user_id,created_by,kind,title,message,planning_date,week_start,target_url)
    values(v_target.id,new.updated_by,'planning_shift_change','Horaire modifié',to_char(v_day,'DD/MM/YYYY')||' · '||v_old_label||' → '||v_new_label,v_day,new.week_start,null);
   end if;
  end loop;
 end loop;
 return new;
end;$$;
revoke all on function private.notify_planning_shift_changes() from public,anon,authenticated;
create trigger planning_shift_change_notifications after update of data on public.planning_weeks
for each row when(old.data is distinct from new.data) execute function private.notify_planning_shift_changes();

insert into private.planning_change_notification_testers(user_id,enabled)
select p.id,true from public.profiles p where lower(coalesce(p.email,''))='netto.enzo@stock-fl.local';
insert into public.notification_preferences(user_id,rule_key,enabled,push_enabled,portal_enabled)
select p.id,'planning_changes',true,false,true from public.profiles p where lower(coalesce(p.email,''))='netto.enzo@stock-fl.local'
on conflict(user_id,rule_key) do update set enabled=excluded.enabled,push_enabled=false,portal_enabled=excluded.portal_enabled,updated_at=now();

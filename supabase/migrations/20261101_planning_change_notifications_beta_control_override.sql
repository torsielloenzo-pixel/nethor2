-- NETHOR 2 — le contrôle global historique reste inchangé ; le nouveau type interne est autorisé uniquement pour les testeurs explicitement activés.

create or replace function private.planning_change_notification_test_enabled(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from private.planning_change_notification_testers t
    where t.user_id=p_user and t.enabled=true
  );
$$;
revoke all on function private.planning_change_notification_test_enabled(uuid) from public,anon,authenticated;

create or replace function private.notification_enabled_for(p_user uuid,p_kind text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 with k as (
   select private.notification_rule_for_kind(p_kind) as rule_key
 )
 select case
   when p_kind='planning_shift_change' then
     private.planning_change_notification_test_enabled(p_user)
     and coalesce((select nr.enabled from public.notification_rules nr where nr.key='planning_changes'),true)
     and coalesce((select np.enabled from public.notification_preferences np where np.user_id=p_user and np.rule_key='planning_changes'),false)
     and coalesce((select np.portal_enabled from public.notification_preferences np where np.user_id=p_user and np.rule_key='planning_changes'),false)
   else
     coalesce((select nc.enabled from public.notification_controls nc where nc.user_id=p_user),true)
     and case
       when (select rule_key from k) is null then true
       else coalesce((select nr.enabled from public.notification_rules nr where nr.key=(select rule_key from k)),true)
     end
 end
$$;

create or replace function private.enforce_notification_control()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.kind='planning_shift_change'
     and private.planning_change_notification_test_enabled(new.user_id) then
    return new;
  end if;
  if not private.notification_allowed(new.user_id) then
    return null;
  end if;
  return new;
end;
$$;

create or replace function private.filter_planning_notification_portal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule_key text;
  v_global_enabled boolean;
  v_global_portal_enabled boolean;
  v_control_enabled boolean;
  v_portal_enabled boolean;
begin
  v_rule_key := case
    when new.kind = any(array['manual_edit','import_new','import_replace','reset_day','reset_week','planning_shift_change']) then 'planning_changes'
    when new.kind = 'chat_direct' then 'direct_message'
    when new.kind = any(array['chat_group','chat_general','chat_message']) then 'group_message'
    when new.kind = any(array['absence_request','absence_decision']) then 'absence'
    when new.kind = 'admin_message' then 'admin_message'
    when new.kind = 'app_update' then 'app_update'
    when new.kind = 'maintenance' then 'maintenance'
    when new.kind = 'password_reset_request' then 'security'
    else null
  end;

  if v_rule_key is null then return new; end if;

  select r.enabled,r.portal_enabled
    into v_global_enabled,v_global_portal_enabled
    from public.notification_rules r
   where r.key=v_rule_key;

  if v_global_enabled is false or v_global_portal_enabled is false then
    return null;
  end if;

  if new.kind='planning_shift_change' then
    if not private.planning_change_notification_test_enabled(new.user_id) then return null; end if;
  else
    select c.enabled into v_control_enabled
      from public.notification_controls c where c.user_id=new.user_id;
    if v_control_enabled is false then return null; end if;
  end if;

  select p.portal_enabled into v_portal_enabled
    from public.notification_preferences p
   where p.user_id=new.user_id and p.rule_key=v_rule_key;

  if v_portal_enabled is false then return null; end if;
  return new;
end
$$;
revoke all on function private.filter_planning_notification_portal() from public,anon,authenticated;

create or replace function private.notify_planning_shift_changes()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target record;
  v_names text[];
  v_old_index integer;
  v_new_index integer;
  v_day date;
  v_old_cells jsonb;
  v_new_cells jsonb;
  v_old_start integer;
  v_new_start integer;
  v_old_slot integer;
  v_new_slot integer;
  v_old_label text;
  v_new_label text;
  v_today date := (current_timestamp at time zone 'Europe/Paris')::date;
begin
  if old.data is not distinct from new.data then return new; end if;

  for v_target in
    select p.id,p.display_name,p.planning_name,p.planning_aliases
    from private.planning_change_notification_testers t
    join public.profiles p on p.id=t.user_id
    join public.notification_preferences pref
      on pref.user_id=p.id and pref.rule_key='planning_changes'
    where t.enabled=true
      and p.account_enabled=true
      and pref.enabled=true
      and pref.portal_enabled=true
  loop
    select array(
      select distinct private.nethor_planning_name_key(v)
      from unnest(
        array_remove(array[v_target.planning_name,v_target.display_name],null)
        || coalesce(v_target.planning_aliases,'{}'::text[])
      ) names(v)
      where private.nethor_planning_name_key(v)<>''
      order by private.nethor_planning_name_key(v)
    ) into v_names;

    if cardinality(v_names)=0 then continue; end if;

    v_old_index:=null;v_new_index:=null;
    select (e.ord-1)::integer into v_old_index
      from jsonb_array_elements(coalesce(old.data->'employees','[]'::jsonb)) with ordinality e(item,ord)
      where private.nethor_planning_name_key(e.item->>'name')=any(v_names)
      order by e.ord limit 1;
    select (e.ord-1)::integer into v_new_index
      from jsonb_array_elements(coalesce(new.data->'employees','[]'::jsonb)) with ordinality e(item,ord)
      where private.nethor_planning_name_key(e.item->>'name')=any(v_names)
      order by e.ord limit 1;

    if v_old_index is null and v_new_index is null then continue; end if;

    v_old_start:=round(coalesce(nullif(old.data->>'startTime','')::numeric,6)*60)::integer;
    v_new_start:=round(coalesce(nullif(new.data->>'startTime','')::numeric,6)*60)::integer;
    v_old_slot:=coalesce(nullif(old.data->>'slotMinutes','')::integer,15);
    v_new_slot:=coalesce(nullif(new.data->>'slotMinutes','')::integer,15);

    for v_day in select gs::date from generate_series(new.week_start,new.week_start+6,interval '1 day') gs loop
      if v_day<v_today then continue; end if;

      v_old_cells:=case when v_old_index is null then '[]'::jsonb else coalesce(old.data->'days'->(v_day::text)->'cells'->v_old_index,'[]'::jsonb) end;
      v_new_cells:=case when v_new_index is null then '[]'::jsonb else coalesce(new.data->'days'->(v_day::text)->'cells'->v_new_index,'[]'::jsonb) end;
      v_old_label:=private.nethor_planning_shift_text(v_old_cells,v_old_start,v_old_slot);
      v_new_label:=private.nethor_planning_shift_text(v_new_cells,v_new_start,v_new_slot);

      if v_old_label is distinct from v_new_label then
        insert into public.planning_notifications(user_id,created_by,kind,title,message,planning_date,week_start,target_url)
        values(
          v_target.id,new.updated_by,'planning_shift_change','Horaire modifié',
          to_char(v_day,'DD/MM/YYYY')||' · '||v_old_label||' → '||v_new_label,
          v_day,new.week_start,null
        );
      end if;
    end loop;
  end loop;
  return new;
end
$$;
revoke all on function private.notify_planning_shift_changes() from public,anon,authenticated;

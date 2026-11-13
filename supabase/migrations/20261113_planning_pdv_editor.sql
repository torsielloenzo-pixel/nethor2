-- NETHOR 2 — autoriser Point de vente à éditer le planning sur Desktop / PWA Desktop.
-- Le verrouillage reste strictement réservé au rôle Administrateur.
create or replace function private.planning_admin_save_week(
  p_week_start date,
  p_expected_revision timestamptz,
  p_data jsonb,
  p_employee_order jsonb,
  p_lock_after boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_existing public.planning_weeks%rowtype;
  v_saved_revision timestamptz;
begin
  if v_actor is null
     or not (select private.session_is_active())
  then
    return pg_catalog.jsonb_build_object('status','forbidden');
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id=v_actor
    and p.account_enabled
  limit 1;

  if v_role not in ('admin','role_point-de-vente') then
    return pg_catalog.jsonb_build_object('status','forbidden');
  end if;

  if coalesce(p_lock_after,false) and v_role <> 'admin' then
    return pg_catalog.jsonb_build_object('status','forbidden');
  end if;

  if p_expected_revision is null then
    return pg_catalog.jsonb_build_object('status','conflict');
  end if;

  if not private.nethor_planning_model_valid(p_week_start,p_data,p_employee_order) then
    return pg_catalog.jsonb_build_object('status','invalid');
  end if;

  select * into v_existing
  from public.planning_weeks
  where week_start=p_week_start
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','not_found');
  end if;

  if coalesce(v_existing.editor_locked,false) then
    return pg_catalog.jsonb_build_object(
      'status','locked','revision',v_existing.updated_at,'locked',true
    );
  end if;

  if v_existing.updated_at is distinct from p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'status','conflict','current_revision',v_existing.updated_at
    );
  end if;

  if (v_existing.data->'employees') is not distinct from (p_data->'employees')
     and (v_existing.data->'days') is not distinct from (p_data->'days')
     and (v_existing.data->>'startTime') is not distinct from (p_data->>'startTime')
     and (v_existing.data->>'slotMinutes') is not distinct from (p_data->>'slotMinutes')
     and (v_existing.data->>'slotCount') is not distinct from (p_data->>'slotCount')
  then
    if not coalesce(p_lock_after,false) then
      return pg_catalog.jsonb_build_object(
        'status','unchanged','revision',v_existing.updated_at,'locked',false
      );
    end if;

    update public.planning_weeks
       set editor_locked=true,
           editor_locked_at=pg_catalog.clock_timestamp(),
           editor_locked_by=v_actor,
           updated_by=v_actor
     where week_start=p_week_start
       and updated_at=p_expected_revision
     returning updated_at into v_saved_revision;

    if v_saved_revision is null then
      return pg_catalog.jsonb_build_object('status','conflict');
    end if;

    return pg_catalog.jsonb_build_object(
      'status','ok','revision',v_saved_revision,'locked',true
    );
  end if;

  update public.planning_weeks
     set data=p_data,
         employee_order=p_employee_order,
         editor_edited_at=pg_catalog.clock_timestamp(),
         editor_edited_by=v_actor,
         editor_locked=coalesce(p_lock_after,false),
         editor_locked_at=case when coalesce(p_lock_after,false) then pg_catalog.clock_timestamp() else null end,
         editor_locked_by=case when coalesce(p_lock_after,false) then v_actor else null end,
         updated_by=v_actor
   where week_start=p_week_start
     and updated_at=p_expected_revision
   returning updated_at into v_saved_revision;

  if v_saved_revision is null then
    return pg_catalog.jsonb_build_object('status','conflict');
  end if;

  return pg_catalog.jsonb_build_object(
    'status','ok','revision',v_saved_revision,'locked',coalesce(p_lock_after,false)
  );
end;
$$;

revoke all on function private.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) from public,anon;
grant execute on function private.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) to authenticated;

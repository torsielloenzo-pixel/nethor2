-- NETHOR 2 — fiabilisation des imports manuels.
-- Validation structurelle complète + publication idempotente des semaines.

create or replace function private.nethor_planning_model_valid(
  p_week_start date,
  p_data jsonb,
  p_employee_order jsonb
)
returns boolean
language plpgsql
stable
set search_path=''
as $$
declare
  v_employee_count integer;
  v_dates text[];
  v_day text;
  v_cells jsonb;
  v_row jsonb;
  v_color jsonb;
begin
  if p_week_start is null
     or p_week_start < date '2025-01-01'
     or extract(isodow from p_week_start)::integer <> 1
     or p_data is null
     or coalesce(p_data->>'version','') not in ('3','4')
     or p_data->>'weekStart' is distinct from p_week_start::text
     or pg_catalog.jsonb_typeof(p_data->'employees') is distinct from 'array'
     or pg_catalog.jsonb_typeof(p_data->'days') is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_employee_order) is distinct from 'array'
     or coalesce(p_data->>'slotCount','') <> '58'
     or coalesce(p_data->>'slotMinutes','') <> '15'
     or coalesce(p_data->>'startTime','') <> '6'
  then
    return false;
  end if;

  v_employee_count:=pg_catalog.jsonb_array_length(p_data->'employees');
  if v_employee_count < 1 or v_employee_count > 200
     or pg_catalog.jsonb_array_length(p_employee_order) <> v_employee_count
  then
    return false;
  end if;

  if exists(
    select 1
    from pg_catalog.jsonb_array_elements(p_data->'employees') e
    where pg_catalog.btrim(coalesce(e->>'name',''))=''
  ) then
    return false;
  end if;

  if (
    select count(*)
    from (
      select distinct private.nethor_planning_name_key(e->>'name') as k
      from pg_catalog.jsonb_array_elements(p_data->'employees') e
    ) names
  ) <> v_employee_count then
    return false;
  end if;

  select pg_catalog.array_agg(k order by k)
    into v_dates
    from pg_catalog.jsonb_object_keys(p_data->'days') k;

  if coalesce(pg_catalog.array_length(v_dates,1),0)<>7
     or exists(
       select 1
       from pg_catalog.unnest(v_dates) with ordinality as x(d,ord)
       where x.d<>(p_week_start+(x.ord::integer-1))::text
     )
  then
    return false;
  end if;

  foreach v_day in array v_dates loop
    v_cells:=p_data->'days'->v_day->'cells';
    if pg_catalog.jsonb_typeof(v_cells) is distinct from 'array'
       or pg_catalog.jsonb_array_length(v_cells)<>v_employee_count
    then
      return false;
    end if;

    for v_row in select value from pg_catalog.jsonb_array_elements(v_cells) loop
      if pg_catalog.jsonb_typeof(v_row) is distinct from 'array'
         or pg_catalog.jsonb_array_length(v_row)<>58
      then
        return false;
      end if;

      for v_color in select value from pg_catalog.jsonb_array_elements(v_row) loop
        if v_color <> 'null'::jsonb
           and v_color not in ('"g"'::jsonb,'"b"'::jsonb,'"r"'::jsonb,'"y"'::jsonb,'"o"'::jsonb)
        then
          return false;
        end if;
      end loop;
    end loop;
  end loop;

  return true;
end;
$$;

revoke all on function private.nethor_planning_model_valid(date,jsonb,jsonb)
from public,anon,authenticated;

create or replace function private.planning_save_week_if_revision(
  p_week_start date,
  p_expected_revision timestamptz,
  p_data jsonb,
  p_employee_order jsonb,
  p_week_label text,
  p_source_file text,
  p_source_path text,
  p_imported_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.planning_weeks%rowtype;
  v_saved_revision timestamptz;
begin
  if v_actor is null
     or not (select private.session_is_active())
     or not (select private.can_module(v_actor,'planning','manage'))
  then
    return pg_catalog.jsonb_build_object('status','forbidden');
  end if;

  if not private.nethor_planning_model_valid(p_week_start,p_data,p_employee_order) then
    return pg_catalog.jsonb_build_object('status','invalid');
  end if;

  select * into v_existing
  from public.planning_weeks
  where week_start=p_week_start
  for update;

  if p_expected_revision is null then
    if found then
      return pg_catalog.jsonb_build_object(
        'status','conflict',
        'current_revision',v_existing.updated_at
      );
    end if;

    insert into public.planning_weeks(
      week_start,data,employee_order,week_label,source_file,source_path,
      imported,imported_at,updated_by
    )
    values(
      p_week_start,p_data,p_employee_order,p_week_label,p_source_file,p_source_path,
      true,coalesce(p_imported_at,pg_catalog.clock_timestamp()),v_actor
    )
    returning updated_at into v_saved_revision;
  else
    if not found or v_existing.updated_at is distinct from p_expected_revision then
      return pg_catalog.jsonb_build_object(
        'status','conflict',
        'current_revision',case when v_existing.week_start is null then null else v_existing.updated_at end
      );
    end if;

    if (v_existing.data->'employees') is not distinct from (p_data->'employees')
       and (v_existing.data->'days') is not distinct from (p_data->'days')
       and (v_existing.data->>'startTime') is not distinct from (p_data->>'startTime')
       and (v_existing.data->>'slotMinutes') is not distinct from (p_data->>'slotMinutes')
       and (v_existing.data->>'slotCount') is not distinct from (p_data->>'slotCount')
    then
      return pg_catalog.jsonb_build_object(
        'status','unchanged',
        'revision',v_existing.updated_at
      );
    end if;

    update public.planning_weeks
       set data=p_data,
           employee_order=p_employee_order,
           week_label=p_week_label,
           source_file=p_source_file,
           source_path=p_source_path,
           imported=true,
           imported_at=coalesce(p_imported_at,imported_at,pg_catalog.clock_timestamp()),
           updated_by=v_actor
     where week_start=p_week_start
       and updated_at=p_expected_revision
     returning updated_at into v_saved_revision;

    if v_saved_revision is null then
      return pg_catalog.jsonb_build_object('status','conflict');
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'status','ok',
    'revision',v_saved_revision
  );
end;
$$;

revoke all on function private.planning_save_week_if_revision(
  date,timestamptz,jsonb,jsonb,text,text,text,timestamptz
) from public,anon,authenticated;

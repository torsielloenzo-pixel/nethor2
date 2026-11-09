-- NETHOR 2 — historique personnel des versions de planning.
-- Conserve uniquement les lignes de planning associées au compte, jamais le planning complet de l'équipe.

create table if not exists public.personal_planning_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  revision_at timestamptz not null,
  change_kind text not null default 'update'
    check (change_kind = any(array['baseline','import','replace','update']::text[])),
  schedule jsonb not null,
  source_file text,
  created_at timestamptz not null default now(),
  unique(user_id,week_start,revision_at)
);

alter table public.personal_planning_history enable row level security;
revoke all on table public.personal_planning_history from anon;
revoke insert,update,delete on table public.personal_planning_history from authenticated;
grant select on table public.personal_planning_history to authenticated;

drop policy if exists "personal planning history read own" on public.personal_planning_history;
create policy "personal planning history read own"
on public.personal_planning_history
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.session_is_active())
);

create index if not exists personal_planning_history_user_week_revision_idx
on public.personal_planning_history(user_id,week_start,revision_at desc,id desc);

create or replace function private.nethor_personal_planning_snapshot(p_data jsonb,p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_names text[];
  v_employees jsonb;
begin
  if p_data is null or p_user is null then return null; end if;

  select array(
    select distinct private.nethor_planning_name_key(v)
    from public.profiles p,
    lateral unnest(
      array_remove(array[p.planning_name,p.display_name],null)
      || coalesce(p.planning_aliases,'{}'::text[])
    ) names(v)
    where p.id=p_user
      and p.account_enabled=true
      and private.nethor_planning_name_key(v)<>''
    order by private.nethor_planning_name_key(v)
  ) into v_names;

  if coalesce(cardinality(v_names),0)=0 then return null; end if;

  select jsonb_agg(
    jsonb_build_object(
      'name',e.item->>'name',
      'days',(
        select coalesce(
          jsonb_object_agg(
            d.key,
            coalesce(d.value->'cells'->((e.ord-1)::integer),'[]'::jsonb)
            order by d.key
          ),
          '{}'::jsonb
        )
        from jsonb_each(coalesce(p_data->'days','{}'::jsonb)) d
      )
    )
    order by e.ord
  )
  into v_employees
  from jsonb_array_elements(coalesce(p_data->'employees','[]'::jsonb))
       with ordinality e(item,ord)
  where private.nethor_planning_name_key(e.item->>'name')=any(v_names);

  if v_employees is null or jsonb_array_length(v_employees)=0 then return null; end if;

  return jsonb_build_object(
    'version',1,
    'weekStart',p_data->>'weekStart',
    'startTime',coalesce(p_data->'startTime','6'::jsonb),
    'slotMinutes',coalesce(p_data->'slotMinutes','15'::jsonb),
    'slotCount',coalesce(p_data->'slotCount','58'::jsonb),
    'employees',v_employees
  );
end;
$$;
revoke all on function private.nethor_personal_planning_snapshot(jsonb,uuid) from public,anon,authenticated;

create or replace function private.capture_personal_planning_history()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile record;
  v_snapshot jsonb;
  v_previous jsonb;
  v_kind text := 'update';
begin
  if tg_op='INSERT' then
    v_kind:='import';
  elsif old.imported_at is distinct from new.imported_at
     or old.source_path is distinct from new.source_path
     or old.source_file is distinct from new.source_file then
    v_kind:='replace';
  end if;

  for v_profile in
    select p.id
    from public.profiles p
    where p.account_enabled=true
  loop
    v_snapshot:=private.nethor_personal_planning_snapshot(new.data,v_profile.id);
    if v_snapshot is null then continue; end if;

    select h.schedule
      into v_previous
      from public.personal_planning_history h
     where h.user_id=v_profile.id
       and h.week_start=new.week_start
     order by h.revision_at desc,h.id desc
     limit 1;

    if v_previous is not distinct from v_snapshot then
      continue;
    end if;

    insert into public.personal_planning_history(
      user_id,week_start,revision_at,change_kind,schedule,source_file
    )
    values(
      v_profile.id,
      new.week_start,
      coalesce(new.updated_at,pg_catalog.clock_timestamp()),
      v_kind,
      v_snapshot,
      new.source_file
    )
    on conflict(user_id,week_start,revision_at) do nothing;
  end loop;

  return new;
end;
$$;
revoke all on function private.capture_personal_planning_history() from public,anon,authenticated;

drop trigger if exists personal_planning_history_capture on public.planning_weeks;
create trigger personal_planning_history_capture
after insert or update of data,imported_at,source_file,source_path
on public.planning_weeks
for each row
execute function private.capture_personal_planning_history();

-- Point de départ : sauvegarder la version actuellement publiée de chaque semaine
-- pour chaque compte lié. Les anciennes versions complètes antérieures à ce déploiement
-- ne peuvent pas être reconstruites à partir des seules métadonnées de révision existantes.
insert into public.personal_planning_history(
  user_id,week_start,revision_at,change_kind,schedule,source_file
)
select
  p.id,
  w.week_start,
  w.updated_at,
  'baseline',
  s.snapshot,
  w.source_file
from public.planning_weeks w
cross join public.profiles p
cross join lateral (
  select private.nethor_personal_planning_snapshot(w.data,p.id) as snapshot
) s
where w.week_start>=date '2025-01-01'
  and p.account_enabled=true
  and s.snapshot is not null
on conflict(user_id,week_start,revision_at) do nothing;

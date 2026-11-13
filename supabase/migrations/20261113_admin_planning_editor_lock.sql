-- NETHOR 2 — éditeur de planning Administrateur Desktop / PWA Desktop.
-- Le verrouillage est serveur : NethorSync et l'import manuel ne peuvent pas
-- remplacer une semaine protégée. Les modifications restent historisées par
-- les triggers existants de planning_weeks.
begin;

alter table public.planning_weeks
  add column if not exists editor_locked boolean not null default false,
  add column if not exists editor_locked_at timestamptz,
  add column if not exists editor_locked_by uuid,
  add column if not exists editor_edited_at timestamptz,
  add column if not exists editor_edited_by uuid;

comment on column public.planning_weeks.editor_locked is
  'Verrou administrateur : interdit le remplacement par NethorSync et les imports manuels.';
comment on column public.planning_weeks.editor_edited_at is
  'Dernière publication effectuée depuis l’éditeur NETHOR.';

-- L'import Excel manuel respecte désormais le verrou administrateur.
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

  if found and coalesce(v_existing.editor_locked,false) then
    return pg_catalog.jsonb_build_object(
      'status','locked',
      'revision',v_existing.updated_at
    );
  end if;

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
grant execute on function private.planning_save_week_if_revision(
  date,timestamptz,jsonb,jsonb,text,text,text,timestamptz
) to authenticated;

-- Publication depuis l'éditeur : exclusivement un compte Administrateur actif.
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
  v_existing public.planning_weeks%rowtype;
  v_saved_revision timestamptz;
begin
  if v_actor is null
     or not (select private.session_is_active())
     or not exists(
       select 1 from public.profiles p
       where p.id=v_actor and p.account_enabled and p.role='admin'
     )
  then
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
) from public,anon,authenticated;
grant execute on function private.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) to authenticated;

create or replace function public.planning_admin_save_week(
  p_week_start date,
  p_expected_revision timestamptz,
  p_data jsonb,
  p_employee_order jsonb,
  p_lock_after boolean default false
)
returns jsonb
language sql
set search_path=''
as $$
  select private.planning_admin_save_week(
    p_week_start,p_expected_revision,p_data,p_employee_order,p_lock_after
  );
$$;

revoke all on function public.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) from public,anon;
grant execute on function public.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) to authenticated;

create or replace function private.planning_admin_set_week_lock(
  p_week_start date,
  p_expected_revision timestamptz,
  p_locked boolean
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
     or not exists(
       select 1 from public.profiles p
       where p.id=v_actor and p.account_enabled and p.role='admin'
     )
  then
    return pg_catalog.jsonb_build_object('status','forbidden');
  end if;

  if p_expected_revision is null or p_locked is null then
    return pg_catalog.jsonb_build_object('status','conflict');
  end if;

  select * into v_existing
  from public.planning_weeks
  where week_start=p_week_start
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','not_found');
  end if;

  if v_existing.updated_at is distinct from p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'status','conflict','current_revision',v_existing.updated_at
    );
  end if;

  if coalesce(v_existing.editor_locked,false)=p_locked then
    return pg_catalog.jsonb_build_object(
      'status','unchanged','revision',v_existing.updated_at,'locked',p_locked
    );
  end if;

  update public.planning_weeks
     set editor_locked=p_locked,
         editor_locked_at=case when p_locked then pg_catalog.clock_timestamp() else null end,
         editor_locked_by=case when p_locked then v_actor else null end,
         updated_by=v_actor
   where week_start=p_week_start
     and updated_at=p_expected_revision
   returning updated_at into v_saved_revision;

  if v_saved_revision is null then
    return pg_catalog.jsonb_build_object('status','conflict');
  end if;

  return pg_catalog.jsonb_build_object(
    'status','ok','revision',v_saved_revision,'locked',p_locked
  );
end;
$$;

revoke all on function private.planning_admin_set_week_lock(
  date,timestamptz,boolean
) from public,anon,authenticated;
grant execute on function private.planning_admin_set_week_lock(
  date,timestamptz,boolean
) to authenticated;

create or replace function public.planning_admin_set_week_lock(
  p_week_start date,
  p_expected_revision timestamptz,
  p_locked boolean
)
returns jsonb
language sql
set search_path=''
as $$
  select private.planning_admin_set_week_lock(
    p_week_start,p_expected_revision,p_locked
  );
$$;

revoke all on function public.planning_admin_set_week_lock(
  date,timestamptz,boolean
) from public,anon;
grant execute on function public.planning_admin_set_week_lock(
  date,timestamptz,boolean
) to authenticated;

-- Protection NethorSync : un job peut être créé, mais la publication est ignorée
-- sous le même verrou de ligne que les autres contrôles.
CREATE OR REPLACE FUNCTION public.nethor_sync_auto_complete(p_job_id uuid, p_proof uuid, p_result text, p_model jsonb DEFAULT NULL::jsonb, p_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 j private.nethor_sync_auto_jobs%rowtype;
 c private.nethor_sync_file_changes%rowtype;
 w public.planning_weeks%rowtype;
 b public.nethor_sync_binding%rowtype;
 v_week date;
 v_employee_count integer;
 v_dates text[];
 v_day text;
 v_cells jsonb;
 v_row jsonb;
 v_color jsonb;
 v_outcome text:=p_result;
 v_path text;
 v_name text;
 v_generation bigint;
 v_mod_at timestamptz;
 v_uploaded_at timestamptz;
 v_filename_match text[];
 v_filename_week date;
 v_file_year integer;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'NETHOR_AUTO_UNAUTHORIZED' using errcode='42501';
 end if;
 select * into j from private.nethor_sync_auto_jobs where id=p_job_id and proof=p_proof for update;
 if not found then return jsonb_build_object('status','not_found');end if;
 if j.status in ('published','unchanged','skipped','rejected','failed') then
   return jsonb_build_object('status',j.status);
 end if;
 if j.status <> 'processing' then return jsonb_build_object('status','not_claimed');end if;
 select * into c from private.nethor_sync_file_changes where id=j.change_id;
 v_path=coalesce(j.storage_path,c.storage_path);
 v_name=coalesce(j.storage_name,c.file_name);
 v_generation=coalesce(j.storage_generation,c.generation);
 v_mod_at=c.modified_at;
 v_uploaded_at=j.storage_uploaded_at;
 select * into b from public.nethor_sync_binding where singleton_id=1;
 if b.device_id is null or b.generation<>v_generation
    or (j.source_kind='storage' and b.registered_by is distinct from j.storage_owner)
    or not exists (select 1 from public.profiles p where p.id=b.registered_by and p.account_enabled
      and p.role in ('admin','role_point-de-vente'))
 then
   v_outcome='skipped'; p_detail='Poste révoqué ou compte désactivé';
 end if;
 if v_outcome='publish' then
   begin v_week=(p_model->>'weekStart')::date;
   exception when others then v_week=null; end;
   v_employee_count=case when jsonb_typeof(p_model->'employees')='array'
      then jsonb_array_length(p_model->'employees') else 0 end;
   if p_model is null or p_model->>'version'<>'4'
      or v_week is null or extract(isodow from v_week)<>1
      or v_employee_count<1 or v_employee_count>200
      or jsonb_typeof(p_model->'days')<>'object'
      or (p_model->>'slotCount')<>'58'
      or (p_model->>'slotMinutes')<>'15'
      or (p_model->>'startTime')<>'6'
      or p_model->>'sourcePath' is distinct from v_path
      or p_model->>'sourceFile' is distinct from v_name
      or (j.source_kind='change' and
           (p_model->>'sourceModifiedAt' is null
             or (p_model->>'sourceModifiedAt')::timestamptz is distinct from v_mod_at))
      or (j.source_kind='storage' and
           (p_model->>'sourceUploadedAt' is null
             or (p_model->>'sourceUploadedAt')::timestamptz is distinct from v_uploaded_at))
   then
     v_outcome='rejected';p_detail='Modèle Excel incomplet ou non conforme';
   else
     select array_agg(k order by k) into v_dates from jsonb_object_keys(p_model->'days') k;
     if coalesce(array_length(v_dates,1),0)<>7
        or exists(select 1 from unnest(v_dates) with ordinality as x(d,ord)
          where x.d<>(v_week+(x.ord::integer-1))::text)
     then
       v_outcome='rejected';p_detail='Dates du planning incohérentes';
     else
       for v_day in select unnest(v_dates) loop
         v_cells=p_model->'days'->v_day->'cells';
         if jsonb_typeof(v_cells)<>'array' or jsonb_array_length(v_cells)<>v_employee_count then
           v_outcome='rejected';p_detail='Nombre de salariés incohérent';exit;
         end if;
         for v_row in select value from jsonb_array_elements(v_cells) loop
           if jsonb_typeof(v_row)<>'array' or jsonb_array_length(v_row)<>58 then
             v_outcome='rejected';p_detail='Créneaux incomplets';exit;
           end if;
           for v_color in select value from jsonb_array_elements(v_row) loop
             if v_color <> 'null'::jsonb and v_color not in ('"g"'::jsonb,'"b"'::jsonb,'"r"'::jsonb,'"y"'::jsonb,'"o"'::jsonb) then
               v_outcome='rejected';p_detail='Couleur horaire invalide';exit;
             end if;
           end loop;
           exit when v_outcome='rejected';
         end loop;
         exit when v_outcome='rejected';
       end loop;
     end if;
   end if;
 end if;
 if v_outcome='publish' and j.dry_run then
   v_outcome='unchanged';p_detail='Diagnostic en lecture seule : aucune publication.';
 end if;
 if v_outcome='publish' then
   select * into w from public.planning_weeks where week_start=v_week for update;
   if not found then
     -- Créer uniquement les semaines réellement manquantes et datées.
     v_filename_match=regexp_match(v_name,'([0-3]?[0-9])[.]([01]?[0-9])[.]([0-9]{2,4})');
     v_filename_week=null;
     if v_filename_match is not null then
       begin
         v_file_year=v_filename_match[3]::integer;
         if length(v_filename_match[3])=2 then v_file_year=v_file_year+2000;end if;
         v_filename_week=make_date(v_file_year,v_filename_match[2]::integer,v_filename_match[1]::integer);
       exception when others then v_filename_week=null;
       end;
     end if;
     if v_week < date '2020-01-01'
        or v_week > date_trunc('week',now() at time zone 'Europe/Paris')::date+70 then
       v_outcome='skipped';p_detail='Date en dehors de la période autorisée pour la création';
     elsif v_name !~* '^PLANNING([ _-]|$)' or (v_filename_week is null or v_filename_week<v_week or v_filename_week>v_week+6) then
       v_outcome='skipped';p_detail='Date Excel B2 différente du nom du fichier ou nom non daté';
     else
       insert into public.planning_weeks
         (week_start,data,employee_order,week_label,source_file,source_path,
          imported,imported_at,updated_by)
       values (v_week,p_model,
         (select jsonb_agg(e->>'name' order by ord)
            from jsonb_array_elements(p_model->'employees') with ordinality x(e,ord)),
         nullif(p_model->>'weekLabel',''),v_name,v_path,true,now(),b.registered_by)
       on conflict (week_start) do nothing;
       if found then
         v_outcome='published';
         p_detail='Semaine créée depuis une archive NethorSync vérifiée';
       else
         v_outcome='skipped';
         p_detail='Semaine déjà créée entre-temps, aucune modification';
       end if;
     end if;
   elsif j.missing_week_only then
     v_outcome='skipped';p_detail='Semaine déjà publiée : import historique sans écrasement';
   elsif coalesce(w.editor_locked,false) then
     v_outcome='skipped';p_detail='Semaine verrouillée par l’administrateur';
   elsif (w.data->'employees') is not distinct from (p_model->'employees')
      and (w.data->'days') is not distinct from (p_model->'days') then
     v_outcome='unchanged';p_detail='Horaires déjà identiques à la version publiée';
   elsif j.source_kind='storage' and (
      v_week < date_trunc('week',now() at time zone 'Europe/Paris')::date - 7
      or v_week > date_trunc('week',now() at time zone 'Europe/Paris')::date + 70
   ) then
     v_outcome='skipped';p_detail='Semaine archivée ou trop lointaine, validation manuelle nécessaire';
   elsif j.source_kind='storage' and
     regexp_replace(upper(regexp_replace(coalesce(w.source_file,''),'\.[^.]+$','','i')),'[^A-Z0-9]','','g')
        <> regexp_replace(upper(regexp_replace(v_name,'\.[^.]+$','','i')),'[^A-Z0-9]','','g')
   then
     v_outcome='skipped';p_detail='Nom du planning différent de la version publiée';
   elsif j.source_kind='storage'
      and (w.data->>'sourceUploadedAt') is not null
      and (w.data->>'sourceUploadedAt')::timestamptz >= v_uploaded_at then
     v_outcome='skipped';p_detail='Un transfert plus récent a déjà mis à jour cette semaine';
   elsif j.source_kind='storage' and
       (w.source_path is null or w.source_path not like 'sync-inbox/%')
       and (w.updated_at > v_uploaded_at or w.imported_at > v_uploaded_at)
   then
     v_outcome='skipped';p_detail='Importation manuelle postérieure au transfert';
   elsif j.source_kind='storage' and w.source_path like 'sync-inbox/%'
       and w.data->>'sourceUploadedAt' is null
       and w.updated_at > v_uploaded_at
   then
     v_outcome='skipped';p_detail='Version publiée après le transfert, ordre non vérifiable';
   elsif j.source_kind='change' and
       (w.data->>'sourceModifiedAt') is not null
       and (w.data->>'sourceModifiedAt')::timestamptz >= v_mod_at then
     v_outcome='skipped';p_detail='Une version Excel plus récente est déjà publiée';
   elsif j.source_kind='change' and w.source_path not like 'sync-inbox/%'
       and w.imported_at > v_mod_at then
     v_outcome='skipped';p_detail='Une importation manuelle est plus récente que le fichier Excel';
   elsif j.source_kind='change' and w.updated_at > j.created_at
       and coalesce(w.source_path,'') not like 'sync-inbox/%' then
     v_outcome='skipped';p_detail='Le planning a été modifié depuis la réception du fichier';
   else
     update public.planning_weeks
     set data=p_model,employee_order=(
       select jsonb_agg(e->>'name' order by ord)
       from jsonb_array_elements(p_model->'employees') with ordinality x(e,ord)),
       week_label=coalesce(nullif(p_model->>'weekLabel',''),w.week_label),
       source_file=v_name,source_path=v_path,imported=true,
       imported_at=now(),updated_by=b.registered_by
     where week_start=v_week;
     v_outcome='published';p_detail='Semaine mise à jour automatiquement par NethorSync';
   end if;
 end if;
 if v_outcome not in ('published','unchanged','skipped','rejected','failed') then
   v_outcome='failed';p_detail=coalesce(p_detail,'Résultat du traitement non reconnu');
 end if;
 update private.nethor_sync_auto_jobs
 set status=v_outcome,week_start=v_week,detail=left(coalesce(p_detail,''),400),completed_at=now()
 where id=j.id;
 return jsonb_build_object('status',v_outcome,'weekStart',v_week);
end
$function$;

revoke all on function public.nethor_sync_auto_complete(
  uuid,uuid,text,jsonb,text
) from public,anon,authenticated;
grant execute on function public.nethor_sync_auto_complete(
  uuid,uuid,text,jsonb,text
) to service_role;

commit;

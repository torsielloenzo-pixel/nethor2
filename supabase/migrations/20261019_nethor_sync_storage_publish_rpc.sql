-- Reception d'un Excel 2.1.2 : RPC communs aux anciens jobs et aux transferts storage.
begin;
create or replace function public.nethor_sync_auto_claim(p_job_id uuid,p_proof uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare j private.nethor_sync_auto_jobs%rowtype; c private.nethor_sync_file_changes%rowtype;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'NETHOR_AUTO_UNAUTHORIZED' using errcode='42501';
 end if;
 update private.nethor_sync_auto_jobs
 set status='processing',attempts=attempts+1,started_at=now()
 where id=p_job_id and proof=p_proof and attempts<4
   and ((status='queued' and next_attempt_at<=now())
       or (status='processing' and started_at<now()-interval '4 minutes'))
 returning * into j;
 if not found then return jsonb_build_object('claimed',false);end if;
 select * into c from private.nethor_sync_file_changes where id=j.change_id;
 return jsonb_build_object(
   'claimed',true,'id',j.id,
   'sourceKind',j.source_kind,
   'storagePath',coalesce(j.storage_path,c.storage_path),
   'sha256',coalesce(j.storage_sha256,c.sha256),
   'fileName',coalesce(j.storage_name,c.file_name),
   'modifiedAt',case when j.source_kind='change' then c.modified_at else null end,
   'uploadedAt',j.storage_uploaded_at,
   'previousModifiedAt',c.previous_modified_at,
   'generation',coalesce(j.storage_generation,c.generation),
   'dryRun',j.dry_run
 );
end
$fn$;


revoke all on function public.nethor_sync_auto_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nethor_sync_auto_claim(uuid,uuid) to service_role;

create or replace function public.nethor_sync_auto_complete(
 p_job_id uuid,p_proof uuid,p_result text,p_model jsonb default null,p_detail text default null
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
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
     v_outcome='skipped';p_detail='Aucune semaine de référence déjà publiée';
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
$fn$;


revoke all on function public.nethor_sync_auto_complete(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.nethor_sync_auto_complete(uuid,uuid,text,jsonb,text) to service_role;

create or replace function public.nethor_sync_auto_publications(p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
begin
 if auth.uid() is null or not private.session_is_active()
    or not exists(select 1 from public.profiles p where p.id=auth.uid()
       and p.account_enabled and p.role in ('admin','role_point-de-vente')) then
   raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_limit is null or p_limit<1 or p_limit>100 then
   raise exception 'NETHOR_SYNC_INVALID_LIMIT' using errcode='22023';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'fileName',coalesce(j.storage_name,c.file_name),'weekStart',j.week_start,'status',j.status,
   'when',coalesce(j.completed_at,j.created_at),'detail',j.detail
 ) order by j.created_at desc)
 from (select * from private.nethor_sync_auto_jobs where not dry_run order by created_at desc limit p_limit) j
 left join private.nethor_sync_file_changes c on c.id=j.change_id),'[]'::jsonb);
end
$fn$;


revoke all on function public.nethor_sync_auto_publications(integer) from public,anon;
grant execute on function public.nethor_sync_auto_publications(integer) to authenticated;
commit;

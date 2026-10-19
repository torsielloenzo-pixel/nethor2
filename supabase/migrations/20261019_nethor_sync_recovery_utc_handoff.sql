-- Rétablissement NethorSync : audit cloud UTC et relais après contrôle PC réussi.
-- Aucun fichier Excel ni planning publié n'est modifié par cette migration.
begin;
do $patch$
declare
  v_src text;
  v_next text;
begin
  v_src := pg_get_functiondef('private.nethor_sync_cloud_audit(boolean)'::regprocedure);
  if position('v_local timestamp := clock_timestamp() at time zone ''Europe/Paris'';' in v_src)=0
     or position('outside_paris_four_hour_slot' in v_src)=0 then
    raise exception 'Cloud audit source unexpected; refusing unsafe update';
  end if;
  v_next := replace(v_src,
    'v_local timestamp := clock_timestamp() at time zone ''Europe/Paris'';',
    'v_local timestamp := clock_timestamp() at time zone ''UTC'';');
  v_next := replace(v_next,
    'outside_paris_four_hour_slot','outside_utc_four_hour_slot');
  execute v_next;

  v_src := pg_get_functiondef('public.nethor_sync_public_status()'::regprocedure);
  if position('v_local timestamp := now() at time zone ''Europe/Paris'';' in v_src)=0
     or position('''controlTimezone'',''Europe/Paris''' in v_src)=0
     or position('''nextControlAt'',v_next at time zone ''Europe/Paris''' in v_src)=0 then
    raise exception 'Cloud status source unexpected; refusing unsafe update';
  end if;
  v_next := replace(v_src,
    'v_local timestamp := now() at time zone ''Europe/Paris'';',
    'v_local timestamp := now() at time zone ''UTC'';');
  v_next := replace(v_next,
    '''controlTimezone'',''Europe/Paris''',
    '''controlTimezone'',''UTC''');
  v_next := replace(v_next,
    '''nextControlAt'',v_next at time zone ''Europe/Paris''',
    '''nextControlAt'',v_next at time zone ''UTC''');
  execute v_next;
end
$patch$;

-- PG cron est configuré en GMT dans ce projet (= UTC).
select cron.schedule('nethor-sync-cloud-audit-four-hours',
                     '0 */4 * * *',
                     'select private.nethor_sync_cloud_audit(false);');

-- Le relais manuel conserve son déclencheur existant. Pour le contrôle PC
-- programmé, relire immédiatement le stockage APRÈS un résultat confirmé.
-- Les erreurs réseau de l'audit ne doivent jamais invalider le rapport PC.
create or replace function private.nethor_sync_scheduled_after_report()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.singleton_id <> 1 or new.device_id is null
     or new.last_check_at is not distinct from old.last_check_at
     or new.last_result not in ('unchanged','transferred','no_files')
     or new.acknowledged_manual is distinct from old.acknowledged_manual
  then return new; end if;
  begin
    perform private.nethor_sync_cloud_audit(true);
  exception when others then
    -- Le cron de 4 h et la lecture chaque minute poursuivent la reprise.
    null;
  end;
  return new;
end
$fn$;
revoke all on function private.nethor_sync_scheduled_after_report()
  from public,anon,authenticated;
drop trigger if exists nethor_sync_scheduled_report_audit on public.nethor_sync_binding;
create trigger nethor_sync_scheduled_report_audit
after update of last_check_at on public.nethor_sync_binding
for each row execute function private.nethor_sync_scheduled_after_report();
commit;
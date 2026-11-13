-- NETHOR 2 — permissions des wrappers RPC de l'éditeur.
-- Les fonctions privées valident elles-mêmes la session et le rôle Administrateur.
-- anon et public restent sans droit d'exécution.
revoke all on function private.planning_save_week_if_revision(
  date,timestamptz,jsonb,jsonb,text,text,text,timestamptz
) from public,anon;
grant execute on function private.planning_save_week_if_revision(
  date,timestamptz,jsonb,jsonb,text,text,text,timestamptz
) to authenticated;

revoke all on function private.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) from public,anon;
grant execute on function private.planning_admin_save_week(
  date,timestamptz,jsonb,jsonb,boolean
) to authenticated;

revoke all on function private.planning_admin_set_week_lock(
  date,timestamptz,boolean
) from public,anon;
grant execute on function private.planning_admin_set_week_lock(
  date,timestamptz,boolean
) to authenticated;

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSyncHistoricalImport} from '../src/ui/nethor-sync-overview.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261021_nethor_sync_historical_initial_import.sql');
const progress=read('supabase/migrations/20261021_nethor_sync_historical_progress.sql');

test('Créer les archives uniquement en cas de semaine absente',()=>{
 assert.match(migration,/if not found then[\s\S]*?insert into public\.planning_weeks/);
 assert.match(migration,/on conflict \(week_start\) do nothing/);
 assert.match(migration,/elsif j\.missing_week_only then/);
 assert.match(migration,/Semaine déjà publiée : import historique sans écrasement/);
 assert.match(migration,/v_filename_week is distinct from v_week/);
 assert.match(migration,/v_week < date '2020-01-01'/);
 assert.match(migration,/\+70 then/);
});
test('Conserver les protections de sécurité et le parseur des couleurs',()=>{
 assert.match(migration,/auth\.role\(\) is distinct from 'service_role'/);
 assert.match(migration,/o\.owner_id=b\.registered_by::text/);
 assert.match(migration,/o\.bucket_id='planning-files'/);
 assert.match(migration,/v_color not in/);
 assert.match(migration,/j\.storage_owner/);
 assert.match(migration,/private\.nethor_sync_auto_dispatch/);
});
test('La boucle autonome et l audit Supabase contrôlent les nouveaux plannings',()=>{
 assert.match(migration,/private\.nethor_sync_queue_missing_weeks\(12,null\)/);
 assert.match(migration,/private\.nethor_sync_queue_missing_weeks\(24,v_id\)/);
 assert.match(migration,/j\.detail='Aucune semaine de référence déjà publiée'/);
 assert.match(progress,/private\.session_is_active\(\)/);
 assert.match(progress,/p\.role in \('admin','role_point-de-vente'\)/);
});
test('L interface affiche les archives sans confondre transfert et publication',()=>{
 const html=renderSyncHistoricalImport({historicalImport:{
   mode:'historical_and_future',imported:13,pending:8,rejected:3,skipped:4,analyzed:28,
   years:[{year:2025,weeks:13}]
 }});
 assert.match(html,/13<\/strong> semaines créées/);
 assert.match(html,/3<\/strong> fichiers à contrôler/);
 assert.match(html,/2025 : 13 sem/);
 assert.match(html,/semaines fiables sont créées automatiquement/);
 assert.equal(renderSyncHistoricalImport({}), '');
});

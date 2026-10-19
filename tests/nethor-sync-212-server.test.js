import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pickup=read('supabase/migrations/20261019_nethor_sync_storage_ingest.sql');
const publish=read('supabase/migrations/20261019_nethor_sync_storage_publish_rpc.sql');
const worker=read('supabase/functions/nethor-sync-auto-publish/index.ts');

test('NethorSync 2.1.2 : capter les fichiers depuis Supabase sans installer une nouvelle version',()=>{
 assert.match(pickup,/storage\.objects/);
 assert.match(pickup,/private\.nethor_sync_auto_storage_settings/);
 assert.match(pickup,/o\.created_at>settings\.enabled_at/);
 assert.match(pickup,/nethor-sync-storage-ingest/);
 assert.match(pickup,/cron\.schedule/);
 assert.match(pickup,/o\.owner_id=b\.registered_by::text/);
 assert.match(pickup,/storage\.objects o/);
 assert.match(pickup,/not exists\(select 1 from private\.nethor_sync_auto_jobs/);
 assert.doesNotMatch(pickup,/update\s+public\.planning_weeks/i);
});

test('Sécuriser la publication : seuls les modèles vérifiés mettent à jour planning_weeks',()=>{
 assert.match(worker,/crypto\.subtle\.digest\("SHA-256"/);
 assert.match(worker,/parsePlanningWorkbook/);
 assert.match(worker,/resolveExcelColor/);
 assert.match(worker,/sourceKind==="storage"\s*\?\s*\{sourceUploadedAt:uploadedAt\}/);
 assert.match(publish,/auth\.role\(\) is distinct from 'service_role'/);
 assert.match(publish,/v_week < date_trunc\('week'/);
 assert.match(publish,/w\.source_file/);
 assert.match(publish,/w\.data->>'sourceUploadedAt'/);
 assert.match(publish,/w\.updated_at > v_uploaded_at/);
 assert.match(publish,/j\.dry_run/);
 assert.match(publish,/update public\.planning_weeks/);
 assert.match(publish,/w\.source_path/);
});

test('Les gestionnaires distinguent une archive transférée et une semaine effectivement publiée',()=>{
 const overview=read('src/ui/nethor-sync-overview.js');
 const rpc=read('src/data/nethor-sync-control.js');
 assert.match(overview,/Planning publié pour toute l’équipe/);
 assert.match(overview,/Fichier Excel refusé/);
 assert.match(overview,/sans réinstallation de NethorSync 2\.1\.2/);
 assert.match(rpc,/nethor_sync_auto_publications/);
 assert.match(publish,/left join private\.nethor_sync_file_changes/);
 assert.match(publish,/coalesce\(j\.storage_name,c\.file_name\)/);
});

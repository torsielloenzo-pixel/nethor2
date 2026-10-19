import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderManualSyncPipeline} from '../src/ui/nethor-sync-ui.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Une demande en erreur Windows ne peut plus rester seulement "demandée"',()=>{
 const html=renderManualSyncPipeline({manualStage:'pc_error',pendingManual:true});
 assert.match(html,/Demande manuelle enregistrée/);
 assert.match(html,/Échec du traitement Windows/);
 assert.match(html,/consulter le rapport NethorSync sur Windows/);
 assert.match(html,/data-step="error"/);
 assert.doesNotMatch(html,/Contrôle Supabase terminé/);
});
test('Le pipeline ne confirme le contrôle cloud qu’après le rapport Windows',()=>{
 const waiting=renderManualSyncPipeline({manualStage:'pc_contact',pendingManual:true});
 assert.match(waiting,/Poste en contact · traitement non terminé/);
 assert.match(waiting,/Après confirmation du poste/);
 const cloud=renderManualSyncPipeline({manualStage:'cloud_processing',manualPcCompletedAt:'2026-10-19T13:30:00Z',manualCloudCheckId:7});
 assert.match(cloud,/Fichiers vérifiés et transférés/);
 assert.match(cloud,/Contrôle Supabase en cours/);
 const done=renderManualSyncPipeline({manualStage:'done',manualPcCompletedAt:'2026-10-19T13:30:00Z',manualCloudCheckId:7,manualCloudProcessed:2});
 assert.match(done,/2 plannings publiés/);
 assert.match(done,/Contrôle Supabase terminé/);
 assert.equal(renderManualSyncPipeline({manualStage:'none'}),'');
});
test('Le SQL ne lance le cloud qu’après accusé réception, sans masquer les erreurs',()=>{
 const migration=read('supabase/migrations/20261019_nethor_sync_manual_pipeline.sql');
 const retry=read('supabase/migrations/20261019_nethor_sync_manual_pipeline_retry.sql');
 const filter=read('supabase/migrations/20261019_nethor_sync_filter_cloud_imports.sql');
 assert.match(migration,/new\.acknowledged_manual>old\.acknowledged_manual/);
 assert.match(migration,/new\.last_result in \('transferred','unchanged','no_files'\)/);
 assert.match(migration,/private\.nethor_sync_cloud_audit\(true\)/);
 assert.match(migration,/pc_result='error'/);
 assert.match(migration,/nethor_sync_request_manual/);
 assert.match(retry,/private\.nethor_sync_cloud_audit\(true\)/);
 assert.match(retry,/nethor-sync-manual-cloud-handoff/);
 assert.match(filter,/join public\.planning_weeks w/);
 assert.match(filter,/w\.week_start >= date_trunc/);
 assert.match(filter,/and o\.created_at>w\.updated_at/);
});

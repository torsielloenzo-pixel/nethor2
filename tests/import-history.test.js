import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeImportHistory,renderImportHistory,formatHistoryDate} from '../src/ui/import-history.js';
import {readSyncFileChanges} from '../src/data/nethor-sync-control.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('historique unique: conserve manuels, sync et leur chronologie',()=>{
 const manual=[{id:4,file_name:'Manuel.xls',imported_at:'2026-10-19T09:00:00Z',storage_path:'nethor2/a.xls'}];
 const sync=[{id:5,fileName:'PLANNING 12.10.26 SEMAINE C.xls',occurredAt:'2026-10-19T11:00:00Z',kind:'replaced'}];
 const rows=mergeImportHistory(manual,sync);
 assert.deepEqual(rows.map(r=>r.source),['sync','manual']);
 assert.equal(rows[1].storage_path,manual[0].storage_path);
 assert.equal(rows[0].fileName,sync[0].fileName);
});
test('remplacement: mêmes noms possibles, dates ancien et nouveau affichées distinctement',()=>{
 const rows=[{source:'sync',id:1,kind:'replaced',occurredAt:'2026-10-19T12:00:00Z',
  fileName:'PLANNING 12.10.26 SEMAINE C',previousFileName:'PLANNING 12.10.26 SEMAINE C',
  previousModifiedAt:'2026-10-08T06:50:00Z',modifiedAt:'2026-10-14T06:50:00Z'}];
 const html=renderImportHistory(rows);
 assert.match(html,/Version précédente/);
 assert.match(html,/Nouvelle version/);
 assert.match(html,/08\/10\/2026/);
 assert.match(html,/14\/10\/2026/);
 assert.equal((html.match(/PLANNING 12.10.26 SEMAINE C/g)||[]).length,2);
 assert.match(html,/NethorSync/);
 assert.match(html,/Publication automatique seulement si/);
});
test('archives manuelles: téléchargement préservé, aucun bouton sync illégitime',()=>{
 const rows=mergeImportHistory([{id:1,file_name:'PLANNING.xls',imported_at:'2026-10-18T14:00:00Z',
   imported_by_name:'Test',week_start:'2026-10-12',storage_path:'nethor2/history.xls'}],
   [{id:2,kind:'added',occurredAt:'2026-10-19T14:00:00Z',fileName:'test.xls',modifiedAt:null}]);
 const html=renderImportHistory(rows);
 assert.match(html,/Import manuel/);
 assert.match(html,/data-download="nethor2\/history.xls"/);
 assert.equal((html.match(/data-download=/g)||[]).length,1);
 assert.match(html,/Date de modification inconnue/);
 assert.equal(formatHistoryDate(null),'Date de modification inconnue');
 assert.equal(formatHistoryDate('2026-10-08T06:50:00Z'),'08/10/2026 08:50');
});
test('aucun nom malveillant ne s’injecte dans les événements',()=>{
 const html=renderImportHistory([{source:'sync',id:1,kind:'replaced',fileName:'<script>alert(1)</script>',
  previousFileName:'x" onclick="alert(1)',occurredAt:'2026-10-19T12:00:00Z'}]);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/onclick="/);
});
test('lecture historique détaillé: RPC admin dédiée, paramètres bornés',async()=>{
 let called=null;
 const client={rpc:async(name,args)=>{called=[name,args];return {data:[{id:1}],error:null};}};
 const result=await readSyncFileChanges(client,{limit:150});
 assert.equal(result.length,1);
 assert.deepEqual(called,['nethor_sync_file_history',{p_limit:150}]);
 await assert.rejects(readSyncFileChanges(client,{limit:501}),/Limite invalide/);
});
test('branchement complet: historisation de l’agent, RPC et service worker PWA',()=>{
 const agent=read('tools/nethor-sync/NethorSync.ps1');
 assert.match(agent,/nethor_sync_record_file_changes/);
 assert.match(agent,/previousModifiedUtc/);
 assert.match(agent,/modifiedUtc/);
 assert.match(agent,/previousSha256/);
 assert.match(agent,/Select-Object -Skip \$offset -First 100/);
 const sql=read('supabase/migrations/20261019_nethor_sync_file_change_history.sql');
 assert.match(sql,/private\.nethor_sync_file_changes/);
 assert.match(sql,/NETHOR_SYNC_DEVICE_REVOKED/);
 assert.match(sql,/p\.role='admin'/);
 const live=read('src/ui/live.js');
 assert.match(live,/mergeImportHistory/);
 assert.match(live,/renderImportHistory\(state\.history\)/);
 assert.match(live,/x\.source==='manual'&&x\.storage_path===path/);
 const sw=read('sw.js'),build=read('.github/workflows/preview-pages.yml'),dev=read('scripts/dev-server.js');
 for(const item of [sw,build,dev])assert.match(item,/import-history\.js/);
 assert.match(sw,/nethor-mobile-drawer-recovery-sync-v22/);
});

test('Une publication NethorSync est distinguée de l’import manuel dans l’historique',()=>{
 const rows=mergeImportHistory([{id:99,file_name:'PLANNING.xls',storage_path:'sync-inbox/sha-PLANNING.xls',
  week_start:'2026-10-19',imported_at:'2026-10-19T15:00:00Z',imported_by_name:'Compte maître'}],[]);
 assert.equal(rows[0].source,'auto');
 const html=renderImportHistory(rows);
 assert.match(html,/NethorSync · Publication/);
 assert.doesNotMatch(html,/Import manuel/);
 assert.match(html,/data-download=/);
});

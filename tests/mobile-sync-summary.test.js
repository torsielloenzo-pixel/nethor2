import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readMobileSyncSummary,readStaffSyncStatus,readLatestPublishedPlanning} from '../src/data/mobile-sync-summary.js';
import {formatPublicSyncTime,formatPublishedWeek,mobileSyncState,renderMobileSyncSummary} from '../src/ui/mobile-sync-summary.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

function client({planning={week_start:'2026-10-19',updated_at:'2026-10-18T23:24:55Z'},status={installed:true,lastSeenAt:'2026-10-19T02:00:00Z',lastCheckAt:'2026-10-19T01:55:00Z',lastTransferAt:'2026-10-18T23:10:00Z'},planError=null,syncError=null}={}){
 const operations=[];
 const obj={
  from(name){operations.push('from:'+name);return {
   select(cols){operations.push('select:'+cols);return this;},
   order(field,opts){operations.push('order:'+field+':'+opts.ascending);return this;},
   limit(n){operations.push('limit:'+n);return this;},
   async maybeSingle(){return {data:planning,error:planError};}
  };},
  async rpc(name){operations.push('rpc:'+name);return {data:status,error:syncError};}
 };
 return {obj,operations};
}
test('la date du planning vient de la publication et non du dernier transfert',async()=>{
 const {obj,operations}=client();
 const result=await readMobileSyncSummary(obj);
 assert.equal(result.loaded,true);
 assert.equal(result.planning.weekStart,'2026-10-19');
 assert.equal(result.planning.publishedAt,'2026-10-18T23:24:55Z');
 assert.equal(result.sync.lastTransferAt,'2026-10-18T23:10:00Z');
 assert.ok(operations.includes('from:planning_weeks'));
 assert.ok(operations.includes('select:week_start,updated_at'));
 assert.ok(operations.includes('order:updated_at:false'));
 assert.ok(operations.includes('limit:1'));
 assert.ok(operations.includes('rpc:nethor_sync_public_status'));
 assert.equal(operations.includes('rpc:nethor_sync_status'),false);
});
test('un échec de synchronisation ne masque pas la date de publication, et inversement',async()=>{
 const first=await readMobileSyncSummary(client({syncError:{message:'no access'}}).obj);
 assert.equal(first.syncError,true);assert.ok(first.planning);
 const second=await readMobileSyncSummary(client({planError:{message:'failure'}}).obj);
 assert.equal(second.planningError,true);assert.ok(second.sync);
 assert.equal((await readLatestPublishedPlanning(client({planning:null}).obj)),null);
 await assert.rejects(readStaffSyncStatus(client({status:null}).obj),/invalide/);
});
test('l’écran donne des dates en heure française et n’invente rien si manquant',()=>{
 assert.equal(formatPublicSyncTime('2026-10-19T01:00:00Z').time,'03:00');
 assert.match(formatPublishedWeek('2026-10-19'),/19 oct/);
 assert.equal(formatPublishedWeek('invalid'),'Semaine non renseignée');
 assert.equal(formatPublicSyncTime(undefined).date,'—');
 assert.match(renderMobileSyncSummary({loaded:true,planning:null,sync:{installed:false}}),/Aucun planning publié/);
 assert.match(renderMobileSyncSummary({loaded:true,planningError:true,syncError:true}),/Indisponible/);
});
test('NethorSync n’affiche aucune information interne du poste ni commande admin',()=>{
 const snapshot={loaded:true,checkedAt:Date.now(),planning:{weekStart:'2026-10-19',publishedAt:'2026-10-19T01:00:00Z'},
  sync:{installed:true,lastSeenAt:'2026-10-19T01:00:00Z',lastCheckAt:'2026-10-19T00:00:00Z',lastTransferAt:null}};
 const html=renderMobileSyncSummary(snapshot,Date.parse('2026-10-19T01:04:00Z'));
 for(const part of ['NethorSync','DERNIÈRE PUBLICATION DU PLANNING','Dernier contrôle','Dernier transfert','Informations vérifiées','data-action="nethor-sync-mobile-refresh"'])
  assert.ok(html.includes(part),part);
 for(const forbidden of ['nethor-sync-install','sync-reset-device','registeredBy','deviceLabel','deviceId','generation','sourceFile'])
  assert.equal(html.includes(forbidden),false,forbidden);
 assert.match(html,/data-state="online"/);
 assert.equal(mobileSyncState(snapshot,Date.parse('2026-10-19T02:04:00Z')),'offline');
 assert.equal(mobileSyncState({...snapshot,syncError:true}),'unknown');
});
test('la page Alertes est NethorSync seulement sur mobile et le scroll est bloqué',()=>{
 const js=read('src/ui/live.js'),css=read('mobile.css');
 assert.match(js,/anomalies:'NethorSync'/);
 assert.match(js,/if\(smallScreen\(\)\)return renderMobileSyncSummary\(state\.mobileSync\);/);
 assert.match(js,/return renderPageHeader\('ANALYSE','Points à vérifier'/);
 assert.match(js,/ROOT\.classList\.toggle\('mobile-sync-active',state\.page==='anomalies'&&smallScreen\(\)\)/);
 assert.match(read('src/ui/mobile-sync-summary.js'),/data-action="nethor-sync-mobile-refresh"/);
 const start=css.indexOf('/* NethorSync public : écran unique Mobile/PWA Mobile sans défilement.');
 assert.ok(start>0);
 const rule=css.slice(start);
 assert.match(rule,/@media\(max-width:760px\)/);
 assert.match(rule,/body:has\(#app\.mobile-sync-active\)\{height:100dvh;overflow:hidden/);
 assert.match(rule,/#app\.mobile-sync-active main#screen\{/);
 assert.match(rule,/overflow:hidden;overscroll-behavior:none/);
 assert.match(rule,/grid-template-rows:auto minmax\(0,1\.05fr\) auto minmax\(0,1\.25fr\) auto/);
 assert.doesNotMatch(rule,/overflow-y:auto/);
 const workflow=read('.github/workflows/preview-pages.yml'),sw=read('sw.js');
 for(const item of [workflow,sw])for(const file of ['mobile-sync-summary.js'])assert.ok(item.includes(file));
 assert.match(sw,/nethor-mobile-drawer-recovery-sync-v\d+/);
});

test('Horaires fixes 00/04/08/12/16/20 et prochaine demande visibles dans Mobile et PWA',async()=>{
 const status={
  installed:true,lastSeenAt:'2026-10-19T04:40:10Z',lastCheckAt:'2026-10-19T03:35:12Z',
  lastTransferAt:'2026-10-19T03:35:12Z',lastResult:'transferred',
  controlIntervalHours:4,
  controlLocalHours:['00:00','04:00','08:00','12:00','16:00','20:00'],
  nextControlAt:'2026-10-19T06:00:00Z',
  lastRequestedAt:'2026-10-19T04:40:00Z',
  lastRequestedKind:'immediate',lastRequestStatus:'pending',controlPending:true
 };
 const result=await readMobileSyncSummary(client({status}).obj);
 assert.equal(result.sync.controlIntervalHours,4);
 assert.deepEqual(result.sync.controlLocalHours,status.controlLocalHours);
 assert.equal(result.sync.lastRequestStatus,'pending');
 const html=renderMobileSyncSummary(result,Date.parse('2026-10-19T04:40:20Z'));
 for(const label of ['CONTRÔLE PROGRAMMÉ','TOUTES LES 4 H','00:00','04:00','08:00',
 '12:00','16:00','20:00','Prochain contrôle','Dernière demande',
 'Dernier contrôle effectué','Dernier transfert Excel','En attente du MSI','À la demande',
 'Fichiers transférés']){
  assert.ok(html.includes(label),label);
 }
 assert.match(html,/data-request="pending"/);
 assert.match(html,/08:00/);
 for(const forbidden of ['deviceLabel','deviceId','generation','storagePath','registeredBy']){
  assert.ok(!html.includes(forbidden));
 }
 const complete=renderMobileSyncSummary({loaded:true,sync:{...result.sync,lastRequestStatus:'completed'}});
 assert.match(complete,/Exécutée sur le MSI/);
 const fail=renderMobileSyncSummary({loaded:true,sync:{...result.sync,lastRequestStatus:'error',lastResult:'error'}});
 assert.match(fail,/Échec du dernier contrôle/);
});
test('programmation serveur heure de Paris, même après changement heure hiver/été',()=>{
 const sql=read('supabase/migrations/20261019_nethor_sync_four_hour_controls.sql');
 assert.match(sql,/time zone 'Europe\/Paris'/);
 assert.match(sql,/mod\(extract\(hour from v_local\)::integer,4\)<>0/);
 assert.match(sql,/nethor-sync-four-hour-control/);
 assert.match(sql,/select private\.nethor_sync_control_tick\('scheduled'\)/);
 assert.match(sql,/v_binding\.pending_manual>v_binding\.acknowledged_manual/);
 assert.match(sql,/private\.can_module\(caller_id,'planning','view'\)/);
 assert.match(sql,/lastRequestStatus/);
 assert.doesNotMatch(sql,/update\s+public\.planning_weeks/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageSync,readSyncStatus,requestManualSync,resetSyncDevice,setSyncMode,syncHealth} from '../src/data/nethor-sync-control.js';
test('sync réservé aux administrateurs et points de vente',()=>{
 assert.equal(canManageSync('admin'),true);
 assert.equal(canManageSync('role_point-de-vente'),true);
 for(const role of ['employe','responsable',null,'guest'])assert.equal(canManageSync(role),false);
});
test('ne revendique pas une installation hors ligne comme opérationnelle',()=>{
 assert.equal(syncHealth({installed:false}),'not-configured');
 assert.equal(syncHealth({installed:true}),'not-seen');
 const now=Date.parse('2026-10-19T19:00:00Z');
 assert.equal(syncHealth({installed:true,lastSeenAt:'2026-10-19T18:59:00Z'},now),'online');
 assert.equal(syncHealth({installed:true,lastSeenAt:'2026-10-18T18:00:00Z'},now),'offline');
});
test('appels RPC distincts : statut, demande, changement de mode, révocation',async()=>{
 const seen=[];const client={rpc:async(name,params)=>{seen.push([name,params]);return {data:{ok:true},error:null};}};
 await readSyncStatus(client);await requestManualSync(client);await setSyncMode(client,'manual');await resetSyncDevice(client,2);
 assert.deepEqual(seen.map(x=>x[0]),['nethor_sync_status','nethor_sync_request_manual','nethor_sync_set_mode','nethor_sync_reset']);
 assert.deepEqual(seen[3][1],{p_expected_generation:2});
 await assert.rejects(()=>setSyncMode(client,'other'),/Mode invalide/);
 await assert.rejects(()=>resetSyncDevice(client,0),/Generation invalide/);
});

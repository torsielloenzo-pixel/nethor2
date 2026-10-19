import test from 'node:test';
import assert from 'node:assert/strict';
import {importSyncHealth,renderImportSyncGuide,confirmImportManually} from '../src/ui/nethor-sync-import-guide.js';

const NOW=Date.parse('2026-10-19T20:00:00Z');

test('statut guide : distinguer le poste connecté, hors ligne et non configuré',()=>{
  assert.equal(importSyncHealth({loaded:false,loading:true},NOW),'loading');
  assert.equal(importSyncHealth({loaded:false,error:'RPC indisponible'},NOW),'error');
  assert.equal(importSyncHealth({loaded:true,status:{installed:false}},NOW),'not-configured');
  assert.equal(importSyncHealth({loaded:true,status:{installed:true,lastSeenAt:'2026-10-19T19:50:00Z'}},NOW),'online');
  assert.equal(importSyncHealth({loaded:true,status:{installed:true,lastSeenAt:'2026-10-19T18:50:00Z'}},NOW),'offline');
});

test('guide NethorSync accessible et informations du poste échappées',()=>{
  const html=renderImportSyncGuide({
    loaded:true,status:{installed:true,lastSeenAt:'2026-10-19T19:50:00Z',deviceLabel:'PC <script>alert(1)</script>'}
  },NOW);
  assert.match(html,/NethorSync, comment ça marche/);
  assert.match(html,/quatre étapes de NethorSync/);
  assert.match(html,/Supabase/);
  assert.match(html,/data-state="online"/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/00 h, 04 h, 08 h, 12 h, 16 h et 20 h UTC/);
});

test('échec de lecture RPC : le guide ne prétend pas que NethorSync est actif',()=>{
  const html=renderImportSyncGuide({loaded:false,error:'RPC indisponible'},NOW);
  assert.match(html,/État indisponible/);
  assert.match(html,/Impossible de vérifier/);
  assert.doesNotMatch(html,/data-state="online"/);
});

test('sans navigateur, confirmation refusée par défaut',async()=>{
  const accepted=await confirmImportManually({health:'online',weekLabel:'19 octobre 2026',fileName:'planning.xls'});
  assert.equal(accepted,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {incomingOriginalName,listIncomingPlannings,downloadIncomingPlanning} from '../src/data/sync-inbox.js';
const name='a'.repeat(64)+'-Planning_S42.xls';
test('nom de fichier avec empreinte: accepte xls, refuse traversal',()=>{
  assert.equal(incomingOriginalName(name),'Planning_S42.xls');
  assert.equal(incomingOriginalName('sync-inbox/'+name),null);
  assert.equal(incomingOriginalName('a'.repeat(64)+'-../../../secret.xls'),null);
  assert.equal(incomingOriginalName('a'.repeat(64)+'-planning.pdf'),null);
});
test('liste uniquement les fichiers Excel valides de la boite de reception',async()=>{
  const storage={from(bucket){assert.equal(bucket,'planning-files');return this;},async list(folder,opts){
    assert.equal(folder,'sync-inbox');assert.equal(opts.offset,0);
    return {data:[{id:'1',name,metadata:{size:1024},created_at:'2026-10-19'},{id:null,name:'folder',metadata:null},{id:'2',name:'wrong.txt',metadata:{size:3}}],error:null};
  }};
  assert.deepEqual(await listIncomingPlannings({storage}),[{name,originalName:'Planning_S42.xls',size:1024,createdAt:'2026-10-19'}]);
});
test('telechargement exige un chemin controle',async()=>{
  await assert.rejects(()=>downloadIncomingPlanning({},'../bad.xls'),/invalide/);
});

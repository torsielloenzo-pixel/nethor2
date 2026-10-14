import test from 'node:test';
import assert from 'node:assert/strict';
import { linkPlanningEmployees } from '../src/domain/employee-linker.js';
test('associe uniquement les alias explicites', () => {
  const result = linkPlanningEmployees([{name:'Clément'},{name:'Kenza'}],
    [{id:'u1',account_enabled:true}], [{planningName:'Clement',userId:'u1'}]);
  assert.deepEqual(result.map(x=>x.status),['linked','unlinked']);
});
test('signale les alias ambigus',()=>{
 const result=linkPlanningEmployees([{name:'Gwen'}],[{id:'a'},{id:'b'}],
 [{planningName:'Gwen',userId:'a'},{planningName:'Gwen',userId:'b'}]);
 assert.equal(result[0].status,'ambiguous');
});
test('signale un profil désactivé',()=>{
 const result=linkPlanningEmployees([{name:'Gwen'}],[{id:'a',account_enabled:false}],
 [{planningName:'Gwen',userId:'a'}]);
 assert.equal(result[0].status,'disabled');
});

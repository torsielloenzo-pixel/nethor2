import test from 'node:test';
import assert from 'node:assert/strict';
import {personalEmployeeIndices,personalDay,personalOverview} from '../src/domain/personal-overview.js';
const start='2026-11-02',date='2026-11-02';
function model(){
 const row=()=>Array(8).fill('');
 const enzo=row();enzo[0]='g';enzo[1]='g';
 const enzoL=row();enzoL[4]='b';enzoL[5]='b';
 const other=row();other[2]='g';
 return {weekStart:start,employees:[{name:'Enzo'},{name:'Enzo L'},{name:'Autre'}],slotMinutes:15,startTime:6,
  days:{[date]:{cells:[enzo,enzoL,other]}}};
}
test('deux alias manuels d’un compte sont réunis sans inclure un autre salarié',()=>{
 const p={display_name:'Enzo',planning_name:'Enzo L',planning_aliases:['Enzo','Enzo L']};
 assert.deepEqual(personalEmployeeIndices(model(),p),[0,1]);
 const d=personalDay(model(),p,date);
 assert.equal(d.kind,'work');assert.equal(d.hours,1);
 assert.deepEqual(d.ranges,[{start:360,end:390},{start:420,end:450}]);
});
test('un alias retiré ne sélectionne plus le collaborateur correspondant',()=>{
 const p={display_name:'Utilisateur',planning_name:null,planning_aliases:['Enzo L']};
 assert.deepEqual(personalEmployeeIndices(model(),p),[1]);
 assert.equal(personalDay(model(),p,date).hours,0.5);
});
test('un renommage non associé ne déclenche aucune fusion automatique',()=>{
 const p={display_name:'Personne inconnue',planning_name:null,planning_aliases:[]};
 assert.deepEqual(personalEmployeeIndices(model(),p),[]);
 assert.equal(personalDay(model(),p,date).kind,'unlinked');
});

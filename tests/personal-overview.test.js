import test from 'node:test';
import assert from 'node:assert/strict';
import {dateInParis,moveDate,mondayFor,personalEmployeeIndex,personalDay,personalOverview} from '../src/domain/personal-overview.js';
const NAME={planning_name:'Test Salarié',display_name:'Autre nom'};
const work=()=>Array.from({length:58},(_,i)=>i<12?'g':null);
const status=code=>Array.from({length:58},()=>code);
function week(monday,days){
  const data={};
  for(let i=0;i<7;i++){
    const day=moveDate(monday,i);
    data[day]={cells:[days[day]||status(null)]};
  }
  return {week_start:monday,data:{weekStart:monday,startTime:6,slotMinutes:15,employees:[{name:'Test Salarié'}],days:data}};
}
test('horaires personnels et repos sans confusion avec un congé jaune',()=>{
  const w=week('2026-10-19',{
    '2026-10-19':work(),
    '2026-10-20':status('r'),
    '2026-10-21':status('y'),
    '2026-10-22':work()
  });
  const r=personalOverview([w],NAME,[],'2026-10-19');
  assert.equal(r.days[0].kind,'work');
  assert.deepEqual(r.days[0].ranges,[{start:360,end:540}]);
  assert.equal(r.hours,6);
  assert.equal(r.nextRest,'2026-10-20');
  assert.deepEqual(r.nextLeave,{start:'2026-10-21',end:'2026-10-21',status:'planned'});
});
test('un congé approuvé par le serveur est bien étiqueté validé',()=>{
  const w=week('2026-10-19',{'2026-10-21':status('y'),'2026-10-22':status('y')});
  const requests=[{type:'leave',start_date:'2026-10-21',end_date:'2026-10-22',status:'approved'}];
  const r=personalOverview([w],NAME,requests,'2026-10-19');
  assert.deepEqual(r.nextLeave,{start:'2026-10-21',end:'2026-10-22',status:'approved'});
});
test('une demande en attente reste en attente, sans validation inventée',()=>{
  const w=week('2026-10-19',{});
  const requests=[{type:'leave',start_date:'2026-11-05',end_date:'2026-11-10',status:'pending'}];
  const r=personalOverview([w],NAME,requests,'2026-10-19');
  assert.deepEqual(r.nextLeave,{start:'2026-11-05',end:'2026-11-10',status:'pending'});
});
test('un refus ne devient pas un futur congé',()=>{
  const r=personalOverview([week('2026-10-19',{})],NAME,[{type:'leave',start_date:'2026-11-05',end_date:'2026-11-10',status:'rejected'}],'2026-10-19');
  assert.equal(r.nextLeave,null);
});
test('traversée de semaine, jour civil Paris et changement d heure',()=>{
  assert.equal(moveDate('2026-10-25',1),'2026-10-26');
  assert.equal(mondayFor('2026-10-25'),'2026-10-19');
  assert.equal(dateInParis(new Date('2026-10-25T01:30:00Z')),'2026-10-25');
  const next=week('2026-10-26',{'2026-10-26':work()});
  const previous=week('2026-10-19',{'2026-10-25':status('y')});
  const r=personalOverview([previous,next],NAME,[],'2026-10-25');
  assert.equal(r.days[1].kind,'work');
});
test('ne jamais attribuer la ligne d un autre salarié à un compte non lié',()=>{
  const w=week('2026-10-19',{'2026-10-19':work()});
  assert.equal(personalEmployeeIndex(w.data,{planning_name:'Autre salarié',display_name:'Test Salarié'}),-1);
  assert.equal(personalDay(w.data,{planning_name:'Autre salarié'},'2026-10-19').kind,'unlinked');
  const r=personalOverview([w],{planning_name:'Autre salarié'},[],'2026-10-19');
  assert.equal(r.hours,0);
  assert.equal(r.nextLeave,null);
});
test('aucun planning publié ne devient jamais un faux jour de repos',()=>{
  const r=personalOverview([],NAME,[],'2026-10-19');
  assert.equal(r.days[0].kind,'unknown');
  assert.equal(r.nextRest,null);
  assert.equal(r.nextLeave,null);
});

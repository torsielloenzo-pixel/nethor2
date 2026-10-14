import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImportPreview} from '../src/import/import-preview.js';
function model(){
 const start='2026-10-12';
 const dates=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,9,12+i)).toISOString().slice(0,10));
 return {weekStart:start,startTime:6,slotMinutes:15,slotCount:58,employees:[{name:'Clément'}],
 days:Object.fromEntries(dates.map((date,i)=>[date,{cells:[Array.from({length:58},(_,j)=>i===0 && j<4?'g':null)]}]))};
}
test('affiche un aperçu sans publier et calcule une heure',()=>{
 const result=buildImportPreview(model(),{profiles:[{id:'u1',account_enabled:true}],aliases:[{planningName:'Clement',userId:'u1'}],contracts:{u1:35}});
 assert.equal(result.employeeCount,1);
 assert.equal(result.employees[0].hours,1);
 assert.equal(result.employees[0].differenceHours,-34);
 assert.equal(result.readyForPublish,false);
});
test('signale un compte sans association',()=>{
 const result=buildImportPreview(model());
 assert.ok(result.warnings.some(w=>w.code==='ACCOUNT_UNLINKED'));
});
test('rejette une grille incomplète',()=>{
 const m=model();m.days['2026-10-12'].cells[0]=['g'];
 assert.throws(()=>buildImportPreview(m),/Grille incohérente/);
});

test('signale créneau court et conflit avec absence approuvée',()=>{
 const m=model();
 m.days['2026-10-12'].cells[0]=Array.from({length:58},(_,j)=>j===0?'g':null);
 const result=buildImportPreview(m,{
   profiles:[{id:'u1',account_enabled:true}],
   aliases:[{planningName:'Clément',userId:'u1'}],
   approvedAbsences:{u1:['2026-10-12']}
 });
 assert.ok(result.warnings.some(w=>w.code==='SHORT_SHIFT'));
 assert.ok(result.warnings.some(w=>w.code==='ABSENCE_CONFLICT'));
 assert.equal(result.readyForPublish,false);
});
test('signale une longue coupure',()=>{
 const m=model();
 m.days['2026-10-12'].cells[0]=Array.from({length:58},(_,j)=>j===0||j===9?'g':null);
 const result=buildImportPreview(m);
 assert.ok(result.warnings.some(w=>w.code==='LONG_BREAK'));
});

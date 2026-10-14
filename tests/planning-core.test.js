import test from 'node:test';
import assert from 'node:assert/strict';
import { hoursForRow, rangesForRow, compareContractHours, analyzeEmployeeDay } from '../src/domain/planning-core.js';

test('additionne les créneaux g/b en quarts d’heure', () => {
  assert.equal(hoursForRow(['g','b','r','y','g']), 0.75);
});
test('calcule les intervalles disjoints sans perdre le dernier créneau', () => {
  assert.deepEqual(rangesForRow(['g','g','r','b'],360), [
    {startMinutes:360,endMinutes:390},
    {startMinutes:405,endMinutes:420}
  ]);
});
test('différence contrat avec arrondi à deux décimales', () => {
  assert.equal(compareContractHours(34.75,35),-0.25);
  assert.equal(compareContractHours(null,35),null);
});
test('détecte une plage courte et une absence approuvée conflictuelle', () => {
  const result = analyzeEmployeeDay({employeeId:'u1',cells:['g','r'],approvedAbsence:true});
  assert.deepEqual(result.issues.map(i=>i.code),['SHORT_SHIFT','ABSENCE_CONFLICT']);
});
test('détecte une coupure de deux heures', () => {
  const result = analyzeEmployeeDay({employeeId:'u1',cells:['g',...Array(8).fill('r'),'b']});
  assert.ok(result.issues.some(i=>i.code==='LONG_BREAK'));
});

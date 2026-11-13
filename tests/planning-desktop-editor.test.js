import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPlanningDayEdit,buildPlanningDayCells,clonePlanningModel,planningEditorSeed} from '../src/ui/planning-desktop-editor.js';

const model=()=>({
  version:4,weekStart:'2026-11-16',startTime:6,endTime:20.5,slotMinutes:15,slotCount:58,
  employees:[{name:'Enzo'}],
  days:Object.fromEntries(Array.from({length:7},(_,i)=>{
    const d=new Date('2026-11-16T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);
    return [d.toISOString().slice(0,10),{date:d.toISOString().slice(0,10),cells:[Array(58).fill('r')]}];
  }))
});

test('éditeur : construit une journée de travail avec deux plages sans changer la grille',()=>{
  const m=model();
  const row=buildPlanningDayCells(m,{status:'work',firstStart:'08:00',firstEnd:'14:00',secondStart:'16:00',secondEnd:'20:00'});
  assert.equal(row.length,58);
  assert.equal(row.filter(v=>v==='g').length,24);
  assert.equal(row.filter(v=>v==='b').length,16);
  assert.equal(row.filter(v=>v==='r').length,18);
});

test('éditeur : repos, congés et journée non planifiée utilisent les codes du modèle publié',()=>{
  const m=model();
  assert.ok(buildPlanningDayCells(m,{status:'rest'}).every(v=>v==='r'));
  assert.ok(buildPlanningDayCells(m,{status:'leave'}).every(v=>v==='y'));
  assert.ok(buildPlanningDayCells(m,{status:'empty'}).every(v=>v===null));
});

test('éditeur : refuse les chevauchements et les horaires hors grille',()=>{
  const m=model();
  assert.throws(()=>buildPlanningDayCells(m,{status:'work',firstStart:'08:00',firstEnd:'14:00',secondStart:'13:45',secondEnd:'16:00'}),/chevaucher/i);
  assert.throws(()=>buildPlanningDayCells(m,{status:'work',firstStart:'05:45',firstEnd:'10:00'}),/plage du planning/i);
  assert.throws(()=>buildPlanningDayCells(m,{status:'work',firstStart:'08:10',firstEnd:'10:00'}),/15 minutes/i);
});

test('éditeur : applique uniquement la journée ciblée au brouillon',()=>{
  const original=model();
  const draft=clonePlanningModel(original);
  applyPlanningDayEdit(draft,{employeeIndex:0,date:'2026-11-18',status:'leave'});
  assert.ok(draft.days['2026-11-18'].cells[0].every(v=>v==='y'));
  assert.ok(original.days['2026-11-18'].cells[0].every(v=>v==='r'));
  assert.equal(planningEditorSeed(draft,0,'2026-11-18').status,'leave');
});

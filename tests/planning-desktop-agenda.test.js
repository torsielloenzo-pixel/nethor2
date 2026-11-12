import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDesktopPlanningAgenda} from '../src/ui/planning-desktop-agenda.js';

const work=(tone,startIndex,endIndex)=>{
  const cells=Array(58).fill('r');
  for(let i=startIndex;i<endIndex;i++)cells[i]=tone;
  return cells;
};
const away=code=>Array(58).fill(code);
const people=[
  {name:'Enzo',total:31.5,days:[
    {cells:work('g',0,24),ranges:[{startMinutes:360,endMinutes:720}]},
    {cells:away('y'),ranges:[]},
    {cells:away('r'),ranges:[]},
    {cells:work('b',32,58),ranges:[{startMinutes:840,endMinutes:1230}]},
    {cells:away('r'),ranges:[]},
    {cells:away('r'),ranges:[]},
    {cells:away('r'),ranges:[]}
  ]},
  {name:'Clément',total:6,days:[
    {cells:work('g',0,24),ranges:[{startMinutes:360,endMinutes:720}]},
    ...Array.from({length:6},()=>({cells:away('r'),ranges:[]}))
  ]}
];
const common={
  model:{startTime:6,slotMinutes:15},people,week:'2026-11-09',day:'2026-11-12',
  sourceFile:'Planning semaine 46',canYear:true,
  renderPerson:p=>p.name,formatHours:n=>n+' h'
};

test('desktop semaine : sept journées, horaires publiés, repos et congés',()=>{
  const html=renderDesktopPlanningAgenda({...common,view:'week'});
  assert.match(html,/Semaine du/);
  assert.match(html,/data-day="2026-11-12"/);
  assert.match(html,/06:00–12:00/);
  assert.match(html,/14:00–20:30/);
  assert.match(html,/Congés/);
  assert.match(html,/Repos/);
  assert.match(html,/data-staff-person="Enzo"/);
  assert.match(html,/data-action="year-view"/);
});

test('desktop jour : frise chronologique et intervalles placés selon les heures',()=>{
  const html=renderDesktopPlanningAgenda({...common,view:'day'});
  assert.match(html,/Jeudi 12 novembre 2026/i);
  assert.match(html,/class="n2-agenda-bar" data-tone="afternoon"/);
  assert.match(html,/14:00–20:30/);
  assert.match(html,/style="left:/);
  assert.match(html,/data-action="agenda-next-day"/);
});

test('recherche : filtre les collaborateurs sans altérer les horaires',()=>{
  const html=renderDesktopPlanningAgenda({...common,view:'week',query:'enz'});
  assert.match(html,/data-staff-person="Enzo"/);
  assert.doesNotMatch(html,/data-staff-person="Clément"/);
  assert.match(html,/value="enz"/);
});

test('aucun planning publié : message explicite, sans faux horaires',()=>{
  const html=renderDesktopPlanningAgenda({...common,model:null,people:[]});
  assert.match(html,/Aucun planning publié/);
  assert.doesNotMatch(html,/n2-agenda-week-table/);
});

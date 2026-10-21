import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDesktopPlanningDay,renderDesktopPlanningDay,renderDesktopPlanningLegend} from '../src/ui/planning-desktop-colors.js';

test('matin et après-midi respectent les codes de créneaux, même sans interruption',()=>{
  const row=['g','g','b','b',null,'b'];
  assert.deepEqual(describeDesktopPlanningDay(row,360,15),{
    status:'work',shifts:[
      {tone:'morning',startMinutes:360,endMinutes:390},
      {tone:'afternoon',startMinutes:390,endMinutes:420},
      {tone:'afternoon',startMinutes:435,endMinutes:450}
    ]
  });
  const html=renderDesktopPlanningDay(row,360,15);
  assert.match(html,/data-tone="morning"/);
  assert.match(html,/06:00–06:30/);
  assert.match(html,/data-tone="afternoon"/);
  assert.match(html,/07:15–07:30/);
});
test('congés et repos sont bien distincts',()=>{
  assert.equal(describeDesktopPlanningDay(['y','y']).status,'leave');
  assert.match(renderDesktopPlanningDay(['y'],360,15),/Congés/);
  for(const marker of ['r','o']){
    assert.equal(describeDesktopPlanningDay([marker]).status,'rest');
    assert.match(renderDesktopPlanningDay([marker],360,15),/Repos/);
  }
});
test('indisponibilité et case vide ne deviennent pas Repos',()=>{
  assert.equal(describeDesktopPlanningDay(['w']).status,'unavailable');
  assert.equal(describeDesktopPlanningDay(['',null]).status,'empty');
  assert.equal(describeDesktopPlanningDay(undefined).status,'unknown');
  assert.doesNotMatch(renderDesktopPlanningDay(['w'],360,15),/Repos/);
  assert.doesNotMatch(renderDesktopPlanningDay([''],360,15),/Repos/);
});
test('le statut congé ne masque pas une plage réellement travaillée',()=>{
  assert.equal(describeDesktopPlanningDay(['y','g','y']).status,'work');
});
test('la légende contient uniquement les quatre catégories colorées demandées',()=>{
  const legend=renderDesktopPlanningLegend();
  for(const tone of ['morning','afternoon','leave','rest'])assert.match(legend,new RegExp('data-tone="'+tone+'"'));
  assert.doesNotMatch(legend,/data-tone="unavailable"/);
});

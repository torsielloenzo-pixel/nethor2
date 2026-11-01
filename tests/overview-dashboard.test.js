import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboardPeople,renderOverviewDashboard} from '../src/ui/overview-dashboard.js';
const days=(ranges=[])=>Array.from({length:7},(_,i)=>({ranges:i===5?ranges:[],cells:['r']}));
test('overview combines two explicit aliases linked to one account',()=>{
 const rows=[
  {name:'Enzo',profile:{id:'one',display_name:'Enzo'},days:days([{startMinutes:840,endMinutes:1230}])},
  {name:'Enzo L',profile:{id:'one',display_name:'Enzo'},days:days()}
 ];
 assert.equal(buildDashboardPeople(rows).length,1);
 const overview=renderOverviewDashboard({people:rows,week:'2026-10-26',today:'2026-10-31',sync:{loaded:false},hasPlanning:true});
 assert.match(overview,/14:00–20:30/);
 assert.doesNotMatch(overview,/n2dash-days/);
 const details=renderOverviewDashboard({people:rows,week:'2026-10-26',today:'2026-10-31',sync:{loaded:false},hasPlanning:true,open:{type:'person',index:0}});
 assert.match(details,/n2dash-days/);
 assert.match(details,/Enzo L/);
});
test('past-week overview does not expose a past shift as the current-day summary',()=>{
 const person={name:'Clément',days:days([{startMinutes:840,endMinutes:1230}])};
 const html=renderOverviewDashboard({people:[person],week:'2026-10-26',today:'2026-11-02',sync:{loaded:false},hasPlanning:true});
 assert.doesNotMatch(html,/14:00–20:30/);
 assert.match(html,/Horaires de la semaine/);
 assert.match(html,/Semaine du 26 octobre/);
});

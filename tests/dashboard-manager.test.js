import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardMetrics,renderOverviewDashboard} from '../src/ui/overview-dashboard.js';

const WEEK='2026-11-09',TODAY='2026-11-13';
const makeDays=ranges=>Array.from({length:7},(_,index)=>({
 date:new Date(Date.UTC(2026,10,9+index)).toISOString().slice(0,10),
 ranges:index===4?ranges:[],
 cells:Array(58).fill('r'),
}));
const range=(start,end)=>({startMinutes:start,endMinutes:end});
const people=[
 {name:'Enzo',profile:{id:'account-1',display_name:'Enzo'},days:makeDays([range(420,780)])},
 {name:'Enzo L',profile:{id:'account-1',display_name:'Enzo'},days:makeDays([range(720,960)])},
 {name:'Clément',profile:{id:'account-2',display_name:'Clément'},days:makeDays([range(840,1200)])}
];

test('regroupe les alias et ne double pas les heures communes',()=>{
 const stats=dashboardMetrics({people,week:WEEK,today:TODAY,hasPlanning:true,issues:[]});
 assert.equal(stats.roster.length,2);
 assert.equal(stats.todayDay.count,2);
 assert.equal(stats.todayDay.minutes,15*60);
 assert.equal(stats.weeklyMinutes,15*60);
 assert.equal(stats.buckets.find(row=>row.hour===12).count,1);
 assert.equal(stats.buckets.find(row=>row.hour===14).count,2);
});
test('ne fait pas passer un planning non publié pour un repos ou zéro heure',()=>{
 const stats=dashboardMetrics({people:[],week:WEEK,today:TODAY,hasPlanning:false});
 assert.equal(stats.issueCount,null);
 assert.equal(stats.buckets.length,0);
 const html=renderOverviewDashboard({people:[],week:WEEK,today:TODAY,hasPlanning:false});
 assert.match(html,/Aucun planning publié/);
 assert.match(html,/Planning non disponible/);
 assert.doesNotMatch(html,/0 h/);
});
test('permet d’ouvrir les jours et de déplier les collaborateurs',()=>{
 const html=renderOverviewDashboard({people,week:WEEK,today:TODAY,hasPlanning:true,expanded:true,
   issues:[{code:'LONG_DAY',name:'Clément',date:TODAY}]});
 assert.match(html,/data-action="dashboard-open-day"/);
 assert.match(html,/data-dashboard-date="2026-11-13"/);
 assert.match(html,/Points à vérifier/);
 assert.match(html,/1 point de planning à vérifier/);
 assert.match(html,/Couverture horaire/);
});
test('échappe les noms de collaborateurs et ne présente pas de présence réelle',()=>{
 const html=renderOverviewDashboard({
  people:[{name:'<script>alert(1)</script>',days:makeDays([range(420,780)])}],
  week:WEEK,today:TODAY,hasPlanning:true
 });
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/non pointées/);
});

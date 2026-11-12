import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboardPeople,renderCollaboratorSheet,renderOverviewDashboard} from '../src/ui/overview-dashboard.js';

function fixture(){
 const person={name:'Test collaborateur',profile:{id:'profile-1',display_name:'Test collaborateur'},
  days:Array.from({length:7},(_,i)=>i<5?{cells:['g'],ranges:[{startMinutes:480,endMinutes:840}]}:{cells:['r'],ranges:[]})};
 return {person,item:buildDashboardPeople([person])[0],open:{type:'person',index:0,week:'2026-11-09',tab:'planning'},
  week:'2026-11-09',today:'2026-11-12',hasPlanning:true};
}

test('la Vue d’ensemble utilise exactement la fiche partagée du Planning',()=>{
 const {person,item,...options}=fixture();
 const modal=renderCollaboratorSheet({...options,item});
 const dashboard=renderOverviewDashboard({...options,people:[person],sync:{loaded:true}});
 assert.ok(modal.includes('n2dash-person-sheet'));
 assert.ok(dashboard.includes(modal));
 assert.match(modal,/data-action="dashboard-tab-planning"/);
 assert.match(modal,/data-action="dashboard-tab-suivi"/);
 assert.match(modal,/data-action="dashboard-open-planning"/);
});

test('la fiche commune calcule les horaires planifiés sans inventer de jours travaillés',()=>{
 const {item,person,...options}=fixture();
 const modal=renderCollaboratorSheet({...options,item});
 assert.match(modal,/30 h/);
 assert.match(modal,/5 \/ 7/);
 assert.match(modal,/Jours de repos/);
 assert.match(modal,/data-action="dashboard-week-next"/);
});

test('une semaine non publiée ne devient jamais sept jours de repos',()=>{
 const {item,person,...options}=fixture();
 const modal=renderCollaboratorSheet({...options,item,personDetail:{week:'2026-11-16',
  loading:false,published:false,people:[],issues:[]}});
 assert.match(modal,/Aucun planning publié pour cette semaine/);
 assert.doesNotMatch(modal,/0 \/ 7/);
});

test('la fiche de suivi conserve les mêmes informations dans les deux pages',()=>{
 const {person,item,...options}=fixture();
 const open={...options.open,tab:'suivi'};
 const inputs={...options,open,personIssues:[{code:'LONG_DAY',name:person.name,date:'2026-11-12'}],
  personSource:'Semaine C.xlsx',personRevision:'2026-11-10T18:00:00Z'};
 const modal=renderCollaboratorSheet({...inputs,item});
 const overview=renderOverviewDashboard({...inputs,people:[person],sync:{loaded:true}});
 assert.ok(overview.includes(modal));
 assert.match(modal,/Journée longue/);
 assert.match(modal,/Semaine C.xlsx/);
});

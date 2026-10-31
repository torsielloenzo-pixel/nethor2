import test from 'node:test';
import assert from 'node:assert/strict';
import {planningMobileData,renderMobilePlanning,employeeIndices} from '../src/ui/planning-mobile.js';

const week='2026-10-26';
const names=['Autre','Enzo L','Clément','Enzo'];
const model={weekStart:week,employees:names.map(name=>({name})),startTime:6,slotMinutes:15,days:Object.fromEntries(Array.from({length:7},(_,i)=>{
 const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);
 return [d.toISOString().slice(0,10),{cells:names.map(()=>['g','g','r','r'])}];
}))};
const profile={id:'owner',display_name:'Enzo',planning_name:'Enzo L',planning_aliases:['Enzo','Enzo L']};

test('les deux alias manuels passent avant les autres collaborateurs en vue Semaine',()=>{
 assert.deepEqual(employeeIndices(model,profile),[1,3]);
 const view=planningMobileData(model,[],profile,week);
 assert.deepEqual(view.employees.map(x=>x.name),['Enzo L','Enzo','Autre','Clément']);
 assert.deepEqual(view.employees.map(x=>x.isMe),[true,true,false,false]);
 assert.equal(view.mineIndices.length,2);
});

test('la vue Jour montre chaque alias dans Mon planning et ne le répète pas dans Équipe',()=>{
 const html=renderMobilePlanning({weekStart:week,selectedDay:week,view:'day',model,profiles:[],currentProfile:profile,now:new Date('2026-10-26T12:00:00Z')});
 const start=html.indexOf('Mon planning');
 const team=html.indexOf('Équipe du jour');
 assert.ok(start>=0&&team>start);
 const own=html.slice(start,team);
 assert.match(own,/Enzo L/);
 assert.match(own,/>Enzo</);
 assert.equal((own.match(/n2pm-day-card is-me/g)||[]).length,2);
 assert.ok(!html.slice(team).includes('>Enzo L</strong>'));
});

test('les alias d’un autre compte ne sont jamais reconnus comme les miens',()=>{
 const p={display_name:'Autre personne',planning_name:'Inconnu',planning_aliases:['Nouveau nom']};
 assert.deepEqual(employeeIndices(model,p),[]);
});

test('les alias des comptes désactivés restent masqués',()=>{
 const rows=planningMobileData(model,[{account_enabled:false,planning_name:'Autre',planning_aliases:['Clément']}],profile,week);
 assert.deepEqual(rows.employees.map(x=>x.name),['Enzo L','Enzo']);
});

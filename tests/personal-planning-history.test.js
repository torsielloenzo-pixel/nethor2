import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listPersonalPlanningHistory} from '../src/data/personal-planning-history.js';
import {groupPersonalPlanningHistory,renderPersonalPlanningHistory} from '../src/ui/personal-planning-history.js';

function thenable(result,calls){
 const q={
  select(value){calls.push(['select',value]);return q;},
  gte(field,value){calls.push(['gte',field,value]);return q;},
  order(field,opts){calls.push(['order',field,opts]);return q;},
  limit(value){calls.push(['limit',value]);return q;},
  eq(field,value){calls.push(['eq',field,value]);return q;},
  then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}
 };
 return q;
}
function row(start=8,end=14){
 const cells=Array(58).fill(null);
 for(let i=(start-6)*4;i<(end-6)*4;i++)cells[i]='g';
 return cells;
}
function schedule(week,cells){
 return {version:1,weekStart:week,startTime:6,slotMinutes:15,slotCount:58,employees:[
  {name:'Utilisateur test',days:{[week]:cells}}
 ]};
}

test('historique personnel : lecture via table RLS sans identifiant utilisateur côté client',async()=>{
 const calls=[];
 const rows=[{id:1,week_start:'2026-11-09'}];
 const client={from(table){assert.equal(table,'personal_planning_history');return thenable({data:rows,error:null},calls);}};
 assert.deepEqual(await listPersonalPlanningHistory(client,{limit:120}),rows);
 assert.ok(calls.some(x=>x[0]==='gte'&&x[1]==='week_start'&&x[2]==='2025-01-01'));
 assert.ok(calls.some(x=>x[0]==='limit'&&x[1]===120));
 assert.equal(calls.some(x=>x[0]==='eq'&&x[1]==='user_id'),false);
});

test('historique personnel : regroupe plusieurs versions de la même semaine',()=>{
 const items=[
  {id:2,week_start:'2026-11-09',revision_at:'2026-11-09T12:00:00Z'},
  {id:1,week_start:'2026-11-09',revision_at:'2026-11-09T10:00:00Z'},
  {id:3,week_start:'2026-11-02',revision_at:'2026-11-02T10:00:00Z'}
 ];
 const groups=groupPersonalPlanningHistory(items);
 assert.equal(groups.length,2);
 assert.equal(groups[0].weekStart,'2026-11-09');
 assert.equal(groups[0].versions.length,2);
 assert.equal(groups[0].versions[0].id,2);
});

test('historique personnel : affiche ancienne version et jours modifiés',()=>{
 const week='2026-11-09';
 const html=renderPersonalPlanningHistory({items:[
  {id:2,week_start:week,revision_at:'2026-11-09T12:00:00Z',change_kind:'update',schedule:schedule(week,row(14,20))},
  {id:1,week_start:week,revision_at:'2026-11-09T10:00:00Z',change_kind:'baseline',schedule:schedule(week,row(8,14))}
 ]});
 assert.match(html,/Historique personnel/);
 assert.match(html,/Dernière version/);
 assert.match(html,/Ancienne version/);
 assert.match(html,/1 jour modifié/);
 assert.match(html,/14:00–20:00/);
 assert.match(html,/08:00–14:00/);
 assert.match(html,/9 novembre 2026/);
});

test('migration : snapshots personnels, RLS propriétaire et aucune écriture client',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261109_personal_planning_history.sql',import.meta.url),'utf8');
 assert.match(sql,/create table if not exists public\.personal_planning_history/i);
 assert.match(sql,/\(select auth\.uid\(\)\) = user_id/);
 assert.match(sql,/revoke insert,update,delete on table public\.personal_planning_history from authenticated/i);
 assert.match(sql,/private\.nethor_personal_planning_snapshot/);
 assert.match(sql,/private\.nethor_planning_name_key/);
 assert.match(sql,/personal_planning_history_capture/);
 assert.match(sql,/s\.snapshot is not null/);
});

test('interface planning : accès historique, panneau global et cache PWA',()=>{
 const mobile=fs.readFileSync(new URL('../src/ui/planning-mobile.js',import.meta.url),'utf8');
 const live=fs.readFileSync(new URL('../src/ui/live.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../mobile.css',import.meta.url),'utf8');
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(mobile,/data-action="personal-history-toggle"/);
 assert.match(live,/personalPlanningHistoryPanel/);
 assert.match(live,/personal-history-close/);
 assert.match(live,/listPersonalPlanningHistory/);
 assert.match(css,/\.n2ph-panel/);
 assert.match(css,/\.n2pm-history-link/);
 assert.match(sw,/personal-planning-history\.js/);
 assert.match(sw,/nethor-shell-import-cache-v[0-9]+/);
});

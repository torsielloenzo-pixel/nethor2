import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getPlanningNotificationAccess,listPlanningChangeNotifications,markPlanningChangeNotificationRead} from '../src/data/planning-notifications.js';

function thenable(result){
  const q={
    select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},update(){return q;},is(){return q;},
    then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}
  };
  return q;
}
test('notification access is server-gated',async()=>{
  const client={rpc:async name=>{assert.equal(name,'nethor2_my_planning_change_notification_access');return {data:true,error:null};}};
  assert.equal(await getPlanningNotificationAccess(client),true);
});
test('only planning_shift_change rows are requested',async()=>{
  const rows=[{id:1,kind:'planning_shift_change'}];
  const client={from:table=>{assert.equal(table,'planning_notifications');const q=thenable({data:rows,error:null});const base=q.eq;q.eq=(field,value)=>{if(field==='kind')assert.equal(value,'planning_shift_change');return base.call(q,field,value);};return q;}};
  assert.deepEqual(await listPlanningChangeNotifications(client),rows);
});
test('mark read validates notification id',async()=>{
  await assert.rejects(()=>markPlanningChangeNotificationRead({from(){throw new Error('should not query');}},0),/invalide/);
});
test('mobile shell contains gated bell and panel',()=>{
  const live=fs.readFileSync(new URL('../src/ui/live.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../mobile.css',import.meta.url),'utf8');
  assert.match(live,/planningNotificationButton/);
  assert.match(live,/planning-notifications/);
  assert.match(live,/data-planning-notification-id/);
  assert.match(css,/\.n2notif-button/);
  assert.match(css,/@media\(max-width:760px\)/);
});

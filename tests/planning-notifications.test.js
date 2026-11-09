import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getPlanningNotificationAccess,listPlanningChangeNotifications,markPlanningChangeNotificationRead,deletePlanningChangeNotification,deleteReadPlanningChangeNotifications} from '../src/data/planning-notifications.js';

function thenable(result){
  const q={
    select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},update(){return q;},delete(){return q;},is(){return q;},not(){return q;},
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
test('delete validates notification id',async()=>{
  await assert.rejects(()=>deletePlanningChangeNotification({from(){throw new Error('should not query');}},0),/invalide/);
});
test('delete only targets read planning change notifications',async()=>{
  const calls=[];
  const client={from:table=>{assert.equal(table,'planning_notifications');const q=thenable({data:null,error:null});
    q.delete=()=>{calls.push(['delete']);return q;};
    q.eq=(field,value)=>{calls.push(['eq',field,value]);return q;};
    q.not=(field,operator,value)=>{calls.push(['not',field,operator,value]);return q;};
    return q;
  }};
  await deletePlanningChangeNotification(client,12);
  assert.deepEqual(calls,[['delete'],['eq','id',12],['eq','kind','planning_shift_change'],['not','read_at','is',null]]);
});
test('bulk delete only targets read planning change notifications',async()=>{
  const calls=[];
  const client={from:table=>{assert.equal(table,'planning_notifications');const q=thenable({data:null,error:null});
    q.delete=()=>{calls.push(['delete']);return q;};
    q.eq=(field,value)=>{calls.push(['eq',field,value]);return q;};
    q.not=(field,operator,value)=>{calls.push(['not',field,operator,value]);return q;};
    return q;
  }};
  await deleteReadPlanningChangeNotifications(client);
  assert.deepEqual(calls,[['delete'],['eq','kind','planning_shift_change'],['not','read_at','is',null]]);
});
test('mobile shell contains gated bell and panel',()=>{
  const live=fs.readFileSync(new URL('../src/ui/live.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../mobile.css',import.meta.url),'utf8');
  assert.match(live,/planningNotificationButton/);
  assert.match(live,/planning-notifications/);
  assert.match(live,/data-planning-notification-id/);
  assert.match(live,/planningNotificationChange/);
  assert.match(live,/ANCIEN HORAIRE/);
  assert.match(live,/NOUVEL HORAIRE/);
  assert.match(live,/planningDeltaText/);
  assert.match(live,/notification-delete/);
  assert.match(live,/notifications-delete-read/);
  assert.match(css,/\.n2notif-button/);
  assert.match(css,/\.n2notif-shift-grid/);
  assert.match(css,/\.n2notif-shift-box/);
  assert.match(css,/\.n2notif-delete/);
  assert.match(css,/@media\(max-width:760px\)/);
});

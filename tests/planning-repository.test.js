import test from 'node:test';
import assert from 'node:assert/strict';
import {getPlanningWeek,publishPlanningWeek,verifyPublishedWeek} from '../src/data/planning-repository.js';
function client(out={data:null,error:null}) {
 return {from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>out})})}),
 rpc:async()=>out};
}
test('reçoit les données d une semaine existante',async()=>{
 const c=client({data:{week_start:'2026-10-12',data:{employees:[]},updated_at:'rev1'},error:null});
 assert.equal((await getPlanningWeek(c,'2026-10-12')).revision,'rev1');
});
test('refuse un mauvais jour de début de semaine',async()=>{
 await assert.rejects(()=>getPlanningWeek(client(),'2026-10-13'),/lundi/);
});
test('ne confirme pas une écriture sur simple accusé de réception',async()=>{
 const c=client({data:{status:'ok',revision:'rev2'},error:null});
 const result=await publishPlanningWeek(c,{weekStart:'2026-10-12',model:{weekStart:'2026-10-12',employees:[],days:{}}});
 assert.equal(result.status,'accepted-pending-verification');
});
test('une révision identique vérifie la publication',async()=>{
 const c=client({data:{week_start:'2026-10-12',data:{},updated_at:'rev2'},error:null});
 assert.equal(await verifyPublishedWeek(c,'2026-10-12','rev2'),true);
});

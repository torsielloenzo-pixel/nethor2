import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAuthorizedSession} from '../src/auth/session-gate.js';
function fake({user={id:'u1'},context={authenticated:true,session_active:true},profile={id:'u1',display_name:'Test',role:'employe',account_enabled:true}}={}){
 return {auth:{getUser:async()=>({data:{user},error:null})},
 rpc:async()=>({data:context,error:null}),
 from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})};
}
test('autorise un profil actif et une session valide',async()=>{
 assert.equal((await loadAuthorizedSession(fake())).status,'authorized');
});
test('rejette une session révoquée',async()=>{
 assert.equal((await loadAuthorizedSession(fake({context:{authenticated:true,session_active:false}}))).status,'denied');
});
test('rejette un compte désactivé',async()=>{
 assert.equal((await loadAuthorizedSession(fake({profile:{id:'u1',account_enabled:false}}))).status,'denied');
});
test('refuse un profil absent',async()=>{
 assert.equal((await loadAuthorizedSession(fake({profile:null}))).status,'denied');
});
test('ne divulgue pas de profil si déconnecté',async()=>{
 assert.equal((await loadAuthorizedSession(fake({user:null}))).status,'signed-out');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewTeam,canNavigate} from '../src/ui/team-access.js';

test('Administrateur : Équipe visible et accessible',()=>{
 assert.equal(canViewTeam({role:'admin'}),true);
 assert.equal(canNavigate('team',{role:'admin'}),true);
});
test('Autres rôles : Équipe totalement absente de la navigation',()=>{
 for(const role of ['employe','responsable','role_point-de-vente','lecture_seule','point_de_vente',undefined]){
   assert.equal(canViewTeam({role}),false,role);
   assert.equal(canNavigate('team',{role}),false,role);
   assert.equal(canNavigate('planning',{role}),true,role);
 }
});
test('Sans session, accès Équipe refusé',()=>{
 assert.equal(canViewTeam(null),false);
 assert.equal(canNavigate('team',undefined),false);
});

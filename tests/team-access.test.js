import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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


test('Point de vente : Anomalies désactivées uniquement Desktop et PWA Desktop',()=>{
 const pdv={role:'role_point-de-vente'};
 assert.equal(canNavigate('anomalies',pdv,false),false);
 assert.equal(canNavigate('anomalies',pdv),false);
 assert.equal(canNavigate('anomalies',pdv,true),true,'NethorSync mobile doit rester accessible');
 for(const page of ['home','planning','import','settings','history']){
  assert.equal(canNavigate(page,pdv,false),true,page);
 }
});
test('Administrateur et autres rôles : aucune restriction nouvelle sur Anomalies',()=>{
 for(const role of ['admin','responsable','employe']){
  assert.equal(canNavigate('anomalies',{role},false),true,role+' desktop');
  assert.equal(canNavigate('anomalies',{role},true),true,role+' mobile');
 }
});
test('navigation : rendu et passage Desktop↔Mobile appliquent les droits Point de vente',()=>{
 const js=readFileSync(new URL('../src/ui/live.js',import.meta.url),'utf8');
 assert.match(js,/canNavigate\(key,state\.profile,true\)/);
 assert.match(js,/canNavigate\(key,state\.profile,smallScreen\(\)\)/);
 assert.match(js,/canNavigate\('anomalies',state\.profile,smallScreen\(\)\)/);
 assert.match(js,/anomaliesNav\.hidden=!permitted/);
 assert.match(js,/anomaliesNav\.style\.display=permitted\?'':'none'/);
 assert.match(js,/if\(!\(page in TITLES\)\|\|!canNavigate\(page,state\.profile,smallScreen\(\)\)\)return/);
 assert.equal((js.match(/if\(!canNavigate\(state\.page,state\.profile,smallScreen\(\)\)\)state\.page='planning'/g)||[]).length,2);
});

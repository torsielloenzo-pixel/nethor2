import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate} from '../src/ui/team-access.js';
import {renderNethorPromo} from '../src/ui/nethor-promo.js';

test('NETHOR Promo réservé aux administrateurs en Desktop et PWA Desktop',()=>{
  assert.equal(canNavigate('promo',{role:'admin'},false),true);
  assert.equal(canNavigate('promo',{role:'admin'},true),false,'mobile et PWA mobile');
  for(const role of ['role_point-de-vente','responsable','employe','lecture_seule',undefined]){
    assert.equal(canNavigate('promo',{role},false),false,role);
    assert.equal(canNavigate('promo',{role},true),false,role);
  }
  assert.equal(canNavigate('promo',null,false),false,'aucune session');
});

test('Le module affiche honnêtement son état sans annoncer un collecteur actif',()=>{
  const html=renderNethorPromo();
  assert.match(html,/Module en préparation/);
  assert.match(html,/semaine en cours et semaine suivante/);
  assert.match(html,/vérification automatique quotidienne \(non activée\)/);
  assert.match(html,/hebdomadaires et thématiques/);
});

test('La navigation Desktop expose uniquement l’onglet autorisé et le masque au changement de largeur',()=>{
  const js=readFileSync(new URL('../src/ui/live.js',import.meta.url),'utf8');
  assert.match(js,/promo:'NETHOR Promo'/);
  assert.match(js,/key==='promo'&&state\.profile\?\.role==='admin'/);
  assert.match(js,/const promoNav=ROOT\.querySelector\('\[data-nav="promo"\]'\)/);
  assert.match(js,/canNavigate\('promo',state\.profile,smallScreen\(\)\)/);
  assert.match(js,/promoNav\.hidden=!permitted/);
  assert.match(js,/promoNav\.style\.display=permitted\?'':'none'/);
  assert.match(js,/promo:pagePromo/);
  assert.match(js,/function pagePromo\(\)/);
});

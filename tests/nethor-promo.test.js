import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate} from '../src/ui/team-access.js';
import {renderNethorPromo} from '../src/ui/nethor-promo.js';

test('Promotions réservé aux administrateurs Desktop et PWA Desktop',()=>{
  assert.equal(canNavigate('promo',{role:'admin'},false),true);
  assert.equal(canNavigate('promo',{role:'admin'},true),false);
  for(const role of ['role_point-de-vente','responsable','employe','lecture_seule',undefined]){
    assert.equal(canNavigate('promo',{role},false),false,role);
    assert.equal(canNavigate('promo',{role},true),false,role);
  }
  assert.equal(canNavigate('promo',null,false),false);
});

test('Interface moderne et prudente avant la première collecte',()=>{
  const html=renderNethorPromo();
  assert.match(html,/Les prospectus, au même endroit/);
  assert.match(html,/En attente de première collecte/);
  assert.match(html,/Actualiser les résultats/);
  assert.match(html,/Préparation des rayons/);
  assert.match(html,/Ces fonctions ne sont pas encore activées/);
  assert.doesNotMatch(html,/Module en préparation/);
});

test('Catalogue confirmé : lien officiel uniquement, sans injection HTML',()=>{
  const html=renderNethorPromo({data:{
    collected_at:'2026-11-12T07:00:00+01:00',checked_on:'2026-11-12',
    window_start:'2026-11-09',window_end:'2026-11-22',status:'ok',
    catalogs:[
      {title:'TEMPS FORT <script>alert(1)</script>',category:'weekly',
       url:'https://www.netto.fr/prospectus/temps-fort-novembre-S46',
       start_date:'2026-11-10',end_date:'2026-11-16'},
      {title:'Thématique',category:'thematic',
       url:'https://www.netto.fr/prospectus/jouets-noel',
       start_date:'2026-11-03',end_date:'2026-11-30'},
      {title:'URL malveillante',category:'weekly',
       url:'https://example.org/prospectus/hack',
       start_date:'2026-11-10',end_date:'2026-11-16'}
    ]}});
  assert.match(html,/2<\/strong>/);
  assert.match(html,/Cette semaine/);
  assert.match(html,/Opérations thématiques/);
  assert.match(html,/TEMPS FORT &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html,/example\.org/);
  assert.match(html,/https:\/\/www\.netto\.fr\/prospectus\/jouets-noel/);
});

test('Navigation nommée seulement Promotions, accès et collecte réservés sur desktop',()=>{
  const js=readFileSync(new URL('../src/ui/live.js',import.meta.url),'utf8');
  assert.match(js,/promo:'Promotions'/);
  assert.match(js,/key==='promo'&&state\.profile\?\.role==='admin'/);
  assert.match(js,/const promoNav=ROOT\.querySelector\('\[data-nav="promo"\]'\)/);
  assert.match(js,/canNavigate\('promo',state\.profile,smallScreen\(\)\)/);
  assert.match(js,/promoNav\.hidden=!permitted/);
  assert.match(js,/promoNav\.style\.display=permitted\?'':'none'/);
  assert.match(js,/promo:pagePromo/);
  assert.match(js,/function pagePromo\(\)/);
  assert.match(js,/function loadPromoCatalogs\(\)/);
  assert.match(js,/promoCatalogState\.data=data/);
  const ui=readFileSync(new URL('../src/ui/nethor-promo.js',import.meta.url),'utf8');
  assert.match(ui,/data-action="promo-refresh"/);
});

test('Collecte planifiée et catalogue exposé dans la publication PWA',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/preview-pages.yml',import.meta.url),'utf8');
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/collect-netto-promotions\.py --output _site\/data\/netto-catalogues\.json/);
  assert.match(workflow,/nethor-promotions\.css/);
  assert.match(html,/nethor-promotions\.css/);
  assert.match(sw,/nethor-promotions\.css/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('src/ui/live.js');
const css=read('mobile.css');
const index=read('index.html');
const shell=js.slice(js.indexOf('function renderShell(){'),js.indexOf('async function signOut(){'));

test('entête mobile : menu ≡ puis logo officiel puis NETHOR et page',()=>{
  const menu=shell.indexOf('id="mobileMenu"');
  const logo=shell.indexOf('class="nethor-header-logo" src="./assets/icon.svg"');
  const title=shell.indexOf('class="nethor-mobile-titles"');
  assert.ok(menu>0&&logo>menu&&title>logo);
  assert.match(shell,/aria-controls="sidebar" aria-expanded="false"/);
  assert.match(shell,/<span aria-hidden="true">≡<\/span>/);
  assert.match(shell,/<strong>NETHOR<\/strong><span id="mobileCurrentPage">Accueil<\/span>/);
});

test('nom de page lié à la navigation : affiché dynamiquement dans l’entête',()=>{
  assert.match(js,/const MOBILE_PAGE_TITLES=\{home:'Accueil',planning:'Planning'/);
  for(const label of ["Alertes","Importer","Équipe","Historique","Paramètres"]){
    assert.ok(js.includes("'"+label+"'"),label);
  }
  assert.match(js,/ROOT\.querySelector\('#mobileCurrentPage'\)\.textContent=MOBILE_PAGE_TITLES\[state\.page\]/);
});

test('bleu du fond identique au logo, contrastes, et desktop non touché',()=>{
  const logo=read('assets/icon.svg');
  assert.match(logo,/fill="#101f3e"/);
  assert.match(css,/ENTETE MOBILE NETHOR/);
  assert.match(css,/@media\(max-width:760px\)\{\s*#app \.topbar\{/);
  assert.match(css,/#app \.topbar\{\s*background:#101f3e;/);
  assert.match(css,/#app \.topbar \.nethor-desktop-titles\{display:none\}/);
  assert.match(css,/#app \.topbar \.top-actions\{display:none\}/);
  assert.match(css,/\.nethor-mobile-titles\{display:none\}/);
});

test('PWA iOS : fond continu dans la zone de statut et cache renouvelé',()=>{
  assert.match(index,/apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(read('sw.js'),/nethor-mobile-nozoom-v16/);
  assert.match(read('sw.js'),/src\/ui\/live\.js/);
  assert.match(read('sw.js'),/mobile\.css/);
});

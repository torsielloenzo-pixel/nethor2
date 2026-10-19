import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('src/ui/live.js');
const css=read('mobile.css');
const shell=js.slice(js.indexOf('function renderShell(){'),js.indexOf('async function checkSession(){'));

test('desktop : logo puis Nethor / page ouverte, sans ancien sous-titre',()=>{
 const icon=shell.indexOf('class="nethor-header-logo" src="./assets/icon.svg"');
 const desktop=shell.indexOf('class="nethor-desktop-titles"');
 const page=shell.indexOf('id="breadPage"');
 assert.ok(icon>0&&desktop>icon&&page>desktop);
 assert.match(shell,/<strong class="nethor-desktop-name">Nethor<\/strong><span class="sep">\/<\/span><span id="breadPage">Accueil<\/span>/);
 assert.doesNotMatch(shell,/Netto Le Thor · Planning du personnel/);
 assert.match(js,/ROOT\.querySelector\('#breadPage'\)\.textContent=TITLES\[state\.page\]/);
});
test('sidebar desktop : logo, Nethor et sous-titre Planning',()=>{
 assert.match(shell,/class="nethor-sidebar-logo" src="\.\/assets\/icon\.svg"/);
 assert.match(shell,/class="nethor-sidebar-desktop"><strong>Nethor<\/strong><small>Planning<\/small><\/span>/);
 assert.match(css,/@media\(min-width:761px\)/);
 assert.match(css,/#app \.topbar \.nethor-desktop-name/);
});
test('mobile et PWA mobile : conserver ses propres libellés',()=>{
 assert.match(shell,/class="nethor-sidebar-mobile"><strong>NETHOR<span class="brand-number">2<\/span><\/strong><small>PLANNING · LE THOR<\/small><\/span>/);
 assert.match(shell,/<div class="nethor-mobile-titles"><strong>NETHOR<\/strong><span id="mobileCurrentPage">Accueil<\/span>/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.nethor-sidebar-desktop\{display:none\}/);
});

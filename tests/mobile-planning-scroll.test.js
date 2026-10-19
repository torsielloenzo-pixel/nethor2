import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('planning mobile: en-tête et navigation restent hors du défilement',()=>{
 const css=read('mobile.css');
 const start=css.indexOf("/* Planning Mobile / PWA Mobile : l'entête Nethor reste immobile.");
 assert.ok(start>0,'règles dédiées au planning');
 const rules=css.slice(start);
 assert.match(rules,/@media\(max-width:760px\)\{/);
 assert.match(rules,/body:has\(#app\.mobile-planning-active\)\{[^}]*height:100dvh;[^}]*overflow:hidden;/);
 assert.match(rules,/#app\.mobile-planning-active \.workspace\{[^}]*height:100dvh;[^}]*display:flex;[^}]*flex-direction:column;/);
 assert.match(rules,/#app\.mobile-planning-active \.topbar\{[^}]*flex:0 0 auto;[^}]*position:relative;/);
 assert.match(rules,/#app\.mobile-planning-active main#screen\{[^}]*flex:1 1 auto;[^}]*min-height:0;[^}]*overflow-y:auto;/);
 assert.match(rules,/overscroll-behavior-y:contain;/);
 assert.match(rules,/-webkit-overflow-scrolling:touch;/);
 assert.match(rules,/padding-bottom:calc\(74px \+ env\(safe-area-inset-bottom\)\)/);
});

test('planning: une seule région défile sous le vrai en-tête du site',()=>{
 const js=read('src/ui/live.js');
 const shell=js.slice(js.indexOf('function renderShell(){'),js.indexOf('async function checkSession(){'));
 assert.match(shell,/<header class="topbar">/);
 assert.match(shell,/<main id="screen" tabindex="-1" aria-live="polite"><\/main>/);
 assert.ok(shell.indexOf('<header class="topbar">')<shell.indexOf('<main id="screen"'));
 assert.match(js,/ROOT\.classList\.toggle\('mobile-planning-active',state\.page==='planning'&&isMobileHome\(\)\)/);
 const css=read('mobile.css');
 assert.match(css,/#app\.menu-open #sidebar\{position:fixed;z-index:1001;/);
});

test('les filtres et le panneau de repos préservent le défilement du planning',()=>{
 const js=read('src/ui/live.js');
 const handlers=js.slice(js.indexOf("const mobileFilter=event.target.closest("),js.indexOf("const day=event.target.closest("));
 assert.equal((handlers.match(/ROOT\.querySelector\('#screen'\)\?\.scrollTop/g)||[]).length,2);
 assert.equal((handlers.match(/scroller\.scrollTop=y/g)||[]).length,2);
 assert.doesNotMatch(handlers,/window\.scrollY|window\.scrollTo/);
 assert.match(js,/if\(state\.page==='planning'&&smallScreen\(\)&&planningScroller\)planningScroller\.scrollTop=0;/);
});

test('les autres pages et le desktop ne reçoivent pas le blocage de défilement',()=>{
 const css=read('mobile.css');
 const start=css.indexOf("/* Planning Mobile / PWA Mobile : l'entête Nethor reste immobile.");
 const rules=css.slice(start);
 assert.match(rules,/@media\(max-width:760px\)/);
 assert.doesNotMatch(rules,/#app\.personal-home-active/);
 assert.doesNotMatch(rules,/#app\.staff-desktop-layout/);
 assert.doesNotMatch(rules,/@media\(min-width:761px\)/);
});

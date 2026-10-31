import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('mobile.css');
const js=read('src/ui/live.js');
const marker="/* Mobile / PWA Mobile : l'en-tête NETHOR reste fixe sur les pages classiques.";
const rules=css.slice(css.indexOf(marker),css.indexOf('/* Vue annuelle ordinateur',css.indexOf(marker)));

test('Mobile/PWA : entête fixe, seul le contenu de la page défile',()=>{
 assert.ok(css.includes(marker));
 assert.match(rules,/@media\(max-width:760px\)\{/);
 assert.match(rules,/body:has\(#app\.mobile-content-scroll\)\{\s*height:100dvh;\s*overflow:hidden;/);
 assert.match(rules,/#app\.mobile-content-scroll \.workspace\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*padding-bottom:calc\(74px \+ env\(safe-area-inset-bottom\)\);/);
 assert.match(rules,/#app\.mobile-content-scroll \.topbar\{[^}]*flex:0 0 auto;[^}]*position:relative;/);
 assert.match(rules,/#app\.mobile-content-scroll main#screen\{[^}]*flex:1 1 auto;[^}]*min-height:0;[^}]*overflow-y:auto;/);
 assert.match(rules,/overscroll-behavior-y:contain;/);
 assert.match(rules,/-webkit-overflow-scrolling:touch;/);
});

test('Mobile : le nouveau scroll ne concerne pas les écrans déjà gérés séparément',()=>{
 assert.match(js,/ROOT\.classList\.toggle\('mobile-content-scroll',smallScreen\(\)&&/);
 assert.match(js,/!\(state\.page==='home'&&isMobileHome\(\)\)/);
 assert.match(js,/!\(state\.page==='planning'&&isMobileHome\(\)\)/);
 assert.match(js,/state\.page!=='anomalies'/);
 assert.match(js,/ROOT\.classList\.remove\([^;]*'mobile-content-scroll'/);
 assert.match(js,/window\.matchMedia\('\(max-width:760px\)'\)\.addEventListener/);
});

test('Le menu latéral garde son propre défilement et le desktop ses dimensions',()=>{
 assert.match(css,/#app\.menu-open #sidebar\{position:fixed;z-index:1001;/);
 assert.match(css,/#app\.menu-open \.app\{overflow:visible!important\}/);
 assert.match(css,/\.sidebar nav\{overflow-y:auto;/);
 assert.doesNotMatch(rules,/@media\(min-width:761px\)/);
 assert.match(read('sw.js'),/const CACHE_NAME='nethor-[^']+-v\\d+'/);
});

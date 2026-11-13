import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isStaffDesktopLayout,usesCompactLayout} from '../src/ui/layout-role.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Responsable/Employé PC : accueil personnel conservé, planning partagé en lecture seule',()=>{
 const js=read('src/ui/live.js');
 assert.ok(js.includes("const isMobileHome=()=>usesCompactLayout(state.profile?.role,smallScreen())"));
 assert.ok(js.includes("const isStaffDesktop=()=>isStaffDesktopLayout(state.profile?.role,smallScreen())"));
 assert.ok(js.includes("if(isMobileHome())return mobileOverviewPage()"));
 assert.ok(js.includes("if(smallScreen())return renderMobilePlanning("));
 assert.ok(js.includes("const staffPlanningRole=()=>!smallScreen()&&['admin','role_point-de-vente','responsable','employe'].includes(state.profile?.role)"));
 assert.ok(js.includes("readOnly:['responsable','employe'].includes(state.profile?.role)"));
 assert.ok(js.includes("editor:planningEditorDesktopAllowed()?"));
 assert.ok(js.includes("ROOT.classList.toggle('mobile-planning-active',state.page==='planning'&&smallScreen())"));
 assert.ok(js.includes("const planningEditorDesktopAllowed=()=>!smallScreen()&&state.page==='planning'&&['admin','role_point-de-vente'].includes(state.profile?.role)"));
 assert.ok(js.includes("ROOT.classList.toggle('staff-desktop-layout',isStaffDesktop())"));
 assert.ok(js.includes("if(isMobileHome())void loadPersonalHome()"));
 for(const role of ['responsable','employe']){
  assert.equal(usesCompactLayout(role,false),true);
  assert.equal(isStaffDesktopLayout(role,false),true);
 }
});

test('Administrateur et Point de vente PC restent sur les pages desktop',()=>{
 for(const role of ['admin','role_point-de-vente']){
  assert.equal(isStaffDesktopLayout(role,false),false);
  assert.equal(usesCompactLayout(role,false),false);
 }
 const css=read('staff-desktop.css');
 assert.ok(css.includes('@media (min-width:761px)'));
 assert.ok(css.includes('#app.staff-desktop-layout .n2h-home'));
 assert.ok(css.includes('#app.staff-desktop-layout .n2pm-day-list'));
 assert.ok(css.includes('#app.staff-desktop-layout .n2pm-week-list'));
 assert.ok(css.includes('grid-template-columns:repeat(7,minmax(0,1fr))'));
});

test('Déploiement web et PWA contiennent styles et module de rôles',()=>{
 const html=read('index.html'),workflow=read('.github/workflows/preview-pages.yml'),sw=read('sw.js'),server=read('scripts/dev-server.js');
 assert.match(html,/href="\.\/staff-desktop\.css(?:\?v=[^"]+)?"/);
 assert.ok(workflow.includes('staff-desktop.css'));
 assert.match(workflow,/cp -R src _site\//);
 assert.match(workflow,/verify-pwa-shell\.py _site sw\.js/);
 assert.ok(sw.includes("'./staff-desktop.css'"));
 assert.ok(sw.includes("'./src/ui/layout-role.js'"));
 assert.ok(server.includes("'/staff-desktop.css'"));
 assert.ok(server.includes("'/src/ui/layout-role.js'"));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const js=read('src/ui/live.js');
const css=read('staff-desktop.css');
const sw=read('sw.js');
const workflow=read('.github/workflows/preview-pages.yml');
const dev=read('scripts/dev-server.js');
const index=read('index.html');

test('Desktop : navigation rapide, date et raccourcis de semaine',()=>{
 assert.match(js,/id="desktopPlanningDate"/);
 assert.match(js,/data-action="today"/);
 assert.match(js,/title="Alt \+ ←"/);
 assert.match(js,/event\.altKey/);
 assert.match(js,/ArrowLeft/);
 assert.match(js,/ArrowRight/);
});

test('Desktop : recherche du planning et historique collaborateurs enrichi',()=>{
 assert.match(js,/id="desktopPlanningSearch"/);
 assert.match(js,/id="collaboratorHistorySearch"/);
 assert.match(js,/Première apparition/);
 assert.match(js,/Dernière apparition/);
 assert.match(js,/Semaines disponibles/);
 assert.match(js,/weekSet:new Set\(\)/);
 assert.match(js,/Compte désactivé/);
 assert.match(js,/Sans compte associé/);
});

test('Desktop : donnée incomplète différente du repos et impression prévue',()=>{
 assert.match(js,/Donnée incomplète/);
 assert.match(js,/INVALID_ROW/);
 assert.match(js,/print-planning/);
 assert.match(css,/@media print/);
 assert.match(css,/@page\{size:landscape/);
});

test('Desktop : barre latérale rétractable et grand tableau stable',()=>{
 assert.match(js,/data-action="sidebar-toggle"/);
 assert.match(js,/desktopSidebarCollapsed/);
 assert.match(css,/desktop-sidebar-collapsed/);
 assert.match(css,/desktop-planning-table \.table thead th/);
 assert.match(css,/position:sticky/);
 assert.match(css,/overscroll-behavior-inline:contain/);
});

test('PWA Desktop : mise à jour contrôlée et aucun loader infini',()=>{
 assert.match(js,/Une version plus récente de NETHOR est prête/);
 assert.match(js,/data-action="pwa-update"/);
 assert.match(js,/if\(swReloading\)return/);
 assert.match(js,/controllerchange/);
 assert.match(index,/startupFailure/);
 assert.match(index,/NETHOR ne s’est pas chargé correctement/);
});

test('PWA : le module administration des comptes est présent dans tous les chemins de publication',()=>{
 assert.match(js,/from '\.\/account-admin\.js'/);
 assert.match(sw,/src\/ui\/account-admin\.js/);
 assert.match(workflow,/src\/ui\/account-admin\.js/);
 assert.match(dev,/\/src\/ui\/account-admin\.js/);
 assert.match(sw,/const CORE=\[/);
 assert.match(sw,/Promise\.allSettled\(OPTIONAL/);
 assert.doesNotMatch(sw,/supabase\.co/);
});

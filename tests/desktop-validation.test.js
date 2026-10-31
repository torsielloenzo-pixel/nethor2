import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const js=read('src/ui/live.js');
const css=read('staff-desktop.css');

test('Desktop : navigation planning directe et raccourcis disponibles',()=>{
 assert.match(js,/id="desktopPlanningDate"/);
 assert.match(js,/data-action="today"/);
 assert.match(js,/title="Alt \+ ←"/);
 assert.match(js,/event\.altKey/);
 assert.match(js,/ArrowLeft/);
 assert.match(js,/ArrowRight/);
});

test('Desktop : recherche planning et historique collaborateurs global',()=>{
 assert.match(js,/id="desktopPlanningSearch"/);
 assert.match(js,/id="collaboratorHistorySearch"/);
 assert.match(js,/Première apparition/);
 assert.match(js,/Dernière apparition/);
 assert.match(js,/Semaines disponibles/);
 assert.match(js,/weekSet:new Set\(\)/);
 assert.match(js,/Compte désactivé/);
 assert.match(js,/Sans compte associé/);
});

test('Desktop : absence de données et repos restent distincts',()=>{
 assert.match(js,/Donnée incomplète/);
 assert.match(js,/Aucun planning publié pour cette semaine/);
 assert.match(js,/INVALID_ROW/);
});

test('Desktop : barre latérale, tableau sticky et impression sont prévus',()=>{
 assert.match(js,/data-action="sidebar-toggle"/);
 assert.match(js,/print-planning/);
 assert.match(css,/desktop-sidebar-collapsed/);
 assert.match(css,/desktop-planning-table \.table thead th/);
 assert.match(css,/position:sticky/);
 assert.match(css,/@media print/);
 assert.match(css,/@page\{size:landscape/);
});

test('PWA Desktop : mise à jour visible sans rechargement en boucle applicatif',()=>{
 assert.match(js,/Une version plus récente de NETHOR est prête/);
 assert.match(js,/data-action="pwa-update"/);
 assert.match(js,/if\(swReloading\)return/);
 assert.match(js,/controllerchange/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {yearQueryBounds,publishedWeeksOfMonth,renderPlanningYear} from '../src/ui/planning-year.js';
import {getPublishedWeeksForYear} from '../src/data/planning-repository.js';
import {renderMobilePlanning} from '../src/ui/planning-mobile.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('année : affiche bien 12 mois, 365 jours et une grille lundi–dimanche',()=>{
 const html=renderPlanningYear({year:2026,weeks:[],today:'2026-10-19'});
 assert.equal((html.match(/class="n2py-month"/g)||[]).length,12);
 assert.equal((html.match(/data-year-day="/g)||[]).length,365);
 assert.match(html,/data-year-month="1"/);
 assert.match(html,/data-year-month="12"/);
 assert.match(html,/Janvier/);
 assert.match(html,/Décembre/);
 assert.match(html,/aria-label="Année précédente"/);
 assert.match(html,/aria-label="Année suivante"/);
 assert.match(html,/data-action="year-current"/);
 assert.match(html,/data-action="year-close"/);
 assert.match(html,/n2py-day not-published today/);
});
test('année bissextile : 29 février, et calcul des semaines traversant le nouvel an',async()=>{
 const html=renderPlanningYear({year:2028,weeks:['2027-12-27','2028-02-28'],today:'2028-02-29'});
 assert.equal((html.match(/data-year-day="/g)||[]).length,366);
 assert.ok(html.includes('data-year-day="2028-02-29"'));
 assert.deepEqual(yearQueryBounds(2026),{start:'2025-12-29',end:'2026-12-28'});
 assert.deepEqual(yearQueryBounds(2027),{start:'2026-12-28',end:'2027-12-27'});
 assert.equal(publishedWeeksOfMonth(2028,1,['2028-02-28']),1);
 await assert.rejects(getPublishedWeeksForYear({},2101),/Année invalide/);
});
test('cases de disponibilité inspirées de Nethor 1 et clic possible sur tous les jours',()=>{
 const html=renderPlanningYear({year:2026,weeks:['2025-12-29','2026-10-19'],today:'2026-10-19',selectedDay:'2026-10-20'});
 assert.match(html,/data-year-day="2026-01-01"[^>]*>1<i aria-hidden="true"><\/i>/);
 assert.match(html,/data-year-day="2026-10-19"/);
 assert.match(html,/data-year-day="2026-10-20"/);
 assert.match(html,/data-year-day="2026-03-15"/);
 assert.match(html,/planning non publié/);
 assert.match(html,/planning disponible/);
 assert.match(html,/class="n2py-day published today"/);
 assert.match(html,/class="n2py-day published selected"/);
});
test('Supabase : requête légère seulement sur les dates publiées, sous RLS',async()=>{
 const calls=[];const {start,end}=yearQueryBounds(2026);
 const client={from(table){calls.push(['from',table]);return {
  select(fields){calls.push(['select',fields]);return this},
  gte(col,value){calls.push(['gte',col,value]);return this},
  lte(col,value){calls.push(['lte',col,value]);return this},
  async order(field,options){calls.push(['order',field,options]);return {
   data:[{week_start:'2025-12-29'},{week_start:'2026-10-19'},{week_start:'2026-10-19'}],error:null
  }}
 }}};
 const dates=await getPublishedWeeksForYear(client,2026);
 assert.deepEqual(dates,['2025-12-29','2026-10-19']);
 assert.deepEqual(calls[0],['from','planning_weeks']);
 assert.deepEqual(calls[1],['select','week_start']);
 assert.deepEqual(calls[2],['gte','week_start',start]);
 assert.deepEqual(calls[3],['lte','week_start',end]);
 assert.equal(calls.at(-1)[0],'order');
});
test('l’ancienne vue semaine et jour reste inchangée, année visible uniquement si allowYear',()=>{
 const base={weekStart:'2026-10-19',selectedDay:'2026-10-19',view:'week',model:null,profiles:[],currentProfile:{}};
 const old=renderMobilePlanning(base);
 const mobile=renderMobilePlanning({...base,allowYear:true});
 assert.doesNotMatch(old,/data-action="year-view"/);
 assert.match(mobile,/data-action="year-view"/);
 assert.match(old,/data-action="week-view"/);
 assert.match(old,/data-action="day-view"/);
 assert.match(mobile,/Semaine/);
 assert.match(mobile,/Jour/);
});
test('intégration: état annuel, chargement, clic jour, responsive, PWA',()=>{
 const js=read('src/ui/live.js'),css=read('mobile.css'),sw=read('sw.js');
 const build=read('.github/workflows/preview-pages.yml'),dev=read('scripts/dev-server.js');
 for(const term of ['loadAnnualWeeks','getPublishedWeeksForYear','renderPlanningYear',
  "state.view==='year'","data-year-day","data-action","year-close","year-next"])
  assert.ok(js.includes(term),term);
 assert.match(js,/state\.week=mondayFor\(day\)/);
 assert.match(js,/state\.view='week'/);
 assert.match(js,/if\(smallScreen\(\)\&\&state\.view==='year'\)/);
 assert.match(js,/allowYear:smallScreen\(\)/);
 assert.match(css,/#app\.mobile-planning-active \.n2py-grid/);
 assert.match(css,/#app\.mobile-planning-active \.n2py-fixed/);
 assert.match(css,/position:sticky;top:-14px/);
 assert.match(css,/@media\(min-width:540px\) and \(max-width:760px\)/);
 for(const text of [sw,build,dev])assert.match(text,/planning-year\.js/);
 assert.match(sw,/nethor-mobile-drawer-recovery-sync-v22/);
});

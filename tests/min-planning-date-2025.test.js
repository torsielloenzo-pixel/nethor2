import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getPlanningWeek,getPublishedWeeksForYear,MIN_PLANNING_DATE,MIN_PLANNING_YEAR} from '../src/data/planning-repository.js';
import {yearQueryBounds,renderPlanningYear} from '../src/ui/planning-year.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('borne planning : le site commence au 01/01/2025',async()=>{
 assert.equal(MIN_PLANNING_DATE,'2025-01-01');
 assert.equal(MIN_PLANNING_YEAR,2025);
 await assert.rejects(()=>getPlanningWeek({},'2024-12-30'),/01\/01\/2025/);
 await assert.rejects(()=>getPublishedWeeksForYear({},2024),/Année invalide/);
 assert.equal(renderPlanningYear({year:2024,weeks:[]}), '');
 assert.deepEqual(yearQueryBounds(2025),{start:'2025-01-01',end:'2025-12-29'});
});

test('borne planning : les années futures restent autorisées',()=>{
 const html=renderPlanningYear({year:2028,weeks:[]});
 assert.match(html,/Janvier/);
 assert.match(html,/Décembre/);
 assert.match(html,/Année suivante/);
 assert.doesNotMatch(renderPlanningYear({year:2025,weeks:[]}),/data-action="year-prev" aria-label="Année précédente">/);
});

test('import manuel et worker Supabase refusent un classeur antérieur à 2025',()=>{
 assert.match(read('src/import/excel-structure.js'),/Planning antérieur au 01\/01\/2025 non pris en charge/);
 assert.match(read('supabase/functions/nethor-sync-auto-publish/excel-structure.js'),/Planning antérieur au 01\/01\/2025 non pris en charge/);
 assert.match(read('supabase/functions/nethor-sync-auto-publish/index.ts'),/model\.weekStart<"2025-01-01"/);
});

test('NethorSync 2.1.9 filtre avant hachage et upload',()=>{
 const ps=read('tools/nethor-sync/NethorSync.ps1');
 assert.equal(read('tools/nethor-sync/NethorSync-Version.txt').trim(),'2.1.9');
 assert.match(ps,/Get-PlanningFileDateHint/);
 assert.match(ps,/minimumPlanningDate=\[datetime\]::new\(2025,1,1\)/);
 assert.match(ps,/ignoredBefore2025/);
 assert.match(ps,/ignoredUndated/);
 assert.ok(ps.indexOf('Get-PlanningFileDateHint $candidateRelative')<ps.indexOf('Get-FileHash -LiteralPath $file.FullName'));
});

test('migration serveur : purge, contraintes et filtres NethorSync à partir de 2025',()=>{
 const sql=read('supabase/migrations/20261031_planning_min_date_2025.sql');
 assert.match(sql,/delete from public\.planning_weeks[\s\S]*week_start < date '2025-01-01'/);
 assert.match(sql,/planning_weeks_min_2025_check/);
 assert.match(sql,/planning_import_history_min_2025_check/);
 assert.match(sql,/private\.nethor_planning_filename_date/);
 assert.match(sql,/p_week_start < date '2025-01-01'/);
 assert.match(sql,/ignoredBefore2025OrUndated/);
 assert.match(sql,/from_2025_and_future/);
 assert.match(sql,/nethor_sync_file_history/);
 assert.match(sql,/nethor_sync_auto_publications/);
});

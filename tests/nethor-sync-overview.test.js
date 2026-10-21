import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canManageSync,syncHealth} from '../src/data/nethor-sync-control.js';
import {formatSyncTimestamp,isSyncOverviewRole,NETHOR_SYNC_INSTALLER_URL,renderSyncOverviewCard,prepareSyncChart,syncOverviewStatus} from '../src/ui/nethor-sync-overview.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-10-19T17:00:00Z');

test('Seuls administrateur et point de vente desktop obtiennent NethorSync',()=>{
 assert.equal(canManageSync('admin'),true);
 assert.equal(canManageSync('role_point-de-vente'),true);
 for(const role of ['responsable','employe','lecture_seule']){
  assert.equal(isSyncOverviewRole(role,true),false);
 }
 assert.equal(isSyncOverviewRole('admin',false),false);
 assert.equal(isSyncOverviewRole('role_point-de-vente',false),false);
});
test('Poste non installé : bouton installer, jamais un faux état actif',()=>{
 const html=renderSyncOverviewCard({loaded:true,loading:false,status:{installed:false},error:''},now);
 assert.equal(syncOverviewStatus({loaded:true,status:{installed:false}},now),'not-configured');
 assert.match(html,/Non installé \/ configuré/);
 assert.match(html,/data-action="nethor-sync-install"/);
 assert.doesNotMatch(html,/Dernière synchronisation/);
 assert.match(NETHOR_SYNC_INSTALLER_URL,/releases\/download\/nethor-sync2-latest\/NethorSync-Setup\.exe$/);
});
test('Poste opérationnel : date, heure, dernier transfert et nom de poste',()=>{
 const snapshot={loaded:true,status:{
  installed:true,deviceLabel:'CAISSE-03',lastSeenAt:'2026-10-19T16:59:00Z',
  lastCheckAt:'2026-10-19T16:55:00Z',lastTransferAt:'2026-10-19T15:30:00Z'
 }};
 const html=renderSyncOverviewCard(snapshot,now);
 assert.match(html,/Opérationnel/);
 assert.match(html,/19 octobre 2026/);
 assert.match(html,/18:55/);
 assert.match(html,/CAISSE-03/);
 assert.match(html,/Dernière synchronisation/);
 assert.match(html,/Dernier transfert de fichier/);
 assert.match(html,/Télécharger la correction 2\.1\.8/);
 assert.match(html,/data-action="nethor-sync-refresh"/);
 assert.equal(syncHealth(snapshot.status,now),'online');
});
test('Poste associé mais hors ligne : garder informations sans suggérer installation',()=>{
 const status={installed:true,deviceLabel:'BUREAU-01',lastSeenAt:'2026-10-19T14:00:00Z',lastCheckAt:'2026-10-19T13:30:00Z'};
 const html=renderSyncOverviewCard({loaded:true,status},now);
 assert.match(html,/Poste hors ligne/);
 assert.match(html,/BUREAU-01/);
 assert.match(html,/Télécharger la correction 2\.1\.8/);
});
test('Statut indisponible : interdire toute nouvelle installation',()=>{
 const html=renderSyncOverviewCard({loaded:false,error:'RPC error',status:null},now);
 assert.match(html,/État indisponible/);
 assert.doesNotMatch(html,/data-action="nethor-sync-install"/);
 assert.match(html,/Actualiser l’état/);
});
test('Les noms de postes Supabase sont échappés en HTML',()=>{
 const html=renderSyncOverviewCard({loaded:true,status:{installed:true,deviceLabel:'<img src=x onerror=alert(1)>',lastSeenAt:'2026-10-19T16:55:00Z'}},now);
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
});
test('Vue ensemble admin/PDV n’affiche ni couverture ni détection d’anomalies',()=>{
 const js=read('src/ui/live.js');
 const part=js.slice(js.indexOf('function pageHome(metrics){'),js.indexOf('function pagePlanning(metrics){'));
 const scope=part.slice(part.indexOf('if(isSyncOverviewRole('),part.indexOf('  return renderPageHeader(',part.indexOf('if(isSyncOverviewRole(')));
 assert.ok(scope.includes('renderSyncOverviewCard(state.nethorSync,Date.now(),syncChartPeriod)'));
 assert.ok(scope.includes('n2sync-home-content'));
 assert.ok(scope.indexOf('planningCard(metrics)')<scope.indexOf('renderSyncOverviewCard('));
 assert.doesNotMatch(scope,/Collaborateurs planifiés|Heures planifiées|n2sync-home-summary/);
 assert.ok(scope.includes('planningCard(metrics)'));
 assert.ok(!scope.includes('coverageCard(metrics)'));
 assert.ok(!scope.includes('alertsCard(metrics'));
 assert.ok(!scope.includes('Points à vérifier'));
 assert.match(js,/data-action='nethor-sync-install'|action==='nethor-sync-install'/);
});
test('Zip installer publié sans exposer de secret et sans cache PWA',()=>{
 const workflow=read('.github/workflows/preview-pages.yml');
 const sw=read('sw.js');
 const installer=read('tools/nethor-sync/Installer-Sync.ps1');
 assert.match(workflow,/nethor-sync-2.zip/);
 assert.match(workflow,/Installer-Sync.ps1/);
 assert.doesNotMatch(sw,/nethor-sync-2.zip/);
 assert.match(installer,/FolderBrowserDialog/);
 assert.match(installer,/Connect-NethorSync.ps1/);
 const scheduler=read('tools/nethor-sync/Register-NethorSyncTasks.ps1');
 assert.match(scheduler,/Hour=19/);
 assert.match(scheduler,/Hour=12/);
 assert.match(scheduler,/Days=126/);
 assert.match(scheduler,/Days=1/);
 assert.doesNotMatch(installer,/service_role|SUPABASE_SERVICE_ROLE/i);
});

test('EXE autonome : le packaging demande explicitement le dossier et travaille en arrière-plan',()=>{
 const spec=read('tools/nethor-sync/NethorSync2.iss');
 const runner=read('tools/nethor-sync/NethorSyncRunner.vbs');
 const workflow=read('.github/workflows/build-nethor-sync-exe.yml');
 assert.match(spec,/CreateInputDirPage/);
 assert.match(spec,/NethorSyncRunner.vbs/);
 assert.match(spec,/PrivilegesRequired=lowest/);
 assert.match(spec,/SW_SHOWNORMAL/);
 assert.match(runner,/shell.Run\(command, 0, True\)/i);
 assert.match(workflow,/gh release upload/);
 assert.match(workflow,/NethorSync2-Setup.exe/);
 assert.doesNotMatch(runner,/service_role|password|refresh_token/i);
});

test('Mode unique automatique, synchronisation ponctuelle et contrôles Windows non résidents',()=>{
 const ui=read('src/ui/nethor-sync-ui.js');
 const runner=read('tools/nethor-sync/NethorSyncRunner.vbs');
 const scheduler=read('tools/nethor-sync/Register-NethorSyncTasks.ps1');
 const installer=read('tools/nethor-sync/NethorSync2-218.iss');
 assert.match(ui,/Traitement en cours…/);
 assert.match(ui,/Réessayer la vérification/);
 assert.match(ui,/renderManualSyncPipeline\(status\)/);
 assert.doesNotMatch(ui,/data-action="sync-mode-manual"|data-action="sync-mode-automatic"/);
 assert.match(ui,/Mode : Automatique/);
 assert.match(ui,/pendingManual/);
 assert.match(runner,/Case "poll"/);
 assert.match(runner,/Case "update"/);
 assert.match(scheduler,/Mode='poll'/);
 assert.match(scheduler,/PT5M/);
 assert.match(scheduler,/Hour=19/);
 assert.match(scheduler,/Hour=12/);
 assert.match(installer,/Update-NethorSync\.ps1/);
 assert.doesNotMatch(installer,/Watch-NethorSync\.ps1/);
});

test('Graphique réel : périodes 7 / 30 jours, jours manquants à zéro',()=>{
 const entries=[
  {date:'2026-10-19',success:4,errors:1,transfers:2},
  {date:'2026-10-18',success:3,errors:0,transfers:1}
 ];
 const seven=prepareSyncChart(entries,now,7);
 assert.equal(seven.rows.length,7);
 assert.equal(seven.batches.length,7);
 assert.equal(seven.success,7);
 assert.equal(seven.errors,1);
 assert.equal(seven.transfers,3);
 assert.equal(seven.rows[0].success,0);
 const thirty=prepareSyncChart(entries,now,30);
 assert.equal(thirty.rows.length,30);
 assert.equal(thirty.batches.length,6);
 assert.equal(thirty.success,7);
});
test('Absence de données NethorSync : jamais de chiffres fictifs',()=>{
 const snapshot={loaded:true,historyLoaded:true,history:[],status:{
  installed:true,deviceLabel:'MSI',lastSeenAt:'2026-10-19T16:59:00Z'
 }};
 const html=renderSyncOverviewCard(snapshot,now);
 assert.match(html,/Aucune vérification enregistrée/);
 assert.match(html,/nethor-sync-chart-7/);
 assert.match(html,/nethor-sync-chart-30/);
 assert.doesNotMatch(html,/Fichiers Excel/);
 const withData=renderSyncOverviewCard({...snapshot,history:[
  {date:'2026-10-19',success:5,errors:2,transfers:1}
 ]},now,30);
 assert.match(withData,/Taux de réussite/);
 assert.match(withData,/Cycles avec transfert/);
 assert.match(withData,/71 %/);
});
test('Connexion historique sécurisée et fonctionnalité limitée au desktop gestionnaire',()=>{
 const live=read('src/ui/live.js');
 const control=read('src/data/nethor-sync-control.js');
 assert.match(live,/Promise\.allSettled\(\[readSyncStatus\(client\),readSyncHistory\(client\),readSyncAutoPublications\(client,\{limit:20\}\),readSyncDiagnostics\(client,\{limit:8\}\),readSyncHistoricalSummary\(client\)\]\)/);
 assert.match(live,/action==='nethor-sync-chart-30'/);
 assert.match(control,/client\.rpc\('nethor_sync_history',\{p_days:30\}\)/);
});

test('Les téléchargements de NethorSync utilisent la version MSI compatible et le bon nom',()=>{
 const side=read('src/ui/nethor-sync-ui.js');
 const app=read('src/ui/live.js');
 const pipeline=read('.github/workflows/build-nethor-sync-compat.yml');
 assert.match(side,/releases\/download\/nethor-sync2-latest\/NethorSync-Setup\.exe/);
 assert.match(side,/ouvrez NethorSync-Setup\.exe/i);
 assert.match(app,/NethorSync-Setup\.exe/);
 assert.match(pipeline,/ref: 55b1d728aa770d2e4bd875f62521c7a6271fbcd4/);
 assert.match(pipeline,/NethorSync-Setup\.exe/);
 assert.doesNotMatch(NETHOR_SYNC_INSTALLER_URL,/NethorSync2-Setup\.exe/);
});

test('Le transfert seul ne prétend pas que le planning est publié',()=>{
 const base={loaded:true,status:{installed:true,lastSeenAt:'2026-10-19T16:59:00Z'},historyLoaded:true,history:[]};
 const waiting=renderSyncOverviewCard({...base,autoPublications:[{status:'processing',fileName:'PLANNING.xls',when:'2026-10-19T16:00:00Z'}]},now);
 assert.match(waiting,/Analyse Excel en cours/);
 assert.doesNotMatch(waiting,/Planning publié pour toute l’équipe/);
 const published=renderSyncOverviewCard({...base,autoPublications:[{status:'published',fileName:'PLANNING.xls',weekStart:'2026-10-19',when:'2026-10-19T16:00:00Z'}]},now);
 assert.match(published,/Planning publié pour toute l’équipe/);
 const unsafe=renderSyncOverviewCard({...base,autoPublications:[{status:'rejected',fileName:'<script>',detail:'Couleurs <inconnues>',when:'2026-10-19T16:00:00Z'}]},now);
 assert.match(unsafe,/Fichier Excel refusé/);
 assert.doesNotMatch(unsafe,/<script>/);
 assert.match(unsafe,/&lt;inconnues&gt;/);
});
test('Les traitements automatiques vérifient leur ticket et bloquent les archives antérieures',()=>{
 const source=read('supabase/migrations/20261019_nethor_sync_auto_publish.sql');
 const guards=read('supabase/migrations/20261019_nethor_sync_auto_guards.sql');
 const worker=read('supabase/functions/nethor-sync-auto-publish/index.ts');
 assert.match(source,/new.change_kind <> 'replaced'/);
 assert.match(source,/new.modified_at <= new.previous_modified_at/);
 assert.match(source,/new.modified_at < now\(\) - interval '14 days'/);
 assert.match(source,/j.attempts<4/);
 assert.match(guards,/j.dry_run/);
 assert.match(worker,/SHA-256/);
 assert.match(worker,/resolveExcelColor/);
 assert.match(worker,/parsePlanningWorkbook/);
});

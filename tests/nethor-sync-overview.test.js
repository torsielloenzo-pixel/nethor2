import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canManageSync,syncHealth} from '../src/data/nethor-sync-control.js';
import {formatSyncTimestamp,isSyncOverviewRole,NETHOR_SYNC_INSTALLER_URL,renderSyncOverviewCard,syncOverviewStatus} from '../src/ui/nethor-sync-overview.js';
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
 assert.match(NETHOR_SYNC_INSTALLER_URL,/releases\/download\/nethor-sync2-latest\/NethorSync2-Setup\.exe$/);
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
 assert.doesNotMatch(html,/data-action="nethor-sync-install"/);
 assert.match(html,/data-action="nethor-sync-refresh"/);
 assert.equal(syncHealth(snapshot.status,now),'online');
});
test('Poste associé mais hors ligne : garder informations sans suggérer installation',()=>{
 const status={installed:true,deviceLabel:'BUREAU-01',lastSeenAt:'2026-10-19T14:00:00Z',lastCheckAt:'2026-10-19T13:30:00Z'};
 const html=renderSyncOverviewCard({loaded:true,status},now);
 assert.match(html,/Poste hors ligne/);
 assert.match(html,/BUREAU-01/);
 assert.doesNotMatch(html,/data-action="nethor-sync-install"/);
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
 assert.ok(scope.includes('renderSyncOverviewCard(state.nethorSync)'));
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSyncDiagnostics} from '../src/ui/nethor-sync-ui.js';
import {readSyncDiagnostics} from '../src/data/nethor-sync-control.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('L’erreur technique est visible dans Nethor2 avec code HTTP, volume et heure',()=>{
 const report={id:32,at:'2026-10-19T16:00:00Z',
   stage:'storage_upload',code:'request_rejected',httpStatus:400,
   scanned:338,failed:338,transferred:0,clientVersion:'2.1.5',
   breakdown:[{stage:'storage_upload',code:'request_rejected',httpStatus:400,count:338}]};
 const html=renderSyncDiagnostics([report]);
 assert.match(html,/Transfert Supabase/);
 assert.match(html,/HTTP 400/);
 assert.match(html,/338 erreur\(s\) sur 338 fichiers analysés/);
 assert.match(html,/Agent 2.1.5/);
 assert.match(html,/Diagnostic #32/);
 assert.doesNotMatch(html,/deviceId|secret|Bearer/);
});
test('Diagnostic HTML échappé, pas de fuite depuis champs serveur',()=>{
 const html=renderSyncDiagnostics([{id:'<script>',stage:'inconnu',code:'unexpected',
   scanned:1,failed:1,at:'2026-10-19T16:00:00Z',clientVersion:'<img src=x>',breakdown:[]}]);
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
 assert.match(renderSyncDiagnostics([]),/Aucun rapport automatique reçu/);
 assert.match(renderSyncDiagnostics([],'indisponible'),/Rapports d’erreurs indisponibles/);
});
test('Lecture uniquement via RPC de diagnostic sécurisé',async()=>{
 const calls=[];
 const client={rpc:async (name,args)=>{calls.push({name,args});return {data:[],error:null};}};
 assert.deepEqual(await readSyncDiagnostics(client,{limit:12}),[]);
 assert.deepEqual(calls,[{name:'nethor_sync_diagnostic_history',args:{p_limit:12}}]);
 await assert.rejects(()=>readSyncDiagnostics(client,{limit:200}),/Limite/);
});
test('Poste Windows agrège erreurs par type sans transmettre fichiers ni secrets',()=>{
 const agent=read('tools/nethor-sync/NethorSync.ps1');
 const migration=read('supabase/migrations/20261019_nethor_sync_remote_diagnostics.sql');
 assert.match(agent,/function Add-SafeSyncError/);
 assert.match(agent,/function Send-SafeSyncDiagnostic/);
 assert.match(agent,/nethor_sync_submit_diagnostic/);
 assert.match(agent,/Get-SafeSyncError \$Failure/);
 assert.match(agent,/if \(\$code -eq 400 -or \$code -eq 409\)/);
 assert.match(migration,/private\.nethor_sync_diagnostics/);
 assert.match(migration,/private\.session_is_active\(\)/);
 assert.match(migration,/p\.role in \('admin','role_point-de-vente'\)/);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/cron\.schedule\('nethor-sync-diagnostics-retention'/);
 assert.doesNotMatch(migration,/raw_message|exception_message|file_path|file_name|access_token/);
});

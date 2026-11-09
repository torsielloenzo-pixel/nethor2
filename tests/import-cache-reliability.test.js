import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('PWA : le service worker ne conserve que le shell et abandonne un cache incomplet',()=>{
 const sw=read('sw.js');
 assert.match(sw,/nethor-shell-import-cache-v\\d+/);
 assert.match(sw,/await caches\.delete\(CACHE_NAME\);[\s\S]*?await cache\.addAll/);
 assert.match(sw,/catch\(error\)[\s\S]*?await caches\.delete\(CACHE_NAME\)/);
 assert.match(sw,/fetch\(event\.request,\{cache:'no-store'\}\)/);
 assert.doesNotMatch(sw,/supabase\.co|planning_weeks|Authorization/i);
});

test('PWA : le pipeline publie tout src et vérifie chaque ressource du shell',()=>{
 const workflow=read('.github/workflows/preview-pages.yml');
 const verifier=read('scripts/verify-pwa-shell.py');
 assert.match(workflow,/cp -R src _site\//);
 assert.match(workflow,/verify-pwa-shell\.py _site sw\.js/);
 assert.match(verifier,/Ressources PWA absentes du déploiement/);
 assert.match(verifier,/const\\s\+SHELL/);
});

test('Import manuel : archive par SHA-256, no-op identique et mise à jour SW hors cache HTTP',()=>{
 const live=read('src/ui/live.js');
 assert.match(live,/crypto\.subtle\.digest\('SHA-256'/);
 assert.match(live,/sourceSha256\+'-'\+safe/);
 assert.match(live,/outcome\.status==='unchanged'/);
 assert.match(live,/updateViaCache:'none'/);
 assert.match(live,/swRegistration\?\.update/);
});

test('Import serveur : validation stricte et révision inchangée pour un planning identique',()=>{
 const sql=read('supabase/migrations/20261109_import_reliability.sql');
 assert.match(sql,/nethor_planning_model_valid/);
 assert.match(sql,/jsonb_array_length\(v_row\)<>58/);
 assert.match(sql,/status','unchanged'/);
 assert.match(sql,/for update/);
 assert.match(sql,/current_revision/);
});

test('NethorSync : un fichier modifié pendant son hash n est pas transféré',()=>{
 const ps=read('tools/nethor-sync/NethorSync.ps1');
 assert.match(ps,/\$sizeBefore = \[long\]\$file\.Length/);
 assert.match(ps,/\$file\.Refresh\(\)/);
 assert.match(ps,/\$entry\.status = "still_writing"/);
 assert.match(ps,/\$result\.status -in @\("staged","already_staged"\)/);
});

test('Import automatique : l empreinte du fichier est conservée dans le modèle publié',()=>{
 const edge=read('supabase/functions/nethor-sync-auto-publish/index.ts');
 assert.match(edge,/sourceSha256/);
 assert.match(edge,/parseFile\(bytes,name,key,modified,uploaded,sourceKind,hash\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('manifest.webmanifest'));

test('identité Nethor unique pour PWA, iPhone et bureau',()=>{
 assert.equal(manifest.name,'Nethor');assert.equal(manifest.short_name,'Nethor');
 for(const field of ['id','scope','start_url'])assert.equal(manifest[field],'https://nethor.fr/');
 assert.equal(manifest.display,'standalone');
});

test('un seul logo dans favicon, Safari, PWA et partage des liens',()=>{
 assert.equal(manifest.icons.length,4);
 assert.ok(manifest.icons.every(icon=>icon.src.includes('nethor-logo-')||icon.src==='./assets/icon.svg'));
 for(const size of ['192x192','512x512'])assert.ok(manifest.icons.some(i=>i.sizes===size&&i.type==='image/png'));
 assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
 const html=read('index.html');
 assert.match(html,/apple-touch-icon[^>]+nethor-logo-180-v8\.png/);
 assert.match(html,/favicon\.ico/);
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\.\/assets\/icon\.svg"/);
 assert.match(html,/apple-mobile-web-app-title" content="Nethor"/);
 assert.match(html,/og:image" content="https:\/\/nethor\.fr\/assets\/nethor-logo-512-v8\.png"/);
 assert.match(read('scripts/generate-pwa-icons.py'),/SOURCE = ROOT \/ "assets" \/ "icon\.svg"/);
});

test('logo homogène dans connexion, entêtes, menu et installation',()=>{
 const js=read('src/ui/live.js');
 for(const cls of ['nethor-login-logo','nethor-sidebar-logo','nethor-header-logo'])
  assert.ok(js.includes('class="'+cls+'" src="./assets/icon.svg"'),cls);
 assert.ok(js.includes('class="pwa-home-logo" src="./assets/nethor-logo-192-v8.png"'));
 assert.equal((js.match(/data-action="install-pwa"/g)||[]).length,1);
 assert.match(js,/personal\+homePwaInstall\(\)\+summary/);
 assert.match(js,/homePwaInstall\(\)\+'<\/header>'/);
 const settings=js.slice(js.indexOf('function pageSettings(){'),js.indexOf('function pageImport(){'));
 const login=js.slice(js.indexOf('function renderLogin('),js.indexOf('function renderShell(){'));
 assert.doesNotMatch(settings,/data-action="install-pwa"/);
 assert.doesNotMatch(login,/data-action="install-pwa"/);
});

test('service worker ne cache que la coquille statique et les nouveaux logos',()=>{
 const sw=read('sw.js');
 assert.match(sw,/nethor-staff-responsive-desktop-v12/);
 assert.ok(sw.includes('src/ui/planning-mobile.js'));
 assert.ok(sw.includes('src/ui/layout-role.js'));
 assert.ok(sw.includes('staff-desktop.css'));
 for(const file of ['nethor-logo-180-v8.png','nethor-logo-192-v8.png','nethor-logo-512-v8.png','favicon.ico'])
   assert.ok(sw.includes(file));
 assert.doesNotMatch(sw,/supabase\.co/);
 const workflow=read('.github/workflows/preview-pages.yml');
 assert.match(workflow,/generate-pwa-icons\.py/);
 assert.match(workflow,/test -s _site\/favicon\.ico/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

test('PWA Nethor unique sur le domaine racine officiel',()=>{
  assert.equal(manifest.name,'Nethor');
  assert.equal(manifest.short_name,'Nethor');
  for(const field of ['id','start_url','scope'])assert.equal(manifest[field],'https://nethor.fr/');
  assert.equal(manifest.display,'standalone');
});

test('toutes les tailles de PWA réutilisent le logo Planning bleu',()=>{
  assert.ok(manifest.icons.length>=3);
  assert.ok(manifest.icons.every(icon=>icon.src.includes('planning')));
  for(const size of ['192x192','512x512'])assert.ok(manifest.icons.some(i=>i.sizes===size&&i.type==='image/png'));
  assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
  const html=read('index.html');
  assert.match(html,/apple-touch-icon[^>]+icon-180-planning-v4\.png/);
  assert.match(html,/rel="icon"[^>]+icon-planning-pwa\.svg/);
  assert.match(html,/apple-mobile-web-app-title" content="Nethor"/);
  assert.match(read('scripts/generate-pwa-icons.py'),/icon-planning-pwa\.svg/);
  const icon=read('assets/icon-planning-pwa.svg');
  assert.match(icon,/m9 16 2 2 4-4/); // même validation que dans le menu Planning
  assert.match(icon,/#315fc9/);
});

test("une seule commande d'installation, uniquement sur Accueil",()=>{
  const js=read('src/ui/live.js');
  const actions=js.match(/data-action="install-pwa"/g)||[];
  assert.equal(actions.length,1);
  assert.match(js,/function homePwaInstall\(/);
  assert.match(js,/personal\+homePwaInstall\(\)\+summary/);
  const settings=js.slice(js.indexOf('function pageSettings(){'),js.indexOf('function pageImport(){'));
  const login=js.slice(js.indexOf('function renderLogin('),js.indexOf('function renderShell(){'));
  assert.doesNotMatch(settings,/install-pwa/);
  assert.doesNotMatch(login,/install-pwa/);
});

test('service worker versionné, sans mise en cache des données RH',()=>{
  const sw=read('sw.js');
  assert.match(sw,/nethor-personal-mobile-home-v6/);
  assert.match(sw,/src\/domain\/personal-overview\.js/);
  assert.match(sw,/icon-planning-pwa\.svg/);
  assert.doesNotMatch(sw,/supabase\.co/);
  assert.match(read('.github/workflows/preview-pages.yml'),/manifest\.webmanifest CNAME _site/);
});

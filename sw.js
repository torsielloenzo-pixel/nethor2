// NETHOR 2 — cache strictement limité à la coquille statique.
// Aucune donnée RH, requête Supabase, session, token ou réponse API n'est mise en cache.
const CACHE_PREFIX='nethor-shell-';
const CACHE_NAME='nethor-shell-auth-sync-state-v57';
const SHELL=['./','./index.html','./styles.css','./live.css','./mobile.css','./mobile-sync-simple.css','./staff-desktop.css','./planning-desktop-agenda.css','./nethor-sync.css','./nethor-sync-import-guide.css','./nethor-account-ui.css','./nethor-dashboard.css','./nethor-promotions.css','./nethor-history-browser.css','./nethor-flow.css','./nethor-flow.js','./src/ui/live.js','./src/ui/mobile-zoom.js','./src/ui/settings-security.js','./src/ui/account-admin.js','./src/ui/overview-dashboard.js','./src/ui/recovery-prompt.js','./src/ui/nethor-sync-overview.js','./src/ui/nethor-sync-import-guide.js','./src/ui/mobile-sync-summary.js','./src/ui/nethor-sync-ui.js','./src/ui/import-history.js','./src/ui/nethor-promo.js','./src/ui/layout-role.js','./src/ui/planning-mobile.js','./src/ui/planning-desktop-colors.js','./src/ui/planning-desktop-agenda.js','./src/ui/planning-desktop-editor.js','./src/ui/planning-year.js','./src/ui/personal-planning-history.js','./src/ui/team-access.js','./src/config/public.js','./src/auth/session-gate.js','./src/auth/logout-policy.js','./src/auth/login-identifier.js','./src/auth/account-security.js','./src/data/planning-repository.js','./src/data/nethor-sync-control.js','./src/data/nethor-sync-cloud-audit.js','./src/data/mobile-sync-summary.js','./src/data/planning-notifications.js','./src/data/personal-planning-history.js','./src/data/calendar-subscription.js','./src/import/excel-structure.js','./src/domain/planning-core.js','./src/domain/employee-linker.js','./src/domain/personal-overview.js','./assets/icon.svg','./assets/nethor-logo-16-v8.png','./assets/nethor-logo-32-v8.png','./assets/nethor-logo-180-v8.png','./assets/nethor-logo-192-v8.png','./assets/nethor-logo-512-v8.png','./favicon.ico','./manifest.webmanifest'];

const shellPathSet=new Set(SHELL.map(path=>new URL(path,self.registration.scope).pathname));

self.addEventListener('install',event=>event.waitUntil((async()=>{
  // En cas de fichier manquant, ne jamais laisser un cache de version partiellement rempli.
  await caches.delete(CACHE_NAME);
  const cache=await caches.open(CACHE_NAME);
  try{
    const requests=SHELL.map(path=>new Request(path,{cache:'reload'}));
    await cache.addAll(requests);
  }catch(error){
    await caches.delete(CACHE_NAME);
    throw error;
  }
  await self.skipWaiting();
})()));

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')void self.skipWaiting();
  if(event.data?.type==='GET_CACHE_VERSION'&&event.source?.postMessage){
    event.source.postMessage({type:'CACHE_VERSION',version:CACHE_NAME});
  }
});

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>
    (key.startsWith(CACHE_PREFIX)||key.startsWith('nethor2-shell-')||key.startsWith('nethor-pwa-')||
     key.startsWith('nethor-brand-')||key.startsWith('nethor-staff-')||key.startsWith('nethor-mobile-')||
     key.startsWith('nethor-mobile-flow-'))&&key!==CACHE_NAME
  ).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!shellPathSet.has(url.pathname))return;
  event.respondWith((async()=>{
    // Network-first sans réutiliser le cache HTTP du navigateur : le shell actif
    // correspond ainsi au déploiement réellement disponible sur GitHub Pages.
    try{
      const response=await fetch(event.request,{cache:'no-store'});
      if(response.ok&&response.type==='basic'){
        const cache=await caches.open(CACHE_NAME);
        await cache.put(new Request(url.pathname),response.clone());
      }
      return response;
    }catch(_){
      const cache=await caches.open(CACHE_NAME);
      return (await cache.match(new Request(url.pathname)))||Response.error();
    }
  })());
});

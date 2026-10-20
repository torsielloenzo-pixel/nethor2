// Nethor 2 — shell statique uniquement. Jamais de données RH, de tokens ou d'appels Supabase en cache.
const CACHE_NAME='nethor-settings-groups-v25';
const SHELL=['./','./index.html','./styles.css','./live.css','./mobile.css','./staff-desktop.css','./nethor-sync.css','./nethor-sync-import-guide.css','./src/ui/live.js','./src/ui/mobile-zoom.js','./src/ui/settings-security.js','./src/ui/recovery-prompt.js','./src/ui/nethor-sync-overview.js','./src/ui/nethor-sync-import-guide.js','./src/ui/mobile-sync-summary.js','./src/ui/nethor-sync-ui.js','./src/ui/import-history.js','./src/ui/layout-role.js','./src/ui/planning-mobile.js','./src/ui/planning-year.js','./src/ui/team-access.js','./src/config/public.js','./src/auth/session-gate.js','./src/auth/login-identifier.js','./src/auth/account-security.js','./src/data/planning-repository.js','./src/data/nethor-sync-control.js','./src/data/mobile-sync-summary.js','./src/import/excel-structure.js','./src/domain/planning-core.js','./src/domain/employee-linker.js','./src/domain/personal-overview.js','./assets/icon.svg','./assets/nethor-logo-16-v8.png','./assets/nethor-logo-32-v8.png','./assets/nethor-logo-180-v8.png','./assets/nethor-logo-192-v8.png','./assets/nethor-logo-512-v8.png','./favicon.ico','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await cache.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>(key.startsWith('nethor2-shell-')||key.startsWith('nethor-pwa-')||key.startsWith('nethor-brand-')||key.startsWith('nethor-staff-')||key.startsWith('nethor-mobile-'))&&key!==CACHE_NAME).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(!SHELL.some(file=>new URL(file,self.registration.scope).pathname===url.pathname))return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(event.request,{cache:'no-cache'});
   if(response.ok&&response.type==='basic'){
     const cache=await caches.open(CACHE_NAME);
     await cache.put(event.request,response.clone());
   }
   return response;
  }catch(_){return (await caches.match(event.request))||Response.error();}
 })());
});
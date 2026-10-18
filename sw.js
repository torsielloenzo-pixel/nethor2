// Nethor 2 — shell statique uniquement. Jamais de données RH, de tokens ou d'appels Supabase en cache.
const CACHE_NAME='nethor-pwa-personal-home-v6';
const SHELL=['./','./index.html','./styles.css','./live.css','./mobile.css','./src/ui/live.js','./src/ui/team-access.js','./src/config/public.js','./src/auth/session-gate.js','./src/auth/login-identifier.js','./src/data/planning-repository.js','./src/import/excel-structure.js','./src/domain/planning-core.js','./src/domain/employee-linker.js','./src/domain/personal-overview.js','./assets/icon-planning-pwa.svg','./assets/icon-180-planning-v4.png','./assets/icon-192-planning-v4.png','./assets/icon-512-planning-v4.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>(key.startsWith('nethor2-shell-')||key.startsWith('nethor-pwa-'))&&key!==CACHE_NAME).map(key=>caches.delete(key)));
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
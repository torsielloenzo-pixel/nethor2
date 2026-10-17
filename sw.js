// Cache limité au code de démonstration — jamais aux données RH, aux sessions ou aux réponses API.
const CACHE_NAME='nethor2-shell-v1';
const SHELL=['./','./index.html','./styles.css','./src/ui/app.js','./src/import/import-preview.js','./src/import/excel-structure.js','./src/domain/planning-core.js','./src/domain/employee-linker.js','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith('nethor2-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(!SHELL.some(file=>new URL(file,self.registration.scope).pathname===url.pathname))return;
 event.respondWith((async()=>{
   try{
     const response=await fetch(event.request,{cache:'no-cache'});
     if(response.ok&&response.type==='basic'){const cache=await caches.open(CACHE_NAME);await cache.put(event.request,response.clone());}
     return response;
   }catch(_){
     return (await caches.match(event.request))||Response.error();
   }
 })());
});
// Serveur local sans dépendance, réservé à l'aperçu statique.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const allowed=new Set([
  '/','/index.html','/reset-password.html','/styles.css','/live.css','/mobile.css','/staff-desktop.css','/sw.js','/manifest.webmanifest','/assets/icon.svg','/favicon.ico','/assets/nethor-logo-16-v8.png','/assets/nethor-logo-32-v8.png','/assets/nethor-logo-48-v8.png','/assets/nethor-logo-180-v8.png','/assets/nethor-logo-192-v8.png','/assets/nethor-logo-256-v8.png','/assets/nethor-logo-512-v8.png',
  '/src/ui/live.js','/src/ui/team-access.js','/src/ui/layout-role.js','/src/ui/planning-mobile.js','/src/ui/settings-security.js','/src/auth/session-gate.js','/src/auth/account-security.js','/src/auth/password-recovery-page.js','/src/auth/login-identifier.js','/src/data/planning-repository.js','/src/config/public.js','/src/import/excel-structure.js',
  '/src/domain/planning-core.js','/src/domain/employee-linker.js'
]);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Port invalide');
const server=createServer(async(req,res)=>{
  let path;
  try{path=decodeURIComponent(new URL(req.url||'/', 'http://localhost').pathname);}
  catch{res.writeHead(400);res.end();return;}
  if((req.method!=='GET'&&req.method!=='HEAD')||!allowed.has(path)){res.writeHead(404);res.end('Not found');return;}
  const filename=path==='/'?'/index.html':path;
  try{
    const bytes=await readFile(resolve(root,'.'+filename));
    const ext=filename.slice(filename.lastIndexOf('.'));
    res.writeHead(200,{
      'Content-Type':mime[ext]||'application/octet-stream',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'self' https://cdn.sheetjs.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://gioxrpaiwogqqtakjpnv.supabase.co wss://gioxrpaiwogqqtakjpnv.supabase.co; manifest-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
    });
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Nethor 2 aperçu : http://127.0.0.1:'+port));
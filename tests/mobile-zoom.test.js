import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DESKTOP_VIEWPORT,MOBILE_VIEWPORT,shouldLockMobileZoom,installMobileZoomLock} from '../src/ui/mobile-zoom.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function environment({width=390,coarse=true,userAgent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}={}){
 const handlers={};
 const viewport={value:'',setAttribute(key,value){assert.equal(key,'content');this.value=value;}};
 const classes=new Map();
 const doc={
  querySelector(query){return query==='meta[name="viewport"]'?viewport:null;},
  documentElement:{classList:{toggle(key,on){classes.set(key,on);}}},
  addEventListener(key,fn,options){handlers[key]={fn,options};}
 };
 const pointer={matches:coarse,addEventListener(key,fn){handlers['pointer-'+key]={fn};}};
 const win={
  innerWidth:width,navigator:{userAgent},
  matchMedia(){return pointer;},
  addEventListener(key,fn){handlers['window-'+key]={fn};}
 };
 installMobileZoomLock(win,doc);
 return {win,doc,viewport,classes,handlers,pointer};
}

test('le zoom est verrouillé sur mobile/PWA, indépendamment de portrait ou paysage',()=>{
 assert.equal(shouldLockMobileZoom({coarsePointer:true,width:390}),true);
 assert.equal(shouldLockMobileZoom({phoneAgent:true,width:896}),true);
 assert.equal(shouldLockMobileZoom({coarsePointer:true,width:1024}),true);
 assert.equal(shouldLockMobileZoom({coarsePointer:true,width:1100}),false);
});

test('un ordinateur avec souris conserve le zoom, même fenêtre étroite',()=>{
 assert.equal(shouldLockMobileZoom({coarsePointer:false,phoneAgent:false,width:390}),false);
 const env=environment({width:520,coarse:false,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'});
 assert.equal(env.viewport.value,DESKTOP_VIEWPORT);
 assert.equal(env.classes.get('nethor-zoom-locked'),false);
});

test('sur téléphone, viewport interdit zoom/dezoom et gestes multitouch',()=>{
 const env=environment();
 assert.equal(env.viewport.value,MOBILE_VIEWPORT);
 assert.match(env.viewport.value,/maximum-scale=1/);
 assert.match(env.viewport.value,/minimum-scale=1/);
 assert.match(env.viewport.value,/user-scalable=no/);
 assert.equal(env.classes.get('nethor-zoom-locked'),true);
 assert.equal(env.handlers.touchmove.options.passive,false);
 let blocked=false;
 env.handlers.touchmove.fn({touches:[{},{}],preventDefault(){blocked=true;}});
 assert.equal(blocked,true);
 blocked=false;
 env.handlers.touchmove.fn({touches:[{}],preventDefault(){blocked=true;}});
 assert.equal(blocked,false,'le défilement à un doigt reste disponible');
 env.handlers.gesturestart.fn({preventDefault(){blocked=true;}});
 assert.equal(blocked,true,'le geste Safari pinch est bloqué');
});

test('le verrouillage se réajuste si le terminal ou le pointage change',()=>{
 const env=environment({width:920});
 env.win.innerWidth=1250;
 env.handlers['window-resize'].fn();
 assert.equal(env.viewport.value,DESKTOP_VIEWPORT);
 env.win.innerWidth=896;
 env.handlers['window-resize'].fn();
 assert.equal(env.viewport.value,MOBILE_VIEWPORT);
});

test('les pages mobiles gardent le défilement et les champs sans zoom iOS',()=>{
 const css=read('mobile.css');
 assert.match(css,/html\.nethor-zoom-locked #app \{/);
 assert.match(css,/touch-action:pan-x pan-y;/);
 assert.doesNotMatch(css,/html\.nethor-zoom-locked #app \*/);
 assert.match(css,/font-size:16px !important/);
 const js=read('src/ui/live.js');
 assert.match(js,/import \{installMobileZoomLock\} from '\.\/mobile-zoom\.js'/);
 assert.match(js,/installMobileZoomLock\(\)/);
 const workflow=read('.github/workflows/preview-pages.yml');
 const sw=read('sw.js'),server=read('scripts/dev-server.js');
 for(const item of [workflow,sw,server])assert.match(item,/mobile-zoom\.js/);
 assert.match(sw,/const CACHE_NAME='nethor-[^']+-v\\d+'/);
});

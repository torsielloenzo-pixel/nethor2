// Nethor — blocage du zoom tactile limité aux téléphones / PWA mobiles.
// Préserve le défilement à un doigt, les clics et le zoom des navigateurs desktop.
export const DESKTOP_VIEWPORT='width=device-width, initial-scale=1, viewport-fit=cover';
export const MOBILE_VIEWPORT='width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export function shouldLockMobileZoom({coarsePointer=false,phoneAgent=false,width=Infinity}={}){
 return (coarsePointer===true||phoneAgent===true)&&Number.isFinite(width)&&width<=1024;
}

export function installMobileZoomLock(win=window,doc=document){
 const viewport=doc.querySelector('meta[name="viewport"]');
 if(!viewport||!win.matchMedia)return;
 const coarse=win.matchMedia('(hover: none) and (pointer: coarse)');
 const mobileAgent=/iPhone|iPod|Android.+Mobile|Windows Phone|Mobile Safari/i.test(win.navigator?.userAgent||'');
 let locked=false;
 const apply=()=>{
  locked=shouldLockMobileZoom({coarsePointer:coarse.matches,phoneAgent:mobileAgent,width:win.innerWidth});
  viewport.setAttribute('content',locked?MOBILE_VIEWPORT:DESKTOP_VIEWPORT);
  doc.documentElement.classList.toggle('nethor-zoom-locked',locked);
 };
 const preventPinch=event=>{if(locked&&event.touches?.length>1)event.preventDefault();};
 const preventIOSGesture=event=>{if(locked)event.preventDefault();};
 doc.addEventListener('touchmove',preventPinch,{passive:false});
 doc.addEventListener('gesturestart',preventIOSGesture,{passive:false});
 doc.addEventListener('gesturechange',preventIOSGesture,{passive:false});
 win.addEventListener('resize',apply,{passive:true});
 coarse.addEventListener?.('change',apply);
 apply();
}

/* NETHOR FLOW: progressive enhancement, no changes to navigation/data logic. */
(()=>{
'use strict';
const mobile=()=>window.matchMedia('(max-width:760px)').matches;
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const order=['home','planning','anomalies','team','import','history','settings'];
let previous='',direction=1,lastScreen=null,lastNav=null,screenObserver=null,navObserver=null;
function active(nav){return nav?.querySelector('button.active[data-page]');}
function indicator(){
 const nav=document.querySelector('.live-navigator');
 if(!nav||!mobile())return;
 const btn=active(nav);if(!btn)return;
 const nr=nav.getBoundingClientRect(),br=btn.getBoundingClientRect();
 nav.style.setProperty('--flow-left',Math.round(br.left-nr.left)+'px');
 nav.style.setProperty('--flow-width',Math.round(br.width)+'px');
}
function onScreen(){
 const screen=document.querySelector('#screen'),nav=document.querySelector('.live-navigator');
 if(!screen||!nav||!mobile())return;
 const page=active(nav)?.dataset.page;
 if(!page)return;
 if(page!==previous){
   const old=previous;
   previous=page;
   if(old){
     direction=(order.indexOf(page)>=order.indexOf(old))?1:-1;
     if(!reduced()){
       screen.classList.remove('flow-enter-forward','flow-enter-backward');
       void screen.offsetWidth;
       screen.classList.add(direction>0?'flow-enter-forward':'flow-enter-backward');
     }
     const btn=active(nav);
     btn?.classList.remove('flow-pop');
     if(btn&&!reduced()){void btn.offsetWidth;btn.classList.add('flow-pop');}
     screen.scrollTop=0;
   }
 }
 indicator();
}
document.addEventListener('click',e=>{
 if(!mobile())return;
 const target=e.target.closest('[data-page]');if(!target)return;
 const screen=document.querySelector('#screen'),nav=document.querySelector('.live-navigator');
 const next=target.dataset.page,old=active(nav)?.dataset.page;
 if(nav?.contains(target)&&next!==old&&navigator.vibrate&&!reduced())navigator.vibrate(8);
},true);
function attach(){
 const screen=document.querySelector('#screen'),nav=document.querySelector('.live-navigator');
 if(screen!==lastScreen){screenObserver?.disconnect();lastScreen=screen;if(screen){screenObserver=new MutationObserver(onScreen);screenObserver.observe(screen,{childList:true});}}
 if(nav!==lastNav){navObserver?.disconnect();lastNav=nav;if(nav){navObserver=new MutationObserver(()=>requestAnimationFrame(onScreen));navObserver.observe(nav,{subtree:true,attributes:true,attributeFilter:['class','aria-current']});}}
 onScreen();
}
const root=document.getElementById('app');
if(root)new MutationObserver(()=>{if(document.querySelector('#screen')!==lastScreen||document.querySelector('.live-navigator')!==lastNav)attach();}).observe(root,{childList:true,subtree:true});
window.addEventListener('resize',()=>requestAnimationFrame(indicator),{passive:true});
document.addEventListener('animationend',e=>{if(e.target.id==='screen')e.target.classList.remove('flow-enter-forward','flow-enter-backward');if(e.target.classList?.contains('flow-pop'))e.target.classList.remove('flow-pop');});
attach();
})();
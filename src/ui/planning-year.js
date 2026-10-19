// Calendrier annuel Nethor 2 : repris de la vue Année de Nethor 1.
// Les marqueurs désignent les SEMAINES publiées, jamais une présence individuelle.
import {mondayFor,dateInParis} from '../domain/personal-overview.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=(year,month,day)=>year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
const MONTHS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS=['L','M','M','J','V','S','D'];

export function yearQueryBounds(year){
 if(!Number.isInteger(year)||year<1900||year>2100)throw new RangeError('Année invalide');
 return {start:mondayFor(dateKey(year,0,1)),end:mondayFor(dateKey(year,11,31))};
}
export function publishedWeeksOfMonth(year,month,weekStarts){
 const first=new Date(Date.UTC(year,month,1,12));
 const last=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
 const weeks=new Set();
 for(let day=1;day<=last;day++)weeks.add(mondayFor(dateKey(year,month,day)));
 const published=new Set(weekStarts||[]);
 return [...weeks].filter(x=>published.has(x)).length;
}
export function renderPlanningYear({year,weeks=[],loading=false,error='',today=dateInParis(),selectedDay=''}){
 if(!Number.isInteger(year)||year<1900||year>2100)return '';
 const published=new Set(Array.isArray(weeks)?weeks:[]);
 const count=published.size;
 const header='<div class="n2py-head"><div><span>CALENDRIER ANNUEL</span><h2>Vue annuelle</h2><p>'+
  (loading?'Recherche des plannings publiés…':error?esc(error):count+' semaine'+(count>1?'s':'')+' publiée'+(count>1?'s':'')+' sur cette période')+
  '</p></div><button type="button" data-action="year-close" aria-label="Revenir à la semaine">✕</button></div>';
 const toolbar='<div class="n2py-controls" aria-label="Changer d’année">'+
  '<button type="button" data-action="year-prev" aria-label="Année précédente">‹</button>'+
  '<button type="button" data-action="year-current" class="n2py-current" aria-label="Revenir à cette année">'+year+'</button>'+
  '<button type="button" data-action="year-next" aria-label="Année suivante">›</button></div>';
 let grid='';
 for(let month=0;month<12;month++){
  const length=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
  const first=new Date(Date.UTC(year,month,1,12));
  const offset=(first.getUTCDay()+6)%7;
  const countMonth=publishedWeeksOfMonth(year,month,published);
  const blanks=Array.from({length:offset},()=>'<span class="n2py-blank" aria-hidden="true"></span>').join('');
  let days='';
  for(let day=1;day<=length;day++){
   const date=dateKey(year,month,day);
   const available=published.has(mondayFor(date));
   const weekDay=new Date(Date.UTC(year,month,day,12)).getUTCDay();
   const classes=['n2py-day',available?'published':'not-published',date===today?'today':'',date===selectedDay?'selected':'',(weekDay===0||weekDay===6)?'weekend':''].filter(Boolean).join(' ');
   const description=day+' '+MONTHS[month].toLowerCase()+' '+year+(available?', planning disponible':', planning non publié');
   days+='<button type="button" class="'+classes+'" data-year-day="'+date+'" aria-label="'+esc(description)+'" title="'+esc(description)+'">'+day+(available?'<i aria-hidden="true"></i>':'')+'</button>';
  }
  grid+='<section class="n2py-month" aria-label="'+MONTHS[month]+' '+year+'" data-year-month="'+(month+1)+'">'+
   '<div class="n2py-month-head"><h3>'+MONTHS[month]+'</h3>'+
   '<span class="'+(countMonth?'has-planning':'')+'">'+(countMonth?countMonth+' sem.':'Aucun planning')+'</span></div>'+
   '<div class="n2py-weekdays" aria-hidden="true">'+DAYS.map(x=>'<span>'+x+'</span>').join('')+'</div>'+
   '<div class="n2py-days">'+blanks+days+'</div></section>';
 }
 const legend='<div class="n2py-legend"><span><i class="available"></i>Planning disponible</span>'+
  '<span><i class="today"></i>Aujourd’hui</span><span><i class="unavailable"></i>Non publié</span></div>';
 return '<section class="n2py" aria-label="Calendrier annuel des plannings"><div class="n2py-fixed">'+header+toolbar+legend+'</div>'+
  (error?'<p class="n2py-error" role="alert">'+esc(error)+'</p>':'')+
  '<div class="n2py-grid">'+grid+'</div></section>';
}

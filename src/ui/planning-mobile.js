// Planning mobile et PWA de Nethor 2, inspiré des cartes Jour/Semaine Nethor 1.
// Présentation uniquement : lecture du modèle de planning déjà autorisé par Supabase.
const safe = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = value => String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
const SHORT=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const dateAt=(start,i)=>{const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);};
const dateLabel=(date)=>new Date(date+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',timeZone:'UTC'});
const duration=value=>Number(value).toLocaleString('fr-FR',{maximumFractionDigits:2})+' h';
const minute=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(Math.round(value%60)).padStart(2,'0');
function parisClock(now){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const p=key=>parts.find(x=>x.type===key)?.value||'';
 return {key:p('year')+'-'+p('month')+'-'+p('day'),minute:Number(p('hour'))*60+Number(p('minute'))};
}
// Plusieurs noms exacts du planning peuvent appartenir au même compte.
// Aucune correspondance approximative : seuls les alias affectés sont reconnus.
export function employeeIndices(model,profile){
 if(!profile||!Array.isArray(model?.employees))return [];
 const names=[profile.planning_name,...(Array.isArray(profile.planning_aliases)?profile.planning_aliases:[]),profile.display_name]
   .map(norm).filter(Boolean);
 const aliases=new Set(names);
 if(!aliases.size)return [];
 return model.employees.map((e,i)=>aliases.has(norm(e?.name))?i:-1).filter(i=>i>=0);
}
function buildShifts(cells,first,step){
 let begin=-1,color='',shifts=[];
 for(let i=0;i<=cells.length;i++){
  const next=i<cells.length&&['g','b'].includes(cells[i])?cells[i]:'';
  if(begin!==-1&&next!==color){
   shifts.push({color,start:first+begin*step,end:first+i*step});
   begin=-1;color='';
  }
  if(next&&begin===-1){begin=i;color=next;}
 }
 return shifts;
}
function shiftKind(cells){
 if(!Array.isArray(cells)||!cells.length)return 'unknown';
 if(cells.some(c=>c==='g'||c==='b'))return 'work';
 if(cells.includes('y'))return 'leave';
 if(cells.includes('w'))return 'unavailable';
 if(cells.some(c=>c==='r'))return 'red';
 if(cells.some(c=>c==='o'))return 'orange';
 if(cells.every(c=>c==null||c===''||c==='w'))return 'empty';
 return 'unknown';
}
export function planningMobileData(model,profiles,currentProfile,weekStart){
 const dates=Array.from({length:7},(_,i)=>dateAt(weekStart,i));
 if(!model||!Array.isArray(model.employees)||!model.days)return {dates,employees:[],mineIndex:-1,available:false};
 const minuteStart=Number(model.startTime??6)*60,step=Number(model.slotMinutes)||15;
 const active=(Array.isArray(profiles)?profiles:[]).filter(p=>p.account_enabled===false);
 const excluded=new Set(active.flatMap(p=>[p.planning_name,...(Array.isArray(p.planning_aliases)?p.planning_aliases:[]),p.display_name].map(norm).filter(Boolean)));
 const mineIndices=employeeIndices(model,currentProfile);
 const mineSet=new Set(mineIndices);
 const mineIndex=mineIndices[0]??-1;
 const employees=model.employees.map((emp,i)=>{
  if(excluded.has(norm(emp.name)))return null;
  const records=dates.map(date=>{
   const row=model.days[date]?.cells?.[i];
   const kind=shiftKind(row);
   const shifts=kind==='work'?buildShifts(row,minuteStart,step):[];
   const total=shifts.reduce((sum,s)=>sum+(s.end-s.start)/60,0);
   return {date,kind,shifts,total};
  });
  const total=records.reduce((sum,d)=>sum+d.total,0);
  const contract=emp.excelContractHours!=null&&Number.isFinite(Number(emp.excelContractHours))?Number(emp.excelContractHours):null;
  return {index:i,name:String(emp.name||''),isMe:mineSet.has(i),days:records,total,contract};
 }).filter(Boolean);
 employees.sort((a,b)=>Number(b.isMe)-Number(a.isMe));
 return {dates,employees,mineIndex,mineIndices,available:true};
}
const person=emp=>{
 const initials=String(emp.name||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
 return '<span class="n2pm-avatar" aria-hidden="true">'+safe(initials)+'</span><span class="n2pm-person-name"><strong>'+safe(emp.name)+'</strong>'+(emp.isMe?'<small>Mon planning</small>':'')+'</span>';
};
function statusLabel(kind){
 return ({leave:'Congé',red:'Repos',orange:'Repos',unavailable:'Indisponible',empty:'Sans horaire',unknown:'Non renseigné'})[kind]||'';
}
function statusKind(kind){return kind==='red'||kind==='orange'?'rest':kind;}
function shiftLabel(color){return color==='g'?'Matin':color==='b'?'Après-midi':'Créneau';}
function colorShifts(shifts,compact=false){
 return shifts.map(s=>'<span class="n2pm-shift" data-color="'+s.color+'">'+
  '<strong>'+minute(s.start)+' – '+minute(s.end)+'</strong>'+
  (compact?'':'<small>'+safe(shiftLabel(s.color))+' · '+duration((s.end-s.start)/60)+'</small>')+
 '</span>').join('');
}
function strip(dates,selected,today){
 return '<div class="n2pm-days" role="group" aria-label="Choisir une journée">'+dates.map((date,i)=>
   '<button type="button" class="n2pm-day'+(date===selected?' selected':'')+(date===today?' today':'')+'" data-mobile-planning-day="'+date+'" aria-pressed="'+(date===selected)+'" aria-label="'+safe(SHORT[i]+' '+dateLabel(date))+'">'+
   '<span>'+SHORT[i]+'</span><strong>'+Number(date.slice(-2))+'</strong></button>').join('')+'</div>';
}
function freshnessLabel(value){
 const d=new Date(value||0);
 if(!Number.isFinite(d.getTime())||!value)return 'Planning non vérifié sur cet appareil';
 return 'Mis à jour à '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function toolbar(weekStart,view,allowYear=false,meta={}){
 const online=meta.isOnline!==false;
 const disabled=meta.loading||!online?' disabled':'';
 return '<div class="n2pm-toolbar">'+
  '<div class="n2pm-segmented" aria-label="Mode du planning">'+
  '<button type="button" data-action="week-view" class="'+(view==='week'?'selected':'')+'" aria-pressed="'+(view==='week')+'">Semaine</button>'+
  '<button type="button" data-action="day-view" class="'+(view==='day'?'selected':'')+'" aria-pressed="'+(view==='day')+'">Jour</button>'+
  (allowYear?'<button type="button" data-action="year-view" class="n2pm-year-btn" aria-pressed="false" aria-label="Ouvrir la vue annuelle">Année</button>':'')+'</div>'+
  '<div class="n2pm-pager">'+
  '<button type="button" data-action="prev" aria-label="Semaine précédente"'+disabled+'>‹</button>'+
  '<span><strong>'+safe(dateLabel(weekStart))+' – '+safe(dateLabel(dateAt(weekStart,6)))+'</strong><small>Semaine du '+safe(dateLabel(weekStart))+'</small></span>'+
  '<button type="button" data-action="next" aria-label="Semaine suivante"'+disabled+'>›</button></div>'+
  '<div class="n2pm-context" role="status">'+
    '<button type="button" class="n2pm-today-btn" data-action="today"'+disabled+'>Aujourd’hui</button>'+
    '<span class="n2pm-freshness">'+safe(freshnessLabel(meta.updatedAt))+'</span>'+
    '<span class="n2pm-network" data-online="'+online+'">'+(online?'En ligne':'Hors ligne')+'</span>'+
    (meta.updateReady?'<button type="button" class="n2pm-update-btn" data-action="pwa-update">Mettre à jour NETHOR</button>':'')+
  '</div></div>';
}

function summary(cells){
 return '<div class="n2pm-summary">'+cells.map(c=>'<div><span>'+safe(c[0])+'</span><strong>'+safe(c[1])+'</strong></div>').join('')+'</div>';
}
function pills(options,active,type){
 return '<div class="n2pm-filters" role="group" aria-label="Filtrer les collaborateurs">'+options.map(([key,label])=>
  '<button type="button" data-mobile-planning-filter="'+key+'" data-filter-mode="'+type+'" class="'+(key===active?'selected':'')+'" aria-pressed="'+(key===active)+'">'+safe(label)+'</button>').join('')+'</div>';
}
function weekCard(emp,chosen){
 const exceeds=emp.contract!==null&&emp.contract>0&&emp.total>emp.contract+.01;
 let header='<header class="n2pm-week-person"><div class="n2pm-identity">'+person(emp)+'</div>'+
  '<div class="n2pm-total"><strong>'+duration(emp.total)+'</strong>'+
  (emp.contract!==null&&emp.contract>0?'<small>/ '+duration(emp.contract)+'</small>':'')+
  (exceeds?'<b>Écart contrat</b>':'')+'</div></header>';
 const slots=emp.days.map((d,i)=>{
  const flag=d.kind==='work'?(d.shifts[0]?.color||'g'):d.kind;
  return '<button type="button" class="n2pm-slot'+(d.date===chosen?' selected':'')+'" data-color="'+flag+'" data-mobile-planning-open="'+d.date+'" aria-label="'+safe(SHORT[i]+' '+dateLabel(d.date)+': '+(d.shifts.length?d.shifts.map(s=>minute(s.start)+'-'+minute(s.end)).join(', '):statusLabel(d.kind)))+'">'+
  (d.shifts.length?d.shifts.map(s=>'<span class="n2pm-mini-shift" data-color="'+s.color+'"><small>'+safe(shiftLabel(s.color))+'</small><strong>'+minute(s.start)+'</strong><strong>'+minute(s.end)+'</strong></span>').join(''):
   '<span class="n2pm-slot-off">'+safe(statusLabel(d.kind))+'</span>')+'</button>';
 }).join('');
 return '<article class="n2pm-week-card'+(emp.isMe?' is-me':'')+'">'+header+'<div class="n2pm-slots">'+slots+'</div></article>';
}
function weekView(data,selected,today){
 // Vue semaine épurée : garder les jours, les cartes de l'équipe et la légende.
 // Pas de compteurs ni de filtres sur mobile/PWA.
 const legend='<div class="n2pm-legend"><span><i class="g"></i>Matin</span><span><i class="b"></i>Après-midi</span><span><i class="y"></i>Congé</span><span><i class="r"></i>Repos</span><span><i class="w"></i>Indisponibilité</span></div>';
 return strip(data.dates,selected,today)+'<div class="n2pm-week-list">'+
  (data.employees.length?data.employees.map(e=>weekCard(e,selected)).join(''):'<p class="n2pm-empty">Aucun collaborateur planifié.</p>')+
  '</div>'+legend;
}
function effectiveState(row,selected,today,clock){
 if(row.kind!=='work')return {key:statusKind(row.kind),label:statusLabel(row.kind)};
 if(selected!==today)return {key:'planned',label:'Planifié'};
 if(row.shifts.some(s=>s.start<=clock&&clock<s.end))return {key:'ongoing',label:'Créneau prévu en cours'};
 if(row.shifts.some(s=>s.start>clock))return {key:'upcoming',label:'À venir'};
 return {key:'finished',label:'Terminé'};
}
function badge(state){
 return '<span class="n2pm-badge" data-state="'+safe(state.key)+'">'+safe(state.label)+'</span>';
}
function dayPerson(emp,row,state,personal){
 return '<article class="n2pm-day-card'+(personal?' is-me':'')+'">'+
  '<header class="n2pm-day-person"><div class="n2pm-identity">'+person(emp)+'</div>'+badge(state)+'</header>'+
  (row.shifts.length?'<div class="n2pm-shift-list">'+colorShifts(row.shifts)+'</div>':
   '<div class="n2pm-day-off" data-state="'+safe(row.kind)+'">'+safe(statusLabel(row.kind))+'</div>')+
  '</article>';
}
function dayView(data,selected,today,clock,filter,awayExpanded){
 const idx=Math.max(0,data.dates.indexOf(selected)),rows=data.employees.map(emp=>({emp,row:emp.days[idx]}));
 const working=rows.filter(x=>x.row.kind==='work');
 const mine=rows.filter(x=>x.emp.isMe);
 const team=working.filter(x=>!x.emp.isMe);
 const away=rows.filter(x=>x.row.kind!=='work'&&!x.emp.isMe);
 const isToday=selected===today;
 const stateOf=x=>effectiveState(x.row,selected,today,clock);
 const ongoing=working.filter(x=>stateOf(x).key==='ongoing').length;
 const counts=summary([['Planifiés',working.length],[isToday?'En cours':'Créneaux',isToday?ongoing:working.reduce((n,x)=>n+x.row.shifts.length,0)],['Congés',rows.filter(x=>x.row.kind==='leave').length]]);
 const options=isToday?[['all','Tous'],['ongoing','En cours'],['upcoming','À venir'],['finished','Terminés']]:[['all','Tous'],['morning','Matin'],['afternoon','Après-midi']];
 const visible=team.filter(x=>filter==='all'||['ongoing','upcoming','finished'].includes(filter)&&stateOf(x).key===filter||
  filter==='morning'&&x.row.shifts.some(s=>s.start<720)||
  filter==='afternoon'&&x.row.shifts.some(s=>s.end>720));
 const rank={ongoing:0,upcoming:1,planned:1,finished:2};
 visible.sort((a,b)=>(rank[stateOf(a).key]??3)-(rank[stateOf(b).key]??3)||
  (a.row.shifts[0]?.start??0)-(b.row.shifts[0]?.start??0)||a.emp.name.localeCompare(b.emp.name,'fr'));
 let out=strip(data.dates,selected,today)+counts;
 if(mine.length)out+='<div class="n2pm-section-title">Mon planning</div>'+mine.map(x=>dayPerson(x.emp,x.row,stateOf(x),true)).join('');
 else out+='<div class="n2pm-empty n2pm-unlinked">Aucun collaborateur n’est associé à ton compte sur ce planning.</div>';
 out+='<div class="n2pm-section-title"><span>Équipe du jour</span><small>'+team.length+' en poste</small></div>'+
  pills(options,filter,'day')+'<div class="n2pm-day-list">'+
  (visible.length?visible.map(x=>dayPerson(x.emp,x.row,stateOf(x),false)).join(''):'<p class="n2pm-empty">Aucun créneau pour ce filtre.</p>')+'</div>';
 out+='<details class="n2pm-away"'+(awayExpanded?' open':'')+'><summary data-mobile-planning-away><span>Repos, congés et sans horaire</span><small>'+away.length+' personne'+(away.length>1?'s':'')+'</small><b>⌄</b></summary>'+
  '<div class="n2pm-away-list">'+(away.length?away.map(x=>'<div class="n2pm-away-person"><div class="n2pm-identity">'+person(x.emp)+'</div><span data-state="'+safe(x.row.kind)+'">'+safe(statusLabel(x.row.kind))+'</span></div>').join(''):'<p>Aucun collaborateur dans cette catégorie.</p>')+'</div></details>';
 if(isToday)out+='<p class="n2pm-footnote">Les statuts reflètent les horaires prévus, pas une présence confirmée.</p>';
 return out;
}
export function renderMobilePlanning({weekStart,selectedDay,view,model,profiles,currentProfile,filter='all',awayExpanded=false,allowYear=false,loading=false,error='',updatedAt=0,isOnline=true,updateReady=false,now=new Date()}){
 const result=planningMobileData(model,profiles,currentProfile,weekStart);
 const selected=result.dates.includes(selectedDay)?selectedDay:result.dates[0];
 const clock=parisClock(now);
 let content='';
 if(loading&&!model)content='<div class="n2pm-empty n2pm-loading" role="status"><strong>Chargement du planning…</strong><p>Vérification de la dernière version publiée.</p></div>';
 else if(!result.available)content='<div class="n2pm-empty"><strong>Aucun planning publié pour cette semaine.</strong><p>Choisis une autre semaine avec les flèches.</p></div>';
 else if(view==='day')content=dayView(result,selected,clock.key,clock.minute,filter,awayExpanded);
 else content=weekView(result,selected,clock.key);
 const offline=isOnline?'':'<div class="n2pm-offline" role="status"><strong>Mode hors ligne</strong><span>Seules les données déjà chargées dans cette session peuvent rester visibles. Elles peuvent ne plus être à jour.</span></div>';
 const syncing=loading&&model?'<div class="n2pm-syncing" role="status">Actualisation de la dernière version…</div>':'';
 return '<section class="n2pm" aria-label="Planning mobile de l’équipe">'+
  toolbar(weekStart,view,allowYear,{updatedAt,isOnline,updateReady,loading})+
  offline+syncing+
  (error?'<p class="n2pm-error" role="alert">'+safe(error)+'</p>':'')+
  content+'</section>';
}

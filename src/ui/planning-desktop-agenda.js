// Agenda de consultation : Desktop et PWA Desktop uniquement.
// Ne modifie ni les données publiées, ni les calculs des horaires.
import {describeDesktopPlanningDay} from './planning-desktop-colors.js';

const WEEKDAYS=['Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.','Dim.'];
const STATUS={leave:'Congés',rest:'Repos',unavailable:'Indisponible',empty:'—',unknown:'Non renseigné'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const clock=minutes=>pad(Math.floor(minutes/60))+':'+pad(Math.round(minutes%60));
const PLANNING_ICONS=Object.freeze({
  week:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/>',
  day:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18"/><rect x="7" y="12" width="10" height="5" rx="1.5"/>',
  year:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 9h18"/><path d="M7 12h3v2H7zM14 12h3v2h-3zM7 17h3v1H7zM14 17h3v1h-3z"/>',
  team:'<path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 18.5V20"/><circle cx="9" cy="7" r="3.5"/><path d="M22 20v-1.5a4.5 4.5 0 0 0-3.5-4.38M15.5 3.65a3.5 3.5 0 0 1 0 6.7"/>'
});
function planningIcon(name,className='n2-agenda-tab-icon'){
  const paths=PLANNING_ICONS[name];
  if(!paths)return '';
  return '<svg class="'+className+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths+'</svg>';
}
function plusDays(date,days){
  const d=new Date(date+'T12:00:00');
  d.setDate(d.getDate()+days);
  return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
}
function label(date,options){
  return new Date(date+'T12:00:00').toLocaleDateString('fr-FR',options);
}
function getDay(day,model){
  const first=Number(model?.startTime??6)*60;
  const step=Number(model?.slotMinutes)||15;
  return describeDesktopPlanningDay(day?.cells,first,step);
}
function ranges(day){
  return day.status==='work'?day.shifts:[];
}
function statusMarkup(day){
  return '<span class="n2-agenda-status" data-tone="'+esc(day.status)+'">'+STATUS[day.status]+'</span>';
}
function editorControls(editor,readOnly=false){
  const refresh='<button class="n2-agenda-refresh" type="button" data-action="refresh">Actualiser ↻</button>';
  if(!editor?.available)return readOnly?'<div class="n2-agenda-admin-actions"><span class="n2-agenda-readonly">Lecture seule</span>'+refresh+'</div>':refresh;
  const canLock=editor.canLock===true;
  const badge=editor.locked?'<span class="n2-agenda-lock-badge">🔒 Semaine verrouillée</span>':
    editor.editing?'<span class="n2-agenda-edit-badge">✎ Mode édition</span>':'';
  const actions=editor.editing
    ?'<button class="btn" type="button" data-action="planning-edit-cancel" '+(editor.busy?'disabled':'')+'>Annuler</button>'+
      '<button class="btn" type="button" data-action="planning-edit-save" '+(editor.busy?'disabled':'')+'>Enregistrer</button>'+
      (canLock?'<button class="btn primary" type="button" data-action="planning-edit-save-lock" '+(editor.busy?'disabled':'')+'>Enregistrer et verrouiller</button>':'')
    :editor.locked
      ?(canLock?'<button class="btn" type="button" data-action="planning-edit-unlock" '+(editor.busy?'disabled':'')+'>Déverrouiller</button>':'')
      :'<button class="btn" type="button" data-action="planning-edit-start">Modifier</button>'+
       (canLock?'<button class="btn" type="button" data-action="planning-edit-lock">🔒 Verrouiller</button>':'');
  return '<div class="n2-agenda-admin-actions">'+badge+actions+(editor.editing?'':refresh)+'</div>';
}
function editableWeekCell(day,model,editor,person,date){
  const content=weekCell(day);
  if(!editor?.editing)return content;
  const employeeIndex=(model?.employees||[]).findIndex(item=>item?.name===person?.name);
  if(employeeIndex<0)return content;
  return '<button type="button" class="n2-agenda-edit-cell" data-planning-edit-person="'+employeeIndex+'" data-planning-edit-day="'+esc(date)+'" aria-label="Modifier '+esc(person.name)+' le '+esc(date)+'">'+content+'<small>Modifier</small></button>';
}
function weekCell(day){
  const detail=ranges(day);
  return detail.length?'<div class="n2-agenda-shift-list">'+detail.map(shift=>
    '<span class="n2-agenda-pill" data-tone="'+shift.tone+'">'+clock(shift.startMinutes)+'–'+clock(shift.endMinutes)+'</span>'
  ).join('')+'</div>':statusMarkup(day);
}
function personName(p,renderPerson){
  return '<div class="n2-agenda-person">'+renderPerson(p)+'</div>';
}
function nav(view,week,day,canYear,query){
  const date=view==='day'?day:week;
  const datestring=view==='day'?label(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'}):
    'Semaine du '+label(week,{day:'numeric',month:'short'})+' au '+label(plusDays(week,6),{day:'numeric',month:'short',year:'numeric'});
  return '<div class="n2-agenda-tabs" style="--agenda-tabs:'+(canYear?3:2)+'" role="group" aria-label="Affichage du planning">'+
    '<button type="button" data-action="week-view" class="'+(view==='week'?'active':'')+'" aria-pressed="'+(view==='week')+'">'+planningIcon('week')+'<span>Semaine</span></button>'+
    '<button type="button" data-action="day-view" class="'+(view==='day'?'active':'')+'" aria-pressed="'+(view==='day')+'">'+planningIcon('day')+'<span>Jour</span></button>'+
    (canYear?'<button type="button" data-action="year-view" aria-pressed="false">'+planningIcon('year')+'<span>Année</span></button>':'')+
    '</div><div class="n2-agenda-toolbar">'+
      '<div class="n2-agenda-team"><small>Équipe</small><span>'+planningIcon('team','n2-agenda-team-icon')+'Toute l’équipe</span></div>'+
      '<div class="n2-agenda-nav">'+
        '<button class="n2-agenda-icon" type="button" data-action="'+(view==='day'?'agenda-prev-day':'prev')+'" aria-label="'+(view==='day'?'Jour précédent':'Semaine précédente')+'">‹</button>'+
        '<div><strong>'+esc(datestring)+'</strong>'+(view==='week'?'<small>7 jours</small>':'')+'</div>'+
        '<button class="n2-agenda-icon" type="button" data-action="'+(view==='day'?'agenda-next-day':'next')+'" aria-label="'+(view==='day'?'Jour suivant':'Semaine suivante')+'">›</button>'+
      '</div>'+
      '<label class="n2-agenda-search">⌕ <input id="n2AgendaSearch" type="search" autocomplete="off" value="'+esc(query)+'" placeholder="Rechercher un collaborateur…" aria-label="Rechercher un collaborateur"></label>'+
    '</div>';
}
function weekGrid(people,week,model,renderPerson,formatHours,editor){
  const dates=Array.from({length:7},(_,i)=>plusDays(week,i));
  const header=dates.map((date,i)=>'<th scope="col"><button type="button" data-day="'+date+'" title="Voir le '+esc(label(date,{weekday:'long',day:'numeric',month:'long'}))+'">'+WEEKDAYS[i]+'<small>'+esc(label(date,{day:'numeric',month:'2-digit'}))+'</small></button></th>').join('');
  const body=people.map(p=>{
    const dayCells=dates.map((date,i)=>'<td class="'+(editor?.editing?'n2-agenda-editable':'')+'">'+editableWeekCell(getDay(p.days[i],model),model,editor,p,date)+'</td>').join('');
    return '<tr class="n2-agenda-person-row n2staff-row" data-agenda-person="'+esc(p.name.toLocaleLowerCase('fr'))+'" data-staff-person="'+esc(p.name)+'"><th scope="row">'+personName(p,renderPerson)+'</th>'+dayCells+'<td class="n2-agenda-hours">'+formatHours(p.total)+'</td></tr>';
  }).join('');
  return '<div class="n2-agenda-scroll" role="region" aria-label="Planning hebdomadaire" tabindex="0"><table class="n2-agenda-week-table"><thead><tr><th scope="col">Collaborateur</th>'+header+'<th scope="col">Total</th></tr></thead><tbody>'+body+'</tbody></table></div>';
}
function dayGrid(people,day,week,model,renderPerson){
  const index=Math.max(0,Math.min(6,Math.round((new Date(day+'T12:00:00')-new Date(week+'T12:00:00'))/86400000)));
  const details=people.map(p=>getDay(p.days[index],model));
  const allShifts=details.flatMap(ranges);
  const startHour=Math.min(6,...allShifts.map(s=>Math.floor(s.startMinutes/60)));
  const endHour=Math.max(21,...allShifts.map(s=>Math.ceil(s.endMinutes/60)));
  const totalMinutes=(endHour-startHour)*60;
  const count=endHour-startHour;
  const hoursHeader=Array.from({length:count+1},(_,i)=>'<span style="left:'+(i/count*100)+'%">'+clock((startHour+i)*60)+'</span>').join('');
  const rows=people.map((p,i)=>{
    const detail=details[i];
    const bars=ranges(detail).map(shift=>{
      const start=(shift.startMinutes-startHour*60)/totalMinutes*100;
      const size=(shift.endMinutes-shift.startMinutes)/totalMinutes*100;
      const text=clock(shift.startMinutes)+'–'+clock(shift.endMinutes);
      return '<div class="n2-agenda-bar" data-tone="'+shift.tone+'" title="'+text+'" style="left:'+start.toFixed(4)+'%;width:'+size.toFixed(4)+'%"><span>'+text+'</span></div>';
    }).join('');
    const content=bars||'<div class="n2-agenda-day-status">'+statusMarkup(detail)+'</div>';
    return '<div class="n2-agenda-day-row n2-agenda-person-row n2staff-row" data-agenda-person="'+esc(p.name.toLocaleLowerCase('fr'))+'" data-staff-person="'+esc(p.name)+'"><div class="n2-agenda-day-person">'+personName(p,renderPerson)+'</div><div class="n2-agenda-track" style="--agenda-hours:'+count+'">'+content+'</div></div>';
  }).join('');
  return '<div class="n2-agenda-scroll n2-agenda-day-scroll" role="region" aria-label="Agenda du '+esc(label(day,{weekday:'long',day:'numeric',month:'long'}))+'" tabindex="0"><div class="n2-agenda-day-content"><div class="n2-agenda-day-head"><strong>Collaborateur</strong><div class="n2-agenda-hour-head">'+hoursHeader+'</div></div>'+rows+'</div></div>';
}
function summary(people,day,week,model,view){
  const index=Math.max(0,Math.min(6,Math.round((new Date(day+'T12:00:00')-new Date(week+'T12:00:00'))/86400000)));
  const active=people.filter(p=>p.days[index]?.ranges?.length).length;
  return '<div class="n2-agenda-footer"><span class="n2-agenda-footer-team">'+planningIcon('team','n2-agenda-footer-icon')+'<strong>'+people.length+'</strong> collaborateurs</span>'+
    (view==='day'?'<span>'+esc(label(day,{weekday:'long',day:'numeric',month:'long'}))+' · <strong>'+active+'</strong> planifiés</span>':'<span>Horaires de la semaine publiée</span>')+
    '<div class="n2-agenda-legend" aria-label="Légende">'+
      '<span><i data-tone="morning"></i>Matin</span><span><i data-tone="afternoon"></i>Après-midi</span>'+
      '<span><i data-tone="rest"></i>Repos</span><span><i data-tone="leave"></i>Congés</span></div></div>';
}
export function renderDesktopPlanningAgenda({model,people=[],week,day,view='week',sourceFile='',renderPerson,formatHours,canYear=false,loading=false,query='',editor=null,readOnly=false}){
  const currentDay=Array.from({length:7},(_,i)=>plusDays(week,i)).includes(day)?day:week;
  const shown=people.filter(p=>p.name.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const content=!model?'<div class="n2-agenda-empty">Aucun planning publié pour cette semaine. Utilise les flèches pour choisir une autre semaine.</div>':
    view==='day'?dayGrid(shown,currentDay,week,model,renderPerson):weekGrid(shown,week,model,renderPerson,formatHours,editor);
  return '<section class="card n2-agenda" aria-label="Planning de l’équipe">'+
    '<div class="n2-agenda-top"><div><h2>Planning de l’équipe</h2><p>'+esc(model?(sourceFile||'Semaine publiée'):'Aucune version enregistrée')+'</p></div>'+editorControls(model?editor:null,readOnly)+'</div>'+
    (editor?.message?'<div class="n2-agenda-editor-message" data-kind="'+esc(editor.messageKind||'info')+'" role="status">'+esc(editor.message)+'</div>':'')+
    nav(view,week,currentDay,canYear,query)+content+(model?summary(shown,currentDay,week,model,view):'')+
    (loading?'<div class="n2-agenda-loading" role="status">Chargement du planning…</div>':'')+'</section>';
}

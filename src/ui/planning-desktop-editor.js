// NETHOR 2 — édition du planning réservée à l'administrateur Desktop / PWA Desktop.
// Ce module ne publie rien : il prépare et modifie uniquement un brouillon local.
// La publication et le verrouillage restent contrôlés côté Supabase.
import {describeDesktopPlanningDay} from './planning-desktop-colors.js';

const ALLOWED_STATUS=new Set(['work','rest','leave','empty']);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const clock=minutes=>pad(Math.floor(minutes/60))+':'+pad(minutes%60);

function modelBounds(model){
  const start=Number(model?.startTime??6)*60;
  const step=Number(model?.slotMinutes)||15;
  const slots=Number(model?.slotCount)||58;
  if(!Number.isFinite(start)||!Number.isFinite(step)||step<=0||!Number.isInteger(slots)||slots<1)
    throw new TypeError('Grille de planning invalide');
  return {start,step,slots,end:start+step*slots};
}
function parseClock(value){
  const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));
  if(!match)return null;
  const h=Number(match[1]),m=Number(match[2]);
  if(h>23||m>59)return null;
  return h*60+m;
}
function validatedRange(startValue,endValue,bounds,optional=false){
  const start=parseClock(startValue),end=parseClock(endValue);
  if(optional&&start===null&&end===null)return null;
  if(start===null||end===null)throw new Error('Renseigne le début et la fin de chaque plage utilisée.');
  if(start>=end)throw new Error('L’heure de fin doit être après l’heure de début.');
  if(start<bounds.start||end>bounds.end)throw new Error('Les horaires doivent rester dans la plage du planning.');
  if((start-bounds.start)%bounds.step!==0||(end-bounds.start)%bounds.step!==0)
    throw new Error('Les horaires doivent respecter les créneaux de '+bounds.step+' minutes.');
  return {start,end};
}

export function clonePlanningModel(model){
  if(!model||typeof model!=='object')return null;
  return typeof structuredClone==='function'?structuredClone(model):JSON.parse(JSON.stringify(model));
}

export function planningEditorSeed(model,employeeIndex,date){
  const bounds=modelBounds(model);
  const row=model?.days?.[date]?.cells?.[employeeIndex];
  const detail=describeDesktopPlanningDay(row,bounds.start,bounds.step);
  const ranges=detail.shifts.slice(0,2);
  const status=detail.status==='work'?'work':detail.status==='leave'?'leave':detail.status==='empty'||detail.status==='unknown'?'empty':'rest';
  return {
    employeeIndex,date,status,
    firstStart:ranges[0]?clock(ranges[0].startMinutes):'',
    firstEnd:ranges[0]?clock(ranges[0].endMinutes):'',
    secondStart:ranges[1]?clock(ranges[1].startMinutes):'',
    secondEnd:ranges[1]?clock(ranges[1].endMinutes):''
  };
}

export function buildPlanningDayCells(model,{status,firstStart='',firstEnd='',secondStart='',secondEnd=''}) {
  const bounds=modelBounds(model);
  if(!ALLOWED_STATUS.has(status))throw new Error('Statut de journée invalide.');
  if(status==='rest')return Array(bounds.slots).fill('r');
  if(status==='leave')return Array(bounds.slots).fill('y');
  if(status==='empty')return Array(bounds.slots).fill(null);

  const first=validatedRange(firstStart,firstEnd,bounds,false);
  const second=validatedRange(secondStart,secondEnd,bounds,true);
  const ranges=[first,...(second?[second]:[])].sort((a,b)=>a.start-b.start);
  for(let i=1;i<ranges.length;i++){
    if(ranges[i].start<ranges[i-1].end)throw new Error('Les plages horaires ne doivent pas se chevaucher.');
  }
  const row=Array(bounds.slots).fill('r');
  for(const range of ranges){
    const from=(range.start-bounds.start)/bounds.step;
    const to=(range.end-bounds.start)/bounds.step;
    const tone=range.start<12*60?'g':'b';
    for(let i=from;i<to;i++)row[i]=tone;
  }
  return row;
}

export function applyPlanningDayEdit(model,edit){
  if(!model||typeof model!=='object')throw new TypeError('Planning absent');
  const employeeIndex=Number(edit?.employeeIndex);
  const date=String(edit?.date||'');
  if(!Number.isInteger(employeeIndex)||employeeIndex<0||employeeIndex>=model.employees?.length)
    throw new Error('Collaborateur invalide.');
  const day=model.days?.[date];
  if(!day||!Array.isArray(day.cells)||!Array.isArray(day.cells[employeeIndex]))
    throw new Error('Journée introuvable dans cette semaine.');
  day.cells[employeeIndex]=buildPlanningDayCells(model,edit);
  return model;
}

function timeInput(name,value,label,optional=false){
  return '<label><span>'+esc(label)+(optional?' <small>facultatif</small>':'')+'</span><input type="time" name="'+name+'" value="'+esc(value)+'" min="06:00" max="20:30" step="900" '+(optional?'':'required')+'></label>';
}

export function renderPlanningEditorDialog({model,active}){
  if(!model||!active)return '';
  const employee=model.employees?.[active.employeeIndex];
  if(!employee)return '';
  const seed=planningEditorSeed(model,active.employeeIndex,active.date);
  const dateLabel=new Date(active.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  return '<div class="n2-planedit-backdrop" data-action="planning-editor-close"></div>'+
    '<section class="n2-planedit-dialog" role="dialog" aria-modal="true" aria-labelledby="n2PlanEditTitle">'+
      '<form id="planningEditorForm">'+
        '<header><div><small>MODIFIER LA JOURNÉE</small><h3 id="n2PlanEditTitle">'+esc(employee.name)+'</h3><p>'+esc(dateLabel)+'</p></div>'+
        '<button type="button" class="n2-planedit-close" data-action="planning-editor-close" aria-label="Fermer">×</button></header>'+
        '<input type="hidden" name="employeeIndex" value="'+seed.employeeIndex+'">'+
        '<input type="hidden" name="date" value="'+esc(seed.date)+'">'+
        '<label class="n2-planedit-status"><span>Type de journée</span><select name="status" id="planningEditorStatus">'+
          '<option value="work" '+(seed.status==='work'?'selected':'')+'>Travail</option>'+
          '<option value="rest" '+(seed.status==='rest'?'selected':'')+'>Repos</option>'+
          '<option value="leave" '+(seed.status==='leave'?'selected':'')+'>Congés</option>'+
          '<option value="empty" '+(seed.status==='empty'?'selected':'')+'>Non planifié</option>'+
        '</select></label>'+
        '<div class="n2-planedit-times" data-editor-times '+(seed.status==='work'?'':'hidden')+'>'+
          '<div class="n2-planedit-range"><strong>Plage principale</strong>'+timeInput('firstStart',seed.firstStart,'Début')+timeInput('firstEnd',seed.firstEnd,'Fin')+'</div>'+
          '<div class="n2-planedit-range"><strong>Deuxième plage</strong>'+timeInput('secondStart',seed.secondStart,'Début',true)+timeInput('secondEnd',seed.secondEnd,'Fin',true)+'</div>'+
        '</div>'+
        '<p class="n2-planedit-help">Créneaux de 15 minutes · 06:00 à 20:30. Les changements restent en brouillon jusqu’à l’enregistrement de la semaine.</p>'+
        '<div class="n2-planedit-actions"><button type="button" class="btn" data-action="planning-editor-close">Annuler</button><button type="submit" class="btn primary">Appliquer</button></div>'+
      '</form>'+
    '</section>';
}

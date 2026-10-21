// Affichage en lecture seule du planning Desktop et PWA Desktop.
// Les codes couleur proviennent de la grille Excel déjà publiée : g, b, y, r, o, w.
const toneForSlot = value => value === 'g' ? 'morning' : value === 'b' ? 'afternoon' : null;
const names = {morning:'Matin',afternoon:'Après-midi',leave:'Congés',rest:'Repos',unavailable:'Indisponible',empty:'Sans horaire',unknown:'Non renseigné'};
const clock = value => String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');

export function describeDesktopPlanningDay(cells,startMinutes=360,minutesPerSlot=15){
  if(!Array.isArray(cells)||!cells.length||!Number.isFinite(startMinutes)||!Number.isFinite(minutesPerSlot)||minutesPerSlot<=0)
    return {status:'unknown',shifts:[]};
  const shifts=[];
  let current=null,start=0;
  for(let i=0;i<=cells.length;i++){
    const next=i<cells.length?toneForSlot(cells[i]):null;
    if(next!==current){
      if(current!==null)shifts.push({tone:current,startMinutes:startMinutes+start*minutesPerSlot,endMinutes:startMinutes+i*minutesPerSlot});
      current=next;
      start=i;
    }
  }
  if(shifts.length)return {status:'work',shifts};
  if(cells.includes('y'))return {status:'leave',shifts:[]};
  if(cells.includes('w'))return {status:'unavailable',shifts:[]};
  if(cells.includes('r')||cells.includes('o'))return {status:'rest',shifts:[]};
  if(cells.every(x=>x===null||x===undefined||x===''))return {status:'empty',shifts:[]};
  return {status:'unknown',shifts:[]};
}

export function renderDesktopPlanningDay(cells,startMinutes,minutesPerSlot){
  const day=describeDesktopPlanningDay(cells,startMinutes,minutesPerSlot);
  if(day.status==='work')
    return '<div class="n2pday-list">'+day.shifts.map(s=>
      '<div class="n2pday-chip" data-tone="'+s.tone+'"><span>'+names[s.tone]+'</span><strong>'+clock(s.startMinutes)+'–'+clock(s.endMinutes)+'</strong></div>'
    ).join('')+'</div>';
  return '<div class="n2pday-chip n2pday-status" data-tone="'+day.status+'">'+names[day.status]+'</div>';
}

export function renderDesktopPlanningLegend(){
  return '<div class="n2pday-legend" role="group" aria-label="Légende des horaires">'+
    ['morning','afternoon','leave','rest'].map(tone=>'<span><i data-tone="'+tone+'" aria-hidden="true"></i>'+names[tone]+'</span>').join('')+
    '</div>';
}

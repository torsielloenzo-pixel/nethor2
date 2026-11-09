// Historique personnel du planning — rendu lecture seule.
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const dayAt=(week,index)=>{const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+index);return d.toISOString().slice(0,10);};
const SHORT=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const minute=n=>pad(Math.floor(n/60))+':'+pad(Math.round(n%60));
function revisionLabel(value){
 const d=new Date(value||'');
 if(!Number.isFinite(d.getTime()))return 'Date inconnue';
 return d.toLocaleString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function weekLabel(week){
 const a=new Date(week+'T12:00:00Z'),b=new Date(a);b.setUTCDate(b.getUTCDate()+6);
 const start=a.toLocaleDateString('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'});
 const end=b.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
 return 'Semaine du '+start+' au '+end;
}
function ranges(cells,start,step){
 let begin=-1,out=[];
 for(let i=0;i<=cells.length;i++){
  const work=i<cells.length&&['g','b'].includes(cells[i]);
  if(work&&begin<0)begin=i;
  if(!work&&begin>=0){out.push(minute(start+begin*step)+'–'+minute(start+i*step));begin=-1;}
 }
 return out;
}
function status(cells,start,step){
 const row=Array.isArray(cells)?cells:[];
 const work=ranges(row,start,step);
 if(work.length)return work.join(' / ');
 if(row.includes('y'))return 'Congé';
 if(row.includes('r')||row.includes('o'))return 'Repos';
 if(row.includes('w'))return 'Indisponible';
 if(row.every(v=>v==null||v===''))return 'Sans horaire';
 return 'Non renseigné';
}
function dayPayload(schedule,date){
 const employees=Array.isArray(schedule?.employees)?schedule.employees:[];
 return employees.map(emp=>({name:String(emp?.name||''),cells:emp?.days?.[date]??[]}));
}
function dayFingerprint(schedule,date){return JSON.stringify(dayPayload(schedule,date));}
function dayText(schedule,date){
 const start=Number(schedule?.startTime??6)*60,step=Number(schedule?.slotMinutes)||15;
 const rows=dayPayload(schedule,date);
 if(!rows.length)return 'Non disponible';
 const values=rows.map(r=>({name:r.name,label:status(r.cells,start,step)}));
 const unique=[...new Set(values.map(v=>v.label))];
 if(unique.length===1)return unique[0];
 return values.map(v=>v.name+': '+v.label).join(' · ');
}
export function groupPersonalPlanningHistory(items){
 const groups=[];
 const byWeek=new Map();
 for(const item of Array.isArray(items)?items:[]){
  const week=String(item?.week_start||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week))continue;
  if(!byWeek.has(week)){const group={weekStart:week,versions:[]};byWeek.set(week,group);groups.push(group);}
  byWeek.get(week).versions.push(item);
 }
 groups.sort((a,b)=>b.weekStart.localeCompare(a.weekStart));
 for(const group of groups)group.versions.sort((a,b)=>String(b.revision_at||'').localeCompare(String(a.revision_at||'')));
 return groups;
}
function kindLabel(kind){
 return ({baseline:'Version de référence',import:'Première publication',replace:'Planning remplacé',update:'Planning modifié'})[kind]||'Version enregistrée';
}
function versionCard(item,index,versions){
 const schedule=item?.schedule||{};
 const week=String(item?.week_start||schedule.weekStart||'');
 const older=versions[index+1]?.schedule||null;
 const changed=older?Array.from({length:7},(_,i)=>dayAt(week,i)).filter(date=>dayFingerprint(schedule,date)!==dayFingerprint(older,date)):[];
 const days=Array.from({length:7},(_,i)=>{
  const date=dayAt(week,i);
  return '<div class="n2ph-day'+(changed.includes(date)?' changed':'')+'"><span>'+SHORT[i]+' '+Number(date.slice(-2))+'</span><strong>'+safe(dayText(schedule,date))+'</strong></div>';
 }).join('');
 const latest=index===0;
 return '<details class="n2ph-version"'+(latest?' open':'')+'><summary><span><strong>'+(latest?'Dernière version':'Ancienne version')+'</strong><small>'+safe(revisionLabel(item.revision_at))+'</small></span><span class="n2ph-version-meta"><b>'+safe(kindLabel(item.change_kind))+'</b>'+(changed.length?'<em>'+changed.length+' jour'+(changed.length>1?'s':'')+' modifié'+(changed.length>1?'s':'')+'</em>':'')+'</span></summary><div class="n2ph-days">'+days+'</div>'+(item.source_file?'<p class="n2ph-source">Source : '+safe(item.source_file)+'</p>':'')+'</details>';
}
export function renderPersonalPlanningHistory({loading=false,error='',items=[]}={}){
 const groups=groupPersonalPlanningHistory(items);
 let body='';
 if(loading&&!groups.length)body='<div class="n2ph-empty">Chargement de ton historique…</div>';
 else if(error&&!groups.length)body='<div class="n2ph-empty" role="alert">'+safe(error)+'</div>';
 else if(!groups.length)body='<div class="n2ph-empty"><strong>Aucune version personnelle enregistrée</strong><span>Ton historique apparaîtra ici dès qu’un planning lié à ton compte sera publié.</span></div>';
 else body='<div class="n2ph-weeks">'+groups.map((group,i)=>
  '<details class="n2ph-week"'+(i===0?' open':'')+'><summary><span><strong>'+safe(weekLabel(group.weekStart))+'</strong><small>'+group.versions.length+' version'+(group.versions.length>1?'s':'')+'</small></span><b>⌄</b></summary><div class="n2ph-versions">'+group.versions.map((item,index)=>versionCard(item,index,group.versions)).join('')+'</div></details>'
 ).join('')+'</div>';
 return '<button type="button" class="n2ph-scrim" data-action="personal-history-close" aria-label="Fermer l’historique"></button><div class="n2ph-card" role="dialog" aria-modal="true" aria-labelledby="n2ph-title"><header class="n2ph-head"><div><span>MON PLANNING</span><h2 id="n2ph-title">Historique personnel</h2><p>Retrouve les versions enregistrées de tes propres horaires.</p></div><button type="button" class="n2ph-close" data-action="personal-history-close" aria-label="Fermer">×</button></header><div class="n2ph-note">Les versions complètes sont conservées à partir du 9 novembre 2026. Les semaines déjà publiées ont été enregistrées comme point de départ ; NETHOR ne peut pas reconstruire une ancienne version complète qui n’avait pas été sauvegardée.</div>'+body+'</div>';
}

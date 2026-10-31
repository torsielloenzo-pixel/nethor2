import test from 'node:test';
import assert from 'node:assert/strict';
import {planningMobileData,renderMobilePlanning} from '../src/ui/planning-mobile.js';
const week='2026-10-19';
const make=(entries)=>{
 const dates=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,9,19+i)).toISOString().slice(0,10));
 const employees=[{name:'Alex',excelContractHours:35},{name:'Marie'},{name:'Camille'}];
 const days=Object.fromEntries(dates.map(d=>[d,{cells:employees.map(e=>entries[e.name]?.[d]??Array(58).fill(null))}]));
 return {weekStart:week,slotMinutes:15,startTime:6,employees,days};
};
const empty=()=>Array(58).fill(null);
const work=(color='g')=>Array.from({length:58},(_,i)=>i<12?color:null);
const status=c=>Array(58).fill(c);
const me={planning_name:'Marie',display_name:'Marie',id:'2'};
const options={weekStart:week,selectedDay:week,view:'week',profiles:[],currentProfile:me,now:new Date('2026-10-19T11:15:00Z')};
test('Semaine : sept jours et cartes par personne, sans compteurs ni filtres',()=>{
 const model=make({Alex:{[week]:work('g')},Marie:{[week]:work('b')},Camille:{[week]:status('y')}});
 const data=planningMobileData(model,[],me,week);
 assert.equal(data.dates.length,7);
 assert.equal(data.employees[0].name,'Marie');
 assert.equal(data.employees[0].total,3);
 const html=renderMobilePlanning({...options,model});
 assert.doesNotMatch(html,/class="n2pm-summary"/);
 assert.doesNotMatch(html,/class="n2pm-filters"/);
 assert.doesNotMatch(html,/data-mobile-planning-filter=/);
 assert.doesNotMatch(html,/>Équipe<\/span>/);
 assert.doesNotMatch(html,/>En poste<\/span>/);
 assert.doesNotMatch(html,/>Tous<\/button>/);
 assert.doesNotMatch(html,/>Autres<\/button>/);
 assert.doesNotMatch(html,/>Moi<\/button>/);
 assert.match(html,/data-mobile-planning-day="2026-10-19"/);
 assert.match(html,/data-mobile-planning-open="2026-10-19"/);
 assert.match(html,/data-color="g"/);
 assert.match(html,/data-color="b"/);
 assert.match(html,/data-color="leave"/);
 assert.equal((html.match(/class="n2pm-week-card/g)||[]).length,3);
 assert.ok(html.indexOf('Marie')<html.indexOf('Alex'));
});
test('Jours : planning personnel puis équipe en poste et absents repliables',()=>{
 const model=make({Alex:{[week]:work('g')},Marie:{[week]:work('b')},Camille:{[week]:status('y')}});
 const html=renderMobilePlanning({...options,view:'day',model});
 assert.match(html,/Mon planning/);
 assert.match(html,/Équipe du jour/);
 assert.match(html,/Repos, congés et sans horaire/);
 assert.match(html,/data-mobile-planning-away/);
 assert.match(html,/data-mobile-planning-filter="upcoming"/);
 assert.ok(html.indexOf('Mon planning')<html.indexOf('Équipe du jour'));
 assert.ok(html.indexOf('Équipe du jour')<html.indexOf('Repos, congés et sans horaire'));
});
test('codes couleur jaune, rouge, orange et indisponible',()=>{
 const model=make({Marie:{
  '2026-10-19':status('y'),
  '2026-10-20':status('r'),
  '2026-10-21':status('o'),
  '2026-10-22':status('w')
 }});
 const mine=planningMobileData(model,[],me,week).employees[0];
 assert.deepEqual(mine.days.slice(0,4).map(d=>d.kind),['leave','red','orange','unavailable']);
 const html=renderMobilePlanning({...options,model});
 for(const color of ['leave','red','orange','unavailable'])assert.ok(html.includes('data-color="'+color+'"'));
});
test('ne pas montrer les comptes désactivés, et ne jamais attribuer un horaire non lié',()=>{
 const model=make({Alex:{[week]:work()},Marie:{[week]:work()}});
 const profiles=[{display_name:'Alex',account_enabled:false}];
 const data=planningMobileData(model,profiles,{planning_name:'Nom inconnu'},week);
 assert.equal(data.mineIndex,-1);
 assert.ok(data.employees.every(x=>x.name!=='Alex'));
 const html=renderMobilePlanning({...options,view:'day',currentProfile:{planning_name:'Nom inconnu'},profiles,model});
 assert.match(html,/Aucun collaborateur n’est associé/);
 assert.doesNotMatch(html,/Alex/);
});
test('ne pas inventer des horaires, aucun planning publié',()=>{
 const html=renderMobilePlanning({...options,model:null});
 assert.match(html,/Aucun planning publié/);
 assert.doesNotMatch(html,/Équipe du jour/);
});
test('une journée divisée vert/bleu garde les deux horaires distincts',()=>{
 const row=Array.from({length:58},(_,i)=>i<8?'g':i<16?'b':null);
 const model=make({Marie:{[week]:row}});
 const mine=planningMobileData(model,[],me,week).employees[0];
 assert.deepEqual(mine.days[0].shifts.map(s=>s.color),['g','b']);
 assert.equal(mine.days[0].total,4);
 assert.match(renderMobilePlanning({...options,view:'day',model}),/08:00 – 10:00/);
});
test('l\'interface échappe les noms provenant du planning',()=>{
 const model=make({Marie:{[week]:work()}});
 model.employees[1].name='<img onerror=alert(1)>';
 const html=renderMobilePlanning({...options,currentProfile:{planning_name:'<img onerror=alert(1)>'},model});
 assert.doesNotMatch(html,/<img onerror/);
 assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);
});


test('états réseau et fraîcheur : aujourd’hui, hors ligne et mise à jour PWA',()=>{
 const model=make({Marie:{[week]:work('b')}});
 const online=renderMobilePlanning({...options,model,updatedAt:new Date('2026-10-19T08:30:00Z').getTime(),isOnline:true});
 assert.match(online,/data-action="today"/);
 assert.match(online,/Mis à jour à/);
 assert.match(online,/data-online="true">En ligne/);
 assert.match(online,/>Après-midi</);

 const offline=renderMobilePlanning({...options,model,isOnline:false});
 assert.match(offline,/Mode hors ligne/);
 assert.match(offline,/data-online="false">Hors ligne/);
 assert.match(offline,/data-action="prev"[^>]*disabled/);
 assert.match(offline,/data-action="next"[^>]*disabled/);

 const update=renderMobilePlanning({...options,model,updateReady:true});
 assert.match(update,/data-action="pwa-update"/);
 assert.match(update,/Mettre à jour NETHOR/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {filterHistory,historyMonthKey,renderHistoryBrowser} from '../src/ui/import-history.js';
const data=[
 {id:'oct',source:'manual',file_name:'Planning B.xlsx',week_start:'2026-11-09',imported_by_name:'Admin',occurredAt:'2026-10-31T12:20:00Z'},
 {id:'sep',source:'sync',fileName:'C.xlsx',previousFileName:'B.xlsx',kind:'replaced',occurredAt:'2026-09-10T10:00:00Z'},
 {id:'auto',source:'auto',file_name:'Planning C.xlsx',week_start:'2026-10-19',occurredAt:'2026-10-09T10:00:00Z'}
];
test('classement chronologique et filtres origine',()=>{
 assert.deepEqual(filterHistory(data).map(x=>x.id),['oct','auto','sep']);
 assert.deepEqual(filterHistory(data,{sort:'oldest'}).map(x=>x.id),['sep','auto','oct']);
 assert.deepEqual(filterHistory(data,{source:'sync'}).map(x=>x.id),['sep']);
});
test('recherche sur le nom du fichier et date de semaine au format français',()=>{
 assert.deepEqual(filterHistory(data,{query:'09/11'}).map(x=>x.id),['oct']);
 assert.deepEqual(filterHistory(data,{query:'Planning B'}).map(x=>x.id),['oct']);
 assert.equal(historyMonthKey(data[0]),'2026-10');
});
test('mois regroupés et fermés par défaut',()=>{
 const html=renderHistoryBrowser(data);
 assert.equal((html.match(/class="n2hist-month"/g)||[]).length,2);
 assert.doesNotMatch(html,/class="n2hist-month"[^>]* open/);
 assert.match(html,/historySearch/);
});

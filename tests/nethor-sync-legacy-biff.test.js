import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legacyStyleReader} from '../supabase/functions/nethor-sync-auto-publish/xls-legacy-colors.js';

const worker=readFileSync(new URL('../supabase/functions/nethor-sync-auto-publish/index.ts',import.meta.url),'utf8');

test('Le lecteur BIFF8 refuse les fichiers non OLE sans inventer des horaires',()=>{
  assert.equal(legacyStyleReader(new ArrayBuffer(512)),null);
  assert.equal(legacyStyleReader(new Uint8Array(0).buffer),null);
});
test('Les anciens XLS lisent la palette BIFF8 avant le style moderne',()=>{
  assert.match(worker,/legacyStyleReader\(buffer\)/);
  assert.match(worker,/biff \?\? resolveExcelColor/);
  assert.match(worker,/parsePlanningWorkbook\(workbook,XLSX,verifiedColor\)/);
  assert.match(worker,/crypto\.subtle\.digest\("SHA-256"/);
});

test('Les totaux numeriques blancs sont exclus sans effacer les vrais horaires',async()=>{
 const {parsePlanningWorkbook}=await import('../supabase/functions/nethor-sync-auto-publish/excel-structure.js');
 const days=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
 const sheets=Object.fromEntries(days.map(name=>[name,{B2:{v:'02.03.26'},B4:{v:'Employé exemple'},C4:{v:3},D4:{v:1},'!ref':'A1:B4'}]));
 const XLSX={utils:{encode_cell:({r,c})=>{
  let n=c+1,k='';while(n>0){n--;k=String.fromCharCode(65+n%26)+k;n=Math.floor(n/26)}
  return k+(r+1);
 },decode_range:()=>({e:{r:3}})}};
 const parse=(cellColor,model)=>{
  const wb={SheetNames:days,Sheets:Object.fromEntries(days.map(d=>[d,{...sheets[d]}]))};
  return parsePlanningWorkbook(wb,XLSX,({colIndex})=>colIndex===2?'w':colIndex===3?cellColor:null);
 };
 const ok=parse('g');
 assert.equal(ok.days['2026-03-02'].cells[0][0],null);
 assert.equal(ok.days['2026-03-02'].cells[0][1],'g');
 assert.throws(()=>parse('w'),/sans couleur fiable/);
 for(const day of days)sheets[day].C4.v=1;
 assert.throws(()=>parse('g'),/sans couleur fiable/);
});

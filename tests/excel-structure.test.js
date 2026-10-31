import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanningWorkbook} from '../src/import/excel-structure.js';
const names=['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
const xlsx={utils:{encode_cell:({r,c})=>String.fromCharCode(65+c)+(r+1),decode_range:()=>({e:{r:3}})}};
function fixture(){const sheets=Object.fromEntries(names.map(n=>[n,{B4:{v:'Clément'},'!ref':'B2:BH4'}]));sheets.LUNDI.B2={v:new Date(2026,9,12)};return{SheetNames:[...names],Sheets:sheets};}
test('lit sept jours et tous les 58 créneaux',()=>{
 const model=parsePlanningWorkbook(fixture(),xlsx,()=>null);
 assert.equal(Object.keys(model.days).length,7);
 assert.equal(model.days['2026-10-18'].cells[0].length,58);
 assert.equal(model.employees[0].name,'Clément');
});
test('refuse une feuille manquante',()=>{const f=fixture();f.SheetNames.pop();assert.throws(()=>parsePlanningWorkbook(f,xlsx,()=>null),/DIMANCHE/);});
test('refuse la perte silencieuse des cellules colorées',()=>{const f=fixture();f.Sheets.LUNDI.C4={v:1};assert.throws(()=>parsePlanningWorkbook(f,xlsx,()=>null),/sans couleur fiable/);});
test('conserve la couleur de travail',()=>{const model=parsePlanningWorkbook(fixture(),xlsx,({sheetName,colIndex})=>sheetName==='LUNDI'&&colIndex===2?'g':null);assert.equal(model.colorCounts.g,1);});

test('refuse un décalage de collaborateur entre deux jours',()=>{
 const f=fixture();
 f.Sheets.MARDI.B4={v:'Autre personne'};
 assert.throws(()=>parsePlanningWorkbook(f,xlsx,()=>null),/Collaborateur décalé : MARDI ligne 4/);
});

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

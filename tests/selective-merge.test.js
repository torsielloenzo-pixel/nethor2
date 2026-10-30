import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSelectiveImport} from '../src/import/selective-merge.js';
test('keeps excluded existing cells and updates selected cells',()=>{
 const result=prepareSelectiveImport({existing:{Alice:{lun:'08-12',mar:'09-13'}},incoming:{Alice:{lun:'10-14',mar:'12-16'}},decisions:{'Alice:mar':'keep'}});
 assert.equal(result.data.Alice.lun,'10-14');assert.equal(result.data.Alice.mar,'09-13');assert.equal(result.changes.length,1);
});
test('rejects blank imported values',()=>assert.throws(()=>prepareSelectiveImport({incoming:{Alice:{lun:''}}})));

import test from 'node:test';
import assert from 'node:assert/strict';
import {modernColorResolver} from '../src/import/color-resolver.js';
test('détecte les couleurs explicites du modèle',()=>{
 assert.equal(modernColorResolver({cell:{s:{fill:{fgColor:{rgb:'FF00B050'}}}}}),'g');
 assert.equal(modernColorResolver({cell:{s:{fill:{fgColor:{rgb:'FFFF0000'}}}}}),'r');
});
test('refuse les couleurs à thème non décodées',()=>{
 assert.throws(()=>modernColorResolver({cell:{s:{fill:{fgColor:{theme:1}}}}}),/thème/);
});

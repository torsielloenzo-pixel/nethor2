import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLoginEmail} from '../src/auth/login-identifier.js';

test('accepte les identifiants existants Nethor',()=>{
 assert.equal(resolveLoginEmail('Enzo'), 'enzo@stock-fl.local');
 assert.equal(resolveLoginEmail(' ALEX.01 '), 'alex.01@stock-fl.local');
 assert.equal(resolveLoginEmail(' prénom.nom '),'prnom.nom@stock-fl.local');
});
test('accepte une adresse e-mail sans la remplacer par une adresse interne',()=>{
 assert.equal(resolveLoginEmail(' Exemple@GMAIL.COM '),'exemple@gmail.com');
});
test('rejette les entrées vides ou sans caractères utilisables',()=>{
 assert.throws(()=>resolveLoginEmail('  '),/identifiant/i);
 assert.throws(()=>resolveLoginEmail('***'),/invalide/i);
 assert.throws(()=>resolveLoginEmail(null),/identifiant/i);
});
test('n’accepte pas de valeurs excessivement longues',()=>assert.throws(()=>resolveLoginEmail('a'.repeat(255)),/invalide/i));

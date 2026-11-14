import test from 'node:test';
import assert from 'node:assert/strict';
import {NETHOR_SYNC_ACCOUNT_ID,logoutScopeForUser} from '../src/auth/logout-policy.js';

test('Netto.magasin ne révoque que sa session locale',()=>{
  assert.equal(logoutScopeForUser(NETHOR_SYNC_ACCOUNT_ID),'local');
});

test('les autres comptes conservent la déconnexion globale',()=>{
  assert.equal(logoutScopeForUser('11111111-1111-4111-8111-111111111111'),'global');
  assert.equal(logoutScopeForUser(null),'global');
});

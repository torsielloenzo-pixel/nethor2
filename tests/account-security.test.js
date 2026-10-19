import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRecoveryEmail,validateRecoveryEmail,validateNewPassword,validateRecoveryPassword,RESET_REQUEST_MESSAGE} from '../src/auth/account-security.js';
import {renderSecuritySettings} from '../src/ui/settings-security.js';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('une adresse personnelle est acceptée, l’adresse technique Nethor est refusée',()=>{
 assert.equal(normalizeRecoveryEmail(' Essai@Example.FR '),'essai@example.fr');
 assert.equal(validateRecoveryEmail(' Essai@Example.FR '),'essai@example.fr');
 for(const email of ['','abc','x@stock-fl.local','x@y','a'.repeat(255)+'@gmail.com']){
  assert.throws(()=>validateRecoveryEmail(email));
 }
});
test('changement de mot de passe : ancien mot de passe requis et confirmation exacte',()=>{
 assert.deepEqual(validateNewPassword('ancien','MotDePasseUnique12!','MotDePasseUnique12!'),{currentPassword:'ancien',password:'MotDePasseUnique12!'});
 assert.throws(()=>validateNewPassword('','NouveauMotDePasse#22','NouveauMotDePasse#22'),/actuel/);
 assert.throws(()=>validateNewPassword('ancien','tropCourt','tropCourt'),/12/);
 assert.throws(()=>validateNewPassword('ancien','NouveauMotDePasse#22','autre'),/correspondent pas/);
 assert.throws(()=>validateNewPassword('MotDePasseUnique12!','MotDePasseUnique12!','MotDePasseUnique12!'),/différent/);
 assert.equal(validateRecoveryPassword('NouveauMotDePasse#22','NouveauMotDePasse#22'),'NouveauMotDePasse#22');
});
test('Paramètres : formulaire email et mot de passe, demande Resend uniquement si adresse associée',()=>{
 const without=renderSecuritySettings({configured:false});
 const withEmail=renderSecuritySettings({configured:true});
 assert.match(without,/id="recoveryEmailForm"/);
 assert.match(without,/id="changePasswordForm"/);
 assert.match(without,/type="email"/);
 assert.match(without,/type="password"/);
 assert.match(without,/data-action="request-password-email" disabled/);
 assert.match(withEmail,/id="oldRecoveryEmail"/);
 assert.match(withEmail,/data-action="request-password-email"/);
 assert.doesNotMatch(without,/Ancienne adresse e-mail/);
 assert.match(RESET_REQUEST_MESSAGE,/si une adresse|Si une adresse/);
});
test('Nethor : fonctions Supabase existantes et changement de mot de passe avec currentPassword',()=>{
 const code=file('src/ui/live.js');
 assert.match(code,/client\.functions\.invoke\(name,\{body\}\)/);
 assert.match(code,/'profile-email',\{action:'status'\}/);
 assert.match(code,/'profile-email',\{action:'save',old_email:oldEmail,new_email:newEmail\}/);
 assert.match(code,/'password-recovery-email',\{action:'request',identifier:text\}/);
 assert.match(code,/client\.auth\.updateUser\(changes\)/);
 assert.match(code,/data-action="forgot-password"/);
 assert.match(code,/renderSecuritySettings\(state\.accountSecurity\)/);
 // La connexion historique est intacte : aucun remplacement de @stock-fl.local.
 assert.match(file('src/auth/login-identifier.js'),/@stock-fl\.local/);
});
test('lien Resend : jeton vérifié par Supabase et supprimé de l’URL',()=>{
 const page=file('reset-password.html');
 const code=file('src/auth/password-recovery-page.js');
 assert.match(page,/meta name="referrer" content="no-referrer"/);
 assert.match(page,/id="resetForm"/);
 assert.match(code,/history\.replaceState\(\{\},'',window\.location\.pathname\)/);
 assert.match(code,/auth\.verifyOtp\(\{type:'recovery',token_hash:tokenHash\}\)/);
 assert.match(code,/auth\.updateUser\(\{password\}\)/);
 assert.match(code,/action:'resolved'/);
 assert.doesNotMatch(page,/RESEND_API_KEY|service_role/);
});
test('GitHub Pages et PWA : publication de récupération, aucune mise en cache du jeton',()=>{
 const workflow=file('.github/workflows/preview-pages.yml');
 const sw=file('sw.js');
 for(const name of ['reset-password.html','settings-security.js','account-security.js','password-recovery-page.js'])assert.ok(workflow.includes(name),name);
 assert.ok(sw.includes("src/auth/account-security.js"));
 assert.ok(sw.includes("src/ui/settings-security.js"));
 assert.doesNotMatch(sw,/reset-password\.html|password-recovery-page\.js/);
 assert.doesNotMatch(sw,/supabase\.co/);
});

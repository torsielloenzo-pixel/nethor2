import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldOfferRecoveryPrompt,renderRecoveryPrompt} from '../src/ui/recovery-prompt.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ready={mobile:true,loaded:true,configured:false,error:false,dismissed:false};

test('invitation uniquement pour Employé et Responsable sur mobile et PWA mobile',()=>{
 for(const role of ['employe','responsable']){
  assert.equal(shouldOfferRecoveryPrompt({...ready,role}),true);
  assert.equal(shouldOfferRecoveryPrompt({...ready,role,mobile:false}),false);
 }
 for(const role of ['admin','role_point-de-vente','point_de_vente','lecture_seule',undefined]){
  assert.equal(shouldOfferRecoveryPrompt({...ready,role}),false);
 }
});

test('ne jamais solliciter si adresse liée ou état incertain',()=>{
 for(const changed of [{configured:true},{loaded:false},{error:true},{dismissed:true},{mobile:false}]){
  assert.equal(shouldOfferRecoveryPrompt({...ready,role:'employe',...changed}),false);
 }
 assert.equal(shouldOfferRecoveryPrompt({role:'employe',mobile:true}),false);
});

test('fenêtre de proposition non bloquante et choix Plus tard',()=>{
 const markup=renderRecoveryPrompt({step:'offer'});
 assert.match(markup,/role="dialog" aria-modal="true"/);
 assert.match(markup,/Sécurise ton accès à NETHOR/);
 assert.match(markup,/Ajouter mon adresse/);
 assert.match(markup,/Plus tard/);
 assert.match(markup,/data-action="recovery-later"/);
 assert.match(markup,/Cette adresse ne remplacera pas ton identifiant/);
 assert.doesNotMatch(markup,/firstLoginRecoveryForm/);
});

test('formulaire d’enregistrement et résultat, texte échappé',()=>{
 const form=renderRecoveryPrompt({step:'form',error:'<script>alert(1)</script>'});
 assert.match(form,/id="firstLoginRecoveryForm"/);
 assert.match(form,/id="firstLoginRecoveryEmail"/);
 assert.match(form,/type="email"/);
 assert.match(form,/Associer cette adresse/);
 assert.match(form,/data-action="recovery-back"/);
 assert.doesNotMatch(form,/<script>/);
 assert.match(form,/&lt;script&gt;/);
 const success=renderRecoveryPrompt({step:'success',mailStatus:'sent'});
 assert.match(success,/Adresse associée/);
 assert.match(success,/Accéder à mon accueil/);
 assert.match(success,/ne constitue pas une vérification/);
 assert.equal(renderRecoveryPrompt({step:'closed'}),'');
});

test('vérification auprès du serveur après connexion, sauvegarde serveur et report de session',()=>{
 const js=read('src/ui/live.js');
 assert.match(js,/if\(shouldCheckRecoveryOnLogin\(\)\)void maybeOfferRecoveryAfterLogin\(\)/);
 assert.match(js,/async function maybeOfferRecoveryAfterLogin\(\)/);
 assert.match(js,/await loadAccountRecoveryStatus\(\)/);
 assert.match(js,/shouldOfferRecoveryPrompt\(\{/);
 assert.match(js,/smallScreen\(\)\&\&\(state\.profile\?\.role==='employe'\|\|state\.profile\?\.role==='responsable'\)/);
 assert.match(js,/invokeAccountFunction\('profile-email',\{action:'save',old_email:'',new_email:email\}\)/);
 assert.match(js,/validateRecoveryEmail\(field\?\.value\)/);
 assert.match(js,/result\.configured!==true/);
 assert.match(js,/sessionStorage\.setItem\(recoveryDismissKey\(state\.user\.id\),'1'\)/);
 assert.match(js,/clearRecoveryDismissed\(gate\.gate\.user\.id\)/);
 assert.match(js,/await loadWeek\(\);\s*\/\/ Vérifier une fois la page mobile complètement montée/);
 assert.match(js,/document\.body\.insertAdjacentHTML\('beforeend',renderRecoveryPrompt/);
 assert.match(js,/document\.addEventListener\('click'/);
 assert.match(js,/document\.addEventListener\('submit'/);
 assert.match(js,/document\.getElementById\('firstLoginRecoveryPrompt'\)/);
 assert.match(js,/if\(response\.success!==true\|\|typeof response\.configured!=='boolean'\)/);
 const css=read('mobile.css');
 assert.match(css,/@media\(max-width:760px\)\{\s*body:has\(#firstLoginRecoveryPrompt\)/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
});

test('publiée dans web, préchargement PWA et serveur de développement',()=>{
 const sw=read('sw.js'),build=read('.github/workflows/preview-pages.yml'),dev=read('scripts/dev-server.js');
 for(const file of [sw,build,dev])assert.ok(file.includes('recovery-prompt.js'));
 assert.match(sw,/const CACHE_NAME='nethor-[^']+-v\d+'/);
});

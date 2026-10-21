import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../config/public.js';
import {validateRecoveryPassword} from './account-security.js';
// Ne jamais conserver le jeton de récupération dans localStorage, le SW ni les journaux.
const message=document.getElementById('message');
const form=document.getElementById('resetForm');
const button=document.getElementById('resetSubmit');
const query=new URLSearchParams(window.location.search);
const tokenHash=query.get('token_hash')||'';
const type=query.get('type')||'';
const requestId=query.get('request_id')||'';
// Réduire immédiatement l'exposition du jeton dans l'historique et lors de la navigation.
window.history.replaceState({},'',window.location.pathname);
const notify=(text,kind='info')=>{message.textContent=text;message.dataset.kind=kind;};
let client=null;
let valid=false;
function validRequestId(id){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);}
async function init(){
 if(type!=='recovery'||tokenHash.length<20||tokenHash.length>2048){
  notify('Lien de réinitialisation absent ou invalide. Demande un nouveau lien depuis NETHOR.','error');return;
 }
 if(!window.supabase?.createClient){
  notify('Service d’authentification indisponible. Vérifie ta connexion.','error');return;
 }
 client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{storageKey:'nethor2-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
 });
 try{
  const {error}=await client.auth.verifyOtp({type:'recovery',token_hash:tokenHash});
  if(error)throw error;
  valid=true;form.hidden=false;
  notify('Lien confirmé. Tu peux maintenant choisir un nouveau mot de passe.');
 }catch(_){notify('Ce lien est expiré ou déjà utilisé. Demande un nouveau lien depuis NETHOR.','error');}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!valid||!client||button.disabled)return;
 const input=form.querySelector('#newPassword'),again=form.querySelector('#confirmPassword');
 let password;
 try{password=validateRecoveryPassword(input.value,again.value);}
 catch(error){notify(error.message,'error');return;}
 button.disabled=true;button.textContent='Modification…';
 try{
  const {error}=await client.auth.updateUser({password});
  if(error)throw error;
  input.value='';again.value='';form.hidden=true;valid=false;
  notify('Mot de passe modifié. Tu peux désormais te reconnecter à NETHOR.','success');
  // Le suivi de demande est distinct du succès du changement Supabase Auth.
  if(validRequestId(requestId)){
   try{
    await client.functions.invoke('password-recovery-email',{
      body:{action:'resolved',request_id:requestId,token_hash:tokenHash}
    });
   }catch(_){/* Aucune nouvelle tentative d'envoi ; le mot de passe est déjà modifié. */}
  }
  await client.auth.signOut({scope:'local'}).catch(()=>{});
 }catch(error){
  notify(error?.code==='reauthentication_needed'?
    'Une nouvelle authentification est nécessaire. Demande un autre lien de récupération.':
    'Le changement n’a pas été confirmé par Supabase. Vérifie le mot de passe et réessaie.','error');
 }finally{button.disabled=false;button.textContent='Enregistrer le nouveau mot de passe';}
});
void init();
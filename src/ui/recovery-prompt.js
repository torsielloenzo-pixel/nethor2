// Invite de récupération non bloquante après connexion : interface mobile uniquement.
// La présence d'une adresse est déterminée par l'Edge Function profile-email (status).
// Aucun e-mail personnel ni renseignement de session n'est stocké dans le navigateur.
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function shouldOfferRecoveryPrompt({role,mobile,loaded,configured,error,dismissed}={}){
  return (role==='responsable'||role==='employe')&&mobile===true&&
    loaded===true&&configured===false&&error!==true&&dismissed!==true;
}

export function renderRecoveryPrompt({step='offer',busy=false,error='',mailStatus=''}={}){
  if(!['offer','form','success'].includes(step))return '';
  const info='<div class="n2rp-info"><span aria-hidden="true">ⓘ</span><span>Cette adresse ne remplacera pas ton identifiant de connexion Nethor.</span></div>';
  const title=step==='offer'?'Sécurise ton accès à Nethor':step==='form'?'Adresse de récupération':'Adresse associée';
  let body='';
  if(step==='offer'){
    body='<div class="n2rp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></div>'+
      '<h2 id="n2rp-title">'+title+'</h2>'+
      '<p>Tu n’as pas encore ajouté d’adresse e-mail de récupération à ton compte.</p>'+
      '<p>Associe une adresse personnelle pour pouvoir récupérer ton accès si tu oublies ton mot de passe.</p>'+info+
      '<div class="n2rp-actions"><button type="button" class="n2rp-btn primary" data-action="recovery-add">Ajouter mon adresse</button>'+
      '<button type="button" class="n2rp-btn secondary" data-action="recovery-later">Plus tard</button></div>';
  }else if(step==='form'){
    body='<div class="n2rp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></div>'+
      '<h2 id="n2rp-title">'+title+'</h2>'+
      '<p>Renseigne l’adresse e-mail personnelle que tu souhaites associer à ton compte.</p>'+
      '<form id="firstLoginRecoveryForm" autocomplete="on">'+
      '<label for="firstLoginRecoveryEmail">Adresse e-mail personnelle</label>'+
      '<input id="firstLoginRecoveryEmail" type="email" name="recovery_email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="prenom@exemple.fr"'+(busy?' disabled':'')+'>'+
      (error?'<p class="n2rp-error" role="alert">'+esc(error)+'</p>':'')+
      info+'<p class="n2rp-footnote">Un e-mail d’information peut être envoyé, mais il ne vérifie pas à lui seul que cette adresse t’appartient.</p>'+
      '<div class="n2rp-actions"><button type="submit" class="n2rp-btn primary"'+(busy?' disabled':'')+'>'+(busy?'Enregistrement…':'Associer cette adresse')+'</button>'+
      '<button type="button" class="n2rp-btn secondary" data-action="recovery-back"'+(busy?' disabled':'')+'>Retour</button></div>'+
      '</form>';
  }else{
    body='<div class="n2rp-icon success" aria-hidden="true">✓</div>'+
      '<h2 id="n2rp-title">'+title+'</h2>'+
      '<p>Ton adresse de récupération a bien été enregistrée.</p>'+
      '<p>Cette proposition ne s’affichera plus tant que ton compte disposera d’une adresse associée.</p>'+
      (mailStatus==='sent'?'<p class="n2rp-footnote">Un e-mail d’information a été envoyé. Il ne constitue pas une vérification de propriété.</p>':'')+
      '<div class="n2rp-actions"><button type="button" class="n2rp-btn primary" data-action="recovery-done">Accéder à mon accueil</button></div>';
  }
  return '<div id="firstLoginRecoveryPrompt" class="n2rp-overlay" data-step="'+step+'">'+
    '<section class="n2rp-sheet" role="dialog" aria-modal="true" aria-labelledby="n2rp-title" aria-describedby="n2rp-description">'+
    '<div class="n2rp-handle" aria-hidden="true"></div><div id="n2rp-description" class="sr-only">Proposition facultative après la connexion.</div>'+
    body+'</section></div>';
}

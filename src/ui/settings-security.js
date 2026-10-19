// Paramètres de sécurité : HTML pur, aucun secret conservé en mémoire applicative.
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function renderSecuritySettings(account={}){
 const configured=account.configured===true;
 const status=account.loading?'Vérification…':
   account.error?'État indisponible':
   configured?'Adresse de récupération associée':'Aucune adresse associée';
 const notice=account.message?'<div class="n2sec-notice" role="status" data-kind="'+esc(account.kind||'info')+'">'+esc(account.message)+'</div>':'';
 return '<div class="n2sec-panels">'+
   '<section class="card n2sec-card" aria-labelledby="n2sec-email-title">'+
     '<div class="card-head"><div><h2 class="card-title" id="n2sec-email-title">Adresse e-mail de récupération</h2>'+
       '<p class="sub">Associe une adresse personnelle sans modifier ton identifiant Nethor.</p></div></div>'+
     '<div class="card-body"><div class="n2sec-state"><span class="n2sec-dot" data-linked="'+String(configured)+'"></span>'+esc(status)+'</div>'+
       '<p class="n2sec-help">Cette adresse permet de recevoir les liens de récupération. Elle ne remplace pas ton identifiant de connexion.</p>'+
       '<form id="recoveryEmailForm" class="n2sec-form" autocomplete="on">'+
       (configured?'<label for="oldRecoveryEmail">Adresse actuellement associée</label>'+
         '<input id="oldRecoveryEmail" type="email" name="old_email" autocomplete="email" maxlength="254" required placeholder="Ancienne adresse e-mail">':'')+
       '<label for="newRecoveryEmail">'+(configured?'Nouvelle adresse e-mail':'Adresse e-mail à associer')+'</label>'+
       '<input id="newRecoveryEmail" type="email" name="new_email" autocomplete="email" maxlength="254" required placeholder="prenom@exemple.fr">'+
       '<button type="submit" class="btn primary"'+(account.busy?' disabled':'')+'>'+(configured?'Modifier l’adresse':'Associer cette adresse')+'</button></form>'+
       '<p class="n2sec-caption">Un message peut être envoyé par Resend pour signaler l’enregistrement. Il ne constitue pas une vérification de propriété de l’adresse.</p>'+
     '</div></section>'+
   '<section class="card n2sec-card" aria-labelledby="n2sec-password-title">'+
     '<div class="card-head"><div><h2 class="card-title" id="n2sec-password-title">Mot de passe</h2>'+
       '<p class="sub">Protège ton compte en utilisant un mot de passe unique.</p></div></div>'+
     '<div class="card-body"><form id="changePasswordForm" class="n2sec-form" autocomplete="off">'+
       '<label for="oldPassword">Mot de passe actuel</label>'+
       '<input id="oldPassword" type="password" autocomplete="current-password" required minlength="1" placeholder="Mot de passe actuel">'+
       '<label for="newPassword">Nouveau mot de passe</label>'+
       '<input id="newPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128" placeholder="12 caractères minimum">'+
       '<label for="confirmPassword">Confirmer le nouveau mot de passe</label>'+
       '<input id="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128" placeholder="Confirmer le mot de passe">'+
       '<button type="submit" class="btn primary"'+(account.busy?' disabled':'')+'>Changer mon mot de passe</button>'+
       '</form>'+
       '<div class="n2sec-recovery"><strong>Besoin d’un lien de réinitialisation ?</strong>'+
       '<p>Une demande peut être envoyée par e-mail via Supabase et Resend, lorsque l’adresse de récupération est associée.</p>'+
       '<button type="button" class="btn" data-action="request-password-email"'+(account.busy||!configured?' disabled':'')+'>Recevoir un lien par e-mail</button>'+
       '</div></div></section>'+
   '</div>'+notice;
}

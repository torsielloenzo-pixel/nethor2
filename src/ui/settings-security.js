// Paramètres NETHOR 2 : rendu HTML pur. Aucune donnée sensible stockée ici.
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const icon=(name)=>{
 const paths={
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  sliders:'<path d="M4 7h10M18 7h2M4 17h2m4 0h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>',
  key:'<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9 2 2-2 2 2 2-3 3"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/>',
  devices:'<rect x="2" y="4" width="15" height="12" rx="2"/><path d="M7 20h5m-2-4v4"/><rect x="18" y="9" width="4" height="11" rx="1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  monitor:'<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8m-4-4v4"/>',
  lifesaver:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24m0-14.14-4.24 4.24m-5.66 5.66-4.24 4.24"/>',
  sync:'<path d="M3 12a9 9 0 0 1 15.4-6.3L21 8m0-5v5h-5M21 12a9 9 0 0 1-15.4 6.3L3 16m0 5v-5h5"/>'
 };
 return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';
};
const entry=(id,title,description,name,right='')=>
 '<button type="button" class="n2settings-link" data-action="settings-open" data-settings-view="'+esc(id)+'">'+
 '<span class="n2settings-entry-icon">'+icon(name)+'</span>'+
 '<span class="n2settings-entry-copy"><strong>'+esc(title)+'</strong><small>'+esc(description)+'</small></span>'+
 (right?'<span class="n2settings-entry-meta">'+esc(right)+'</span>':'')+
 '<span class="n2settings-chevron" aria-hidden="true">›</span></button>';
const group=(title,name,content)=>
 '<section class="n2settings-group" aria-label="'+esc(title)+'"><div class="n2settings-group-title">'+
 '<span class="n2settings-group-icon">'+icon(name)+'</span><h2>'+esc(title)+'</h2></div>'+
 '<div class="n2settings-group-links">'+content+'</div></section>';
const fact=(label,value)=>'<div class="n2settings-fact"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>';

export function renderSecuritySettings(account={},section='all'){
 const configured=account.configured===true;
 const status=account.loading?'Vérification…':
   account.error?'État indisponible':
   configured?'Adresse de récupération associée':'Aucune adresse associée';
 const notice=account.message?'<div class="n2sec-notice" role="status" data-kind="'+esc(account.kind||'info')+'">'+esc(account.message)+'</div>':'';
 const email='<section class="card n2sec-card" aria-labelledby="n2sec-email-title">'+
     '<div class="card-head"><div><h2 class="card-title" id="n2sec-email-title">Adresse e-mail de récupération</h2>'+
       '<p class="sub">Associe une adresse personnelle sans modifier ton identifiant NETHOR.</p></div></div>'+
     '<div class="card-body"><div class="n2sec-state"><span class="n2sec-dot" data-linked="'+String(configured)+'"></span>'+esc(status)+'</div>'+
       '<p class="n2sec-help">Cette adresse permet de recevoir les liens de récupération. Elle ne remplace pas ton identifiant de connexion.</p>'+
       '<form id="recoveryEmailForm" class="n2sec-form" autocomplete="on">'+
       (configured?'<label for="oldRecoveryEmail">Adresse actuellement associée</label>'+
         '<input id="oldRecoveryEmail" type="email" name="old_email" autocomplete="email" maxlength="254" required placeholder="Ancienne adresse e-mail">':'')+
       '<label for="newRecoveryEmail">'+(configured?'Nouvelle adresse e-mail':'Adresse e-mail à associer')+'</label>'+
       '<input id="newRecoveryEmail" type="email" name="new_email" autocomplete="email" maxlength="254" required placeholder="prenom@exemple.fr">'+
       '<button type="submit" class="btn primary"'+(account.busy?' disabled':'')+'>'+(configured?'Modifier l’adresse':'Associer cette adresse')+'</button></form>'+
       '<p class="n2sec-caption">Un message peut être envoyé par Resend pour signaler l’enregistrement. Il ne constitue pas une vérification de propriété de l’adresse.</p>'+
     '</div></section>';
 const password='<section class="card n2sec-card" aria-labelledby="n2sec-password-title">'+
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
       '</div></div></section>';
 return '<div class="n2sec-panels">'+(section==='all'||section==='email'?email:'')+(section==='all'||section==='password'?password:'')+'</div>'+notice;
}

export function renderSettingsPage(context={}){
 const {view='home',account={},displayName='—',identifier='',role='—',access='—',lastSignIn='—',
  preferredView='week',allowYear=false,isPwa=false,isOnline=true,workerActive=false,
  appVersion='NETHOR 2',lastPlanningCheck='—',updateReady=false,lastCheck='—',syncMarkup='',adminAccountsMarkup='',feedback=''}=context;
 const recoveryStatus=account.loading?'Vérification…':account.error?'État indisponible':account.configured?'Associée':'Non associée';
 const headings={
  profile:'Informations personnelles',permissions:'Rôle et autorisations',
  password:'Mot de passe',email:'Adresse e-mail de récupération',sessions:'Connexions et appareils',
  planning:'Affichage du planning',notifications:'Notifications',application:'Informations sur l’application',
  diagnostic:'Diagnostic',sync:'NethorSync · Administration',accounts:'Gestion des comptes'
 };
 const message=feedback?'<div class="n2settings-feedback" role="status">'+esc(feedback)+'</div>':'';
 if(view==='home'){
  return '<div class="n2settings-wrap"><div class="n2settings-grid">'+
   group('Mon compte','user',
    entry('profile','Informations personnelles','Nom et identifiant','user')+
    entry('permissions','Rôle et autorisations','Droits de consultation et de gestion','shield'))+
   group('Mot de passe et sécurité','shield',
    entry('password','Mot de passe','Changer mon mot de passe','key')+
    entry('email','Adresse e-mail de récupération','Associer ou modifier mon adresse','mail',recoveryStatus)+
    entry('sessions','Connexions et appareils','Dernière connexion et session actuelle','devices'))+
   group('Préférences','sliders',
    entry('planning','Affichage du planning','Choisir la vue à l’ouverture','calendar')+
    entry('notifications','Notifications','Informations sur les alertes disponibles','bell'))+
   group('Application et assistance','info',
    entry('application','Informations techniques','État de la connexion et de la PWA','monitor')+
    entry('diagnostic','Diagnostic et assistance','Copier un rapport sans données personnelles','lifesaver')+
    (syncMarkup?entry('sync','NethorSync','Administration du poste maître','sync'):'')+
    (adminAccountsMarkup?entry('accounts','Comptes utilisateurs','Créer, modifier et associer des comptes','user'):''))+
   '</div><div class="n2settings-bottom"><span>Les informations d’accès sont gérées par NETHOR.</span>'+
   '<button type="button" class="n2settings-signout" data-action="logout">Se déconnecter</button></div></div>';
 }
 const content=(()=>{
  if(view==='profile')return '<section class="n2settings-detail-card"><h3>Mon identité</h3>'+fact('Nom affiché',displayName)+
    fact('Identifiant de connexion',identifier)+
    '<p class="n2settings-note">L’identifiant de connexion est distinct de l’adresse e-mail de récupération. Pour corriger une identité, adresse-toi à un administrateur.</p></section>';
  if(view==='permissions')return '<section class="n2settings-detail-card"><h3>Mes accès</h3>'+
    fact('Rôle',role)+fact('Accès au planning',access)+
    '<p class="n2settings-note">Les autorisations sont attribuées par l’administration et vérifiées côté serveur. Elles ne se modifient pas depuis ce menu.</p></section>';
  if(view==='password'||view==='email')return '<div class="n2settings-details">'+renderSecuritySettings(account,view)+'</div>';
  if(view==='sessions')return '<section class="n2settings-detail-card"><h3>Ma session</h3>'+
    fact('Dernière connexion connue',lastSignIn)+fact('Appareil actuel',isPwa?'Application installée (PWA)':'Navigateur Web')+
    '<p class="n2settings-note">Seule la session en cours est affichée. La liste des autres appareils et l’historique complet des connexions ne sont pas disponibles dans cette version.</p>'+
    '<button type="button" class="btn" data-action="logout">Se déconnecter de cet appareil</button></section>';
  if(view==='planning')return '<section class="n2settings-detail-card"><h3>Vue du planning à l’ouverture</h3>'+
    '<p class="n2settings-note">Choisis la vue à afficher chaque fois que tu ouvres le planning sur cet appareil.</p>'+
    '<div class="n2settings-choices">'+
    [['week','Semaine','Les horaires de la semaine'],['day','Jour','Le détail d’une journée'],...(allowYear?[['year','Année','Calendrier des plannings publiés sur l’année']]:[])]
      .map(([value,title,desc])=>'<button type="button" class="n2settings-choice" aria-pressed="'+String(preferredView===value)+'" data-action="settings-planning-view" data-settings-choice="'+esc(value)+'">'+
       '<span><strong>'+esc(title)+'</strong><small>'+esc(desc)+'</small></span><span class="n2settings-radio" aria-hidden="true"></span></button>').join('')+
    '</div><p class="n2settings-note">Cette préférence est enregistrée uniquement dans le navigateur ou la PWA utilisée.</p></section>';
  if(view==='notifications')return '<section class="n2settings-detail-card"><h3>Notifications</h3>'+
    '<p class="n2settings-note">Aucun réglage de notifications individuelles n’est disponible dans NETHOR 2 pour le moment. Aucune notification push n’est activée depuis cet écran.</p></section>';
  if(view==='application'||view==='diagnostic')return '<section class="n2settings-detail-card"><h3>'+(view==='diagnostic'?'Informations de diagnostic':'État de NETHOR')+'</h3>'+
    fact('Application','NETHOR 2')+fact('Version de l’interface',appVersion)+fact('Mode',isPwa?'PWA installée':'Navigateur')+
    fact('Réseau (signalé par le navigateur)',isOnline?'En ligne':'Hors ligne')+
    fact('Service Worker',workerActive?'Application prise en charge':'Non actif sur cette page')+
    fact('Mise à jour PWA',updateReady?'Disponible':'À jour')+
    fact('Dernier planning chargé',lastPlanningCheck)+fact('Dernière vérification des accès',lastCheck)+
    (view==='diagnostic'?'<p class="n2settings-note">Le rapport ne contient ni mot de passe, ni adresse e-mail, ni identifiant de compte, ni jeton de connexion.</p>'+
    '<button type="button" class="btn primary" data-action="settings-copy-diagnostic">Copier le diagnostic</button>':
    '<p class="n2settings-note">Le statut « En ligne » ne garantit pas que les serveurs Supabase sont accessibles. Les mises à jour sont gérées par le navigateur et le service worker.</p>')+
    '</section>';
  if(view==='accounts')return adminAccountsMarkup||'<p>Gestion des comptes indisponible.</p>';
  if(view==='sync')return syncMarkup||'<p class="n2settings-note">Aucun paramètre NethorSync disponible pour ce compte.</p>';
  return '<p class="n2settings-note">Cette rubrique est indisponible.</p>';
 })();
 return '<div class="n2settings-wrap n2settings-subpage">'+
  '<button type="button" class="n2settings-back" data-action="settings-back"><span aria-hidden="true">←</span> Tous les paramètres</button>'+
  '<h2 class="n2settings-subtitle">'+esc(headings[view]||'Paramètres')+'</h2>'+
  message+content+'</div>';
}

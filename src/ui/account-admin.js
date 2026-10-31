// Gestion des comptes administrateur — les informations proviennent de Supabase Auth
// et profiles via la fonction Edge admin-manage-user (rôle et session validés côté serveur).
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles=[['lecture','Lecture seule'],['employe','Employé'],['responsable','Responsable'],['role_point-de-vente','Point de vente'],['admin','Administrateur']];
const roleLabel=value=>roles.find(([key])=>key===value)?.[1]||'Rôle non renseigné';
const field=(name,label,value='',attrs='')=>'<label class="n2accounts-field"><span>'+esc(label)+'</span><input name="'+esc(name)+'" value="'+esc(value)+'" '+attrs+'></label>';
const action=(mode,active,title)=>'<button type="button" class="n2accounts-tab'+(mode===active?' is-active':'')+'" data-action="admin-account-mode" data-mode="'+esc(mode)+'" aria-pressed="'+String(mode===active)+'">'+title+'</button>';
const formatDate=value=>{
 const d=new Date(value||'');
 return value&&Number.isFinite(d.getTime())?d.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'Jamais renseignée';
};
const aliasesOf=user=>{
 const seen=new Set(),names=[];
 // Le nom principal historique reste visible, les alias sont conservés séparément.
 for(const raw of [user.planning_name,...(Array.isArray(user.planning_aliases)?user.planning_aliases:[])]){
  const name=String(raw||'').trim(),key=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
  if(name&&!seen.has(key)){seen.add(key);names.push(name);}
 }
 return names;
};
const status=user=>user.account_enabled===false?['Compte désactivé','off']:['Compte actif','on'];
const pills=names=>names.length?'<div class="n2accounts-alias-list">'+names.map(name=>'<span class="n2accounts-alias">'+esc(name)+'</span>').join('')+'</div>':'<span class="n2accounts-missing">Aucun alias enregistré</span>';
const fact=(name,value)=>'<div class="n2accounts-fact"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>';
const userCard=user=>{
 const [label,tone]=status(user),aliases=aliasesOf(user);
 return '<article class="n2accounts-user"><span class="n2accounts-avatar" aria-hidden="true">'+esc((user.display_name||'?').slice(0,1).toUpperCase())+'</span>'+
 '<div class="n2accounts-user-info"><div class="n2accounts-name-row"><strong>'+esc(user.display_name||'Utilisateur')+'</strong><span class="n2accounts-status" data-status="'+tone+'">'+label+'</span></div>'+
 '<small>'+esc(user.username||user.email||'Identifiant indisponible')+' <span aria-hidden="true">·</span> '+esc(roleLabel(user.role))+'</small>'+
 '<div class="n2accounts-user-meta"><span>Dernière connexion : <b>'+esc(formatDate(user.last_sign_in_at))+'</b></span><span>'+aliases.length+' nom'+(aliases.length>1?'s':'')+' de planning</span></div>'+
 pills(aliases)+'</div><button type="button" class="n2accounts-edit" data-action="admin-account-edit" data-account-id="'+esc(user.id)+'">Voir et modifier</button></article>';
};
function userDetails(user){
 const aliases=aliasesOf(user),[label,tone]=status(user);
 const confirmed=Boolean(user.email_confirmed_at);
 return '<section class="n2accounts-profile" aria-label="Fiche du compte"><div class="n2accounts-profile-heading"><span class="n2accounts-avatar" aria-hidden="true">'+esc((user.display_name||'?').slice(0,1).toUpperCase())+'</span><div><h3>'+esc(user.display_name||'Utilisateur')+'</h3><span class="n2accounts-status" data-status="'+tone+'">'+label+'</span></div></div>'+
 '<div class="n2accounts-info-grid">'+fact('Rôle',roleLabel(user.role))+fact('Identifiant',user.username||'—')+
 fact('Création du compte',formatDate(user.created_at))+fact('Dernière connexion connue',formatDate(user.last_sign_in_at))+
 fact('Adresse technique Auth',user.email||'Non renseignée')+fact('Adresse Auth confirmée',confirmed?'Oui · '+formatDate(user.email_confirmed_at):'Non confirmée / inconnue')+
 fact('Heures contractuelles',user.contract_hours==null?'Non renseignées':String(user.contract_hours)+' h')+
 fact('Identifiant interne',user.id||'—')+'</div>'+
 '<div class="n2accounts-alias-summary"><strong>Noms de planning associés</strong>'+pills(aliases)+
 '<p class="n2settings-note">Ces noms servent à reconnaître un collaborateur dans les fichiers Excel. Un changement de nom n’est jamais associé automatiquement.</p></div>'+
 '<p class="n2accounts-disclaimer">Connexion : seule la dernière date fournie par Supabase Auth est disponible ici. Cette date ne prouve pas que le compte est actuellement en ligne et ne constitue pas un historique des connexions ni des appareils.</p></section>';
}
export function renderAccountAdmin({users=[],loading=false,error='',notice='',selected='',planningName='',mode='list',query=''}={}){
 const found=users.find(u=>u.id===selected);
 const roleOptions=roles.map(([value,label])=>'<option value="'+esc(value)+'"'+((found?.role||'employe')===value?' selected':'')+'>'+esc(label)+'</option>').join('');
 const userOptions=users.map(u=>'<option value="'+esc(u.id)+'"'+(u.id===selected?' selected':'')+'>'+esc(u.display_name||'Utilisateur')+' · '+esc(u.username||u.email||'')+'</option>').join('');
 const active=users.filter(u=>u.account_enabled!==false).length;
 const linked=users.filter(u=>aliasesOf(u).length>0).length;
 const search=String(query||'').trim().toLocaleLowerCase('fr');
 const filtered=search?users.filter(u=>[u.display_name,u.username,u.email,roleLabel(u.role),...aliasesOf(u)]
  .some(value=>String(value||'').toLocaleLowerCase('fr').includes(search))):users;
 let content='';
 if(mode==='list'){
  content='<div class="n2accounts-summary">'+
    '<div><span>Comptes répertoriés</span><strong>'+users.length+'</strong></div>'+
    '<div><span>Comptes actifs</span><strong>'+active+'</strong></div>'+
    '<div><span>Avec nom de planning</span><strong>'+linked+'</strong></div></div>'+
    '<label class="n2accounts-search"><span>Rechercher un utilisateur</span><input id="adminAccountSearch" type="search" value="'+esc(query)+'" placeholder="Nom, identifiant, rôle ou alias" autocomplete="off"></label>'+
    '<div class="n2accounts-results">'+filtered.length+' résultat'+(filtered.length>1?'s':'')+'</div>'+
    '<div class="n2accounts-list">'+(filtered.length?filtered.map(userCard).join(''):'<p class="n2accounts-empty">Aucun compte ne correspond à la recherche.</p>')+'</div>';
 }else{
  const editing=mode==='edit';
  content=(editing?'<label class="n2accounts-field"><span>Sélectionner un compte</span><select id="adminAccountTarget"><option value="">Choisir un utilisateur…</option>'+userOptions+'</select></label>':'')+
   (!editing||found?(editing?userDetails(found):'')+
    '<form id="adminAccountForm" class="n2accounts-form" autocomplete="off">'+
     '<input type="hidden" name="mode" value="'+esc(mode)+'">'+
     '<div class="n2accounts-form-heading"><h3>'+(editing?'Modifier les informations':'Nouveau compte')+'</h3><p class="n2settings-note">Les modifications sont vérifiées côté serveur par Supabase.</p></div>'+
     '<div class="n2accounts-fields">'+field('display_name','Nom affiché',editing?found?.display_name||'':planningName,'required maxlength="120"')+
     field('username','Identifiant de connexion',editing?found?.username||'':'','required maxlength="100" pattern="[a-zA-Z0-9._-]{3,100}"')+
     '<label class="n2accounts-field"><span>Rôle</span><select name="role">'+roleOptions+'</select></label>'+
     field('planning_name','Nom principal du planning',editing?found?.planning_name||'':planningName,'maxlength="120"')+
     '<label class="n2accounts-field"><span>'+(editing?'Nouveau mot de passe (facultatif)':'Mot de passe temporaire')+'</span><input type="password" name="password" autocomplete="new-password" minlength="8"'+(editing?'':' required')+'></label></div>'+
     '<div class="n2accounts-actions"><button type="submit" class="btn primary">'+(editing?'Enregistrer les modifications':'Créer le compte')+'</button></div></form>'+
     (editing?'<form id="adminAliasesForm" class="n2accounts-aliases"><h3>Modifier les alias du planning</h3><p class="n2settings-note">Un nom exact par ligne. Ajouter ou retirer un alias ne modifie pas les fichiers Excel déjà publiés.</p><label class="n2accounts-field"><span>Noms de planning</span><textarea name="aliases" rows="4" placeholder="Enzo&#10;Enzo L">'+esc((found.planning_aliases||[]).join('\n'))+'</textarea></label><div class="n2accounts-actions"><button type="submit" class="btn">Enregistrer les alias</button></div></form>':'')
    :'<div class="n2accounts-prompt">Sélectionne un compte pour consulter sa fiche et ses alias.</div>');
 }
 return '<section class="n2settings-detail-card n2accounts" aria-label="Gestion des comptes">'+
  '<div class="n2accounts-header"><div><h3>Comptes utilisateurs</h3><p class="n2settings-note">Identités, autorisations, alias du planning et informations de connexion disponibles.</p></div><button type="button" class="btn n2accounts-refresh" data-action="admin-accounts-refresh">Actualiser</button></div>'+
  (loading?'<p class="n2settings-note" role="status">Chargement des comptes…</p>':'')+
  (error?'<p class="live-error" role="alert">'+esc(error)+'</p>':'')+
  (notice?'<p class="live-message ok" role="status">'+esc(notice)+'</p>':'')+
  '<div class="n2accounts-tabs" role="group" aria-label="Gestion des comptes">'+action('list',mode,'Utilisateurs')+action('create',mode,'Créer un compte')+action('edit',mode,'Fiche et modification')+'</div>'+content+'</section>';
}

// Gestion de comptes alignée sur les panneaux Paramètres NETHOR.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles=[['lecture','Lecture seule'],['employe','Employé'],['responsable','Responsable'],['role_point-de-vente','Point de vente'],['admin','Administrateur']];
const field=(name,label,value='',attrs='')=>'<label class="n2accounts-field"><span>'+esc(label)+'</span><input name="'+esc(name)+'" value="'+esc(value)+'" '+attrs+'></label>';
const action=(mode,active,text)=>'<button type="button" class="n2accounts-tab'+(mode===active?' is-active':'')+'" data-action="admin-account-mode" data-mode="'+mode+'" aria-pressed="'+String(mode===active)+'">'+text+'</button>';
export function renderAccountAdmin({users=[],loading=false,error='',notice='',selected='',planningName='',mode='list'}={}){
 const found=users.find(u=>u.id===selected);
 const roleOptions=roles.map(([value,label])=>'<option value="'+esc(value)+'"'+((found?.role||'employe')===value?' selected':'')+'>'+esc(label)+'</option>').join('');
 const userOptions=users.map(u=>'<option value="'+esc(u.id)+'"'+(u.id===selected?' selected':'')+'>'+esc(u.display_name||'Utilisateur')+' · '+esc(u.username||u.email||'')+'</option>').join('');
 let content='';
 if(mode==='list'){
  content='<div class="n2accounts-list">'+(users.length?users.map(u=>
   '<div class="n2accounts-user"><span class="n2accounts-avatar" aria-hidden="true">'+esc((u.display_name||'?').slice(0,1).toUpperCase())+'</span><span class="n2accounts-user-info"><strong>'+esc(u.display_name||'Utilisateur')+'</strong><small>'+esc(u.username||u.email||'—')+' · '+esc(roles.find(([key])=>key===u.role)?.[1]||'Utilisateur')+'</small></span><button type="button" class="n2accounts-edit" data-action="admin-account-edit" data-account-id="'+esc(u.id)+'">Modifier</button></div>'
  ).join(''):'<p class="n2settings-note">Aucun compte disponible. Utilise Actualiser pour charger la liste.</p>')+'</div>';
 }else{
  const editing=mode==='edit';
  content=(editing?'<label class="n2accounts-field"><span>Sélectionner un compte</span><select id="adminAccountTarget"><option value="">Choisir un utilisateur…</option>'+userOptions+'</select></label>':'')+
   (!editing||found?'<form id="adminAccountForm" class="n2accounts-form" autocomplete="off">'+
     '<input type="hidden" name="mode" value="'+esc(mode)+'">'+
     '<div class="n2accounts-fields">'+field('display_name','Nom affiché',editing?found?.display_name||'':planningName,'required maxlength="120"')+
     field('username','Identifiant de connexion',editing?found?.username||'':'','required maxlength="100" pattern="[a-zA-Z0-9._-]{3,100}"')+
     '<label class="n2accounts-field"><span>Rôle</span><select name="role">'+roleOptions+'</select></label>'+
     field('planning_name','Nom principal du planning',editing?found?.planning_name||'':planningName,'maxlength="120"')+
     '<label class="n2accounts-field"><span>'+(editing?'Nouveau mot de passe (facultatif)':'Mot de passe temporaire')+'</span><input type="password" name="password" autocomplete="new-password" minlength="8"'+(editing?'':' required')+'></label></div>'+
     '<div class="n2accounts-actions"><button type="submit" class="btn primary">'+(editing?'Enregistrer les modifications':'Créer le compte')+'</button></div></form>'+
     (editing?'<form id="adminAliasesForm" class="n2accounts-aliases"><h3>Alias du planning</h3><p class="n2settings-note">Un nom exact par ligne. Tu peux en ajouter ou en retirer après un changement dans le fichier Excel.</p><label class="n2accounts-field"><span>Noms associés</span><textarea name="aliases" rows="4" placeholder="Enzo&#10;Enzo L">'+esc((found.planning_aliases||[]).join('\n'))+'</textarea></label><div class="n2accounts-actions"><button type="submit" class="btn">Enregistrer les alias</button></div></form>':''):'<div class="n2accounts-prompt">Sélectionne un compte pour afficher ses informations et ses alias.</div>');
 }
 return '<section class="n2settings-detail-card n2accounts" aria-label="Gestion des comptes">'+
  '<div class="n2accounts-header"><div><h3>Comptes utilisateurs</h3><p class="n2settings-note">Gestion sécurisée des utilisateurs et des noms associés aux plannings.</p></div><button type="button" class="btn n2accounts-refresh" data-action="admin-accounts-refresh">Actualiser</button></div>'+
  (loading?'<p class="n2settings-note" role="status">Chargement des comptes…</p>':'')+
  (error?'<p class="live-error" role="alert">'+esc(error)+'</p>':'')+
  (notice?'<p class="live-message ok" role="status">'+esc(notice)+'</p>':'')+
  '<div class="n2accounts-tabs" role="group" aria-label="Gestion des comptes">'+action('list',mode,'Utilisateurs')+action('create',mode,'Créer un compte')+action('edit',mode,'Modifier')+'</div>'+content+'</section>';
}

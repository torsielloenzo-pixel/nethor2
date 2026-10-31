const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles=[['lecture','Lecture seule'],['employe','Employé'],['responsable','Responsable'],['role_point-de-vente','Point de vente'],['admin','Administrateur']];
export function renderAccountAdmin({users=[],loading=false,error='',notice='',selected='',planningName='',mode='list'}={}){
 const found=users.find(u=>u.id===selected);
 const options=roles.map(([v,t])=>'<option value="'+esc(v)+'"'+((found?.role||'employe')===v?' selected':'')+'>'+esc(t)+'</option>').join('');
 const roster=users.map(u=>'<option value="'+esc(u.id)+'"'+(selected===u.id?' selected':'')+'>'+esc(u.display_name)+' · '+esc(u.username||u.email||'')+'</option>').join('');
 return '<section class="card n2accounts" aria-label="Gestion des comptes"><div class="card-head"><div><h2 class="card-title">Comptes utilisateurs</h2><p class="sub">Création, modification et association sécurisées par la fonction administrateur de Supabase.</p></div><button type="button" class="btn" data-action="admin-accounts-refresh">Actualiser</button></div>'+
 (loading?'<p>Chargement des comptes…</p>':'')+(error?'<p class="live-error" role="alert">'+esc(error)+'</p>':'')+(notice?'<p class="live-message ok">'+esc(notice)+'</p>':'')+
 '<div class="live-controls"><button type="button" class="btn" data-action="admin-account-mode" data-mode="create">+ Créer un compte</button><button type="button" class="btn" data-action="admin-account-mode" data-mode="edit">Modifier un compte</button></div>'+
 (mode==='edit'?'<label for="adminAccountTarget">Compte à modifier</label><select id="adminAccountTarget" class="btn"><option value="">Sélectionner…</option>'+roster+'</select>':'')+
 '<form id="adminAccountForm" autocomplete="off"><input type="hidden" name="mode" value="'+esc(mode)+'"><label>Nom affiché<input name="display_name" maxlength="120" required value="'+esc(mode==='edit'?found?.display_name||'':planningName)+'"></label>'+
 '<label>Identifiant de connexion<input name="username" maxlength="100" pattern="[a-zA-Z0-9._-]{3,100}" required value="'+esc(mode==='edit'?found?.username||'':'')+'" placeholder="prenom.nom"></label>'+
 '<label>Rôle<select name="role" class="btn">'+options+'</select></label>'+
 '<label>Nom associé au planning<input name="planning_name" maxlength="120" value="'+esc(mode==='edit'?found?.planning_name||'':planningName)+'" placeholder="Nom exact figurant dans le planning"></label>'+
 (mode==='create'?'<label>Mot de passe temporaire<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>':'<label>Nouveau mot de passe (facultatif)<input name="password" type="password" minlength="8" autocomplete="new-password"></label>')+
 '<button class="btn primary" type="submit">'+(mode==='edit'?'Enregistrer les modifications':'Créer le compte')+'</button></form></section>';
}

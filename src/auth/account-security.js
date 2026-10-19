// Validation des formulaires de récupération Nethor 2, sans dépendance au DOM.
export function normalizeRecoveryEmail(value){
  return String(value??'').trim().toLowerCase();
}
export function validateRecoveryEmail(value){
  const email=normalizeRecoveryEmail(value);
  if(email.length<5||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.endsWith('@stock-fl.local'))
    throw new Error('Saisis une adresse e-mail personnelle valide.');
  return email;
}
export function validateNewPassword(current,next,confirm){
  const existing=String(current??''),password=String(next??''),repeated=String(confirm??'');
  if(!existing)throw new Error('Renseigne ton mot de passe actuel.');
  validateRecoveryPassword(password,repeated);
  if(existing===password)throw new Error('Le nouveau mot de passe doit être différent de l’ancien.');
  return {currentPassword:existing,password};
}
export function validateRecoveryPassword(next,confirm){
  const password=String(next??''),repeated=String(confirm??'');
  if(password.length<12||password.length>128)throw new Error('Le mot de passe doit contenir de 12 à 128 caractères.');
  if(password!==repeated)throw new Error('Les deux nouveaux mots de passe ne correspondent pas.');
  return password;
}
export const RESET_REQUEST_MESSAGE='Si une adresse de récupération est associée à ce compte, un lien de réinitialisation sera envoyé par e-mail. Sinon, une assistance administrative peut être nécessaire.';

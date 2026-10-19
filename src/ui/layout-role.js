// La présentation mobile existante est conservée pour tous sur téléphone.
// Seuls Responsable et Employé bénéficient de cette même structure sur desktop/PWA desktop.
export const STAFF_DESKTOP_ROLES=Object.freeze(['responsable','employe']);

export function isStaffDesktopLayout(role,isSmallScreen=false){
  return !isSmallScreen&&STAFF_DESKTOP_ROLES.includes(role);
}
export function usesCompactLayout(role,isSmallScreen=false){
  return Boolean(isSmallScreen)||isStaffDesktopLayout(role,isSmallScreen);
}

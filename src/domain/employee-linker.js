// Les liens exacts sont enregistrés par un administrateur, jamais déduits d'une ressemblance.
export function normalizeName(value) {
  return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
}
export function linkPlanningEmployees(employees, profiles, aliases = []) {
  if (!Array.isArray(employees) || !Array.isArray(profiles) || !Array.isArray(aliases))
    throw new TypeError('Liste de salariés, profils ou associations invalide');
  const profileById = new Map(profiles.map(profile => [String(profile.id), profile]));
  const aliasMap = new Map();
  for (const alias of aliases) {
    const name = normalizeName(alias.planningName);
    if (!name || !alias.userId) continue;
    const list = aliasMap.get(name) || new Set();
    list.add(String(alias.userId));
    aliasMap.set(name, list);
  }
  return employees.map((employee, index) => {
    const name = String(employee.name ?? '').trim();
    const ids = aliasMap.get(normalizeName(name)) || new Set();
    if (ids.size > 1) return { index, name, status: 'ambiguous', userId: null };
    if (!ids.size) return { index, name, status: 'unlinked', userId: null };
    const userId = [...ids][0], profile = profileById.get(userId);
    if (!profile) return { index, name, status: 'missing-profile', userId: null };
    if (profile.account_enabled === false) return { index, name, status: 'disabled', userId };
    return { index, name, status: 'linked', userId };
  });
}

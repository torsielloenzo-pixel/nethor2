// Pure, fail-closed planning import selection. No database writes here.
export function prepareSelectiveImport({existing, incoming, decisions = {}}) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Planning source invalide');
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? structuredClone(existing) : {};
  const output = structuredClone(base);
  const changes = [];
  const skipped = [];
  for (const [employee, days] of Object.entries(incoming)) {
    if (!days || typeof days !== 'object' || Array.isArray(days)) throw new Error('Ligne collaborateur invalide : ' + employee);
    if (!output[employee]) output[employee] = {};
    for (const [day, value] of Object.entries(days)) {
      const key = employee + ':' + day;
      const choice = decisions[key] ?? 'include';
      if (!['include','keep','exclude'].includes(choice)) throw new Error('Décision inconnue : ' + key);
      if (choice !== 'include') { skipped.push({employee,day,choice}); continue; }
      if (value === undefined || value === null || value === '') throw new Error('Valeur vide à valider : ' + key);
      const old = output[employee][day];
      if (JSON.stringify(old) !== JSON.stringify(value)) {
        output[employee][day] = structuredClone(value);
        changes.push({employee,day,before:old??null,after:value});
      }
    }
  }
  return {data:output,changes,skipped};
}

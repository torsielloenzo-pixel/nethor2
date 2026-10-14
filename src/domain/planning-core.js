// Nethor 2 - moteur de calcul indépendant du DOM et de Supabase.
// Grille héritée : 'g' et 'b' sont des créneaux travaillés de 15 minutes.
export function hoursForRow(cells, minutesPerSlot = 15) {
  if (!Array.isArray(cells) || !Number.isFinite(minutesPerSlot) || minutesPerSlot <= 0)
    throw new TypeError('Grille ou durée de créneau invalide');
  return cells.filter(v => v === 'g' || v === 'b').length * minutesPerSlot / 60;
}
export function rangesForRow(cells, startMinutes = 360, minutesPerSlot = 15) {
  if (!Array.isArray(cells) || !Number.isFinite(startMinutes) ||
      !Number.isFinite(minutesPerSlot) || minutesPerSlot <= 0)
    throw new TypeError('Paramètres invalides');
  const ranges = [];
  let beginning = null;
  for (let i = 0; i <= cells.length; i++) {
    const working = i < cells.length && (cells[i] === 'g' || cells[i] === 'b');
    if (working && beginning === null) beginning = i;
    if (!working && beginning !== null) {
      ranges.push({ startMinutes: startMinutes + beginning * minutesPerSlot,
                    endMinutes: startMinutes + i * minutesPerSlot });
      beginning = null;
    }
  }
  return ranges;
}
export function compareContractHours(planned, contracted) {
  if (!Number.isFinite(planned) || !Number.isFinite(contracted)) return null;
  return Math.round((planned - contracted) * 100) / 100;
}
export function analyzeEmployeeDay({ employeeId, cells, startMinutes = 360, minutesPerSlot = 15, approvedAbsence = false }) {
  const hours = hoursForRow(cells, minutesPerSlot);
  const ranges = rangesForRow(cells, startMinutes, minutesPerSlot);
  const issues = [];
  if (hours > 10) issues.push({ code: 'LONG_DAY', employeeId, hours, severity: 'warning' });
  for (const range of ranges) {
    if (range.endMinutes - range.startMinutes <= 30)
      issues.push({ code: 'SHORT_SHIFT', employeeId, range, severity: 'warning' });
  }
  for (let i = 1; i < ranges.length; i++) {
    const gapMinutes = ranges[i].startMinutes - ranges[i - 1].endMinutes;
    if (gapMinutes >= 120)
      issues.push({ code: 'LONG_BREAK', employeeId, gapMinutes, severity: 'warning' });
  }
  if (approvedAbsence && hours > 0)
    issues.push({ code: 'ABSENCE_CONFLICT', employeeId, severity: 'error' });
  return { employeeId, hours, ranges, issues };
}

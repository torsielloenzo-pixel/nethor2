import { analyzeEmployeeDay, compareContractHours } from '../domain/planning-core.js';
import { linkPlanningEmployees } from '../domain/employee-linker.js';

// Aperçu en lecture seule ; aucune écriture de données.
export function buildImportPreview(model, options = {}) {
  if (!model || !Array.isArray(model.employees) || !model.days ||
      !Number.isFinite(model.startTime) || !Number.isFinite(model.slotMinutes) ||
      !Number.isInteger(model.slotCount) || model.slotCount <= 0)
    throw new TypeError('Planning invalide');
  const dates = Object.keys(model.days).sort();
  if (dates.length !== 7) throw new Error('Sept journées attendues');
  const links = linkPlanningEmployees(model.employees, options.profiles || [], options.aliases || []);
  const employees = model.employees.map((employee, index) => {
    const link = links[index];
    const days = dates.map(date => {
      const cells = model.days[date]?.cells?.[index];
      if (!Array.isArray(cells) || cells.length !== model.slotCount) throw new Error('Grille incohérente');
      return { date, ...analyzeEmployeeDay({
        employeeId: link.userId ?? null, cells,
        startMinutes: model.startTime * 60, minutesPerSlot: model.slotMinutes,
        approvedAbsence: options.approvedAbsences?.[link.userId]?.includes(date) === true
      }) };
    });
    const hours = Math.round(days.reduce((sum, day) => sum + day.hours, 0) * 100) / 100;
    const contract = options.contracts?.[link.userId];
    const differenceHours = Number.isFinite(contract) ? compareContractHours(hours, contract) : null;
    const issues = days.flatMap(day => day.issues.map(issue => ({ ...issue, date: day.date })));
    if (link.status !== 'linked') issues.push({ code: 'ACCOUNT_' + link.status.toUpperCase().replaceAll('-', '_') });
    if (differenceHours !== null && differenceHours !== 0) issues.push({ code: 'CONTRACT_DIFFERENCE', differenceHours });
    return { name: employee.name, link, days, hours, differenceHours, issues };
  });
  return { weekStart: model.weekStart, employeeCount: employees.length, employees,
    warnings: employees.flatMap(e => e.issues.map(issue => ({ employee: e.name, ...issue }))),
    readyForPublish: false };
}

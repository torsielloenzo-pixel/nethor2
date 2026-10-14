import { hoursForRow, compareContractHours } from '../domain/planning-core.js';
import { linkPlanningEmployees } from '../domain/employee-linker.js';

// Aperçu local et lecture seule : aucune écriture en base.
export function buildImportPreview(model, options = {}) {
  if (!model || !Array.isArray(model.employees) || !model.days) throw new TypeError('Planning invalide');
  const dates = Object.keys(model.days).sort();
  if (dates.length !== 7) throw new Error('Sept journées attendues');
  const links = linkPlanningEmployees(model.employees, options.profiles || [], options.aliases || []);
  const employees = model.employees.map((employee, index) => {
    const days = dates.map(date => {
      const cells = model.days[date]?.cells?.[index];
      if (!Array.isArray(cells) || cells.length !== model.slotCount) throw new Error('Grille incohérente');
      return { date, hours: hoursForRow(cells, model.slotMinutes) };
    });
    const hours = days.reduce((sum, day) => sum + day.hours, 0);
    const link = links[index];
    const contract = options.contracts?.[link.userId];
    const differenceHours = Number.isFinite(contract) ? compareContractHours(hours, contract) : null;
    const issues = [];
    if (link.status !== 'linked') issues.push({ code: 'ACCOUNT_' + link.status.toUpperCase().replaceAll('-', '_') });
    if (differenceHours !== null && differenceHours !== 0) issues.push({ code: 'CONTRACT_DIFFERENCE', differenceHours });
    return { name: employee.name, link, days, hours, differenceHours, issues };
  });
  return {
    weekStart: model.weekStart,
    employeeCount: employees.length,
    employees,
    warnings: employees.flatMap(e => e.issues.map(issue => ({ employee: e.name, ...issue }))),
    readyForPublish: false
  };
}

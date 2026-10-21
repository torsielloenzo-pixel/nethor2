// Lecteur de structure Nethor 2. Injection explicite du lecteur XLSX et des couleurs.
// N'effectue aucune opération réseau ou écriture en base.
const DAYS = ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];
const norm = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const iso = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
function dayAt(monday, offset) {
  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
  return iso(d);
}
function mondayDate(value, XLSX) {
  if (value instanceof Date && !Number.isNaN(+value)) return new Date(value.getFullYear(),value.getMonth(),value.getDate());
  if (typeof value === 'number') {
    const parts = XLSX.SSF?.parse_date_code?.(value);
    if (parts) return new Date(parts.y,parts.m-1,parts.d);
  }
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(String(value??'').trim());
  if (m) return new Date(+m[3]<100?2000+(+m[3]):+m[3],+m[2]-1,+m[1]);
  return null;
}
function checkedDate(value, XLSX) {
  const d = mondayDate(value, XLSX);
  if (!d || Number.isNaN(+d) || d.getDay()!==1) throw new Error('La cellule B2 doit contenir une date de lundi valide');
  return d;
}
export function parsePlanningWorkbook(workbook, XLSX, resolveColor) {
  if (!workbook?.SheetNames || !workbook?.Sheets || !XLSX?.utils?.encode_cell || typeof resolveColor!=='function')
    throw new TypeError('Classeur, lecteur XLSX ou résolveur de couleur manquant');
  const sheets = DAYS.map(day => {
    const name = workbook.SheetNames.find(n=>norm(n)===day);
    if (!name) throw new Error('Feuille manquante : '+day);
    return [name,workbook.Sheets[name]];
  });
  const first=sheets[0][1];
  const monday=checkedDate(first?.B2?.v,XLSX);
  const range=first['!ref'] ? XLSX.utils.decode_range(first['!ref']) : null;
  if (!range) throw new Error('Plage Excel LUNDI introuvable');
  const employees=[];
  for (let r=3;r<=range.e.r;r++) {
    const name=String(first['B'+(r+1)]?.v??'').trim();
    if (/^TOTAL\b/i.test(name)) break;
    if (name) employees.push({name,excelRow:r+1,rowIndex:r});
  }
  if (!employees.length) throw new Error('Aucun salarié identifié dans la colonne B');
  const days={};
  const colorCounts={g:0,b:0,r:0,y:0,o:0};
  for(let di=0;di<7;di++){
    const [sheetName,ws]=sheets[di];
    const cells=[];
    for(const emp of employees){
      const row=[];
      for(let si=0;si<58;si++){
        const col=si+2;
        const cell=ws[XLSX.utils.encode_cell({r:emp.rowIndex,c:col})];
        const color=resolveColor({sheetName,rowIndex:emp.rowIndex,colIndex:col,cell,workbook});
        if(color!==null && color!==undefined && !['g','b','r','y','o','w'].includes(color))
          throw new Error('Couleur Excel non reconnue '+sheetName+' ligne '+emp.excelRow+' colonne '+(col+1));
        if(color===undefined) throw new Error('Lecture des styles incomplète : '+sheetName+' ligne '+emp.excelRow);
        // Dans les vieux .xls, une cellule explicitement sans remplissage
        // contient parfois un total (2, 3, 5, 7.5, etc.) et non un horaire.
        // Ne pas le confondre avec une présence : le chiffre 1 reste ambigu.
        const legacyUnfilledNumber=color==='w'&&typeof cell?.v==='number'
          &&Number.isFinite(cell.v)&&cell.v!==1;
        if(!legacyUnfilledNumber&&(color===null||color==='w')
          && cell?.v!=null && cell.v!=='' && cell.v!==0 && cell.v!==false)
          throw new Error('Cellule renseignée sans couleur fiable : '+sheetName+' ligne '+emp.excelRow);
        const value=color && color!=='w'?color:null;
        if(value)colorCounts[value]++;
        row.push(value);
      }
      cells.push(row);
    }
    const date=dayAt(monday,di);
    days[date]={sheet:sheetName,date,cells};
  }
  return {version:4,weekStart:iso(monday),startTime:6,endTime:20.5,slotMinutes:15,slotCount:58,employees,days,colorCounts};
}
export async function readPlanningFile(file, XLSX, resolveColor) {
  if(!/\.(xls|xlsx|xlsm)$/i.test(file?.name??'')) throw new Error('Extension Excel non prise en charge');
  if(typeof XLSX?.read!=='function') throw new Error('Lecteur Excel indisponible');
  const buffer=await file.arrayBuffer();
  const workbook=XLSX.read(buffer,{type:'array',cellDates:true,cellStyles:true});
  return {...parsePlanningWorkbook(workbook,XLSX,resolveColor),sourceFile:file.name};
}

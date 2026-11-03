const pad=value=>String(value).padStart(2,'0');
const fmtMinute=value=>pad(Math.floor(value/60))+':'+pad(Math.round(value%60));
const utcStamp=date=>{
  const d=date instanceof Date?date:new Date(date);
  if(!Number.isFinite(d.getTime()))throw new TypeError('Date invalide');
  return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+'T'+pad(d.getUTCHours())+pad(d.getUTCMinutes())+pad(d.getUTCSeconds())+'Z';
};
const escapeIcs=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const idPart=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'employe';

function parisInstant(date,minutes){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw new TypeError('Date de planning invalide');
  const [year,month,day]=String(date).split('-').map(Number);
  const hour=Math.floor(Number(minutes)/60),minute=Math.round(Number(minutes)%60);
  const target=Date.UTC(year,month-1,day,hour,minute,0);
  let guess=target;
  const formatter=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  });
  for(let i=0;i<3;i++){
    const parts=formatter.formatToParts(new Date(guess));
    const value=type=>Number(parts.find(part=>part.type===type)?.value||0);
    const observed=Date.UTC(value('year'),value('month')-1,value('day'),value('hour'),value('minute'),value('second'));
    guess+=target-observed;
  }
  return new Date(guess);
}

export function planningCalendarEventCount(employee){
  return (employee?.days||[]).reduce((sum,day)=>sum+(day?.kind==='work'&&Array.isArray(day.shifts)?day.shifts.length:0),0);
}

export function planningCalendarFilename(weekStart){
  return 'nethor-planning-'+String(weekStart||'semaine')+'.ics';
}

export function buildPlanningCalendar({weekStart,employee,now=new Date()}={}){
  if(!employee||!Array.isArray(employee.days))throw new TypeError('Planning personnel indisponible');
  const stamp=utcStamp(now),owner=idPart(employee.name),events=[];
  for(const day of employee.days){
    if(day?.kind!=='work'||!Array.isArray(day.shifts))continue;
    for(const shift of day.shifts){
      if(!Number.isFinite(Number(shift?.start))||!Number.isFinite(Number(shift?.end))||Number(shift.end)<=Number(shift.start))continue;
      const start=Number(shift.start),end=Number(shift.end);
      events.push([
        'BEGIN:VEVENT',
        'UID:nethor-'+day.date+'-'+start+'-'+end+'-'+owner+'@nethor.fr',
        'DTSTAMP:'+stamp,
        'DTSTART:'+utcStamp(parisInstant(day.date,start)),
        'DTEND:'+utcStamp(parisInstant(day.date,end)),
        'SUMMARY:'+escapeIcs('NETHOR · '+fmtMinute(start)+'–'+fmtMinute(end)),
        'DESCRIPTION:'+escapeIcs('Planning NETHOR · '+employee.name),
        'CATEGORIES:Travail',
        'TRANSP:OPAQUE',
        'STATUS:CONFIRMED',
        'END:VEVENT'
      ].join('\r\n'));
    }
  }
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NETHOR//Planning Mobile//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'X-WR-CALNAME:'+escapeIcs('NETHOR · Planning '+String(weekStart||'')),'X-WR-TIMEZONE:Europe/Paris',...events,'END:VCALENDAR',''
  ].join('\r\n');
}

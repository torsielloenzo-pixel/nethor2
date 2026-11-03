import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlanningCalendar,planningCalendarEventCount,planningCalendarFilename} from '../src/domain/planning-calendar.js';

const employee={
  name:'Enzo',
  days:[
    {date:'2026-11-06',kind:'work',shifts:[{start:480,end:840},{start:840,end:1230}]},
    {date:'2026-11-07',kind:'red',shifts:[]}
  ]
};

test('le calendrier iPhone exporte un événement par créneau travaillé',()=>{
  assert.equal(planningCalendarEventCount(employee),2);
  const ics=buildPlanningCalendar({weekStart:'2026-11-02',employee,now:new Date('2026-11-03T12:00:00Z')});
  assert.match(ics,/BEGIN:VCALENDAR\r\nVERSION:2\.0/);
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
  assert.match(ics,/SUMMARY:NETHOR · 08:00–14:00/);
  assert.match(ics,/SUMMARY:NETHOR · 14:00–20:30/);
  assert.doesNotMatch(ics,/Repos/);
  assert.equal(planningCalendarFilename('2026-11-02'),'nethor-planning-2026-11-02.ics');
});

test('les heures Europe\/Paris sont converties en UTC sans décalage DST',()=>{
  const winter=buildPlanningCalendar({weekStart:'2026-11-02',employee,now:new Date('2026-11-03T12:00:00Z')});
  assert.match(winter,/DTSTART:20261106T070000Z/);
  assert.match(winter,/DTEND:20261106T193000Z/);
  const summerEmployee={name:'Enzo',days:[{date:'2026-07-06',kind:'work',shifts:[{start:480,end:840}]}]};
  const summer=buildPlanningCalendar({weekStart:'2026-07-06',employee:summerEmployee,now:new Date('2026-07-01T12:00:00Z')});
  assert.match(summer,/DTSTART:20260706T060000Z/);
  assert.match(summer,/DTEND:20260706T120000Z/);
});

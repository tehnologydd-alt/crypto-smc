import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBlsDate,parseBlsCalendar,loadBlsCalendar} from './macro-calendar.mjs';
const t=Date.UTC(2026,10,9,12);
const ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:cpi-2026-11\r\n'+
 'DTSTART;TZID=America/New_York:20261110T083000\r\n'+
 'SUMMARY:Consumer Price Index\r\nEND:VEVENT\r\n'+
 'BEGIN:VEVENT\r\nUID:employment\r\n'+
 'DTSTART;TZID=America/New_York:20261204T083000\r\n'+
 'SUMMARY:Employment Situation\r\nEND:VEVENT\r\n'+
 'BEGIN:VEVENT\r\nUID:offtopic\r\n'+
 'DTSTART;TZID=America/New_York:20261112T083000\r\n'+
 'SUMMARY:Unrelated meeting\r\nEND:VEVENT\r\nEND:VCALENDAR';
test('BLS Eastern daylight offsets and strict timestamps are parsed correctly',()=>{
 assert.equal(new Date(parseBlsDate('20261110T083000','DTSTART;TZID=America/New_York')).toISOString(),
  '2026-11-10T13:30:00.000Z');
 assert.equal(new Date(parseBlsDate('20260812T083000','DTSTART;TZID=America/New_York')).toISOString(),
  '2026-08-12T12:30:00.000Z');
 assert.equal(parseBlsDate('20261110T083000','DTSTART'),null);
 assert.equal(parseBlsDate('20260230T083000Z'),null);
});
test('actual BLS labels survive and unrelated or invented events do not appear',()=>{
 const report=parseBlsCalendar(ics,{now:t});
 assert.equal(report.state,'OK');assert.equal(report.events.length,2);
 assert.equal(report.events[0].kind,'CPI');
 assert.equal(report.events[1].kind,'EMPLOYMENT');
 assert.equal(report.events[0].status,'SCHEDULED_NOT_RELEASED');
});
test('bad calendar and provider HTTP failures do not generate scheduled releases',async()=>{
 assert.equal(parseBlsCalendar('<html>error</html>',{now:t}).state,'INVALID');
 const state=await loadBlsCalendar({fetchImpl:async()=>({ok:false,status:403}),now:()=>t});
 assert.equal(state.state,'OFFLINE');assert.equal(state.events.length,0);
});

import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const cal=readFileSync(new URL('../js/calendar-v6.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/entrevista/index.ts',import.meta.url),'utf8');
const sql=process.argv[2]?readFileSync(process.argv[2],'utf8'):null;
assert.match(app,/Professor entrevistador/);
assert.match(app,/Professor responsável pelas aulas/);
assert.match(app,/name="interview_slot"/);
assert.match(app,/externalSlotPicker\(teacher,i\.calendar_slot_ids/);
assert.match(app,/slot_ids:selected/);
assert.match(app,/externalAPI\(\{action:'save',payload:data\}\)/);
assert.match(app,/calendar_slot_ids:selected/);
assert.match(app,/calendar\.getFormPicker\(i\.teacher_id,i\.start_date,true,i\.calendar_slot_ids/);
assert.match(cal,/function slotIdForSchedule/);
assert.match(cal,/function getFormPicker\(teacherId,startDate,includeManualEnd=false,selectedIds=\[\],compact=false\)/);
assert.match(edge,/interviewer_teacher_id:invite\.teacher_id/);
assert.match(edge,/teacher_id:teacherId/);
assert.match(edge,/\.eq\('school_id',invite\.school_id\)/);
assert.match(edge,/calendar_interview_preview_v65/);
assert.match(edge,/slotIds\.length !== frequency/);
assert.match(edge,/calendar_slot_ids:slotIds/);
if(sql){
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.calendar_interview_preview_v65/);
 assert.match(sql,/TO service_role/);
 assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|SCHEMA)\b/i);
 assert.doesNotMatch(sql,/\bTRUNCATE\b/i);
}
console.log('OK: V6.5 entrevista e agenda - vinculo distinto de professor, 2 horarios, validacoes e convite.');

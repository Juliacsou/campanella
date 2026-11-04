import assert from 'node:assert/strict';
import fs from 'node:fs';
const sqlPath=process.argv[2];
if(!sqlPath)throw Error('Passe o SQL separado: node tests/v6_4_sql_contract_smoke.mjs /caminho/arquivo.sql');
const sql=fs.readFileSync(sqlPath,'utf8');
for(const signature of ['public.calendar_update_student_schedule','public.calendar_overview','public.calendar_student_profile','public.calendar_student_teacher_on_contract'])assert.ok(sql.includes(signature),signature);
for(const token of ['public.is_school_admin(p_school)','public.calendar_can_manage(p_school,current_teacher)','l.scheduled_date>=current_day','manual_override','teacher_transfer_pending','pg_advisory_xact_lock','public.students SET calendar_teacher_id=p_teacher','TO authenticated','COMMIT;'])assert.ok(sql.includes(token),token);
assert.doesNotMatch(sql,/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
console.log('OK: V6.4 SQL separado, controles de autorizacao e preservacao do historico.');

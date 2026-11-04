import assert from 'node:assert/strict';
import fs from 'node:fs';
import {weeklyPickerMarkup} from '../js/calendar-week-picker.js';
import {createCalendar} from '../js/calendar-v6.js';
const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../css/calendar-v6.css',import.meta.url),'utf8');
const sqlPath=new URL('../../../Campanella_V6_6_migracao.sql',import.meta.url);
const sql=fs.existsSync(sqlPath)?fs.readFileSync(sqlPath,'utf8'):null;
const slots=[{id:'seg9',teacher_id:'prof1',weekday:1,time:'09:00',duration:60,active:true,slot_date:null},
{id:'seg10',teacher_id:'prof1',weekday:1,time:'10:00',duration:60,active:true,slot_date:null},
{id:'ter9',teacher_id:'prof1',weekday:2,time:'09:00',duration:55,active:true,slot_date:null}];
const picked=weeklyPickerMarkup(slots,{name:'cal_slot',selected:['seg10'],occupied:['seg9'],locked:true,limit:2});
assert.match(picked,/Segunda/);assert.match(picked,/Terça/);assert.match(picked,/09:00/);
assert.match(picked,/value="seg10" checked/);assert.match(picked,/is-busy/);assert.match(picked,/is-locked/);
assert.match(picked,/name="cal_slot"/);assert.match(picked,/2/);
assert.match(picked, /<button[^>]*data-weekly-slot-toggle[\s\S]*?<input type="checkbox" name="cal_slot"/);
const malicious=weeklyPickerMarkup([{...slots[0],id:'<img src=x>',time:'09:00'}]);
assert.ok(!malicious.includes('value="<img'));
assert.match(app,/openInterviewContract/);assert.match(app,/data-weekly-frequency/);
assert.match(app,/contract-actions-dropdown interview-actions-menu/);
assert.match(app,/calendar\.applyTerms/);assert.match(css,/cal-profile-accordion:has\(.contract-actions-dropdown\[open\]\)/);
if(sql){
 assert.match(sql,/SECURITY DEFINER/);assert.match(sql,/calendar_weekly_roster/);
 assert.match(sql,/auth\.uid\(\)/);assert.match(sql,/GRANT EXECUTE.*authenticated/);
 assert.ok(!/CREATE TABLE|DROP TABLE|TRUNCATE /i.test(sql));
}
assert.ok(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(app));
const baseOverview={teachers:[{id:'prof1',name:'Professor Exemplo',active:true}],slots,blocks:[],lessons:[
{id:'l1',teacher_id:'prof1',contract_id:'c1',student_id:'s1',student_name:'Maria',date:'2026-11-09',time:'09:00',duration:60,lesson_number:1,status:'scheduled',total:40},
{id:'l2',teacher_id:'prof1',contract_id:'c2',student_id:'s2',student_name:'Ana',date:'2026-11-09',time:'10:00',duration:60,lesson_number:1,status:'scheduled',total:40}
],students:[{contract_id:'c1',student_id:'s1',teacher_id:'prof1',name:'Maria',total:40}],teacher_access:[]};
let modal='',lastCall=null;const elements={app:{innerHTML:''},pageContent:{innerHTML:''}};
globalThis.document={getElementById:(id)=>elements[id]||{innerHTML:''}};
globalThis.window={campanellaConfirm:async()=>true};
const ui={schoolId:'esc1',role:'teacher',teacherId:'prof1',teacherSchoolName:'Escola Teste',user:{email:'prof@example.com'},teacherAccess:[]};
const sb={rpc:async(method,args)=>{lastCall={method,args};if(method==='calendar_overview')return {data:structuredClone(baseOverview),error:null};if(method==='calendar_weekly_roster')return {data:[{slot_id:'seg9',teacher_id:'prof1',contract_id:'c1',student_id:'s1',student_name:'Maria'}],error:null};if(method==='calendar_reschedule')return {data:null,error:null};throw new Error(method);}};
const cal=createCalendar({sb,ui,db:{teachers:baseOverview.teachers,contracts:[],students:[]},safe:s=>String(s||''),dateBR:s=>String(s||''),today:()=> '2026-11-04',showModal:s=>{modal=s;},closeModal:()=>{},toast:()=>{},refresh:async()=>{},render:()=>{},initialize:async()=>{},authWrap:s=>s,lookup:()=>null,canAdmin:()=>false,iconSvg:()=>'<svg></svg>'});
await cal.load();
await cal.action('calTeacherPage',{dataset:{page:'slots'}});
assert.match(elements.pageContent.innerHTML,/Grade semanal/);assert.match(elements.pageContent.innerHTML,/Maria/);assert.match(elements.pageContent.innerHTML,/Disponível/);
await cal.action('calReschedule',{dataset:{id:'l1'}});
assert.match(modal,/Reagendamento individual/);assert.match(modal,/calRescheduleSelect/);assert.match(modal,/calRescheduleNext/);assert.match(modal,/Ocupado/);assert.match(modal,/cal-wpicker-header/);
await cal.action('calRescheduleNext',{dataset:{},closest:()=>({querySelector:()=>({value:''})})});
assert.match(modal,/2026-11-16/);
console.log('OK: V6.6 picker visual, limites, menu Acoes, SQL seguro, grade docente ocupada, reagendamento semanal e navegacao.');

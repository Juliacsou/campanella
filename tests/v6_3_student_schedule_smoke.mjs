import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCalendar} from '../js/calendar-v6.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('js/app.js'),css=read('css/calendar-v6.css');
const date='2026-11-09',school='school-id',teacher='teacher-id',student='student-id',contract='contract-id';
const lessons=Array.from({length:40},(_,i)=>({id:'lesson'+(i+1),number:i+1,teacher_id:teacher,contract_id:contract,
  date:new Date(Date.UTC(2026,10,9+i*7)).toISOString().slice(0,10),time:'18:00',duration:60,status:i===0?'completed':'scheduled',slot_id:'slot1',history:[]}));
const snapshot={teachers:[{id:teacher,name:'Joao',active:true}],slots:[{id:'slot1',teacher_id:teacher,weekday:1,slot_date:null,time:'18:00',duration:60,active:true},{id:'slot2',teacher_id:teacher,weekday:5,slot_date:null,time:'18:00',duration:60,active:true}],blocks:[],
 lessons:lessons.slice(0,6).map(l=>({...l,lesson_number:l.number,student_id:student,student_name:'Elisa',total:40})),
 students:[{student_id:student,contract_id:contract,teacher_id:teacher,name:'Elisa',total:40,done:1,completed:1}],teacher_access:[]};
const profile={id:student,name:'Elisa',teacher_id:teacher,slot_ids:['slot1'],current_slots:[{id:'slot1',weekday:1,time:'18:00',duration:60}],phone:'11999999999',email:'elisa@test.invalid',
 contracts:[{id:contract,teacher_id:teacher,course:'Ingles',package:'40 aulas',status:'signed',total:40,start:date,contract_end:'2027-09-01',
  slots:[{id:'slot1',weekday:1,time:'18:00',duration:60}],lessons}]};
let modal='',confirmCount=0,renders=0;
const calls=[];
global.window={campanellaConfirm:async()=>{confirmCount++;return true}};
const safe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const ui={role:'admin',page:'calendar',schoolId:school,user:{email:'admin@test.invalid'},schools:[{id:school,name:'School'}],teacherId:null};
const cal=createCalendar({sb:{rpc:async(m,args)=>{calls.push({m,args});if(m==='calendar_overview')return {data:snapshot,error:null};
 if(m==='calendar_student_profile')return {data:profile,error:null};if(m==='calendar_slot_edit_impact')return {data:{lessons:39,students:1},error:null};
 if(m==='calendar_edit_weekly_slot')return {data:{updated:39},error:null};if(m==='calendar_update_student_schedule')return {data:{updated:39,pending:0,teacher_changed:false},error:null};throw Error('RPC desconhecida: '+m)}},
 ui,db:{teachers:snapshot.teachers,contracts:[]},safe,dateBR:s=>s,today:()=>date,showModal:t=>{modal=t},closeModal:()=>{},toast:()=>{},refresh:()=>{},render:()=>{renders++},initialize:()=>{},authWrap:s=>s,lookup:()=>null,canAdmin:()=>true,iconSvg:(n)=>`<svg data-icon="${n}"></svg>`});
await cal.load();
// Horarios semanais editaveis, com popup proprio.
await cal.action('calSlotDetails',{dataset:{id:'slot1'}});
assert.match(modal,/data-action="calEditSlot"/);
await cal.action('calEditSlot',{dataset:{id:'slot1'}});
assert.match(modal,/id="calEditSlotForm"/);
assert.match(modal,/Aulas futuras deste hor[aá]rio ser[aã]o alteradas/);
const form={id:'calEditSlotForm',dataset:{id:'slot1'},elements:{weekday:{value:'5'},start_time:{value:'19:00'},duration:{value:'45'}}};
await cal.submit(form);
assert.equal(confirmCount,1,'confirmacao interna obrigatoria');
assert.ok(calls.some(x=>x.m==='calendar_slot_edit_impact'));
assert.deepEqual(calls.find(x=>x.m==='calendar_edit_weekly_slot').args,{p_slot:'slot1',p_weekday:5,p_start:'19:00',p_duration:45});
// Perfil nao pode limitar as aulas as do mes no snapshot.
await cal.openStudent(student,false);
const page=cal.studentProfileView(true);
assert.match(page,/Pr[oó]ximas aulas/);
assert.match(page,/Hist[oó]rico de aulas/);
assert.match(page,/Seg · 18:00/);
assert.match(page,/WhatsApp/);
assert.match(page,/data-action="calEditStudentSlots"/);
await cal.action('calEditStudentSlots',{dataset:{id:student}});
assert.match(modal,/id="calStudentSlotsForm"/);
assert.match(modal,/name="cal_student_slot" value="slot2"/);
await cal.submit({id:'calStudentSlotsForm',dataset:{id:student},elements:{cal_student_teacher:{value:teacher}},querySelectorAll:()=>[{value:'slot2'}]});
assert.ok(calls.some(x=>x.m==='calendar_update_student_schedule'&&x.args.p_student===student&&x.args.p_teacher===teacher&&x.args.p_slots[0]==='slot2'),'troca individual usa RPC transacional');
assert.match(page,/data-action="studentProfileBack"/);
assert.equal((page.match(/class="cal-lesson-number"/g)||[]).length,40,'todas as 40 aulas no perfil');
assert.ok(page.includes('#40'),'ultima aula esta visivel');
assert.doesNotMatch(page,/\bCPF\b|R\$|Endere[cç]o/,'professor nao recebe dados financeiros/sensiveis na pagina compartilhada');
assert.match(app,/calendar\.scheduleForContract\(c\)/,'lista administrativa usa agenda real');
assert.match(app,/calendar_teacher_id:teacherForStudent/,'cadastro vincula professor');
assert.match(app,/if\(ui\.page==='student-profile'\)/,'perfil administrativo e pagina');
assert.match(app,/await calendar\.ensureEnrollmentDates\(f\)/,'matricula revalida horarios antes de salvar');
assert.match(css,/\.cal-profile-page/);
assert.ok(renders>=1);
console.log('OK: V6.3 edicao de horario com confirmacao, professor associado, perfil de pagina e 40 aulas carregadas.');

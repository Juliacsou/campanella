import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCalendar} from '../js/calendar-v6.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/calendar-v6.css'),'utf8');
const teacher='teacher-uuid';
const snap={teachers:[{id:teacher,name:'Julia',active:true}],slots:[
 {id:'s1',teacher_id:teacher,weekday:1,time:'09:00',duration:45,slot_date:null,active:true},
 {id:'s2',teacher_id:teacher,weekday:1,time:'10:00',duration:60,slot_date:null,active:true},
 {id:'s3',teacher_id:teacher,weekday:1,time:'11:00',duration:45,slot_date:null,active:true},
 {id:'s4',teacher_id:teacher,weekday:1,time:'13:00',duration:60,slot_date:null,active:true},
 {id:'s5',teacher_id:teacher,weekday:1,time:'14:00',duration:60,slot_date:null,active:true},
 {id:'sa',teacher_id:teacher,weekday:null,time:'08:00',duration:60,slot_date:'2026-11-10',active:true}
 ],blocks:[],lessons:[],students:[],teacher_access:[]};
let modal='',calls=[];
const safe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const ui={role:'admin',schoolId:'school-uuid',teacherId:null,user:{email:'admin@example.test',user_metadata:{}},schools:[{id:'school-uuid',name:'Escola'}]};
const cal=createCalendar({sb:{rpc:async(m,args)=>{calls.push({m,args});return {data:snap,error:null}}},ui,db:{teachers:snap.teachers,contracts:[]},safe,dateBR:s=>s,today:()=> '2026-11-09',showModal:s=>{modal=s},closeModal:()=>{},toast:()=>{},refresh:()=>{},render:()=>{},initialize:()=>{},authWrap:s=>s,lookup:()=>null,canAdmin:()=>true,iconSvg:(n)=>`<svg class="camp-icon" data-test-icon="${n}"></svg>`});
await cal.load();
assert.match(cal.view(),/data-action="calNewOneOff"/,'Agenda oferece horário avulso');
assert.match(cal.view(),/class="cal-week-oneoff"/,'Agenda mostra horários avulsos datados');
assert.doesNotMatch(cal.view(),/data-action="calCreateWeeklyAt"/,'Agenda nao deve editar grade semanal');
assert.doesNotMatch(cal.view(),/data-action="calCreateSlotAt"/,'Agenda nao cria horário por clique');
await cal.action('calTeacherPage',{dataset:{page:'slots'}});
const schedule=cal.view();
assert.match(schedule,/cal-editor-scroll/,'grade semanal aparece em Horários');
assert.match(schedule,/data-action="calCreateWeeklyAt" data-weekday="1"/,'coluna de segunda clicavel');
assert.match(schedule,/09:00–09:45/,'horário fixo aparece proporcionalmente');
assert.match(schedule,/data-action="calSlotDetails" data-id="s1"/,'slot existente abre seus detalhes');
assert.doesNotMatch(schedule,/08:00–09:00/,'horário avulso nao aparece como recorrente');
assert.doesNotMatch(schedule,/data-action="calNewOneOff"/,'Horários nao gera avulsos');
assert.match(schedule,/value="teacher-uuid" selected/,'editor seleciona professor do filtro');
const target={dataset:{weekday:'1',minutes:'420',total:'840'},getBoundingClientRect:()=>({top:100,height:980})};
await cal.action('calCreateWeeklyAt',target,{clientY:240});
assert.match(modal,/data-kind="weekly"/,'clique cria horário fixo');
assert.match(modal,/<option value="1" selected>Segunda<\/option>/,'dia da semana pre-selecionado');
assert.match(modal,/name="start_time" type="time" value="09:00"/,'hora se aproxima do clique em intervalos 15min');
assert.doesNotMatch(modal,/name="slot_date"/,'horário semanal nao tem data especifica');
await cal.action('calSlotDetails',{dataset:{id:'s1'}});
assert.match(modal,/Desativar horário/,'card abre ação de desativar');
await cal.action('calTeacherPage',{dataset:{page:'agenda'}});
await cal.action('calNewOneOff',{dataset:{}});
assert.match(modal,/data-kind="single"/,'Agenda abre modo avulso');
assert.match(modal,/name="slot_date" type="date"/,'avulso exige data');
assert.doesNotMatch(modal,/name="weekday"/,'Agenda nao cria horario recorrente');
assert.match(app,/iconSvg:\(name,size\)=>ico\(name,size\)/,'svg compartilhado com a interface');
assert.match(app,/cal-editor-target'\)\)/,'editor semanal acionavel pelo teclado');
assert.match(cal.adminNav(),/data-test-icon="clock"/,'menu administrador usa icone SVG');
assert.match(css,/\.cal-editor-target\{/, 'escala horaria definida no CSS');
assert.match(html,/6\.3\.0/, 'assets com cache busting V6.3');
assert.doesNotMatch(cal.adminNav(),/[📅👩🕒⛔⚙]/u, 'menu sem emoji');
console.log('OK: V6.2 grade semanal editavel em Horarios, agenda avulsa, horarios separados e iconografia SVG.');

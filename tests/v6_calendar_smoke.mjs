// Smoke V6: testa o motor de interface sem Supabase externo e verifica as invariantes da migração.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCalendar} from '../js/calendar-v6.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// SQL entregue separadamente a partir da V6.1; executar auditoria SQL apenas no repositorio de desenvolvimento.
const sqlPath=path.join(root,'sql/14_upgrade_calendario_v6.sql');
const sql=fs.existsSync(sqlPath)?fs.readFileSync(sqlPath,'utf8'):null;
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const safe=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
if(sql){
for(const name of ['calendar_teacher_users','calendar_teacher_invites','calendar_slots','calendar_blocks','calendar_lessons','calendar_lesson_history','calendar_legacy_adoptions'])
 assert.match(sql,new RegExp(`CREATE TABLE public\\.${name}`));
for(const operation of ['calendar_create_invite','calendar_accept_invite','calendar_preview','calendar_create_block',
 'calendar_block_impact','calendar_reschedule','calendar_record_lesson','calendar_overview',
 'calendar_adopt_legacy','calendar_cancel_block','calendar_revoke_teacher_access'])
 assert.ok(sql.includes(`FUNCTION public.${operation}(`),operation);
assert.ok(sql.includes("status='needs_reschedule',scheduled_date=NULL,start_time=NULL"),'bloqueio solta ocupacao');
assert.ok(sql.includes("calendar_lessons_start_collision_idx"),'indice impede data/hora identica');
assert.ok(sql.includes('pg_advisory_xact_lock'),'planejamento atomico com bloqueio');
assert.ok(sql.includes('email_confirmed_at IS NOT NULL'),'convite exige email confirmado');
assert.ok(sql.includes('calendar_is_teacher'),'isolamento professor');
assert.ok(sql.includes("l.status='reserved' AND l.reservation_expires_at<=now()"),'reservas vencidas aparecem como pendencias');
assert.ok(sql.includes("RETURN jsonb_build_object('scheduled',remaining"),'migracao legada explicitamente opt-in');
assert.ok(sql.includes('CONSTRAINT calendar_lesson_active_dates_chk'),'estado de agenda exige data consistente');
assert.ok(!sql.includes('CAMPANELLA_SIGNATURES_ENABLED'),'migracao nao reativa assinatura');
assert.ok(app.includes('const EXTERNAL_SIGNATURE_ENABLED=false'),'AssinAPI e Drive desativados no frontend');
assert.ok(app.includes('calendar.applyTerms(f'),'calculo antes de gerar termos');
assert.ok(app.includes('calendar.autoPreview'),'formulario preenche automaticamente');
assert.ok(html.includes('calendar-v6.css?v=6.2.0'),'stylesheet ligado');
assert.ok(html.includes('app.js?v=6.2.0'),'versao publicada em cache');
assert.equal((sql.match(/\$\$/g)||[]).length%2,0,'SQL dollar quoting balanceado');
}

const teacher='33333333-3333-4333-8333-333333333333';
const slot='44444444-4444-4444-8444-444444444444';
const snapshot={admin:true,teacher_access:[{teacher_id:teacher,user_id:'u1'}],teachers:[{id:teacher,name:'João',active:true}],
 slots:[{id:slot,teacher_id:teacher,weekday:1,slot_date:null,time:'09:00',duration:45,active:true}],
 blocks:[{id:'b1',teacher_id:teacher,from:'2026-12-20',to:'2026-12-31',reason:'Recesso'}],
 lessons:[{id:'l1',contract_id:'c1',teacher_id:teacher,student_name:'Julia',lesson_number:9,total:'12',date:null,time:null,
    original_date:'2026-12-21',original_time:'09:00',status:'needs_reschedule',duration:45}],
 students:[{contract_id:'c1',teacher_id:teacher,name:'Julia',course:'Violão',total:12,done:3,pending:1,contact_phone:'11999999999'}],adopted_ids:[]};
let lastPreview=null;
const sb={rpc:async(name,args)=>{
 if(name==='calendar_overview')return {data:snapshot,error:null};
 if(name==='calendar_preview'){
  lastPreview={name,args};
  return {data:{total:8,end_date:'2027-01-11',lessons:[]},error:null};
 }
 return {data:null,error:{message:'Operacao inesperada: '+name}};
}};
const ui={schoolId:'11111111-1111-4111-8111-111111111111',role:'admin',teacherId:null};
const calendar=createCalendar({sb,ui,db:{teachers:[{id:teacher,name:'João'}],contracts:[],students:[],leads:[],interviews:[]},safe,
 dateBR:x=>x,today:()=> '2026-11-09',showModal:()=>{},closeModal:()=>{},toast:()=>{},refresh:()=>{},render:()=>{},initialize:()=>{},
 authWrap:s=>s,lookup:()=>null,canAdmin:()=>true});
await calendar.load();
assert.ok(calendar.hasAccess(teacher));
assert.ok(calendar.adminNav().includes('data-page=\"students\"'),'admin com menu lateral');
await calendar.action('calTeacherPage',{dataset:{page:'reschedules'}});
assert.ok(calendar.view().includes('Julia'),'aluno no calendário');
assert.ok(calendar.view().includes('Aulas para reagendar'),'pendencias individuais');
assert.ok(calendar.view().includes('Reagendar'),'acao individual');
await calendar.action('calTeacherPage',{dataset:{page:'students'}});
assert.ok(calendar.view().includes('data-id=\"c1\"'),'detalhes abrem pela matricula');
const widget=calendar.getFormPicker(teacher,'2026-11-09',true);
assert.ok(widget.includes(slot));
assert.ok(widget.includes('cal_manual_end'),'contrato permite data final manual');
const checked=[{value:slot}];
const part={dataset:{teacher},querySelectorAll:()=>checked};
const form={querySelector:()=>part,elements:{cal_start_date:{value:'2026-11-09'},cal_manual_end:{value:'',dataset:{calManualEdited:'0'}}}};
const terms={teacher_id:teacher,lessons_count:8,start_date:'2026-11-09',end_date:'2026-12-28'};
const result=await calendar.applyTerms(form,terms);
assert.equal(result.end_date,'2027-01-11');
assert.equal(result.weekly_frequency,1);
assert.deepEqual(result.calendar_v6.slot_ids,[slot]);
assert.equal(result.calendar_v6.calculated_end,'2027-01-11');
assert.equal(result.lesson_schedule[0].duration_minutes,45);
assert.equal(lastPreview.args.p_teacher,teacher);
assert.deepEqual(lastPreview.args.p_slots,[slot]);
form.elements.cal_manual_end={value:'2027-01-20',dataset:{calManualEdited:'1'}};
assert.equal((await calendar.applyTerms(form,terms)).end_date,'2027-01-20');
form.elements.cal_manual_end={value:'2027-01-01',dataset:{calManualEdited:'1'}};
await assert.rejects(calendar.applyTerms(form,terms),/anterior à última aula/);
console.log('OK: V6 calendarios, professor por convite, bloqueios individuais, matriculas, contratos e preservacao das integracoes.');

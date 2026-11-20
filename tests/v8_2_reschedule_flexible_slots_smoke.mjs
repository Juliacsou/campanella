import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCalendar} from '../js/calendar-v6.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const calJs = fs.readFileSync(path.join(root, 'js/calendar-v6.js'), 'utf8');
const migrationSql = fs.readFileSync(path.join(root, 'sql/34_upgrade_v82_reschedule_flexible_slots.sql'), 'utf8');

console.log('=== Iniciando Testes V8.2: Reagendamento Flexível com Adaptação de Duração ===\n');

// 1. Verificando a migration SQL do backend
console.log('1. Verificando migração SQL 34_upgrade_v82_reschedule_flexible_slots.sql...');
assert.ok(migrationSql.includes('CREATE OR REPLACE FUNCTION public.calendar_reschedule'), 'Deve conter DDL de calendar_reschedule');
assert.ok(migrationSql.includes('v_slot_duration integer'), 'Deve declarar variável v_slot_duration');
assert.ok(migrationSql.includes('coalesce(v_slot_duration, l.duration_minutes)'), 'Deve passar a duração do slot para calendar_slot_available');
assert.ok(migrationSql.includes('duration_minutes=coalesce(v_slot_duration, duration_minutes)'), 'Deve atualizar duration_minutes da aula com a duração do slot selecionado');
console.log('  -> Migration SQL validada com sucesso.');

// 2. Verificando remoção do filtro estrito de duração no frontend
console.log('2. Verificando código do calendar-v6.js...');
assert.ok(!calJs.includes('Number(s.duration)===Number(l.duration)'), 'Não deve filtrar horários por duração idêntica');
assert.ok(calJs.includes('durLabel=Number(s.duration)!==Number(l.duration)'), 'Deve formatar rótulo de duração quando diferente da original');
assert.ok(calJs.includes('data-duration="${Number(s.duration)}"'), 'Botão do slot deve expor data-duration');
assert.ok(calJs.includes('duration:element.dataset.duration?Number(element.dataset.duration):undefined'), 'calRescheduleSelect deve capturar a duração');
assert.ok(appJs.includes("calendar-v6.js?v=8.1.4"), 'Cache de calendar-v6.js deve estar versionado em 8.1.4');
console.log('  -> Estrutura do código frontend validada.');

// 3. Teste unitário do motor do calendário com aula de 60 min e slots de 50 min
console.log('3. Testando renderização do modal de reagendamento com slots de 50 min para aula de 60 min...');

const teacherId = 'teacher-ana-1';
const schoolId = 'school-campanella-1';

const slots = [
  // Segunda: 2 slots de 60 min
  {id: 'slot-mon-08', teacher_id: teacherId, weekday: 1, time: '08:00', duration: 60, slot_date: null, active: true},
  {id: 'slot-mon-09', teacher_id: teacherId, weekday: 1, time: '09:00', duration: 60, slot_date: null, active: true},
  // Terça: 11 slots de 50 min
  {id: 'slot-tue-10', teacher_id: teacherId, weekday: 2, time: '10:00', duration: 50, slot_date: null, active: true},
  {id: 'slot-tue-11', teacher_id: teacherId, weekday: 2, time: '11:00', duration: 50, slot_date: null, active: true},
  // Quarta: slots de 50 min
  {id: 'slot-wed-14', teacher_id: teacherId, weekday: 3, time: '14:00', duration: 50, slot_date: null, active: true},
  // Quinta: slots de 50 min
  {id: 'slot-thu-15', teacher_id: teacherId, weekday: 4, time: '15:00', duration: 50, slot_date: null, active: true},
  // Sexta: slots de 50 min
  {id: 'slot-fri-16', teacher_id: teacherId, weekday: 5, time: '16:00', duration: 50, slot_date: null, active: true},
  // Sábado: slots de 50 min
  {id: 'slot-sat-09', teacher_id: teacherId, weekday: 6, time: '09:00', duration: 50, slot_date: null, active: true}
];

// Aula do Lucas de 60 minutos
const lesson60 = {
  id: 'lesson-lucas-2',
  contract_id: 'contract-lucas-1',
  student_id: 'student-lucas-1',
  teacher_id: teacherId,
  student_name: 'LUCAS',
  lesson_number: 2,
  total: 24,
  date: null,
  time: null,
  original_date: '2026-11-09',
  original_time: '08:00',
  duration: 60,
  status: 'needs_reschedule'
};

const snapshot = {
  teachers: [{id: teacherId, name: 'Ana', active: true}],
  slots,
  blocks: [],
  lessons: [lesson60],
  interviews: [],
  students: [{student_id: 'student-lucas-1', contract_id: 'contract-lucas-1', name: 'LUCAS', teacher_id: teacherId, done: 1, pending: 1, total: 24}],
  teacher_access: []
};

let renderedModalHtml = '';
let lastConfirmedMsg = '';
const rpcCalls = [];

const safe = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const ui = {role: 'admin', schoolId, teacherId: null, teacherSchoolName: 'Escola Campanella', user: {email: 'admin@campanella.test'}, teacherAccess: []};

globalThis.window = {
  campanellaConfirm: async (msg) => {
    lastConfirmedMsg = msg;
    return true;
  }
};

const cal = createCalendar({
  sb: {
    rpc: async (method, args) => {
      rpcCalls.push({method, args});
      if (method === 'calendar_overview') return {data: structuredClone(snapshot), error: null};
      if (method === 'calendar_reschedule') return {data: {ok: true}, error: null};
      return {data: null, error: null};
    }
  },
  ui,
  db: {teachers: snapshot.teachers, contracts: [], students: []},
  safe,
  today: () => '2026-11-01', // Data anterior para que os dias da semana sejam considerados futuros
  dateBR: (d) => d ? d.split('-').reverse().join('/') : '',
  showModal: (html) => { renderedModalHtml = html; },
  closeModal: () => {},
  toast: () => {},
  refresh: () => {},
  render: () => {}
});

await cal.load();

// Aciona o reagendamento da aula de 60 minutos
await cal.action('calReschedule', {dataset: {id: lesson60.id}});

// Verifica se os slots de 50 min (Terça 10:00, Quarta 14:00, Sábado 09:00 etc.) aparecem no HTML do modal
assert.ok(renderedModalHtml.includes('10:00'), 'Horário das 10:00 (slot de 50 min) deve estar presente no modal');
assert.ok(renderedModalHtml.includes('data-time="10:00"'), 'Botão das 10:00 deve ter data-time="10:00"');
assert.ok(renderedModalHtml.includes('· 50m'), 'Slots com duração diferente de 60 min devem exibir badge "· 50m"');
assert.ok(renderedModalHtml.includes('data-duration="50"'), 'Botão do slot deve ter data-duration="50"');

console.log('  -> Slots de 50 min renderizados com badge de duração.');

// Simula seleção do slot de terça às 10:00 (50 min)
const fakeBtn = {
  dataset: {date: '2026-11-03', time: '10:00', duration: '50'},
  closest: () => ({elements: {note: {value: 'Combinado em aula'}}})
};
await cal.action('calRescheduleSelect', fakeBtn);

// Verifica se o texto de seleção exibe data, hora e os 50 min
assert.ok(renderedModalHtml.includes('03/11/2026 às 10:00 (50 min)'), 'Seleção deve exibir data, hora e (50 min)');

// Simula submissão do formulário de reagendamento
const fakeForm = {
  id: 'calRescheduleForm',
  dataset: {id: lesson60.id},
  elements: {
    date: {value: '2026-11-03'},
    time: {value: '10:00'},
    note: {value: 'Combinado em aula'}
  }
};
await cal.submit(fakeForm);

// Verifica confirmação e chamada RPC
assert.ok(lastConfirmedMsg.includes('03/11/2026 às 10:00 (50 min)'), 'Mensagem de confirmação deve indicar a duração');
const reschRpc = rpcCalls.find(c => c.method === 'calendar_reschedule');
assert.ok(reschRpc, 'calendar_reschedule RPC deve ter sido chamado');
assert.equal(reschRpc.args.p_lesson, lesson60.id);
assert.equal(reschRpc.args.p_date, '2026-11-03');
assert.equal(reschRpc.args.p_time, '10:00');
assert.equal(reschRpc.args.p_note, 'Combinado em aula');

console.log('  -> Seleção, modal de confirmação e chamada RPC validados com sucesso.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DE REAGENDAMENTO FLEXÍVEL PASSARAM! 🎉');
console.log('======================================================\n');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCalendar} from '../js/calendar-v6.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const calCss = fs.readFileSync(path.join(root, 'css/calendar-v6.css'), 'utf8');

const teacherId = 'teacher-bulk-1';
const schoolId = 'school-bulk-1';
const existingSlot = {
 id: 'existing-mon-09',
 teacher_id: teacherId,
 weekday: 1, // Segunda
 time: '09:00',
 duration: 60,
 slot_date: null,
 active: true
};

const snapshot = {
 teachers: [{id: teacherId, name: 'Prof. Carlos', active: true}],
 slots: [existingSlot],
 blocks: [],
 lessons: [],
 students: [],
 teacher_access: []
};

let modalHtml = '';
let lastToast = '';
const rpcCalls = [];
const elements = {app: {innerHTML: ''}, pageContent: {innerHTML: ''}};
globalThis.document = {getElementById: (id) => elements[id] || {innerHTML: ''}};

const safe = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const ui = {
 role: 'teacher',
 schoolId,
 teacherId,
 teacherSchoolName: 'Escola Campanella',
 user: {email: 'carlos@campanella.test'},
 teacherAccess: []
};

const cal = createCalendar({
 sb: {
  rpc: async (method, args) => {
   rpcCalls.push({method, args});
   if (method === 'calendar_overview') return {data: structuredClone(snapshot), error: null};
   if (method === 'calendar_weekly_roster') return {data: [], error: null};
   if (method === 'calendar_add_slot') return {data: {id: 'new-slot'}, error: null};
   throw new Error('Unexpected RPC: ' + method);
  }
 },
 ui,
 db: {teachers: snapshot.teachers, contracts: [], students: []},
 safe,
 dateBR: (s) => s,
 today: () => '2026-11-19',
 showModal: (html) => { modalHtml = html; },
 closeModal: () => {},
 toast: (msg) => { lastToast = msg; },
 refresh: async () => {},
 render: () => {},
 initialize: async () => {},
 authWrap: (s) => s,
 lookup: () => null,
 canAdmin: () => false,
 iconSvg: (n) => `<svg data-icon="${n}"></svg>`
});

await cal.load();
await cal.action('calTeacherPage', {dataset: {page: 'slots'}});

// 1. Botão de cadastro em lote na Grade Semanal
assert.match(elements.pageContent.innerHTML, /data-action="calNewBulkSlots"/, 'Grade semanal exibe botão Cadastrar em lote');
assert.match(elements.pageContent.innerHTML, /Cadastrar horários em lote/, 'Texto do botão de cadastro em lote');
assert.match(elements.pageContent.innerHTML, /Horário individual/, 'Texto do botão de horário individual');

// 2. Modal de cadastro em lote contém os 5 campos solicitados
await cal.action('calNewBulkSlots', {dataset: {}});
assert.match(modalHtml, /id="calBulkSlotForm"/, 'Abre formulário calBulkSlotForm');
assert.match(modalHtml, /name="first_time" type="time"/, 'Campo primeiro horário');
assert.match(modalHtml, /name="last_time" type="time"/, 'Campo último horário');
assert.match(modalHtml, /name="duration" type="number"/, 'Campo tempo de aula');
assert.match(modalHtml, /name="interval" type="number"/, 'Campo intervalo entre aulas');
assert.match(modalHtml, /name="bulk_weekday"/, 'Seleção de dias da semana disponíveis');
assert.match(modalHtml, /data-action="calBulkSelectAllDays"/, 'Ação para selecionar todos os dias');
assert.match(modalHtml, /data-action="calBulkSelectWorkDays"/, 'Ação para selecionar dias úteis');
assert.match(modalHtml, /id="calBulkPreview"/, 'Pré-visualização dos horários gerados');

// 2.1 Modal de horário individual contém banner para mudar para lote
await cal.action('calNewWeeklySlot', {dataset: {}});
assert.match(modalHtml, /cal-bulk-banner/, 'Modal de horário fixo contém banner com atalho para lote');
assert.match(modalHtml, /data-action="calNewBulkSlots"/, 'Botão para alternar para cadastro em lote');

// 3. Cálculo de horários com aula de 50 min e intervalo de 10 min + conflito existente
const plan50 = cal.computeBulkSlotPlan({
 teacherId,
 firstTime: '08:00',
 lastTime: '10:00',
 duration: 50,
 interval: 10,
 weekdays: [1, 3] // Segunda e Quarta
});
assert.equal(plan50.error, null);
assert.deepEqual(plan50.times.map((t) => `${t.time}-${t.endTime}`), ['08:00-08:50', '09:00-09:50', '10:00-10:50']);
// Segunda às 09:00 já existe (existing-mon-09), então 1 é pulado e 5 são criados
assert.equal(plan50.skipped.length, 1, 'Horário conflitante na segunda às 09:00 é ignorado');
assert.equal(plan50.toCreate.length, 5, '5 novos horários a cadastrar');

// 4. Atualização dinâmica de preview via calendar.change
const previewHost = {innerHTML: ''};
const submitBtn = {disabled: false, textContent: ''};
const mockForm = {
 id: 'calBulkSlotForm',
 elements: {
  first_time: {value: '14:00'},
  last_time: {value: '16:00'},
  duration: {value: '45'},
  interval: {value: '15'}
 },
 querySelectorAll: () => [{value: '2'}, {value: '4'}], // Terça e Quinta
 querySelector: (sel) => (sel === '#calBulkPreview' ? previewHost : sel === 'button[type="submit"]' ? submitBtn : null)
};
await cal.change({form: mockForm, name: 'interval'});
assert.match(previewHost.innerHTML, /14:00–14:45/);
assert.match(previewHost.innerHTML, /15:00–15:45/);
assert.match(previewHost.innerHTML, /16:00–16:45/);
assert.equal(submitBtn.textContent, 'Cadastrar 6 horário(s)');
assert.equal(submitBtn.disabled, false);

// 5. Submissão do formulário cadastra todos os horários de uma vez via calendar_add_slot
rpcCalls.length = 0;
await cal.submit(mockForm);
const addSlotCalls = rpcCalls.filter((c) => c.method === 'calendar_add_slot');
assert.equal(addSlotCalls.length, 6, 'Deve cadastrar os 6 horários gerados');
assert.deepEqual(
 addSlotCalls.map((c) => `${c.args.p_weekday}@${c.args.p_start}(${c.args.p_duration})`),
 ['2@14:00(45)', '2@15:00(45)', '2@16:00(45)', '4@14:00(45)', '4@15:00(45)', '4@16:00(45)']
);
assert.match(lastToast, /6 horário\(s\) cadastrado\(s\) com sucesso/);

// 6. Verificações em app.js e calendar-v6.css
assert.ok(appJs.includes("e.target.form?.id==='calBulkSlotForm'"), 'app.js encaminha eventos do calBulkSlotForm');
assert.ok(calCss.includes('.cal-bulk-weekdays') && calCss.includes('.cal-bulk-preview'), 'calendar-v6.css estiliza o modal em lote');

// 7. Verificação de cache-busting v=8.1.3
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/calendar-v6\.css\?v=8\.1\.[34]/.test(indexHtml), 'index.html referencia calendar-v6.css com v=8.1.3 ou superior');
assert.ok(/app\.js\?v=8\.1\.[34]/.test(indexHtml), 'index.html referencia app.js com v=8.1.3 ou superior');
assert.ok(appJs.includes('calendar-v6.js?v=8.1.3'), 'app.js importa calendar-v6.js com v=8.1.3');

console.log('OK: Cadastro de horários do professor em lote validado com sucesso!');

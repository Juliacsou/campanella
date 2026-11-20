import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('/home/antigravity/Juliacsou/campanella');
const sqlFile = fs.readFileSync(path.join(basePath, 'sql/35_upgrade_v83_admin_interviewers.sql'), 'utf8');
const crmJs = fs.readFileSync(path.join(basePath, 'js/crm.js'), 'utf8');
const appJs = fs.readFileSync(path.join(basePath, 'js/app.js'), 'utf8');

console.log('=== Iniciando Testes V8.3: Administradores como Entrevistadores ===\n');

// 1. Verificando migração SQL 35_upgrade_v83_admin_interviewers.sql
console.log('1. Verificando migração SQL 35_upgrade_v83_admin_interviewers.sql...');
assert.ok(
  sqlFile.includes('ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS guardian_name text;'),
  'A migração deve garantir a coluna guardian_name em public.interviews'
);
assert.ok(
  sqlFile.includes('DROP CONSTRAINT IF EXISTS fk_interviews_interviewer_teacher_v65'),
  'A migração deve remover a restrição exclusiva de FK a teachers em public.interviews'
);
assert.ok(
  sqlFile.includes('DROP CONSTRAINT IF EXISTS fk_crm_appointments_teacher_id_school') ||
  sqlFile.includes('DROP CONSTRAINT IF EXISTS crm_appointments_teacher_id_fkey'),
  'A migração deve remover restrições de FK a teachers em public.crm_appointments'
);
assert.ok(
  sqlFile.includes('DROP CONSTRAINT IF EXISTS fk_interview_invites_teacher_id_school') ||
  sqlFile.includes('DROP CONSTRAINT IF EXISTS interview_invites_teacher_id_fkey'),
  'A migração deve remover restrições de FK a teachers em public.interview_invites'
);
assert.ok(
  sqlFile.includes("NOTIFY pgrst, 'reload schema';"),
  'A migração deve recarregar o schema cache do PostgREST'
);
console.log('  -> Migração SQL validada com sucesso.');

// 2. Verificando crm.js: suporte a admins e grupos no select de entrevistador
console.log('2. Verificando crm.js: funções de entrevistador e optgroups...');
assert.ok(
  crmJs.includes('schoolAdminsList') && crmJs.includes('interviewerName') && crmJs.includes('interviewerOptions'),
  'O crm.js deve conter as funções schoolAdminsList, interviewerName e interviewerOptions'
);
assert.ok(
  crmJs.includes('<optgroup label="Administradores">') && crmJs.includes('<optgroup label="Professores">'),
  'interviewerOptions no crm.js deve agrupar opções em Administradores e Professores'
);
console.log('  -> Funções e optgroups no crm.js validados.');

// 3. Verificando Lead Drawer Aba 4 (Orçamento) no crm.js
console.log('3. Verificando formulário de Orçamento (Aba 4) no crm.js...');
assert.ok(
  crmJs.includes('<span>Entrevistador *</span>') &&
  crmJs.includes('name="interviewer_teacher_id"') &&
  crmJs.includes('${interviewerOptions(interviewerTeacher)}'),
  'O formulário de orçamento deve rotular "Entrevistador *" e usar interviewerOptions(interviewerTeacher)'
);
assert.ok(
  crmJs.includes('<span>Professor responsável pelas aulas *</span>') &&
  crmJs.includes('name="teacher_id"'),
  'O formulário de orçamento deve manter o campo estrito para o professor que leciona as aulas'
);
assert.ok(
  crmJs.includes('isAdminInterviewer') &&
  crmJs.includes('interviewer_id:isAdminInterviewer?selectedInterviewer:'),
  'Ao salvar o orçamento, deve persistir interviewer_id e interviewer_teacher_id quando o entrevistador for admin'
);
console.log('  -> Formulário de Orçamento validado.');

// 4. Verificando agendamento e popups de orçamento no crm.js
console.log('4. Verificando appointmentForm e openBudgetInvitePopup no crm.js...');
assert.ok(
  crmJs.includes('<span>Entrevistador designado *</span>') &&
  crmJs.includes('${interviewerOptions(defaultTeacher)}'),
  'O appointmentForm deve exibir "Entrevistador designado *" com interviewerOptions'
);
assert.ok(
  crmJs.includes('openBudgetInvitePopup') &&
  crmJs.includes('<span>Entrevistador *</span>') &&
  crmJs.includes('crmBudgetInvitePopupForm'),
  'O popup de gerar link do orçamento deve permitir selecionar entrevistador (admin ou professor)'
);
assert.ok(
  crmJs.includes('toast(`Entrevista agendada com ${tName}.`);'),
  'O submit do agendamento deve notificar a entrevista agendada com o nome do entrevistador'
);
console.log('  -> Agendamento e popup de orçamento validados.');

// 5. Verificando app.js: integração de admins como entrevistadores
console.log('5. Verificando app.js: interviewerOptions, convites e ficha inicial...');
assert.ok(
  appJs.includes('function interviewerOptions') &&
  appJs.includes('<optgroup label="Administradores">') &&
  appJs.includes('<optgroup label="Professores">'),
  'O app.js deve conter interviewerOptions com optgroups de Administradores e Professores'
);
assert.ok(
  appJs.includes('const isTeacher=!!lookup(\'teachers\',teacherId)?.active;') &&
  appJs.includes('const isAdmin=resolveSchoolAdminsList().some(a=>a.user_id===teacherId);'),
  'createInterviewInviteLink no app.js deve validar se o entrevistador é professor ativo ou administrador'
);
assert.ok(
  appJs.includes('<span>Entrevistador</span><select name="interviewer_teacher_id"') &&
  appJs.includes('${interviewerOptions(interviewer)}'),
  'interviewForm no app.js deve usar interviewerOptions para o entrevistador'
);
assert.ok(
  appJs.includes('safe(interviewerName(i.interviewer_teacher_id))'),
  'interviewsView no app.js deve exibir o nome do entrevistador corretamente usando interviewerName'
);
console.log('  -> Integração no app.js validada.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DE ADMINISTRADORES COMO ENTREVISTADORES PASSARAM! 🎉');
console.log('======================================================\n');

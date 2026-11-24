// tests/v8_4_unified_budget_pre_enrollment_smoke.mjs
import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('=== Testes V8.4: Pré-matrícula Unificada no Link do Orçamento ===\n');

// 1. Verificar encoding/decoding do token de orçamento com os novos campos
console.log('1. Verificando encoding e decoding do orçamento...');
const { decodeBudgetData } = await import('../js/crm.js');

function encodeBudgetData(data) {
  const jsonStr = JSON.stringify(data);
  const bytes = new TextEncoder().encode(jsonStr);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const mockPayload = {
  v: 1,
  school_id: '11111111-2222-3333-4444-555555555555',
  school_name: 'Campanella Idiomas',
  school_phone: '11999998888',
  lead_id: 'aaaa1111-bb22-cc33-dd44-ee5555555555',
  lead_name: 'Mariana Silva',
  student2_name: 'Carlos Silva',
  is_duo: true,
  guardian_name: null,
  course: 'Inglês',
  teacher_name: 'Prof. Roberto',
  teacher_id: 'prof-123',
  interview_id: 'fiche-456',
  package_id: 'pkg-789',
  kind: 'dupla',
  lessons_count: 36,
  weekly_frequency: 2,
  start_date: '2026-03-01',
  end_date: '2026-07-01',
  preferred_schedule: 'Ter/Qui 19h',
  total_amount: 2400,
  installments: 6,
  installment_amount: 400,
  first_due_date: '2026-03-05',
  payment_method: 'Boleto / PIX',
  pedagogical_notes: 'Foco em conversação executiva',
  phone: '11988887777',
  email: 'mariana@exemplo.com'
};

const token = encodeBudgetData(mockPayload);
const decoded = decodeBudgetData(token);

assert.strictEqual(decoded.lead_id, mockPayload.lead_id, 'lead_id deve ser decodificado corretamente');
assert.strictEqual(decoded.school_id, mockPayload.school_id, 'school_id deve ser preservado');
assert.strictEqual(decoded.is_duo, true, 'is_duo deve ser true');
assert.strictEqual(decoded.kind, 'dupla', 'kind deve ser dupla');
assert.strictEqual(decoded.teacher_id, 'prof-123', 'teacher_id deve ser preservado');
assert.strictEqual(decoded.package_id, 'pkg-789', 'package_id deve ser preservado');
assert.strictEqual(decoded.interview_id, 'fiche-456', 'interview_id deve ser preservado');
assert.strictEqual(decoded.email, 'mariana@exemplo.com', 'email deve ser preservado');
console.log('✓ Encoding e decoding do orçamento com novos campos OK.');

// 2. Verificar app.js
console.log('\n2. Verificando js/app.js...');
const appContent = fs.readFileSync(path.join(process.cwd(), 'js/app.js'), 'utf8');

assert.ok(appContent.includes('id="budgetPreEnrollmentForm"'), 'app.js deve conter o formulário budgetPreEnrollmentForm');
assert.ok(appContent.includes("else if(f.id==='budgetPreEnrollmentForm'){await completeBudgetPreEnrollment(f);return;}"), 'app.js deve delegar o submit de budgetPreEnrollmentForm');
assert.ok(appContent.includes('async function completeBudgetPreEnrollment('), 'app.js deve conter completeBudgetPreEnrollment');
assert.ok(appContent.includes("submit_budget_pre_enrollment"), 'app.js deve invocar RPC submit_budget_pre_enrollment');
assert.ok(appContent.includes("action:'submit_budget'"), 'app.js deve conter fallback para Edge function action submit_budget');
assert.ok(appContent.includes('id="budgetMinorToggle"'), 'app.js deve conter budgetMinorToggle para alunos menores');
assert.ok(appContent.includes('id="budgetGuardianSection"'), 'app.js deve conter budgetGuardianSection');
assert.ok(appContent.includes('id="budgetSignerSelect"'), 'app.js deve conter budgetSignerSelect');
assert.ok(appContent.includes('#pre-matricula-concluida'), 'app.js deve atualizar hash para pre-matricula-concluida');
console.log('✓ app.js possui todas as estruturas necessárias.');

// 3. Verificar crm.js
console.log('\n3. Verificando js/crm.js...');
const crmContent = fs.readFileSync(path.join(process.cwd(), 'js/crm.js'), 'utf8');
assert.ok(crmContent.includes('school_id:lead.school_id||ui.schoolId||fiche.school_id||null'), 'crm.js deve incluir school_id');
assert.ok(crmContent.includes('interview_id:fiche.id||null'), 'crm.js deve incluir interview_id');
assert.ok(crmContent.includes('package_id:fiche.package_id||null'), 'crm.js deve incluir package_id');
assert.ok(crmContent.includes('confirme sua pré-matrícula'), 'crm.js WhatsApp mensagem deve convidar para pré-matrícula');
console.log('✓ crm.js validado.');

// 4. Verificar Edge Function matricula-v5
console.log('\n4. Verificando supabase/functions/matricula-v5/index.ts...');
const edgeContent = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/matricula-v5/index.ts'), 'utf8');
assert.ok(edgeContent.includes("if(action==='submit_budget')"), 'matricula-v5 deve tratar action submit_budget');
assert.ok(edgeContent.includes("service.rpc('submit_budget_pre_enrollment'"), 'matricula-v5 deve invocar submit_budget_pre_enrollment');
console.log('✓ matricula-v5 validado.');

// 5. Verificar SQL migration
console.log('\n5. Verificando sql/36_upgrade_v84_unified_budget_pre_enrollment.sql...');
const sqlContent = fs.readFileSync(path.join(process.cwd(), 'sql/36_upgrade_v84_unified_budget_pre_enrollment.sql'), 'utf8');
assert.ok(sqlContent.includes('CREATE OR REPLACE FUNCTION public.submit_budget_pre_enrollment'), 'SQL deve criar a função submit_budget_pre_enrollment');
assert.ok(sqlContent.includes("crm_stage = 'pre_matricula_feita'"), 'SQL deve atualizar crm_stage para pre_matricula_feita');
assert.ok(sqlContent.includes("status = 'pre_enrolled'"), 'SQL deve definir status do contrato como pre_enrolled');
assert.ok(sqlContent.includes("GRANT EXECUTE ON FUNCTION public.submit_budget_pre_enrollment(uuid, jsonb, jsonb) TO anon, authenticated, service_role"), 'SQL deve conceder execução a anon, authenticated, service_role');
console.log('✓ SQL migration validado.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DA PRÉ-MATRÍCULA UNIFICADA PASSARAM! 🎉');
console.log('======================================================');

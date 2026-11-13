// tests/v7_6_dupla_lead_e_prematricula_smoke.mjs
// Testes automatizados do fluxo completo de Dupla (Lead -> Ficha -> Pré-matrícula -> Matrícula -> Contrato)
// e da busca/cadastro inline do 2º aluno na matrícula manual.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('=== Iniciando Testes V7.6: Fluxo Completo de Dupla (Lead -> Ficha -> Pré-matrícula) ===\n');

// 1. Verificação de integridade dos arquivos JavaScript e Edge Functions
console.log('1. Verificando integridade e tags nos arquivos...');
const appJs = fs.readFileSync(path.resolve('js/app.js'), 'utf8');
const crmJs = fs.readFileSync(path.resolve('js/crm.js'), 'utf8');
const entrevistaFn = fs.readFileSync(path.resolve('supabase/functions/entrevista/index.ts'), 'utf8');
const matriculaFn = fs.readFileSync(path.resolve('supabase/functions/matricula-v5/index.ts'), 'utf8');

// Verificação no crm.js
assert(crmJs.includes('student2_name'), 'crm.js deve suportar student2_name');
assert(crmJs.includes('crmLeadKind'), 'crm.js deve ter seletor de modalidade no formulário de lead');
assert(crmJs.includes('crmLeadName2Field'), 'crm.js deve ter campo para 2º aluno no formulário de lead');
console.log('✓ crm.js possui suporte completo para leads em dupla.');

// Verificação no app.js
assert(appJs.includes('leadKindSelect'), 'app.js deve ter seletor de modalidade no leadForm');
assert(appJs.includes('leadStudent2Field'), 'app.js deve ter campo de 2º aluno no leadForm');
assert(appJs.includes('interviewKind'), 'app.js deve ter seletor de modalidade na ficha inicial (interviewForm)');
assert(appJs.includes('interviewStudent2Field'), 'app.js deve ter campo de 2º aluno na ficha inicial');
assert(appJs.includes('interviewEnrollmentMode'), 'app.js deve ter seletor de formato de plano na ficha inicial');
assert(appJs.includes('externalKind'), 'app.js deve ter seletor de modalidade na ficha inicial externa');
assert(appJs.includes('externalEnrollmentMode'), 'app.js deve ter seletor de formato na ficha inicial externa');
assert(appJs.includes('applyEnrollmentModeUI'), 'app.js deve ter função unificada applyEnrollmentModeUI');
assert(appJs.includes('manualDuoSearchInput'), 'app.js deve ter campo de busca do 2º aluno na matrícula manual');
assert(appJs.includes('duoStudentNewBox'), 'app.js deve ter formulário inline para cadastro do 2º aluno');
assert(appJs.includes('student2_new_name'), 'app.js deve ter input student2_new_name');
assert(appJs.includes('btnDuoModeSearch') && appJs.includes('btnDuoModeNew'), 'app.js deve ter alternador de modo busca/novo');
assert(appJs.includes('adminPreEnrollmentModal'), 'app.js deve ter modal de pré-matrícula direta pelo admin');
assert(appJs.includes('completeAdminPreEnrollment'), 'app.js deve ter função de conclusão de pré-matrícula pelo admin');
assert(appJs.includes('fillPreEnrollment'), 'app.js deve ter ação fillPreEnrollment no menu e modal');
assert(appJs.includes('activatePreexisting'), 'app.js deve ter ação activatePreexisting no menu e click listener');
assert(appJs.includes('name="agree_terms"'), 'app.js deve ter checkbox de concordância com os termos do plano na pré-matrícula pública');
assert(appJs.includes('!isPreexistingContract(c) && c.terms?.template_rules_version===\'v5.2\''), 'manualContractHTML não deve validar assinaturas em contratos preexistentes');
assert(appJs.includes('preEnrollmentError'), 'app.js deve ter banner de erro inline no formulário público');
assert(appJs.includes('<form id="preEnrollmentForm" novalidate>'), 'app.js deve usar novalidate para evitar bloqueio silencioso do Chrome');
console.log('✓ app.js possui formulários, busca, cadastro inline, pré-matrícula interna e suporte a contratos preexistentes.');

// Verificação nas Edge Functions
assert(entrevistaFn.includes('student2_name') && entrevistaFn.includes('kind'), 'Edge function entrevista deve persistir student2_name e kind');
assert(entrevistaFn.includes('enrollment_mode'), 'Edge function entrevista deve persistir enrollment_mode');
assert(entrevistaFn.includes('guardian_name'), 'Edge function entrevista deve suportar guardian_name');
assert(matriculaFn.includes('student2_name'), 'Edge function matricula-v5 deve retornar student2_name no lookup');
assert(!matriculaFn.includes('assertCanonicalContract(c.template_html'), 'Edge function matricula-v5 não deve bloquear pré-matrícula por assinaturas do modelo');
console.log('✓ Edge functions (entrevista e matricula-v5) preparadas para Dupla, Formato e sem bloqueio indevido de assinatura.');

// 2. Verificação de consultas SQL e banco Supabase (se token disponível)
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN;
if (token) {
  console.log('\n2. Verificando estrutura e migrações no banco Supabase...');
  const res = await fetch('https://api.supabase.com/v1/projects/tyxmskdgbnrcaacwwkhi/database/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        SELECT
          (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'leads' AND column_name IN ('student2_name', 'kind')) as lead_cols,
          (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'interviews' AND column_name IN ('student2_name', 'kind')) as interview_cols,
          (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'contracts' AND column_name IN ('student2_id', 'signer_student_index')) as contract_cols,
          (SELECT COUNT(*) FROM pg_proc WHERE proname = 'admin_complete_pre_enrollment') as rpc_admin_pre_matricula,
          (SELECT COUNT(*) FROM pg_proc WHERE proname = 'activate_preexisting_contract') as rpc_activate_preexisting;
      `
    })
  });
  const data = await res.json();
  assert(data && data[0], 'Resposta inválida do Supabase');
  assert.equal(Number(data[0].lead_cols), 2, 'Tabela leads deve possuir student2_name e kind');
  assert.equal(Number(data[0].interview_cols), 2, 'Tabela interviews deve possuir student2_name e kind');
  assert.equal(Number(data[0].contract_cols), 2, 'Tabela contracts deve possuir student2_id e signer_student_index');
  assert.equal(Number(data[0].rpc_admin_pre_matricula), 1, 'Função RPC admin_complete_pre_enrollment deve existir no Supabase');
  assert.equal(Number(data[0].rpc_activate_preexisting), 1, 'Função RPC activate_preexisting_contract deve existir no Supabase');
  console.log('✓ Colunas de dupla, admin_complete_pre_enrollment e activate_preexisting_contract confirmadas no banco.');
} else {
  console.log('\n2. Verificação ativa no banco pulada (SUPABASE_ACCESS_TOKEN não definido).');
}

console.log('\n======================================================');
console.log('TODOS OS TESTES DO FLUXO COMPLETO DE DUPLA PASSARAM! 🎉');
console.log('======================================================\n');

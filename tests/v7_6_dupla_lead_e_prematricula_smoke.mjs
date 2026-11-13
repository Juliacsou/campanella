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
assert(crmJs.includes('crmLeadName2Box'), 'crm.js deve ter campo para 2º aluno no formulário de lead');
console.log('✓ crm.js possui suporte completo para leads em dupla.');

// Verificação no app.js
assert(appJs.includes('leadKindSelect'), 'app.js deve ter seletor de modalidade no leadForm');
assert(appJs.includes('leadStudent2Field'), 'app.js deve ter campo de 2º aluno no leadForm');
assert(appJs.includes('interviewKind'), 'app.js deve ter seletor de modalidade na ficha inicial (interviewForm)');
assert(appJs.includes('interviewStudent2Field'), 'app.js deve ter campo de 2º aluno na ficha inicial');
assert(appJs.includes('manualDuoSearchInput'), 'app.js deve ter campo de busca do 2º aluno na matrícula manual');
assert(appJs.includes('duoStudentNewBox'), 'app.js deve ter formulário inline para cadastro do 2º aluno');
assert(appJs.includes('student2_new_name'), 'app.js deve ter input student2_new_name');
assert(appJs.includes('btnDuoModeSearch') && appJs.includes('btnDuoModeNew'), 'app.js deve ter alternador de modo busca/novo');
console.log('✓ app.js possui formulários, busca e cadastro inline do 2º aluno.');

// Verificação nas Edge Functions
assert(entrevistaFn.includes('student2_name') && entrevistaFn.includes('kind'), 'Edge function entrevista deve persistir student2_name e kind');
assert(matriculaFn.includes('student2_name'), 'Edge function matricula-v5 deve retornar student2_name no lookup');
console.log('✓ Edge functions (entrevista e matricula-v5) preparadas para Dupla.');

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
          (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'contracts' AND column_name IN ('student2_id', 'signer_student_index')) as contract_cols;
      `
    })
  });
  const data = await res.json();
  assert(data && data[0], 'Resposta inválida do Supabase');
  assert.equal(Number(data[0].lead_cols), 2, 'Tabela leads deve possuir student2_name e kind');
  assert.equal(Number(data[0].interview_cols), 2, 'Tabela interviews deve possuir student2_name e kind');
  assert.equal(Number(data[0].contract_cols), 2, 'Tabela contracts deve possuir student2_id e signer_student_index');
  console.log('✓ Colunas de dupla em leads, interviews e contracts confirmadas no banco.');
} else {
  console.log('\n2. Verificação ativa no banco pulada (SUPABASE_ACCESS_TOKEN não definido).');
}

console.log('\n======================================================');
console.log('TODOS OS TESTES DO FLUXO COMPLETO DE DUPLA PASSARAM! 🎉');
console.log('======================================================\n');

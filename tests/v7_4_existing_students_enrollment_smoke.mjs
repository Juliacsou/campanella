// ==============================================================================
// TESTES DE FUMAÇA: Campanella V7.4 - Matrícula de Alunos Existentes e Recorrência
// ==============================================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/d38aac29-2ab6-4000-8356-2c8b944a7fe9/scratch/db-query.mjs';

console.log('--- Iniciando Testes V7.4: Matrícula de Alunos Existentes e Recorrência ---');

// 1. Validar sintaxe e integridade dos arquivos JS modificados
console.log('1. Validando integridade dos arquivos JavaScript...');
const appCode = fs.readFileSync('js/app.js', 'utf8');
const calCode = fs.readFileSync('js/calendar-v6.js', 'utf8');
const onbCode = fs.readFileSync('js/onboarding-v67.js', 'utf8');

// Verificações no app.js
assert.ok(appCode.includes('studentScheduleHost'), 'studentForm deve conter container #studentScheduleHost');
assert.ok(appCode.includes('studentSchedulePicker'), 'calendar deve expor studentSchedulePicker');
assert.ok(appCode.includes('data-action="close">Cancelar</button><button class="btn" type="submit">Salvar cadastro'), 'studentForm deve conter botão Cancelar explícito');
assert.ok(appCode.includes('Contrato preexistente (Sem contrato digital)'), 'contractOptions deve incluir opção de contrato preexistente');
assert.ok(appCode.includes('manualEnrollmentMode'), 'manualEnrollmentForm deve incluir seletor de modalidade de matrícula');
assert.ok(appCode.includes('isPreexistingContract'), 'app.js deve conter função utilitária isPreexistingContract');
assert.ok(appCode.includes("status:enrollmentStatus,audit"), 'manualEnrollmentForm deve persistir status assinado e auditoria para contrato preexistente');

// Verificações no calendar-v6.js
assert.ok(calCode.includes('studentSchedulePicker'), 'calendar-v6.js deve implementar studentSchedulePicker');
assert.ok(calCode.includes("mode==='recurrence'"), 'plan e previewForm devem suportar modalidade recurrence');
assert.ok(calCode.includes('p_end_date:endDate,p_mode:mode'), 'calendar_preview RPC deve receber p_end_date e p_mode');

// Verificações no onboarding-v67.js
assert.ok(onbCode.includes('data_termino'), 'onboarding-v67.js deve incluir data_termino nas colunas de matrícula');
assert.ok(onbCode.includes("isPreexisting=!r.modelo||['preexistente'"), 'prepareEnrollmentRow deve identificar modelo preexistente');
assert.ok(onbCode.includes("modelo:'preexistente'"), 'readyCSVRow deve sugerir modelo preexistente por padrão');

console.log('✓ Arquivos JavaScript validados com sucesso.');

// 2. Validar migrações SQL no banco de dados Supabase
console.log('2. Validando procedimentos e regras no Supabase...');

// Verificar parâmetros de calendar_preview
const procPreview = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'calendar_preview'");
assert.ok(procPreview.length > 0, 'Função calendar_preview deve existir');
assert.ok(procPreview[0].def.includes('p_end_date'), 'calendar_preview deve ter parâmetro p_end_date');
assert.ok(procPreview[0].def.includes("effective_mode text := coalesce(p_mode, 'package')") || procPreview[0].def.includes("p_mode text DEFAULT 'package'"), 'calendar_preview deve ter suporte a p_mode');
assert.ok(procPreview[0].def.includes('d <= p_end_date'), 'calendar_preview deve iterar até p_end_date no modo de recorrência');

// Verificar calendar_create_block
const procBlock = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'calendar_create_block'");
assert.ok(procBlock.length > 0, 'Função calendar_create_block deve existir');
assert.ok(procBlock[0].def.includes("mode_ := coalesce(item.terms->>'enrollment_mode', 'package');"), 'calendar_create_block deve inspecionar enrollment_mode');
assert.ok(procBlock[0].def.includes("cancelled_by_block"), 'calendar_create_block deve gravar evento cancelled_by_block para recorrência');
assert.ok(procBlock[0].def.includes("status = 'cancelled'"), 'calendar_create_block deve cancelar aula de recorrência sem incrementar pendência');

// Verificar RLS contracts_license_insert
const policies = await query("SELECT polname, polwithcheck FROM pg_policy WHERE polrelid = 'contracts'::regclass AND polname = 'contracts_license_insert'");
assert.ok(policies.length > 0, 'Policy contracts_license_insert deve existir');
assert.ok(policies[0].polwithcheck.includes('115 105 103 110 101 100') || policies[0].polwithcheck.includes('signed'), 'contracts_license_insert deve permitir status signed');

// Verificar onboarding_prepare_enrollment
const procOnb = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'onboarding_prepare_enrollment'");
assert.ok(procOnb.length > 0, 'Função onboarding_prepare_enrollment deve existir');
assert.ok(procOnb[0].def.includes('is_preexisting'), 'onboarding_prepare_enrollment deve conter suporte a contrato preexistente');
assert.ok(procOnb[0].def.includes('is_recurrence'), 'onboarding_prepare_enrollment deve conter suporte a recorrência');

console.log('✓ Procedimentos e políticas no Supabase validados com sucesso.');

// 3. Teste de chamada funcional do RPC calendar_preview no banco
console.log('3. Testando execução funcional de calendar_preview com p_mode = recurrence...');
// Localizar uma escola e professor ativos com admin para simulação
const sample = await query(`
  SELECT s.admin_user_id, s.id as school_id, t.id as teacher_id, array_agg(sl.id) as slot_ids
  FROM schools s
  JOIN teachers t ON t.school_id = s.id AND t.active
  JOIN calendar_slots sl ON sl.school_id = s.id AND sl.teacher_id = t.id AND sl.active AND sl.slot_date IS NULL
  WHERE s.admin_user_id IS NOT NULL AND public.has_active_school_license(s.id)
  GROUP BY s.admin_user_id, s.id, t.id
  HAVING count(sl.id) >= 1
  LIMIT 1
`);

if (sample.length > 0) {
  const { admin_user_id, school_id, teacher_id, slot_ids } = sample[0];
  const chosenSlots = slot_ids.slice(0, 1);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  const startStr = startDate.toISOString().split('T')[0];
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 21); // 3 semanas
  const endStr = endDate.toISOString().split('T')[0];

  const previewRes = await query(`
    SELECT set_config('request.jwt.claim.sub', '${admin_user_id}', true);
    SELECT public.calendar_preview(
      '${school_id}'::uuid,
      '${teacher_id}'::uuid,
      '${startStr}'::date,
      NULL,
      ARRAY['${chosenSlots[0]}']::uuid[],
      '${endStr}'::date,
      'recurrence'
    ) as result;
  `);

  assert.ok(previewRes.length > 0 && previewRes[0].result, 'calendar_preview deve retornar resultado');
  const res = previewRes[0].result;
  assert.ok(res.total >= 1, `Recorrência deve calcular aulas (total: ${res.total})`);
  assert.ok(res.end_date <= endStr, `Data final calculada (${res.end_date}) deve respeitar limite (${endStr})`);
  console.log(`✓ calendar_preview funcional no banco: calculou ${res.total} aula(s) até ${res.end_date}.`);
} else {
  console.log('i Nota: Nenhuma escola com slots ativos encontrada para teste funcional direto de calendar_preview.');
}

console.log('\n======================================================');
console.log('TODOS OS TESTES V7.4 PASSARAM COM SUCESSO! 🎉');
console.log('======================================================\n');

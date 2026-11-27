import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeContractMarkers } from '../js/contract-fields.js';
import { createCRM } from '../js/crm.js';

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {},
    querySelector: () => null,
    getElementById: () => null
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {}
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const crmJs = fs.readFileSync(path.join(root, 'js/crm.js'), 'utf8');
const calJs = fs.readFileSync(path.join(root, 'js/calendar-v6.js'), 'utf8');
const onbJs = fs.readFileSync(path.join(root, 'js/onboarding-v67.js'), 'utf8');
const sql39 = fs.readFileSync(path.join(root, 'sql/39_upgrade_v864_crm_fiche_and_fixes.sql'), 'utf8');

console.log('=== Iniciando Testes V8.6.4: Resolução dos 11 Bugs Abertos ===\n');

// 1. D01: Formulário "Editar dados" gravou o endereço de outra aluna
console.log('1. Testando D01 (Formulário Editar dados com autocomplete off e nome do aluno)...');
{
  assert.ok(appJs.includes('formTitle=id?`Editar aluno — ${safe(s.full_name||\'Cadastro\')}`:\'Novo aluno\''), 'D01: studentForm deve exibir o nome do aluno no título do modal');
  assert.ok(appJs.includes('if(id&&!s){toast(\'Aluno não encontrado para edição.\',true);return;}'), 'D01: studentForm deve validar se aluno existe antes de abrir modal com dados em branco');
  assert.ok(appJs.includes('<form id="studentForm" data-id="${id||\'\'}" autocomplete="off">'), 'D01: studentForm deve ter autocomplete="off" para evitar que o navegador preencha dados de outro aluno');
  assert.ok(appJs.includes('const targetStudent=lookup(\'students\',f.dataset.id);') && appJs.includes('if(!targetStudent)throw new Error(\'Aluno não encontrado para atualização.\');'), 'D01: Submit deve conferir se o aluno alvo existe');
  assert.ok(appJs.includes('const subBtn=f.querySelector(\'button[type="submit"]\');') && appJs.includes('subBtn.disabled=true;'), 'D01: Submit deve desabilitar botão durante salvamento para evitar cliques duplos simultâneos');
  console.log('✓ D01 validado com sucesso.');
}

// 2. D09: A tela "Conectando aos serviços…" trava e só sai recarregando
console.log('2. Testando D09 (Proteção contra travamento na tela de boot e unhandledrejection)...');
{
  assert.ok(indexHtml.includes("window.addEventListener('unhandledrejection'"), 'D09: index.html deve capturar promessas rejeitadas na inicialização');
  assert.ok(indexHtml.includes('Demorando mais do que o esperado') && indexHtml.includes('16000'), 'D09: index.html deve exibir card de recuperação após timeout estendido de 16s');
  assert.ok(appJs.includes('const ensureBootCleared=') && appJs.includes('ensureBootCleared();return;'), 'D09: app.js deve garantir que #app não fique abandonado na tela .boot');
  assert.ok((indexHtml.includes('app.js?v=8.7.0') || indexHtml.includes('app.js?v=8.6.4')), 'D09: index.html deve carregar app.js?v=8.6.4');
  assert.ok((appJs.includes('./crm.js?v=8.7.0') || appJs.includes('./crm.js?v=8.6.4')) && (appJs.includes('./calendar-v6.js?v=8.7.0') || appJs.includes('./calendar-v6.js?v=8.6.4')), 'D09: app.js deve usar v=8.6.4');
  console.log('✓ D09 validado com sucesso.');
}

// 3. D03: O perfil do aluno não exibe o CEP
console.log('3. Testando D03 (Exibição de CEP no perfil do aluno e responsável)...');
{
  assert.ok(appJs.includes("const formatCEP=v=>{if(!v)return '';const d=onlyDigits(v);return d.length===8?`${d.slice(0,5)}-${d.slice(5)}`:v;};"), 'D03: app.js deve ter helper formatCEP');
  assert.ok(appJs.includes("${info('CEP',s.cep?formatCEP(s.cep):'—')}"), 'D03: Dados cadastrais no perfil do aluno devem exibir o CEP');
  assert.ok(appJs.includes("s.guardian_cep?info('CEP responsável',formatCEP(s.guardian_cep)):''"), 'D03: Se menor de idade, dados do responsável devem exibir o CEP do responsável');
  console.log('✓ D03 validado com sucesso.');
}

// 4. D16: Rota hash desconhecida não tem tela padrão e mantém o conteúdo anterior
console.log('4. Testando D16 (Fallback seguro para rotas desconhecidas)...');
{
  assert.ok(appJs.includes("// Rota desconhecida (D16): voltar com seguranca para visao geral") && appJs.includes("ui.page='dashboard';"), 'D16: applyPanelRouteFromHash deve voltar para dashboard em rotas não mapeadas');
  const hashMatches = (appJs.match(/window\.addEventListener\('hashchange'/g) || []).length;
  assert.equal(hashMatches, 1, 'D16: Deve haver apenas um listener de hashchange deduplicado em app.js');
  console.log('✓ D16 validado com sucesso.');
}

// 5. D17: Validação do modelo de contrato exibe "30/2 campos base obrigatórios encontrados"
console.log('5. Testando D17 (Contagem de assinaturas e campos base no relatório do modelo)...');
{
  const tpl = '<p><<contratante_nome/contratante>> <<contratante_nome/contratante>> <<curso/contratado>> <<valor_total/contratado>></p><p><<assinatura/contratante>> <<assinatura/contratado>></p>';
  const report = analyzeContractMarkers(tpl, 'individual');
  assert.equal(report.sigFound, 2, 'D17: Deve contar 2 assinaturas obrigatórias encontradas');
  assert.equal(report.requiredCount, 2, 'D17: requiredCount deve ser 2');
  assert.equal(report.baseFound, 3, 'D17: Deve contar 3 campos base distintos (contratante_nome, curso, valor_total), não 4');
  assert.ok(appJs.includes('const sigBadge=`${report.sigFound??2}/${report.requiredCount||2} assinaturas obrigatórias`;'), 'D17: app.js deve exibir contagem de assinaturas obrigatórias (ex.: 2/2)');
  assert.ok(appJs.includes('const baseBadge=report.baseFound?` · ${report.baseFound} campo(s) base identificado(s)`:\'\';'), 'D17: app.js deve exibir campos base identificados separadamente');
  console.log('✓ D17 validado com sucesso.');
}

// 6. D20: A aba do CRM fica salva e a lista vazia parece "sem leads"
console.log('6. Testando D20 (Reset da aba do CRM e botão para ver leads em andamento)...');
{
  const mockCRM = createCRM({
    sb: {}, db: { crm_pipeline_columns: [], crm_tags: [], leads: [], interviews: [], profiles: [], teachers: [] },
    ui: { schoolId: 'test-school', page: 'leads', user: { id: 'test' } },
    save: async () => {}, refresh: async () => {}, showModal: () => {}, closeModal: () => {}, toast: () => {},
    errors: () => {}, lookup: () => null, ficheCreatedPopup: () => {}, createInterviewInviteLink: () => '',
    startBusy: () => {}, finishBusy: () => {}, isBusy: () => false, saveInterview: async () => {},
    getCalendar: () => null, resolveSchoolAdminsList: () => []
  });
  assert.equal(typeof mockCRM.resetTab, 'function', 'D20: createCRM deve exportar a função resetTab()');
  mockCRM.resetTab();
  assert.ok(crmJs.includes("resetTab:()=>{state.tab='open';}"), 'D20: resetTab deve redefinir state.tab para open');
  assert.ok(crmJs.includes('Ver leads em andamento'), 'D20: Quando a aba estiver vazia, deve oferecer botão para ver leads em andamento');
  assert.ok(appJs.includes("if(page==='leads')crm.resetTab?.();"), 'D20: Navegar pelo menu para leads deve acionar resetTab()');
  console.log('✓ D20 validado com sucesso.');
}

// 7. M04: A importação de alunos por CSV não gravava os dados do responsável
console.log('7. Testando M04 (Mapeamento de colunas de responsável no CSV)...');
{
  assert.ok(onbJs.includes("'responsavel_nome'") && onbJs.includes("'responsavel_cpf'") && onbJs.includes("'responsavel_telefone'"), 'M04: baseFields deve incluir todas as colunas de responsável');
  assert.ok(onbJs.includes("nome_responsavel") && onbJs.includes("responsavel_legal") && onbJs.includes("pai_mae"), 'M04: Deve reconhecer sinônimos de cabeçalho de responsável');
  assert.ok(onbJs.includes("responsavel_nome:s.guardian_name||''"), 'M04: studentCSVRow deve mapear guardian_name e outros campos de responsável');
  console.log('✓ M04 validado com sucesso.');
}

// 8. D08: Salvar o orçamento de uma ficha arquivada gera o erro crm_activities_kind_check
console.log('8. Testando D08 (Permitir kind fiche em crm_activities e fallback seguro)...');
{
  assert.ok(crmJs.includes("fiche:{icon:'fileText',label:'Orçamento',badge:'primary'}"), 'D08: kindMeta deve suportar fiche com rótulo Orçamento');
  assert.ok(crmJs.includes("log crm_activities falhou com kind=") && crmJs.includes("kind:'system'"), 'D08: log em crm.js deve conter fallback seguro em caso de erro na restrição de kind');
  assert.ok(sql39.includes("crm_activities_kind_check") && sql39.includes("'fiche'::text"), 'D08: Migration SQL 39 deve atualizar crm_activities_kind_check para aceitar fiche');
  console.log('✓ D08 validado com sucesso.');
}

// 9. D13: Cadastro de horário individual leva de 10 a 14 segundos por horário
console.log('9. Testando D13 (Uso de reloadCalendarOnly para evitar refresh global pesado)...');
{
  assert.ok(calJs.includes("if(f.id==='calSlotForm'){") && calJs.includes("toast('Horário criado.');return reloadCalendarOnly();"), 'D13: calSlotForm deve chamar reloadCalendarOnly() em vez de refresh() completo');
  assert.ok(calJs.includes("if(f.id==='calBulkSlotForm'){") && calJs.includes("return reloadCalendarOnly();"), 'D13: calBulkSlotForm também deve usar reloadCalendarOnly()');
  console.log('✓ D13 validado com sucesso.');
}

// 10. D21: O aviso de "cadastro incompleto" ao baixar a planilha de matrículas não deixa o aluno visível de imediato
console.log('10. Testando D21 (Bloco de alunos incompletos aberto por padrão e nomes visíveis no resumo)...');
{
  assert.ok(onbJs.includes('class="onb-mapping onb-incomplete-details" open'), 'D21: details de alunos incompletos deve vir open por padrão');
  assert.ok(onbJs.includes('<strong>⚠ ${pend.length} aluno(s) com aviso de cadastro incompleto:</strong>'), 'D21: O summary deve destacar a contagem e listar alunos e pendências');
  console.log('✓ D21 validado com sucesso.');
}

// 11. D15: Telefone internacional bloqueava a linha na importação de alunos
console.log('11. Testando D15 (Aceitação de telefone internacional +DDI)...');
{
  assert.ok(onbJs.includes("if(raw.startsWith('+'))return d.length>=7&&d.length<=15;"), 'D15: validPhone deve aceitar telefones iniciando em + com 7 a 15 dígitos');
  assert.ok(appJs.includes("if(trimmed.startsWith('+')){") && appJs.includes("return '+'+digits;"), 'D15: normalizeStudentPhone deve preservar o prefixo + e os dígitos');
  console.log('✓ D15 validado com sucesso.');
}

// 12. Validação ativa no Supabase (se token disponível)
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (token) {
  console.log('12. Validando restrição crm_activities_kind_check diretamente no banco Supabase...');
  const res = await fetch('https://api.supabase.com/v1/projects/tyxmskdgbnrcaacwwkhi/database/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'crm_activities_kind_check';`
    })
  });
  assert.ok(res.ok, 'Consulta no Supabase deve retornar HTTP 200');
  const rows = await res.json();
  assert.ok(rows.length > 0 && rows[0].def.includes("'fiche'"), 'crm_activities_kind_check no banco deve conter o tipo fiche');
  console.log('✓ Restrição crm_activities_kind_check conferida no Supabase: contém tipo fiche!');
}

console.log('\n======================================================');
console.log('TODOS OS 11 BUGS FORAM CORRIGIDOS E TESTADOS COM SUCESSO! 🎉');
console.log('======================================================\n');

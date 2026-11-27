import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('=== Iniciando Testes V8.7.1: Matrícula em Andamento (Correções e Implantação) ===\n');

// 1. Verificações do SQL de Migração (40_upgrade_v87_ongoing_enrollment.sql)
console.log('1. Verificando estrutura do SQL v8.7...');
const sqlFile = path.join(root, 'sql', '40_upgrade_v87_ongoing_enrollment.sql');
assert.ok(fs.existsSync(sqlFile), 'Arquivo 40_upgrade_v87_ongoing_enrollment.sql deve existir');
const sql = fs.readFileSync(sqlFile, 'utf8');

assert.ok(sql.includes('overflow_policy') && sql.includes('overflow_makeup_days') && sql.includes('onboarding_cutover_date'), 'SQL deve conter colunas de configuração em school_settings');
assert.ok(sql.includes('enrollment_origin') && sql.includes('schedule_from_date') && sql.includes('lessons_done_before'), 'SQL deve conter colunas em contracts');
assert.ok(sql.includes('makeup_deadline') && sql.includes('calendar_lessons_origin_check'), 'SQL deve conter colunas em calendar_lessons');
assert.ok(sql.includes('is_historical') && sql.includes('calendar_blocks_source_check'), 'SQL deve conter colunas em calendar_blocks');
assert.ok(sql.includes('FUNCTION public.calendar_estimate_remaining'), 'SQL deve conter RPC calendar_estimate_remaining');
assert.ok(sql.includes('FUNCTION public.adjust_ongoing_enrollment'), 'SQL deve conter RPC adjust_ongoing_enrollment');
assert.ok(sql.includes('FUNCTION public.calendar_create_block'), 'SQL deve conter RPC calendar_create_block');
assert.ok(sql.includes('FUNCTION public.calendar_preview'), 'SQL deve conter atualização de calendar_preview');
assert.ok(sql.includes('FUNCTION public.calendar_seed_contract'), 'SQL deve conter atualização de calendar_seed_contract');
console.log('✓ SQL v8.7 verificado com sucesso.');

// 2. Verificações em js/calendar-v6.js
console.log('2. Verificando js/calendar-v6.js...');
const calJs = fs.readFileSync(path.join(root, 'js', 'calendar-v6.js'), 'utf8');
assert.ok(calJs.includes("'Semana sem aula'"), 'calendar-v6.js deve incluir Semana sem aula nos motivos de bloqueio');
assert.ok(calJs.includes('isHist') && calJs.includes('Histórico'), 'calendar-v6.js deve identificar e sinalizar bloqueios históricos');
assert.ok(calJs.includes('calBlocksPeriodSelect') && calJs.includes('blocksFilter'), 'calendar-v6.js deve incluir filtro de períodos para bloqueios históricos e ativos');
assert.ok(calJs.includes('element.id===\'calBlocksPeriodSelect\'') || calJs.includes('element.id === \'calBlocksPeriodSelect\''), 'D26: change() deve tratar calBlocksPeriodSelect');
assert.ok(calJs.includes('loadHistoricalBlocks'), 'D26: calendar deve carregar blocos históricos ao selecionar período Passados/Todos');
assert.ok(calJs.includes('newBlock(defaultFrom=today(),defaultTo=today()'), 'calendar-v6.js deve expor newBlock com parâmetros de data');
assert.ok(calJs.includes('doneBefore') && calJs.includes('Antes da implantação'), 'calendar-v6.js deve exibir card métrico de aulas realizadas antes da implantação');
assert.ok(calJs.includes('overflow') || calJs.includes('after_end') || calJs.includes('makeup'), 'calendar-v6.js deve tratar aulas excedentes/após término');
assert.ok(calJs.includes('const isOngoing=f.elements.enrollment_origin?.value===\'ongoing\'') && calJs.includes('if(out)out.textContent='), 'D27: previewForm não deve sobrescrever end_date quando for ongoing');
assert.ok(calJs.includes('plan,') || calJs.includes('plan:'), 'calendar-v6.js deve exportar plan para prévia da etapa de revisão');
console.log('✓ calendar-v6.js verificado com sucesso.');

// 3. Verificações em js/onboarding-v67.js e js/csv.js
console.log('3. Verificando js/onboarding-v67.js e js/csv.js...');
const onbJs = fs.readFileSync(path.join(root, 'js', 'onboarding-v67.js'), 'utf8');
assert.ok(onbJs.includes("tipo==='em_andamento'") || onbJs.includes("tipo === 'em_andamento'"), 'onboarding-v67.js deve reconhecer tipo em_andamento');
assert.ok(onbJs.includes('agendar_aulas_a_partir_de') && onbJs.includes('aulas_restantes'), 'onboarding-v67.js deve processar agendar_aulas_a_partir_de e aulas_restantes');
assert.ok(onbJs.includes('destino_excedentes') && onbJs.includes('prazo_reposicao_dias'), 'onboarding-v67.js deve processar política de excedentes e prazos de reposição');
assert.ok(onbJs.includes('onbDownloadOngoingTemplate') && onbJs.includes('onbDownloadDuoOngoingTemplate'), 'onboarding-v67.js deve fornecer botões de download de modelos de matrícula em andamento');

const csvJs = fs.readFileSync(path.join(root, 'js', 'csv.js'), 'utf8');
assert.ok(csvJs.includes('dt.getUTCFullYear()!==y') && csvJs.includes('dt.getUTCDate()!==d'), 'D23: isoDate deve validar componentes e rejeitar rollover de data inexistente (ex: 31/02)');
console.log('✓ onboarding-v67.js e csv.js verificados com sucesso.');

// 4. Verificações em js/utils.js
console.log('4. Verificando js/utils.js...');
const utilsJs = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
assert.ok(utilsJs.includes('export const safeAttr='), 'D25: utils.js deve exportar safeAttr');
console.log('✓ utils.js verificado com sucesso.');

// 5. Verificações em js/app.js
console.log('5. Verificando js/app.js...');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
assert.ok(appJs.includes('import {$,$$,safe,safeAttr,'), 'D25: app.js deve importar safeAttr de utils.js');
assert.ok(appJs.includes('settings-enrollment-rules') && appJs.includes('Regras de matrícula e aulas'), 'app.js deve registrar aba de configurações de regras de matrícula');
assert.ok(appJs.includes("['settings-enrollment-rules','calendar','Regras de aulas']"), 'app.js deve listar regras de matrícula na sidebar de configurações');
assert.ok(appJs.includes('function settingsEnrollmentRulesPanel'), 'app.js deve conter painel de regras de matrícula e aulas');
assert.ok(appJs.includes('value="ongoing"') && appJs.includes('matrícula em andamento'), 'app.js studentForm deve conter opção de matrícula em andamento');
assert.ok(appJs.includes('data-action="manualOngoingEnrollment"'), 'Princípio de Produto: perfil do aluno deve ter botão próprio para Cadastrar matrícula em andamento');
assert.ok(appJs.includes("action==='manualOngoingEnrollment'"), 'app.js deve tratar clique em manualOngoingEnrollment');
assert.ok(appJs.includes('function renderOngoingReviewStep'), 'Etapa 2: app.js deve implementar revisão antes de ativar matrícula em andamento');
assert.ok(appJs.includes('function estimateOngoingBalance'), 'app.js deve calcular e estimar saldo de aulas restantes');
assert.ok(appJs.includes('function setupManualOngoingHandlers'), 'app.js deve configurar handlers reativos no manualEnrollmentForm');
assert.ok(appJs.includes('isOngoing') && appJs.includes('schedule_from_date'), 'app.js manualEnrollmentForm deve persistir schedule_from_date e remaining_lessons');
assert.ok(appJs.includes('remaining_source') && appJs.includes('estimate_memory'), 'D29: app.js deve persistir remaining_source e estimate_memory no contrato');
assert.ok(appJs.includes('attachOriginalPdfModal') && appJs.includes('adjustOngoingBalanceModal'), 'app.js deve conter modais de anexo de PDF e ajuste de saldo');
assert.ok(appJs.includes("action==='adjustOngoingBalance'") && appJs.includes("action==='attachOriginalPdf'"), 'app.js deve escutar ações de ajuste e anexo de PDF');
assert.ok(appJs.includes("f.id==='adjustBalanceForm'") && appJs.includes("f.id==='attachOriginalPdfForm'") && appJs.includes("f.id==='enrollmentRulesForm'"), 'app.js deve processar submissões de adjustBalanceForm, attachOriginalPdfForm e enrollmentRulesForm');
assert.ok(appJs.includes('onConflict:\'school_id\'') || appJs.includes("onConflict: 'school_id'"), 'app.js deve salvar regras da escola usando upsert com onConflict: school_id');
assert.ok(appJs.includes('Em andamento'), 'app.js deve renderizar pill "Em andamento" em contratos e matrículas');
console.log('✓ app.js verificado com sucesso.');

// 6. Verificações de Cache-Busting v8.7.1
console.log('6. Verificando cache-busting v8.7.1...');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('app.js?v=8.7.1'), 'index.html deve referenciar app.js?v=8.7.1');
assert.ok(indexHtml.includes('style.css?v=8.7.1'), 'index.html deve referenciar style.css?v=8.7.1');
assert.ok(appJs.includes('./crm.js?v=8.7.1'), 'app.js deve importar crm.js?v=8.7.1');
assert.ok(appJs.includes('./calendar-v6.js?v=8.7.1'), 'app.js deve importar calendar-v6.js?v=8.7.1');
assert.ok(calJs.includes('./calendar-week-picker.js?v=8.7.1'), 'calendar-v6.js deve importar calendar-week-picker.js?v=8.7.1');
console.log('✓ Cache-busting v8.7.1 validado com sucesso.');

// 7. Teste funcional de unidade para D23 (datas inexistentes)
console.log('7. Testando funcionalidade unitária de D23 (isoDate)...');
import { isoDate } from '../js/csv.js';
assert.strictEqual(isoDate('31/02/2027'), 'INVALID_DATE', '31/02/2027 deve retornar INVALID_DATE');
assert.strictEqual(isoDate('29/02/2027'), 'INVALID_DATE', '29/02/2027 (ano não bissexto) deve retornar INVALID_DATE');
assert.strictEqual(isoDate('29/02/2028'), '2028-02-29', '29/02/2028 (ano bissexto) deve ser aceito');
assert.strictEqual(isoDate('31/01/2027'), '2027-01-31', '31/01/2027 deve ser aceito');
console.log('✓ D23 validado com sucesso.');

console.log('\n======================================================');
console.log('TODAS AS ESPECIFICAÇÕES E CORREÇÕES DA V8.7.1 FORAM VALIDADAS COM SUCESSO! 🎉');
console.log('======================================================\n');

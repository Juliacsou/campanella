// Testes de regressao para Planos de Uso, Limites de Capacidade e Adicionais (V7.2)
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {execSync} from 'node:child_process';
import vm from 'node:vm';

const base = new URL('../', import.meta.url);
const get = p => readFileSync(new URL(p, base), 'utf8');

console.log('0. Validando sintaxe de todos os arquivos JS do projeto...');
for (const f of readdirSync(new URL('js/', base))) {
  if (f.endsWith('.js')) {
    execSync(`node --check js/${f}`, {stdio: 'pipe'});
  }
}

const sqlLicencas = get('sql/08_upgrade_licencas.sql');
const sqlPlanos = get('sql/24_upgrade_v72_planos_limites_licencas.sql');
const app = get('js/app.js');

console.log('1. Validando estrutura SQL do arquivo 24...');

// Verificações das colunas adicionadas
assert.match(sqlPlanos, /ALTER TABLE public\.school_licenses\s+ADD COLUMN IF NOT EXISTS plan text/, 'Coluna plan em school_licenses ausente');
assert.match(sqlPlanos, /ADD COLUMN IF NOT EXISTS extra_students_packs integer/, 'Coluna extra_students_packs em school_licenses ausente');
assert.match(sqlPlanos, /ADD COLUMN IF NOT EXISTS extra_teachers integer/, 'Coluna extra_teachers em school_licenses ausente');

assert.match(sqlPlanos, /ALTER TABLE public\.license_keys\s+ADD COLUMN IF NOT EXISTS plan text/, 'Coluna plan em license_keys ausente');
assert.match(sqlPlanos, /ALTER TABLE public\.school_renewal_keys\s+ADD COLUMN IF NOT EXISTS plan text/, 'Coluna plan em school_renewal_keys ausente');

// Verificação dos planos aceitos na constraint
assert.match(sqlPlanos, /'crm',\s*'essencial',\s*'profissional',\s*'avancado',\s*'ilimitado'/, 'Check constraint de planos incorreta');

// Verificação das funções e RPCs
for (const fn of [
  'get_school_plan_limits',
  'count_active_school_students',
  'count_active_school_teachers',
  'get_school_license_limits',
  'enforce_plan_tools_restriction',
  'enforce_teacher_plan_limits',
  'enforce_student_plan_limits',
  'issue_license_key',
  'activate_school_license',
  'issue_school_renewal_key',
  'redeem_school_renewal_key',
  'manage_school_license'
]) {
  assert.match(sqlPlanos, new RegExp(`(?:FUNCTION|FUNCTION public|public\\.)\\s*(?:public\\.)?${fn}\\s*\\(`, 'i'), `RPC/Função ${fn} ausente no SQL`);
}

// Verificação de triggers criados
assert.match(sqlPlanos, /CREATE TRIGGER enforce_plan_tools_restriction/, 'Trigger enforce_plan_tools_restriction ausente');
assert.match(sqlPlanos, /CREATE TRIGGER enforce_teacher_plan_limits/, 'Trigger enforce_teacher_plan_limits ausente');
assert.match(sqlPlanos, /CREATE TRIGGER enforce_student_plan_limits/, 'Trigger enforce_student_plan_limits ausente');

console.log('2. Validando integridade das constantes de planos no JS...');

// Extrair e executar as regras de cálculo do app.js em contexto isolado
assert.ok(app.includes('PLAN_CONFIGS'), 'Constante PLAN_CONFIGS ausente em app.js');
assert.ok(app.includes('ADDON_PRICES'), 'Constante ADDON_PRICES ausente em app.js');
assert.ok(app.includes('schoolPlanLimits'), 'Função schoolPlanLimits ausente em app.js');

// Cria sandbox para testar funções puras de planos
const sandbox = {
  console,
  today: () => '2026-11-11',
  dateBR: s => s ? s.slice(8) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '',
  db: { students: [], teachers: [], contracts: [] }
};
vm.createContext(sandbox);

// Executa bloco do app que define PLAN_CONFIGS e funções de cálculo
const planBlockStart = app.indexOf('const PLAN_CONFIGS');
const planBlockEnd = app.indexOf('function currentSchoolActiveStudentsCount', planBlockStart);
assert.ok(planBlockStart > 0 && planBlockEnd > planBlockStart, 'Bloco de definicao de planos nao encontrado');

vm.runInContext(app.slice(planBlockStart, planBlockEnd) + `
function testCalculateLimits(license) {
  return schoolPlanLimits(license);
}
`, sandbox);

// Testar regras do plano CRM
const crm = sandbox.testCalculateLimits({ plan: 'crm', extra_students_packs: 0, extra_teachers: 0 });
assert.equal(crm.plan, 'crm');
assert.equal(crm.crmOnly, true);
assert.equal(crm.basePrice, 69);
assert.equal(crm.monthlyPrice, 69);
assert.equal(crm.maxStudents, 0);
assert.equal(crm.maxTeachers, 0);

// Testar regras do plano Essencial (30 alunos + 3 profs, R$ 129)
const essencial = sandbox.testCalculateLimits({ plan: 'essencial', extra_students_packs: 0, extra_teachers: 0 });
assert.equal(essencial.plan, 'essencial');
assert.equal(essencial.crmOnly, false);
assert.equal(essencial.basePrice, 129);
assert.equal(essencial.monthlyPrice, 129);
assert.equal(essencial.maxStudents, 30);
assert.equal(essencial.maxTeachers, 3);

// Testar upgrades no Essencial (+10 alunos e +1 professor)
// +1 pack de alunos (10) = R$ 15
// +2 professores extras = R$ 20
// Mensalidade = 129 + 15 + 20 = 164
const essencialComAddons = sandbox.testCalculateLimits({ plan: 'essencial', extra_students_packs: 1, extra_teachers: 2 });
assert.equal(essencialComAddons.maxStudents, 40);
assert.equal(essencialComAddons.maxTeachers, 5);
assert.equal(essencialComAddons.monthlyPrice, 164);

// Testar regras do plano Profissional (50 alunos + 5 profs, R$ 179)
const profissional = sandbox.testCalculateLimits({ plan: 'profissional', extra_students_packs: 0, extra_teachers: 0 });
assert.equal(profissional.plan, 'profissional');
assert.equal(profissional.basePrice, 179);
assert.equal(profissional.monthlyPrice, 179);
assert.equal(profissional.maxStudents, 50);
assert.equal(profissional.maxTeachers, 5);

// Testar regras do plano Avançado (100 alunos + 10 profs, R$ 279)
const avancado = sandbox.testCalculateLimits({ plan: 'avancado', extra_students_packs: 2, extra_teachers: 1 });
assert.equal(avancado.plan, 'avancado');
assert.equal(avancado.basePrice, 279);
// 279 + (2 * 15) + (1 * 10) = 279 + 30 + 10 = 319
assert.equal(avancado.monthlyPrice, 319);
assert.equal(avancado.maxStudents, 120);
assert.equal(avancado.maxTeachers, 11);

console.log('3. Validando bloqueios e interface no frontend...');

assert.ok(app.includes('planUpgradeBlockedView'), 'Tela planUpgradeBlockedView ausente em app.js');
assert.ok(app.includes('p_plan'), 'Parametro p_plan ausente nas chamadas RPC em app.js');
assert.ok(app.includes('p_extra_students_packs'), 'Parametro p_extra_students_packs ausente nas chamadas RPC em app.js');
assert.ok(app.includes('p_extra_teachers'), 'Parametro p_extra_teachers ausente nas chamadas RPC em app.js');

console.log('OK: V7.2 Planos e Limites de Licenças testados com sucesso.');

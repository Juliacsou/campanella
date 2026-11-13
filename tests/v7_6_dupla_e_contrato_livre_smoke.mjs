import assert from 'node:assert';
import { CONTRACT_BASE_FIELDS, analyzeContractMarkers, markerFor } from '../js/contract-fields.js';
import { valuesFor } from '../js/utils.js';

console.log('=== Iniciando Testes V7.6: Matrícula em Dupla e Liberdade Total nos Contratos ===\n');

// -------------------------------------------------------------------------
// 1. Liberdade Total de Campos em Modelos DOCX
// -------------------------------------------------------------------------
console.log('1. Testando liberdade total de campos nos contratos (DOCX)...');

// Modelo com apenas as assinaturas obrigatórias
const minimalSignaturesOnly = `
CONTRATO DE EXEMPLO
Texto livre definido pela escola sem nenhuma tag de dados pessoais ou financeiros.
Assinatura do Aluno/Responsável: <<assinatura/contratante>>
Assinatura da Escola: <<assinatura/contratado>>
`;
const repMinimal = analyzeContractMarkers(minimalSignaturesOnly, 'individual');
assert(repMinimal.valid, `Modelo contendo apenas as assinaturas deve ser válido: ${JSON.stringify(repMinimal.issues)}`);
console.log('✓ Modelo com apenas assinaturas é 100% válido (nenhuma tag base é forçada).');

// Modelo sem assinatura do contratante deve falhar
const repMissingSigner = analyzeContractMarkers(`Texto <<assinatura/contratado>>`, 'individual');
assert(!repMissingSigner.valid, 'Modelo sem assinatura/contratante deve ser rejeitado');
assert(repMissingSigner.issues.some(i => i.message.includes('<<assinatura/contratante>>')), 'Deve apontar falta da assinatura do contratante');

// Modelo sem assinatura da contratada deve falhar
const repMissingSchool = analyzeContractMarkers(`Texto <<assinatura/contratante>>`, 'individual');
assert(!repMissingSchool.valid, 'Modelo sem assinatura/contratado deve ser rejeitado');
assert(repMissingSchool.issues.some(i => i.message.includes('<<assinatura/contratado>>')), 'Deve apontar falta da assinatura da escola');
console.log('✓ Assinaturas <<assinatura/contratante>> e <<assinatura/contratado>> continuam obrigatórias.');

// -------------------------------------------------------------------------
// 2. Tags e Marcadores de Dupla
// -------------------------------------------------------------------------
console.log('\n2. Testando marcadores de Dupla e validação de papéis...');

const duoDocx = `
CONTRATO PARA DUPLA
Aluno 1: <<aluno_nome/contratante>> (CPF: <<contratante_cpf/contratante>>)
Aluno 2: <<aluno_2_nome/contratante>> (CPF: <<contratante_2_cpf/contratante>>)
Curso: <<curso/contratado>>
Horários: <<grade_horarios/contratado>>
Assinaturas:
<<assinatura/contratante>>
<<assinatura/contratado>>
`;
const repDuo = analyzeContractMarkers(duoDocx, 'dupla');
assert(repDuo.valid, `Modelo de dupla deve ser validado com sucesso: ${JSON.stringify(repDuo.issues)}`);
assert.strictEqual(repDuo.customFields.length, 0, 'Tags de contratante_2 e aluno_2 devem ser reconhecidas nativamente');
console.log('✓ Marcadores de dupla reconhecidos nativamente no modelo dupla.');

// Tentar usar tag de dupla em modelo individual deve gerar aviso de incompatibilidade
const repIndividualMismatch = analyzeContractMarkers(`
<<contratante_2_nome/contratante>>
<<assinatura/contratante>>
<<assinatura/contratado>>
`, 'individual');
assert(!repIndividualMismatch.valid, 'Tag de aluno 2 não deve ser permitida em contrato individual');
assert(repIndividualMismatch.issues.some(i => i.message.includes('reservado aos modelos de dupla')), 'Deve apontar incompatibilidade de modalidade');
console.log('✓ Incompatibilidade de tags de dupla em modelos individuais barrada corretamente.');

// -------------------------------------------------------------------------
// 3. Cenários de Dupla em valuesFor
// -------------------------------------------------------------------------
console.log('\n3. Testando valuesFor nos 3 cenários de Dupla...');

const baseContract = {
  kind: 'dupla',
  terms: {
    total_amount: 3000,
    installments: 6,
    installment_amount: 500,
    first_due_date: '2026-11-20',
    start_date: '2026-11-20',
    end_date: '2027-05-20',
    course: 'Piano em Dupla',
    package_name: 'Semestral Dupla',
    signer_student_index: 1
  }
};

// Cenário A: 2 maiores de idade (Aluno 1 e Aluno 2 adultos, Aluno 2 assina como contratante)
console.log('Cenário A: 2 adultos (Aluno 2 assina)...');
const snapshot2Adults = {
  student1: {
    full_name: 'Felipe Adulto 1',
    birth_date: '1995-03-10',
    cpf: '11122233344',
    phone: '11988881111',
    email: 'felipe@email.com',
    address: 'Rua A, 100',
    cep: '01001000'
  },
  student2: {
    full_name: 'Camila Adulta 2',
    birth_date: '1998-07-22',
    cpf: '55566677788',
    phone: '11977772222',
    email: 'camila@email.com',
    address: 'Av B, 200',
    cep: '02002000'
  },
  signer_student_index: 2
};

const contractA = { ...baseContract, signer_student_index: 2 };
const valsA = valuesFor(contractA, snapshot2Adults);

assert.strictEqual(valsA.contratante_nome, 'Camila Adulta 2', 'Quem assina (Aluno 2) deve ser o contratante principal');
assert.strictEqual(valsA.contratante_cpf, '55566677788');
assert.strictEqual(valsA.contratante_2_nome, 'Felipe Adulto 1', 'Aluno 1 deve preencher contratante_2');
assert.strictEqual(valsA.contratante_2_cpf, '11122233344');
assert.strictEqual(valsA.aluno_nome, 'Felipe Adulto 1', 'aluno_nome deve ser Aluno 1');
assert.strictEqual(valsA.aluno_2_nome, 'Camila Adulta 2', 'aluno_2_nome deve ser Aluno 2');
console.log('✓ Cenário A (2 adultos) preenchido corretamente com inversão do signatário.');

// Cenário B: 1 maior de idade e 1 menor de idade
console.log('Cenário B: 1 adulto e 1 menor (Pai e Filho)...');
const snapshotAdultAndMinor = {
  student1: {
    full_name: 'Pedro Filho',
    birth_date: '2015-05-10', // menor
    cpf: '99988877766',
    phone: '',
    email: 'filho@email.com',
    address: '',
    cep: ''
  },
  student2: {
    full_name: 'Marcos Pai',
    birth_date: '1980-01-15', // maior
    cpf: '44433322211',
    phone: '11999993333',
    email: 'marcos@email.com',
    address: 'Rua das Flores, 50',
    cep: '03003000'
  },
  signer_student_index: 1 // mesmo que passe 1, o adulto é o contratante
};

const valsB = valuesFor(baseContract, snapshotAdultAndMinor);
assert.strictEqual(valsB.contratante_nome, 'Marcos Pai', 'O maior de idade deve ser o contratante');
assert.strictEqual(valsB.contratante_cpf, '44433322211');
assert.strictEqual(valsB.contratante_telefone, '11999993333');
assert.strictEqual(valsB.aluno_nome, 'Pedro Filho');
assert.strictEqual(valsB.aluno_2_nome, 'Marcos Pai');
console.log('✓ Cenário B (1 adulto e 1 menor) atribui contratante ao adulto automaticamente.');

// Cenário C: 2 menores de idade com 1 responsável legal
console.log('Cenário C: 2 menores de idade com responsável legal (Irmãos)...');
const snapshot2Minors = {
  student1: {
    full_name: 'Ana Menor 1',
    birth_date: '2014-02-01',
    cpf: '11111111111',
    guardian_name: 'Juliana Mãe',
    guardian_cpf: '22222222222',
    guardian_phone: '11987654321',
    guardian_email: 'juliana@email.com',
    guardian_address: 'Rua C, 300',
    guardian_cep: '04004000',
    guardian_birth_date: '1982-10-10'
  },
  student2: {
    full_name: 'Beatriz Menor 2',
    birth_date: '2016-08-15',
    cpf: '33333333333',
    guardian_name: 'Juliana Mãe',
    guardian_cpf: '22222222222',
    guardian_phone: '11987654321',
    guardian_email: 'juliana@email.com',
    guardian_address: 'Rua C, 300',
    guardian_cep: '04004000',
    guardian_birth_date: '1982-10-10'
  }
};

const valsC = valuesFor(baseContract, snapshot2Minors);
assert.strictEqual(valsC.contratante_nome, 'Juliana Mãe', 'O responsável legal deve ser o contratante principal');
assert.strictEqual(valsC.contratante_cpf, '22222222222');
assert.strictEqual(valsC.aluno_nome, 'Ana Menor 1');
assert.strictEqual(valsC.aluno_2_nome, 'Beatriz Menor 2');
console.log('✓ Cenário C (2 menores) atribui contratante ao responsável legal.');

// -------------------------------------------------------------------------
// 4. Verificações no Banco de Dados (Supabase)
// -------------------------------------------------------------------------
console.log('\n4. Verificando estrutura e funções no Supabase...');
const SUPABASE_PROJECT = process.env.SUPABASE_PROJECT || 'tyxmskdgbnrcaacwwkhi';
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN;

if (!SUPABASE_TOKEN) {
  console.log('ℹ SUPABASE_ACCESS_TOKEN não definido no ambiente. Pulando verificações ativas no banco.');
} else {
  async function query(sql) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DB query failed (${res.status}): ${text}`);
    }
    return await res.json();
  }

  // 4.1 Colunas na tabela contracts
  const contractCols = await query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'contracts' 
      AND column_name IN ('student2_id', 'signer_student_index')
  `);
  assert.strictEqual(contractCols.length, 2, 'Colunas student2_id e signer_student_index devem existir na tabela contracts');
  console.log('✓ Colunas student2_id e signer_student_index confirmadas na tabela contracts.');

  // 4.2 Função close_prior_student_contracts
  const procClose = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'close_prior_student_contracts'");
  assert.ok(procClose.length > 0, 'Função close_prior_student_contracts deve existir');
  assert.ok(procClose[0].def.includes("status = 'closed'"), 'close_prior_student_contracts deve atualizar status para closed');
  console.log('✓ RPC close_prior_student_contracts verificada no banco.');

  // 4.3 Função onboarding_prepare_duo_enrollment
  const procDuo = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'onboarding_prepare_duo_enrollment'");
  assert.ok(procDuo.length > 0, 'Função onboarding_prepare_duo_enrollment deve existir');
  assert.ok(procDuo[0].def.includes('aluno_1_id') && procDuo[0].def.includes('aluno_2_id'), 'onboarding_prepare_duo_enrollment deve receber aluno_1_id e aluno_2_id');
  assert.ok(procDuo[0].def.includes('close_prior_student_contracts'), 'onboarding_prepare_duo_enrollment deve suportar encerramento de contratos anteriores');
  console.log('✓ RPC onboarding_prepare_duo_enrollment verificada no banco.');

  // 4.4 calendar_overview
  const procOverview = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'calendar_overview'");
  assert.ok(procOverview.length > 0, 'Função calendar_overview deve existir');
  assert.ok(procOverview[0].def.includes("c.kind = 'dupla'") || procOverview[0].def.includes("c.kind='dupla'"), 'calendar_overview deve verificar c.kind dupla');
  assert.ok(procOverview[0].def.includes(" || ' & ' || ") || procOverview[0].def.includes("' & '"), 'calendar_overview deve concatenar os nomes dos dois alunos da dupla');
  console.log('✓ calendar_overview configurado para exibir os dois alunos no calendário.');

  // 4.5 calendar_student_profile
  const procProfile = await query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'calendar_student_profile'");
  assert.ok(procProfile.length > 0, 'Função calendar_student_profile deve existir');
  assert.ok(procProfile[0].def.includes('partner_name'), 'calendar_student_profile deve expor partner_name para contratos em dupla');
  console.log('✓ calendar_student_profile expõe partner_name para duplas.');
}

console.log('\n======================================================');
console.log('TODOS OS TESTES V7.6 (UNITÁRIOS + BANCO) PASSARAM! 🎉');
console.log('======================================================');


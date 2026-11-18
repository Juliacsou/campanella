import assert from 'node:assert';
import { CONTRACT_BASE_FIELDS, analyzeContractMarkers, markerFor, validateConvertedTemplate } from '../js/contract-fields.js';
import { assertCanonicalContract } from '../supabase/functions/_shared/contractFields.ts';
import { valuesFor, contractHTML } from '../js/utils.js';

console.log('=== Iniciando Testes V7.7: Repetição de Informações e Assinaturas em Contratos ===\n');

// -------------------------------------------------------------------------
// 1. Repetição de campos base (curso, nome, valor, etc.)
// -------------------------------------------------------------------------
console.log('1. Testando repetição de campos base...');

const contractWithRepeatedBaseFields = `
CONTRATO DE PRESTAÇÃO DE SERVIÇOS
Contratante: <<contratante_nome/contratante>>
Curso selecionado: <<curso/contratado>>
Valor total acordado: <<valor_total/contratado>>

CLÁUSULA 1ª - DO OBJETO
O presente instrumento tem por objeto a prestação de serviços educacionais referentes ao curso <<curso/contratado>>.
O aluno <<contratante_nome/contratante>> declara estar ciente do regulamento da escola.

CLÁUSULA 2ª - DO VALOR
O valor integral deste contrato é de <<valor_total/contratado>>, referente ao curso <<curso/contratado>>.

ASSINATURAS:
<<assinatura/contratante>>
<<assinatura/contratado>>
`;

const rep1 = analyzeContractMarkers(contractWithRepeatedBaseFields, 'individual');
assert.strictEqual(rep1.valid, true, `Modelo com campos base repetidos deve ser 100% válido: ${JSON.stringify(rep1.issues)}`);
assert.strictEqual(rep1.issues.length, 0, 'Não deve haver nenhuma pendência/erro de duplicidade');
console.log('✓ Campos base repetidos múltiplas vezes são aceitos sem erro de duplicidade.');

// -------------------------------------------------------------------------
// 2. Repetição de assinaturas (documentos com mais de uma página)
// -------------------------------------------------------------------------
console.log('\n2. Testando repetição de assinaturas para contratos com mais de uma página...');

const multiPageContractWithRepeatedSignatures = `
CONTRATO DE ADESÃO - PÁGINA 1
Aluno: <<contratante_nome/contratante>>
Curso: <<curso/contratado>>
Rubrica / Assinatura Pág 1 Contratante: <<assinatura/contratante>>
Rubrica / Assinatura Pág 1 Escola: <<assinatura/contratado>>

--- QUEBRA DE PÁGINA ---
CONTRATO DE ADESÃO - PÁGINA 2
Cláusulas gerais e rescisão...
Assinatura Final Pág 2 Contratante: <<assinatura/contratante>>
Assinatura Final Pág 2 Escola: <<assinatura/contratado>>
`;

const rep2 = analyzeContractMarkers(multiPageContractWithRepeatedSignatures, 'individual');
assert.strictEqual(rep2.valid, true, `Modelo com assinaturas repetidas por página deve ser válido: ${JSON.stringify(rep2.issues)}`);
assert.strictEqual(rep2.issues.length, 0, 'Não deve apontar duplicidade de assinaturas');
console.log('✓ Assinaturas repetidas em mais de uma página são aceitas sem erros.');

// -------------------------------------------------------------------------
// 3. Repetição de campos adicionais (custom fields)
// -------------------------------------------------------------------------
console.log('\n3. Testando repetição de campos adicionais personalizados...');

const contractWithRepeatedCustomFields = `
<<material_didatico/contratante>>
<<material_didatico/contratante>>
<<observacoes_pedagogicas/contratado>>
<<observacoes_pedagogicas/contratado>>
<<assinatura/contratante>>
<<assinatura/contratado>>
`;

const rep3 = analyzeContractMarkers(contractWithRepeatedCustomFields, 'individual');
assert.strictEqual(rep3.valid, true, `Campos adicionais repetidos devem ser válidos: ${JSON.stringify(rep3.issues)}`);
assert.strictEqual(rep3.customFields.length, 2, 'Campos adicionais repetidos devem ser consolidados (deve haver 2 campos únicos)');
console.log('✓ Campos adicionais repetidos são consolidados no schema sem duplicidade.');

// -------------------------------------------------------------------------
// 4. Cenário real idêntico ao reportado pelo usuário na imagem image.png
// -------------------------------------------------------------------------
console.log('\n4. Testando o cenário exato da imagem image.png...');

// Na imagem:
// - Campo repetido 2 vezes: <<curso/contratado>>
// - Campo repetido 2 vezes: <<contratante_nome/contratante>>
// - Campo repetido 2 vezes: <<valor_total/contratado>>
// - Assinatura obrigatória ausente: <<assinatura/contratante>>
// - Assinatura obrigatória ausente: <<assinatura/contratado>>
const userDocxWithoutSignatures = `
Curso: <<curso/contratado>>
Curso de novo: <<curso/contratado>>
Nome: <<contratante_nome/contratante>>
Nome de novo: <<contratante_nome/contratante>>
Valor: <<valor_total/contratado>>
Valor de novo: <<valor_total/contratado>>
`;

const repUserWithoutSig = analyzeContractMarkers(userDocxWithoutSignatures, 'individual');
assert.strictEqual(repUserWithoutSig.valid, false, 'Deve ser inválido apenas pela falta das assinaturas');
// Não deve ter nenhum issue de 'duplicate'
const duplicateIssues = repUserWithoutSig.issues.filter(i => i.code === 'duplicate' || i.message.includes('repetido'));
assert.strictEqual(duplicateIssues.length, 0, `Não deve reportar campos repetidos: ${JSON.stringify(duplicateIssues)}`);
// Deve apontar apenas as 2 assinaturas ausentes
const missingSigContratante = repUserWithoutSig.issues.find(i => i.key === 'assinatura_contratante');
const missingSigContratado = repUserWithoutSig.issues.find(i => i.key === 'assinatura_contratado');
assert.ok(missingSigContratante, 'Deve acusar assinatura do contratante ausente');
assert.ok(missingSigContratado, 'Deve acusar assinatura do contratado ausente');
assert.strictEqual(repUserWithoutSig.issues.length, 2, 'Devem existir apenas os 2 avisos de assinatura ausente');
console.log('✓ No caso de arquivo sem assinaturas, acusa apenas assinaturas ausentes (sem reclamar de campos repetidos).');

// Quando as assinaturas são adicionadas (mesmo repetidas):
const userDocxWithSignatures = userDocxWithoutSignatures + `
Assinatura Página 1 Contratante: <<assinatura/contratante>>
Assinatura Página 1 Escola: <<assinatura/contratado>>
Assinatura Página 2 Contratante: <<assinatura/contratante>>
Assinatura Página 2 Escola: <<assinatura/contratado>>
`;
const repUserFixed = analyzeContractMarkers(userDocxWithSignatures, 'individual');
assert.strictEqual(repUserFixed.valid, true, `Com assinaturas adicionadas, o modelo deve ficar 100% validado: ${JSON.stringify(repUserFixed.issues)}`);
console.log('✓ Com as assinaturas inseridas (inclusive repetidas por página), o modelo é validado com sucesso.');

// -------------------------------------------------------------------------
// 5. Garantir que regras fundamentais continuam sendo validadas
// -------------------------------------------------------------------------
console.log('\n5. Verificando que regras de papel e sintaxe continuam ativas...');

// Papel incorreto no campo base
const repRoleError = analyzeContractMarkers(`
<<curso/contratante>>
<<assinatura/contratante>>
<<assinatura/contratado>>
`, 'individual');
assert.strictEqual(repRoleError.valid, false);
assert.ok(repRoleError.issues.some(i => i.code === 'role'), 'Deve acusar que curso é preenchido pelo contratado');

// Papel conflitante no campo adicional
const repCustomConflict = analyzeContractMarkers(`
<<campo_extra/contratante>>
<<campo_extra/contratado>>
<<assinatura/contratante>>
<<assinatura/contratado>>
`, 'individual');
assert.strictEqual(repCustomConflict.valid, false);
assert.ok(repCustomConflict.issues.some(i => i.code === 'role' && i.message.includes('responsaveis conflitantes')), 'Deve acusar responsáveis conflitantes para o mesmo campo custom');

// Falta de uma das assinaturas
const repOneSigMissing = analyzeContractMarkers(`
<<curso/contratado>>
<<assinatura/contratante>>
`, 'individual');
assert.strictEqual(repOneSigMissing.valid, false);
assert.ok(repOneSigMissing.issues.some(i => i.key === 'assinatura_contratado'), 'Deve acusar falta da assinatura do contratado');

console.log('✓ Papéis e assinaturas obrigatórias continuam estritamente protegidos.');

// -------------------------------------------------------------------------
// 6. Testando validateConvertedTemplate (conversão DOCX -> HTML)
// -------------------------------------------------------------------------
console.log('\n6. Testando validateConvertedTemplate com repetições...');

const convertedHtmlWithRepeats = `
<div>
 <h1>Contrato {{curso}}</h1>
 <p>Aluno: {{contratante_nome}}</p>
 <p>Curso confirmado: {{curso}}</p>
 <p>Assinatura Pág 1: {{assinatura_contratante}}</p>
 <p>Assinatura Pág 1 Escola: {{assinatura_contratado}}</p>
 <p>Assinatura Pág 2: {{assinatura_contratante}}</p>
 <p>Assinatura Pág 2 Escola: {{assinatura_contratado}}</p>
</div>
`;

const convCheck = validateConvertedTemplate(convertedHtmlWithRepeats, 'individual');
assert.strictEqual(convCheck.valid, true, `Template convertido com repetições deve ser válido: ${JSON.stringify(convCheck.issues)}`);

// Sem assinatura
const convMissingSig = validateConvertedTemplate(`<div>{{curso}} {{assinatura_contratante}}</div>`, 'individual');
assert.strictEqual(convMissingSig.valid, false);
assert.ok(convMissingSig.issues.some(i => i.includes('assinatura_contratado')));

console.log('✓ validateConvertedTemplate aceita repetições e valida presença de assinaturas.');

// -------------------------------------------------------------------------
// 7. Testando assertCanonicalContract no backend (Edge Functions)
// -------------------------------------------------------------------------
console.log('\n7. Testando assertCanonicalContract no backend...');

assert.doesNotThrow(() => {
  assertCanonicalContract(convertedHtmlWithRepeats, 'individual');
}, 'assertCanonicalContract não deve disparar erro para campos ou assinaturas repetidas');

assert.throws(() => {
  assertCanonicalContract(`<div>{{curso}} {{assinatura_contratante}}</div>`, 'individual');
}, /assinaturas ausentes/, 'assertCanonicalContract deve disparar erro se faltar assinatura');

assert.throws(() => {
  assertCanonicalContract(`<div>{{curso}} <<marcador_nao_convertido/contratado>> {{assinatura_contratante}} {{assinatura_contratado}}</div>`, 'individual');
}, /marcador nao convertido/, 'assertCanonicalContract deve disparar erro se houver marcador DOCX não convertido');

console.log('✓ assertCanonicalContract permite repetições no backend perfeitamente.');

// -------------------------------------------------------------------------
// 8. Testando preenchimento de contrato (contractHTML) com múltiplos campos
// -------------------------------------------------------------------------
console.log('\n8. Testando preenchimento via contractHTML com marcadores repetidos...');

const c = {
  kind: 'individual',
  template_html: '<p>Aluno: {{contratante_nome}} | Curso: {{curso}} | Aluno de novo: {{contratante_nome}} | Curso de novo: {{curso}}</p>',
  terms: {
    school_name: 'Escola de Música',
    course: 'Bateria',
    total_amount: 1200
  }
};
const student = {
  full_name: 'Maria Eduarda'
};

const rendered = contractHTML(c, student);
assert.strictEqual(rendered, '<p>Aluno: Maria Eduarda | Curso: Bateria | Aluno de novo: Maria Eduarda | Curso de novo: Bateria</p>');
console.log('✓ Todas as ocorrências repetidas são substituídas corretamente com os dados da matrícula.');

console.log('\n======================================================');
console.log('TODOS OS TESTES V7.7 (REPETIÇÃO DE CAMPOS E ASSINATURAS) PASSARAM! 🎉');
console.log('======================================================');

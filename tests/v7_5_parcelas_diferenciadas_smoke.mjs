import assert from 'node:assert';
import { CONTRACT_BASE_FIELDS, analyzeContractMarkers, markerFor } from '../js/contract-fields.js';
import { valuesFor } from '../js/utils.js';

console.log('--- Iniciando Testes V7.5: Primeira Parcela Diferenciada e Tags Opcionais ---');

// 1. Verificar novos campos em CONTRACT_BASE_FIELDS
console.log('1. Verificando campos e marcadores opcionais no contract-fields.js...');
const newKeys = [
  'valor_primeira_parcela',
  'valor_primeira_parcela_extenso',
  'vencimento_primeira_parcela',
  'segundo_vencimento',
  'vencimento_demais_parcelas',
  'valor_demais_parcelas',
  'valor_demais_parcelas_extenso',
  'qtd_demais_parcelas'
];

for(const key of newKeys){
  const found = CONTRACT_BASE_FIELDS.find(f => f.key === key);
  assert(found, `Campo ${key} deve existir em CONTRACT_BASE_FIELDS`);
  assert(!found.required, `Campo ${key} deve ser opcional (required falsy)`);
  assert.strictEqual(found.who, 'contratado', `Campo ${key} deve pertencer a contratado`);
}
console.log('✓ Todos os novos campos existem e são estritamente opcionais.');

// 2. Validar que analyzeContractMarkers não exige as tags novas em contratos simples
console.log('2. Testando analyzeContractMarkers em modelo sem as novas tags...');
const minimalDocx = `
CONTRATO DE PRESTAÇÃO DE SERVIÇOS
Contratante: <<contratante_nome/contratante>>, CPF: <<contratante_cpf/contratante>>, Tel: <<contratante_telefone/contratante>>, End: <<contratante_endereco/contratante>>, CEP: <<contratante_cep/contratante>>, Nasc: <<contratante_data_nascimento/contratante>>, Email: <<contratante_email/contratante>>.
Contratado: <<contratado_nome/contratado>>.
Curso: <<curso/contratado>>, Pacote: <<pacote/contratado>>, Aulas: <<qtd_aulas/contratado>>.
Horários: <<grade_horarios/contratado>>.
Valor total: <<valor_total/contratado>>, Parcelas: <<parcelas/contratado>>, Parcela: <<valor_parcela/contratado>>.
Primeiro vencimento: <<primeiro_vencimento/contratado>>, Início: <<data_inicio/contratado>>, Fim: <<data_fim/contratado>>.
Forma de pagamento: <<forma_pagamento/contratado>>.

Assinaturas:
<<assinatura/contratante>>
<<assinatura/contratado>>
`;
const rep1 = analyzeContractMarkers(minimalDocx, 'individual');
assert(rep1.valid, `O modelo padrão deve continuar válido sem as tags da 1ª parcela: ${JSON.stringify(rep1.issues)}`);
console.log('✓ Modelo básico sem as tags da 1ª parcela validado com sucesso.');

// 3. Validar que analyzeContractMarkers aceita as tags novas sem confundi-las com campos personalizados
console.log('3. Testando analyzeContractMarkers com as novas tags de 1ª parcela...');
const advancedDocx = minimalDocx + `
Cláusula Financeira Especial:
Primeira parcela: <<valor_primeira_parcela/contratado>> (<<valor_primeira_parcela_extenso/contratado>>) vencendo em <<vencimento_primeira_parcela/contratado>>.
Demais <<qtd_demais_parcelas/contratado>> parcelas de <<valor_demais_parcelas/contratado>> (<<valor_demais_parcelas_extenso/contratado>>) a partir de <<vencimento_demais_parcelas/contratado>> ou <<segundo_vencimento/contratado>>.
`;
const rep2 = analyzeContractMarkers(advancedDocx, 'individual');
assert(rep2.valid, `O modelo avançado com tags de parcela deve ser aceito: ${JSON.stringify(rep2.issues)}`);
assert.strictEqual(rep2.customFields.length, 0, 'As tags novas devem ser reconhecidas como nativas, sem criar campos customizados.');
console.log('✓ Modelo com marcadores de parcela diferenciada reconhecido nativamente sem erros.');

// 4. Testar valuesFor no modo padrão (sem checkbox de entrada personalizada)
console.log('4. Testando valuesFor no modo tradicional (parcelas iguais)...');
const cStandard = {
  kind: 'individual',
  terms: {
    total_amount: 1200,
    installments: 6,
    installment_amount: 200,
    first_installment_amount: 200,
    first_due_date: '2026-11-20',
    start_date: '2026-11-20',
    end_date: '2027-05-20',
    package_name: 'Semestral'
  }
};
const v1 = valuesFor(cStandard, { full_name: 'Carlos Aluno', cpf: '12345678901' });
assert.strictEqual(v1.valor_total, 'R$\xa01.200,00');
assert.strictEqual(v1.parcelas, '6');
assert.strictEqual(v1.valor_parcela, 'R$\xa0200,00');
assert.strictEqual(v1.valor_primeira_parcela, 'R$\xa0200,00');
assert.strictEqual(v1.valor_demais_parcelas, 'R$\xa0200,00');
assert.strictEqual(v1.qtd_demais_parcelas, '5');
assert.strictEqual(v1.primeiro_vencimento, '20/11/2026');
assert.strictEqual(v1.vencimento_primeira_parcela, '20/11/2026');
assert.strictEqual(v1.segundo_vencimento, '20/12/2026');
assert.strictEqual(v1.vencimento_demais_parcelas, '20/12/2026');
console.log('✓ Modo tradicional calculado perfeitamente.');

// 5. Testar valuesFor no modo com entrada/primeira parcela diferenciada
console.log('5. Testando valuesFor com 1ª parcela diferenciada (entrada de R$ 400 + 5x R$ 160)...');
const cCustom = {
  kind: 'individual',
  terms: {
    total_amount: 1200,
    installments: 6,
    first_installment_amount: 400,
    installment_amount: 160,
    first_due_date: '2026-11-15',
    second_due_date: '2026-12-20',
    start_date: '2026-11-15',
    end_date: '2027-05-15',
    has_custom_first_installment: true
  }
};
const v2 = valuesFor(cCustom, { full_name: 'Maria Aluna', cpf: '98765432100' });
assert.strictEqual(v2.valor_total, 'R$\xa01.200,00');
assert.strictEqual(v2.parcelas, '6');
assert.strictEqual(v2.valor_primeira_parcela, 'R$\xa0400,00');
assert.strictEqual(v2.valor_demais_parcelas, 'R$\xa0160,00');
assert.strictEqual(v2.qtd_demais_parcelas, '5');
assert.strictEqual(v2.primeiro_vencimento, '15/11/2026');
assert.strictEqual(v2.vencimento_primeira_parcela, '15/11/2026');
assert.strictEqual(v2.segundo_vencimento, '20/12/2026');
assert.strictEqual(v2.vencimento_demais_parcelas, '20/12/2026');
assert(v2.valor_primeira_parcela_extenso.includes('quatrocentos reais'));
assert(v2.valor_demais_parcelas_extenso.includes('cento e sessenta reais'));
console.log('✓ Modo com parcela diferenciada preenche todas as tags com valores e datas precisos.');

console.log('\n======================================================');
console.log('TODOS OS TESTES V7.5 PASSARAM COM SUCESSO! 🎉');
console.log('======================================================');

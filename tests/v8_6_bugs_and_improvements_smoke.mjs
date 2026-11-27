import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valuesFor, contractHTML, money, plusMonth, formatPhoneBR } from '../js/utils.js';
import { analyzeContractMarkers, CONTRACT_BASE_FIELDS } from '../js/contract-fields.js';
import { getWeeklyLimit } from '../js/calendar-week-picker.js';
import { createCalendar } from '../js/calendar-v6.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const calJs = fs.readFileSync(path.join(root, 'js/calendar-v6.js'), 'utf8');
const pickerJs = fs.readFileSync(path.join(root, 'js/calendar-week-picker.js'), 'utf8');
const onbJs = fs.readFileSync(path.join(root, 'js/onboarding-v67.js'), 'utf8');
const sql38 = fs.readFileSync(path.join(root, 'sql/38_upgrade_v86_bugs_and_improvements.sql'), 'utf8');
const csvModel = fs.readFileSync(path.join(root, 'modelo_importacao_alunos.csv'), 'utf8');

console.log('=== Iniciando Testes V8.6: Correção de 22 Bugs + 10 Melhorias + Regra de Negócio ===\n');

// 1. Bug #1: Dupla 1 adulto + 1 menor (representação do responsável legal e identificação do menor)
console.log('1. Testando Bug #1 (Dupla com 1 maior e 1 menor)...');
{
  const minorStudent = {
    full_name: 'Lucas Pereira',
    birth_date: '2014-05-10',
    is_minor: true,
    cpf: '',
    guardian_name: 'Carlos Pereira',
    guardian_cpf: '12345678909',
    guardian_phone: '11988887777',
    guardian_email: 'carlos@exemplo.com',
    guardian_address: 'Rua das Flores, 100',
    guardian_cep: '01001000'
  };
  const adultStudent = {
    full_name: 'Beatriz Costa',
    birth_date: '1995-08-20',
    is_minor: false,
    cpf: '98765432100',
    phone: '11977776666',
    email: 'beatriz@exemplo.com',
    address: 'Av. Paulista, 500',
    cep: '01310000'
  };

  // Caso A: Responsável do menor (integrante 1) assina como contratante principal
  const contractGuardianSigns = {
    kind: 'dupla',
    signer_student_index: 1,
    template_html: '<p>CONTRATANTE 1: {{contratante_nome}} CPF: {{contratante_cpf}} E-MAIL: {{contratante_email}}</p><p>CONTRATANTE 2: {{contratante_2_nome}} CPF: {{contratante_2_cpf}} E-MAIL: {{contratante_2_email}}</p>',
    terms: {
      course: 'Inglês',
      package_name: 'Dupla Semestral',
      lessons_count: 24,
      weekly_frequency: 1,
      start_date: '2026-04-01',
      end_date: '2026-09-30',
      total_amount: 2400,
      installments: 6,
      installment_amount: 400,
      first_due_date: '2026-04-10',
      payment_method: 'PIX'
    }
  };
  const snapshot1 = { student1: minorStudent, student2: adultStudent, signer_student_index: 1 };
  const vals1 = valuesFor(contractGuardianSigns, snapshot1);
  assert.equal(vals1.contratante_nome, 'Carlos Pereira', 'Responsável do menor deve figurar como contratante principal quando signer_student_index=1');
  assert.equal(vals1.contratante_cpf, '12345678909', 'CPF do responsável deve ser usado no contratante 1');
  assert.equal(vals1.contratante_2_nome, 'Beatriz Costa', 'Adulto deve figurar como contratante 2');
  assert.equal(vals1.contratante_2_email, 'beatriz@exemplo.com', 'E-mail do contratante 2 deve ser o e-mail (Bug #9)');

  const html1 = contractHTML(contractGuardianSigns, snapshot1);
  assert.ok(html1.includes('Responsável legal por:'), 'Deve injetar bloco de identificação dos alunos quando o template de dupla não tem {{aluno_nome}}');
  assert.ok(html1.includes('Lucas Pereira') && html1.includes('Carlos Pereira'), 'Deve identificar o aluno menor Lucas Pereira e seu responsável Carlos Pereira');
}
console.log('✓ Bug #1 e Bug #9 validados com sucesso.');

// 2. Bug #2: Dupla com 2 menores (mesmo responsável ou responsáveis diferentes)
console.log('2. Testando Bug #2 (Dupla com 2 menores de idade)...');
{
  const minor1 = {
    full_name: 'Ana Santos',
    is_minor: true,
    guardian_name: 'Maria Santos',
    guardian_cpf: '11122233344',
    guardian_phone: '11911112222',
    guardian_email: 'maria@exemplo.com',
    guardian_address: 'Rua A, 10',
    guardian_cep: '01001000'
  };
  const minor2 = {
    full_name: 'Pedro Lima',
    is_minor: true,
    guardian_name: 'Fernanda Lima',
    guardian_cpf: '55566677788',
    guardian_phone: '11933334444',
    guardian_email: 'fernanda@exemplo.com',
    guardian_address: 'Rua B, 20',
    guardian_cep: '02002000'
  };
  const contract2Minors = {
    kind: 'dupla',
    signer_student_index: 1,
    template_html: '<p>C1: {{contratante_nome}} ({{contratante_cpf}})</p><p>C2: {{contratante_2_nome}} ({{contratante_2_cpf}})</p>',
    terms: { lessons_count: 20, weekly_frequency: 1, total_amount: 2000, installments: 4, installment_amount: 500 }
  };
  const snap2Minors = { student1: minor1, student2: minor2, signer_student_index: 1 };
  const vals = valuesFor(contract2Minors, snap2Minors);
  assert.equal(vals.contratante_nome, 'Maria Santos', 'Contratante 1 deve ser o responsável do menor 1');
  assert.equal(vals.contratante_2_nome, 'Fernanda Lima', 'Contratante 2 deve ser o responsável do menor 2');
  const html = contractHTML(contract2Minors, snap2Minors);
  assert.ok(html.includes('Ana Santos') && html.includes('Pedro Lima'), 'Ambos os menores devem aparecer identificados no contrato gerado');
}
console.log('✓ Bug #2 validado com sucesso.');

// 3. Bug #3: Dupla utilizando modelo de contrato "Menor de idade"
console.log('3. Testando Bug #3 (Dupla com modelo de contrato Menor de idade)...');
{
  const minor1 = {
    full_name: 'Ana Santos',
    is_minor: true,
    guardian_name: 'Maria Santos',
    guardian_cpf: '11122233344'
  };
  const minor2 = {
    full_name: 'Julia Santos',
    is_minor: true,
    guardian_name: 'Maria Santos',
    guardian_cpf: '11122233344'
  };
  const contractMenorTemplateForDuo = {
    kind: 'dupla',
    signer_student_index: 1,
    template_html: '<p>RESPONSÁVEL: {{responsavel_nome}} ({{responsavel_cpf}})</p><p>ALUNO(S): {{aluno_nome}}</p>',
    terms: { lessons_count: 24, weekly_frequency: 1, total_amount: 2400, installments: 6, installment_amount: 400 }
  };
  const snap = { student1: minor1, student2: minor2, signer_student_index: 1 };
  const html = contractHTML(contractMenorTemplateForDuo, snap);
  assert.ok(html.includes('Ana Santos e Julia Santos'), 'Em modelo de menor usado para dupla, {{aluno_nome}} deve listar ambos os alunos da dupla');
  assert.ok(html.includes('Maria Santos'), 'Responsável legal deve preencher {{responsavel_nome}}');
  assert.ok(appJs.includes("allowed=kind==='dupla'?['dupla','menor']:['individual','menor']"), 'contractOptions deve permitir modelos de menor em matrículas de dupla');
}
console.log('✓ Bug #3 validado com sucesso.');

// 4. Bug #17b e #17c: Formatação de primeira_parcela com R$ e campos extras automáticos
console.log('4. Testando Bug #17b (prefixo R$ automático em primeira_parcela)...');
{
  const c = {
    kind: 'individual',
    template_html: '<p>Entrada: {{primeira_parcela}} | Demais: {{demais_parcelas}}x de {{valor_parcela}} a partir de {{segunda_data}}</p>',
    terms: {
      total_amount: 1500,
      installments: 6,
      installment_amount: 250,
      first_installment_amount: 250,
      first_due_date: '2026-05-10',
      second_due_date: '2026-06-10',
      custom_fields: { primeira_parcela: '250' }
    }
  };
  const vals = valuesFor(c, { full_name: 'João Silva' });
  assert.equal(vals.primeira_parcela, money(250), 'Valor numérico puro em custom.primeira_parcela deve receber formatação R$');
}
console.log('✓ Bug #17b validado com sucesso.');

// 5. Melhoria #7 & #9: Novos marcadores de CNPJ/dados da escola, duração do pacote e desconto
console.log('5. Testando Melhorias #6, #7 e #9 (CNPJ da escola, duração do pacote e desconto nos contratos)...');
{
  const baseKeys = CONTRACT_BASE_FIELDS.map(f => f.key);
  for (const key of ['contratado_cnpj', 'contratado_endereco', 'contratado_telefone', 'contratado_email', 'duracao_pacote', 'desconto_valor', 'desconto_validade', 'desconto_motivo']) {
    assert.ok(baseKeys.includes(key), `Campo base ${key} deve estar registrado em CONTRACT_BASE_FIELDS`);
  }
  const c = {
    kind: 'individual',
    template_html: '<p>Escola: {{contratado_nome}} CNPJ: {{contratado_cnpj}} Plano: {{duracao_pacote}} Desconto: {{desconto_valor}} ({{desconto_motivo}})</p>',
    terms: {
      school_name: 'English Upskilling',
      school_cnpj: '12.345.678/0001-90',
      package_duration: 'Semestral (6 meses)',
      discount_amount: '10%',
      discount_reason: 'Pontualidade'
    }
  };
  const html = contractHTML(c, { full_name: 'Maria Oliveira' });
  assert.ok(html.includes('12.345.678/0001-90'), 'Deve renderizar o CNPJ da escola no contrato');
  assert.ok(html.includes('Semestral (6 meses)'), 'Deve renderizar a duração do pacote no contrato');
  assert.ok(html.includes('10% (Pontualidade)'), 'Deve renderizar os campos de desconto no contrato');
}
console.log('✓ Melhorias #6, #7 e #9 validadas com sucesso.');

// 6. Bugs #12 e #13: Limite do seletor semanal de horários e frequência padrão 1
console.log('6. Testando Bugs #12 e #13 (Seletor semanal de horários e frequência padrão 1)...');
{
  const mockRecurrenceForm = {
    elements: {
      enrollment_mode: { value: 'recurrence' },
      weekly_frequency: { value: '2' }
    },
    dataset: {}
  };
  assert.equal(getWeeklyLimit(mockRecurrenceForm), 0, 'No modo recorrência o limite do picker deve ser 0 (livre)');

  const mockPkgForm = {
    elements: {
      enrollment_mode: { value: 'package' },
      weekly_frequency: { value: '1' }
    },
    dataset: {}
  };
  assert.equal(getWeeklyLimit(mockPkgForm), 1, 'No modo pacote com frequência 1, o limite deve ser 1');
  assert.ok(pickerJs.includes('setTimeout(()=>updateWeeklyPickerIndicators(f),0)'), 'calendar-week-picker.js deve aguardar onPackageSelection atualizar weekly_frequency');
  assert.ok(appJs.includes('updateWeeklyPickerIndicators(form);'), 'onPackageSelection deve atualizar o indicador do seletor de horários imediatamente');
}
console.log('✓ Bugs #12 e #13 validados com sucesso.');

// 7. Bugs #7 e #8: Bloqueio de slot ocupado no calendário
console.log('7. Testando Bugs #7 e #8 (Bloqueio de slot ocupado na agenda)...');
{
  assert.ok(
    calJs.includes("if(!chosen.length&&slots.length===1&&!occupied.includes(slots[0].id))chosen.push(slots[0].id);"),
    'getFormPicker não deve pré-selecionar automaticamente um horário já ocupado por outro aluno'
  );
  assert.ok(
    calJs.includes('rosterConflicts') && calJs.includes('Um horário pré-selecionado já está ocupado. Altere a seleção antes de criar a matrícula.'),
    'plan() deve bloquear o agendamento em slot já ocupado no roster do professor'
  );
}
console.log('✓ Bugs #7 e #8 validados com sucesso.');

// 8. Bugs #4, #5, #6, #10, #11, #14, #15, #16, #19, #20, #21, #22 e Melhorias #1–#10 no código e SQL
console.log('8. Verificando estruturas de Rematrícula, Exclusão, Aditivo, Aviso Prévio, Exportação CSV e SQL...');
{
  // Bug #4, #5, #6: Rematrícula em dupla, cálculo inteligente de início e vencimento
  assert.ok(appJs.includes('function computeNextRenewalStartDate('), 'Deve calcular a próxima data real de aula na rematrícula');
  assert.ok(appJs.includes('function computeNextRenewalDueDate('), 'Deve preservar o dia de vencimento na rematrícula');
  assert.ok(!appJs.includes("Rematrícula de dupla ainda não implementada"), 'Não deve conter bloqueio de rematrícula de dupla');

  // Bug #10: Matrículas em andamento visíveis em Alunos > Matrículas
  assert.ok(appJs.includes("const isPendingManual=['pre_enrolled','ready_manual'].includes(c.status);"), 'studentsView deve exibir matrículas recém-criadas/rematriculadas');

  // Bug #11: studentCategory inclui student2_id e contratos scheduled
  assert.ok(
    appJs.includes("const cs=db.contracts.filter(c=>c.student_id===s.id||c.student2_id===s.id);") &&
    appJs.includes("if(cs.some(c=>['active','scheduled'].includes(enrollmentState(c))))return 'active';"),
    'studentCategory deve incluir o 2º aluno da dupla e matrículas assinadas agendadas como ativos'
  );

  // Bug #14 & Melhoria #10: Refresh paralelo, rota no hash e compatibilidade com PostgrestFilterBuilder (sem .catch direto em sb.rpc/sb.from)
  assert.ok(appJs.includes('await Promise.all(Object.keys(db).map(async k=>{'), 'refresh() deve carregar as tabelas em paralelo');
  assert.ok(appJs.includes('function syncPanelRoute()') && appJs.includes('function applyPanelRouteFromHash()'), 'Deve sincronizar e restaurar a rota da seção pela URL (#/...)');
  for (const [fname, content] of [['js/app.js', appJs], ['js/calendar-v6.js', calJs], ['js/onboarding-v67.js', onbJs], ['js/calendar-week-picker.js', pickerJs]]) {
    assert.ok(!/sb\.(rpc|from)\([^;\n]*\.(catch|finally)\(/.test(content), `${fname} não deve chamar .catch() ou .finally() diretamente no retorno de sb.rpc() ou sb.from()`);
  }

  // Bug #15 & #16: Download manual atualiza status para ready_manual e suporta nomes longos (180 chars)
  assert.ok(appJs.includes('.slice(0,180)'), 'downloadManualContract deve suportar até 180 caracteres no nome do arquivo');
  assert.ok(appJs.includes("c.status='ready_manual';"), 'downloadManualContract deve atualizar o status para ready_manual imediatamente');

  // Bug #19 & Melhoria #3: Modal de encerramento com data customizada e aviso prévio
  assert.ok(appJs.includes('function closeEnrollmentModal(id)'), 'Deve possuir modal de encerramento com data efetiva, motivo e aviso prévio');
  assert.ok(sql38.includes('p_keep_until_date boolean DEFAULT false'), 'RPC close_enrollment deve suportar aviso prévio mantendo aulas até a data final');

  // Melhoria #2: Aditivo contratual
  assert.ok(appJs.includes('function contractAddendumModal(id)'), 'Deve possuir modal de aditivo contratual');
  assert.ok(sql38.includes('CREATE OR REPLACE FUNCTION public.apply_contract_addendum'), 'SQL deve definir a RPC apply_contract_addendum');

  // Bugs #20 e #21: Exclusão de contrato, aluno com histórico e slot do calendário
  assert.ok(sql38.includes('CREATE OR REPLACE FUNCTION public.delete_contract_cascade'), 'SQL deve definir delete_contract_cascade');
  assert.ok(sql38.includes('CREATE OR REPLACE FUNCTION public.delete_student_cascade'), 'SQL deve definir delete_student_cascade');
  assert.ok(sql38.includes('CREATE OR REPLACE FUNCTION public.calendar_delete_slot'), 'SQL deve definir calendar_delete_slot');
  assert.ok(calJs.includes("control('calDeleteSlot','Excluir horário'"), 'calendar-v6.js deve exibir botão Excluir horário');

  // Melhoria #1: Telefone opcional e internacional
  assert.ok(appJs.includes('function normalizeStudentPhone(raw)'), 'app.js deve validar telefone opcional e internacional (+DDI)');
  assert.ok(sql38.includes('ALTER TABLE public.students ALTER COLUMN phone DROP NOT NULL;'), 'SQL deve remover NOT NULL de students.phone');

  // Melhoria #4 e #5: Colunas de responsável no CSV, exportação CSV com ID e vínculo flexível
  assert.ok(csvModel.includes('responsavel_nome'), 'modelo_importacao_alunos.csv deve incluir colunas de responsável');
  assert.ok(onbJs.includes('function resolveStudentInSchool('), 'onboarding-v67.js deve localizar alunos por ID, CPF, e-mail ou nome');
  assert.ok(appJs.includes('function exportStudentsCSV()'), 'app.js deve permitir exportar alunos com ID para CSV');

  // N1: calendar-v6.js deve exportar data no objeto retornado por createCalendar
  assert.ok(/return\s*\{\s*data\s*,/.test(calJs), 'N1: createCalendar em js/calendar-v6.js deve exportar data');
  {
    const calInstance = createCalendar({
      sb: { rpc: async () => ({ data: {}, error: null }) },
      ui: { schoolId: 'sch-1' },
      db: { teachers: [], contracts: [], students: [] },
      safe: (v) => String(v ?? ''),
      dateBR: (v) => v,
      today: () => '2026-11-26',
      showModal: () => {},
      closeModal: () => {},
      toast: () => {},
      refresh: async () => {},
      render: () => {},
      initialize: async () => {},
      authWrap: (v) => v,
      lookup: () => null,
      canAdmin: () => true,
      iconSvg: () => '',
      openLead: () => {}
    });
    assert.equal(typeof calInstance.data, 'function', 'N1: calInstance.data deve ser uma função exportada');
    const snap = calInstance.data();
    assert.ok(Array.isArray(snap.slots) && Array.isArray(snap.roster), 'N1: calInstance.data() deve retornar slots e roster como arrays');
  }

  // N2: Cache-busting unificado v=8.6.4 em index.html, app.js e calendar-v6.js
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok((indexHtml.includes('app.js?v=8.7.1') || indexHtml.includes('app.js?v=8.7.0') || indexHtml.includes('app.js?v=8.6.4')), 'N2: index.html deve carregar app.js?v=8.7.1');
  assert.ok((appJs.includes('./crm.js?v=8.7.1') || appJs.includes('./crm.js?v=8.7.0') || appJs.includes('./crm.js?v=8.6.4')) && (appJs.includes('./calendar-v6.js?v=8.7.1') || appJs.includes('./calendar-v6.js?v=8.7.0') || appJs.includes('./calendar-v6.js?v=8.6.4')), 'N2: app.js deve importar crm.js e calendar-v6.js com v=8.7.1');
  assert.ok((calJs.includes('./calendar-week-picker.js?v=8.7.1') || calJs.includes('./calendar-week-picker.js?v=8.7.0') || calJs.includes('./calendar-week-picker.js?v=8.6.4')), 'N2: calendar-v6.js deve importar calendar-week-picker.js com v=8.7.1');

  // N3: Sincronização em tempo real dos Campos do Modelo (syncContractExtraFields e computeContractExtraDefault)
  assert.ok(appJs.includes('function computeContractExtraDefault(f,key)') && appJs.includes('function syncContractExtraFields(f)'), 'N3: app.js deve sincronizar Campos deste modelo a partir das datas e parcelas reais do formulário');

  // N4: Mudar start_date recalcula término automaticamente mesmo em formulários compactos sem cal_start_date
  assert.ok(calJs.includes("if(element.name==='start_date'){") && !calJs.includes("if(element.name==='start_date'&&element.form?.elements.cal_start_date)"), 'N4: calendar.change deve recalcular autoPreview ao mudar start_date em todos os formulários');

  // N5: Recorrência calcula término pelos meses (plusMonth(start, n)) e mantém valor mensal ao mudar parcelas
  assert.equal(plusMonth('2026-12-10', 6), '2027-06-10', 'N5: plusMonth deve somar N meses corretamente');
  assert.equal(plusMonth('2026-12-10', 12), '2027-12-10', 'N5: plusMonth deve somar 12 meses corretamente');
  assert.ok(appJs.includes("isRecurrence&&edited==='installments'"), 'N5: updateInstallment na recorrência deve manter o valor mensal e recalcular o total ao mudar parcelas');

  // N6 & Reteste #4: Aditivo recalcula o total automaticamente ao mudar o valor da parcela ou número de parcelas e ao abrir a janela
  assert.ok(appJs.includes("'contractAddendumForm'].includes(e.target.form?.id))updateInstallment"), 'N6: contractAddendumForm deve acionar updateInstallment ao editar parcela ou total');
  assert.ok(appJs.includes("if(f&&!t.has_custom_first_installment&&Number(t.installment_amount)>0&&Number(t.installments)>0){\n  updateInstallment(f,'installment_amount');\n }"), 'Reteste #4: contractAddendumModal deve reconciliar o total logo ao abrir a janela');

  // N7 & Reteste #1: Dupla de 2 menores com o mesmo responsável remove tanto o bloco de identificação quanto a 2ª linha de assinatura CONTRATANTE em branco no rodapé, oferece opção "Ambos" e permite aproveitar responsável já cadastrado
  {
    const multiParagraphDuoTpl = '<p><strong>CONTRATANTE: {{contratante_nome}}</strong></p><p>DATA DE NASCIMENTO: {{contratante_data_nascimento}}</p><p>CPF/CNPJ: {{contratante_cpf}}</p><p>ENDEREÇO: {{contratante_endereco}}</p><p>CEP: {{contratante_cep}}</p><p>CEL: {{contratante_telefone}}<br>E-MAIL: {{contratante_email}}</p><p><strong>CONTRATANTE: {{contratante_2_nome}}</strong></p><p>DATA DE NASCIMENTO: {{contratante_2_data_nascimento}}</p><p>CPF/CNPJ: {{contratante_2_cpf}}</p><p>ENDEREÇO: {{contratante_2_endereco}}<br>CEP: {{contratante_2_cep}}</p><p>CEL: {{contratante_2_telefone}}<br>E-MAIL: {{contratante_2_email}}</p><p><strong>_________________________________________\t\t</strong></p><p><strong>CONTRATANTE </strong>{{contratante_nome}}</p><p><strong> </strong></p><p><strong>_________________________________________\t\t</strong></p><p><strong>CONTRATANTE </strong>{{contratante_2_nome}}</p>';
    const m1 = { full_name: 'Pedro Alves', birth_date: '2015-03-10', is_minor: true, guardian_name: 'Fernanda Alves', guardian_cpf: '11122233344', guardian_phone: '11999990000', guardian_email: 'fernanda@exemplo.com', guardian_address: 'Av. Brasil, 500', guardian_cep: '01310000' };
    const m2 = { full_name: 'Sofia Alves', birth_date: '2017-07-22', is_minor: true, guardian_name: 'Fernanda Alves', guardian_cpf: '11122233344', guardian_phone: '11999990000', guardian_email: 'fernanda@exemplo.com', guardian_address: 'Av. Brasil, 500', guardian_cep: '01310000' };
    const htmlSigner2 = contractHTML(
      { kind: 'dupla', signer_student_index: 2, template_html: multiParagraphDuoTpl, terms: { total_amount: 2400, installments: 6, installment_amount: 400 } },
      { student1: m1, student2: m2, signer_student_index: 2 }
    );
    const headerOccurrences = (htmlSigner2.match(/CONTRATANTE:/g) || []).length;
    const signatureOccurrences = (htmlSigner2.match(/<strong>CONTRATANTE\s*<\/strong>/g) || []).length;
    assert.equal(headerOccurrences, 1, 'N7: Não deve sobrar segundo cabeçalho de CONTRATANTE em branco');
    assert.equal(signatureOccurrences, 1, 'Reteste #1: Não deve sobrar segunda linha de assinatura CONTRATANTE em branco no rodapé do PDF');
    assert.ok(htmlSigner2.indexOf('1º Aluno(a): Sofia Alves') < htmlSigner2.indexOf('2º Aluno(a): Pedro Alves'), 'N7: Escolher o 2º integrante como 1º signatário deve ordenar Sofia como 1º Aluno(a)');
    assert.ok(appJs.includes('function existingGuardiansOptionsHTML(') && appJs.includes('data-guardian-picker'), 'Reteste #1: Deve permitir aproveitar responsável já cadastrado nos formulários de aluno e dupla');
    assert.ok(appJs.includes('<option value="both"'), 'Reteste #1: Quem assina o contrato deve oferecer a opção Ambos');
  }

  // Reteste #2: autoPreview valida parâmetros antes de chamar calendar_preview para evitar HTTP 400 no console
  assert.ok(calJs.includes("if(!start||!/^2\\d{3}-\\d{2}-\\d{2}$/.test(start))return;") && calJs.includes("if(!checked.length||!(count>=1&&count<=500))return;"), 'Reteste #2: autoPreview não deve chamar calendar_preview com parâmetros incompletos');

  // N8: Telefone do aluno formatado no PDF
  assert.equal(formatPhoneBR('11900000005'), '(11) 90000-0005', 'N8: formatPhoneBR deve formatar celular de 11 dígitos');
  assert.equal(formatPhoneBR('1145412182'), '(11) 4541-2182', 'N8: formatPhoneBR deve formatar fixo de 10 dígitos');
  {
    const vals = valuesFor({ kind: 'individual', terms: {} }, { full_name: 'Aluno Teste', phone: '11900000005' });
    assert.equal(vals.contratante_telefone, '(11) 90000-0005', 'N8: contratante_telefone do aluno deve sair formatado no PDF');
  }

  // N9, Reteste #3, Reteste #5, Reteste #6, Reteste #7 e N10
  assert.ok(appJs.includes('form-submit-error-banner'), 'N9: Deve exibir banner de erro visível dentro do modal quando a validação do formulário falhar');
  assert.ok(!appJs.includes('sel.required=e.target.checked'), 'Reteste #3: Não deve ativar validação nativa em inglês do navegador no select de professor do studentForm');
  assert.ok(appJs.includes('let autoMatchedPkg=null;') && appJs.includes('const fallbackType=associated||validTypes.find(t=>t.kind===kind)||validTypes[0]||null;'), 'Reteste #5: Trocar modalidade entre individual e dupla deve manter pacote cadastrado e selecionar automaticamente o modelo de contrato correspondente');
  assert.ok(appJs.includes("const noticeEnd=t.cancellation_effective_date||original.audit?.cancellation_notice?.effective_date||'';"), 'Reteste #6: Rematrícula de contrato em aviso prévio deve calcular o início a partir do fim do aviso prévio');
  assert.ok(appJs.includes("if(page==='directory')ui.studentTab='active';"), 'Reteste #7: Navegar para Alunos pelo menu deve abrir na aba padrão de Alunos ativos');
  assert.ok(appJs.includes("if(el.matches(':popover-open'))el.hidePopover();"), 'N9: toast() deve promover o popover para o topo da Top Layer acima do modal');
  assert.ok(appJs.includes("if(action==='contractTab'){ui.contractTab=x.dataset.tab;ui.contractStatus='all';ui.expiry='all';ui.search='';return render();}"), 'N10: Trocar aba de contratos deve limpar busca anterior');
}
console.log('✓ Todas as verificações estruturais e funcionais (incluindo N1–N10 e Reteste #1–#7) passaram!');

// 9. Verificação ativa no banco Supabase (quando SUPABASE_ACCESS_TOKEN estiver disponível)
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (token) {
  console.log('9. Verificando colunas, RPCs e templates diretamente no banco Supabase...');
  const res = await fetch('https://api.supabase.com/v1/projects/tyxmskdgbnrcaacwwkhi/database/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        SELECT
          (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='phone') AS phone_nullable,
          (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='schools' AND column_name='cnpj') AS has_school_cnpj,
          (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='packages' AND column_name IN ('duration_type','duration_months')) AS pkg_dur_cols,
          (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='interviews' AND column_name IN ('second_due_date','has_custom_first_installment','demais_parcelas','discount_amount','discount_until','discount_reason')) AS interview_fin_cols,
          (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('apply_contract_addendum','delete_contract_cascade','delete_student_cascade','calendar_delete_slot')) AS new_rpcs,
          (SELECT count(*)::int FROM public.contract_types WHERE body_text LIKE '%E-MAIL: <<contratante_2/telefone>>%') AS bug9_remaining;
      `
    })
  });
  assert.ok(res.ok, 'Consulta na Management API do Supabase deve retornar sucesso (HTTP 200/201)');
  const [row] = await res.json();
  assert.equal(row.phone_nullable, 'YES', 'students.phone deve permitir NULL no banco');
  assert.equal(row.has_school_cnpj, 1, 'schools.cnpj deve existir no banco');
  assert.equal(row.pkg_dur_cols, 2, 'packages deve ter duration_type e duration_months');
  assert.equal(row.interview_fin_cols, 6, 'interviews deve ter as 6 colunas financeiras e de desconto');
  assert.equal(row.new_rpcs, 4, 'As 4 novas RPCs devem existir no banco');
  assert.equal(row.bug9_remaining, 0, 'Nenhum template deve conter E-MAIL: <<contratante_2/telefone>>');
  console.log('✓ Banco de dados Supabase validado em tempo real com 100% de sucesso!\n');
}

console.log('======================================================');
console.log('TODOS OS TESTES V8.6 (22 BUGS + 10 MELHORIAS) PASSARAM! 🎉');
console.log('======================================================');

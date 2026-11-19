import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('/home/antigravity/Juliacsou/campanella');
const crmCss = fs.readFileSync(path.join(basePath, 'css/crm.css'), 'utf8');
const crmJs = fs.readFileSync(path.join(basePath, 'js/crm.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(basePath, 'js/app.js'), 'utf8');

console.log('=== Iniciando Testes V8.0: Abas e Refinamento do Atendimento no Lead ===\n');

// 1. Verificando as 4 sub-abas no HTML gerado em detail(id)
console.log('1. Verificando estrutura de navegação e as 4 abas no detail(id)...');
assert.ok(
  crmJs.includes('class="crm-detail-tabs-bar"') && crmJs.includes('class="crm-detail-nav"'),
  'O modal de detalhes deve conter a barra de abas .crm-detail-tabs-bar e nav .crm-detail-nav'
);
assert.ok(
  crmJs.includes('data-action="crmDetailTab" data-tab="data"') &&
  crmJs.includes('data-action="crmDetailTab" data-tab="attendance"') &&
  crmJs.includes('data-action="crmDetailTab" data-tab="interview"') &&
  crmJs.includes('data-action="crmDetailTab" data-tab="fiche"'),
  'A navegação deve conter botões com data-action="crmDetailTab" para as 4 abas (data, attendance, interview, fiche)'
);
assert.ok(
  crmJs.includes('data-pane="data"') &&
  crmJs.includes('data-pane="attendance"') &&
  crmJs.includes('data-pane="interview"') &&
  crmJs.includes('data-pane="fiche"'),
  'O corpo do modal deve renderizar 4 painéis com data-pane correspondentes'
);
console.log('  -> Estrutura de abas e painéis validada com sucesso.');

// 2. Verificando layout de Etapas do Atendimento (Situação Comercial fora de box, containers unificados)
console.log('2. Verificando Situação Comercial fora de box e conteiner unificado de Histórico e Comentários...');
assert.ok(
  crmJs.includes('crm-commercial-status-bar') && crmCss.includes('.crm-commercial-status-bar'),
  'A situação comercial deve vir em primeiro fora de uma box (.crm-commercial-status-bar)'
);
assert.ok(
  crmJs.includes('crm-attendance-unified-section') && crmCss.includes('.crm-attendance-unified-section'),
  'Os dois containers anteriores devem ser unificados em .crm-attendance-unified-section'
);
assert.ok(
  crmJs.includes('<h3>Histórico e Comentários</h3>'),
  'O container unificado deve conter o título "Histórico e Comentários"'
);
assert.ok(
  crmJs.includes('Adicionar contato') && crmJs.includes('Adicionar comentário'),
  'Devem existir os botões "Adicionar contato" e "Adicionar comentário"'
);
assert.ok(
  crmJs.includes('crm-timeline-subhead') && crmJs.includes('<h4>Histórico</h4>'),
  'O histórico deve ser renderizado como subtítulo'
);
console.log('  -> Situação comercial e seção unificada validadas.');

// 3. Verificando Linha do Tempo e layout dos cards do histórico
console.log('3. Verificando linha do tempo vertical com nós, cards e horários destacados...');
assert.ok(
  crmCss.includes('.crm-timeline::before') && crmCss.includes('.crm-timeline-node'),
  'A linha do tempo deve ter trilha vertical e nós circulares estilizados por tipo'
);
assert.ok(
  crmJs.includes('crm-timeline-card') && crmCss.includes('.crm-timeline-card'),
  'O histórico deve renderizar cards elegantes com .crm-timeline-card'
);
assert.ok(
  crmJs.includes('crm-timeline-time') && crmCss.includes('.crm-timeline-time'),
  'O horário deve ficar destacado e separado do título do evento (.crm-timeline-time)'
);
console.log('  -> Linha do tempo e cards aprimorados validados.');

// 4. Verificando popup de Contato e Comentário com coleta de horário e micro-modal flutuante
console.log('4. Verificando micro-modal flutuante com coleta de horário e ausência do termo "anotação"...');
assert.ok(
  crmJs.includes("openNotePopup") && crmJs.includes("crm-popup-dialog"),
  'O crm.js deve definir openNotePopup criando um micro-modal com classe crm-popup-dialog'
);
assert.ok(
  crmCss.includes("dialog.crm-popup-dialog") && crmCss.includes(".crm-popup-badge-icon") && crmCss.includes(".crm-popup-row-2"),
  'O crm.css deve estilizar o micro-modal dialog.crm-popup-dialog, o badge de ícone e o grid de 2 colunas'
);
assert.ok(
  crmJs.includes("occurred_time") && crmJs.includes("'Horário do contato'") && crmJs.includes("'Horário do comentário'"),
  'O formulário popup deve coletar data e horário para contatos e comentários'
);
assert.ok(
  !crmJs.toLowerCase().includes('anotação') && !crmJs.toLowerCase().includes('anotações'),
  'O termo "anotação" deve ser 100% removido do crm.js'
);
console.log('  -> Micro-modal flutuante, coleta de horário e ausência de "anotação" validadas.');

// 5. Verificando cabeçalho fixo (sticky) ao rolar para baixo
console.log('5. Verificando cabeçalho fixo (sticky head) no crm-detail...');
assert.ok(
  crmJs.includes('crm-detail-sticky-head') && crmCss.includes('.crm-detail-sticky-head'),
  'O cabeçalho do drawer deve possuir a classe .crm-detail-sticky-head'
);
assert.ok(
  crmCss.includes('position: sticky') && crmCss.includes('top: -8px'),
  'O .crm-detail-sticky-head deve ter position: sticky para fixar no topo durante a rolagem'
);
console.log('  -> Sticky header validado com sucesso.');

// 6. Verificando botões de ação de comunicação no topo (WhatsApp, Ligar e SMS somente ícones)
console.log('6. Verificando trio de botões de comunicação (WhatsApp, Ligar e SMS)...');
assert.ok(
  crmJs.includes('crm-btn-call') && crmJs.includes('crm-btn-sms') && crmJs.includes('crm-btn-whatsapp'),
  'O topo deve conter botões de WhatsApp, Ligar (tel:) e SMS (sms:)'
);
assert.ok(
  crmCss.includes('.crm-btn-call') && crmCss.includes('.crm-btn-sms') && crmCss.includes('.crm-btn-head-icon'),
  'O crm.css deve estilizar os botões de ligar e sms como ícones somente'
);
console.log('  -> Botões de WhatsApp, Ligar e SMS validados.');

// 7. Verificando botão de tags em modelo link
console.log('7. Verificando botão de tags em estilo link...');
assert.ok(
  crmJs.includes('crm-btn-link') && crmJs.includes('Gerenciar tags'),
  'O botão de tags deve usar modelo link e o texto "Gerenciar tags"'
);
assert.ok(
  crmCss.includes('.crm-btn-link') && crmCss.includes('.crm-btn.link'),
  'O crm.css deve incluir a estilização de botão link'
);
console.log('  -> Botão de tags link validado.');

// 8. Verificando versionamento de cache
console.log('8. Verificando versionamento de cache...');
assert.ok(
  indexHtml.includes('crm.css?v=8.1.0') && indexHtml.includes('app.js?v=8.1.0'),
  'O index.html deve conter crm.css?v=8.1.0 e app.js?v=8.1.0'
);
assert.ok(
  appJs.includes('./crm.js?v=8.1.0'),
  'O app.js deve importar ./crm.js?v=8.1.0'
);
console.log('  -> Cache version v=8.1.0 validado.');

console.log('\n=== Todos os 8 testes V8.0/V8.1 de Atendimento, Micro-Modal e Cabeçalho Fixo passaram com 100% de sucesso! ===');

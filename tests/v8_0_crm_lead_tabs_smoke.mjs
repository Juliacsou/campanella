import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('/home/antigravity/Juliacsou/campanella');
const crmCss = fs.readFileSync(path.join(basePath, 'css/crm.css'), 'utf8');
const crmJs = fs.readFileSync(path.join(basePath, 'js/crm.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');

console.log('=== Iniciando Testes V8.0: Abas no Drawer de Lead do CRM ===\n');

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

// 2. Verificando ações de atendimento na aba "attendance"
console.log('2. Verificando ações e histórico na aba de Etapas do Atendimento...');
assert.ok(
  crmJs.includes("'crmContact'") && crmJs.includes("'crmNote'"),
  'A aba de atendimento deve conter botões para Registrar contato e Adicionar anotação/comentário'
);
assert.ok(
  crmJs.includes('crm-attendance-hero') && crmJs.includes('crm-timeline'),
  'A aba de atendimento deve conter o hero de atendimento e a linha do tempo com histórico'
);
assert.ok(
  crmJs.includes("'crmWon'") && crmJs.includes("'crmLost'"),
  'A aba de atendimento deve conter opções de Fechar negócio e Não converteu'
);
console.log('  -> Ações e histórico de atendimento validados.');

// 3. Verificando ações e histórico na aba "interview"
console.log('3. Verificando card de agendamento e histórico na aba de Entrevista...');
assert.ok(
  crmJs.includes('crm-interview-highlight') && crmJs.includes('crm-compact-list'),
  'A aba de entrevista deve conter card de destaque e histórico completo de entrevistas'
);
assert.ok(
  crmJs.includes("'crmCompleteInterview'") &&
  crmJs.includes("'crmScheduleInterview'") &&
  crmJs.includes("'crmNoShow'") &&
  crmJs.includes("'crmCancelInterview'"),
  'A aba de entrevista deve conter todas as ações de ciclo de vida da entrevista'
);
console.log('  -> Ações e histórico de entrevista validados.');

// 4. Verificando ficha inicial e contratos na aba "fiche"
console.log('4. Verificando ficha pedagógica e contratos na aba de Ficha Inicial...');
assert.ok(
  crmJs.includes('crm-fiche-hero') && crmJs.includes('crm-fiche-summary-grid'),
  'A aba de ficha inicial deve conter o hero da ficha e a grade de resumo pedagógico'
);
assert.ok(
  crmJs.includes("'crmStartFiche'") && crmJs.includes("'crmGoFiche'"),
  'A aba de ficha inicial deve conter botões para criar/abrir a ficha inicial'
);
assert.ok(
  crmJs.includes('crm-linked-contracts') || crmJs.includes('crm-enrollment-callout'),
  'A aba de ficha inicial deve conter seção de contratos vinculados / encaminhamento para matrícula'
);
console.log('  -> Ficha inicial e encaminhamento de contrato validados.');

// 5. Verificando manipulação de evento crmDetailTab e persistência de estado
console.log('5. Verificando handler de evento e persistência de estado do detailTab...');
assert.ok(
  crmJs.includes("case 'crmDetailTab':"),
  'O handleClick deve tratar o evento crmDetailTab'
);
assert.ok(
  crmJs.includes('detailTab') && crmJs.includes('activeTab'),
  'O estado do CRM deve rastrear e manter o detailTab ativo'
);
console.log('  -> Handler e persistência de abas validados.');

// 6. Verificando CSS do design system helloPTO para abas
console.log('6. Verificando estilização das abas e componentes no crm.css...');
assert.ok(
  crmCss.includes('.crm-detail-nav') &&
  crmCss.includes('.crm-detail-nav-btn') &&
  crmCss.includes('.crm-detail-nav-btn.is-active') &&
  crmCss.includes('.crm-tab-pane') &&
  crmCss.includes('.crm-tab-pane[hidden]'),
  'O crm.css deve estilizar a navegação de abas e alternância de visibilidade com [hidden]'
);
assert.ok(
  crmCss.includes('.crm-attendance-hero') &&
  crmCss.includes('.crm-outcome-panel') &&
  crmCss.includes('.crm-interview-highlight') &&
  crmCss.includes('.crm-fiche-hero'),
  'O crm.css deve estilizar os cards de destaque de cada aba'
);
console.log('  -> CSS das abas validado com sucesso.');

// 7. Verificando refinamento visual dos dados e tags (container separado, botão whatsapp verde e edição em lápis)
console.log('7. Verificando refinamento visual do container de dados e tags...');
assert.ok(
  crmJs.includes('crm-lead-tags-section') && !crmJs.includes('Informações básicas de contato, interesse e canal de captação.'),
  'As tags devem estar em um container separado (.crm-lead-tags-section) e o subtítulo prolixo removido'
);
assert.ok(
  crmJs.includes('crm-btn-whatsapp') && crmCss.includes('.crm-btn-whatsapp') && crmCss.includes('#25D366'),
  'O botão do WhatsApp deve ser apenas ícone estilizado em verde (#25D366)'
);
assert.ok(
  crmJs.includes('crm-btn-icon-only') && crmCss.includes('.crm-btn-icon-only'),
  'O botão de edição deve ser apenas o ícone do lápis (.crm-btn-icon-only)'
);
console.log('  -> Refinamento visual de dados, tags e botões validado com sucesso.');

// 8. Verificando versão de cache no index.html
console.log('8. Verificando versionamento de cache...');
assert.ok(
  indexHtml.includes('crm.css?v=8.0.7'),
  'O index.html deve conter crm.css?v=8.0.7'
);
console.log('  -> Cache version v=8.0.7 validado.');

console.log('\n=== Todos os 8 testes V8.0 de Abas e Refinamento do Lead passaram com 100% de sucesso! ===');

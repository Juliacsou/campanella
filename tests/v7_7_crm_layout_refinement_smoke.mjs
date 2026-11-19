import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('/home/antigravity/Juliacsou/campanella');
const css = fs.readFileSync(path.join(basePath, 'css/vision-theme.css'), 'utf8');

console.log('=== Iniciando Testes V7.7: Refinamento de Layout do CRM (Dark Mode & Cards) ===\n');

// 1. Verificando eliminação de iluminação branca agressiva nos cards
console.log('1. Verificando eliminação da luz branca especular nos cards de leads...');
const leadCardIndex = css.indexOf('/* 30.8 Lead Cards');
const leadCardBlock = css.slice(leadCardIndex, leadCardIndex + 1200);

assert.ok(
  !leadCardBlock.includes('rgba(255, 255, 255, 0.16) 0%'),
  'Não deve haver gradiente branco de 16% no início do card de lead'
);
assert.ok(
  !leadCardBlock.includes('inset 0 1px 1.5px rgba(255, 255, 255'),
  'Não deve haver sombra interna branca no topo do card de lead'
);
assert.ok(
  leadCardBlock.includes('#181C26'),
  'Os cards de lead devem utilizar fundo grafite escuro quente (#181C26)'
);
console.log('  -> Luz branca forte removida com sucesso dos cards.');

// 2. Verificando colunas da pipeline (diferenciação visual de pistas)
console.log('2. Verificando contraste e estruturação das colunas da pipeline...');
assert.ok(
  css.includes('#11141D'),
  'As colunas da pipeline devem possuir fundo escuro antracite (#11141D) para distinção das cartas'
);
assert.ok(
  css.includes('.crm-board-col-title b'),
  'O contador de leads da coluna deve possuir estilização elegante e legível'
);
console.log('  -> Estruturação visual das colunas validada.');

// 3. Verificando métricas no estilo glass sem stroke de borda (Dark & Light)
console.log('3. Verificando métricas de KPI em estilo Glass sem borda/stroke (Dark & Light)...');
const metricSectionIndex = css.indexOf('/* 34.7 CRM Metric Cards');
const section34_8Index = css.indexOf('/* ==========================================================================\n   34.8');
const metricSectionBlock = css.slice(metricSectionIndex, section34_8Index);

assert.ok(
  !metricSectionBlock.includes('border-top: 2px solid'),
  'Não deve haver traço (stroke) de borda superior nas métricas de KPI'
);
assert.ok(
  !metricSectionBlock.includes('border: 1px solid'),
  'Não deve haver borda (stroke) de 1px ao redor das métricas de KPI'
);
assert.ok(
  metricSectionBlock.includes('border: none !important'),
  'As métricas de KPI devem ter border: none !important'
);
assert.ok(
  metricSectionBlock.includes('backdrop-filter: blur(28px)'),
  'As métricas de KPI devem ter desfoque fosco (blur) autêntico de glassmorphism'
);
assert.ok(
  metricSectionBlock.includes('[data-theme="light"] .crm-metric'),
  'Deve conter estilização dedicada para métricas de KPI em Light Mode'
);
assert.ok(
  metricSectionBlock.includes('[data-theme="light"] .crm-metric:nth-child(1) strong') &&
  metricSectionBlock.includes('#EA580C'),
  'Métrica 1 em Light Mode deve destacar número em tom quente/âmbar (#EA580C)'
);
assert.ok(
  metricSectionBlock.includes('[data-theme="light"] .crm-metric:nth-child(2) strong') &&
  metricSectionBlock.includes('#0284C7'),
  'Métrica 2 em Light Mode deve destacar número em tom azul celeste (#0284C7)'
);
assert.ok(
  metricSectionBlock.includes('[data-theme="light"] .crm-metric:nth-child(3) strong') &&
  metricSectionBlock.includes('#9333EA'),
  'Métrica 3 em Light Mode deve destacar número em tom roxo violeta (#9333EA)'
);
assert.ok(
  metricSectionBlock.includes('[data-theme="light"] .crm-metric:nth-child(4) strong') &&
  metricSectionBlock.includes('#059669'),
  'Métrica 4 em Light Mode deve destacar número em tom verde esmeralda (#059669)'
);
console.log('  -> Estilo Glass sem stroke das métricas validado com sucesso em Dark e Light Mode.');

// 4. Verificando elevação da área de trabalho
console.log('4. Verificando elevação da área de trabalho (.crm-workspace)...');
assert.ok(
  css.includes('#0E1119'),
  'A área de trabalho deve ter tonalidade própria (#0E1119) com borda sutil para não se misturar com o fundo geral no Dark Mode'
);
console.log('  -> Elevação da área de trabalho validada.');

// 5. Verificando Paridade Total do CRM em Light Mode (Seção 34.8)
console.log('5. Verificando Paridade Total do CRM em Light Mode (Seção 34.8)...');
assert.ok(
  css.includes('34.8 CRM LIGHT THEME TOTAL HARMONY'),
  'Deve conter a Seção 34.8 dedicada à paridade e contraste total do CRM em Light Mode'
);
assert.ok(
  css.includes('[data-theme="light"] .crm-board-col') && css.includes('#F1EFEA'),
  'A coluna da pipeline no Light Mode deve possuir trilha contrastante (#F1EFEA) para destacar os cards'
);
assert.ok(
  css.includes('[data-theme="light"] .crm-tabs button[data-tab="won"] span') &&
  css.includes('[data-theme="light"] .crm-tabs button[data-tab="lost"] span'),
  'As abas no Light Mode devem conter badges coloridas específicas para won (verde) e lost (vermelho)'
);
assert.ok(
  css.includes('[data-theme="light"] .crm-lead-card:hover') &&
  css.includes('rgba(234, 88, 12, 0.45)'),
  'Os cards de lead no Light Mode devem possuir hover com brilho sutil âmbar/laranja'
);
console.log('  -> Paridade total do CRM em Light Mode validada com sucesso.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DO NOVO LAYOUT DO CRM PASSARAM! 🎉');
console.log('======================================================\n');

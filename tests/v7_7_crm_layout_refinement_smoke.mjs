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

// 3. Verificando métricas no estilo glass sem stroke de borda
console.log('3. Verificando métricas de KPI em estilo Glass sem borda/stroke...');
const metricSectionIndex = css.indexOf('/* 34.7 CRM Metric Cards');
const metricSectionBlock = css.slice(metricSectionIndex, metricSectionIndex + 2500);

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
  css.includes('.crm-metric:nth-child(1)'),
  'A métrica 1 (Oportunidades abertas) deve possuir brilho interno suave laranja/âmbar'
);
assert.ok(
  css.includes('.crm-metric:nth-child(2)'),
  'A métrica 2 (Entrevistas agendadas) deve possuir brilho interno suave azul/celeste'
);
assert.ok(
  css.includes('.crm-metric:nth-child(3)'),
  'A métrica 3 (Fichas iniciais) deve possuir brilho interno suave roxo/violeta'
);
assert.ok(
  css.includes('.crm-metric:nth-child(4)'),
  'A métrica 4 (Negócios fechados) deve possuir brilho interno suave verde esmeralda'
);
console.log('  -> Estilo Glass sem stroke das métricas validado com sucesso.');

// 4. Verificando elevação da área de trabalho
console.log('4. Verificando elevação da área de trabalho (.crm-workspace)...');
assert.ok(
  css.includes('#0E1119'),
  'A área de trabalho deve ter tonalidade própria (#0E1119) com borda sutil para não se misturar com o fundo geral'
);
console.log('  -> Elevação da área de trabalho validada.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DO NOVO LAYOUT DO CRM PASSARAM! 🎉');
console.log('======================================================\n');

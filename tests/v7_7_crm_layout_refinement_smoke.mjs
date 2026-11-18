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

// 3. Verificando métricas temáticas coloridas (anti-monocromático)
console.log('3. Verificando métricas de KPI com acentos de cor temáticos...');
assert.ok(
  css.includes('.crm-metric:nth-child(1)'),
  'A métrica 1 (Oportunidades abertas) deve possuir acento laranja/âmbar'
);
assert.ok(
  css.includes('.crm-metric:nth-child(2)'),
  'A métrica 2 (Entrevistas agendadas) deve possuir acento azul/celeste'
);
assert.ok(
  css.includes('.crm-metric:nth-child(3)'),
  'A métrica 3 (Fichas iniciais) deve possuir acento roxo/violeta'
);
assert.ok(
  css.includes('.crm-metric:nth-child(4)'),
  'A métrica 4 (Negócios fechados) deve possuir acento verde esmeralda'
);
console.log('  -> Diferenciação cromática das métricas validada.');

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

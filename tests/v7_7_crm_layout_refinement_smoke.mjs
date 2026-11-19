import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('/home/antigravity/Juliacsou/campanella');
const styleCss = fs.readFileSync(path.join(basePath, 'css/style.css'), 'utf8');
const crmCss = fs.readFileSync(path.join(basePath, 'css/crm.css'), 'utf8');
const crmJs = fs.readFileSync(path.join(basePath, 'js/crm.js'), 'utf8');

console.log('=== Iniciando Testes V8.0: Layout Limpo do CRM (Light Mode & Cards) ===\n');

// 1. Verificando que vision-theme.css foi removido e não há glassmorphism
console.log('1. Verificando remoção do vision-theme.css e ausência de glassmorphism...');
assert.ok(
  !fs.existsSync(path.join(basePath, 'css/vision-theme.css')),
  'O arquivo css/vision-theme.css deve ter sido completamente apagado'
);
assert.ok(
  !crmCss.includes('backdrop-filter'),
  'O CSS do CRM não deve utilizar backdrop-filter (glassmorphism)'
);
console.log('  -> vision-theme.css removido e zero glassmorphism.');

// 2. Verificando estrutura flat de filtros e abas no CRM
console.log('2. Verificando barra unificada de filtros e abas (.crm-filters-bar)...');
assert.ok(
  crmJs.includes('class="crm-filters-bar"') && crmJs.includes('class="crm-filters-right"'),
  'O CRM deve unificar abas, busca, filtros e seletor Pipeline/Lista em uma única barra'
);
assert.ok(
  crmCss.includes('.crm-filters-bar') && crmCss.includes('.crm-tabs'),
  'O CSS do CRM deve estilizar .crm-filters-bar e .crm-tabs'
);
console.log('  -> Barra unificada do CRM validada.');

// 3. Verificando colunas da pipeline e cards de lead no Light Mode
console.log('3. Verificando colunas da pipeline e cards de lead em Light Mode...');
assert.ok(
  crmCss.includes('.crm-board-col') && crmCss.includes('#F1F5F9'),
  'As colunas da pipeline devem ter fundo claro contrastante (#F1F5F9)'
);
assert.ok(
  crmCss.includes('.crm-lead-card') && crmCss.includes('#FFFFFF'),
  'Os cards de lead devem ter superfície branca limpa (#FFFFFF)'
);
assert.ok(
  crmCss.includes('.crm-board-col-title b'),
  'O contador de leads da coluna deve possuir estilização legível'
);
console.log('  -> Colunas e cards validados.');

// 4. Verificando métricas horizontais compactas do CRM
console.log('4. Verificando métricas compactas (.crm-metrics)...');
assert.ok(
  crmCss.includes('.crm-metrics') && crmCss.includes('.crm-metric'),
  'Deve conter estilização dedicada para a faixa compacta de métricas de KPI em Light Mode'
);
assert.ok(
  styleCss.includes('--bg-app: #F8FAFC'),
  'O tema base deve ser exclusivamente claro (--bg-app: #F8FAFC)'
);
console.log('  -> Métricas compactas e tema claro validados.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DO NOVO LAYOUT DO CRM PASSARAM! 🎉');
console.log('======================================================\n');

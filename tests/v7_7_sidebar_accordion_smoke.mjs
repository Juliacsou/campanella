import assert from 'node:assert';
import fs from 'node:fs';

console.log('=== Iniciando Testes V7.7: Menu Recuável (Ícones) e Categorias em Acordeão ===\n');

const app = fs.readFileSync('./js/app.js', 'utf8');
const visionCss = fs.readFileSync('./css/vision-theme.css', 'utf8');

// 1. Verificando ícones de recolher/expandir sidebar
console.log('1. Verificando ícones de navegação e recolhimento...');
assert.ok(app.includes('sidebarCollapse:'), 'ICONS deve conter sidebarCollapse');
assert.ok(app.includes('sidebarExpand:'), 'ICONS deve conter sidebarExpand');

// 2. Verificando estado ui e persistência
console.log('2. Verificando estado e persistência local...');
assert.ok(app.includes('campanella:sidebar-collapsed'), 'Deve ler/salvar campanella:sidebar-collapsed');
assert.ok(app.includes('campanella:nav-groups-expanded'), 'Deve ler/salvar campanella:nav-groups-expanded');
assert.ok(app.includes('function toggleSidebar()'), 'Função toggleSidebar deve existir');
assert.ok(app.includes('function toggleNavGroup('), 'Função toggleNavGroup deve existir');
assert.ok(app.includes('function ensureActiveNavGroupOpen()'), 'Função ensureActiveNavGroupOpen deve existir');

// 3. Verificando markup do shell
console.log('3. Verificando estrutura do shell (sidebar e topbar)...');
assert.ok(app.includes('sidebar-brand-row'), 'Sidebar deve ter sidebar-brand-row com botão de recuar');
assert.ok(app.includes('sidebar-collapse-btn'), 'Botão sidebar-collapse-btn deve existir');
assert.ok(app.includes('topbar-left'), 'Topbar deve ter container topbar-left');
assert.ok(app.includes('topbar-toggle-btn'), 'Topbar deve ter botão topbar-toggle-btn');
assert.ok(app.includes('nav-group-btn nav-group'), 'Categorias devem ser botões nav-group-btn nav-group');
assert.ok(app.includes('data-action="toggleNavGroup"'), 'Botões de categoria devem ter data-action="toggleNavGroup"');
assert.ok(app.includes('data-action="toggleSidebar"'), 'Botões de alternar menu devem ter data-action="toggleSidebar"');

// 4. Verificando CSS no vision-theme.css
console.log('4. Verificando regras de estilo no Vision UI...');
assert.ok(visionCss.includes('.shell.sidebar-collapsed'), 'CSS deve ter .shell.sidebar-collapsed');
assert.ok(visionCss.includes('.sidebar.collapsed'), 'CSS deve ter .sidebar.collapsed');
assert.ok(visionCss.includes('.nav-group-btn'), 'CSS deve ter estilos de .nav-group-btn');
assert.ok(visionCss.includes('.nav-group-arrow'), 'CSS deve ter rotação da seta .nav-group-arrow');
assert.ok(visionCss.includes('.sidebar-collapse-btn'), 'CSS deve ter .sidebar-collapse-btn');
assert.ok(visionCss.includes('.topbar-toggle-btn'), 'CSS deve ter .topbar-toggle-btn');
assert.ok(visionCss.includes('data-tooltip'), 'CSS deve ter tooltips flutuantes para modo ícones');

console.log('\n======================================================');
console.log('TODOS OS TESTES DO MENU RECUÁVEL E ACORDEÃO PASSARAM! 🎉');
console.log('======================================================');

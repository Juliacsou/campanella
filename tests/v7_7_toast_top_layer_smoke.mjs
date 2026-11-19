import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const basePath = path.resolve('/home/antigravity/Juliacsou/campanella');
const html = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(basePath, 'js/app.js'), 'utf8');
const css = fs.readFileSync(path.join(basePath, 'css/style.css'), 'utf8');

console.log('=== Iniciando Testes V8.0: Toast Notifications no Top Layer (Popover API) ===\n');

// 1. Verificando index.html
console.log('1. Verificando declaração do elemento #toast no index.html...');
assert.match(
  html,
  /<div\s+id="toast"[^>]*popover="manual"[^>]*>/i,
  'O elemento #toast deve possuir o atributo popover="manual" para suporte à Top Layer da Web API'
);
assert.match(
  html,
  /style\.css\?v=8\.0\.\d+/,
  'O arquivo index.html deve apontar para a versão 8.0.x do style.css'
);
assert.ok(
  !html.includes('vision-theme.css'),
  'O arquivo index.html não deve referenciar vision-theme.css'
);
console.log('  -> Declaração no HTML validada.');

// 2. Verificando lógica no js/app.js
console.log('2. Verificando lógica da função toast() no app.js...');
assert.ok(
  appJs.includes("typeof el.showPopover==='function'"),
  'A função toast() deve verificar e invocar showPopover() para projetar o toast no Top Layer'
);
assert.ok(
  appJs.includes("el.showPopover()"),
  'A função toast() deve chamar el.showPopover()'
);
assert.ok(
  appJs.includes("typeof el.hidePopover==='function'"),
  'A função toast() deve fechar usando hidePopover()'
);
assert.ok(
  appJs.includes("data-kind") && (appJs.includes("'error'") || appJs.includes("'success'")),
  'A função toast() deve definir data-kind para estilização semântica'
);
assert.ok(
  appJs.includes("#toast") && appJs.includes("closest('#toast')"),
  'Deve existir evento ou método para fechar o toast ao clicar'
);
console.log('  -> Lógica no app.js validada.');

// 3. Verificando estilos no css/style.css
console.log('3. Verificando regras de CSS para #toast e #toast:popover-open...');
assert.ok(
  css.includes('#toast:popover-open'),
  'O CSS deve conter o seletor #toast:popover-open para estilizar o estado aberto via Popover API'
);
assert.ok(
  css.includes('2147483647'),
  'O CSS deve conter z-index máximo para garantir visibilidade absoluta'
);
assert.ok(
  css.includes('#toast::backdrop'),
  'O CSS deve resetar o pseudo-elemento ::backdrop do popover para evitar telas escuras'
);
assert.ok(
  css.includes('inset: auto 24px 24px auto'),
  'O CSS deve posicionar o toast no canto inferior direito, sobrescrevendo a centralização padrão do navegador para popovers'
);
console.log('  -> Regras no CSS validadas.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DO TOAST NO TOP LAYER PASSARAM! 🎉');
console.log('======================================================\n');

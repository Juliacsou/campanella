import assert from 'node:assert';
import fs from 'node:fs';

console.log('=== Iniciando Testes V8.0: Estilização da Ficha Inicial e Pré-Matrícula ===\n');

const styleCss = fs.readFileSync('css/style.css', 'utf8');
const appJs = fs.readFileSync('js/app.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');

console.log('1. Verificando regras de estilo da Ficha Inicial e Pré-Matrícula no style.css...');
assert.ok(styleCss.includes('.sign-page'), 'style.css deve conter .sign-page');
assert.ok(styleCss.includes('.sign-top'), 'style.css deve conter .sign-top');
assert.ok(styleCss.includes('.sign-main'), 'style.css deve conter .sign-main');
assert.ok(styleCss.includes('.sign-panel'), 'style.css deve conter .sign-panel');
assert.ok(styleCss.includes('.sign-step'), 'style.css deve conter .sign-step');
assert.ok(styleCss.includes('.sign-lead-hero'), 'style.css deve conter .sign-lead-hero');
assert.ok(styleCss.includes('.interview-calendar-picker'), 'style.css deve conter .interview-calendar-picker');
assert.ok(styleCss.includes('.sign-button'), 'style.css deve conter .sign-button');
assert.ok(styleCss.includes('.sign-success-card'), 'style.css deve conter .sign-success-card');
assert.ok(styleCss.includes('.fiche-popup'), 'style.css deve conter .fiche-popup');
assert.ok(styleCss.includes('.fiche-choice-grid'), 'style.css deve conter .fiche-choice-grid');
assert.ok(styleCss.includes('.link-field'), 'style.css deve conter .link-field');
console.log('  -> Regras de CSS da Ficha Inicial e Pré-Matrícula validadas.');

console.log('2. Verificando estrutura e classes no app.js...');
assert.ok(appJs.includes('sign-lead-hero'), 'app.js deve renderizar sign-lead-hero na ficha inicial');
assert.ok(appJs.includes('sign-button'), 'app.js deve usar sign-button no botão de envio');
assert.ok(appJs.includes('sign-success-card'), 'app.js deve renderizar sign-success-card na conclusão da pré-matrícula');
assert.ok(!appJs.includes('#ea580c'), 'app.js não deve conter a cor laranja legada #ea580c');
console.log('  -> Estrutura no app.js validada.');

console.log('3. Verificando versão de cache dos assets no index.html...');
assert.ok(/style\.css\?v=8\.0\.[5-9]/.test(indexHtml), 'index.html deve referenciar style.css com versão v=8.0.5 ou superior');
assert.ok(/app\.js\?v=8\.0\.[5-9]/.test(indexHtml), 'index.html deve referenciar app.js com versão v=8.0.5 ou superior');
console.log('  -> Versões de cache validadas.');

console.log('\n======================================================');
console.log('TODOS OS TESTES DE ESTILIZAÇÃO DA FICHA E PRÉ-MATRÍCULA PASSARAM! 🎉');
console.log('======================================================\n');

# Campanella V6.7.1 — correção de inicialização

- Corrige ReferenceError na inicialização de `js/app.js`: `createOnboarding` recebia `ico` antes da declaração `const ico`.
- Ajusta parâmetro de versão do script no `index.html` para evitar cache do JavaScript antigo.
- Sem alteração de banco de dados, SQL ou Edge Functions.
- Preserva AssinAPI e Google Drive desativados.

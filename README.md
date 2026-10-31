# Campanella V2 — sistema completo conectado

**Supabase configurado no codigo:** `https://tyxmskdgbnrcaacwwkhi.supabase.co`.
O frontend inclui apenas a chave **publishable** fornecida pela administracao. As chaves secretas/service_role permanecem exclusivas do Supabase.

## Abrir localmente (Windows)
1. Extraia o ZIP completo em uma pasta nova.
2. Abra a pasta `Campanella_V2_Conectado` (a que contem `index.html`).
3. Clique na barra de endereco do Explorador de Arquivos, digite `cmd` e pressione Enter.
4. No terminal, execute `py -m http.server 8000`.
5. Abra `http://localhost:8000` no navegador.
6. Entre com o e-mail e a senha criados no Supabase Auth do projeto novo.

No macOS/Linux, rode `python3 -m http.server 8000` na mesma pasta.
Deixe o terminal aberto enquanto usar o sistema. Nao abra `index.html` diretamente com duplo clique.

## O que esta pronto
- URL e chave publica do projeto novo fixadas no `js/app.js`.
- Nenhuma pagina `configurar.html` e necessaria.
- CRM, follow-ups, entrevistas, leads, pacotes, fichas iniciais, alunos, contratos e matriculas da V2.
- Modelos DOCX e Edge Functions no repositorio.

## O que precisa existir no Supabase
- O banco V2 ja criado com `sql/00_RECONSTRUIR_TUDO_V2.sql` (ou equivalente).
- Uma conta de administrador em Authentication > Users.
- Duas Edge Functions publicadas: `assinatura` e `entrevista`.
- Em Settings de ambas, Verify JWT desativado; cada funcao faz suas proprias verificacoes de token.
- Edge Functions > Secrets: `APP_ORIGINS` = `http://localhost:8000,http://127.0.0.1:8000`.
- Authentication > URL Configuration: Site URL `http://localhost:8000/` e Redirect URLs `http://localhost:8000/`, `http://localhost:8000/?recuperar=1`.

**Se ja concluiu a reconstrucao, NAO execute os SQLs novamente.** Eles acompanham o ZIP apenas como referencia e para uma futura instalacao nova.

## Ao publicar futuramente no GitHub Pages
- Atualizar `APP_ORIGINS` para incluir a origem `https://SEUUSUARIO.github.io` (alem da origem local, se quiser).
- Adicionar o endereco real do site e de recuperacao de senha em Auth > URL Configuration.
- Os dados de conexao do frontend sao publicos, mas isso NAO deve expor dados por si so: a protecao dos dados depende das policies RLS e das autorizacoes das Edge Functions.
- **Nunca** publicar chaves secret/service_role, contratos assinados, exports de leads/alunos ou CSVs de dados reais no repositorio publico.

## Testes recomendados
1. Entrar no painel com a conta admin.
2. Cadastrar um lead ficticio, criar ficha, testar link do entrevistador.
3. Criar pacote e gerar contrato de teste, testar o link de assinatura.
4. Conferir a matricula e a conversao para aluno.
5. Registrar follow-up no CRM, alterar a data e marcar como realizado.

Nota: A conexao foi configurada e os arquivos foram verificados estaticamente. Login e operacoes reais dependem do seu Supabase e nao foram executados automaticamente nesta entrega.

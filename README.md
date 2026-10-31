# Campanella — Atualização V1.4.1

Atualização da V1.4 focada em fichas iniciais, Configurações e recuperação de senha.

## Instalação local

1. Extraia o ZIP em pasta separada ou substitua os arquivos do site **completos** pelos novos arquivos.
2. Não é necessário executar SQL nesta atualização. Não precisa alterar as funções `assinatura` e `entrevista` do Supabase.
3. Inicie o servidor local na pasta do `index.html`: `py -m http.server 8000`.
4. Abra `http://localhost:8000` e atualize com **Ctrl + Shift + R**.

## Mudanças

- **Leads:** botão Criar ficha salva a etapa e abre um popup; permite abrir a ficha ou gerar um convite escolhendo o professor. Ao gerar, aparece botão Copiar link. Não abre a ficha automaticamente.
- **Fichas iniciais:** nova coluna **Preenchimento** com `A preencher` (sem entrevista salva) ou `Preenchida` (entrevista salva). Mantém abas de andamento, desistência e arquivamento.
- **Configurações:** nova hierarquia visual e cards responsivos para assinatura, modelos DOCX, importação CSV e administradores.
- **Recuperação de senha:** botão **Esqueci minha senha** no login, envio do e-mail por Supabase Auth e formulário de nova senha após clicar no link do e-mail.

## Obrigatório para recuperar senha

No Supabase, acesse **Authentication → URL Configuration → Redirect URLs** e adicione:

`http://localhost:8000/?recuperar=1`

A URL precisa estar liberada para o envio de e-mails de recuperação. No futuro, adicione também o endereço da versão publicada (com `?recuperar=1`).

Confira se o serviço de e-mail do Supabase consegue enviar mensagens para a conta do administrador. O provedor padrão pode ter limites; para uso real, configure SMTP.

## Testes sugeridos

1. Crie um lead, clique em **Criar ficha**, confira o popup e **Abrir ficha**.
2. Crie outro lead e, no popup, selecione um professor, gere e copie o link de entrevista.
3. Entre na aba **Fichas iniciais** e confirme **A preencher**. Salve a entrevista e confirme **Preenchida**.
4. Acesse **Configurações** e confira em tela grande e pequena.
5. Saia da conta, clique em **Esqueci minha senha** e teste o e-mail e o link de recuperação. Se não houver e-mail configurado no Supabase, verifique os logs e o serviço de autenticação.

**Limites:** código validado estaticamente e páginas inspecionadas visualmente em dados de teste. Não houve integração real com seu projeto Supabase nesta etapa. Não envie CPF ou contratos reais em testes públicos.

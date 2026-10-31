# Campanella — Matrículas V1.4

Sistema em HTML, CSS e JavaScript, com banco e autenticação no Supabase. O site pode ser testado localmente, **sem GitHub Pages**. Atualização incremental da V1.3.

## Instalar sem perder dados

1. Faça um backup do projeto Supabase antes de executar mudanças em tabelas reais.
2. No Supabase, abra **SQL Editor → New query** e execute o conteúdo de **`sql/04_upgrade_v1_4.sql`**. Não apague nem recrie as tabelas antigas. **Execute apenas este arquivo** se você já instalou corretamente V1, V1.2 e V1.3.
3. Extraia este ZIP em **uma nova pasta** (não misture versões). Os arquivos HTML, CSS e JS já estão atualizados e incluem a correção do token de 64 caracteres para entrevista da V1.3.
4. Acesse a pasta que contém `index.html`. No Windows, abra o CMD ali e execute `py -m http.server 8000`. No macOS/Linux: `python3 -m http.server 8000`.
5. Abra **http://localhost:8000**, entre com seu administrador e pressione **Ctrl + Shift + R** para atualizar os arquivos do navegador.
6. **Não precisa publicar novamente as Edge Functions** `entrevista` e `assinatura` se elas já funcionavam na V1.3. Elas estão incluídas no ZIP para conservar o projeto completo.

> **Instalação do zero:** execute os SQLs `01_schema.sql`, `02_upgrade_v1_2.sql`, `03_upgrade_v1_3.sql` e `04_upgrade_v1_4.sql` nessa ordem. Depois configure as Edge Functions como indicado na documentação da V1.3.

## O que mudou

- **Leads → Fichas iniciais:** botão **Criar ficha** é o único disparador da fila. O registro entra na seção de fichas mesmo antes do preenchimento. Leads da V1.3 que já possuíam entrevista são preservados na nova fila.
- **Fichas iniciais:** abas **Em andamento**, **Desistiu** e **Arquivadas**; busca; ícones de edição, desistência, arquivamento e retomada no lado direito. Não há mais ação de visualizar ou copiar contrato na ficha.
- **Matricular:** depois de selecionar o modelo e salvar, abre automaticamente a tela com link para copiar. Ao copiar, o status muda de **A enviar** para **Enviado**. O link também pode ser gerado novamente a partir da aba Contratos ou do histórico do aluno.
- **Contratos:** abas **Em andamento**, **Encerrados** e **Cancelados**. Contrato assinado aparece no painel como **Ativo** durante a vigência ou **Expirado** se venceu. O banco mantém o status técnico `signed` e o instante `signed_at` para não quebrar a integração anterior. Encerramento continua explícito e arquiva histórico.
- **Após a assinatura:** o Supabase transforma o lead em aluno (`status = convertido`), e o frontend automaticamente retira esse nome de Leads e Fichas iniciais quando os dados são atualizados.
- **Perfil do aluno:** blocos de cadastro pessoal, responsável legal, dados contratuais e histórico. O horário atual fica em destaque e pode ser alterado sem mudar contratos assinados.
- **Assinatura pública:** formulário mobile-first em quatro etapas visuais, campos grandes, prévia do documento e assinatura por toque.

## Checklist de testes (dados fictícios)

1. Crie um lead. Verifique que **não** aparece em Fichas iniciais antes de clicar **Criar ficha**.
2. Clique **Criar ficha**. Confirme que entrou na aba **Em andamento**; use o link do entrevistador ou preencha a ficha como admin.
3. Marque **Desistiu**, confirme a outra aba, clique em **Retomar** e veja a ficha retornar.
4. Depois de preencher a ficha, clique **Matricular**, escolha o contrato e salve. **O link deve aparecer imediatamente**.
5. Clique **Copiar link**. Verifique em Contratos que o estado é **Enviado**.
6. Assine com aluno fictício, atualize o painel e confira: contrato **Ativo**, aluno cadastrado, lead fora da lista e ficha fora da fila.
7. No perfil do aluno, confira a separação entre informações pessoais e contratuais; edite o horário sem perder a tela e sem alterar o contrato histórico.
8. Confira a exibição da página de assinatura em um celular ou na emulação mobile do Chrome.

## Segurança e limites

- Não exponha chaves `service_role`, `sb_secret` ou outras chaves privilegiadas em HTML/JS.
- Links de entrevista e assinatura contêm tokens sensíveis; não compartilhe em prints públicos.
- O campo `signed` do banco indica um documento assinado; seu rótulo **Ativo** na interface depende também da data de vigência. Não elimine esse status do banco manualmente.
- A assinatura desenhada é modalidade eletrônica simples, sem verificação forte de identidade. Para uso real, revisar o procedimento jurídico e os controles de LGPD.
- O modelo de dupla permanece sem assinatura pública dos dois contratantes.
- Os arquivos foram testados quanto à sintaxe e à renderização de interface com dados fictícios. Ainda é necessário validar o fluxo completo com seu projeto Supabase.

# Campanella V2.1.2 — CRM, contratos e agendas de aulas

Sistema completo (HTML, CSS, JavaScript, Supabase) para a escola, preservando a V2 e o projeto conectado:
`https://tyxmskdgbnrcaacwwkhi.supabase.co`.

## INSTALAR — LEIA ANTES

1. Faça um backup do banco de dados no Supabase. **Não apague nenhuma tabela.**
2. No SQL Editor **do projeto já existente**, execute **somente** `sql/06_upgrade_contracts_schedule_v2_1.sql`.
3. Em Supabase → Edge Functions → `entrevista` → Code, **substitua** `index.ts` pelo `supabase/functions/entrevista/index.ts` deste ZIP e publique.
4. Faça o mesmo com a Edge Function `assinatura`, usando `supabase/functions/assinatura/index.ts`. Mantenha `Verify JWT` desativado (o código valida token secreto, e na entrevista também o código do professor).
5. Em Edge Functions → Secrets, confirme `APP_ORIGINS`, com `https://SEUUSUARIO.github.io` e/ou `http://localhost:8000` separados por vírgulas. **Não inclua o caminho do repositório**.
6. Extraia o ZIP completo **numa pasta nova**. Para teste local, execute `py -m http.server 8000` na pasta que contém `index.html` e abra `http://localhost:8000`.
7. Para GitHub Pages, publique o conteúdo dessa pasta na raiz de seu repositório e atualize a página com Ctrl+Shift+R. A chave no JS é publicável; nunca publique sua chave secreta/service_role.

Não execute novamente os SQLs 01–05 nem o 00_RECONSTRUIR_TUDO_V2 no banco com dados.

## Biblioteca de contratos

Menu lateral **Modelos de contratos**: visualize, edite, ative/desative e exclua modelos ainda não utilizados. Modelos já usados só podem ser arquivados, preservando seus contratos históricos. É possível relacionar o mesmo modelo a vários pacotes, mas cada pacote tem no máximo um modelo padrão.

Ao importar um **novo DOCX**, inclua ambos os marcadores especiais:

- `<<assinatura/contratado>>` — imagem do proprietário cadastrada em Configurações, na posição do marcador.
- `<<assinatura/contratante>>` — imagem desenhada pelo aluno/responsável ao assinar, na posição do marcador.

Use também `<<rg/contratante>>` e `<<mes/contratado>>` para criar campos adicionais. Os marcadores automáticos disponíveis incluem `<<grade_horarios/contratado>>`, `<<qtd_aulas/contratado>>`, `<<curso/contratado>>`, `<<valor_total/contratado>>`, `<<data_inicio/contratado>>` e `<<data_fim/contratado>>`.

**O projeto não inclui nenhuma imagem de assinatura padrão.** A assinatura do proprietário deve ser cadastrada pelo administrador em Configurações. Sem ela e o nome do proprietário, não será possível criar novos contratos.

**Atenção ao formato:** a cópia HTML assinada posiciona as duas imagens nos locais dos marcadores. No DOCX gerado antes da assinatura, a imagem do proprietário também é incorporada no marcador; a posição reservada ao aluno exibe uma indicação, pois ele ainda não assinou. O download do documento efetivamente assinado continua sendo HTML (imprimível em PDF). Não confunda esse HTML com um DOCX assinado.

O arquivo `exemplos/Modelo_de_Contrato_com_Marcadores.docx` é somente um exemplo estrutural, não um contrato juridicamente revisado.

## Pacotes e planos personalizados

Em **Pacotes**, cada pacote pode ter um contrato padrão ou deixar a escolha livre. Para um plano sem pacote, selecione **Personalizado · sem pacote** na ficha inicial, no formulário externo de entrevista ou na rematrícula. Informe a quantidade de aulas, frequência e valores; os cálculos de parcelas continuam disponíveis.

## Horários diferentes por dia

Na ficha, no link do entrevistador, no cadastro manual, na rematrícula e no perfil do aluno cada dia tem seu próprio campo de horário. Por exemplo, **terça 18:00** e **quinta 19:30**. A grade contratada é gravada no snapshot do contrato, separado do horário atual do aluno. Alterações no perfil não alteram contratos já assinados; a próxima rematrícula usa o horário atual.

O aluno visualiza a grade com destaque antes de assinar. Contratos antigos sem `lesson_schedule` são apresentados por compatibilidade com seus dias e horário anteriores.

## Limitações importantes

- Contratos de dupla seguem sem assinatura pública de duas pessoas.
- A visualização online de DOCX é uma conversão para HTML; pode diferir da diagramação original do Word.
- Este projeto foi validado por verificações sintáticas e testes unitários de grade e posicionamento HTML das assinaturas. A integração completa com seu Supabase **não foi testada diretamente**; teste com dados fictícios antes de usar contratos reais.
- A assinatura manuscrita simples não substitui revisão jurídica e verificação forte de identidade.

## Sequência recomendada de testes

1. Faça upload de um DOCX de teste com os dois marcadores de assinatura.
2. Associe-o a um pacote, prepare uma entrevista terça 18h e quinta 19h30.
3. Gere o contrato e confira se o modelo associado foi selecionado.
4. No link de assinatura, confira o destaque de terça e quinta com horários distintos.
5. Assine com dados fictícios; baixe o HTML e confira o local e a quantidade de assinaturas.
6. Edite o horário atual no perfil do aluno; confirme que o contrato antigo fica igual e que a rematrícula usa os novos horários.

## V2.1.1 — Biblioteca de contratos mais limpa

- A página **Modelos de contratos** usa cartões organizados com ações de visualizar, editar, ativar/desativar e excluir/arquivar.
- Removidas as instruções repetidas da biblioteca, do formulário DOCX e de **Configurações**.
- Novo link **Tutorial de contratos** na biblioteca, no formulário de cadastro/edição e em Configurações. O tutorial abre a página `ajuda-contratos.html` em outra aba, para não perder o preenchimento do formulário.
- O tutorial explica preparação do Word, marcadores `<<campo/contratante>>` e `<<campo/contratado>>`, assinatura em posições definidas, vínculo a pacotes e checagem.
- **Atualização exclusivamente de interface:** não precisa de SQL adicional nem republicar Edge Functions se você já instalou a V2.1.
- Substitua a pasta publicada pelo conteúdo deste ZIP completo. Não misture arquivos de versões diferentes.

## V2.1.2 — Tutorial de campos personalizado

- A ajuda em `ajuda-contratos.html` agora prioriza a regra **`<<nome_campo/quem_preenche>>`**, exibida em uma área visual com a explicação de cada componente.
- Explica que qualquer campo pode ser criado, desde que o nome siga as regras do importador DOCX (2–40 caracteres, letra minúscula inicial, depois letras minúsculas, números e `_`). O termo `assinatura` é reservado.
- Exibe as duas opções `contratante` (aluno/responsável) e `contratado` (escola/administração).
- Inclui um gerador interativo no tutorial: escolha o nome e quem preenche; valide e copie o marcador para colar no Word.
- Os exemplos aparecem depois da fórmula e estão explicitamente identificados como sugestões.
- Apenas a página de ajuda e seu CSS foram alterados. **Não execute nenhum SQL nem atualize as Edge Functions para esta versão.**
- Faça upload de **todo o conteúdo** desta pasta no GitHub Pages, substituindo a versão anterior. Os dados ficam no mesmo Supabase; não são apagados.

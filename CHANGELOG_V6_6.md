# Campanella V6.6 — Calendário, fichas e matrículas

## Mudanças

- Seleção por **grade semanal visual** (dias em colunas, horas em linhas, blocos disponíveis/ocupados/selecionados) na ficha inicial interna, na ficha por link, na matrícula/pré-matrícula e na alteração de professor/horários do aluno. Em telas pequenas, a grade permite rolagem horizontal.
- Limite de seleção conforme a quantidade de aulas semanais do pacote. Os horários da ficha são inicialmente selecionados e ficam protegidos no formulário de matrícula, até clicar em **Alterar horários**. Após confirmação, a matrícula passa a ser a referência dos horários oficiais; a ficha antiga é apenas registro histórico.
- Reagendamento **individual** com calendário **real e datado** do professor, navegação por semanas e meses, distinção visual entre blocos disponíveis, ocupados e bloqueados. A aula recorrente não é alterada; Supabase revalida disponibilidade.
- Em **Horários**, a grade recorrente exibe o aluno associado ao bloco habitual e as vagas disponíveis. O administrador também tem a visão por professor.
- Em **Fichas Iniciais** e **Fichas em andamento**, ações por menu dropdown com texto e atalho **Abrir contrato** quando houver vínculo.
- Menus de ações do perfil do aluno podem se sobrepor corretamente aos cards e seções recolhíveis.
- Menos textos explicativos internos; alertas relevantes permanecem. Confirmações usam modais internos, sem `window.confirm`, `window.alert` ou `window.prompt`.
- A AssinAPI e o Google Drive continuam desativados, preservados e sem alterações nos componentes existentes.

## Instalação e testes locais

1. Faça backup do banco de dados do Supabase e utilize uma escola e alunos **de teste**. Rodar o frontend em localhost não isola o banco real.
2. Confirme as migrações anteriores (V6.0, V6.1, V6.3, V6.4 e V6.5) e a Edge Function `entrevista` V6.5, necessária para os links públicos da ficha.
3. Execute **somente** o arquivo SQL complementar `Campanella_V6_6_migracao.sql`, entregue fora do ZIP. Cria/substitui apenas uma função `calendar_weekly_roster` que verifica a escola e as permissões do usuário autenticado. Não cria ou exclui tabelas.
4. Extraia o ZIP em uma nova pasta e abra o PowerShell dentro de `campanella`:
   `npx --yes http-server . -p 8000 -a 127.0.0.1 -c-1`
5. Acesse `http://127.0.0.1:8000` e faça uma matrícula **de teste**: entrevista com 2 horários, contrato com horários inicialmente travados, alteração confirmada, grade do professor com aluno, reagendamento em outra semana e menu de ações do perfil.

## Limitações da validação

Testes automatizados e revisão de interface não substituem testes com o Supabase real. A migração SQL e a visualização de nomes na grade precisam ser validadas com contas de professor e administrador, inclusive permissões entre escolas, antes da publicação. Os contratos já assinados não são reescritos.

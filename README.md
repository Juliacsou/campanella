## Campanella V6.10 — UX da importação de alunos e matrículas

- Todas as páginas do assistente de importação têm títulos, instruções e escolhas mais fáceis de localizar.
- A opção de limpar dados opcionais inválidos explica que esses campos ficarão vazios e os alunos passarão a cadastros incompletos; há confirmação antes da limpeza.
- Ao mudar de etapa, a página volta ao topo automaticamente.
- Mudanças somente na interface do assistente (JS e CSS). A V6.10 não exige novo SQL.
- Continuam válidas as instalações de banco feitas para V6.7 e as integrações preservadas da V6.9.

**Versão V6.9:** consulte `CHANGELOG_V6_9.md` para o novo assistente de Importação de Alunos e Matrículas. Sem migração SQL adicional.

# Campanella V6.8

Atualização do assistente de implantação: prévia completa de CSV, correção manual de erros, recuperação de rejeitados, complementação por `aluno_id` e quatro etapas separadas. Veja `CHANGELOG_V6_8.md`. **Sem novo SQL; exige as migrações instaladas até V6.7.**

# Campanella V6.7 — Assistente de implantacao

**Versao atual para testes locais: V6.7.** Inclui um guia em Configuracoes da escola para importar alunos com nome + telefone e preparar matriculas em lote, validando professor, horarios e frequencia na grade real. Veja [CHANGELOG_V6_7.md](CHANGELOG_V6_7.md).

**Migracao:** instalar apenas `Campanella_V6_7_migracao.sql` **separadamente**, apos backup e apos as migracoes V6.0 a V6.6. **O ZIP nao contem SQL**. Nao publicar antes da homologacao de RLS e conflitos de horarios no Supabase.

---

# Campanella V6.6 — Calendários visuais e ações integradas

**Versão atual para homologação: V6.6.** Esta versão usa como base a V6.5 e exige que as migrações anteriores e a Edge Function `entrevista` atualizada da V6.5 já estejam instaladas. Consulte [`CHANGELOG_V6_6.md`](CHANGELOG_V6_6.md).

**Entrega:** o ZIP contém somente o projeto, sem migrações SQL. Execute o `Campanella_V6_6_migracao.sql` entregue separadamente após backup do Supabase; ele acrescenta a consulta segura de alunos na grade semanal, sem modificar matrículas ou contratos existentes. Teste localmente antes de publicar no GitHub.

---

# Campanella V6.5 — Entrevistas com calendário integrado

A atualização V6.5 separa o **professor entrevistador** do **professor responsável pelo aluno** e permite escolher dois ou mais horários recorrentes diretamente da grade deste último. Corrige também a incompatibilidade entre o formulário público da ficha e a Edge Function de entrevista.

**Instalação:** siga o arquivo [`CHANGELOG_V6_5.md`](CHANGELOG_V6_5.md). Execute o SQL V6.5 entregue **separadamente** e atualize a Edge Function `entrevista` antes de testar o link. O SQL não está no ZIP.

---

# Campanella — contexto técnico do projeto

**Histórico da V6.4:** perfil por seções e transferência docente. Requer as migrações V6.0, V6.1 e V6.3 e a migração V6.4 entregue separadamente. Os arquivos históricos permanecem descritos abaixo; não publicar sem homologação.

## Produto atual

CRM escolar multi-escolas: lead → ficha/entrevista → pré-matrícula → contrato gerado → assinatura obtida fora do Campanella → registro administrativo de assinatura → aluno matriculado. Matrículas, rematrículas, contratos DOCX/PDF, licenças e gestão multi-escolas da V5.6 são preservados.

A V6 acrescentou um módulo de **calendário de aulas** em `js/calendar-v6.js` e `css/calendar-v6.css` (migrações sempre fora do ZIP):

- Portal de professor por convite exclusivo, token único de 7 dias e confirmação do e-mail. A conta docente fica vinculada a `calendar_teacher_users`, nunca a `school_members`. O professor só acessa o próprio calendário e dados mínimos de contato de seus alunos; administrador tem visão de todos. Admin pode associar a própria conta a professor via convite.
- Grade semanal de horários individuais de 15 a 240 minutos (padrão 60) e horários avulsos; agenda diária, semanal e mensal; bloqueios de escola e professor, de dia inteiro ou intervalos de horas.
- Cada matrícula V6 cria ocorrências individualizadas de aulas. Conflitos e feriados são validados no Supabase; a última aula calcula automaticamente a data final do contrato, com opção de data contratual posterior escolhida manualmente. Os dados de cálculo ficam registrados em `terms.calendar_v6`, separados da vigência contratual.
- Férias, recessos ou bloqueios criados após agendamento colocam cada aula afetada em **reagendamento pendente**, sem gerar reposições automáticas. O professor combina cada nova data com seu aluno, pode criar horário avulso e reagenda individualmente. Aula mantém número, histórico, crédito e libera o horário anterior.
- Registros de aula realizada, falta que consome crédito e falta que mantém crédito. O total de aulas realizadas não se altera só por passagem do tempo. Pré-reservas de contratos não assinados expiram em 14 dias e deixam pendências sem apagar contratos.
- Contratos legados assinados **não são reescritos nem convertidos automaticamente**: o administrador pode importar explicitamente uma matrícula antiga para o calendário, informando as aulas já realizadas e os horários das aulas futuras. Aulas passadas não são fabricadas; saldos legados declarados são identificados separadamente.

## V6.1: alterações de interface e consistência

- Motivos padronizados de bloqueio em dropdown; confirmações internas do Campanella, inclusive quando há aulas afetadas.
- Bloqueios de dia inteiro cinza no calendário e visão semanal proporcional para consultar as aulas.
- Portal do professor dividido no menu em Agenda, Reagendamentos, Alunos, Horários, Bloqueios e Configurações (nome, senha e recuperação por e-mail).
- Admin, ao abrir o calendário, passa a ver o menu principal apenas com ícones e um menu secundário por área.
- Ações de professores reunidas em dropdown; ações de aulas também agrupadas. Menos textos de instrução.
- Alunos clicáveis por **identificador da matrícula**, com contato e botão WhatsApp. Dados provenientes de `calendar_overview`, com totais por matrícula, ocorrências e professor; a edição do cadastro do aluno não sobrescreve o horário da agenda.
- Aulas realizadas e faltas que consomem crédito são contadas separadamente, via migração SQL V6.1. Não há movimentação automática de aulas bloqueadas.
- Ficha/entrevista do professor por link de token único, sem código adicional. O frontend e a Edge Function `supabase/functions/entrevista/index.ts` precisam ser atualizados **em conjunto** para ativar esse fluxo no ambiente remoto.

## Instalação e testes

1. Fazer backup do Supabase. A V6.0 (SQL 14) é pré-requisito e **não deve ser executada de novo**.
2. Se ainda não foi executada, aplicar a migração **V6.1** entregue anteriormente, separada do ZIP. Ela atualiza `calendar_overview` e a alteração de nome do professor. **Não executar novamente** se já está instalada. Para instalar a V6.3, executar **somente** o arquivo separado `Campanella_V6_3_migracao.sql`, uma vez, com backup recente.
3. Executar a migração incremental V6.3 em ambiente de teste, revisar o resultado e **só então** extrair o ZIP localmente. Na pasta `campanella`, usar `npx --yes http-server . -p 8000 -a 127.0.0.1 -c-1` e acessar `http://127.0.0.1:8000`.
4. Testar com uma escola fictícia. O frontend local continuará conectado ao Supabase configurado no projeto; evitar dados reais. Apenas depois da homologação publicar frontend e fazer deploy da Edge Function de entrevista.
5. Testes locais de interface (sem banco): `node tests/v6_calendar_smoke.mjs`, `node tests/v6_1_adjustments_smoke.mjs` e `node tests/v6_2_schedule_smoke.mjs` e `node tests/v6_3_student_schedule_smoke.mjs`. Testes de regressão históricos que leem SQL exigem as migrações arquivadas **fora** deste pacote. Não substituem teste real de RLS, concorrência de reservas e convites.

**Padrão de entregas:** não incluir arquivos `.sql` nos ZIPs das próximas versões; fornecer migrações como arquivos separados ou texto na conversa. Manter o SQL incremental; nunca executar `00_RECONSTRUIR_TUDO_V2.sql` em banco existente.

## Integrações suspensas, preservadas

AssinAPI e backup no Google Drive foram desenvolvidos anteriormente para uso futuro. Seus códigos em `supabase/functions/contract-signing`, `assinapi-webhook`, `assinatura`, `google-drive-oauth`, `google-drive-backup` e `_shared/v5.ts` **não devem ser apagados nem ativados neste lançamento**. O frontend continua com `EXTERNAL_SIGNATURE_ENABLED=false`, e novas assinaturas por API exigem a configuração explícita `CAMPANELLA_SIGNATURES_ENABLED=true` no backend (não configurar na V6). Dados de assinaturas anteriores permanecem preservados.

## Limites e próximos testes de homologação

- Sem acesso ao banco de produção ou ambiente real nesta entrega: migração SQL e fluxos de autenticação/convite, RLS, slots concorrentes e gatilhos de confirmação manual precisam ser validados em uma escola fictícia antes da publicação.
- A modalidade dupla exige tratamento próprio para múltiplos alunos; não presumir suporte completo ao novo calendário para contratos de dupla.
- Não existem e-mails automáticos de agendamento nem integração externa de agenda ou assinatura eletrônica na V6.3.
- Reagendamentos não mudam automaticamente o texto de contratos já assinados. Se a programação real ultrapassar a vigência assinada, o administrador deverá avaliar o ajuste contratual cabível.

Preferências do projeto: entregar somente código no ZIP; SQL separado (preferencialmente na conversa) apenas quando houver migração. Guardar aqui apenas o contexto técnico necessário.


## V6.2 — Grade semanal recorrente

- **Horários**: grade semanal interativa de segunda a domingo, com escala por hora. Clique em uma faixa de tempo para criar horário fixo recorrente (duração inicial de 60 minutos, editável). Clique em um cartão existente para consultar ou desativar. O administrador precisa selecionar um professor específico para editar a grade.
- **Agenda**: permite consultar aulas, bloqueios e reagendamentos nas visões diária, semanal e mensal. A criação de disponibilidade **avulsa** é feita pelo botão «Horário avulso» com data específica. A grade da Agenda não cadastra horários semanais.
- **Ícones**: menus do professor e do administrador utilizam os mesmos SVGs internos das demais áreas Campanella; sem emojis.
- **Banco de dados**: atualização só de frontend, sem necessidade de SQL adicional para quem já instalou V6.1.

## V6.3 — Vínculo aluno/professor/agenda e perfil integral

- **Horários**: clique no bloco semanal e escolha **Editar horário**. Dia, hora e duração podem mudar. Antes de gravar, um diálogo **do próprio Campanella** mostra quantas aulas futuras e alunos serão afetados. A operação SQL é transacional: se houver conflito irresolúvel, **nenhuma modificação parcial é salva**. Aulas passadas, concluídas e reagendadas individualmente não são movidas. Ao editar o horário do professor, as próximas aulas vinculadas ao slot passam para o novo horário.
- **Professor do aluno**: `students.calendar_teacher_id` registra o professor responsável, sincronizado com matrículas V6. Contratos históricos preservam o professor original. O formulário de cadastro solicita professor; o de matrícula utiliza obrigatoriamente os horários da grade do professor, permitindo 2 ou mais horários semanais diferentes.
- **Troca individual**: dentro da página do aluno, **Alterar horários** permite selecionar outros horários fixos do mesmo professor (inclusive 2 vezes na semana); atualiza somente as aulas futuras daquele aluno. O saldo contratado e as aulas concluídas são preservados. O novo vínculo fica em `students.calendar_slot_ids` e as ocorrências recebem `calendar_lessons.slot_id`.
- **Perfil como página**: administradores acessam em **Alunos → Abrir perfil**; professores em **Calendário → Alunos → Ver aluno**. A mesma consulta SQL `calendar_student_profile` lista **todas** as aulas, não apenas as do mês exibido no calendário. Separa próximas, passadas/realizadas/faltas, pendências, histórico de mudanças e contatos; o administrador também vê cadastro e contratos. Professor não recebe CPF, valores financeiros ou endereços pelo endpoint docente.
- **Migração**: SQL **fora do ZIP** em `Campanella_V6_3_migracao.sql`; altera apenas estruturas de agenda e vínculo, preservando o texto de contratos assinados e a assinatura por API desativada. Não execute `00_RECONSTRUIR_TUDO_V2.sql`.

### Homologação recomendada (em escola de teste)

1. Criar um professor com segunda 09:00 e sexta 18:00. Criar aluno com 2 aulas semanais, vinculando os dois horários no formulário da matrícula.
2. Conferir se a página do aluno mostra todas as aulas em ordem, inclusive as de outros meses.
3. Alterar o horário de segunda para outra hora; confirmar o aviso, verificar mudança nas aulas futuras do aluno e preservar as concluídas.
4. Alterar apenas os horários do aluno na página dele; comprovar que outro aluno do mesmo professor não foi alterado.
5. Criar recesso e reagendar uma aula individualmente; comprovar que a alteração geral posterior **não sobrescreve** esse reagendamento.
6. Entrar como professor convidado, validar contatos mínimos e impedir consulta a alunos de outros professores.
7. Simular um conflito de horários; confirmar que a transação reverte integralmente.

**Limitação**: os testes automatizados locais validam interface e contratos de chamadas, mas não executam as RPCs reais nem substituem homologação no Supabase. A importação histórica de aulas anteriores à V6 exige confirmação explícita de saldo. Não modifica contratos anteriores.

## V6.4 — Perfil organizado e transferencia de professor

- **Perfil do aluno**: dados cadastrais ficam visíveis primeiro. Em seguida há duas seções recolhíveis: **Contratos e Matrículas** e **Aulas e Horários**, fechadas inicialmente. Dentro delas ficam as mesmas ações e registros anteriores, incluindo todas as aulas e seu histórico. O professor vê apenas informações básicas; o administrador vê o cadastro e os contratos completos.
- **Troca de professor**: na seção Aulas e Horários → Alterar professor e horários, o administrador pode selecionar outro professor da mesma escola. O formulário então exibe **somente** os horários ativos do professor selecionado. Se selecionar o mesmo professor, muda apenas os horários do aluno. Professores não podem transferir alunos para outros professores.
- **Confirmação interna obrigatória** antes da troca. A RPC `calendar_update_student_schedule` faz a alteração em transação, verifica escola, autorização, grade, disponibilidade e conflito. Se houver falha, a alteração inteira é revertida.
- **Preservação do histórico**: aulas concluídas permanecem associadas ao docente que as ministrou e contratos assinados permanecem imutáveis. Aulas futuras regulares são redistribuídas para o novo docente; reagendamentos individualmente combinados passam a *pendente de reagendamento* e devem ser combinados novamente com o aluno.
- **Sincronização**: a lista de alunos e a página de perfil usam o docente atual (`students.calendar_teacher_id`), preservando em cada contrato o professor histórico. O acesso ao perfil por professor é autorizado pelo vínculo docente atual, não apenas por contratos passados. O painel administrativo atualiza o snapshot da agenda quando o aluno é aberto pela área Alunos.
- **Banco**: execute `Campanella_V6_4_migracao.sql` **fora do ZIP**, após backup, somente uma vez, antes de testar o frontend local. A função é idempotente com `CREATE OR REPLACE FUNCTION`; não cria/apaga tabelas. Os fluxos reais SQL, RLS e conciliação dos contratos devem ser testados em escola fictícia.
- **Teste**: `node tests/v6_4_profile_transfer_smoke.mjs` para o frontend; o SQL de verificação (separado) pode ser conferido com `node tests/v6_4_sql_contract_smoke.mjs /caminho/Campanella_V6_4_migracao.sql`.

### Roteiro de teste V6.4

1. Criar dois professores com horários semanais diferentes e aluno matriculado com um deles.
2. Abrir perfil em Alunos e no calendário docente; cadastro deve aparecer primeiro, com duas seções recolhíveis.
3. Na administração, em Aulas e Horários, trocar professor e selecionar 2 horários da nova grade; conferir confirmação obrigatória.
4. Verificar novo professor no cadastro, na lista de alunos e nas aulas futuras, sem modificar contratos já assinados nem aulas já realizadas.
5. Criar reagendamento individual futuro ANTES da transferência; depois transferir e conferir sua pendência individual.
6. Testar colisão com outro aluno, férias, escola errada e login do antigo professor. A operação em conflito deve ser rejeitada integralmente e o docente antigo não pode consultar o perfil atual do aluno.

Não publicar sem homologar com o Supabase. **Integrações AssinAPI e Google Drive seguem preservadas e desativadas.**

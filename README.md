# Campanella — Contexto Técnico e Documentação do Projeto (V7.0)

CRM escolar multi-escolas com gestão comercial, matrículas, geração de contratos (DOCX/PDF), controle de licenças, assistente de importação em massa e módulo integrado de calendário pedagógico.
A versão **V7.0** introduz o redesign visual completo baseado no **Vision UI Dashboard React** (Creative Tim), unificando dois temas completos (Dark Mode padrão e Light Mode alternativo).

Fluxo principal:
`lead → ficha/entrevista → pré-matrícula → contrato gerado → assinatura obtida fora do Campanella → registro administrativo de assinatura → aluno matriculado`

---

## 1. Arquitetura Funcional e Regras de Negócio

### Portal do Professor e Permissões
- **Acesso docente:** convite exclusivo com token único de 7 dias e confirmação de e-mail. A conta fica vinculada a `calendar_teacher_users` (nunca a `school_members`). O administrador pode associar a própria conta a um perfil de professor via convite.
- **Escopo de visualização:** o professor acessa apenas o próprio calendário e dados mínimos de contato de seus alunos (o endpoint docente não expõe CPF, valores financeiros ou endereços). O administrador possui visão completa de todos os professores, alunos e contratos da escola.
- **Navegação:** portal do professor dividido em *Agenda*, *Reagendamentos*, *Alunos*, *Horários*, *Bloqueios* e *Configurações* (nome, senha e recuperação por e-mail).

### Grade Semanal (`Horários`) e `Agenda`
- **Horários (grade recorrente):** grade semanal interativa de segunda a domingo (blocos de 15 a 240 minutos, padrão de 60 minutos). Exibe os alunos associados aos blocos habituais e as vagas disponíveis (`calendar_weekly_roster`).
- **Edição de horário fixo:** operação SQL transacional com aviso prévio de aulas e alunos afetados. Move apenas aulas futuras regulares vinculadas ao slot (`calendar_lessons.slot_id`), preservando aulas passadas, concluídas ou reagendadas individualmente. Se houver conflito irresolúvel, nenhuma alteração parcial é salva.
- **Agenda:** consulta de aulas, bloqueios e reagendamentos nas visões diária, semanal e mensal, além da criação de disponibilidade pontual pelo botão **Horário avulso** (com data específica).

### Fichas Iniciais e Entrevistas (`entrevista`)
- **Separação de papéis:** o **professor entrevistador** (`interviews.interviewer_teacher_id`) e o **professor responsável pelas aulas** são campos distintos.
- **Link público de uso único:** validado pela Edge Function `supabase/functions/entrevista/index.ts`, que utiliza `service_role` restrita ao token e à escola indicada (sem expor chave privilegiada ou nomes de outros alunos no navegador).
- **Grade visual na ficha:** tanto a ficha interna quanto o link público consultam a grade semanal real do professor responsável, permitindo selecionar dois ou mais horários recorrentes conforme o pacote (`interviews.calendar_slot_ids`) e calculando a previsão de término (considerando bloqueios, recessos e ocupação).
- **Previsão vs. Reserva:** a seleção na ficha é apenas uma previsão e **não reserva a vaga**. Os horários ficam pré-selecionados e protegidos ao abrir a matrícula (editáveis pelo botão **Alterar horários**), sendo reservados e revalidados no momento em que o contrato é criado.

### Matrículas, Contratos e Ocorrências de Aulas
- **Vínculo oficial:** após confirmada a matrícula, ela passa a ser a referência oficial de horários (`students.calendar_teacher_id` e `students.calendar_slot_ids`), mantendo a ficha apenas como registro histórico.
- **Ocorrências e vigência:** cada matrícula cria ocorrências individualizadas de aulas com validação de conflitos e feriados no Supabase. A última aula calcula automaticamente a data final sugerida, registrando a memória de cálculo em `terms.calendar_v6` separadamente da vigência contratual.
- **Pré-reservas:** pré-reservas de contratos ainda não assinados expiram em 14 dias, gerando pendência sem apagar o contrato.
- **Frequência e créditos:** registros separados para *aula realizada*, *falta que consome crédito* e *falta que mantém crédito* (totais consolidados via `calendar_overview`). O saldo de aulas realizadas não muda automaticamente apenas pela passagem do tempo.
- **Bloqueios e reagendamentos:** férias, recessos ou bloqueios (de escola ou professor, dia inteiro ou faixa de horário) colocam as aulas afetadas em **reagendamento pendente**, sem gerar reposições automáticas. O reagendamento individual usa o calendário real e datado do professor, mantendo número da aula, histórico e crédito, liberando o horário anterior e sem alterar a grade recorrente ou o texto de contratos já assinados.
- **Contratos legados:** contratos antigos assinados não são convertidos nem reescritos automaticamente; o administrador pode importá-los explicitamente para o calendário informando o saldo de aulas já realizadas e os horários das aulas futuras.

### Perfil do Aluno e Transferência de Professor
- **Perfil em página (`calendar_student_profile`):** exibe os dados cadastrais primeiro, seguidos por duas seções recolhíveis (*Contratos e Matrículas* e *Aulas e Horários*), listando todas as aulas do aluno (próximas, realizadas/faltas, pendências e histórico de mudanças), além de atalho para WhatsApp.
- **Alteração de horários e transferência docente (`calendar_update_student_schedule`):** na seção *Aulas e Horários → Alterar professor e horários*, o administrador pode trocar os horários fixos do aluno ou transferi-lo para outro professor da mesma escola mediante confirmação interna obrigatória.
  - A operação é transacional (reverte integralmente em caso de conflito, férias ou falha de permissão).
  - Aulas concluídas e contratos assinados preservam o professor histórico original.
  - Aulas futuras regulares são redistribuídas para a grade do novo professor; reagendamentos individuais futuros passam para *pendente de reagendamento*.
  - Professores não podem transferir alunos para outros docentes, e o professor anterior perde o acesso ao perfil atual após a transferência.

### Assistente de Importação de Alunos e Matrículas (`js/onboarding-v67.js`)
Acessível em **Configurações da escola → Importar alunos e matrículas**, com três fluxos de entrada:
1. **Começar nova importação de alunos (assistente em 5 etapas):**
   - *Etapa 1 — Enviar CSV:* exige apenas `nome_completo` e `telefone` (com DDD) para novo cadastro, com mapeamento visual de colunas e prévia integral.
   - *Etapa 2 — Erros:* permite corrigir manualmente, reenviar CSV, pular com confirmação ou usar **Deixar campos inválidos em branco** (com alerta e confirmação explícita sobre perda apenas dos campos opcionais inválidos).
   - *Etapa 3 — Incompletos:* preenchimento manual ou via CSV (`linha_csv`) na mesma sessão, ou opção de completar posteriormente.
   - *Etapa 4 — Cadastro final:* resumo e confirmação para salvar cadastros básicos (com dedupe no Supabase por `aluno_id`, CPF ou nome + telefone/e-mail na mesma escola).
   - *Etapa 5 — Matrículas:* preparação individual ou em lote com validação na grade do professor.
2. **Completar cadastros em massa:** exporta e reimporta CSV identificado obrigatoriamente por `aluno_id` e `informacoes_faltantes`. Preenche apenas lacunas sem criar cadastros novos nem sobrescrever dados já preenchidos.
3. **Cadastrar matrículas em massa:** recebe CSV com professor, pacote, horários (ex.: `Seg 09:00 | Qui 14:00` ou UUIDs dos slots), início e dados financeiros. A RPC `onboarding_prepare_enrollment` revalida escola, professor, horários da grade semanal, disponibilidade real, feriados e frequência do pacote. Linhas com conflito falham individualmente sem criar contrato; linhas válidas geram pré-matrícula para assinatura manual (nunca marcam contratos como `signed` automaticamente). Limite de até 1.000 registros por arquivo (enviados em lotes de até 200).

### Padrões de Interface
- Confirmações e alertas utilizam exclusivamente modais internos do Campanella (sem uso de `window.confirm`, `window.alert` ou `window.prompt`).
- Menus e ícones utilizam SVGs internos padronizados.

---

## 2. Integrações Suspensas (Preservadas)

Os módulos de assinatura eletrônica (**AssinAPI**) e backup no **Google Drive** (`supabase/functions/contract-signing`, `assinapi-webhook`, `assinatura`, `google-drive-oauth`, `google-drive-backup` e `_shared/v5.ts`) permanecem preservados no repositório para uso futuro, mas **desativados**:
- No frontend ([`js/app.js`](js/app.js)): `EXTERNAL_SIGNATURE_ENABLED = false`.
- No backend: novas assinaturas via API exigem a variável explícita `CAMPANELLA_SIGNATURES_ENABLED=true` (não habilitar na série V6). Dados de assinaturas anteriores seguem preservados.

---

## 3. Banco de Dados, Migrações e Deploy

### Regras de Migração SQL
- **Nunca executar [`sql/00_RECONSTRUIR_TUDO_V2.sql`](sql/00_RECONSTRUIR_TUDO_V2.sql) em um banco existente.**
- As migrações da série V6 são **incrementais** e aplicadas no SQL Editor do Supabase sempre após backup:
  1. Base V6.0 (`SQL 14`) + `V6.1` (`calendar_overview` e ajustes docentes) + `V6.3` (vínculo `slot_id` e `calendar_student_profile`) + `V6.4` (`calendar_update_student_schedule`).
  2. `Campanella_V6_5_migracao.sql`: adiciona `interviews.interviewer_teacher_id`, `interviews.calendar_slot_ids` e função de previsão restrita à `service_role`.
  3. `Campanella_V6_6_migracao.sql`: cria/atualiza `calendar_weekly_roster` para consulta segura de alunos na grade semanal conforme escola e permissões.
  4. `Campanella_V6_7_migracao.sql`: instala as RPCs de importação assistida de alunos, complementação por `aluno_id` e preparação de matrículas em lote (`onboarding_prepare_enrollment`). As versões V6.7.1 a V6.10 não exigem SQL adicional.
- Padrão de pacotes ZIP: entregar apenas o código no ZIP e manter arquivos `.sql` de migração separados.

### Edge Functions (Supabase)
Para que o link público de ficha/entrevista funcione em conjunto com o frontend atual, mantenha a função `entrevista` atualizada:
```powershell
npx supabase functions deploy entrevista --no-verify-jwt
```

---

## 4. Execução Local e Testes

### Servidor Local
Na raiz da pasta `campanella`, execute:
```powershell
npx --yes http-server . -p 8000 -a 127.0.0.1 -c-1
```
Acesse `http://127.0.0.1:8000`.

> **Atenção:** o frontend local conecta-se ao projeto Supabase configurado em [`js/app.js`](js/app.js). Sempre realize homologações em uma **escola fictícia / alunos de teste** e com backup recente do banco antes de publicar alterações no GitHub.

### Testes Automatizados Locais (Smoke Tests)
Os testes na pasta [`tests/`](tests/) validam contratos de interface e regras de frontend sem depender de conexão ao banco:
```powershell
node tests/v6_calendar_smoke.mjs
node tests/v6_1_adjustments_smoke.mjs
node tests/v6_2_schedule_smoke.mjs
node tests/v6_3_student_schedule_smoke.mjs
node tests/v6_4_profile_transfer_smoke.mjs
node tests/v6_5_interview_schedule_smoke.mjs
node tests/v6_6_visual_calendar_smoke.mjs
node tests/v6_7_onboarding_smoke.mjs
node tests/v6_8_import_recovery_smoke.mjs
node tests/v6_9_import_wizard_smoke.mjs
node tests/v6_10_import_ux_smoke.mjs
```

### Limites Conhecidos e Homologação
- Os testes automatizados locais não executam as RPCs reais no Postgres nem substituem a homologação de RLS, concorrência de vagas, convites e permissões entre escolas no Supabase real.
- Modelos DOCX com campos personalizados ou pacotes na modalidade **dupla** exigem fluxo individual (não suportados na importação de matrículas em lote).
- Dados em edição no assistente de importação antes do cadastro final não são persistidos no servidor; baixe os CSVs de pendências antes de fechar a página.
- Não há disparo automático de e-mails de agendamento nem reescrita automática de contratos já assinados após reagendamentos.

---

## 5. Campanella V7 — Design System Vision UI (Dark & Light Mode)

A versão **V7** traz a transformação estética completa do Campanella inspirada no **Vision UI Dashboard React** (Creative Tim), oferecendo uma experiência futurista, premium e profissional para a gestão escolar.

### 5.1. Conceito Visual & Paleta Semântica
- **Estética:** Dark Futuristic / Premium SaaS / Glassmorphism / Deep Navy / Electric Blue.
- **Camadas de Profundidade:**
  - Base N0: `#060B1F` (Dark) / `#F5F7FC` (Light)
  - Card N1: `#080F2B` (Dark) / `#FFFFFF` (Light)
  - Superfície Elevada N2: `#0B1437` (Dark) / `#FFFFFF` (Light)
  - Superfície Flutuante N3: `#101C44` (Dark) / `#FFFFFF` (Light)
  - Inputs & Campos: `#0C1735` (Dark) / `#F8FAFD` (Light)
  - Hover: `#172650` (Dark) / `#EEF2FA` (Light)
- **Acentos Elétricos:** Primary Blue (`#0075FF`), Electric Cyan (`#21D4FD`), Light Blue (`#55C1FF`), Purple (`#7551FF`).
- **Estados Semânticos:** Sucesso (`#01B574`), Atenção (`#FFB547`), Erro (`#F56565`), Informação (`#21D4FD`).

### 5.2. Alternância Instantânea e Paridade entre Temas
- **Persistência Local:** Salvo em `localStorage` sob a chave `campanella:theme`.
- **Anti-flash:** Script síncrono no topo de `<head>` em `index.html` e `ajuda-contratos.html` que aplica `data-theme` antes do primeiro paint, eliminando qualquer cintilação branca.
- **Alternador Rápido:** Botão no topo do cabeçalho com ícones SVG animados de Sol e Lua, sem recarregar a página.

### 5.3. Isolamento Físico de Contratos Jurídicos
- **Regra de Fidelidade Legal:** Toda visualização de contrato, comprovante e documento impresso (`.legal-document`, `.doc-frame`) preserva fundo de papel branco absoluto (`#FFFFFF`) e tipografia de alto contraste (`#1A2340`) em ambos os modos, assegurando a validade jurídica e a legibilidade na impressão física.

### 5.4. Como Iniciar Localmente no Windows
1. **Opção 1 (1 clique):** Dê dois cliques em [`iniciar.bat`](iniciar.bat).
2. **Opção 2 (PowerShell):**
   ```powershell
   cd C:\Users\Julia\Downloads\campanella-v7
   npx.cmd --yes http-server . -p 8001 -a 127.0.0.1 -c-1
   ```
   *Nota: O uso de `npx.cmd` evita o bloqueio padrão da política de execução de scripts `.ps1` do PowerShell.*
   Acesse no navegador: `http://127.0.0.1:8001`.

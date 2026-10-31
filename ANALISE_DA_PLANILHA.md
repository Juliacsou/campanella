# Leitura da planilha da escola — diagnóstico para o CRM

A análise considerou a aba **Leads** do arquivo original. As outras abas tratam de alunos, indicações, dados geográficos e financeiro; não foram convertidas em registros de CRM nesta atualização.

A aba Leads contém **56 contatos** nomeados. O status original foi preservado na importação, mas mapeado para entidades próprias: etapa comercial (`crm_stage`) e desfecho (`crm_outcome`).

| Status da planilha | Quantidade | Tratamento |
|---|---:|---|
| FEZ ENTREVISTA | 18 | Aberto, pós-entrevista |
| FECHADO | 14 | Arquivo de fechados, sem presunção de matrícula |
| AGUARDANDO | 9 | Aberto, em contato |
| NÃO RESPONDE | 7 | Aberto, contato não respondido, possível nova tentativa |
| MARCAR ENTREVISTA | 3 | Aberto, agendamento pendente |
| EX ALUNO(A) | 3 | Aberto, reativação |
| NÃO É NOSSO PERFIL | 2 | Arquivo não convertidos |

### Campos e interpretação

- `Nome do lead`, `WhatsApp` são identificação / canal de contato, não notas.
- `Origem do contato` é texto livre e pode conter quem indicou; deve ser pesquisável e filtrável.
- `Serviço de interesse` é um atributo do negócio; predominam aulas de inglês, mas há interesse em espanhol.
- `Observações` contém contexto e histórico e não deve ser sobrescrito.
- `Data de retorno` e `Retorno feito?` representam tarefas (follow-ups) e não atributos permanentes do lead.
- `Último contato` registra interação efetiva, diferente da data do retorno futuro.
- `Estado` é um filtro geográfico; nem sempre coincide com o DDD.
- `Motivo do não fechamento` vinha sendo usado também para notas. A V2 não o trata automaticamente como motivo de perda se o lead segue aberto.
- `Fechado` contém muitas vezes um número de telefone tratado como informação de contato legada, não como indicador booleano de negócio ganho.
- `Data de primeiro contato` está ausente em parte das linhas; não foi inferida pela data do retorno.

### Recursos adicionais solicitados

- Agenda de entrevistas com estados agendada, remarcada, cancelada, realizada e não compareceu.
- Timeline para preservar contatos, agendamentos, follow-ups e mudanças de etapa.
- Filtros por etapa, origem, serviço, região, atrasos, entrevistas e período.
- Arquivamento distinto de negócios fechados e oportunidades perdidas.

A importação é opcional e não altera nem descarta a planilha original.

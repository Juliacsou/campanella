# Campanella V6.9 — Importação de Alunos e Matrículas

## Entrada em Configurações da escola
- Começar nova importação de alunos: assistente de cinco passos, sem etapa de professores.
- Cadastrar matrículas em massa: CSV de matrículas e validação do calendário antes de importar.
- Completar cadastros em massa: CSV identificado por `aluno_id`, sem criar novos cadastros.

## Assistente de nova importação
1. Enviar CSV e conferir todos os alunos do arquivo.
2. Erros: edição manual, edição em massa no CSV, correção agora ou posterior, ou pular com confirmação. Os registros inválidos não são cadastrados.
3. Incompletos: edição manual ou CSV por `linha_csv` durante a mesma sessão; opção de completar depois. Cadastros básicos serão salvos sem matrícula.
4. Cadastro final: resumo e confirmação para cadastrar sem matrícula ou continuar para matrículas.
5. Matrículas: cadastro individual ou lote, com validação do calendário do professor.

## Continuidade em outra sessão
- Após o cadastro final, para completar dados depois, exporte novamente o CSV no menu **Completar cadastros em massa**. Este arquivo inclui o `aluno_id` necessário para atualização segura.
- Linhas rejeitadas por erros de importação não são salvas; o CSV de erros pode ser reenviado numa nova importação.
- Dados em edição antes do cadastro final não são persistidos no servidor; não feche a página sem baixar os CSVs de pendências.

## Segurança
- Preservadas as funções e RLS já instaladas na V6.7. Sem SQL novo.
- A proteção de duplicações é realizada pelo RPC existente do Supabase, e a atualização em massa usa `aluno_id`.
- Não altera contratos assinados, AssinAPI ou Google Drive.

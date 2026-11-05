# Campanella V6.8 — Importação assistida com correções e complementação

## Quatro etapas no menu Configurações da escola > Importar alunos e matrículas

1. Professores e horários — cadastramento e grade docente.
2. Importar alunos — enviar CSV, conferir todos os registros, ajustar colunas, editar linhas com erros e importar apenas os válidos.
3. Completar cadastros — trabalhar com os alunos já existentes que precisam de informações; editar manualmente, baixar CSV com `aluno_id` e reenviar o arquivo preenchido. Esta etapa pode ser pulada.
4. Matricular alunos — separar alunos prontos e incompletos, baixar CSV para matrículas e conferir as regras de agenda, frequência e ocupação (sem assinatura automática).

## Importação inicial

- Somente **nome completo** e **telefone com DDD** são exigidos para um cadastro novo.
- A prévia apresenta todas as linhas do arquivo com rolagem, sem truncar após 15 registros.
- Campos opcionais inválidos podem ser corrigidos ou deixados em branco, individualmente ou em lote. Nome e telefone inválidos devem ser corrigidos ou deixados para revisão posterior.
- O administrador pode expandir cada aluno e corrigir dados sem perder os outros campos. O CSV de alunos não importados mantém todos os dados corrigidos e o motivo do erro.
- O sistema permite importar somente os registros válidos. Em caso de erros retornados pelo Supabase, as linhas rejeitadas continuam disponíveis para correção e nova tentativa, enquanto as linhas concluídas não são reenviadas na mesma sessão de importação.
- Confirmar importação mostra apenas a quantidade de alunos a importar.

## Complementação

- A etapa 3 lista os alunos incompletos no banco, não apenas os do arquivo recém-importado.
- O CSV de complementação inclui `aluno_id`, nome, telefone, demais campos e `informacoes_faltantes`.
- O identificador `aluno_id` é obrigatório na complementação. O Supabase valida que pertence à mesma escola e só completa valores ausentes, preservando campos preenchidos.
- Para substituir um dado já existente, o administrador utiliza a edição completa do perfil do aluno.

## Proteções mantidas

- O backend da V6.7 reconhece registros existentes por `aluno_id`, CPF ou nome + telefone/e-mail, isolando a escola. Correspondências ambíguas exigem revisão.
- As matrículas em CSV continuam verificando professor, pacote, horários reais, bloqueios e conflitos de agenda antes de salvar. O servidor revalida no ato da gravação.
- Não marca contratos como assinados e não ativa AssinAPI nem backup Google Drive.

## Instalação / homologação

Não há SQL novo para V6.8. É necessário **já ter aplicado a migração V6.7** e as anteriores correspondentes. A função `entrevista` atualizada da V6.5 continua necessária para fichas por link.

1. Fazer backup de dados e manter a V6.7.1 para rollback.
2. Extrair este ZIP em pasta separada para teste local. Não executar SQL antigo novamente.
3. No terminal, executar `npx --yes http-server . -p 8000 -a 127.0.0.1 -c-1` na pasta `campanella`.
4. Em uma escola de teste, enviar um CSV com alunos completos, parciais, CPF/CEP inválidos, telefone inválido e duplicatas; corrigir ou deixar os opcionais vazios, importar e baixar rejeitados.
5. Completar um aluno por `aluno_id` e verificar que não existe duplicação; repetir o envio do mesmo CSV.
6. Testar as matrículas com horários reais, ocupados e incompatíveis. Não publicar em produção antes de validar as permissões/RPCs no Supabase da escola.

Testes locais: `node tests/v6_8_import_recovery_smoke.mjs`, `node tests/v6_7_onboarding_smoke.mjs`.

# Campanella V6.7 — Assistente de implantacao

## Implantacao simples para escolas novas

Menu: **Configuracoes da escola > Importar alunos e matriculas**.

1. **Professores e horarios** — cadastrar equipe, criar grade semanal e baixar listagem de horarios com IDs.
2. **Alunos** — CSV com somente `nome_completo` e `telefone` (com DDD) obrigatorios. Nomes de colunas variados podem ser associados visualmente. CPF, e-mail, nascimento e endereco ficam opcionais ate a matricula. A importacao compara CPF ou nome + telefone/e-mail para reconhecer cadastros existentes. O CSV de complementacao possui `aluno_id` e serve para preencher lacunas, sem sobrescrever campos existentes. Erros podem ser baixados em CSV.
3. **Matriculas** — separa alunos incompletos, prontos e com contrato/matricula. A escola baixa CSV dos prontos e preenche professor, pacote, horarios, inicio e dados financeiros. A coluna `horarios` aceita por exemplo `Seg 09:00 | Qui 14:00` ou os UUIDs dos horarios exportados. Permite duas aulas semanais em dias/horas diferentes, respeitando a frequencia do pacote.

**Seguranca do calendario:** o frontend rejeita professores inexistentes, horarios fora da grade, vagas ocupadas, frequencia incorreta e conflitos de feriados. Na gravacao, a RPC `onboarding_prepare_enrollment` revalida a escola, o professor, os IDs e horarios da grade semanal, a disponibilidade real e a frequencia do pacote; se houver conflito, a linha falha e nao cria matricula. Os demais alunos validos do CSV podem ser processados. O resultado mostra erros por linha para correcao.

**Assinatura preservada:** o processo cria uma pre-matricula preparada para o procedimento manual. Nao marca nenhum contrato como assinado nem reativa AssinAPI, Drive ou contratos antigos. Modelos DOCX com campos personalizados ou pacotes de dupla precisam de fluxo individual. Ate 1000 alunos ou 1000 matriculas podem ser enviados por arquivo; o cliente envia lotes de ate 200.

## Instalacao / testes

1. **Nao publicar diretamente:** backup do Supabase, conferir que as migracoes ate V6.6 foram executadas, manter Edge Function `entrevista` V6.5.
2. Executar **somente** `Campanella_V6_7_migracao.sql`, fornecido separadamente **fora do ZIP**, em ambiente de teste.
3. Extrair ZIP em outra pasta e iniciar o frontend local com `npx --yes http-server . -p 8000 -a 127.0.0.1 -c-1`.
4. Em escola ficticia, enviar CSV com nome + telefone, repetir importacao para comprovar que nao duplica, baixar CSV incompleto e completar campos. Testar o CSV de matricula com dois horarios validos; depois alterar um horario para outro que nao existe, um ocupado e outro que infringe a frequencia do pacote; todas essas linhas devem falhar sem criar contrato. Confirmar que status nao e `signed`.
5. Verificar permissoes por professor/outra escola e concorrencia na mesma grade. Testes locais em `tests/v6_7_onboarding_smoke.mjs`. Teste contratual SQL (arquivo externo): `node tests/v6_7_sql_contract_smoke.mjs /caminho/Campanella_V6_7_migracao.sql`.

**NOTA:** A criacao em lote foi validada com chamadas simuladas. Sua execucao real com as RPCs, triggers e RLS do Supabase deve ser homologada antes da publicacao. Nao rode scripts de reconstrucao e nao execute SQL anterior novamente.

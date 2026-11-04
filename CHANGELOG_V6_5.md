# Campanella V6.5 — Ficha inicial e calendário

- O link individual da ficha é validado pela Edge Function `entrevista` (token de uso único). A função **precisa ser atualizada no Supabase**; trocar só o frontend local não corrige a mensagem antiga "Link ou código inválido".
- Professor **entrevistador** e professor **responsável pelas aulas** são campos distintos, com permissões preservadas.
- A ficha interna e a ficha por link consultam a grade semanal real do professor responsável.
- É possível selecionar dois horários diferentes por semana, inclusive em dias diferentes ou no mesmo dia.
- Previsão de término considera bloqueios, recessos e ocupação, sem reservar o horário antes da matrícula.
- A ficha salva IDs dos horários escolhidos; eles aparecem pré-selecionados ao iniciar a matrícula, quando a disponibilidade é validada novamente.
- A Edge Function usa o backend com chave de serviço apenas para operações restritas ao token e à escola indicada. O navegador não recebe chave privilegiada nem nomes de outros alunos.
- SQL V6.5 é incremental, separado do ZIP. As integrações AssinAPI e Google Drive seguem inalteradas.

## Ordem segura de instalação para testes locais

1. Fazer backup do banco de dados. As migrações V6.0, V6.1, V6.3 e V6.4 devem estar aplicadas.
2. Executar **Campanella_V6_5_migracao.sql** no SQL Editor do Supabase. Ele adiciona `interviews.interviewer_teacher_id`, `interviews.calendar_slot_ids` e a função de previsão restrita à `service_role`.
3. Publicar **apenas** `supabase/functions/entrevista/index.ts` como a Edge Function `entrevista` no Supabase. No CLI: `supabase functions deploy entrevista --no-verify-jwt`, dentro da pasta do projeto, com a configuração do projeto Supabase correta. As demais funções não precisam ser reenviadas.
4. Substituir os arquivos locais pela V6.5 e executar `npx --yes http-server . -p 8000 -a 127.0.0.1 -c-1` na pasta `campanella`.
5. Em escola de teste, gerar um **novo link** para professor entrevistador A; escolher professor responsável B com dois horários; calcular datas; salvar a ficha; abrir a pré-matrícula e verificar os dois horários pré-selecionados. O link continua sendo de uso único.

**Nota:** a seleção na ficha é uma previsão, não uma reserva. A vaga só fica reservada quando o processo de matrícula cria o contrato. Se outra matrícula ocupar o horário, o administrador deverá escolher outro antes de confirmar.

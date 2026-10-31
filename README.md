# Campanella · Matrículas V1

Sistema estático (HTML, CSS e JavaScript) com Supabase Auth, Postgres com RLS e uma Edge Function pública para assinatura protegida por link. Preparado para GitHub Pages.

## 1. Estrutura do projeto

- `index.html`, `css/`, `js/` — interface do painel e página pública de assinatura.
- `templates/individual.docx`, `menor.docx`, `dupla.docx` — cópias adaptadas dos DOCX fornecidos, usando marcadores `<<campo>>`.
- `js/templates.js` — texto dos modelos para leitura/assinatura, derivado dos DOCX fornecidos.
- `sql/01_schema.sql` — banco de dados, segurança, perfis e transação de assinatura.
- `supabase/functions/assinatura/index.ts` — consulta dos links e assinatura pública.
- `supabase/config.toml` — permite acessar a função sem login, pois o token secreto autentica o convite.

**Não existe chave administrativa no frontend.** A publishable key pode aparecer no JavaScript; isso só é seguro porque as tabelas têm Row Level Security. A secret key usada pela função é injetada automaticamente pelo Supabase.

## 2. Criar o banco

1. Entre no projeto Supabase `jtlivzauyzdbpweimrvl`.
2. No **SQL Editor**, cole TODO o conteúdo de `sql/01_schema.sql` e execute **uma única vez**.
3. Em **Authentication → Users**, crie o login `julia.correa.souza@gmail.com`, configure uma senha forte e confirme o e-mail. O SQL atribui a essa conta o perfil `admin`.
4. Em **Authentication → Providers → Email**, **desative cadastro público de novos usuários**; crie convites manualmente no Dashboard. Novos logins diferentes da conta administrativa ficam inicialmente `pending`, sem acessar os dados.
5. Para liberar um professor já criado em Authentication, execute no SQL Editor (substituindo pelo e-mail real):

```sql
update public.profiles
set role = 'professor'
where lower(email) = lower('professor@exemplo.com');
```

**Atenção:** o sistema não cria automaticamente usuários no Auth nem define senhas. Não publique o cadastro aberto.

## 3. Publicar a função de assinatura

Instale o Supabase CLI e, na pasta raiz deste projeto, execute:

```bash
supabase login
supabase link --project-ref jtlivzauyzdbpweimrvl
supabase secrets set APP_ORIGINS='https://SEUUSUARIO.github.io,http://localhost:8000'
supabase functions deploy assinatura --no-verify-jwt
```

Troque `SEUUSUARIO` pelo usuário GitHub. `APP_ORIGINS` deve conter **origens** completas (sem o caminho `/nome-do-repositorio/`), separadas por vírgula. Para domínio personalizado, adicione a origem HTTPS desse domínio. A função exige um token aleatório de 256 bits válido; não há acesso direto às tabelas por visitantes anônimos. Caso veja erro de CORS, confira esse segredo e redeploy/recarga da página.

Não copie a `service_role` ou `sb_secret_...` para `js/app.js`. O frontend já está configurado com a publishable key e URL fornecidas.

## 4. Publicar no GitHub Pages

1. Crie um repositório GitHub, preferencialmente com o nome `campanella-matriculas`.
2. Envie os arquivos desta pasta para a **raiz do repositório**. Não envie senhas, tokens de acesso nem arquivos `.env`.
3. Em **Settings → Pages**, escolha **Deploy from a branch → main → /(root)**.
4. O site ficará em `https://SEUUSUARIO.github.io/campanella-matriculas/` (ou o caminho correspondente ao nome do seu repositório).
5. Abra o endereço, faça login como administradora e teste o fluxo completo.

Para teste local, na pasta do projeto: `python -m http.server 8000` e abra `http://localhost:8000`.

## 5. Como usar

1. **Pacotes:** cadastre modalidade, aulas, frequência e valor padrão.
2. **Leads:** administrador registra nome, nome de responsável (opcional) e telefone. Pode editar e excluir antes de existir ficha ou contrato relacionado.
3. **Ficha inicial:** professor escolhe pacote, dias, horário, data de início, valores, número de parcelas, valor por extenso e primeiro vencimento. O término é calculado automaticamente contando um encontro por dia selecionado.
4. **Contratos:** administrador gera o rascunho individual ou para menor e clica **Enviar link**. Copia o endereço e encaminha manualmente por WhatsApp/e-mail. A geração de novo link revoga o anterior; o link expira em 7 dias.
5. **Assinatura:** aluno ou responsável abre o link, confirma dados pessoais, lê o contrato preenchido, desenha a assinatura e aceita os termos. O backend registra o documento e o hash SHA-256, o horário, o desenho e um registro técnico básico; a transação cria/atualiza o aluno.
6. **Alunos:** o painel mostra término, alerta de vencimento e histórico. A ação **Rematricular** copia o pacote e os dados, permite revisar condições e cria um novo contrato. Quando a nova assinatura é concluída, o anterior passa a `Arquivado`, sem ser excluído.
7. **DOCX:** o botão **DOCX** baixa uma cópia preenchida usando o modelo original. Para contratos assinados, o botão **Comprovante** baixa o HTML com assinatura desenhada e hash, que pode ser aberto no navegador e impresso em PDF.

## 6. Marcadores DOCX

Você pode editar os modelos `.docx` no Word. Para preenchimento automático, use exatamente os nomes delimitados por `<<` e `>>`, como `<<contratante_nome>>`, `<<aluno_nome>>`, `<<valor_total>>`, `<<qtd_aulas>>`, `<<data_inicio>>`, `<<data_fim>>`, `<<dias>>`, `<<horario>>`, `<<parcelas>>`, `<<valor_parcela>>`, `<<primeiro_vencimento>>`, `<<segundo_vencimento>>`, `<<data_assinatura_extenso>>`.

**Importante:** editar somente o DOCX não atualiza o texto HTML assinado. Na V1 os três modelos HTML foram gerados junto com os DOCX; alterações das cláusulas devem ser refletidas também em `js/templates.js` e versionadas. Não use um DOCX alterado e um HTML antigo para um mesmo contrato.

## 7. Limites relevantes antes de usar em produção

- **Assinatura simples, não certificada:** o desenho, o hash e o registro técnico são evidências operacionais, não equivalem automaticamente a uma assinatura eletrônica avançada/qualificada nem garantem identidade. Recomenda-se verificação por e-mail/SMS (OTP), política de consentimento e revisão jurídica do método antes de contratos reais.
- **Contrato de dupla:** modelo DOCX disponível, mas assinatura de dois contratantes **não implementada**. O sistema bloqueia o envio de link para dupla.
- A cópia DOCX preenchida **não embute o desenho de assinatura**. O comprovante HTML contém o desenho e o hash; o arquivo DOCX serve como modelo preenchido, não como prova de assinatura.
- O cálculo da data final considera uma aula por encontro e não desconta feriados, recessos ou reposições. Revise o encerramento antes de enviar.
- O envio de links é **manual**. E-mail automático, OTP, gestão de cobranças, edição dos dados do aluno, relatórios, alerta por e-mail e auditoria administrativa são etapas futuras.
- A interface consulta até **500 registros por tabela**; adicionar paginação posteriormente.
- Por envolver **CPF, menores de idade e assinaturas**, realize revisão LGPD, política de retenção, acesso mínimo, rastreabilidade, mecanismos de exclusão/correção quando aplicáveis e recuperação/backup antes de operar com dados reais.
- O site não foi publicado no GitHub Pages nem a função foi instalada no Supabase automaticamente; siga os passos acima.

# Campanella V4 — Licenças manuais por escola

A V4 acrescenta **licenciamento sem cobrança integrada**. Você recebe o Pix fora do Campanella e, após conferir o pagamento, estende ou define a validade pelo painel privado. Chaves não representam nem confirmam pagamentos: são somente autorizações de ativação.

## Regras de negócio

- **Uma licença para cada escola** (`school_licenses.school_id` como chave primária). Uma conta pode administrar várias escolas, mas precisa de uma chave independente e **de uso único para cada nova escola**.
- **Um único administrador responsável por escola**, gravado em `schools.admin_user_id`. Não há criação de operadores/outros papéis pela interface nesta versão. O banco mantém a estrutura legada de membros para futura expansão, mas apenas o responsável tem acesso.
- A escola continua com a mesma licença após **transferência do administrador**. O antigo administrador perde acesso àquela escola, sem afetar outras escolas que administre.
- **Chaves emitidas para nome, e-mail e escola específicos**. O e-mail que resgata a chave precisa estar confirmado no Supabase Auth e ser igual ao e-mail autorizado da chave.
- O período é definido pelo administrador geral ao **emitir a chave**: (1) número de dias desde a ativação, (2) data fixa de vencimento ou (3) acesso sem vencimento. A ativação conta como o primeiro dia dos períodos em dias.
- A validade é calculada pelo horário de **São Paulo**; o vencimento informado é o último dia em que a escola permanece ativa.
- O painel geral permite **adicionar dias, definir vencimento, trocar a classificação paga/cortesia, conceder cortesia sem vencimento, suspender e reativar**. Reativar não prorroga um prazo que já venceu.
- Ao vencer ou ser suspensa: o painel operacional fica bloqueado; o banco nega gravações, inclusive chamadas diretas e operações de links públicos. Os dados não são apagados. A escola consegue ver a situação da sua licença e pode trocar de administrador.
- As chaves têm **128 bits de aleatoriedade**. O código completo é mostrado **uma única vez** e guardado no banco apenas como hash SHA-256 e os quatro caracteres finais. Chaves disponíveis podem ser revogadas. Uma chave já ativada não pode ser revogada para desligar uma escola: utilize **Suspender** na licença.
- O painel geral é autorizado exclusivamente pela tabela `campanella_platform_admins`, controlada no banco; não por e-mail ou variável JavaScript.

## Instalação em banco existente (migração incremental)

1. **Backup e homologação antes de tudo.** Não execute o SQL de reconstrução (`00_...`) nem repita migrações anteriores.
2. Se o banco estiver na V3 multi-escolas, aplique **somente** `sql/08_upgrade_licencas.sql` no SQL Editor. Se o banco ainda estiver na V2.1.2, aplique primeiro `sql/07_upgrade_multi_escolas.sql`, confira a migração e **depois** o `08`.
3. A V4 preserva as escolas existentes. Elas recebem automaticamente **cortesia sem vencimento** para não cortar o serviço após a atualização. Depois você define os prazos reais no painel. Para cada escola antiga, a migração escolhe um único administrador a partir dos membros anteriores; revise esse responsável, especialmente se havia vários administradores.
4. **Cadastre a sua própria conta como administrador da plataforma.** Entre no Supabase → Authentication → Users; confirme que o e-mail da sua conta está verificado. Execute no SQL Editor, substituindo o e-mail pela sua conta:

```sql
INSERT INTO public.campanella_platform_admins(user_id)
SELECT id FROM auth.users
WHERE lower(email)=lower('SEU_EMAIL_CONFIRMADO@EXEMPLO.COM')
  AND email_confirmed_at IS NOT NULL
ON CONFLICT DO NOTHING;
```

A operação deve incluir **uma linha**. Confira o resultado com:

```sql
SELECT u.email FROM public.campanella_platform_admins a
JOIN auth.users u ON u.id=a.user_id;
```

5. No Supabase → **Authentication → Providers → Email**, habilite cadastro por e-mail e, preferencialmente, **confirmação de e-mail**. Em **URL Configuration**, configure a URL real do Campanella e inclua-a em Redirect URLs para confirmação e recuperação.
6. Publique o novo frontend (HTML, CSS, `js/` etc.). Atualize a Edge Function **assinatura** com `supabase/functions/assinatura/index.ts` desta versão. A Edge Function **entrevista** permanece com seu código da V3; a RPC `verify_external_interview` atualizada pelo SQL 08 bloqueia entrevistas de escolas vencidas.
7. Faça login com sua conta de administrador geral e abra **Painel de licenças**. Se não tiver escolas sob sua própria administração, verá diretamente o painel geral. Clique **Gerar chave**; informe destinatário, e-mail, escola, tipo e validade. Copie o código gerado e envie em canal privado.
8. O cliente abre o Campanella, clica em **Criar minha conta**, confirma seu e-mail e entra. Se não administrar uma escola, verá a tela de **ativação**. Ao informar a chave, a escola é criada, a licença é vinculada e ele se torna o administrador único.
9. Ao receber Pix, abra **Painel de licenças → Gerenciar** na escola e escolha **Adicionar dias** ou **Definir uma data**; adicione uma observação (por exemplo, período pago). Nada é cobrado ou conferido automaticamente.

## Transferência de administração

Em **Minhas escolas**, o administrador atual pode informar o e-mail de outra pessoa com conta verificada. Alternativamente, você pode fazer a mesma ação no **Painel de licenças → Trocar admin**. A transferência é transacional e não altera `school_licenses`. A conta que recebe pode já administrar outras escolas.

## Como revisar as unidades herdadas da V3

Após o SQL 08:

```sql
SELECT s.name, s.id AS school_id, p.email AS admin_atual,
       l.kind, l.expires_on, l.suspended_at
FROM public.schools s
LEFT JOIN public.profiles p ON p.id=s.admin_user_id
LEFT JOIN public.school_licenses l ON l.school_id=s.id
ORDER BY s.created_at;
```

Escolas sem `admin_atual` precisam ser atribuídas pela função `transfer_school_admin` em sessão autenticada do administrador da plataforma (ou corrigidas manualmente por administrador da base, após verificação de identidade). O SQL 08 não apaga membros legados, mas desabilita acesso de pessoas que **não sejam** o administrador atual — não é uma migração transparente para escolas com vários administradores V3.

## Verificações de segurança necessárias em homologação

- Uma conta **sem chave** não consegue criar escola via `create_school` antigo ou gravar em `schools`.
- Um usuário que **não está** em `campanella_platform_admins` não consegue emitir, revogar, renovar ou suspender licenças por RPC.
- Chave errada, já resgatada, revogada ou criada para outro e-mail **não ativa escola**. Duas ativações concorrentes da mesma chave devem produzir exatamente uma escola.
- A escola A vencida não permite `INSERT`, `UPDATE` ou `DELETE` (incluindo via chamadas diretas ao Supabase) nem entrevistas ou assinaturas públicas; a escola B do mesmo administrador continua operando.
- Transferir uma escola ao administrador B revoga A imediatamente, mas não altera nenhuma licença, documento ou escola adicional de A.
- A chave é mostrada somente na resposta de emissão e **não** consta em `license_keys` em texto puro. Nenhuma chave secreta do Supabase é publicada no frontend.

> **Estado dos testes:** o repositório inclui testes locais de sintaxe, isolamento e verificações estáticas (`node tests/multi_escolas_smoke.mjs` e `node tests/licencas_smoke.mjs`). **Não foi executada uma implantação real no Supabase nem testes RLS com múltiplas sessões neste ambiente.** Valide antes de produção.

> **Documento histórico da V3.** Para a versão atual V4 com licenças e um administrador por escola, siga [`LICENCAS.md`](./LICENCAS.md). As orientações antigas de criação livre de escolas e perfis de operador **não são mais válidas**.

---

# Campanella V3 — Multi-escolas

## O que mudou

- Uma conta de autenticação pode participar de várias escolas.
- Uma escola pode ter vários usuários, com papel de **administrador** ou **operador**.
- A escola ativa aparece no menu lateral; trocar de escola carrega exclusivamente os cadastros autorizados daquela unidade.
- **Administrador:** gerencia escolas, usuários/permissões, professores, pacotes, modelos de contrato, assinatura e também o fluxo operacional.
- **Operador:** gerencia CRM, leads, fichas, alunos, contratos e matrículas. Visualiza cadastros de professores, pacotes e modelos usados nas operações, mas não pode editar as configurações da escola.
- Cada escola tem seus próprios dados de CRM, alunos, contratos, professores, pacotes, modelos e assinatura. Uma escola nova é criada vazia.
- Links públicos de entrevista e assinatura continuam funcionando: o token define o registro e a escola no servidor, independentemente da escola ativa de quem gerou o link.

## Instalação no Supabase existente (banco com dados)

**ATENÇÃO: crie backup e teste primeiro numa cópia do projeto Supabase. A aplicação depende do SQL V3 e das duas Edge Functions atualizadas; não publique somente o frontend.**

1. Confira que a versão V2.1.2 está instalada, incluindo `sql/06_upgrade_contracts_schedule_v2_1.sql`. Não execute outra vez os SQLs 00–06.
2. No **SQL Editor** do Supabase existente, execute **uma única vez** `sql/07_upgrade_multi_escolas.sql`. Ele não dá `DROP TABLE` e não exclui matrículas, leads ou contratos. O PostgreSQL executa a migração como uma única transação.
3. No projeto Supabase, atualize e publique as Edge Functions `entrevista` e `assinatura` com o conteúdo de `supabase/functions/{nome}/index.ts`. Mantenha os mesmos segredos e regras de `APP_ORIGINS` configurados. Para os endpoints públicos baseados em token, mantenha as configurações de autenticação conforme a instalação anterior.
4. Publique o **conteúdo da pasta** do projeto no GitHub Pages (ou sirva via HTTP local). Não publique a pasta `.git`, credenciais privadas nem chaves `service_role`.
5. Recarregue a aplicação e entre com um dos administradores antigos. O SQL cria **Escola principal** e vincula a ela todos os dados atuais e todas as contas que já tinham papel global `admin`.
6. Entre em **Escolas e acessos** para renomear a escola inicial, adicionar membros e cadastrar novas escolas. Para adicionar uma pessoa, primeiro crie sua conta em **Supabase → Authentication → Users** (sem compartilhar senhas) e depois cadastre o e-mail no Campanella.
7. Ao criar uma escola nova, vá a **Configurações** e cadastre o nome e a assinatura do proprietário. Cadastre professores, pacotes e modelos de contrato próprios dessa unidade antes de fazer suas primeiras matrículas.

### Sobre os dados existentes

A migração acrescenta `school_id` a cada registro operacional, preenchendo o valor inicial em todas as tabelas (leads, fichas, matrículas, contratos, estudantes, professores, CRM, convites, modelos e configurações). Os registros antigos permanecem intactos, inclusive assinaturas e históricos. Arquivos DOCX legados permanecem no mesmo endereço no bucket privado. Uma tabela de mapeamento criada durante a migração registra a escola autorizada a ler cada arquivo, sem confiar em caminhos editáveis de novos modelos. Novos arquivos são salvos em `ID_DA_ESCOLA/arquivo.docx`.

**A migração não transfere ou compartilha alunos entre escolas.** Mesmo que um usuário trabalhe em duas unidades, os cadastros de cada uma são independentes. Compartilhar ou mover matrículas exigiria uma funcionalidade separada com trilha de auditoria.

### Segurança

A separação é aplicada nas políticas de **Row Level Security (RLS)** do PostgreSQL. Uma simples filtragem da interface não seria suficiente. Todas as tabelas operacionais têm `school_id` e seus relacionamentos possuem chaves estrangeiras compostas que verificam a escola dos registros relacionados. O frontend usa uma chave pública do Supabase, não a chave privilegiada.

As RPCs `create_school`, `manage_school_member` e `remove_school_member` verificam o vínculo de administração no banco. Um administrador não pode remover ou rebaixar o último administrador da escola. A operação de assinatura pública usa uma RPC transacional restrita à Edge Function. A criação de escolas requer que o usuário já administre pelo menos uma outra escola.

## Roteiro de verificação antes de produção

1. **Escola atual:** verificar leads, fichas, contratos e alunos antigos, inclusive contratos assinados, pendentes e expirados.
2. **Nova escola:** criar uma unidade B; confirmar que todas as listas estão vazias e que a configuração de assinatura também está vazia.
3. **Trocar de escola:** criar lead na unidade B; alternar A ↔ B e confirmar que os dados aparecem apenas na própria escola.
4. **Múltiplos usuários:** vincular um segundo login como `operador` na B; confirmar que ele não pode editar configurações, permissões ou escolas, mas consegue operar CRM e matrículas.
5. **Múltiplos vínculos:** vincular o mesmo login a A e B com papéis diferentes; confirmar que o menu e as permissões mudam conforme a escola ativa.
6. **Isolamento em API:** usar o token JWT do usuário B e solicitar via REST um ID de lead/contrato da A: a resposta deve ser vazia ou recusada. Não confiar apenas na interface.
7. **Integridade de referências:** tentar criar uma ficha em B apontando para um lead/professor/pacote da A: a inserção deve ser rejeitada por FK ou RLS.
8. **Documentos:** cadastrar modelo DOCX e assinatura diferentes nas duas escolas; gerar e abrir contratos em cada uma, verificando o arquivo e o nome do proprietário corretos.
9. **Links públicos:** testar entrevista e assinatura por link gerados em A e B, inclusive quando o funcionário estiver logado na outra escola; assegurar que a matrícula é criada na escola vinculada ao token.
10. **Último administrador:** tentar remover/rebaixar o último admin de uma unidade; o servidor deve impedir.
11. **Revogação:** remover o vínculo de um usuário e confirmar que ele perde acesso a dados e arquivos da unidade (inclusive pela REST API).

## Limitação desta entrega

A validação local cobre a sintaxe do JavaScript e revisões estáticas; não houve acesso ao seu banco Supabase de produção para aplicar a migração nem executar testes de integração reais. **Não executar diretamente em produção antes de validar em ambiente de teste.**

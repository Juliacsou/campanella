# Campanella — contexto técnico do projeto

**Versão em preparação:** V5.6 (pré-matrícula e contratos manuais). A versão ainda precisa ser instalada e validada na escola fictícia antes da publicação para as escolas reais.

## Produto e regras de negócio

CRM escolar multi-escolas: lead → ficha/entrevista → pré-matrícula → contrato gerado → assinatura obtida fora do sistema → registro administrativo de assinatura → aluno matriculado. O mesmo aluno pode ter várias rematrículas sem perder contratos anteriores. Cada escola tem administrador próprio e chave de licença; uma conta pode administrar múltiplas escolas.

Na V5.6, **nenhuma assinatura é coletada pelo Campanella**. O link do lead apresenta apenas a pré-matrícula e recolhe dados. Depois do envio, o contrato passa para `pre_enrolled` e o CRM para `pre_matricula_feita`. O administrador gera e baixa o PDF sem assinaturas (`ready_manual`) e, somente após obter a assinatura fora da plataforma, marca como assinado (`signed`, `audit.method=manual_registry`). Essa marcação é um controle administrativo, **não uma certificação de assinatura**. O novo aluno só é criado/consolidado quando o administrador confirma a assinatura. Na rematrícula, o administrador preenche tudo (inclusive campos personalizados antes atribuídos ao contratante), prepara o contrato sem mandar link e registra a confirmação manual quando a tiver obtido. Se a rematrícula começar no futuro, não deve encerrar o contrato anterior antes da nova vigência.

Modelos de contrato são DOCX personalizados por escola. Marcadores obrigatórios e papéis fixos são validados no upload; campos adicionais podem ter nomes escolhidos pela escola e responsáveis atribuídos. A exportação em PDF usa `js/pdf-contract.js` (texto vetorial, sem `html2pdf.js`) e deixa ambas as assinaturas em branco. Modelos existentes inválidos não devem ser usados em novas matrículas.

## Tecnologias e organização

- Frontend estático em `index.html`, `js/` e `css/`, hospedado em GitHub Pages no repositório `Juliacsou/campanella`.
- Supabase Authentication, PostgreSQL/RLS, Storage (apenas modelos DOCX) e Edge Functions em `supabase/functions/`.
- Cada contrato e lead é isolado por `school_id`; credenciais secretas ficam nas Edge Functions, nunca no frontend ou GitHub.
- Migrações SQL em `sql/`; a V5.6 acrescenta **`13_upgrade_pre_matricula_manual.sql`**, após a migração 12. Não executar scripts de reconstrução do banco em instâncias existentes.
- `matricula-v5` recebe as pré-matrículas públicas por token temporário. As RPCs `prepare_manual_contract`, `confirm_manual_contract` e `void_manual_contract` validam permissões do administrador e mudanças de status.

## Integrações suspensas, mas preservadas

A V5.5 implementou assinatura pela AssinAPI e backup individual por escola no Google Drive, usando funções `contract-signing`, `assinapi-webhook`, `google-drive-oauth`, `google-drive-backup` e helpers `_shared/v5.ts`. **Esses códigos não devem ser apagados.** A V5.6 oculta a integração na interface e bloqueia novas operações de AssinAPI/Drive por padrão nas funções (`CAMPANELLA_SIGNATURES_ENABLED` somente quando explicitamente `true`; não habilitar neste lançamento). A antiga função `assinatura` também bloqueia novas assinaturas desenhadas. Os registros históricos permanecem no banco, sem migração nem exclusão. O webhook pode continuar reconciliando solicitações antigas.

Nomes de Secrets existentes (não armazenar seus valores aqui): `ASSINAPI_SECRET_KEY`, `ASSINAPI_WEBHOOK_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI`, `GOOGLE_DRIVE_ENCRYPTION_KEY`, `APP_ORIGINS`. As credenciais foram configuradas para o piloto, porém o produto atual não as utiliza para novos documentos.

## Situação e limites conhecidos

- V5.5: geração do PDF, assinatura Sandbox e backup no Drive foram testados com sucesso na escola fictícia; **não liberar essas integrações para as escolas reais**.
- V5.6: requer aplicação do SQL 13, deploy atualizado de `matricula-v5`, `contract-signing`, `assinatura`, `google-drive-oauth` e `google-drive-backup` e testes do fluxo manual antes de publicar frontend. O site público da versão anterior continua ativo até o deploy.
- O registro manual não recebe PDF assinado, certificado nem evidências automaticamente. A escola deve conservar separadamente o documento efetivamente assinado. O PDF gerado para assinatura é apenas uma via em branco quanto às assinaturas.
- A modalidade dupla ainda demanda implementação própria para pré-matrícula/rematrícula com múltiplos alunos.
- A validação independente de equivalência entre PDF e documento original no backend é pendência de produção caso a AssinAPI venha a ser reativada.

## Preferências de manutenção do projeto

Entregar um único ZIP por versão, nomeado `Campanella_Vx.y.zip`. Não criar guias de instalação nem Markdown para cada mudança. Manter este README apenas com fatos necessários para retomar o projeto em nova conversa; orientar instalação passo a passo pelo chat.

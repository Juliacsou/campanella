-- ==============================================================================
-- Campanella v8.7.2 — Adicionar coluna source na tabela public.leads (D33)
-- ==============================================================================

-- Corrige o erro "Could not find the 'source' column of 'leads' in the schema cache"
-- ao salvar matrícula nova ou em andamento para aluno sem lead vinculado pré-existente.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text;
COMMENT ON COLUMN public.leads.source IS 'Origem do lead (manual, implantacao, onboarding, crm, etc.)';

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pdf_url text;
COMMENT ON COLUMN public.contracts.pdf_url IS 'URL do arquivo PDF original do contrato importado ou anexado';

-- Recarrega o cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';


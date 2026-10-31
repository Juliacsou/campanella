-- CAMPANELLA V1.4 - Atualizacao incremental a partir da V1.3
-- Execute SOMENTE apos 01_schema.sql, 02_upgrade_v1_2.sql e 03_upgrade_v1_3.sql.
-- Nao apaga leads, fichas, alunos ou contratos.
-- Faca backup antes de executar em um banco com dados reais.

-- Uma ficha so entra na fila quando a administracao marca o lead.
-- O formulario de entrevista continua completo e separado desta etapa.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ficha_iniciada_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ficha_status text NOT NULL DEFAULT 'open';

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_ficha_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_ficha_status_check
  CHECK (ficha_status IN ('open','lost','archived'));

CREATE INDEX IF NOT EXISTS leads_ficha_status_idx
  ON public.leads (ficha_status, ficha_iniciada_at);

-- Preserva a fila dos leads que ja tinham uma entrevista na V1.3.
UPDATE public.leads l
SET ficha_iniciada_at = i.created_at
FROM public.interviews i
WHERE i.lead_id = l.id
  AND l.ficha_iniciada_at IS NULL;

-- Preserva desistencias e arquivamentos das fichas anteriores.
UPDATE public.leads l
SET ficha_status = i.pipeline_status
FROM public.interviews i
WHERE i.lead_id = l.id
  AND i.pipeline_status IN ('open','lost','archived')
  AND l.ficha_status IS DISTINCT FROM i.pipeline_status;

-- A V1.4 exibe um contrato assinado como "Ativo".
-- Internamente, o banco continua usando "signed" para preservar a
-- integridade das Edge Functions e do historico de assinaturas.
-- Nao e necessario mudar a estrutura dos contratos existentes.

-- ==============================================================================
-- Campanella v8.6.4 — Ajuste crm_activities_kind_check e correções pontuais
-- ==============================================================================

-- 1. Permitir 'fiche' na restrição de verificação de kind em crm_activities (D08)
ALTER TABLE public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_kind_check;
ALTER TABLE public.crm_activities ADD CONSTRAINT crm_activities_kind_check
  CHECK (kind = ANY (ARRAY[
    'note'::text,
    'contact'::text,
    'followup'::text,
    'appointment'::text,
    'stage'::text,
    'archive'::text,
    'import'::text,
    'system'::text,
    'fiche'::text
  ]));

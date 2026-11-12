-- ==============================================================================
-- CAMPANELLA V7.5 - Primeira Parcela Diferenciada (Entrada / Matrícula)
-- Permite que a 1ª parcela tenha valor e data de vencimento distintos das demais.
-- ==============================================================================

BEGIN;

-- Adiciona campos opcionais na tabela de fichas (interviews) para persistência
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS second_due_date date;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS has_custom_first_installment boolean NOT NULL DEFAULT false;

COMMIT;

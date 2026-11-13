-- ==============================================================================
-- Campanella V7.6 - Upgrade: Formato de Plano e Dupla na Ficha Inicial
-- ==============================================================================

-- 1. Coluna enrollment_mode na tabela public.interviews
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS enrollment_mode text NOT NULL DEFAULT 'package';

-- 2. Atualizar fichas sem pacote associado para 'custom'
UPDATE public.interviews
SET enrollment_mode = 'custom'
WHERE package_id IS NULL AND enrollment_mode = 'package';

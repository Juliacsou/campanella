-- ==============================================================================
-- Campanella V7.6 - Upgrade: Pré-matrícula Administrativa sem envio de link
-- ==============================================================================

-- 1. Atualizar política RLS para permitir transição para 'pre_enrolled' por admins da escola
DROP POLICY IF EXISTS contracts_license_update ON public.contracts;
CREATE POLICY contracts_license_update ON public.contracts
  FOR UPDATE
  TO authenticated
  USING (
    is_school_admin(school_id)
    AND has_active_school_license(school_id)
    AND (status = ANY (ARRAY['draft'::text, 'sent'::text, 'pre_enrolled'::text]))
  )
  WITH CHECK (
    is_school_admin(school_id)
    AND has_active_school_license(school_id)
    AND (status = ANY (ARRAY['draft'::text, 'sent'::text, 'pre_enrolled'::text, 'void'::text]))
  );

-- 2. Procedimento seguro para concluir pré-matrícula diretamente pelo painel administrativo
CREATE OR REPLACE FUNCTION public.admin_complete_pre_enrollment(
  p_contract_id uuid,
  p_student jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  s1 jsonb;
  s2 jsonb;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado a esta escola';
  END IF;
  IF c.status NOT IN ('draft', 'sent', 'pre_enrolled') THEN
    RAISE EXCEPTION 'Contrato nao esta em etapa de pre-matricula';
  END IF;
  IF p_student IS NULL OR jsonb_typeof(p_student) <> 'object' THEN
    RAISE EXCEPTION 'Dados da pre-matricula invalidos';
  END IF;

  IF c.kind = 'dupla' THEN
    s1 := coalesce(p_student->'student1', p_student);
    s2 := p_student->'student2';
    IF s2 IS NULL OR jsonb_typeof(s2) <> 'object' THEN
      RAISE EXCEPTION 'Dados do 2º aluno da dupla incompletos';
    END IF;
    IF NULLIF(btrim(s1->>'full_name'), '') IS NULL OR NULLIF(btrim(s2->>'full_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Nome completo de ambos os alunos e obrigatorio';
    END IF;

    IF c.lead_id IS NOT NULL THEN
      UPDATE public.leads SET
        name = coalesce(NULLIF(btrim(s1->>'full_name'), ''), name),
        student2_name = coalesce(NULLIF(btrim(s2->>'full_name'), ''), student2_name),
        guardian_name = coalesce(NULLIF(btrim(p_student->>'guardian_name'), ''), guardian_name),
        crm_stage = 'pre_matricula_feita',
        updated_at = now()
      WHERE id = c.lead_id;
    END IF;
  ELSE
    IF NULLIF(btrim(p_student->>'full_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Nome completo do aluno e obrigatorio';
    END IF;

    IF c.lead_id IS NOT NULL THEN
      UPDATE public.leads SET
        name = coalesce(NULLIF(btrim(p_student->>'full_name'), ''), name),
        guardian_name = coalesce(NULLIF(btrim(p_student->>'guardian_name'), ''), guardian_name),
        crm_stage = 'pre_matricula_feita',
        updated_at = now()
      WHERE id = c.lead_id;
    END IF;
  END IF;

  UPDATE public.contracts SET
    student_snapshot = p_student,
    status = 'pre_enrolled',
    token_hash = NULL,
    token_expires_at = NULL
  WHERE id = c.id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_complete_pre_enrollment(uuid, jsonb) TO authenticated;

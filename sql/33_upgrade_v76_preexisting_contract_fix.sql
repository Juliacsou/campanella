-- ==============================================================================
-- Campanella V7.6 - Upgrade: Ativação Direta de Contratos Preexistentes
-- ==============================================================================

-- 1. Atualizar política RLS contracts_license_update para permitir transição para 'signed'
DROP POLICY IF EXISTS contracts_license_update ON public.contracts;
CREATE POLICY contracts_license_update ON public.contracts
  FOR UPDATE
  TO authenticated
  USING (
    is_school_admin(school_id)
    AND has_active_school_license(school_id)
    AND (status = ANY (ARRAY['draft'::text, 'sent'::text, 'pre_enrolled'::text, 'signed'::text]))
  )
  WITH CHECK (
    is_school_admin(school_id)
    AND has_active_school_license(school_id)
    AND (status = ANY (ARRAY['draft'::text, 'sent'::text, 'pre_enrolled'::text, 'signed'::text, 'void'::text]))
  );

-- 2. Procedimento seguro para ativar contrato preexistente (individual ou dupla)
CREATE OR REPLACE FUNCTION public.activate_preexisting_contract(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.contracts%ROWTYPE;
  l public.leads%ROWTYPE;
  s1_id uuid;
  s2_id uuid;
  s1_name text;
  s2_name text;
  s_snap jsonb;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado a esta escola';
  END IF;
  IF c.status = 'signed' THEN RETURN true; END IF;

  s1_id := c.student_id;
  s2_id := c.student2_id;

  IF c.lead_id IS NOT NULL THEN
    SELECT * INTO l FROM public.leads WHERE id = c.lead_id;
  END IF;

  s1_name := coalesce(c.student_snapshot->'student1'->>'full_name', c.student_snapshot->>'full_name', l.name, 'Aluno');
  s2_name := coalesce(c.student_snapshot->'student2'->>'full_name', l.student2_name, 'Aluno 2');

  IF s1_id IS NULL THEN
    INSERT INTO public.students (school_id, lead_id, full_name, phone, guardian_name, is_minor)
    VALUES (c.school_id, c.lead_id, s1_name, l.phone, l.guardian_name, (c.kind = 'menor'))
    RETURNING id INTO s1_id;
  END IF;

  IF c.kind = 'dupla' AND s2_id IS NULL THEN
    INSERT INTO public.students (school_id, lead_id, full_name, guardian_name, is_minor)
    VALUES (c.school_id, c.lead_id, s2_name, l.guardian_name, false)
    RETURNING id INTO s2_id;
  END IF;

  s_snap := coalesce(c.student_snapshot, jsonb_build_object(
    'full_name', CASE WHEN c.kind = 'dupla' THEN s1_name || ' & ' || s2_name ELSE s1_name END,
    'student1', jsonb_build_object('full_name', s1_name),
    'student2', jsonb_build_object('full_name', s2_name),
    'signer_student_index', 1
  ));

  UPDATE public.contracts SET
    student_id = s1_id,
    student2_id = CASE WHEN c.kind = 'dupla' THEN s2_id ELSE NULL END,
    status = 'signed',
    token_hash = NULL,
    token_expires_at = NULL,
    audit = jsonb_build_object(
      'method', CASE WHEN c.kind = 'dupla' THEN 'preexisting_enrollment_duo' ELSE 'preexisting_enrollment' END,
      'signature', 'physical_prior'
    ),
    student_snapshot = s_snap
  WHERE id = c.id;

  IF c.lead_id IS NOT NULL THEN
    UPDATE public.leads SET
      student_id = s1_id,
      status = 'convertido',
      crm_stage = 'matriculado',
      updated_at = now()
    WHERE id = c.lead_id;
  END IF;

  IF c.interview_id IS NOT NULL THEN
    UPDATE public.interviews SET
      pipeline_status = 'enrolled'
    WHERE id = c.interview_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_preexisting_contract(uuid) TO authenticated;

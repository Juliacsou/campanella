-- ==============================================================================
-- Campanella V8.4 - Upgrade: Pré-matrícula unificada no link do orçamento
-- Permite que o interessado preencha seus dados cadastrais e conclua a pré-matrícula
-- diretamente na página de orçamento, sem necessidade de envio de um segundo link.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_budget_pre_enrollment(
  p_lead_id uuid,
  p_student jsonb,
  p_terms jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  l public.leads%ROWTYPE;
  c public.contracts%ROWTYPE;
  s1 jsonb;
  s2 jsonb;
  v_school_id uuid;
  v_is_duo boolean;
  v_kind text;
  v_contract_id uuid;
  v_template_html text;
  v_interview_id uuid;
BEGIN
  -- 1. Validar existência do lead
  SELECT * INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead nao encontrado';
  END IF;

  v_school_id := l.school_id;
  IF v_school_id IS NOT NULL AND NOT public.has_active_school_license(v_school_id) THEN
    RAISE EXCEPTION 'Escola temporariamente indisponivel';
  END IF;

  v_kind := coalesce(p_terms->>'kind', l.kind, 'individual');
  v_is_duo := (v_kind = 'dupla' OR (p_terms->>'is_duo')::boolean = true);
  IF v_is_duo THEN
    v_kind := 'dupla';
  ELSIF (p_student->>'guardian_name' IS NOT NULL AND btrim(p_student->>'guardian_name') <> '') THEN
    v_kind := 'menor';
  ELSE
    v_kind := 'individual';
  END IF;

  -- 2. Atualizar dados do lead e avançar pipeline para 'pre_matricula_feita'
  IF v_is_duo THEN
    s1 := coalesce(p_student->'student1', p_student);
    s2 := p_student->'student2';
    UPDATE public.leads SET
      name = coalesce(NULLIF(btrim(s1->>'full_name'), ''), name),
      student2_name = coalesce(NULLIF(btrim(s2->>'full_name'), ''), student2_name),
      guardian_name = coalesce(NULLIF(btrim(p_student->>'guardian_name'), ''), guardian_name),
      phone = coalesce(NULLIF(btrim(s1->>'phone'), ''), phone),
      email = coalesce(NULLIF(btrim(s1->>'email'), ''), email),
      crm_stage = 'pre_matricula_feita',
      updated_at = now()
    WHERE id = l.id;
  ELSE
    UPDATE public.leads SET
      name = coalesce(NULLIF(btrim(p_student->>'full_name'), ''), name),
      guardian_name = coalesce(NULLIF(btrim(p_student->>'guardian_name'), ''), guardian_name),
      phone = coalesce(NULLIF(btrim(p_student->>'phone'), ''), phone),
      email = coalesce(NULLIF(btrim(p_student->>'email'), ''), email),
      crm_stage = 'pre_matricula_feita',
      updated_at = now()
    WHERE id = l.id;
  END IF;

  -- 3. Buscar ou criar contrato vinculado
  SELECT * INTO c FROM public.contracts
  WHERE lead_id = l.id AND status IN ('draft', 'sent', 'pre_enrolled')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.contracts SET
      student_snapshot = p_student,
      status = 'pre_enrolled',
      terms = coalesce(p_terms, terms),
      kind = v_kind,
      token_hash = NULL,
      token_expires_at = NULL,
      updated_at = now()
    WHERE id = c.id;
    v_contract_id := c.id;
  ELSE
    v_template_html := '<div class="preexisting-contract-doc"><h2>Contrato de Prestação de Serviços Educacionais</h2><p>Contrato em elaboração pela escola a partir da pré-matrícula aceita pelo aluno.</p></div>';

    IF p_terms->>'interview_id' IS NOT NULL AND (p_terms->>'interview_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_interview_id := (p_terms->>'interview_id')::uuid;
    ELSE
      v_interview_id := NULL;
    END IF;

    INSERT INTO public.contracts (
      school_id, lead_id, interview_id, kind, status, terms,
      template_html, template_version, student_snapshot
    ) VALUES (
      v_school_id,
      l.id,
      v_interview_id,
      v_kind,
      'pre_enrolled',
      coalesce(p_terms, '{}'::jsonb),
      v_template_html,
      'budget-pre-enrollment-v1',
      p_student
    ) RETURNING id INTO v_contract_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pre_enrolled', true,
    'contract_id', v_contract_id,
    'lead_id', l.id,
    'message', 'Pré-matrícula recebida com sucesso. A escola entrará em contato sobre o contrato.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_budget_pre_enrollment(uuid, jsonb, jsonb) TO anon, authenticated, service_role;

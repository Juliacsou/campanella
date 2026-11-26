-- Campanella V8.6: Correções de Bugs de Matrícula/Dupla/Contratos e Melhorias de Implantação
-- Data: 2026-11-26

-- 1. Ajustes estruturais seguros (Colunas opcionais e remoção de NOT NULL restritivo em students.phone)
ALTER TABLE public.students ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Corrigir alunos existentes que possuem dados de responsável gravados mas ficaram com is_minor = NULL por falta de data de nascimento
UPDATE public.students
SET is_minor = true
WHERE is_minor IS NULL
  AND (
    nullif(btrim(coalesce(guardian_name, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(guardian_cpf, '')), '') IS NOT NULL
  );

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS cnpj text;

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS duration_type text;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS duration_months integer;

ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS second_due_date date;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS has_custom_first_installment boolean DEFAULT false;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS demais_parcelas integer;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2);
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS discount_until date;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS discount_reason text;

-- 2. Corrigir modelos de contrato cadastrados da escola English Upskilling (Bugs #9 e #17)
UPDATE public.contract_types
SET
  template_html = regexp_replace(
    replace(
      template_html,
      'E-MAIL: {{contratante_2_telefone}}',
      'E-MAIL: {{contratante_2_email}}'
    ),
    '({{qtd_aulas}}\s*(?:</strong>)?)\s+de orientação dirigida',
    '\1 horas de orientação dirigida',
    'g'
  ),
  body_text = regexp_replace(
    replace(
      body_text,
      'E-MAIL: <<contratante_2_telefone/contratante>>',
      'E-MAIL: <<contratante_2_email/contratante>>'
    ),
    '(<<qtd_aulas/contratado>>)\s+de orientação dirigida',
    '\1 horas de orientação dirigida',
    'g'
  )
WHERE school_id IN (SELECT id FROM public.schools WHERE name ILIKE '%English Upskilling%');

UPDATE public.contract_types
SET
  template_html = replace(
    template_html,
    '<p><strong>VALOR TOTAL DO CONTRATO: </strong></p><p>{{valor_total_extenso}}</p>',
    '<p><strong>VALOR TOTAL DO CONTRATO: </strong></p><p>{{valor_total}} ({{valor_total_extenso}})</p>'
  ),
  body_text = replace(
    body_text,
    E'VALOR TOTAL DO CONTRATO: \n\n<<valor_total_extenso/contratado>>',
    E'VALOR TOTAL DO CONTRATO: \n\n<<valor_total/contratado>> (<<valor_total_extenso/contratado>>)'
  )
WHERE school_id IN (SELECT id FROM public.schools WHERE name ILIKE '%English Upskilling%')
  AND kind = 'menor';

-- Também atualizar contratos ainda em preparação (draft, sent, pre_enrolled, ready_manual) com esses erros de template
ALTER TABLE public.contracts DISABLE TRIGGER lock_sent_contract;
UPDATE public.contracts
SET template_html = regexp_replace(
  replace(
    template_html,
    'E-MAIL: {{contratante_2_telefone}}',
    'E-MAIL: {{contratante_2_email}}'
  ),
  '({{qtd_aulas}}\s*(?:</strong>)?)\s+de orientação dirigida',
  '\1 horas de orientação dirigida',
  'g'
)
WHERE status IN ('draft', 'sent', 'pre_enrolled', 'ready_manual')
  AND (
    template_html LIKE '%E-MAIL: {{contratante_2_telefone}}%'
    OR template_html LIKE '%{{qtd_aulas}}%de orientação dirigida%'
  );
ALTER TABLE public.contracts ENABLE TRIGGER lock_sent_contract;

-- 3. Atualizar update_school_details para suportar CNPJ (Melhoria #9) mantendo retrocompatibilidade
CREATE OR REPLACE FUNCTION public.update_school_details(
  p_school uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_cnpj text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Somente o administrador da escola pode editar os dados';
  END IF;
  IF EXISTS(SELECT 1 FROM public.schools WHERE id = p_school AND deletion_requested_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Restaure a escola antes de alterar as informacoes';
  END IF;
  IF length(btrim(coalesce(p_name, ''))) NOT BETWEEN 2 AND 120
     OR length(coalesce(p_email, '')) > 254
     OR length(coalesce(p_phone, '')) > 40
     OR length(coalesce(p_address, '')) > 500
     OR length(coalesce(p_cnpj, '')) > 30 THEN
    RAISE EXCEPTION 'Dados da escola invalidos';
  END IF;
  IF btrim(coalesce(p_email, '')) <> '' AND btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'E-mail da escola invalido';
  END IF;
  UPDATE public.schools
  SET
    name = btrim(p_name),
    contact_email = nullif(lower(btrim(p_email)), ''),
    contact_phone = nullif(btrim(p_phone), ''),
    address = nullif(btrim(p_address), ''),
    cnpj = CASE WHEN p_cnpj IS NULL THEN cnpj ELSE nullif(btrim(p_cnpj), '') END
  WHERE id = p_school;
END;
$function$;

-- 4. Atualizar onboarding_import_students para aceitar telefone internacional ou em branco e gravar responsável mesmo sem data de nascimento (Melhorias #1 e #4)
CREATE OR REPLACE FUNCTION public.onboarding_import_students(p_school uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  r record;
  rec jsonb;
  s public.students%ROWTYPE;
  nm text;
  raw_ph text;
  ph_digits text;
  ph text;
  cpf_in text;
  em text;
  raw_birth text;
  birth_in date;
  cep_in text;
  is_minor_in boolean;
  has_guardian boolean;
  g_name text;
  g_birth date;
  g_cpf text;
  g_phone text;
  g_email text;
  g_cep text;
  g_addr text;
  student_id uuid;
  match_count integer;
  line_no integer;
  inserted_count integer := 0;
  filled_count integer := 0;
  skipped_count integer := 0;
  rejected_count integer := 0;
  results jsonb := '[]'::jsonb;
  action text;
  err text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
    RAISE EXCEPTION 'Apenas o administrador com licenca ativa pode importar alunos';
  END IF;
  IF coalesce(jsonb_typeof(p_rows), 'null') <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Envie de 1 a 500 registros por lote';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text, 67));

  FOR r IN SELECT value AS data, ordinality AS idx FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
    rec := r.data;
    line_no := coalesce(NULLIF(rec->>'linha', '')::integer, (r.idx + 1)::integer);
    action := 'erro';
    err := NULL;
    student_id := NULL;
    BEGIN
      nm := btrim(coalesce(rec->>'nome_completo', ''));
      raw_ph := btrim(coalesce(rec->>'telefone', ''));
      ph_digits := regexp_replace(raw_ph, '[^0-9]', '', 'g');
      IF ph_digits = '' THEN
        ph := NULL;
      ELSIF left(raw_ph, 1) = '+' AND left(ph_digits, 2) <> '55' THEN
        IF length(ph_digits) NOT BETWEEN 7 AND 15 THEN
          RAISE EXCEPTION 'Telefone internacional invalido (informe +DDI e numero)';
        END IF;
        ph := '+' || ph_digits;
      ELSE
        IF left(ph_digits, 2) = '55' AND length(ph_digits) IN (12, 13) THEN
          ph_digits := substring(ph_digits, 3);
        END IF;
        IF length(ph_digits) NOT BETWEEN 8 AND 15 THEN
          RAISE EXCEPTION 'Telefone invalido (informe com DDD ou +codigo do pais)';
        END IF;
        ph := ph_digits;
      END IF;

      cpf_in := regexp_replace(coalesce(rec->>'cpf', ''), '[^0-9]', '', 'g');
      em := lower(btrim(coalesce(rec->>'email', '')));
      raw_birth := btrim(coalesce(rec->>'data_nascimento', ''));
      cep_in := regexp_replace(coalesce(rec->>'cep', ''), '[^0-9]', '', 'g');

      IF length(nm) NOT BETWEEN 2 AND 180 THEN
        RAISE EXCEPTION 'Nome completo obrigatorio (2 a 180 caracteres)';
      END IF;
      IF cpf_in <> '' AND NOT public.onboarding_valid_cpf(cpf_in) THEN
        RAISE EXCEPTION 'CPF invalido';
      END IF;
      IF em <> '' AND (length(em) > 254 OR em !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
        RAISE EXCEPTION 'E-mail invalido';
      END IF;
      IF cep_in <> '' AND length(cep_in) <> 8 THEN
        RAISE EXCEPTION 'CEP deve ter 8 digitos';
      END IF;

      birth_in := NULL;
      is_minor_in := NULL;
      IF raw_birth <> '' THEN
        IF raw_birth !~ '^\d{4}-\d{2}-\d{2}$' OR to_char(to_date(raw_birth, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> raw_birth THEN
          RAISE EXCEPTION 'Data de nascimento invalida';
        END IF;
        birth_in := raw_birth::date;
        IF birth_in > (now() AT TIME ZONE 'America/Sao_Paulo')::date OR birth_in < DATE '1900-01-01' THEN
          RAISE EXCEPTION 'Data de nascimento fora do intervalo';
        END IF;
      END IF;

      g_name := nullif(btrim(coalesce(rec->>'responsavel_nome', '')), '');
      g_birth := NULL;
      IF nullif(btrim(coalesce(rec->>'responsavel_data_nascimento', '')), '') IS NOT NULL THEN
        g_birth := nullif(btrim(rec->>'responsavel_data_nascimento'), '')::date;
      END IF;
      g_cpf := nullif(regexp_replace(coalesce(rec->>'responsavel_cpf', ''), '[^0-9]', '', 'g'), '');
      IF g_cpf IS NOT NULL AND NOT public.onboarding_valid_cpf(g_cpf) THEN
        RAISE EXCEPTION 'CPF do responsavel invalido';
      END IF;
      g_phone := nullif(btrim(coalesce(rec->>'responsavel_telefone', '')), '');
      g_email := nullif(lower(btrim(coalesce(rec->>'responsavel_email', ''))), '');
      g_cep := nullif(regexp_replace(coalesce(rec->>'responsavel_cep', ''), '[^0-9]', '', 'g'), '');
      g_addr := nullif(btrim(coalesce(rec->>'responsavel_endereco', '')), '');
      has_guardian := (g_name IS NOT NULL OR g_cpf IS NOT NULL OR g_phone IS NOT NULL OR g_email IS NOT NULL);

      IF birth_in IS NOT NULL THEN
        is_minor_in := (birth_in + interval '18 years') > (now() AT TIME ZONE 'America/Sao_Paulo')::date;
      ELSIF has_guardian THEN
        is_minor_in := true;
      END IF;

      student_id := NULL;
      IF NULLIF(rec->>'aluno_id', '') IS NOT NULL THEN
        IF rec->>'aluno_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'Identificador de aluno invalido';
        END IF;
        student_id := (rec->>'aluno_id')::uuid;
        SELECT * INTO s FROM public.students WHERE school_id = p_school AND id = student_id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'aluno_id nao pertence a esta escola';
        END IF;
        IF lower(btrim(s.full_name)) <> lower(nm) THEN
          RAISE EXCEPTION 'Nome nao coincide com o aluno_id; revise a planilha';
        END IF;
        IF cpf_in <> '' AND coalesce(s.cpf, '') <> '' AND regexp_replace(s.cpf, '[^0-9]', '', 'g') <> cpf_in THEN
          RAISE EXCEPTION 'CPF diferente do cadastro; revise manualmente';
        END IF;
      ELSE
        SELECT count(*), min(id::text)::uuid INTO match_count, student_id
        FROM public.students
        WHERE school_id = p_school
          AND cpf_in <> ''
          AND regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = cpf_in;
        IF match_count > 1 THEN
          RAISE EXCEPTION 'CPF duplicado na escola; resolver manualmente';
        END IF;
        IF match_count = 0 THEN
          SELECT count(*), min(id::text)::uuid INTO match_count, student_id
          FROM public.students
          WHERE school_id = p_school
            AND lower(btrim(full_name)) = lower(nm)
            AND (
              (ph IS NOT NULL AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') IN (ph_digits, '55' || ph_digits))
              OR (em <> '' AND lower(coalesce(email, '')) = em)
            );
          IF match_count > 1 THEN
            RAISE EXCEPTION 'Mais de um cadastro coincide; resolver manualmente';
          END IF;
        END IF;
        IF student_id IS NOT NULL THEN
          SELECT * INTO s FROM public.students WHERE school_id = p_school AND id = student_id FOR UPDATE;
          IF lower(btrim(s.full_name)) <> lower(nm) THEN
            RAISE EXCEPTION 'CPF existente com outro nome; revisar manualmente';
          END IF;
          IF cpf_in <> '' AND coalesce(s.cpf, '') <> '' AND regexp_replace(s.cpf, '[^0-9]', '', 'g') <> cpf_in THEN
            RAISE EXCEPTION 'CPF diferente do cadastro; revisar manualmente';
          END IF;
        END IF;
      END IF;

      IF student_id IS NULL THEN
        INSERT INTO public.students(
          school_id, full_name, phone, cpf, email, birth_date, cep, address, is_minor,
          guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_cep, guardian_address
        )
        VALUES(
          p_school, nm, ph, nullif(cpf_in, ''), nullif(em, ''), birth_in, nullif(cep_in, ''),
          nullif(btrim(coalesce(rec->>'endereco', '')), ''), is_minor_in,
          g_name, g_birth, g_cpf, g_phone, g_email, g_cep, g_addr
        )
        RETURNING id INTO student_id;
        inserted_count := inserted_count + 1;
        action := 'criado';
      ELSE
        UPDATE public.students st SET
          phone = coalesce(nullif(st.phone, ''), ph),
          cpf = coalesce(nullif(st.cpf, ''), nullif(cpf_in, '')),
          email = coalesce(nullif(st.email, ''), nullif(em, '')),
          birth_date = coalesce(st.birth_date, birth_in),
          is_minor = coalesce(st.is_minor, is_minor_in),
          cep = coalesce(nullif(st.cep, ''), nullif(cep_in, '')),
          address = coalesce(nullif(st.address, ''), nullif(btrim(coalesce(rec->>'endereco', '')), '')),
          guardian_name = coalesce(nullif(st.guardian_name, ''), g_name),
          guardian_birth_date = coalesce(st.guardian_birth_date, g_birth),
          guardian_cpf = coalesce(nullif(st.guardian_cpf, ''), g_cpf),
          guardian_phone = coalesce(nullif(st.guardian_phone, ''), g_phone),
          guardian_email = coalesce(nullif(st.guardian_email, ''), g_email),
          guardian_cep = coalesce(nullif(st.guardian_cep, ''), g_cep),
          guardian_address = coalesce(nullif(st.guardian_address, ''), g_addr)
        WHERE st.id = student_id AND st.school_id = p_school
          AND (
            (nullif(st.phone, '') IS NULL AND ph IS NOT NULL)
            OR (nullif(st.cpf, '') IS NULL AND cpf_in <> '')
            OR (nullif(st.email, '') IS NULL AND em <> '')
            OR (st.birth_date IS NULL AND birth_in IS NOT NULL)
            OR (st.is_minor IS NULL AND is_minor_in IS NOT NULL)
            OR (nullif(st.cep, '') IS NULL AND cep_in <> '')
            OR (nullif(st.address, '') IS NULL AND nullif(rec->>'endereco', '') IS NOT NULL)
            OR (nullif(st.guardian_name, '') IS NULL AND g_name IS NOT NULL)
            OR (st.guardian_birth_date IS NULL AND g_birth IS NOT NULL)
            OR (nullif(st.guardian_cpf, '') IS NULL AND g_cpf IS NOT NULL)
            OR (nullif(st.guardian_phone, '') IS NULL AND g_phone IS NOT NULL)
            OR (nullif(st.guardian_email, '') IS NULL AND g_email IS NOT NULL)
            OR (nullif(st.guardian_cep, '') IS NULL AND g_cep IS NOT NULL)
            OR (nullif(st.guardian_address, '') IS NULL AND g_addr IS NOT NULL)
          );
        IF FOUND THEN
          filled_count := filled_count + 1;
          action := 'completado';
        ELSE
          skipped_count := skipped_count + 1;
          action := 'ja_existente';
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      err := SQLERRM;
      rejected_count := rejected_count + 1;
      action := 'erro';
    END;
    results := results || jsonb_build_array(jsonb_build_object('linha', line_no, 'resultado', action, 'aluno_id', student_id, 'motivo', err));
  END LOOP;

  RETURN jsonb_build_object(
    'criados', inserted_count,
    'completados', filled_count,
    'existentes', skipped_count,
    'erros', rejected_count,
    'linhas', results
  );
END;
$function$;

-- 5. Atualizar confirm_manual_contract para preservar is_minor e dados do responsável mesmo quando birth_date não é informado
CREATE OR REPLACE FUNCTION public.confirm_manual_contract(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  s jsonb;
  s1 jsonb;
  s2 jsonb;
  sid1 uuid;
  sid2 uuid;
  bdate1 date;
  bdate2 date;
  minor1 boolean;
  minor2 boolean;
  today_sp date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  start_dt date;
  close_immediately boolean := false;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado a esta escola';
  END IF;
  IF c.status = 'signed' AND c.audit->>'method' = 'manual_registry' THEN RETURN false; END IF;
  IF c.status <> 'ready_manual' THEN RAISE EXCEPTION 'Gere o contrato antes de confirmar assinatura manual'; END IF;
  IF EXISTS (SELECT 1 FROM public.external_signatures WHERE contract_id = c.id) THEN
    RAISE EXCEPTION 'O contrato possui assinatura externa; consulte o registro original';
  END IF;

  s := c.student_snapshot;
  IF s IS NULL OR jsonb_typeof(s) <> 'object' THEN
    RAISE EXCEPTION 'Pre-matricula incompleta';
  END IF;

  start_dt := coalesce(NULLIF(c.terms->>'start_date', '')::date, today_sp);
  close_immediately := coalesce((c.terms->>'close_previous_immediately')::boolean, false);

  IF c.kind = 'dupla' THEN
    s1 := coalesce(s->'student1', s);
    s2 := s->'student2';
    IF s2 IS NULL OR jsonb_typeof(s2) <> 'object' THEN
      RAISE EXCEPTION 'Dados do 2º aluno da dupla incompletos';
    END IF;
    IF NULLIF(btrim(s1->>'full_name'), '') IS NULL OR NULLIF(btrim(s2->>'full_name'), '') IS NULL THEN
      RAISE EXCEPTION 'Nome completo de ambos os alunos e obrigatorio';
    END IF;

    -- Aluno 1
    sid1 := c.student_id;
    bdate1 := NULLIF(s1->>'birth_date', '')::date;
    IF bdate1 IS NOT NULL THEN
      minor1 := (bdate1 + interval '18 years')::date > today_sp;
    ELSE
      minor1 := coalesce((s1->>'is_minor')::boolean, NULLIF(btrim(s1->>'guardian_name'), '') IS NOT NULL, false);
    END IF;

    IF sid1 IS NOT NULL THEN
      UPDATE public.students SET
        full_name = coalesce(NULLIF(btrim(s1->>'full_name'), ''), full_name),
        cpf = coalesce(NULLIF(btrim(s1->>'cpf'), ''), cpf),
        email = coalesce(NULLIF(btrim(s1->>'email'), ''), email),
        birth_date = coalesce(bdate1, birth_date),
        phone = coalesce(NULLIF(btrim(s1->>'phone'), ''), phone),
        address = coalesce(NULLIF(btrim(s1->>'address'), ''), address),
        cep = coalesce(NULLIF(btrim(s1->>'cep'), ''), cep),
        is_minor = CASE WHEN bdate1 IS NOT NULL THEN minor1 ELSE coalesce((s1->>'is_minor')::boolean, is_minor, minor1) END,
        guardian_name = coalesce(NULLIF(btrim(s1->>'guardian_name'), ''), NULLIF(btrim(s->>'guardian_name'), ''), guardian_name),
        guardian_birth_date = coalesce(NULLIF(s1->>'guardian_birth_date', '')::date, NULLIF(s->>'guardian_birth_date', '')::date, guardian_birth_date),
        guardian_cpf = coalesce(NULLIF(btrim(s1->>'guardian_cpf'), ''), NULLIF(btrim(s->>'guardian_cpf'), ''), guardian_cpf),
        guardian_phone = coalesce(NULLIF(btrim(s1->>'guardian_phone'), ''), NULLIF(btrim(s->>'guardian_phone'), ''), guardian_phone),
        guardian_email = coalesce(NULLIF(btrim(s1->>'guardian_email'), ''), NULLIF(btrim(s->>'guardian_email'), ''), guardian_email),
        guardian_address = coalesce(NULLIF(btrim(s1->>'guardian_address'), ''), NULLIF(btrim(s->>'guardian_address'), ''), guardian_address),
        guardian_cep = coalesce(NULLIF(btrim(s1->>'guardian_cep'), ''), NULLIF(btrim(s->>'guardian_cep'), ''), guardian_cep)
      WHERE id = sid1 AND school_id = c.school_id;
    ELSE
      INSERT INTO public.students(
        school_id, lead_id, full_name, cpf, email, birth_date, phone, address, cep, is_minor,
        guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_address, guardian_cep
      ) VALUES (
        c.school_id, c.lead_id, btrim(s1->>'full_name'), NULLIF(btrim(s1->>'cpf'), ''), NULLIF(btrim(s1->>'email'), ''), bdate1,
        NULLIF(btrim(s1->>'phone'), ''), NULLIF(btrim(s1->>'address'), ''), NULLIF(btrim(s1->>'cep'), ''), minor1,
        coalesce(NULLIF(btrim(s1->>'guardian_name'), ''), NULLIF(btrim(s->>'guardian_name'), '')),
        coalesce(NULLIF(s1->>'guardian_birth_date', '')::date, NULLIF(s->>'guardian_birth_date', '')::date),
        coalesce(NULLIF(btrim(s1->>'guardian_cpf'), ''), NULLIF(btrim(s->>'guardian_cpf'), '')),
        coalesce(NULLIF(btrim(s1->>'guardian_phone'), ''), NULLIF(btrim(s->>'guardian_phone'), '')),
        coalesce(NULLIF(btrim(s1->>'guardian_email'), ''), NULLIF(btrim(s->>'guardian_email'), '')),
        coalesce(NULLIF(btrim(s1->>'guardian_address'), ''), NULLIF(btrim(s->>'guardian_address'), '')),
        coalesce(NULLIF(btrim(s1->>'guardian_cep'), ''), NULLIF(btrim(s->>'guardian_cep'), ''))
      )
      ON CONFLICT (lead_id) DO UPDATE SET
        full_name = coalesce(excluded.full_name, public.students.full_name),
        cpf = coalesce(excluded.cpf, public.students.cpf),
        email = coalesce(excluded.email, public.students.email),
        birth_date = coalesce(excluded.birth_date, public.students.birth_date),
        phone = coalesce(excluded.phone, public.students.phone),
        address = coalesce(excluded.address, public.students.address),
        cep = coalesce(excluded.cep, public.students.cep),
        is_minor = coalesce(excluded.is_minor, public.students.is_minor),
        guardian_name = coalesce(excluded.guardian_name, public.students.guardian_name),
        guardian_birth_date = coalesce(excluded.guardian_birth_date, public.students.guardian_birth_date),
        guardian_cpf = coalesce(excluded.guardian_cpf, public.students.guardian_cpf),
        guardian_phone = coalesce(excluded.guardian_phone, public.students.guardian_phone),
        guardian_email = coalesce(excluded.guardian_email, public.students.guardian_email),
        guardian_address = coalesce(excluded.guardian_address, public.students.guardian_address),
        guardian_cep = coalesce(excluded.guardian_cep, public.students.guardian_cep)
      RETURNING id INTO sid1;
    END IF;

    -- Aluno 2
    sid2 := c.student2_id;
    bdate2 := NULLIF(s2->>'birth_date', '')::date;
    IF bdate2 IS NOT NULL THEN
      minor2 := (bdate2 + interval '18 years')::date > today_sp;
    ELSE
      minor2 := coalesce((s2->>'is_minor')::boolean, NULLIF(btrim(s2->>'guardian_name'), '') IS NOT NULL, false);
    END IF;

    IF sid2 IS NOT NULL THEN
      UPDATE public.students SET
        full_name = coalesce(NULLIF(btrim(s2->>'full_name'), ''), full_name),
        cpf = coalesce(NULLIF(btrim(s2->>'cpf'), ''), cpf),
        email = coalesce(NULLIF(btrim(s2->>'email'), ''), email),
        birth_date = coalesce(bdate2, birth_date),
        phone = coalesce(NULLIF(btrim(s2->>'phone'), ''), phone),
        address = coalesce(NULLIF(btrim(s2->>'address'), ''), address),
        cep = coalesce(NULLIF(btrim(s2->>'cep'), ''), cep),
        is_minor = CASE WHEN bdate2 IS NOT NULL THEN minor2 ELSE coalesce((s2->>'is_minor')::boolean, is_minor, minor2) END,
        guardian_name = coalesce(NULLIF(btrim(s2->>'guardian_name'), ''), NULLIF(btrim(s->>'guardian_name'), ''), guardian_name),
        guardian_birth_date = coalesce(NULLIF(s2->>'guardian_birth_date', '')::date, NULLIF(s->>'guardian_birth_date', '')::date, guardian_birth_date),
        guardian_cpf = coalesce(NULLIF(btrim(s2->>'guardian_cpf'), ''), NULLIF(btrim(s->>'guardian_cpf'), ''), guardian_cpf),
        guardian_phone = coalesce(NULLIF(btrim(s2->>'guardian_phone'), ''), NULLIF(btrim(s->>'guardian_phone'), ''), guardian_phone),
        guardian_email = coalesce(NULLIF(btrim(s2->>'guardian_email'), ''), NULLIF(btrim(s->>'guardian_email'), ''), guardian_email),
        guardian_address = coalesce(NULLIF(btrim(s2->>'guardian_address'), ''), NULLIF(btrim(s->>'guardian_address'), ''), guardian_address),
        guardian_cep = coalesce(NULLIF(btrim(s2->>'guardian_cep'), ''), NULLIF(btrim(s->>'guardian_cep'), ''), guardian_cep)
      WHERE id = sid2 AND school_id = c.school_id;
    ELSE
      INSERT INTO public.students(
        school_id, lead_id, full_name, cpf, email, birth_date, phone, address, cep, is_minor,
        guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_address, guardian_cep
      ) VALUES (
        c.school_id, NULL, btrim(s2->>'full_name'), NULLIF(btrim(s2->>'cpf'), ''), NULLIF(btrim(s2->>'email'), ''), bdate2,
        NULLIF(btrim(s2->>'phone'), ''), NULLIF(btrim(s2->>'address'), ''), NULLIF(btrim(s2->>'cep'), ''), minor2,
        coalesce(NULLIF(btrim(s2->>'guardian_name'), ''), NULLIF(btrim(s->>'guardian_name'), '')),
        coalesce(NULLIF(s2->>'guardian_birth_date', '')::date, NULLIF(s->>'guardian_birth_date', '')::date),
        coalesce(NULLIF(btrim(s2->>'guardian_cpf'), ''), NULLIF(btrim(s->>'guardian_cpf'), '')),
        coalesce(NULLIF(btrim(s2->>'guardian_phone'), ''), NULLIF(btrim(s->>'guardian_phone'), '')),
        coalesce(NULLIF(btrim(s2->>'guardian_email'), ''), NULLIF(btrim(s->>'guardian_email'), '')),
        coalesce(NULLIF(btrim(s2->>'guardian_address'), ''), NULLIF(btrim(s->>'guardian_address'), '')),
        coalesce(NULLIF(btrim(s2->>'guardian_cep'), ''), NULLIF(btrim(s->>'guardian_cep'), ''))
      ) RETURNING id INTO sid2;
    END IF;

    IF close_immediately OR start_dt <= today_sp THEN
      IF c.previous_contract_id IS NOT NULL THEN
        UPDATE public.contracts
        SET status = 'closed', closed_at = coalesce(closed_at, now()), closure_reason = coalesce(closure_reason, 'rematricula_anterior')
        WHERE id = c.previous_contract_id AND school_id = c.school_id AND status = 'signed';
      END IF;
      UPDATE public.contracts
      SET status = 'closed', closed_at = coalesce(closed_at, now()), closure_reason = coalesce(closure_reason, CASE WHEN c.previous_contract_id IS NOT NULL THEN 'rematricula_anterior' ELSE 'Migrado para turma em dupla' END)
      WHERE school_id = c.school_id
        AND id <> c.id
        AND (student_id = ANY(ARRAY[sid1, sid2]) OR student2_id = ANY(ARRAY[sid1, sid2]))
        AND status = 'signed'
        AND (close_immediately OR coalesce(NULLIF(terms->>'end_date', '')::date, today_sp) <= start_dt);
    END IF;

    IF c.lead_id IS NOT NULL THEN
      UPDATE public.leads SET status = 'convertido', crm_stage = 'matriculado', crm_outcome = 'won', updated_at = now() WHERE id = c.lead_id;
    END IF;

    UPDATE public.contracts SET
      student_id = sid1,
      student2_id = sid2,
      status = 'signed',
      signed_at = now(),
      audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object('method', 'manual_registry', 'signature', 'physical', 'confirmed_by', auth.uid(), 'confirmed_at', now())
    WHERE id = c.id;

    UPDATE public.calendar_lessons
    SET status = 'scheduled', reservation_expires_at = NULL, updated_at = now()
    WHERE contract_id = c.id AND school_id = c.school_id AND status = 'reserved';

    RETURN true;
  END IF;

  -- Modo Individual ou Menor
  IF NULLIF(btrim(s->>'full_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Nome completo do aluno e obrigatorio';
  END IF;

  bdate1 := NULLIF(s->>'birth_date', '')::date;
  IF bdate1 IS NOT NULL THEN
    minor1 := (bdate1 + interval '18 years')::date > today_sp;
  ELSE
    minor1 := (c.kind = 'menor') OR coalesce((s->>'is_minor')::boolean, NULLIF(btrim(s->>'guardian_name'), '') IS NOT NULL, false);
  END IF;

  sid1 := c.student_id;
  IF sid1 IS NOT NULL THEN
    UPDATE public.students SET
      full_name = coalesce(NULLIF(btrim(s->>'full_name'), ''), full_name),
      cpf = coalesce(NULLIF(btrim(s->>'cpf'), ''), cpf),
      email = coalesce(NULLIF(btrim(s->>'email'), ''), email),
      birth_date = coalesce(bdate1, birth_date),
      phone = coalesce(NULLIF(btrim(s->>'phone'), ''), phone),
      address = coalesce(NULLIF(btrim(s->>'address'), ''), address),
      cep = coalesce(NULLIF(btrim(s->>'cep'), ''), cep),
      is_minor = CASE WHEN bdate1 IS NOT NULL THEN minor1 ELSE coalesce((s->>'is_minor')::boolean, is_minor, minor1) END,
      guardian_name = coalesce(NULLIF(btrim(s->>'guardian_name'), ''), guardian_name),
      guardian_birth_date = coalesce(NULLIF(s->>'guardian_birth_date', '')::date, guardian_birth_date),
      guardian_cpf = coalesce(NULLIF(btrim(s->>'guardian_cpf'), ''), guardian_cpf),
      guardian_phone = coalesce(NULLIF(btrim(s->>'guardian_phone'), ''), guardian_phone),
      guardian_email = coalesce(NULLIF(btrim(s->>'guardian_email'), ''), guardian_email),
      guardian_address = coalesce(NULLIF(btrim(s->>'guardian_address'), ''), guardian_address),
      guardian_cep = coalesce(NULLIF(btrim(s->>'guardian_cep'), ''), guardian_cep)
    WHERE id = sid1 AND school_id = c.school_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aluno original nao pertence a esta escola'; END IF;
  ELSE
    INSERT INTO public.students(
      school_id, lead_id, full_name, cpf, email, birth_date, phone, address, cep, is_minor,
      guardian_name, guardian_birth_date, guardian_cpf, guardian_phone, guardian_email, guardian_address, guardian_cep
    ) VALUES (
      c.school_id, c.lead_id, btrim(s->>'full_name'), NULLIF(btrim(s->>'cpf'), ''), NULLIF(btrim(s->>'email'), ''), bdate1,
      NULLIF(btrim(s->>'phone'), ''), NULLIF(btrim(s->>'address'), ''), NULLIF(btrim(s->>'cep'), ''), minor1,
      NULLIF(btrim(s->>'guardian_name'), ''), NULLIF(s->>'guardian_birth_date', '')::date, NULLIF(btrim(s->>'guardian_cpf'), ''),
      NULLIF(btrim(s->>'guardian_phone'), ''), NULLIF(btrim(s->>'guardian_email'), ''), NULLIF(btrim(s->>'guardian_address'), ''),
      NULLIF(btrim(s->>'guardian_cep'), '')
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      full_name = coalesce(excluded.full_name, public.students.full_name),
      cpf = coalesce(excluded.cpf, public.students.cpf),
      email = coalesce(excluded.email, public.students.email),
      birth_date = coalesce(excluded.birth_date, public.students.birth_date),
      phone = coalesce(excluded.phone, public.students.phone),
      address = coalesce(excluded.address, public.students.address),
      cep = coalesce(excluded.cep, public.students.cep),
      is_minor = coalesce(excluded.is_minor, public.students.is_minor),
      guardian_name = coalesce(excluded.guardian_name, public.students.guardian_name),
      guardian_birth_date = coalesce(excluded.guardian_birth_date, public.students.guardian_birth_date),
      guardian_cpf = coalesce(excluded.guardian_cpf, public.students.guardian_cpf),
      guardian_phone = coalesce(excluded.guardian_phone, public.students.guardian_phone),
      guardian_email = coalesce(excluded.guardian_email, public.students.guardian_email),
      guardian_address = coalesce(excluded.guardian_address, public.students.guardian_address),
      guardian_cep = coalesce(excluded.guardian_cep, public.students.guardian_cep)
    RETURNING id INTO sid1;
  END IF;

  IF close_immediately OR start_dt <= today_sp THEN
    IF c.previous_contract_id IS NOT NULL THEN
      UPDATE public.contracts
      SET status = 'closed', closed_at = coalesce(closed_at, now()), closure_reason = coalesce(closure_reason, 'rematricula_anterior')
      WHERE id = c.previous_contract_id AND school_id = c.school_id AND status = 'signed';
    END IF;
    UPDATE public.contracts
    SET status = 'closed', closed_at = coalesce(closed_at, now()), closure_reason = coalesce(closure_reason, 'rematricula_anterior')
    WHERE school_id = c.school_id
      AND id <> c.id
      AND (student_id = sid1 OR student2_id = sid1)
      AND status = 'signed'
      AND (close_immediately OR coalesce(NULLIF(terms->>'end_date', '')::date, today_sp) <= start_dt);
  END IF;

  IF c.lead_id IS NOT NULL THEN
    UPDATE public.leads SET status = 'convertido', crm_stage = 'matriculado', crm_outcome = 'won', updated_at = now() WHERE id = c.lead_id;
  END IF;

  UPDATE public.contracts SET
    student_id = sid1,
    status = 'signed',
    signed_at = now(),
    audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object('method', 'manual_registry', 'signature', 'physical', 'confirmed_by', auth.uid(), 'confirmed_at', now())
  WHERE id = c.id;

  UPDATE public.calendar_lessons
  SET status = 'scheduled', reservation_expires_at = NULL, updated_at = now()
  WHERE contract_id = c.id AND school_id = c.school_id AND status = 'reserved';

  RETURN true;
END;
$function$;

-- 6. Encerramento de matrícula com data, motivo e suporte a aviso prévio (Bug #19 e Melhoria #3)
CREATE OR REPLACE FUNCTION public.close_enrollment(
  p_contract_id uuid,
  p_reason text DEFAULT 'manual',
  p_closed_date date DEFAULT NULL,
  p_cancellation_fee numeric DEFAULT NULL,
  p_last_installment numeric DEFAULT NULL,
  p_keep_until_date boolean DEFAULT false,
  p_document_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  today_sp date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  eff_date date := coalesce(p_closed_date, today_sp);
  clean_reason text := coalesce(nullif(btrim(p_reason), ''), 'manual');
  notice_obj jsonb;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_school_member(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF c.status <> 'signed' THEN
    RAISE EXCEPTION 'Somente matriculas assinadas e abertas podem ser encerradas';
  END IF;

  notice_obj := jsonb_build_object(
    'requested_at', now(),
    'requested_by', auth.uid(),
    'effective_date', eff_date,
    'reason', clean_reason,
    'cancellation_fee', p_cancellation_fee,
    'last_installment_amount', p_last_installment,
    'keep_until_date', p_keep_until_date,
    'document_note', p_document_note
  );

  PERFORM set_config('campanella.allow_addendum', '1', true);

  IF p_keep_until_date AND eff_date > today_sp THEN
    -- Aviso prévio com término futuro: mantém contrato ativo até eff_date e cancela apenas aulas posteriores a eff_date
    UPDATE public.contracts
    SET
      closure_reason = clean_reason,
      terms = coalesce(terms, '{}'::jsonb) || jsonb_build_object(
        'cancellation_notice_at', today_sp::text,
        'cancellation_effective_date', eff_date::text,
        'cancellation_reason', clean_reason
      ),
      audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object('cancellation_notice', notice_obj)
    WHERE id = p_contract_id AND school_id = c.school_id;

    UPDATE public.calendar_lessons
    SET status = 'cancelled', scheduled_date = NULL, start_time = NULL, reservation_expires_at = NULL, updated_at = now()
    WHERE contract_id = p_contract_id
      AND school_id = c.school_id
      AND status IN ('reserved', 'scheduled', 'needs_reschedule')
      AND scheduled_date > eff_date;
  ELSE
    -- Encerramento imediato na data efetiva
    UPDATE public.contracts
    SET
      status = 'closed',
      closed_at = coalesce(p_closed_date::timestamptz, now()),
      closure_reason = clean_reason,
      terms = coalesce(terms, '{}'::jsonb) || jsonb_build_object(
        'cancellation_effective_date', eff_date::text,
        'cancellation_reason', clean_reason
      ),
      audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object('cancellation_notice', notice_obj)
    WHERE id = p_contract_id AND school_id = c.school_id AND status = 'signed';

    UPDATE public.calendar_lessons
    SET status = 'cancelled', scheduled_date = NULL, start_time = NULL, reservation_expires_at = NULL, updated_at = now()
    WHERE contract_id = p_contract_id
      AND school_id = c.school_id
      AND status IN ('reserved', 'scheduled', 'needs_reschedule')
      AND (scheduled_date IS NULL OR scheduled_date > eff_date);
  END IF;
END;
$function$;

-- 7. Permitir Aditivo de Contrato via flag de sessão controlada em lock_sent_contract (Melhoria #2)
CREATE OR REPLACE FUNCTION public.lock_sent_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(current_setting('campanella.allow_addendum', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF old.status <> 'draft' AND (
     new.terms IS DISTINCT FROM old.terms OR
     new.template_html IS DISTINCT FROM old.template_html OR
     new.template_version IS DISTINCT FROM old.template_version OR
     new.owner_name IS DISTINCT FROM old.owner_name OR
     new.owner_signature_png IS DISTINCT FROM old.owner_signature_png OR
     new.contract_type_id IS DISTINCT FROM old.contract_type_id
  ) THEN
    RAISE EXCEPTION 'Conteudo do contrato nao pode mudar apos envio';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_contract_addendum(p_contract_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
  eff_date date;
  new_teacher uuid;
  new_pkg_id uuid;
  pkg public.packages%ROWTYPE;
  slot_list uuid[];
  new_freq integer;
  new_installment numeric(12,2);
  new_total numeric(12,2);
  new_installments integer;
  new_lessons_count integer;
  new_end_date date;
  notes_in text;
  doc_name text;
  doc_data text;
  schedule jsonb;
  day_ids int[];
  first_hour time;
  teacher_nm text;
  addendum_record jsonb;
  updated_terms jsonb;
  completed_count integer := 0;
  future_lessons jsonb := '[]'::jsonb;
  projection jsonb;
  target_future_count integer;
  les jsonb;
  l_num integer;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT public.is_school_admin(c.school_id) OR NOT public.has_active_school_license(c.school_id) THEN
    RAISE EXCEPTION 'Acesso negado a esta escola';
  END IF;
  IF c.status <> 'signed' THEN
    RAISE EXCEPTION 'Somente contratos ativos (assinados) podem receber aditivo';
  END IF;

  eff_date := coalesce(NULLIF(p_data->>'effective_date', '')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  new_teacher := coalesce(NULLIF(p_data->>'teacher_id', '')::uuid, NULLIF(c.terms->>'teacher_id', '')::uuid);
  new_pkg_id := NULLIF(p_data->>'package_id', '')::uuid;
  new_installment := coalesce(NULLIF(p_data->>'installment_amount', '')::numeric, (c.terms->>'installment_amount')::numeric);
  new_total := coalesce(NULLIF(p_data->>'total_amount', '')::numeric, (c.terms->>'total_amount')::numeric);
  new_installments := coalesce(NULLIF(p_data->>'installments', '')::integer, (c.terms->>'installments')::integer);
  new_lessons_count := coalesce(NULLIF(p_data->>'lessons_count', '')::integer, (c.terms->>'lessons_count')::integer);
  new_end_date := coalesce(NULLIF(p_data->>'end_date', '')::date, NULLIF(c.terms->>'end_date', '')::date);
  notes_in := NULLIF(btrim(coalesce(p_data->>'notes', p_data->>'reason', '')), '');
  doc_name := NULLIF(btrim(coalesce(p_data->>'document_name', '')), '');
  doc_data := NULLIF(p_data->>'document_data', '');

  IF jsonb_typeof(p_data->'slot_ids') = 'array' AND jsonb_array_length(p_data->'slot_ids') > 0 THEN
    SELECT array_agg(x::uuid) INTO slot_list FROM jsonb_array_elements_text(p_data->'slot_ids') x;
  ELSIF jsonb_typeof(c.terms->'calendar_v6'->'slot_ids') = 'array' THEN
    SELECT array_agg(x::uuid) INTO slot_list FROM jsonb_array_elements_text(c.terms->'calendar_v6'->'slot_ids') x;
  END IF;

  new_freq := coalesce(cardinality(slot_list), NULLIF(p_data->>'weekly_frequency', '')::integer, (c.terms->>'weekly_frequency')::integer, 1);

  SELECT name INTO teacher_nm FROM public.teachers WHERE id = new_teacher AND school_id = c.school_id;
  IF new_pkg_id IS NOT NULL THEN
    SELECT * INTO pkg FROM public.packages WHERE id = new_pkg_id AND school_id = c.school_id;
  END IF;

  updated_terms := c.terms;
  IF new_pkg_id IS NOT NULL AND pkg.id IS NOT NULL THEN
    updated_terms := updated_terms || jsonb_build_object('package_id', pkg.id, 'package_name', pkg.name);
  END IF;
  IF new_teacher IS NOT NULL THEN
    updated_terms := updated_terms || jsonb_build_object('teacher_id', new_teacher, 'teacher_name', coalesce(teacher_nm, c.terms->>'teacher_name'));
  END IF;

  IF jsonb_typeof(p_data->'slot_ids') = 'array' AND coalesce(cardinality(slot_list), 0) > 0 THEN
    SELECT array_agg(sl.weekday ORDER BY sl.weekday, sl.start_time), min(sl.start_time)
    INTO day_ids, first_hour
    FROM public.calendar_slots sl
    WHERE sl.id = ANY(slot_list) AND sl.school_id = c.school_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'day', sl.weekday,
      'time', to_char(sl.start_time, 'HH24:MI'),
      'duration_minutes', sl.duration_minutes,
      'slot_id', sl.id
    ) ORDER BY sl.weekday, sl.start_time), '[]'::jsonb)
    INTO schedule
    FROM public.calendar_slots sl
    WHERE sl.id = ANY(slot_list) AND sl.school_id = c.school_id;

    DELETE FROM public.calendar_lessons
    WHERE contract_id = c.id
      AND school_id = c.school_id
      AND status IN ('scheduled', 'reserved')
      AND scheduled_date >= eff_date;

    SELECT count(*), coalesce(max(lesson_number), 0)
    INTO completed_count, l_num
    FROM public.calendar_lessons
    WHERE contract_id = c.id AND school_id = c.school_id AND status <> 'cancelled';

    target_future_count := NULLIF(p_data->>'remaining_lessons', '')::integer;
    IF target_future_count IS NULL THEN
      target_future_count := greatest(1, coalesce(new_lessons_count, completed_count + 4) - completed_count);
    END IF;

    IF coalesce(c.terms->>'enrollment_mode', '') = 'recurrence' AND new_end_date IS NOT NULL AND new_end_date >= eff_date THEN
      projection := public.calendar_preview(c.school_id, new_teacher, eff_date, NULL, slot_list, new_end_date, 'recurrence');
    ELSE
      projection := public.calendar_preview(c.school_id, new_teacher, eff_date, target_future_count, slot_list, NULL, 'package');
      new_end_date := coalesce((projection->>'end_date')::date, new_end_date);
    END IF;

    FOR les IN SELECT value FROM jsonb_array_elements(coalesce(projection->'lessons', '[]'::jsonb)) LOOP
      l_num := l_num + 1;
      INSERT INTO public.calendar_lessons(
        school_id, contract_id, teacher_id, slot_id, lesson_number,
        original_date, original_time, scheduled_date, start_time, duration_minutes, status
      ) VALUES (
        c.school_id, c.id, new_teacher, NULLIF(les->>'slot_id', '')::uuid, l_num,
        (les->>'date')::date, (les->>'time')::time, (les->>'date')::date, (les->>'time')::time,
        coalesce((les->>'duration')::integer, 60), 'scheduled'
      );
    END LOOP;

    updated_terms := updated_terms || jsonb_build_object(
      'weekly_frequency', new_freq,
      'weekly_days', to_jsonb(day_ids),
      'lesson_time', to_char(first_hour, 'HH24:MI'),
      'lesson_schedule', schedule,
      'lessons_count', l_num,
      'end_date', coalesce(new_end_date::text, c.terms->>'end_date'),
      'calendar_v6', coalesce(c.terms->'calendar_v6', '{}'::jsonb) || jsonb_build_object('slot_ids', to_jsonb(slot_list), 'calculated_end', coalesce(new_end_date::text, c.terms->>'end_date'))
    );

    IF c.student_id IS NOT NULL THEN
      UPDATE public.students
      SET calendar_teacher_id = new_teacher, calendar_slot_ids = slot_list, current_schedule = schedule, current_weekly_days = day_ids, current_lesson_time = first_hour
      WHERE id = c.student_id AND school_id = c.school_id;
    END IF;
    IF c.student2_id IS NOT NULL THEN
      UPDATE public.students
      SET calendar_teacher_id = new_teacher, calendar_slot_ids = slot_list, current_schedule = schedule, current_weekly_days = day_ids, current_lesson_time = first_hour
      WHERE id = c.student2_id AND school_id = c.school_id;
    END IF;
  END IF;

  addendum_record := jsonb_build_object(
    'id', gen_random_uuid(),
    'date', eff_date::text,
    'created_at', now(),
    'created_by', auth.uid(),
    'effective_date', eff_date,
    'previous_weekly_frequency', c.terms->'weekly_frequency',
    'new_weekly_frequency', new_freq,
    'previous_installment_amount', c.terms->'installment_amount',
    'new_installment_amount', new_installment,
    'previous_total_amount', c.terms->'total_amount',
    'new_total_amount', new_total,
    'reason', notes_in,
    'notes', notes_in,
    'document_name', doc_name,
    'document_data', doc_data
  );

  updated_terms := updated_terms || jsonb_build_object(
    'installment_amount', new_installment,
    'total_amount', new_total,
    'total_extenso', coalesce(NULLIF(p_data->>'total_extenso', ''), updated_terms->>'total_extenso'),
    'installments', new_installments,
    'lessons_count', coalesce(new_lessons_count, (updated_terms->>'lessons_count')::integer),
    'end_date', coalesce(new_end_date::text, updated_terms->>'end_date'),
    'discount_amount', coalesce(NULLIF(p_data->>'discount_amount', ''), updated_terms->>'discount_amount'),
    'discount_until', coalesce(NULLIF(p_data->>'discount_until', ''), updated_terms->>'discount_until'),
    'addendums', coalesce(updated_terms->'addendums', '[]'::jsonb) || jsonb_build_array(addendum_record)
  );

  PERFORM set_config('campanella.allow_addendum', '1', true);

  UPDATE public.contracts
  SET
    terms = updated_terms,
    audit = coalesce(audit, '{}'::jsonb) || jsonb_build_object(
      'addendums', coalesce(audit->'addendums', '[]'::jsonb) || jsonb_build_array(addendum_record)
    )
  WHERE id = c.id AND school_id = c.school_id;

  RETURN addendum_record;
END;
$function$;

-- 8. Exclusão definitiva de contrato/matrícula, aluno com histórico e horário da grade (Bugs #20 e #21)
CREATE OR REPLACE FUNCTION public.delete_contract_cascade(p_school uuid, p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  c public.contracts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
    RAISE EXCEPTION 'Apenas administradores da escola podem excluir contratos.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND school_id = p_school FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.contracts SET previous_contract_id = NULL WHERE previous_contract_id = p_contract_id AND school_id = p_school;
  DELETE FROM public.calendar_lesson_history WHERE school_id = p_school AND lesson_id IN (SELECT id FROM public.calendar_lessons WHERE contract_id = p_contract_id AND school_id = p_school);
  DELETE FROM public.calendar_lessons WHERE contract_id = p_contract_id AND school_id = p_school;
  DELETE FROM public.calendar_legacy_adoptions WHERE contract_id = p_contract_id AND school_id = p_school;
  DELETE FROM public.external_signatures WHERE contract_id = p_contract_id;
  DELETE FROM public.contracts WHERE id = p_contract_id AND school_id = p_school;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_student_cascade(p_school uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_lead_id uuid;
  v_cid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
    RAISE EXCEPTION 'Apenas administradores da escola podem excluir alunos.';
  END IF;

  SELECT lead_id INTO v_lead_id FROM public.students WHERE id = p_student_id AND school_id = p_school;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  FOR v_cid IN
    SELECT id FROM public.contracts
    WHERE school_id = p_school AND (student_id = p_student_id OR student2_id = p_student_id)
  LOOP
    PERFORM public.delete_contract_cascade(p_school, v_cid);
  END LOOP;

  DELETE FROM public.students WHERE id = p_student_id AND school_id = p_school;

  IF v_lead_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.contracts WHERE school_id = p_school AND lead_id = v_lead_id)
     AND NOT EXISTS (SELECT 1 FROM public.students WHERE school_id = p_school AND lead_id = v_lead_id) THEN
    DELETE FROM public.interviews WHERE school_id = p_school AND lead_id = v_lead_id;
    DELETE FROM public.interview_invites WHERE school_id = p_school AND lead_id = v_lead_id;
    DELETE FROM public.crm_followups WHERE school_id = p_school AND lead_id = v_lead_id;
    DELETE FROM public.crm_appointments WHERE school_id = p_school AND lead_id = v_lead_id;
    DELETE FROM public.crm_activities WHERE school_id = p_school AND lead_id = v_lead_id;
    DELETE FROM public.leads WHERE school_id = p_school AND id = v_lead_id;
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calendar_delete_slot(p_slot uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  sl public.calendar_slots%ROWTYPE;
BEGIN
  SELECT * INTO sl FROM public.calendar_slots WHERE id = p_slot FOR UPDATE;
  IF NOT FOUND OR NOT public.calendar_can_manage(sl.school_id, sl.teacher_id) THEN
    RAISE EXCEPTION 'Horario nao encontrado';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.calendar_lessons l
    WHERE l.teacher_id = sl.teacher_id
      AND l.status IN ('reserved', 'scheduled')
      AND l.scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND l.start_time = sl.start_time
      AND l.duration_minutes = sl.duration_minutes
      AND (l.scheduled_date = sl.slot_date OR (sl.slot_date IS NULL AND EXTRACT(DOW FROM l.scheduled_date) = sl.weekday))
  ) THEN
    RAISE EXCEPTION 'Este horario possui aulas futuras; bloqueie o periodo e reagende cada aula primeiro';
  END IF;
  UPDATE public.calendar_lessons SET slot_id = NULL WHERE slot_id = p_slot;
  DELETE FROM public.calendar_slots WHERE id = p_slot;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_school_details(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_enrollment(uuid, text, date, numeric, numeric, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_contract_addendum(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contract_cascade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_cascade(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_delete_slot(uuid) TO authenticated;

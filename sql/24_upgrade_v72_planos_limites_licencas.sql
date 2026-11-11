-- =============================================================================
-- Campanella V7.2 - Planos de Uso, Limites de Capacidade e Adicionais
-- =============================================================================
-- Planos definidos:
--   1. CRM: R$ 69/mês - Somente CRM (leads, agendamentos, fichas). Sem gestão de alunos/professores/contratos.
--   2. Essencial: R$ 129/mês - 30 alunos ativos + 3 professores ativos. CRM, matrículas, contratos e agenda.
--   3. Profissional: R$ 179/mês - 50 alunos ativos + 5 professores ativos. CRM, matrículas, contratos e agenda.
--   4. Avançado: R$ 279/mês - 100 alunos ativos + 10 professores ativos. CRM, matrículas, contratos e agenda.
--   5. Ilimitado: compatibilidade para escolas legadas/cortesias especiais sem limite.
--
-- Upgrades / Adicionais:
--   - +10 alunos ativos: R$ 15/mês por lote de 10
--   - +1 professor ativo: R$ 10/mês por professor extra
-- =============================================================================

BEGIN;

SET LOCAL check_function_bodies = false;

-- 1. Novas colunas nas tabelas de licenças e chaves
ALTER TABLE public.school_licenses
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'essencial',
  ADD COLUMN IF NOT EXISTS extra_students_packs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_teachers integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.school_licenses
    ADD CONSTRAINT school_licenses_plan_check
    CHECK (plan IN ('crm', 'essencial', 'profissional', 'avancado', 'ilimitado'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.school_licenses
    ADD CONSTRAINT school_licenses_addons_check
    CHECK (extra_students_packs >= 0 AND extra_teachers >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Atualizar todas as licenças pré-existentes para acesso total sem limites
UPDATE public.school_licenses
SET plan = 'ilimitado', extra_students_packs = 0, extra_teachers = 0;

-- Colunas em license_keys
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'essencial',
  ADD COLUMN IF NOT EXISTS extra_students_packs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_teachers integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.license_keys
    ADD CONSTRAINT license_keys_plan_check
    CHECK (plan IN ('crm', 'essencial', 'profissional', 'avancado', 'ilimitado'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.license_keys
    ADD CONSTRAINT license_keys_addons_check
    CHECK (extra_students_packs >= 0 AND extra_teachers >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Colunas em school_renewal_keys
ALTER TABLE public.school_renewal_keys
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'essencial',
  ADD COLUMN IF NOT EXISTS extra_students_packs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_teachers integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.school_renewal_keys
    ADD CONSTRAINT school_renewal_keys_plan_check
    CHECK (plan IN ('crm', 'essencial', 'profissional', 'avancado', 'ilimitado'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.school_renewal_keys
    ADD CONSTRAINT school_renewal_keys_addons_check
    CHECK (extra_students_packs >= 0 AND extra_teachers >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Funções auxiliares para cálculo de limites e contagens
CREATE OR REPLACE FUNCTION public.get_school_plan_limits(
  p_school uuid,
  OUT o_plan text,
  OUT o_base_students integer,
  OUT o_extra_students_packs integer,
  OUT o_max_students integer,
  OUT o_base_teachers integer,
  OUT o_extra_teachers integer,
  OUT o_max_teachers integer,
  OUT o_is_crm_only boolean,
  OUT o_base_price numeric,
  OUT o_total_monthly numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lic public.school_licenses%rowtype;
BEGIN
  SELECT * INTO v_lic FROM public.school_licenses WHERE school_id = p_school;
  IF NOT FOUND THEN
    o_plan := 'essencial';
    v_lic.extra_students_packs := 0;
    v_lic.extra_teachers := 0;
  ELSE
    o_plan := COALESCE(v_lic.plan, 'essencial');
  END IF;

  o_extra_students_packs := COALESCE(v_lic.extra_students_packs, 0);
  o_extra_teachers := COALESCE(v_lic.extra_teachers, 0);

  IF o_plan = 'crm' THEN
    o_base_students := 0;
    o_max_students := 0;
    o_base_teachers := 0;
    o_max_teachers := 0;
    o_is_crm_only := true;
    o_base_price := 69.00;
    o_total_monthly := 69.00;
  ELSIF o_plan = 'essencial' THEN
    o_base_students := 30;
    o_max_students := 30 + (o_extra_students_packs * 10);
    o_base_teachers := 3;
    o_max_teachers := 3 + o_extra_teachers;
    o_is_crm_only := false;
    o_base_price := 129.00;
    o_total_monthly := 129.00 + (o_extra_students_packs * 15.00) + (o_extra_teachers * 10.00);
  ELSIF o_plan = 'profissional' THEN
    o_base_students := 50;
    o_max_students := 50 + (o_extra_students_packs * 10);
    o_base_teachers := 5;
    o_max_teachers := 5 + o_extra_teachers;
    o_is_crm_only := false;
    o_base_price := 179.00;
    o_total_monthly := 179.00 + (o_extra_students_packs * 15.00) + (o_extra_teachers * 10.00);
  ELSIF o_plan = 'avancado' THEN
    o_base_students := 100;
    o_max_students := 100 + (o_extra_students_packs * 10);
    o_base_teachers := 10;
    o_max_teachers := 10 + o_extra_teachers;
    o_is_crm_only := false;
    o_base_price := 279.00;
    o_total_monthly := 279.00 + (o_extra_students_packs * 15.00) + (o_extra_teachers * 10.00);
  ELSE -- 'ilimitado'
    o_base_students := 999999;
    o_max_students := 999999;
    o_base_teachers := 999999;
    o_max_teachers := 999999;
    o_is_crm_only := false;
    o_base_price := 0.00;
    o_total_monthly := 0.00;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_active_school_students(p_school uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT s.id)::integer
  FROM public.students s
  LEFT JOIN public.contracts c ON c.student_id = s.id AND c.status = 'signed'
    AND (c.terms->>'end_date' IS NULL OR (c.terms->>'end_date')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  WHERE s.school_id = p_school
    AND (c.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.contracts c2 WHERE c2.student_id = s.id));
$$;

CREATE OR REPLACE FUNCTION public.count_active_school_teachers(p_school uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer
  FROM public.teachers
  WHERE school_id = p_school AND active IS NOT FALSE;
$$;

-- RPC para obter status detalhado de licença e consumo
CREATE OR REPLACE FUNCTION public.get_school_license_limits(p_school uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lic public.school_licenses%rowtype;
  v_limits record;
  v_active_students integer;
  v_active_teachers integer;
  v_plan_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta.';
  END IF;

  IF NOT (public.is_school_admin(p_school) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para consultar os limites desta escola.';
  END IF;

  SELECT * INTO v_lic FROM public.school_licenses WHERE school_id = p_school;
  SELECT * INTO v_limits FROM public.get_school_plan_limits(p_school);
  v_active_students := public.count_active_school_students(p_school);
  v_active_teachers := public.count_active_school_teachers(p_school);

  v_plan_name := CASE v_limits.o_plan
    WHEN 'crm' THEN 'CRM (Somente CRM)'
    WHEN 'essencial' THEN 'Essencial'
    WHEN 'profissional' THEN 'Profissional'
    WHEN 'avancado' THEN 'Avançado'
    ELSE 'Ilimitado'
  END;

  RETURN jsonb_build_object(
    'school_id', p_school,
    'plan', v_limits.o_plan,
    'plan_name', v_plan_name,
    'kind', COALESCE(v_lic.kind, 'paga'),
    'expires_on', v_lic.expires_on,
    'suspended_at', v_lic.suspended_at,
    'is_crm_only', v_limits.o_is_crm_only,
    'base_students', v_limits.o_base_students,
    'extra_students_packs', v_limits.o_extra_students_packs,
    'max_students', v_limits.o_max_students,
    'active_students', v_active_students,
    'base_teachers', v_limits.o_base_teachers,
    'extra_teachers', v_limits.o_extra_teachers,
    'max_teachers', v_limits.o_max_teachers,
    'active_teachers', v_active_teachers,
    'base_price', v_limits.o_base_price,
    'total_monthly', v_limits.o_total_monthly
  );
END;
$$;

-- 3. Triggers de verificação e bloqueio no banco de dados

-- Bloqueio de ferramentas de gestão para escolas no plano CRM
CREATE OR REPLACE FUNCTION public.enforce_plan_tools_restriction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school uuid;
  v_plan text;
BEGIN
  v_school := CASE WHEN TG_OP = 'DELETE' THEN OLD.school_id ELSE NEW.school_id END;

  SELECT plan INTO v_plan FROM public.school_licenses WHERE school_id = v_school;
  IF v_plan = 'crm' THEN
    RAISE EXCEPTION 'O plano CRM inclui apenas a gestão de CRM e leads. Faça upgrade para um plano de gestão (Essencial, Profissional ou Avançado) para utilizar esta ferramenta.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Aplicar o trigger de restrição de ferramentas CRM em tabelas exclusivas de gestão escolar
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['students','contracts','teachers','packages','contract_types'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_plan_tools_restriction ON public.%I', tab);
    EXECUTE format('CREATE TRIGGER enforce_plan_tools_restriction BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_tools_restriction()', tab);
  END LOOP;
END $$;

-- Trigger para limite de professores ativos
CREATE OR REPLACE FUNCTION public.enforce_teacher_plan_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limits record;
  v_active_count integer;
BEGIN
  -- Se estiver desativando o professor, sempre permite
  IF TG_OP = 'UPDATE' AND (NEW.active IS FALSE OR NEW.active = OLD.active) THEN
    RETURN NEW;
  END IF;

  IF NEW.active IS NOT FALSE THEN
    SELECT * INTO v_limits FROM public.get_school_plan_limits(NEW.school_id);

    IF v_limits.o_is_crm_only THEN
      RAISE EXCEPTION 'O plano CRM não permite cadastrar professores. Faça upgrade para um plano de gestão.';
    END IF;

    IF v_limits.o_plan <> 'ilimitado' THEN
      SELECT count(*) INTO v_active_count
      FROM public.teachers
      WHERE school_id = NEW.school_id
        AND active IS NOT FALSE
        AND (TG_OP = 'INSERT' OR id <> OLD.id);

      IF v_active_count >= v_limits.o_max_teachers THEN
        RAISE EXCEPTION 'Limite de professores ativos atingido (% de % permitidos no plano %s). Contrate +1 professor ativo por R$ 10/mês ou faça upgrade.',
          v_active_count, v_limits.o_max_teachers, upper(v_limits.o_plan);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_teacher_plan_limits ON public.teachers;
CREATE TRIGGER enforce_teacher_plan_limits
  BEFORE INSERT OR UPDATE OF active ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_plan_limits();

-- Trigger para limite de alunos ativos
CREATE OR REPLACE FUNCTION public.enforce_student_plan_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limits record;
  v_active_count integer;
BEGIN
  SELECT * INTO v_limits FROM public.get_school_plan_limits(NEW.school_id);

  IF v_limits.o_is_crm_only THEN
    RAISE EXCEPTION 'O plano CRM não permite cadastro de alunos. Faça upgrade para um plano de gestão.';
  END IF;

  IF v_limits.o_plan <> 'ilimitado' THEN
    v_active_count := public.count_active_school_students(NEW.school_id);

    IF v_active_count >= v_limits.o_max_students THEN
      RAISE EXCEPTION 'Limite de alunos ativos atingido (% de % permitidos no plano %s). Contrate pacotes de +10 alunos por R$ 15/mês ou faça upgrade.',
        v_active_count, v_limits.o_max_students, upper(v_limits.o_plan);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_student_plan_limits ON public.students;
CREATE TRIGGER enforce_student_plan_limits
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_student_plan_limits();

-- 4. Atualização das RPCs de geração e resgate de chaves de licença

-- Emissão de chave de licença para nova escola com plano e adicionais
CREATE OR REPLACE FUNCTION public.issue_license_key(
  p_recipient_name text,
  p_recipient_email text,
  p_school_name text,
  p_kind text,
  p_validity_mode text,
  p_validity_days integer DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_plan text DEFAULT 'essencial',
  p_extra_students_packs integer DEFAULT 0,
  p_extra_teachers integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  secret text;
  code text;
  k uuid;
  local_today date;
  v_plan text := COALESCE(lower(btrim(p_plan)), 'essencial');
  v_packs integer := GREATEST(0, COALESCE(p_extra_students_packs, 0));
  v_profs integer := GREATEST(0, COALESCE(p_extra_teachers, 0));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma';
  END IF;

  local_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF length(btrim(coalesce(p_recipient_name,''))) NOT BETWEEN 2 AND 120 OR
     length(btrim(coalesce(p_school_name,''))) NOT BETWEEN 2 AND 120 OR
     p_recipient_email IS NULL OR p_recipient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
     p_kind NOT IN ('paga','cortesia') OR p_validity_mode NOT IN ('days','date','unlimited') OR
     v_plan NOT IN ('crm', 'essencial', 'profissional', 'avancado', 'ilimitado') THEN
    RAISE EXCEPTION 'Dados da licença inválidos';
  END IF;

  IF (p_validity_mode='days' AND (p_validity_days IS NULL OR p_validity_days NOT BETWEEN 1 AND 3650 OR p_expires_on IS NOT NULL)) OR
     (p_validity_mode='date' AND (p_expires_on IS NULL OR p_expires_on<local_today OR p_validity_days IS NOT NULL)) OR
     (p_validity_mode='unlimited' AND (p_validity_days IS NOT NULL OR p_expires_on IS NOT NULL)) THEN
    RAISE EXCEPTION 'Informe um prazo em dias, uma data exata ou acesso sem vencimento';
  END IF;

  secret := upper(replace(gen_random_uuid()::text, '-', ''));
  code := format('CAMP-%s-%s-%s-%s', substr(secret,1,8), substr(secret,9,8), substr(secret,17,8), substr(secret,25,8));

  INSERT INTO public.license_keys(
    code_hash, code_suffix, recipient_name, recipient_email, school_name,
    kind, validity_mode, validity_days, expires_on, created_by,
    plan, extra_students_packs, extra_teachers
  ) VALUES (
    encode(sha256(convert_to(code, 'utf8')),'hex'), right(code,4),
    btrim(p_recipient_name), lower(btrim(p_recipient_email)), btrim(p_school_name),
    p_kind, p_validity_mode, p_validity_days, p_expires_on, auth.uid(),
    v_plan, v_packs, v_profs
  ) RETURNING id INTO k;

  INSERT INTO public.license_events(key_id, action, actor_id, detail)
  VALUES (
    k, 'chave_criada', auth.uid(),
    jsonb_build_object(
      'destinatario', lower(btrim(p_recipient_email)),
      'plano', v_plan,
      'adicionais_alunos_packs', v_packs,
      'adicionais_professores', v_profs
    )
  );

  RETURN jsonb_build_object('id', k, 'key', code, 'plan', v_plan);
END;
$$;

-- Ativação de escola vinculando o plano e os adicionais definidos na chave
CREATE OR REPLACE FUNCTION public.activate_school_license(p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.license_keys%rowtype;
  sid uuid;
  verified_email text;
  expiration date;
  local_today date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login antes de ativar';
  END IF;

  SELECT lower(email) INTO verified_email
  FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Confirme seu e-mail antes de ativar a chave';
  END IF;

  IF p_key IS NULL OR p_key !~* '^CAMP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$' THEN
    RAISE EXCEPTION 'Código de ativação inválido';
  END IF;

  SELECT * INTO k FROM public.license_keys
  WHERE code_hash = encode(sha256(convert_to(upper(btrim(p_key)),'utf8')),'hex') FOR UPDATE;

  IF NOT FOUND OR k.revoked_at IS NOT NULL OR k.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Chave inexistente, revogada ou já utilizada';
  END IF;

  IF k.recipient_email <> verified_email THEN
    RAISE EXCEPTION 'Esta chave foi emitida para outro e-mail';
  END IF;

  local_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  expiration := CASE k.validity_mode
    WHEN 'days' THEN local_today + k.validity_days - 1
    WHEN 'date' THEN k.expires_on
    ELSE NULL
  END;

  IF expiration IS NOT NULL AND expiration < local_today THEN
    RAISE EXCEPTION 'Esta chave já venceu';
  END IF;

  INSERT INTO public.schools(name, created_by, admin_user_id)
  VALUES (k.school_name, auth.uid(), auth.uid())
  RETURNING id INTO sid;

  INSERT INTO public.school_licenses(
    school_id, kind, expires_on, issued_by, updated_by, note,
    plan, extra_students_packs, extra_teachers
  ) VALUES (
    sid, k.kind, expiration, k.created_by, auth.uid(), 'Ativada com chave',
    COALESCE(k.plan, 'essencial'), COALESCE(k.extra_students_packs, 0), COALESCE(k.extra_teachers, 0)
  );

  INSERT INTO public.school_members(school_id, user_id, role)
  VALUES (sid, auth.uid(), 'admin');

  INSERT INTO public.school_settings(school_id, owner_name)
  VALUES (sid, '');

  UPDATE public.license_keys
  SET redeemed_by = auth.uid(), redeemed_school_id = sid, redeemed_at = now()
  WHERE id = k.id;

  INSERT INTO public.license_events(school_id, key_id, action, actor_id, detail)
  VALUES (
    sid, k.id, 'ativacao', auth.uid(),
    jsonb_build_object(
      'termino', expiration,
      'tipo', k.kind,
      'plano', COALESCE(k.plan, 'essencial'),
      'adicionais_alunos_packs', COALESCE(k.extra_students_packs, 0),
      'adicionais_professores', COALESCE(k.extra_teachers, 0)
    )
  );

  RETURN sid;
END;
$$;

-- Emissão de chave de renovação com suporte a novo plano e adicionais
CREATE OR REPLACE FUNCTION public.issue_school_renewal_key(
  p_school uuid,
  p_kind text,
  p_validity_mode text,
  p_validity_days integer DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_extra_students_packs integer DEFAULT NULL,
  p_extra_teachers integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  secret text;
  code text;
  k uuid;
  recipient text;
  school_name text;
  local_today date;
  v_cur_lic public.school_licenses%rowtype;
  v_plan text;
  v_packs integer;
  v_profs integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso exclusivo do administrador geral';
  END IF;

  SELECT s.name, lower(u.email) INTO school_name, recipient
  FROM public.schools s
  JOIN auth.users u ON u.id = s.admin_user_id
  WHERE s.id = p_school AND s.deletion_requested_at IS NULL;

  IF recipient IS NULL THEN
    RAISE EXCEPTION 'Escola sem administrador válido ou agendada para exclusão';
  END IF;

  SELECT * INTO v_cur_lic FROM public.school_licenses WHERE school_id = p_school;

  v_plan := COALESCE(lower(btrim(p_plan)), v_cur_lic.plan, 'essencial');
  v_packs := GREATEST(0, COALESCE(p_extra_students_packs, v_cur_lic.extra_students_packs, 0));
  v_profs := GREATEST(0, COALESCE(p_extra_teachers, v_cur_lic.extra_teachers, 0));

  local_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF p_kind NOT IN ('paga','cortesia') OR p_validity_mode NOT IN ('days','date','unlimited') OR
     v_plan NOT IN ('crm', 'essencial', 'profissional', 'avancado', 'ilimitado') OR
     (p_validity_mode='days' AND (p_validity_days IS NULL OR p_validity_days NOT BETWEEN 1 AND 3650 OR p_expires_on IS NOT NULL)) OR
     (p_validity_mode='date' AND (p_expires_on IS NULL OR p_expires_on<local_today OR p_validity_days IS NOT NULL)) OR
     (p_validity_mode='unlimited' AND (p_validity_days IS NOT NULL OR p_expires_on IS NOT NULL)) THEN
    RAISE EXCEPTION 'Tipo ou validade inválida';
  END IF;

  secret := upper(replace(gen_random_uuid()::text, '-', ''));
  code := format('CAMP-%s-%s-%s-%s', substr(secret,1,8), substr(secret,9,8), substr(secret,17,8), substr(secret,25,8));

  INSERT INTO public.school_renewal_keys(
    school_id, code_hash, code_suffix, recipient_email, kind,
    validity_mode, validity_days, expires_on, created_by,
    plan, extra_students_packs, extra_teachers
  ) VALUES (
    p_school, encode(sha256(convert_to(code, 'utf8')),'hex'), right(code,4),
    recipient, p_kind, p_validity_mode, p_validity_days, p_expires_on, auth.uid(),
    v_plan, v_packs, v_profs
  ) RETURNING id INTO k;

  INSERT INTO public.license_events(school_id, action, actor_id, detail)
  VALUES (
    p_school, 'chave_renovacao_criada', auth.uid(),
    jsonb_build_object(
      'email', recipient,
      'terminacao', right(code,4),
      'plano', v_plan,
      'adicionais_alunos_packs', v_packs,
      'adicionais_professores', v_profs
    )
  );

  RETURN jsonb_build_object('id', k, 'key', code, 'school_name', school_name, 'recipient_email', recipient, 'plan', v_plan);
END;
$$;

-- Resgate de chave de renovação atualizando plano e adicionais
CREATE OR REPLACE FUNCTION public.redeem_school_renewal_key(p_school uuid, p_key text)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.school_renewal_keys%rowtype;
  local_today date;
  expiration date;
  verified_email text;
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Você não administra esta escola';
  END IF;

  IF EXISTS(SELECT 1 FROM public.schools WHERE id = p_school AND deletion_requested_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Restaure a escola antes de aplicar uma chave';
  END IF;

  SELECT lower(email) INTO verified_email
  FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;

  IF verified_email IS NULL THEN
    RAISE EXCEPTION 'Confirme seu e-mail';
  END IF;

  IF p_key IS NULL OR p_key !~* '^CAMP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$' THEN
    RAISE EXCEPTION 'Código inválido';
  END IF;

  SELECT * INTO k FROM public.school_renewal_keys
  WHERE school_id = p_school AND code_hash = encode(sha256(convert_to(upper(btrim(p_key)),'utf8')),'hex') FOR UPDATE;

  IF NOT FOUND OR k.revoked_at IS NOT NULL OR k.redeemed_at IS NOT NULL OR k.recipient_email <> verified_email THEN
    RAISE EXCEPTION 'Chave não encontrada, revogada, utilizada ou vinculada a outro administrador';
  END IF;

  local_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  expiration := CASE k.validity_mode
    WHEN 'days' THEN local_today + k.validity_days - 1
    WHEN 'date' THEN k.expires_on
    ELSE NULL
  END;

  IF expiration IS NOT NULL AND expiration < local_today THEN
    RAISE EXCEPTION 'Esta chave já venceu';
  END IF;

  UPDATE public.school_licenses
  SET kind = k.kind,
      expires_on = expiration,
      suspended_at = NULL,
      plan = COALESCE(k.plan, plan, 'essencial'),
      extra_students_packs = COALESCE(k.extra_students_packs, extra_students_packs, 0),
      extra_teachers = COALESCE(k.extra_teachers, extra_teachers, 0),
      updated_by = auth.uid(),
      updated_at = now(),
      note = 'Renovada com chave individual'
  WHERE school_id = p_school;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Licença desta escola não encontrada';
  END IF;

  UPDATE public.school_renewal_keys
  SET redeemed_at = now(), redeemed_by = auth.uid()
  WHERE id = k.id;

  INSERT INTO public.license_events(school_id, action, actor_id, detail)
  VALUES (
    p_school, 'chave_renovacao_utilizada', auth.uid(),
    jsonb_build_object(
      'validade', expiration,
      'tipo', k.kind,
      'plano', COALESCE(k.plan, 'essencial'),
      'adicionais_alunos_packs', COALESCE(k.extra_students_packs, 0),
      'adicionais_professores', COALESCE(k.extra_teachers, 0)
    )
  );

  RETURN expiration;
END;
$$;

-- Gerenciamento direto da licença da escola pelo Administrador da Plataforma
-- Suporta alteração direta de plano, quantidade de adicionais e extensão de prazo
CREATE OR REPLACE FUNCTION public.manage_school_license(
  p_school uuid,
  p_action text,
  p_days integer DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_extra_students_packs integer DEFAULT NULL,
  p_extra_teachers integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.school_licenses%rowtype;
  local_today date;
  base_date date;
  v_plan text;
  v_packs integer;
  v_profs integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma';
  END IF;

  SELECT * INTO l FROM public.school_licenses WHERE school_id = p_school FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Licença da escola não encontrada';
  END IF;

  local_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_plan := CASE
    WHEN p_plan IS NOT NULL AND lower(btrim(p_plan)) IN ('crm','essencial','profissional','avancado','ilimitado')
    THEN lower(btrim(p_plan))
    ELSE l.plan
  END;

  v_packs := CASE
    WHEN p_extra_students_packs IS NOT NULL AND p_extra_students_packs >= 0
    THEN p_extra_students_packs
    ELSE l.extra_students_packs
  END;

  v_profs := CASE
    WHEN p_extra_teachers IS NOT NULL AND p_extra_teachers >= 0
    THEN p_extra_teachers
    ELSE l.extra_teachers
  END;

  IF p_action = 'extend' THEN
    IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 3650 THEN
      RAISE EXCEPTION 'Informe de 1 a 3650 dias';
    END IF;
    base_date := greatest(local_today - 1, coalesce(l.expires_on, local_today - 1));
    UPDATE public.school_licenses
    SET expires_on = base_date + p_days,
        plan = v_plan,
        extra_students_packs = v_packs,
        extra_teachers = v_profs,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action = 'set_date' THEN
    IF p_expires_on IS NULL OR p_expires_on < local_today THEN
      RAISE EXCEPTION 'Informe uma data de vencimento igual ou posterior a hoje';
    END IF;
    UPDATE public.school_licenses
    SET expires_on = p_expires_on,
        plan = v_plan,
        extra_students_packs = v_packs,
        extra_teachers = v_profs,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action = 'unlimited' THEN
    UPDATE public.school_licenses
    SET expires_on = NULL,
        kind = 'cortesia',
        plan = v_plan,
        extra_students_packs = v_packs,
        extra_teachers = v_profs,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action = 'mark_paid' THEN
    UPDATE public.school_licenses
    SET kind = 'paga',
        plan = v_plan,
        extra_students_packs = v_packs,
        extra_teachers = v_profs,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action = 'mark_courtesy' THEN
    UPDATE public.school_licenses
    SET kind = 'cortesia',
        plan = v_plan,
        extra_students_packs = v_packs,
        extra_teachers = v_profs,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action = 'suspend' THEN
    UPDATE public.school_licenses
    SET suspended_at = now(),
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action = 'resume' THEN
    UPDATE public.school_licenses
    SET suspended_at = NULL,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSIF p_action IN ('set_plan', 'set_addons', 'set_plan_and_addons') THEN
    UPDATE public.school_licenses
    SET plan = v_plan,
        extra_students_packs = v_packs,
        extra_teachers = v_profs,
        updated_by = auth.uid(),
        updated_at = now(),
        note = coalesce(p_note, note)
    WHERE school_id = p_school;

  ELSE
    RAISE EXCEPTION 'Ação de licença desconhecida';
  END IF;

  INSERT INTO public.license_events(school_id, action, actor_id, detail)
  VALUES (
    p_school, p_action, auth.uid(),
    jsonb_build_object(
      'dias', p_days,
      'data', p_expires_on,
      'observacao', p_note,
      'plano', v_plan,
      'adicionais_alunos_packs', v_packs,
      'adicionais_professores', v_profs
    )
  );
END;
$$;

-- 5. Conceder permissões de execução
GRANT EXECUTE ON FUNCTION public.get_school_plan_limits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_active_school_students(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_active_school_teachers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_license_limits(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_license_key(text,text,text,text,text,integer,date,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_license_key(text,text,text,text,text,integer,date,text,integer,integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.issue_school_renewal_key(uuid,text,text,integer,date,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_school_renewal_key(uuid,text,text,integer,date,text,integer,integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.manage_school_license(uuid,text,integer,date,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_school_license(uuid,text,integer,date,text,text,integer,integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

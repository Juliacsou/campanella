-- ==============================================================================
-- CAMPANELLA V7.6 - Modalidade Dupla (2 alunos no mesmo contrato e agenda)
-- e flexibilização total de campos no modelo de contrato (definidos pela escola)
-- ==============================================================================

BEGIN;

-- 1. Adicionar colunas de suporte a Dupla na tabela contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS student2_id uuid REFERENCES public.students(id) ON DELETE RESTRICT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS signer_student_index smallint DEFAULT 1 CHECK (signer_student_index IN (1, 2));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_contracts_student2_id_school'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT fk_contracts_student2_id_school
      FOREIGN KEY (school_id, student2_id) REFERENCES public.students(school_id, id);
  END IF;
END $$;

-- 2. Atualizar trigger calendar_student_teacher_on_contract para vincular ambos os alunos da dupla
CREATE OR REPLACE FUNCTION public.calendar_student_teacher_on_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  chosen_teacher uuid;
  current_teacher uuid;
  current_teacher2 uuid;
  prior_signed boolean;
  slots_arr uuid[];
BEGIN
 IF (NEW.student_id IS NULL AND NEW.student2_id IS NULL)
  OR NEW.status NOT IN ('signed','pre_enrolled','ready_manual')
  OR NEW.terms->>'teacher_id' IS NULL THEN RETURN NEW; END IF;

 IF TG_OP='UPDATE' THEN
  IF OLD.student_id IS NOT DISTINCT FROM NEW.student_id
     AND OLD.student2_id IS NOT DISTINCT FROM NEW.student2_id
     AND OLD.status=NEW.status THEN
   RETURN NEW;
  END IF;
 END IF;

 chosen_teacher:=(NEW.terms->>'teacher_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.teachers t WHERE t.school_id=NEW.school_id AND t.id=chosen_teacher) THEN
  RAISE EXCEPTION 'Professor do contrato nao pertence a escola'; END IF;

 IF NEW.terms->'calendar_v6' IS NOT NULL THEN
   slots_arr := ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(
      coalesce(NEW.terms->'calendar_v6'->'slot_ids','[]'::jsonb)) AS x(value));
 END IF;

 -- Aluno 1
 IF NEW.student_id IS NOT NULL THEN
   SELECT s.calendar_teacher_id INTO current_teacher FROM public.students s
    WHERE s.id=NEW.student_id AND s.school_id=NEW.school_id FOR UPDATE;
   IF FOUND THEN
     SELECT EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=NEW.school_id
      AND (c.student_id=NEW.student_id OR c.student2_id=NEW.student_id)
      AND c.id<>NEW.id AND c.status='signed'
      AND c.terms->'calendar_v6' IS NOT NULL) INTO prior_signed;
     IF current_teacher IS DISTINCT FROM chosen_teacher AND prior_signed THEN
      RAISE EXCEPTION 'O aluno 1 desta matricula usa outro professor. Transfira o aluno no calendario primeiro'; END IF;
     IF NEW.terms->'calendar_v6' IS NOT NULL AND (TG_OP='INSERT' OR OLD.student_id IS DISTINCT FROM NEW.student_id OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='signed')) THEN
       UPDATE public.students SET calendar_teacher_id=chosen_teacher, calendar_slot_ids=slots_arr
       WHERE id=NEW.student_id AND school_id=NEW.school_id;
     ELSE
       UPDATE public.students SET calendar_teacher_id=chosen_teacher
       WHERE id=NEW.student_id AND school_id=NEW.school_id;
     END IF;
   END IF;
 END IF;

 -- Aluno 2 (Dupla)
 IF NEW.student2_id IS NOT NULL THEN
   SELECT s.calendar_teacher_id INTO current_teacher2 FROM public.students s
    WHERE s.id=NEW.student2_id AND s.school_id=NEW.school_id FOR UPDATE;
   IF FOUND THEN
     SELECT EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=NEW.school_id
      AND (c.student_id=NEW.student2_id OR c.student2_id=NEW.student2_id)
      AND c.id<>NEW.id AND c.status='signed'
      AND c.terms->'calendar_v6' IS NOT NULL) INTO prior_signed;
     IF current_teacher2 IS DISTINCT FROM chosen_teacher AND prior_signed THEN
      RAISE EXCEPTION 'O aluno 2 desta matricula usa outro professor. Transfira o aluno no calendario primeiro'; END IF;
     IF NEW.terms->'calendar_v6' IS NOT NULL AND (TG_OP='INSERT' OR OLD.student2_id IS DISTINCT FROM NEW.student2_id OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='signed')) THEN
       UPDATE public.students SET calendar_teacher_id=chosen_teacher, calendar_slot_ids=slots_arr
       WHERE id=NEW.student2_id AND school_id=NEW.school_id;
     ELSE
       UPDATE public.students SET calendar_teacher_id=chosen_teacher
       WHERE id=NEW.student2_id AND school_id=NEW.school_id;
     END IF;
   END IF;
 END IF;

 RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS calendar_student_teacher_contract_v63 ON public.contracts;
CREATE TRIGGER calendar_student_teacher_contract_v63
  AFTER INSERT OR UPDATE OF student_id, student2_id, status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.calendar_student_teacher_on_contract();

-- 3. Atualizar calendar_overview para exibir os dois alunos no caso de duplas
CREATE OR REPLACE FUNCTION public.calendar_overview(p_school uuid, p_from date, p_to date, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE own_teacher uuid; isadmin boolean; outcome jsonb;
BEGIN
 isadmin:=public.is_school_admin(p_school);
 IF NOT public.has_active_school_license(p_school) OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to>p_from+550 THEN
  RAISE EXCEPTION 'Periodo ou licenca invalida'; END IF;
 IF NOT isadmin THEN
  SELECT teacher_id INTO own_teacher FROM public.calendar_teacher_users
    WHERE user_id=auth.uid() AND school_id=p_school;
  IF own_teacher IS NULL OR (p_teacher IS NOT NULL AND p_teacher<>own_teacher)
    OR NOT EXISTS(SELECT 1 FROM public.teachers WHERE id=own_teacher AND active) THEN
    RAISE EXCEPTION 'Sem acesso a esta escola'; END IF;
 END IF;
 SELECT jsonb_build_object(
  'teachers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'active',t.active) ORDER BY t.name)
    FROM public.teachers t WHERE t.school_id=p_school AND (isadmin OR t.id=own_teacher)),'[]'::jsonb),
  'slots',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'teacher_id',s.teacher_id,'weekday',s.weekday,
    'slot_date',s.slot_date,'time',to_char(s.start_time,'HH24:MI'),'duration',s.duration_minutes,'active',s.active)
    ORDER BY s.start_time) FROM public.calendar_slots s WHERE s.school_id=p_school
    AND (isadmin OR s.teacher_id=own_teacher) AND (p_teacher IS NULL OR s.teacher_id=p_teacher)
    AND s.active AND (s.slot_date IS NULL OR s.slot_date BETWEEN p_from AND p_to)),'[]'::jsonb),
  'blocks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'teacher_id',b.teacher_id,
    'from',b.start_date,'to',b.end_date,'start_time',b.start_time,'end_time',b.end_time,'reason',b.reason)
    ORDER BY b.start_date) FROM public.calendar_blocks b WHERE b.school_id=p_school AND
    (isadmin OR b.teacher_id IS NULL OR b.teacher_id=own_teacher) AND
    (p_teacher IS NULL OR b.teacher_id IS NULL OR b.teacher_id=p_teacher) AND
    b.cancelled_at IS NULL AND b.end_date>=p_from AND b.start_date<=p_to),'[]'::jsonb),
  'interviews',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id,'lead_id',a.lead_id,'teacher_id',a.teacher_id,
    'student_name',coalesce(ld.name,'Interessado'),
    'phone',ld.phone,'service',ld.crm_service,
    'date',(a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date,
    'time',to_char(a.scheduled_at AT TIME ZONE 'America/Sao_Paulo','HH24:MI'),
    'duration',coalesce(a.duration_minutes,30),
    'state',a.state,'note',a.note,'scheduled_at',a.scheduled_at)
    ORDER BY a.scheduled_at)
    FROM public.crm_appointments a JOIN public.leads ld ON ld.id=a.lead_id
    WHERE a.school_id=p_school AND a.teacher_id IS NOT NULL
     AND (isadmin OR a.teacher_id=own_teacher)
     AND (p_teacher IS NULL OR a.teacher_id=p_teacher)
     AND a.state IN ('scheduled','completed')
     AND (a.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to),'[]'::jsonb),
  'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'teacher_id',l.teacher_id,'contract_id',l.contract_id,
    'lesson_number',l.lesson_number,
    'date',CASE WHEN l.status='reserved' AND l.reservation_expires_at<=now() THEN NULL ELSE l.scheduled_date END,
    'time',CASE WHEN l.status='reserved' AND l.reservation_expires_at<=now() THEN NULL ELSE l.start_time END,
    'original_date',l.original_date,'original_time',l.original_time,'duration',l.duration_minutes,
    'status',CASE WHEN l.status='reserved' AND l.reservation_expires_at<=now() THEN 'needs_reschedule' ELSE l.status END,
    'student_name',CASE
      WHEN c.kind='dupla' AND st.id IS NOT NULL AND st2.id IS NOT NULL THEN st.full_name || ' & ' || st2.full_name
      WHEN c.kind='dupla' AND (c.student_snapshot->'student2'->>'full_name') IS NOT NULL THEN coalesce(st.full_name, c.student_snapshot->'student1'->>'full_name', c.student_snapshot->>'full_name', 'Aluno 1') || ' & ' || (c.student_snapshot->'student2'->>'full_name')
      ELSE coalesce(st.full_name,c.student_snapshot->>'full_name',ld.name,'Aluno')
    END,
    'student_id',st.id,'student2_id',st2.id,'kind',c.kind,'course',c.terms->>'course','total',c.terms->>'lessons_count',
    'reserved_until',l.reservation_expires_at) ORDER BY l.scheduled_date,l.start_time)
    FROM public.calendar_lessons l JOIN public.contracts c ON c.id=l.contract_id
    LEFT JOIN public.students st ON st.id=c.student_id
    LEFT JOIN public.students st2 ON st2.id=c.student2_id
    LEFT JOIN public.leads ld ON ld.id=c.lead_id
    WHERE l.school_id=p_school AND (isadmin OR l.teacher_id=own_teacher)
     AND (p_teacher IS NULL OR l.teacher_id=p_teacher) AND
     ((l.scheduled_date BETWEEN p_from AND p_to) OR l.status='needs_reschedule' OR
      (l.status='reserved' AND l.reservation_expires_at<=now()))
     ),'[]'::jsonb),
  'students',coalesce((SELECT jsonb_agg(jsonb_build_object('contract_id',c.id,'student_id',st.id,'student2_id',st2.id,'teacher_id',coalesce(st.calendar_teacher_id,st2.calendar_teacher_id,(c.terms->>'teacher_id')::uuid),
     'name',CASE
       WHEN c.kind='dupla' AND st.id IS NOT NULL AND st2.id IS NOT NULL THEN st.full_name || ' & ' || st2.full_name
       WHEN c.kind='dupla' AND (c.student_snapshot->'student2'->>'full_name') IS NOT NULL THEN coalesce(st.full_name, c.student_snapshot->'student1'->>'full_name', c.student_snapshot->>'full_name', 'Aluno 1') || ' & ' || (c.student_snapshot->'student2'->>'full_name')
       ELSE coalesce(st.full_name,c.student_snapshot->>'full_name',ld.name,'Aluno')
     END,
     'kind',c.kind,
     'course',c.terms->>'course','total',c.terms->>'lessons_count',
     'status',c.status,'contract_end',c.terms->>'end_date',
     'contact_phone',CASE WHEN st.is_minor THEN coalesce(st.guardian_phone,st.phone,ld.phone) ELSE coalesce(st.phone,ld.phone) END,
     'contact_email',CASE WHEN st.is_minor THEN coalesce(st.guardian_email,st.email) ELSE st.email END,
     'done',(SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id=c.id AND l.status IN ('completed','absent_consumed')) + coalesce((SELECT a.completed_before_v6 FROM public.calendar_legacy_adoptions a WHERE a.contract_id=c.id),0),
     'legacy_completed',coalesce((SELECT a.completed_before_v6 FROM public.calendar_legacy_adoptions a WHERE a.contract_id=c.id),0),
     'completed',(SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id=c.id AND l.status='completed')
         + coalesce((SELECT a.completed_before_v6 FROM public.calendar_legacy_adoptions a WHERE a.contract_id=c.id),0),
     'consumed_absences',(SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id=c.id AND l.status='absent_consumed'),
     'scheduled',(SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id=c.id AND l.status IN ('scheduled','reserved')
       AND (l.status <> 'reserved' OR l.reservation_expires_at>now())),
     'pending',(SELECT count(*) FROM public.calendar_lessons l WHERE l.contract_id=c.id AND
       (l.status='needs_reschedule' OR (l.status='reserved' AND l.reservation_expires_at<=now())))))
     FROM public.contracts c
     LEFT JOIN public.students st ON st.id=c.student_id
     LEFT JOIN public.students st2 ON st2.id=c.student2_id
     LEFT JOIN public.leads ld ON ld.id=c.lead_id
     WHERE c.school_id=p_school AND (c.terms->'calendar_v6' IS NOT NULL OR EXISTS(SELECT 1 FROM public.calendar_legacy_adoptions a WHERE a.contract_id=c.id))
      AND c.status IN ('signed','pre_enrolled','ready_manual')
      AND (isadmin OR coalesce(st.calendar_teacher_id::text,st2.calendar_teacher_id::text,c.terms->>'teacher_id')=own_teacher::text)
      AND (p_teacher IS NULL OR coalesce(st.calendar_teacher_id::text,st2.calendar_teacher_id::text,c.terms->>'teacher_id')=p_teacher::text)),'[]'::jsonb),
  'adopted_ids',CASE WHEN isadmin THEN coalesce((SELECT jsonb_agg(a.contract_id) FROM public.calendar_legacy_adoptions a WHERE a.school_id=p_school),'[]'::jsonb) ELSE '[]'::jsonb END,
  'teacher_access',CASE WHEN isadmin THEN coalesce((SELECT jsonb_agg(jsonb_build_object('teacher_id',tu.teacher_id,'user_id',tu.user_id)) FROM public.calendar_teacher_users tu WHERE tu.school_id=p_school),'[]'::jsonb) ELSE '[]'::jsonb END,
  'my_teacher_id',own_teacher,'admin',isadmin
 ) INTO outcome;
 RETURN outcome;
END;
$function$;

-- 4. Atualizar calendar_student_profile para exibir contratos em dupla para ambos os alunos
CREATE OR REPLACE FUNCTION public.calendar_student_profile(p_school uuid, p_student uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE admin_ok boolean; own_teacher uuid; result jsonb;
BEGIN
 admin_ok:=public.is_school_admin(p_school);
 IF NOT public.has_active_school_license(p_school) THEN RAISE EXCEPTION 'Licenca indisponivel'; END IF;
 IF NOT admin_ok THEN
  SELECT tu.teacher_id INTO own_teacher FROM public.calendar_teacher_users tu
   JOIN public.teachers t ON t.id=tu.teacher_id AND t.active
   WHERE tu.school_id=p_school AND tu.user_id=auth.uid();
  IF own_teacher IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.students s
   WHERE s.school_id=p_school AND s.id=p_student AND s.calendar_teacher_id=own_teacher
  ) THEN RAISE EXCEPTION 'Aluno nao vinculado a sua agenda'; END IF;
 END IF;
 SELECT jsonb_build_object(
  'id',s.id,'name',s.full_name,'teacher_id',s.calendar_teacher_id,
  'slot_ids',to_jsonb(s.calendar_slot_ids),
  'current_slots',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'weekday',x.weekday,'time',to_char(x.start_time,'HH24:MI'),
      'duration',x.duration_minutes) ORDER BY x.weekday,x.start_time) FROM public.calendar_slots x
      WHERE x.id=ANY(s.calendar_slot_ids) AND x.school_id=p_school AND x.active),'[]'::jsonb),
  'phone',CASE WHEN s.is_minor THEN coalesce(s.guardian_phone,s.phone) ELSE s.phone END,
  'email',CASE WHEN s.is_minor THEN coalesce(s.guardian_email,s.email) ELSE s.email END,
  'contracts',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'kind',c.kind,'teacher_id',(c.terms->>'teacher_id')::uuid,
   'teacher_name',(SELECT t.name FROM public.teachers t WHERE t.id=(c.terms->>'teacher_id')::uuid AND t.school_id=p_school),
   'partner_id',CASE WHEN c.student_id=s.id THEN c.student2_id ELSE c.student_id END,
   'partner_name',(SELECT stp.full_name FROM public.students stp WHERE stp.id = CASE WHEN c.student_id=s.id THEN c.student2_id ELSE c.student_id END),
   'course',c.terms->>'course','package',c.terms->>'package_name',
   'status',c.status,'total',c.terms->>'lessons_count',
   'start',c.terms->>'start_date','contract_end',c.terms->>'end_date',
   'slots',coalesce((SELECT jsonb_agg(jsonb_build_object('id',sl.id,'weekday',sl.weekday,'time',to_char(sl.start_time,'HH24:MI'),
        'duration',sl.duration_minutes) ORDER BY sl.weekday,sl.start_time)
        FROM public.calendar_slots sl WHERE sl.id IN
        (SELECT lnk.slot_id FROM public.calendar_lessons lnk WHERE lnk.contract_id=c.id AND lnk.slot_id IS NOT NULL)
        AND sl.slot_date IS NULL),'[]'::jsonb),
   'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',l.id,'number',l.lesson_number,'teacher_id',l.teacher_id,
    'teacher_name',(SELECT t.name FROM public.teachers t WHERE t.id=l.teacher_id AND t.school_id=p_school),
    'date',CASE WHEN l.status='reserved' AND l.reservation_expires_at<now() THEN NULL ELSE l.scheduled_date END,
    'time',CASE WHEN l.status='reserved' AND l.reservation_expires_at<now() THEN NULL ELSE to_char(l.start_time,'HH24:MI') END,
    'original_date',l.original_date,'original_time',to_char(l.original_time,'HH24:MI'),
    'duration',l.duration_minutes,'slot_id',l.slot_id,'manual_override',l.manual_override,
    'status',CASE WHEN l.status='reserved' AND l.reservation_expires_at<now() THEN 'needs_reschedule' ELSE l.status END,
    'history',coalesce((SELECT jsonb_agg(jsonb_build_object('event',h.event,'old_date',h.old_date,'old_time',h.old_time,
      'new_date',h.new_date,'new_time',h.new_time,'note',h.note,'at',h.created_at) ORDER BY h.created_at)
      FROM public.calendar_lesson_history h WHERE h.lesson_id=l.id),'[]'::jsonb)
    ) ORDER BY l.lesson_number)
    FROM public.calendar_lessons l WHERE l.contract_id=c.id AND l.school_id=p_school),'[]'::jsonb)
  ) ORDER BY c.created_at DESC) FROM public.contracts c
   WHERE c.school_id=p_school AND (c.student_id=s.id OR c.student2_id=s.id) AND
   EXISTS(SELECT 1 FROM public.calendar_lessons y WHERE y.contract_id=c.id)),'[]'::jsonb)
 ) INTO result
 FROM public.students s WHERE s.id=p_student AND s.school_id=p_school;
 IF result IS NULL THEN RAISE EXCEPTION 'Aluno nao encontrado'; END IF;
 RETURN result;
END;
$function$;

-- 5. Função utilitária para encerrar contratos anteriores de alunos ao migrar para dupla
CREATE OR REPLACE FUNCTION public.close_prior_student_contracts(p_school uuid, p_student_ids uuid[], p_reason text DEFAULT 'Migrado para turma em dupla')
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar contratos';
  END IF;

  UPDATE public.contracts
  SET status = 'closed',
      closed_at = now(),
      closure_reason = p_reason,
      updated_at = now()
  WHERE school_id = p_school
    AND (student_id = ANY(p_student_ids) OR student2_id = ANY(p_student_ids))
    AND status IN ('signed', 'pre_enrolled', 'ready_manual', 'draft', 'sent');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- 6. RPC para cadastro e importação em massa exclusivo de Duplas
CREATE OR REPLACE FUNCTION public.onboarding_prepare_duo_enrollment(p_school uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  st1 public.students%ROWTYPE;
  st2 public.students%ROWTYPE;
  prof public.teachers%ROWTYPE;
  pkg public.packages%ROWTYPE;
  model public.contract_types%ROWTYPE;
  slot_list uuid[];
  nslots integer;
  nlessons integer;
  freq integer;
  pstart date;
  pend_date date;
  first_due date;
  total numeric(12,2);
  nparc integer;
  package_id uuid;
  model_id uuid;
  teacher_id uuid;
  student1_id uuid;
  student2_id uuid;
  projection jsonb;
  schedule jsonb;
  terms jsonb;
  snapshot jsonb;
  led uuid;
  inter uuid;
  contract_id uuid;
  school_name text;
  owner text;
  amount_text text;
  day_ids int[];
  first_hour time;
  payment text;
  is_preexisting boolean;
  is_recurrence boolean;
  model_html text;
  model_version text;
  contract_status text;
  audit_info jsonb;
  mode_text text;
  signer_idx smallint;
  close_prior boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_school_admin(p_school) OR NOT public.has_active_school_license(p_school) THEN
   RAISE EXCEPTION 'Apenas a administracao pode importar matriculas em dupla'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Dados da matricula em dupla invalidos';END IF;

  student1_id:=(p_data->>'aluno_1_id')::uuid;
  student2_id:=(p_data->>'aluno_2_id')::uuid;
  teacher_id:=(p_data->>'professor_id')::uuid;
  package_id:=(p_data->>'pacote_id')::uuid;
  model_id:=nullif(p_data->>'modelo_id','')::uuid;

  IF student1_id IS NULL OR student2_id IS NULL THEN
    RAISE EXCEPTION 'Informe os IDs de ambos os alunos da dupla';
  END IF;
  IF student1_id = student2_id THEN
    RAISE EXCEPTION 'Uma dupla exige dois alunos diferentes';
  END IF;

  signer_idx := coalesce((p_data->>'quem_assina')::smallint, 1);
  IF signer_idx NOT IN (1, 2) THEN signer_idx := 1; END IF;

  close_prior := coalesce((p_data->>'encerrar_anteriores')::boolean,
                 coalesce((p_data->>'encerrar_anteriores') IN ('sim','true','1'), false));

  is_preexisting:=coalesce((p_data->>'contrato_preexistente')::boolean,false) OR model_id IS NULL;
  is_recurrence:=coalesce((p_data->>'modo'),'')='recorrencia' OR (p_data->>'data_termino') IS NOT NULL;

  -- Localizar e bloquear alunos
  SELECT * INTO st1 FROM public.students WHERE school_id=p_school AND id=student1_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno 1 nao identificado nesta escola';END IF;

  SELECT * INTO st2 FROM public.students WHERE school_id=p_school AND id=student2_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno 2 nao identificado nesta escola';END IF;

  -- Validar professor e pacote
  SELECT * INTO prof FROM public.teachers WHERE school_id=p_school AND id=teacher_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professor inexistente ou inativo nesta escola';END IF;

  SELECT * INTO pkg FROM public.packages WHERE school_id=p_school AND id=package_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote inexistente ou inativo nesta escola';END IF;

  -- Se solicitado fechar anteriores, encerra contratos ativos existentes
  IF close_prior THEN
    PERFORM public.close_prior_student_contracts(p_school, ARRAY[student1_id, student2_id], 'Migrado para turma em dupla');
  ELSE
    IF EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=p_school AND (c.student_id=student1_id OR c.student2_id=student1_id) AND c.status NOT IN ('void','closed','superseded')) THEN
      RAISE EXCEPTION 'Aluno 1 (%) ja possui contrato ativo. Habilite encerrar_anteriores para migrar para dupla.', st1.full_name;
    END IF;
    IF EXISTS(SELECT 1 FROM public.contracts c WHERE c.school_id=p_school AND (c.student_id=student2_id OR c.student2_id=student2_id) AND c.status NOT IN ('void','closed','superseded')) THEN
      RAISE EXCEPTION 'Aluno 2 (%) ja possui contrato ativo. Habilite encerrar_anteriores para migrar para dupla.', st2.full_name;
    END IF;
  END IF;

  IF is_preexisting THEN
   model_id:=NULL;
   model_html:='<div class="preexisting-contract-doc"><h2>Contrato Preexistente · Dupla</h2><p>Matrícula em dupla cadastrada no Campanella com base em contrato físico ou externo preexistente firmado diretamente com a escola.</p></div>';
   model_version:='preexisting';
   contract_status:='signed';
   audit_info:=jsonb_build_object('method','preexisting_enrollment_duo','signature','physical_prior','imported_by',auth.uid());
  ELSE
   SELECT * INTO model FROM public.contract_types WHERE school_id=p_school AND id=model_id AND active;
   IF NOT FOUND OR model.template_html IS NULL OR btrim(model.template_html)='' THEN
    RAISE EXCEPTION 'Selecione um modelo DOCX de dupla ativo e validado'; END IF;
   IF model.kind <> 'dupla' THEN
    RAISE EXCEPTION 'O modelo selecionado precisa ser da modalidade dupla'; END IF;
   model_html:=model.template_html;
   model_version:='custom-'||model.id::text||'-'||model.updated_at::text;
   contract_status:='pre_enrolled';
   audit_info:=jsonb_build_object('method','onboarding_duo_csv','signature','pending','imported_by',auth.uid());
  END IF;

  -- Validar horários
  IF jsonb_typeof(p_data->'horarios_ids')<>'array' THEN
   RAISE EXCEPTION 'Selecione IDs reais dos horarios do professor';END IF;

  SELECT coalesce(array_agg(e.value::uuid),'{}'::uuid[]) INTO slot_list
    FROM jsonb_array_elements_text(p_data->'horarios_ids') AS e(value);

  nslots:=cardinality(slot_list);
  freq:=pkg.weekly_frequency;
  IF nslots<>freq OR (SELECT count(DISTINCT v) FROM unnest(slot_list) v)<>freq THEN
   RAISE EXCEPTION 'O pacote exige % horario(s) semanal(is) diferente(s)',freq;END IF;

  IF (SELECT count(*) FROM public.calendar_slots sl WHERE sl.school_id=p_school
    AND sl.teacher_id=teacher_id AND sl.id=ANY(slot_list) AND sl.active AND sl.slot_date IS NULL)<>freq THEN
   RAISE EXCEPTION 'Horario do CSV nao corresponde a grade ativa do professor';END IF;

  SELECT array_agg(sl.weekday ORDER BY sl.weekday,sl.start_time),
         min(sl.start_time) INTO day_ids,first_hour
  FROM public.calendar_slots sl WHERE sl.id=ANY(slot_list) AND sl.school_id=p_school;

  SELECT coalesce(jsonb_agg(jsonb_build_object('day',sl.weekday,'time',to_char(sl.start_time,'HH24:MI'),
     'duration_minutes',sl.duration_minutes,'slot_id',sl.id) ORDER BY sl.weekday,sl.start_time),'[]'::jsonb)
  INTO schedule FROM public.calendar_slots sl WHERE sl.id=ANY(slot_list) AND sl.school_id=p_school;

  pstart:=(p_data->>'data_inicio')::date;
  IF pstart IS NULL OR pstart<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
   RAISE EXCEPTION 'Data inicial deve ser hoje ou futura'; END IF;

  nparc:=coalesce((p_data->>'parcelas')::integer,1);
  total:=coalesce((p_data->>'valor_total')::numeric,pkg.default_total);
  first_due:=coalesce(nullif(p_data->>'primeiro_vencimento','')::date,pstart);
  payment:=coalesce(nullif(btrim(p_data->>'forma_pagamento'),''),'A combinar');
  IF nparc NOT BETWEEN 1 AND 48 OR total<0 OR first_due IS NULL THEN RAISE EXCEPTION 'Valores ou parcelas invalidos';END IF;
  amount_text:=coalesce(nullif(btrim(p_data->>'valor_total_extenso'),''),'Conforme valor indicado numericamente');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_school::text,101));
  PERFORM pg_advisory_xact_lock(hashtextextended(teacher_id::text,0));
  PERFORM public.calendar_expire_reservations(teacher_id);

  IF EXISTS(SELECT 1 FROM public.calendar_lessons l
     JOIN public.calendar_slots chosen ON chosen.id=ANY(slot_list) AND chosen.school_id=p_school
       AND chosen.teacher_id=teacher_id AND chosen.weekday=EXTRACT(DOW FROM l.scheduled_date)
       AND l.start_time < (chosen.start_time + chosen.duration_minutes*interval '1 minute')::time
       AND (l.start_time + l.duration_minutes*interval '1 minute')::time > chosen.start_time
     WHERE l.school_id=p_school AND l.teacher_id=teacher_id
       AND l.scheduled_date>=pstart AND l.status IN ('scheduled','reserved')
       AND (l.status<>'reserved' OR l.reservation_expires_at>now())) THEN
   RAISE EXCEPTION 'Horario escolhido ja possui aula ou se sobrepoe na grade. Escolha horario livre'; END IF;

  IF is_recurrence THEN
   pend_date:=(p_data->>'data_termino')::date;
   IF pend_date IS NULL OR pend_date<pstart THEN
    RAISE EXCEPTION 'Data de termino invalida para matricula por recorrencia';
   END IF;
   projection:=public.calendar_preview(p_school,teacher_id,pstart,NULL,slot_list,pend_date,'recurrence');
   nlessons:=(projection->>'total')::integer;
   mode_text:='recurrence';
  ELSE
   nlessons:=pkg.lessons_count;
   projection:=public.calendar_preview(p_school,teacher_id,pstart,nlessons,slot_list,NULL,'package');
   mode_text:='package';
  END IF;

  IF projection->>'end_date' IS NULL THEN RAISE EXCEPTION 'Nao foi possivel calcular as aulas';END IF;

  SELECT name INTO school_name FROM public.schools WHERE id=p_school;
  SELECT owner_name INTO owner FROM public.school_settings WHERE school_id=p_school LIMIT 1;

  terms:=jsonb_build_object(
    'package_id',pkg.id,'package_name',pkg.name,
    'course',coalesce(nullif(btrim(p_data->>'curso'),''),'Ingles'),
    'teacher_id',teacher_id,'teacher_name',prof.name,
    'lessons_count',nlessons,'weekly_frequency',freq,
    'lesson_schedule',schedule,'weekly_days',to_jsonb(day_ids),
    'lesson_time',to_char(first_hour,'HH24:MI'),
    'start_date',pstart,'end_date',(projection->>'end_date')::date,
    'total_amount',total,'total_extenso',amount_text,
    'installments',nparc,'installment_amount',round(total/nparc,2),
    'first_installment_amount',total-round(total/nparc,2)*(nparc-1),
    'first_due_date',first_due,'payment_method',payment,
    'enrollment_mode',mode_text,
    'is_preexisting_contract',is_preexisting,
    'calendar_v6',jsonb_build_object('slot_ids',to_jsonb(slot_list),'calculated_end',projection->>'end_date'),
    'school_name',school_name,'custom_fields','{}'::jsonb,
    'custom_field_schema',coalesce(model.fields,'[]'::jsonb),
    'template_storage_path',model.template_storage_path,
    'signer_student_index',signer_idx,
    'source','onboarding_duo_csv');

  snapshot:=jsonb_build_object(
    'student1', to_jsonb(st1),
    'student2', to_jsonb(st2),
    'signer_student_index', signer_idx,
    'full_name', st1.full_name || ' & ' || st2.full_name
  );

  led:=st1.lead_id;
  IF led IS NULL THEN
   INSERT INTO public.leads(school_id,name,guardian_name,phone,status)
     VALUES(p_school,st1.full_name || ' & ' || st2.full_name, st1.guardian_name, st1.phone, 'convertido') RETURNING id INTO led;
   UPDATE public.students SET lead_id=led WHERE id=student1_id AND school_id=p_school;
  END IF;

  SELECT id INTO inter FROM public.interviews WHERE school_id=p_school AND lead_id=led;
  IF inter IS NULL THEN
   INSERT INTO public.interviews(school_id,lead_id,package_id,interviewer_id,teacher_id,course,lessons_count,
    weekly_frequency,calendar_slot_ids,weekly_days,lesson_time,lesson_schedule,start_date,end_date,
    total_amount,total_extenso,installments,installment_amount,first_installment_amount,first_due_date,payment_method)
   VALUES(p_school,led,pkg.id,auth.uid(),teacher_id,terms->>'course',nlessons,freq,slot_list,day_ids,
    first_hour,schedule,pstart,(projection->>'end_date')::date,total,amount_text,nparc,
    round(total/nparc,2),total-round(total/nparc,2)*(nparc-1),first_due,payment)
   RETURNING id INTO inter;
  END IF;

  INSERT INTO public.contracts(
     school_id, lead_id, student_id, student2_id, interview_id,
     kind, status, terms, contract_type_id,
     template_html, template_version, owner_name, student_snapshot,
     created_by, audit, signer_student_index
  )
  VALUES(
     p_school, led, student1_id, student2_id, inter,
     'dupla', contract_status, terms, model_id,
     model_html, model_version, owner, snapshot,
     auth.uid(), audit_info, signer_idx
  )
  RETURNING id INTO contract_id;

  IF NOT EXISTS(SELECT 1 FROM public.calendar_lessons l WHERE l.contract_id=contract_id AND l.school_id=p_school) THEN
   RAISE EXCEPTION 'A agenda da dupla nao foi gerada pelo calendário.';
  END IF;

  RETURN jsonb_build_object(
    'contrato_id', contract_id,
    'aluno_1_id', student1_id,
    'aluno_2_id', student2_id,
    'aulas', nlessons,
    'primeira_aula', projection->'lessons'->0->>'date',
    'ultima_aula', projection->>'end_date',
    'estado', contract_status
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_prior_student_contracts(uuid, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.onboarding_prepare_duo_enrollment(uuid, jsonb) TO authenticated, service_role;

COMMIT;

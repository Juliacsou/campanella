-- CAMPANELLA V3 - MULTI-ESCOLAS, MIGRACAO INCREMENTAL
-- EXECUTAR SOMENTE apos 06_upgrade_contracts_schedule_v2_1.sql.
-- Backup completo obrigatorio antes de executar em producao.
-- Preserva os registros existentes e vincula-os a "Escola principal".
BEGIN;

CREATE TABLE IF NOT EXISTS public.schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 120),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.school_members (
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('admin','operador')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(school_id,user_id)
);
CREATE INDEX IF NOT EXISTS school_members_user_idx ON public.school_members(user_id,school_id);
GRANT SELECT ON public.schools TO authenticated;
REVOKE UPDATE ON public.schools FROM authenticated;
GRANT UPDATE (name) ON public.schools TO authenticated;
GRANT SELECT ON public.school_members TO authenticated;
GRANT ALL ON public.schools,public.school_members TO service_role;
DROP TRIGGER IF EXISTS schools_updated ON public.schools;
CREATE TRIGGER schools_updated BEFORE UPDATE ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_at();

-- Escolhe uma escola inicial apenas para migrar o banco legado, sem apagar dados.
DO $$
DECLARE initial_school uuid; tab text;
BEGIN
 SELECT id INTO initial_school FROM public.schools ORDER BY created_at,id LIMIT 1;
 IF initial_school IS NULL THEN
  INSERT INTO public.schools(name) VALUES ('Escola principal') RETURNING id INTO initial_school;
 END IF;
 INSERT INTO public.school_members(school_id,user_id,role)
 SELECT initial_school,id,'admin' FROM public.profiles WHERE role='admin'
 ON CONFLICT(school_id,user_id) DO NOTHING;
 FOREACH tab IN ARRAY ARRAY[
  'leads','packages','interviews','students','contracts','teachers',
  'school_settings','contract_types','teacher_access_codes','interview_invites',
  'crm_followups','crm_appointments','crm_activities'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id)',tab);
  EXECUTE format('UPDATE public.%I SET school_id = %L WHERE school_id IS NULL',tab,initial_school);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN school_id SET NOT NULL',tab);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(school_id)',tab||'_school_idx',tab);
 END LOOP;
END $$;

-- A antiga configuracao global tinha PK boolean (true): agora e uma por escola.
ALTER TABLE public.school_settings DROP CONSTRAINT IF EXISTS school_settings_pkey;
ALTER TABLE public.school_settings ADD CONSTRAINT school_settings_pkey PRIMARY KEY(school_id);
-- Integridade composta: nenhuma ficha, contrato, convite ou atividade pode
-- apontar para um cadastro de outra escola, mesmo com service_role.
DO $$
DECLARE tab text; refspec text[]; item text[]; constraint_name text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['leads','packages','interviews','students','contracts','teachers','contract_types'] LOOP
  constraint_name := tab||'_school_id_id_key';
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('public.%I',tab)::regclass AND conname=constraint_name) THEN
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (school_id,id)',tab,constraint_name);
  END IF;
 END LOOP;
 FOREACH item SLICE 1 IN ARRAY ARRAY[
  ARRAY['interviews','lead_id','leads'], ARRAY['interviews','package_id','packages'], ARRAY['interviews','teacher_id','teachers'],
  ARRAY['students','lead_id','leads'],
  ARRAY['contracts','lead_id','leads'], ARRAY['contracts','student_id','students'], ARRAY['contracts','interview_id','interviews'],
  ARRAY['contracts','contract_type_id','contract_types'], ARRAY['contracts','previous_contract_id','contracts'],
  ARRAY['packages','contract_type_id','contract_types'],
  ARRAY['interview_invites','lead_id','leads'], ARRAY['interview_invites','teacher_id','teachers'],
  ARRAY['teacher_access_codes','teacher_id','teachers'],
  ARRAY['crm_followups','lead_id','leads'], ARRAY['crm_appointments','lead_id','leads'], ARRAY['crm_appointments','teacher_id','teachers'],
  ARRAY['crm_activities','lead_id','leads']
 ] LOOP
  constraint_name := 'fk_'||item[1]||'_'||item[2]||'_school';
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('public.%I',item[1])::regclass AND conname=constraint_name) THEN
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(school_id,%I) REFERENCES public.%I(school_id,id)',
    item[1],constraint_name,item[2],item[3]);
  END IF;
 END LOOP;
END $$;

-- Referencias de importacao do CRM devem ser unicas POR escola.
DROP INDEX IF EXISTS public.leads_crm_origin_ref_unique;
CREATE UNIQUE INDEX IF NOT EXISTS leads_crm_origin_ref_school_unique
 ON public.leads(school_id,crm_origin_ref) WHERE crm_origin_ref IS NOT NULL;

-- Um registro nao pode ser movido de escola por alteracao de coluna.
CREATE OR REPLACE FUNCTION public.prevent_school_transfer() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF OLD.school_id IS DISTINCT FROM NEW.school_id THEN
  RAISE EXCEPTION 'Nao e permitido transferir registros entre escolas';
 END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY[
  'leads','packages','interviews','students','contracts','teachers','school_settings',
  'contract_types','teacher_access_codes','interview_invites','crm_followups','crm_appointments','crm_activities'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS prevent_school_transfer ON public.%I',tab);
  EXECUTE format('CREATE TRIGGER prevent_school_transfer BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_school_transfer()',tab);
 END LOOP;
END $$;

-- SECURITY DEFINER serve apenas para consultar vinculos (sem recursao de RLS).
CREATE OR REPLACE FUNCTION public.is_school_member(p_school uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_members m
               WHERE m.school_id=p_school AND m.user_id=(SELECT auth.uid()));
$$;
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_members m
               WHERE m.school_id=p_school AND m.user_id=(SELECT auth.uid()) AND m.role='admin');
$$;
REVOKE ALL ON FUNCTION public.is_school_member(uuid),public.is_school_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_school_member(uuid),public.is_school_admin(uuid) TO authenticated;
-- Compatibilidade: funcoes sem parametro nao concedem acesso a dados de outras escolas.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_members WHERE user_id=(SELECT auth.uid()) AND role='admin');
$$;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_members WHERE user_id=(SELECT auth.uid()));
$$;

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY schools_member_read ON public.schools FOR SELECT TO authenticated
 USING(public.is_school_member(id));
CREATE POLICY schools_admin_update ON public.schools FOR UPDATE TO authenticated
 USING(public.is_school_admin(id)) WITH CHECK(public.is_school_admin(id));
CREATE POLICY school_members_read ON public.school_members FOR SELECT TO authenticated
 USING(public.is_school_member(school_id));

-- Remove explicitamente TODAS as politicas antigas, pois um OR com uma
-- policy global anularia o isolamento multi-escolas.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT schemaname,tablename,policyname FROM pg_policies
 WHERE schemaname='public' AND tablename=ANY(ARRAY[
  'profiles','leads','packages','interviews','students','contracts','teachers',
  'school_settings','contract_types','teacher_access_codes','interview_invites',
  'crm_followups','crm_appointments','crm_activities'
 ]) LOOP
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',item.policyname,item.schemaname,item.tablename);
 END LOOP;
END $$;

CREATE POLICY profiles_school_select ON public.profiles FOR SELECT TO authenticated
 USING(id=(SELECT auth.uid()) OR EXISTS (
  SELECT 1 FROM public.school_members own
  JOIN public.school_members colleague ON colleague.school_id=own.school_id
  WHERE own.user_id=(SELECT auth.uid()) AND colleague.user_id=profiles.id
 ));
-- Nao ha policy para atualizar 'profiles.role': autorizacoes sao por escola.

DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY[
  'leads','interviews','students','crm_followups','crm_appointments','crm_activities','interview_invites'
 ] LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_school_member(school_id))',tab||'_member_select',tab);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK(public.is_school_member(school_id))',tab||'_member_insert',tab);
  IF tab<>'crm_activities' THEN
   EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING(public.is_school_member(school_id)) WITH CHECK(public.is_school_member(school_id))',tab||'_member_update',tab);
  END IF;
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['packages','teachers','contract_types','school_settings'] LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_school_member(school_id))',tab||'_member_select',tab);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK(public.is_school_admin(school_id))',tab||'_admin_insert',tab);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING(public.is_school_admin(school_id)) WITH CHECK(public.is_school_admin(school_id))',tab||'_admin_update',tab);
 END LOOP;
END $$;
CREATE POLICY leads_admin_delete ON public.leads FOR DELETE TO authenticated USING(public.is_school_admin(school_id));
CREATE POLICY packages_admin_delete ON public.packages FOR DELETE TO authenticated USING(public.is_school_admin(school_id));
CREATE POLICY contract_types_admin_delete ON public.contract_types FOR DELETE TO authenticated USING(public.is_school_admin(school_id));
CREATE POLICY contracts_member_select ON public.contracts FOR SELECT TO authenticated USING(public.is_school_member(school_id));
CREATE POLICY contracts_member_insert ON public.contracts FOR INSERT TO authenticated
 WITH CHECK(public.is_school_member(school_id) AND status='draft');
CREATE POLICY contracts_member_update ON public.contracts FOR UPDATE TO authenticated
 USING(public.is_school_member(school_id) AND status IN ('draft','sent'))
 WITH CHECK(public.is_school_member(school_id) AND status IN ('draft','sent','void'));
-- Alunos, fichas e contratos assinados continuam sem DELETE via interface.

-- RPCs: criacao de escola e gestao de membros, transacionais e com checagem de admin.
CREATE OR REPLACE FUNCTION public.create_school(p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.school_members WHERE user_id=(SELECT auth.uid()) AND role='admin') THEN
  RAISE EXCEPTION 'Apenas administradores podem cadastrar escolas';
 END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120 THEN
  RAISE EXCEPTION 'Nome da escola deve ter entre 2 e 120 caracteres';
 END IF;
 INSERT INTO public.schools(name,created_by) VALUES (btrim(p_name),auth.uid()) RETURNING id INTO sid;
 INSERT INTO public.school_members(school_id,user_id,role) VALUES(sid,auth.uid(),'admin');
 INSERT INTO public.school_settings(school_id,owner_name) VALUES(sid,'');
 RETURN sid;
END; $$;
CREATE OR REPLACE FUNCTION public.manage_school_member(p_school uuid,p_email text,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid;
BEGIN
 IF NOT public.is_school_admin(p_school) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF p_role NOT IN ('admin','operador') THEN RAISE EXCEPTION 'Permissao invalida'; END IF;
 SELECT id INTO target FROM public.profiles WHERE lower(email)=lower(btrim(p_email)) LIMIT 1;
 IF target IS NULL THEN RAISE EXCEPTION 'Conta nao encontrada. Cadastre o usuario em Authentication primeiro'; END IF;
 IF EXISTS(SELECT 1 FROM public.school_members WHERE school_id=p_school AND user_id=target AND role='admin')
   AND p_role<>'admin' AND (SELECT count(*) FROM public.school_members WHERE school_id=p_school AND role='admin')<=1
 THEN RAISE EXCEPTION 'A escola precisa ter pelo menos um administrador'; END IF;
 INSERT INTO public.school_members(school_id,user_id,role) VALUES(p_school,target,p_role)
 ON CONFLICT(school_id,user_id) DO UPDATE SET role=excluded.role;
END; $$;
CREATE OR REPLACE FUNCTION public.remove_school_member(p_school uuid,p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_school_admin(p_school) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.schools WHERE id=p_school FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.school_members WHERE school_id=p_school AND user_id=p_user AND role='admin')
  AND (SELECT count(*) FROM public.school_members WHERE school_id=p_school AND role='admin')<=1
 THEN RAISE EXCEPTION 'A escola precisa ter pelo menos um administrador'; END IF;
 DELETE FROM public.school_members WHERE school_id=p_school AND user_id=p_user;
END; $$;
REVOKE ALL ON FUNCTION public.create_school(text),public.manage_school_member(uuid,text,text),public.remove_school_member(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_school(text),public.manage_school_member(uuid,text,text),public.remove_school_member(uuid,uuid)
 TO authenticated;

-- As RPCs antigas nao podem mais confiar no papel administrativo GLOBAL.
CREATE OR REPLACE FUNCTION public.set_teacher_access_code(p_teacher uuid,p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 SELECT school_id INTO sid FROM public.teachers WHERE id=p_teacher AND active=true;
 IF sid IS NULL OR NOT public.is_school_admin(sid) THEN RAISE EXCEPTION 'Professor indisponivel ou acesso negado'; END IF;
 IF length(p_code)<8 OR length(p_code)>60 THEN RAISE EXCEPTION 'Use codigo de 8 a 60 caracteres'; END IF;
 INSERT INTO public.teacher_access_codes(teacher_id,school_id,code_hash)
 VALUES(p_teacher,sid,extensions.crypt(p_code,extensions.gen_salt('bf')))
 ON CONFLICT(teacher_id) DO UPDATE SET code_hash=excluded.code_hash,updated_at=now();
END; $$;
CREATE OR REPLACE FUNCTION public.close_enrollment(p_contract_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 SELECT school_id INTO sid FROM public.contracts WHERE id=p_contract_id;
 IF sid IS NULL OR NOT public.is_school_member(sid) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 UPDATE public.contracts SET status='closed',closed_at=now(),closure_reason='manual'
 WHERE id=p_contract_id AND school_id=sid AND status='signed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Somente matriculas assinadas e abertas podem ser encerradas'; END IF;
END; $$;
-- O link publico conhece a escola pela linha do convite, e nao pelo cliente.
CREATE OR REPLACE FUNCTION public.verify_external_interview(p_hash text,p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.interview_invites%rowtype; good boolean;
BEGIN
 SELECT * INTO rec FROM public.interview_invites WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN null; END IF;
 IF rec.revoked_at IS NOT NULL OR rec.used_at IS NOT NULL OR rec.expires_at<=now() OR rec.failed_attempts>=5 THEN RETURN null; END IF;
 SELECT (tc.code_hash=extensions.crypt(coalesce(p_code,''),tc.code_hash)) INTO good
 FROM public.teacher_access_codes tc WHERE tc.teacher_id=rec.teacher_id AND tc.school_id=rec.school_id;
 IF coalesce(good,false)=false THEN
  UPDATE public.interview_invites SET failed_attempts=failed_attempts+1 WHERE id=rec.id;
  RETURN null;
 END IF;
 RETURN jsonb_build_object('invite_id',rec.id,'lead_id',rec.lead_id,'teacher_id',rec.teacher_id,'school_id',rec.school_id);
END; $$;
REVOKE ALL ON FUNCTION public.verify_external_interview(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_external_interview(text,text) TO service_role;

-- Assinatura publica continua transacional, agora criando o aluno na escola do contrato.
CREATE OR REPLACE FUNCTION public.finalize_enrollment(
 p_token_hash text,p_student jsonb,p_signature_png text,
 p_signed_name text,p_signed_html text,p_signed_hash text,p_audit jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contracts%rowtype; sid uuid; dob date; minor boolean;
BEGIN
 SELECT * INTO c FROM public.contracts
 WHERE token_hash=p_token_hash AND status='sent' AND token_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Link invalido, vencido ou ja utilizado'; END IF;
 IF c.kind='dupla' THEN RAISE EXCEPTION 'Assinatura de dupla nao habilitada'; END IF;
 dob:=(p_student->>'birth_date')::date;
 minor:=(dob+interval '18 years')::date>(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF (minor AND c.kind<>'menor') OR (NOT minor AND c.kind<>'individual') THEN
  RAISE EXCEPTION 'Modelo incompativel com a idade do aluno'; END IF;
 IF c.student_id IS NOT NULL THEN
  sid:=c.student_id;
  UPDATE public.students SET
   full_name=p_student->>'full_name',cpf=p_student->>'cpf',email=p_student->>'email',
   birth_date=dob,phone=p_student->>'phone',address=p_student->>'address',
   cep=p_student->>'cep',is_minor=minor,
   guardian_name=p_student->>'guardian_name',guardian_birth_date=nullif(p_student->>'guardian_birth_date','')::date,
   guardian_cpf=p_student->>'guardian_cpf',guardian_phone=p_student->>'guardian_phone',
   guardian_email=p_student->>'guardian_email',guardian_address=p_student->>'guardian_address',
   guardian_cep=p_student->>'guardian_cep' WHERE id=sid AND school_id=c.school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno nao pertence a esta escola'; END IF;
 ELSE
  INSERT INTO public.students(school_id,lead_id,full_name,cpf,email,birth_date,phone,address,cep,is_minor,
   guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep)
  VALUES(c.school_id,c.lead_id,p_student->>'full_name',p_student->>'cpf',p_student->>'email',dob,p_student->>'phone',
   p_student->>'address',p_student->>'cep',minor,
   p_student->>'guardian_name',nullif(p_student->>'guardian_birth_date','')::date,
   p_student->>'guardian_cpf',p_student->>'guardian_phone',p_student->>'guardian_email',
   p_student->>'guardian_address',p_student->>'guardian_cep')
  ON CONFLICT(lead_id) DO UPDATE SET full_name=excluded.full_name
  RETURNING id INTO sid;
 END IF;
 UPDATE public.contracts SET status='superseded'
 WHERE school_id=c.school_id AND student_id=sid AND id<>c.id AND status='signed';
 UPDATE public.contracts SET student_id=sid,status='signed',signed_at=now(),signed_name=p_signed_name,
  student_snapshot=p_student,signature_png=p_signature_png,signed_document_html=p_signed_html,
  signed_hash=p_signed_hash,audit=p_audit,token_hash=null,token_expires_at=null
 WHERE id=c.id AND school_id=c.school_id;
 IF c.previous_contract_id IS NOT NULL THEN
  UPDATE public.contracts SET status='superseded'
  WHERE id=c.previous_contract_id AND school_id=c.school_id AND status='signed';
 END IF;
 UPDATE public.leads SET status='convertido' WHERE id=c.lead_id AND school_id=c.school_id;
 RETURN c.id;
END; $$;
REVOKE ALL ON FUNCTION public.finalize_enrollment(text,jsonb,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_enrollment(text,jsonb,text,text,text,text,jsonb) TO service_role;

-- Mapeamento IMUTAVEL dos caminhos DOCX existentes antes da migracao.
-- Nao usar referencia editavel de contract_types como comprovacao de posse:
-- isso permitiria a outro admin cadastrar um path legado de outra escola.
CREATE TABLE IF NOT EXISTS public.legacy_contract_files (
 path text PRIMARY KEY,
 school_id uuid NOT NULL REFERENCES public.schools(id),
 captured_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_contract_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_contract_files FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.legacy_contract_files TO service_role;
INSERT INTO public.legacy_contract_files(path,school_id)
 SELECT DISTINCT template_storage_path,school_id FROM public.contract_types
 WHERE nullif(template_storage_path,'') IS NOT NULL AND template_storage_path NOT LIKE school_id::text||'/%'
 ON CONFLICT(path) DO NOTHING;
INSERT INTO public.legacy_contract_files(path,school_id)
 SELECT DISTINCT terms->>'template_storage_path',school_id FROM public.contracts
 WHERE nullif(terms->>'template_storage_path','') IS NOT NULL
   AND terms->>'template_storage_path' NOT LIKE school_id::text||'/%'
 ON CONFLICT(path) DO NOTHING;
CREATE OR REPLACE FUNCTION public.can_read_legacy_contract_file(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.legacy_contract_files l
               WHERE l.path=p_path AND public.is_school_member(l.school_id));
$$;
REVOKE ALL ON FUNCTION public.can_read_legacy_contract_file(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_legacy_contract_file(text) TO authenticated;

-- Bucket PRIVADO: novo caminho 'school_id/uuid.docx'. Os arquivos antigos
-- permanecem disponiveis apenas na escola registrada no mapeamento de migracao.
DROP POLICY IF EXISTS campanella_template_admin_select ON storage.objects;
DROP POLICY IF EXISTS campanella_template_admin_insert ON storage.objects;
DROP POLICY IF EXISTS campanella_template_admin_update ON storage.objects;
CREATE POLICY campanella_template_school_select ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='campanella-contratos' AND (
 EXISTS(SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%' AND public.is_school_member(s.id))
 OR public.can_read_legacy_contract_file(storage.objects.name)
));
CREATE POLICY campanella_template_school_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='campanella-contratos' AND EXISTS(
 SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%' AND public.is_school_admin(s.id)
));
CREATE POLICY campanella_template_school_update ON storage.objects FOR UPDATE TO authenticated
USING(bucket_id='campanella-contratos' AND EXISTS(
 SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%' AND public.is_school_admin(s.id)
)) WITH CHECK(bucket_id='campanella-contratos' AND EXISTS(
 SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%' AND public.is_school_admin(s.id)
));

-- Atualiza o cache de schema do PostgREST (novas tabelas e RPCs).
NOTIFY pgrst, 'reload schema';
COMMIT;

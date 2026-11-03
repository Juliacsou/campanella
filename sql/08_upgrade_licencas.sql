-- CAMPANELLA V4 - LICENCAS MANUAIS POR ESCOLA
-- Requer 07_upgrade_multi_escolas.sql aplicado. NAO executar 00-07 novamente.
-- Fazer backup e testar em ambiente de homologacao antes da producao.
BEGIN;

-- O painel master usa uma allowlist no SERVIDOR, nunca uma flag no navegador.
CREATE TABLE IF NOT EXISTS public.campanella_platform_admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campanella_platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campanella_platform_admins FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campanella_platform_admins TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.campanella_platform_admins WHERE user_id=(SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated,service_role;

-- Uma escola tem um unico administrador RESPONSAVEL. A relacao com a conta
-- continua sendo muitos-para-muitos: a mesma pessoa pode administrar N escolas.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS admin_user_id uuid REFERENCES public.profiles(id);
UPDATE public.schools s SET admin_user_id=COALESCE(
 (SELECT m.user_id FROM public.school_members m WHERE m.school_id=s.id AND m.role='admin'
  ORDER BY (m.user_id=s.created_by) DESC,m.created_at,m.user_id LIMIT 1),
 (SELECT m.user_id FROM public.school_members m WHERE m.school_id=s.id ORDER BY m.created_at,m.user_id LIMIT 1)
) WHERE s.admin_user_id IS NULL;
CREATE INDEX IF NOT EXISTS schools_admin_user_idx ON public.schools(admin_user_id);

-- O vinculo anterior continua existindo para evolucoes futuras, mas nao libera
-- acesso para operadores ou outros admins antigos que nao sejam o responsavel.
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.schools s WHERE s.id=p_school AND s.admin_user_id=(SELECT auth.uid()));
$$;
CREATE OR REPLACE FUNCTION public.is_school_member(p_school uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.is_school_admin(p_school);
$$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.schools WHERE admin_user_id=(SELECT auth.uid()));
$$;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.is_admin();
$$;

-- Nunca atribuir privilegios globais a emails codificados no trigger legado.
CREATE OR REPLACE FUNCTION public.on_auth_user_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.profiles(id,email,role)
 VALUES(new.id,coalesce(new.email,''),'pending')
 ON CONFLICT(id) DO UPDATE SET email=excluded.email;
 RETURN new;
END; $$;

CREATE TABLE IF NOT EXISTS public.school_licenses (
 school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('paga','cortesia')),
 activated_at timestamptz NOT NULL DEFAULT now(),
 expires_on date,
 suspended_at timestamptz,
 note text NOT NULL DEFAULT '',
 issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.license_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_hash text NOT NULL UNIQUE,
 code_suffix text NOT NULL,
 recipient_name text NOT NULL CHECK(length(btrim(recipient_name)) BETWEEN 2 AND 120),
 recipient_email text NOT NULL,
 school_name text NOT NULL CHECK(length(btrim(school_name)) BETWEEN 2 AND 120),
 kind text NOT NULL CHECK(kind IN ('paga','cortesia')),
 validity_mode text NOT NULL CHECK(validity_mode IN ('days','date','unlimited')),
 validity_days integer CHECK(validity_days BETWEEN 1 AND 3650),
 expires_on date,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 redeemed_by uuid REFERENCES auth.users(id),
 redeemed_at timestamptz,
 redeemed_school_id uuid UNIQUE REFERENCES public.schools(id),
 CONSTRAINT license_key_validity CHECK(
  (validity_mode='days' AND validity_days IS NOT NULL AND expires_on IS NULL) OR
  (validity_mode='date' AND validity_days IS NULL AND expires_on IS NOT NULL) OR
  (validity_mode='unlimited' AND validity_days IS NULL AND expires_on IS NULL)
 )
);
CREATE INDEX IF NOT EXISTS license_keys_recipient_idx ON public.license_keys(lower(recipient_email));
CREATE TABLE IF NOT EXISTS public.license_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
 key_id uuid REFERENCES public.license_keys(id) ON DELETE SET NULL,
 action text NOT NULL,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS license_events_school_idx ON public.license_events(school_id,created_at DESC);

-- Evita bloquear a escola principal depois da migracao. Os clientes legados
-- com escola existente recebem cortesia sem prazo ate a revisao manual.
INSERT INTO public.school_licenses(school_id,kind,note)
 SELECT s.id,'cortesia','Acesso legado preservado durante a migracao V4'
 FROM public.schools s ON CONFLICT(school_id) DO NOTHING;

ALTER TABLE public.school_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_licenses,public.license_keys,public.license_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_licenses,public.license_keys,public.license_events TO authenticated;
GRANT ALL ON public.school_licenses,public.license_keys,public.license_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.license_events_id_seq TO service_role;

CREATE POLICY school_licenses_read ON public.school_licenses FOR SELECT TO authenticated
 USING(public.is_school_admin(school_id) OR public.is_platform_admin());
CREATE POLICY license_keys_platform_read ON public.license_keys FOR SELECT TO authenticated
 USING(public.is_platform_admin());
CREATE POLICY license_events_platform_read ON public.license_events FOR SELECT TO authenticated
 USING(public.is_platform_admin());
CREATE POLICY schools_platform_read ON public.schools FOR SELECT TO authenticated
 USING(public.is_platform_admin());
CREATE POLICY profiles_platform_read ON public.profiles FOR SELECT TO authenticated
 USING(public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.has_active_school_license(p_school uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_licenses l WHERE l.school_id=p_school
   AND l.suspended_at IS NULL AND (l.expires_on IS NULL OR l.expires_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date));
$$;
REVOKE ALL ON FUNCTION public.has_active_school_license(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_active_school_license(uuid) TO authenticated,service_role;

-- Desliga as RPCs V3 que permitiam criacao livre de escolas e gerenciar membros.
REVOKE ALL ON FUNCTION public.create_school(text),public.manage_school_member(uuid,text,text),
 public.remove_school_member(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Somente o administrador PLATAFORMA cria chaves. O segredo aparece UMA vez:
-- no retorno da RPC; apenas seu SHA-256 e os 4 caracteres finais sao guardados.
CREATE OR REPLACE FUNCTION public.issue_license_key(
 p_recipient_name text,p_recipient_email text,p_school_name text,p_kind text,
 p_validity_mode text,p_validity_days integer DEFAULT NULL,p_expires_on date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE secret text; code text; k uuid; local_today date;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma'; END IF;
 local_today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF length(btrim(coalesce(p_recipient_name,''))) NOT BETWEEN 2 AND 120 OR
    length(btrim(coalesce(p_school_name,''))) NOT BETWEEN 2 AND 120 OR
    p_recipient_email IS NULL OR p_recipient_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
    p_kind NOT IN ('paga','cortesia') OR p_validity_mode NOT IN ('days','date','unlimited') THEN
   RAISE EXCEPTION 'Dados da licenca invalidos';
 END IF;
 IF (p_validity_mode='days' AND (p_validity_days IS NULL OR p_validity_days NOT BETWEEN 1 AND 3650 OR p_expires_on IS NOT NULL)) OR
    (p_validity_mode='date' AND (p_expires_on IS NULL OR p_expires_on<local_today OR p_validity_days IS NOT NULL)) OR
    (p_validity_mode='unlimited' AND (p_validity_days IS NOT NULL OR p_expires_on IS NOT NULL)) THEN
   RAISE EXCEPTION 'Informe um prazo em dias, uma data exata ou acesso sem vencimento';
 END IF;
 secret:=upper(encode(extensions.gen_random_bytes(16),'hex'));
 code:=format('CAMP-%s-%s-%s-%s',substr(secret,1,8),substr(secret,9,8),substr(secret,17,8),substr(secret,25,8));
 INSERT INTO public.license_keys(code_hash,code_suffix,recipient_name,recipient_email,school_name,
   kind,validity_mode,validity_days,expires_on,created_by)
 VALUES(encode(extensions.digest(code,'sha256'),'hex'),right(code,4),btrim(p_recipient_name),lower(btrim(p_recipient_email)),
  btrim(p_school_name),p_kind,p_validity_mode,p_validity_days,p_expires_on,auth.uid()) RETURNING id INTO k;
 INSERT INTO public.license_events(key_id,action,actor_id,detail)
 VALUES(k,'chave_criada',auth.uid(),jsonb_build_object('destinatario',lower(btrim(p_recipient_email))));
 RETURN jsonb_build_object('id',k,'key',code);
END; $$;

CREATE OR REPLACE FUNCTION public.activate_school_license(p_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.license_keys%rowtype; sid uuid; verified_email text; expiration date; local_today date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faca login antes de ativar'; END IF;
 SELECT lower(email) INTO verified_email FROM auth.users
 WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF verified_email IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail antes de ativar a chave'; END IF;
 IF p_key IS NULL OR p_key !~* '^CAMP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$' THEN
  RAISE EXCEPTION 'Codigo de ativacao invalido';
 END IF;
 SELECT * INTO k FROM public.license_keys
 WHERE code_hash=encode(extensions.digest(upper(btrim(p_key)),'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND OR k.revoked_at IS NOT NULL OR k.redeemed_at IS NOT NULL THEN
  RAISE EXCEPTION 'Chave inexistente, revogada ou ja utilizada';
 END IF;
 IF k.recipient_email<>verified_email THEN
  RAISE EXCEPTION 'Esta chave foi emitida para outro e-mail';
 END IF;
 local_today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 expiration:=CASE k.validity_mode WHEN 'days' THEN local_today+k.validity_days-1
              WHEN 'date' THEN k.expires_on ELSE NULL END;
 IF expiration IS NOT NULL AND expiration<local_today THEN RAISE EXCEPTION 'Esta chave ja venceu'; END IF;
 INSERT INTO public.schools(name,created_by,admin_user_id)
 VALUES(k.school_name,auth.uid(),auth.uid()) RETURNING id INTO sid;
 INSERT INTO public.school_licenses(school_id,kind,expires_on,issued_by,updated_by,note)
 VALUES(sid,k.kind,expiration,k.created_by,auth.uid(),'Ativada com chave');
 INSERT INTO public.school_members(school_id,user_id,role) VALUES(sid,auth.uid(),'admin');
 INSERT INTO public.school_settings(school_id,owner_name) VALUES(sid,'');
 UPDATE public.license_keys SET redeemed_by=auth.uid(),redeemed_school_id=sid,redeemed_at=now() WHERE id=k.id;
 INSERT INTO public.license_events(school_id,key_id,action,actor_id,detail)
 VALUES(sid,k.id,'ativacao',auth.uid(),jsonb_build_object('termino',expiration,'tipo',k.kind));
 RETURN sid;
END; $$;

CREATE OR REPLACE FUNCTION public.manage_school_license(
 p_school uuid,p_action text,p_days integer DEFAULT NULL,p_expires_on date DEFAULT NULL,p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.school_licenses%rowtype; local_today date; base_date date;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador da plataforma'; END IF;
 SELECT * INTO l FROM public.school_licenses WHERE school_id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Licenca da escola nao encontrada'; END IF;
 local_today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF p_action='extend' THEN
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'Informe de 1 a 3650 dias'; END IF;
  base_date:=greatest(local_today-1,coalesce(l.expires_on,local_today-1));
  UPDATE public.school_licenses SET expires_on=base_date+p_days,updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSIF p_action='set_date' THEN
  IF p_expires_on IS NULL OR p_expires_on<local_today THEN RAISE EXCEPTION 'Informe uma data de vencimento igual ou posterior a hoje'; END IF;
  UPDATE public.school_licenses SET expires_on=p_expires_on,updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSIF p_action='unlimited' THEN
  UPDATE public.school_licenses SET expires_on=NULL,kind='cortesia',updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSIF p_action='mark_paid' THEN
  UPDATE public.school_licenses SET kind='paga',updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSIF p_action='mark_courtesy' THEN
  UPDATE public.school_licenses SET kind='cortesia',updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSIF p_action='suspend' THEN
  UPDATE public.school_licenses SET suspended_at=now(),updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSIF p_action='resume' THEN
  UPDATE public.school_licenses SET suspended_at=NULL,updated_by=auth.uid(),updated_at=now(),note=coalesce(p_note,note) WHERE school_id=p_school;
 ELSE RAISE EXCEPTION 'Acao de licenca desconhecida'; END IF;
 INSERT INTO public.license_events(school_id,action,actor_id,detail)
 VALUES(p_school,p_action,auth.uid(),jsonb_build_object('dias',p_days,'data',p_expires_on,'observacao',p_note));
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_license_key(p_key_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
 UPDATE public.license_keys SET revoked_at=now() WHERE id=p_key_id AND redeemed_at IS NULL AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Chave ja usada, revogada ou inexistente'; END IF;
 INSERT INTO public.license_events(key_id,action,actor_id) VALUES(p_key_id,'chave_revogada',auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_school_admin(p_school uuid,p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target uuid; previous uuid;
BEGIN
 IF NOT(public.is_school_admin(p_school) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Sem permissao para transferir esta escola'; END IF;
 SELECT admin_user_id INTO previous FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escola nao encontrada'; END IF;
 SELECT u.id INTO target FROM auth.users u WHERE lower(u.email)=lower(btrim(p_email))
  AND u.email_confirmed_at IS NOT NULL LIMIT 1;
 IF target IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target) THEN
  RAISE EXCEPTION 'O novo administrador deve ter conta cadastrada e e-mail confirmado';
 END IF;
 IF target=previous THEN RAISE EXCEPTION 'Este usuario ja administra a escola'; END IF;
 UPDATE public.schools SET admin_user_id=target WHERE id=p_school;
 DELETE FROM public.school_members WHERE school_id=p_school AND user_id=previous;
 INSERT INTO public.school_members(school_id,user_id,role) VALUES(p_school,target,'admin')
 ON CONFLICT(school_id,user_id) DO UPDATE SET role='admin';
 INSERT INTO public.license_events(school_id,action,actor_id,detail)
 VALUES(p_school,'transferencia_admin',auth.uid(),jsonb_build_object('anterior',previous,'novo',target));
END; $$;

REVOKE ALL ON FUNCTION public.issue_license_key(text,text,text,text,text,integer,date),
 public.activate_school_license(text), public.manage_school_license(uuid,text,integer,date,text),
 public.revoke_license_key(uuid),public.transfer_school_admin(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_license_key(text,text,text,text,text,integer,date),
 public.activate_school_license(text), public.manage_school_license(uuid,text,integer,date,text),
 public.revoke_license_key(uuid),public.transfer_school_admin(uuid,text) TO authenticated;

-- O banco (nao apenas a interface) impede que administradores editem dados
-- quando a escola esta sem licenca. As policies antigas de escrita sao trocadas.
DO $$ DECLARE tab text; pol record; BEGIN
 FOREACH tab IN ARRAY ARRAY[
 'leads','packages','interviews','students','contracts','teachers','school_settings',
 'contract_types','teacher_access_codes','interview_invites','crm_followups','crm_appointments','crm_activities'
 ] LOOP
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tab
   AND cmd IN ('INSERT','UPDATE','DELETE','ALL') LOOP
   EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',pol.policyname,tab);
  END LOOP;
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK(public.is_school_admin(school_id) AND public.has_active_school_license(school_id))',tab||'_license_insert',tab);
  IF tab<>'crm_activities' AND tab<>'teacher_access_codes' AND tab<>'interview_invites' THEN
   IF tab='contracts' THEN
    EXECUTE 'CREATE POLICY contracts_license_update ON public.contracts FOR UPDATE TO authenticated USING(public.is_school_admin(school_id) AND public.has_active_school_license(school_id) AND status IN (''draft'',''sent'')) WITH CHECK(public.is_school_admin(school_id) AND public.has_active_school_license(school_id) AND status IN (''draft'',''sent'',''void''))';
   ELSE
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING(public.is_school_admin(school_id) AND public.has_active_school_license(school_id)) WITH CHECK(public.is_school_admin(school_id) AND public.has_active_school_license(school_id))',tab||'_license_update',tab);
   END IF;
  END IF;
 END LOOP;
END $$;
CREATE POLICY leads_license_delete ON public.leads FOR DELETE TO authenticated
 USING(public.is_school_admin(school_id) AND public.has_active_school_license(school_id));
CREATE POLICY packages_license_delete ON public.packages FOR DELETE TO authenticated
 USING(public.is_school_admin(school_id) AND public.has_active_school_license(school_id));
CREATE POLICY contract_types_license_delete ON public.contract_types FOR DELETE TO authenticated
 USING(public.is_school_admin(school_id) AND public.has_active_school_license(school_id));

-- Protecao tambem contra writes indiretos via RPCs SECURITY DEFINER e Edge Functions.
CREATE OR REPLACE FUNCTION public.enforce_school_license_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE school uuid;
BEGIN
 school:=CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 IF NOT public.has_active_school_license(school) THEN
  RAISE EXCEPTION 'Licenca da escola suspensa ou vencida';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY[
 'leads','packages','interviews','students','contracts','teachers','school_settings',
 'contract_types','teacher_access_codes','interview_invites','crm_followups','crm_appointments','crm_activities'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS enforce_school_license_write ON public.%I',tab);
  EXECUTE format('CREATE TRIGGER enforce_school_license_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_school_license_write()',tab);
 END LOOP;
END $$;

DROP POLICY IF EXISTS campanella_template_school_insert ON storage.objects;
DROP POLICY IF EXISTS campanella_template_school_update ON storage.objects;
CREATE POLICY campanella_template_school_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='campanella-contratos' AND EXISTS(
  SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%'
  AND public.is_school_admin(s.id) AND public.has_active_school_license(s.id)));
CREATE POLICY campanella_template_school_update ON storage.objects FOR UPDATE TO authenticated
 USING (bucket_id='campanella-contratos' AND EXISTS(
  SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%'
  AND public.is_school_admin(s.id) AND public.has_active_school_license(s.id)))
 WITH CHECK (bucket_id='campanella-contratos' AND EXISTS(
  SELECT 1 FROM public.schools s WHERE storage.objects.name LIKE s.id::text||'/%'
  AND public.is_school_admin(s.id) AND public.has_active_school_license(s.id)));

-- Link de entrevistador fica inutilizavel quando a escola esta bloqueada.
CREATE OR REPLACE FUNCTION public.verify_external_interview(p_hash text,p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.interview_invites%rowtype; good boolean;
BEGIN
 SELECT * INTO rec FROM public.interview_invites WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF rec.revoked_at IS NOT NULL OR rec.used_at IS NOT NULL OR rec.expires_at<=now() OR rec.failed_attempts>=5
   OR NOT public.has_active_school_license(rec.school_id) THEN RETURN NULL; END IF;
 SELECT (tc.code_hash=extensions.crypt(coalesce(p_code,''),tc.code_hash)) INTO good
 FROM public.teacher_access_codes tc WHERE tc.teacher_id=rec.teacher_id AND tc.school_id=rec.school_id;
 IF NOT coalesce(good,false) THEN
  UPDATE public.interview_invites SET failed_attempts=failed_attempts+1 WHERE id=rec.id;
  RETURN NULL;
 END IF;
 RETURN jsonb_build_object('invite_id',rec.id,'lead_id',rec.lead_id,'teacher_id',rec.teacher_id,'school_id',rec.school_id);
END; $$;
REVOKE ALL ON FUNCTION public.verify_external_interview(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_external_interview(text,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ACAO MANUAL APOS A MIGRACAO (uma unica vez, no SQL Editor):
-- INSERT INTO public.campanella_platform_admins(user_id)
-- SELECT id FROM auth.users WHERE lower(email)=lower('SEU_EMAIL_CONFIRMADO_AQUI')
--   AND email_confirmed_at IS NOT NULL ON CONFLICT DO NOTHING;
-- Confira o numero de linhas inseridas (deve ser 1).

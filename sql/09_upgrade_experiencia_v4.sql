-- CAMPANELLA V4.1 - PERFIL, ESCOLA, NOVAS CHAVES E EXCLUSAO PROGRAMADA
-- Aplicar somente DEPOIS do 07 e do 08. Fazer backup do banco e do Storage.
-- A exclusao fisica exige implantar e agendar supabase/functions/purge-schools.
BEGIN;

ALTER TABLE public.schools
 ADD COLUMN IF NOT EXISTS contact_email text,
 ADD COLUMN IF NOT EXISTS contact_phone text,
 ADD COLUMN IF NOT EXISTS address text,
 ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
 ADD COLUMN IF NOT EXISTS deletion_due_at timestamptz,
 ADD COLUMN IF NOT EXISTS deletion_started_at timestamptz;
CREATE INDEX IF NOT EXISTS schools_deletion_due_idx ON public.schools(deletion_due_at)
 WHERE deletion_due_at IS NOT NULL;

-- Mantem os dados, mas para TODA escrita (incluindo Edge Functions) desde a solicitacao.
CREATE OR REPLACE FUNCTION public.has_active_school_license(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.schools s JOIN public.school_licenses l ON l.school_id=s.id
  WHERE s.id=p_school AND s.deletion_requested_at IS NULL AND l.suspended_at IS NULL
  AND (l.expires_on IS NULL OR l.expires_on >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
 );
$$;
REVOKE ALL ON FUNCTION public.has_active_school_license(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_active_school_license(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.update_school_details(
 p_school uuid,p_name text,p_email text,p_phone text,p_address text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_school_admin(p_school) THEN RAISE EXCEPTION 'Somente o administrador da escola pode editar os dados'; END IF;
 IF EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND deletion_requested_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Restaure a escola antes de alterar as informacoes'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 2 AND 120 OR
    length(coalesce(p_email,''))>254 OR length(coalesce(p_phone,''))>40 OR length(coalesce(p_address,''))>500 THEN
    RAISE EXCEPTION 'Dados da escola invalidos'; END IF;
 IF btrim(coalesce(p_email,''))<>'' AND btrim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'E-mail da escola invalido'; END IF;
 UPDATE public.schools SET name=btrim(p_name), contact_email=nullif(lower(btrim(p_email)),''),
 contact_phone=nullif(btrim(p_phone),''), address=nullif(btrim(p_address),'') WHERE id=p_school;
END; $$;

CREATE OR REPLACE FUNCTION public.schedule_school_deletion(p_school uuid,p_confirm_name text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE deadline timestamptz; stored_name text;
BEGIN
 IF NOT public.is_school_admin(p_school) THEN RAISE EXCEPTION 'Somente o administrador responsavel pode solicitar a exclusao'; END IF;
 SELECT name INTO stored_name FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escola nao encontrada'; END IF;
 IF btrim(coalesce(p_confirm_name,''))<>stored_name THEN RAISE EXCEPTION 'Digite o nome exato da escola para confirmar'; END IF;
 IF (SELECT deletion_requested_at FROM public.schools WHERE id=p_school) IS NOT NULL
 THEN RAISE EXCEPTION 'A exclusao desta escola ja esta agendada'; END IF;
 deadline:=now()+interval '30 days';
 UPDATE public.schools SET deletion_requested_at=now(),deletion_due_at=deadline,deletion_started_at=NULL WHERE id=p_school;
 INSERT INTO public.license_events(school_id,action,actor_id,detail)
 VALUES(p_school,'exclusao_solicitada',auth.uid(),jsonb_build_object('prevista_para',deadline));
 RETURN deadline;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_school_deletion(p_school uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE deadline timestamptz; started timestamptz;
BEGIN
 IF NOT (public.is_school_admin(p_school) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Sem permissao para restaurar a escola'; END IF;
 SELECT deletion_due_at,deletion_started_at INTO deadline,started FROM public.schools WHERE id=p_school FOR UPDATE;
 IF started IS NOT NULL OR deadline IS NULL OR deadline<=now() THEN RAISE EXCEPTION 'A exclusao nao pode mais ser cancelada'; END IF;
 UPDATE public.schools SET deletion_requested_at=NULL,deletion_due_at=NULL WHERE id=p_school;
 INSERT INTO public.license_events(school_id,action,actor_id)
 VALUES(p_school,'exclusao_cancelada',auth.uid());
END; $$;

-- Uma segunda chave para uma escola existente NAO cria outra escola.
-- Os codigos sao usados uma vez; so o hash SHA-256 fica salvo.
CREATE TABLE IF NOT EXISTS public.school_renewal_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 code_hash text NOT NULL UNIQUE,
 code_suffix text NOT NULL,
 recipient_email text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('paga','cortesia')),
 validity_mode text NOT NULL CHECK(validity_mode IN ('days','date','unlimited')),
 validity_days integer CHECK(validity_days BETWEEN 1 AND 3650),
 expires_on date,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 redeemed_by uuid REFERENCES auth.users(id),
 redeemed_at timestamptz,
 CONSTRAINT school_renewal_key_validity CHECK(
  (validity_mode='days' AND validity_days IS NOT NULL AND expires_on IS NULL) OR
  (validity_mode='date' AND validity_days IS NULL AND expires_on IS NOT NULL) OR
  (validity_mode='unlimited' AND validity_days IS NULL AND expires_on IS NULL)
 )
);
CREATE INDEX IF NOT EXISTS school_renewal_keys_school_idx ON public.school_renewal_keys(school_id,created_at DESC);
ALTER TABLE public.school_renewal_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_renewal_keys FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_renewal_keys TO authenticated;
GRANT ALL ON public.school_renewal_keys TO service_role;
CREATE POLICY school_renewal_keys_platform_read ON public.school_renewal_keys
 FOR SELECT TO authenticated USING(public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.issue_school_renewal_key(
 p_school uuid,p_kind text,p_validity_mode text,p_validity_days integer DEFAULT NULL,p_expires_on date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE secret text; code text; k uuid; recipient text; school_name text; local_today date;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Acesso exclusivo do administrador geral'; END IF;
 SELECT s.name,lower(u.email) INTO school_name,recipient
 FROM public.schools s JOIN auth.users u ON u.id=s.admin_user_id
 WHERE s.id=p_school AND s.deletion_requested_at IS NULL;
 IF recipient IS NULL THEN RAISE EXCEPTION 'Escola sem administrador valido ou agendada para exclusao'; END IF;
 local_today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF p_kind NOT IN ('paga','cortesia') OR p_validity_mode NOT IN ('days','date','unlimited') OR
   (p_validity_mode='days' AND (p_validity_days IS NULL OR p_validity_days NOT BETWEEN 1 AND 3650 OR p_expires_on IS NOT NULL)) OR
   (p_validity_mode='date' AND (p_expires_on IS NULL OR p_expires_on<local_today OR p_validity_days IS NOT NULL)) OR
   (p_validity_mode='unlimited' AND (p_validity_days IS NOT NULL OR p_expires_on IS NOT NULL)) THEN
   RAISE EXCEPTION 'Tipo ou validade invalida'; END IF;
 secret:=upper(encode(extensions.gen_random_bytes(16),'hex'));
 code:=format('CAMP-%s-%s-%s-%s',substr(secret,1,8),substr(secret,9,8),substr(secret,17,8),substr(secret,25,8));
 INSERT INTO public.school_renewal_keys(school_id,code_hash,code_suffix,recipient_email,kind,validity_mode,validity_days,expires_on,created_by)
 VALUES(p_school,encode(extensions.digest(code,'sha256'),'hex'),right(code,4),recipient,p_kind,p_validity_mode,p_validity_days,p_expires_on,auth.uid()) RETURNING id INTO k;
 INSERT INTO public.license_events(school_id,action,actor_id,detail)
 VALUES(p_school,'chave_renovacao_criada',auth.uid(),jsonb_build_object('email',recipient,'terminacao',right(code,4)));
 RETURN jsonb_build_object('id',k,'key',code,'school_name',school_name,'recipient_email',recipient);
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_school_renewal_key(p_school uuid,p_key text)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.school_renewal_keys%rowtype; local_today date; expiration date; verified_email text;
BEGIN
 IF NOT public.is_school_admin(p_school) THEN RAISE EXCEPTION 'Voce nao administra esta escola'; END IF;
 IF EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND deletion_requested_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Restaure a escola antes de aplicar uma chave'; END IF;
 SELECT lower(email) INTO verified_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF verified_email IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail'; END IF;
 IF p_key IS NULL OR p_key !~* '^CAMP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$' THEN
  RAISE EXCEPTION 'Codigo invalido'; END IF;
 SELECT * INTO k FROM public.school_renewal_keys
 WHERE school_id=p_school AND code_hash=encode(extensions.digest(upper(btrim(p_key)),'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND OR k.revoked_at IS NOT NULL OR k.redeemed_at IS NOT NULL OR k.recipient_email<>verified_email THEN
  RAISE EXCEPTION 'Chave nao encontrada, revogada, utilizada ou vinculada a outro administrador'; END IF;
 local_today:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 expiration:=CASE k.validity_mode WHEN 'days' THEN local_today+k.validity_days-1
   WHEN 'date' THEN k.expires_on ELSE NULL END;
 IF expiration IS NOT NULL AND expiration<local_today THEN RAISE EXCEPTION 'Esta chave ja venceu'; END IF;
 UPDATE public.school_licenses SET kind=k.kind,expires_on=expiration,suspended_at=NULL,
  updated_by=auth.uid(),updated_at=now(),note='Renovada com chave individual' WHERE school_id=p_school;
 IF NOT FOUND THEN RAISE EXCEPTION 'Licenca desta escola nao encontrada'; END IF;
 UPDATE public.school_renewal_keys SET redeemed_at=now(),redeemed_by=auth.uid() WHERE id=k.id;
 INSERT INTO public.license_events(school_id,action,actor_id,detail)
 VALUES(p_school,'chave_renovacao_utilizada',auth.uid(),jsonb_build_object('validade',expiration,'tipo',k.kind));
 RETURN expiration;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_school_renewal_key(p_key uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Acesso restrito'; END IF;
 UPDATE public.school_renewal_keys SET revoked_at=now()
 WHERE id=p_key AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING school_id INTO sid;
 IF sid IS NULL THEN RAISE EXCEPTION 'Chave ja utilizada, revogada ou nao encontrada'; END IF;
 INSERT INTO public.license_events(school_id,action,actor_id)
 VALUES(sid,'chave_renovacao_revogada',auth.uid());
END; $$;

REVOKE ALL ON FUNCTION public.update_school_details(uuid,text,text,text,text),
 public.schedule_school_deletion(uuid,text),public.cancel_school_deletion(uuid),
 public.issue_school_renewal_key(uuid,text,text,integer,date),
 public.redeem_school_renewal_key(uuid,text),public.revoke_school_renewal_key(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_school_details(uuid,text,text,text,text),
 public.schedule_school_deletion(uuid,text),public.cancel_school_deletion(uuid),
 public.issue_school_renewal_key(uuid,text,text,integer,date),
 public.redeem_school_renewal_key(uuid,text),public.revoke_school_renewal_key(uuid)
 TO authenticated;

-- O purge registra a exclusao SEM guardar dados dos alunos.
CREATE TABLE IF NOT EXISTS public.school_deletion_audit (
 school_id uuid PRIMARY KEY,
 school_name text NOT NULL,
 requested_at timestamptz NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_deletion_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.school_deletion_audit TO service_role;

-- Os FKs dos dados de uma escola passam a apagar em cascata SOMENTE quando
-- a exclusao definitiva do registro schools for autorizada pelo servidor.
DO $$ DECLARE f record; BEGIN
 FOR f IN
  SELECT c.conname, c.conrelid, c.confdeltype, a.attname
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
  WHERE c.contype='f' AND c.confrelid='public.schools'::regclass
   AND c.connamespace='public'::regnamespace AND array_length(c.conkey,1)=1
 LOOP
  IF f.attname='school_id' AND f.confdeltype<>'c' THEN
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',f.conrelid::regclass,f.conname);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE',f.conrelid::regclass,f.conname);
  ELSIF f.attname='redeemed_school_id' AND f.confdeltype<>'n' THEN
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',f.conrelid::regclass,f.conname);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (redeemed_school_id) REFERENCES public.schools(id) ON DELETE SET NULL',f.conrelid::regclass,f.conname);
  END IF;
 END LOOP;
END $$;

-- A primeira etapa bloqueia a restauracao ANTES de remover os arquivos do Storage.
-- Assim o usuario nao consegue restaurar a escola no meio da limpeza fisica.
CREATE OR REPLACE FUNCTION public.begin_school_purge(p_school uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Somente o servidor pode iniciar a exclusao'; END IF;
 PERFORM 1 FROM public.schools WHERE id=p_school AND deletion_requested_at IS NOT NULL
  AND deletion_due_at<=now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Exclusao nao autorizada ou prazo nao concluido'; END IF;
 UPDATE public.schools SET deletion_started_at=coalesce(deletion_started_at,now()) WHERE id=p_school;
END; $$;
REVOKE ALL ON FUNCTION public.begin_school_purge(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_school_purge(uuid) TO service_role;

-- A rotina do servidor usa service_role e NAO pode ser executada no navegador.
CREATE OR REPLACE FUNCTION public.purge_school_permanently(p_school uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rec public.schools%rowtype;
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Apenas o servidor pode executar exclusoes fisicas'; END IF;
 SELECT * INTO rec FROM public.schools WHERE id=p_school FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escola nao encontrada'; END IF;
 IF rec.deletion_due_at IS NULL OR rec.deletion_due_at>now() OR rec.deletion_requested_at IS NULL OR rec.deletion_started_at IS NULL
 THEN RAISE EXCEPTION 'Prazo de 30 dias ainda nao concluido'; END IF;
 -- Liberacao interna para os triggers de licenca, apenas nesta transacao service_role.
 PERFORM set_config('campanella.internal_purge','on',true);
 -- Remove dependencias em ordem: links compostos entre tabelas nao bloqueiam o purge.
 DELETE FROM public.crm_activities WHERE school_id=p_school;
 DELETE FROM public.crm_appointments WHERE school_id=p_school;
 DELETE FROM public.crm_followups WHERE school_id=p_school;
 DELETE FROM public.interview_invites WHERE school_id=p_school;
 DELETE FROM public.teacher_access_codes WHERE school_id=p_school;
 DELETE FROM public.contracts WHERE school_id=p_school;
 DELETE FROM public.students WHERE school_id=p_school;
 DELETE FROM public.interviews WHERE school_id=p_school;
 DELETE FROM public.leads WHERE school_id=p_school;
 DELETE FROM public.packages WHERE school_id=p_school;
 DELETE FROM public.teachers WHERE school_id=p_school;
 DELETE FROM public.contract_types WHERE school_id=p_school;
 DELETE FROM public.school_settings WHERE school_id=p_school;
 INSERT INTO public.school_deletion_audit(school_id,school_name,requested_at)
 VALUES(rec.id,rec.name,rec.deletion_requested_at) ON CONFLICT (school_id) DO NOTHING;
 DELETE FROM public.schools WHERE id=p_school;
 PERFORM set_config('campanella.internal_purge','',true);
END; $$;
REVOKE ALL ON FUNCTION public.purge_school_permanently(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_school_permanently(uuid) TO service_role;

-- Reaproveita a guarda de escrita ja aplicada por triggers na migracao 08.
CREATE OR REPLACE FUNCTION public.enforce_school_license_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 IF TG_OP='DELETE' AND current_setting('campanella.internal_purge',true)='on'
    AND coalesce(auth.role(),'')='service_role' THEN RETURN OLD; END IF;
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.school_id ELSE NEW.school_id END;
 IF NOT public.has_active_school_license(sid) THEN
  RAISE EXCEPTION 'Licenca da escola suspensa, vencida ou exclusao agendada'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;

NOTIFY pgrst,'reload schema';
COMMIT;

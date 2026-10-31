-- CAMPANELLA V2 - RECONSTRUCAO COMPLETA - BANCO NOVO
-- Cria todas as estruturas da V1 a V2 em UMA transacao.
-- Executar APENAS num projeto Supabase NOVO, sem tabelas Campanella.
-- Nao recupera alunos, contratos ou historico do projeto excluido.
-- O SQL ja ativa RLS; nao desative a protecao das tabelas.

BEGIN;

DO $campanella_bootstrap$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL
  OR to_regclass('public.students') IS NOT NULL
  OR to_regclass('public.contracts') IS NOT NULL
  OR to_regclass('public.interviews') IS NOT NULL THEN
    RAISE EXCEPTION 'Instalador para banco novo: tabelas Campanella ja existem. Interrompido para proteger os dados.';
  END IF;
END
$campanella_bootstrap$;

-- ============================================================
-- 01_schema.sql
-- ============================================================
-- CAMPANELLA - MATRÍCULAS V1
-- Executar uma única vez no SQL Editor do Supabase, projeto correto.
-- Antes de usar com dados reais, revise as observações de segurança do README.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 role text not null default 'pending' check (role in ('admin','professor','pending')),
 created_at timestamptz not null default now()
);

create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,email,role)
 values (new.id, coalesce(new.email,''),
 case when lower(coalesce(new.email,'')) = 'julia.correa.souza@gmail.com' then 'admin' else 'pending' end)
 on conflict (id) do update set email=excluded.email;
 return new;
end; $$;
drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile after insert on auth.users
for each row execute function public.on_auth_user_created();

-- Reconciliar usuários que tenham sido criados antes da instalação.
insert into public.profiles(id,email,role)
select id,coalesce(email,''),case when lower(email)='julia.correa.souza@gmail.com' then 'admin' else 'pending' end
from auth.users on conflict(id) do update set email=excluded.email;
update public.profiles set role='admin'
where lower(email)='julia.correa.souza@gmail.com';

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id=auth.uid() and role in ('admin','professor'));
$$;

create table if not exists public.leads (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 180),
 guardian_name text,
 phone text not null,
 status text not null default 'novo' check(status in ('novo','entrevistado','convertido','perdido')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.packages (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 kind text not null default 'individual' check(kind in ('individual','dupla')),
 lessons_count int not null check(lessons_count between 1 and 500),
 weekly_frequency int not null check(weekly_frequency between 1 and 7),
 default_total numeric(12,2) not null check(default_total>=0),
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.interviews (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null unique references public.leads(id) on delete restrict,
 package_id uuid not null references public.packages(id) on delete restrict,
 interviewer_id uuid references public.profiles(id),
 weekly_days int[] not null,
 lesson_time time not null,
 start_date date not null,
 end_date date not null,
 total_amount numeric(12,2) not null check(total_amount>=0),
 total_extenso text not null,
 installments int not null check(installments between 1 and 48),
 installment_amount numeric(12,2) not null check(installment_amount>=0),
 first_due_date date not null,
 payment_method text not null default 'Boleto',
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint dates_order check(end_date>=start_date)
);

create table if not exists public.students (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid unique references public.leads(id) on delete restrict,
 full_name text not null,
 cpf text not null,
 email text not null,
 birth_date date not null,
 phone text not null,
 address text not null,
 cep text not null,
 is_minor boolean not null,
 guardian_name text,
 guardian_birth_date date,
 guardian_cpf text,
 guardian_phone text,
 guardian_email text,
 guardian_address text,
 guardian_cep text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id) on delete restrict,
 student_id uuid references public.students(id) on delete restrict,
 interview_id uuid references public.interviews(id) on delete restrict,
 previous_contract_id uuid references public.contracts(id) on delete restrict,
 kind text not null check(kind in ('individual','menor','dupla')),
 status text not null default 'draft' check(status in ('draft','sent','signed','superseded','void')),
 terms jsonb not null,
 template_html text not null,
 template_version text not null default 'original-2026-v1',
 token_hash text unique,
 token_expires_at timestamptz,
 sent_at timestamptz,
 signed_at timestamptz,
 signed_name text,
 student_snapshot jsonb,
 signature_png text,
 signed_document_html text,
 signed_hash text,
 audit jsonb,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists contracts_student_idx on public.contracts(student_id,status);
create index if not exists contracts_lead_idx on public.contracts(lead_id,status);
create index if not exists contracts_expiry_idx on public.contracts((terms->>'end_date'));

create or replace function public.stamp_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at=now();return new;end;$$;
do $$ declare tbl text; begin
 foreach tbl in array array['leads','interviews','students','contracts'] loop
  execute format('drop trigger if exists set_updated_at on public.%I',tbl);
  execute format('create trigger set_updated_at before update on public.%I for each row execute function public.stamp_updated_at()',tbl);
 end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.packages enable row level security;
alter table public.interviews enable row level security;
alter table public.students enable row level security;
alter table public.contracts enable row level security;

create policy profiles_select on public.profiles for select to authenticated
 using (id=auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
 using (public.is_admin()) with check (public.is_admin());

create policy leads_staff_read on public.leads for select to authenticated using(public.is_staff());
create policy leads_admin_insert on public.leads for insert to authenticated with check(public.is_admin());
create policy leads_admin_update on public.leads for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy leads_admin_delete on public.leads for delete to authenticated using(public.is_admin());

create policy packages_staff_read on public.packages for select to authenticated using(public.is_staff());
create policy packages_admin_insert on public.packages for insert to authenticated with check(public.is_admin());
create policy packages_admin_update on public.packages for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy packages_admin_delete on public.packages for delete to authenticated using(public.is_admin());

create policy interviews_staff_read on public.interviews for select to authenticated using(public.is_staff());
create policy interviews_staff_insert on public.interviews for insert to authenticated with check(public.is_staff());
create policy interviews_staff_update on public.interviews for update to authenticated using(public.is_staff()) with check(public.is_staff());

create policy students_admin_read on public.students for select to authenticated using(public.is_admin());
-- Perfil do aluno só pode ser editado por assinatura no backend. Admin edita via formulário futuro.

create policy contracts_admin_read on public.contracts for select to authenticated using(public.is_admin());
create policy contracts_admin_insert on public.contracts for insert to authenticated with check(public.is_admin() and status='draft');
create policy contracts_admin_update on public.contracts for update to authenticated
 using(public.is_admin() and status in ('draft','sent'))
 with check(public.is_admin() and status in ('draft','sent','void'));
-- Sem policy DELETE: contratos históricos não podem ser apagados pela interface.

-- Transação atômica de assinatura: invocável SOMENTE pela Edge Function usando service_role.
create or replace function public.finalize_enrollment(
 p_token_hash text, p_student jsonb, p_signature_png text,
 p_signed_name text, p_signed_html text, p_signed_hash text, p_audit jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.contracts%rowtype; sid uuid; dob date; minor boolean;
begin
 select * into c from public.contracts
 where token_hash=p_token_hash and status='sent' and token_expires_at>now()
 for update;
 if not found then raise exception 'Link inválido, vencido ou já utilizado'; end if;
 if c.kind='dupla' then raise exception 'Assinatura de dupla não habilitada nesta versão'; end if;
 dob := (p_student->>'birth_date')::date;
 minor := (dob + interval '18 years')::date > (now() at time zone 'America/Sao_Paulo')::date;
 if (minor and c.kind<>'menor') or (not minor and c.kind<>'individual') then
  raise exception 'Modelo incompatível com a idade do aluno'; end if;
 if c.student_id is not null then
  sid := c.student_id;
  update public.students set
   full_name=p_student->>'full_name', cpf=p_student->>'cpf', email=p_student->>'email',
   birth_date=dob, phone=p_student->>'phone', address=p_student->>'address',
   cep=p_student->>'cep', is_minor=minor,
   guardian_name=p_student->>'guardian_name', guardian_birth_date=nullif(p_student->>'guardian_birth_date','')::date,
   guardian_cpf=p_student->>'guardian_cpf', guardian_phone=p_student->>'guardian_phone',
   guardian_email=p_student->>'guardian_email', guardian_address=p_student->>'guardian_address',
   guardian_cep=p_student->>'guardian_cep' where id=sid;
 else
  insert into public.students(lead_id,full_name,cpf,email,birth_date,phone,address,cep,is_minor,
   guardian_name,guardian_birth_date,guardian_cpf,guardian_phone,guardian_email,guardian_address,guardian_cep)
  values(c.lead_id,p_student->>'full_name',p_student->>'cpf',p_student->>'email',dob,p_student->>'phone',
   p_student->>'address',p_student->>'cep',minor,
   p_student->>'guardian_name',nullif(p_student->>'guardian_birth_date','')::date,
   p_student->>'guardian_cpf',p_student->>'guardian_phone',p_student->>'guardian_email',
   p_student->>'guardian_address',p_student->>'guardian_cep')
  on conflict(lead_id) do update set full_name=excluded.full_name
  returning id into sid;
 end if;
 -- Ao entrar uma nova matrícula assinada, as anteriores tornam-se históricas.
 update public.contracts set status='superseded'
 where student_id=sid and id<>c.id and status='signed';
 update public.contracts set student_id=sid,status='signed',signed_at=now(),signed_name=p_signed_name,
  student_snapshot=p_student,signature_png=p_signature_png,signed_document_html=p_signed_html,
  signed_hash=p_signed_hash,audit=p_audit,token_hash=null,token_expires_at=null where id=c.id;
 if c.previous_contract_id is not null then
  update public.contracts set status='superseded' where id=c.previous_contract_id and status='signed';
 end if;
 update public.leads set status='convertido' where id=c.lead_id;
 return c.id;
end;$$;
revoke all on function public.finalize_enrollment(text,jsonb,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_enrollment(text,jsonb,text,text,text,text,jsonb) to service_role;

-- Funções auxiliares não podem ser executadas com credenciais anônimas.
revoke all on function public.on_auth_user_created() from public,anon,authenticated;
revoke all on function public.stamp_updated_at() from public,anon,authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- O professor muda a etapa automaticamente ao salvar a ficha.
create or replace function public.mark_lead_interviewed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 update public.leads set status='entrevistado'
 where id=new.lead_id and status in ('novo','perdido');
 return new;
end;$$;
drop trigger if exists interview_marks_lead on public.interviews;
create trigger interview_marks_lead after insert or update on public.interviews
for each row execute function public.mark_lead_interviewed();
revoke all on function public.mark_lead_interviewed() from public,anon,authenticated;

-- ============================================================
-- 02_upgrade_v1_2.sql
-- ============================================================
-- CAMPANELLA V1.2 - MIGRACAO INCREMENTAL
-- Execute APOS o 01_schema.sql da V1.
-- Preserva leads, alunos, fichas e historico de contratos.

create table if not exists public.teachers (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 180),
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.school_settings (
 id boolean primary key default true check (id = true),
 owner_name text not null default '',
 owner_signature_png text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint owner_signature_size check(length(coalesce(owner_signature_png,'')) <= 160000)
);
insert into public.school_settings(id,owner_name) values (true,'') on conflict do nothing;

create table if not exists public.contract_types (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 kind text not null check (kind in ('individual','menor','dupla')),
 body_text text not null check (length(body_text) between 20 and 24000),
 fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.interviews add column if not exists course text not null default 'Inglês';
alter table public.interviews add column if not exists teacher_id uuid references public.teachers(id) on delete restrict;
alter table public.interviews add column if not exists first_installment_amount numeric(12,2);

alter table public.students add column if not exists current_weekly_days int[];
alter table public.students add column if not exists current_lesson_time time;

alter table public.contracts add column if not exists contract_type_id uuid references public.contract_types(id) on delete restrict;
alter table public.contracts add column if not exists owner_name text;
alter table public.contracts add column if not exists owner_signature_png text;
do $$ begin
 if not exists (
  select 1 from pg_constraint
  where conname = 'owner_signature_size'
    and conrelid = 'public.contracts'::regclass
 ) then
  alter table public.contracts add constraint owner_signature_size
   check(length(coalesce(owner_signature_png,'')) <= 160000);
 end if;
end $$;

create index if not exists students_name_idx on public.students (lower(full_name));
create index if not exists contracts_type_idx on public.contracts (contract_type_id);

alter table public.teachers enable row level security;
alter table public.school_settings enable row level security;
alter table public.contract_types enable row level security;

create policy teachers_staff_read on public.teachers for select to authenticated using(public.is_staff());
create policy teachers_admin_create on public.teachers for insert to authenticated with check(public.is_admin());
create policy teachers_admin_edit on public.teachers for update to authenticated using(public.is_admin()) with check(public.is_admin());

create policy school_settings_admin_read on public.school_settings for select to authenticated using(public.is_admin());
create policy school_settings_admin_create on public.school_settings for insert to authenticated with check(public.is_admin());
create policy school_settings_admin_edit on public.school_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());

create policy contract_types_staff_read on public.contract_types for select to authenticated using(public.is_staff());
create policy contract_types_admin_create on public.contract_types for insert to authenticated with check(public.is_admin());
create policy contract_types_admin_edit on public.contract_types for update to authenticated using(public.is_admin()) with check(public.is_admin());

create policy students_admin_create on public.students for insert to authenticated with check(public.is_admin());
create policy students_admin_edit on public.students for update to authenticated using(public.is_admin()) with check(public.is_admin());

-- Politicas antigas ja impedem exclusao de contratos assinados.
-- Bloquear mudanca de conteudo apos envio sem interferir na assinatura via service_role.
create or replace function public.lock_sent_contract()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if old.status <> 'draft' and (
    new.terms is distinct from old.terms or
    new.template_html is distinct from old.template_html or
    new.template_version is distinct from old.template_version or
    new.owner_name is distinct from old.owner_name or
    new.owner_signature_png is distinct from old.owner_signature_png or
    new.contract_type_id is distinct from old.contract_type_id
 ) then
    raise exception 'Conteudo do contrato nao pode mudar apos envio';
 end if;
 return new;
end;
$$;
drop trigger if exists lock_sent_contract on public.contracts;
create trigger lock_sent_contract before update on public.contracts
for each row execute function public.lock_sent_contract();

-- Horario atual: preencher somente na primeira assinatura.
-- Renovacoes futuras nao sobrescrevem as mudancas administrativas.
create or replace function public.initialize_student_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status = 'signed' and old.status <> 'signed' and new.student_id is not null then
  update public.students
  set current_weekly_days = coalesce(current_weekly_days,
         array(select jsonb_array_elements_text(new.terms->'weekly_days')::integer)),
      current_lesson_time = coalesce(current_lesson_time,
         (new.terms->>'lesson_time')::time)
  where id = new.student_id;
 end if;
 return new;
end;
$$;
drop trigger if exists contract_initializes_schedule on public.contracts;
create trigger contract_initializes_schedule after update of status on public.contracts
for each row execute function public.initialize_student_schedule();

-- Preparar perfis existentes com horario do contrato mais recente, sem alterar contratos.
with latest as (
 select distinct on (student_id) student_id,terms
 from public.contracts
 where student_id is not null and status in ('signed','superseded')
 order by student_id, created_at desc
)
update public.students s
set current_weekly_days = coalesce(s.current_weekly_days,
         array(select jsonb_array_elements_text(latest.terms->'weekly_days')::integer)),
    current_lesson_time = coalesce(s.current_lesson_time,
         (latest.terms->>'lesson_time')::time)
from latest
where s.id = latest.student_id
and (s.current_weekly_days is null or s.current_lesson_time is null);

-- Manter o registro de alteracoes dos modelos e configuracoes.
drop trigger if exists set_updated_at on public.contract_types;
create trigger set_updated_at before update on public.contract_types
for each row execute function public.stamp_updated_at();
drop trigger if exists set_updated_at on public.school_settings;
create trigger set_updated_at before update on public.school_settings
for each row execute function public.stamp_updated_at();

-- Limitar invocacao das funcoes internas de trigger (definer).
revoke all on function public.initialize_student_schedule() from public, anon, authenticated;

-- ============================================================
-- 03_upgrade_v1_3.sql
-- ============================================================
-- CAMPANELLA V1.3 - Execute APOS 01_schema.sql e 02_upgrade_v1_2.sql.
-- Migração incremental. Nao executa DROP TABLE nem apaga alunos.

-- Somente administradores podem acessar o painel interno.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

-- Estados de ficha inicial, inclusive desistencias recuperaveis e arquivamento.
alter table public.interviews add column if not exists pipeline_status text not null default 'open';
alter table public.interviews add column if not exists archived_at timestamptz;
alter table public.interviews drop constraint if exists interview_pipeline_status_check;
alter table public.interviews add constraint interview_pipeline_status_check check (pipeline_status in ('open','lost','archived'));

-- A matricula e considerada expirada por data, nao por alteracao automatica do banco.
-- closed = encerrado manualmente ou por rematricula assinada.
alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts add constraint contracts_status_check
 check(status in ('draft','sent','signed','superseded','closed','void'));
alter table public.contracts add column if not exists closed_at timestamptz;
alter table public.contracts add column if not exists closure_reason text;
update public.contracts set status='closed',closed_at=coalesce(closed_at,now()),closure_reason=coalesce(closure_reason,'rematricula_anterior') where status='superseded';

-- A V1/V1.2 chama superseded ao assinar a rematricula. Converter a closed.
create or replace function public.mark_contract_closed()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if old.status='closed' and new.status is distinct from old.status then
   raise exception 'Contrato encerrado nao pode ser reativado';
 end if;
 if old.status='signed' and new.status='superseded' then new.status='closed'; end if;
 if new.status='closed' and old.status is distinct from 'closed' then
    if old.status not in ('signed','superseded') then raise exception 'Apenas contratos assinados podem ser encerrados'; end if;
    new.closed_at=coalesce(new.closed_at,now());
    new.closure_reason=coalesce(new.closure_reason,'rematricula_anterior');
    new.token_hash=null;
    new.token_expires_at=null;
 end if;
 return new;
end;
$$;
drop trigger if exists zz_mark_contract_closed on public.contracts;
create trigger zz_mark_contract_closed before update on public.contracts
for each row execute function public.mark_contract_closed();
revoke all on function public.mark_contract_closed() from public,anon,authenticated;

-- Encerramento manual com autenticação de admin: RLS impede alterar assinados diretamente.
create or replace function public.close_enrollment(p_contract_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Acesso negado'; end if;
 update public.contracts
 set status='closed',closed_at=now(),closure_reason='manual'
 where id=p_contract_id and status='signed';
 if not found then raise exception 'Somente matrículas assinadas e abertas podem ser encerradas'; end if;
end;
$$;
revoke all on function public.close_enrollment(uuid) from public,anon;
grant execute on function public.close_enrollment(uuid) to authenticated;

-- A ficha e identificada pelo professor, mas so admin faz login no sistema.
-- Credenciais ficam em tabela privada, separada dos perfis de professor visíveis.
create table if not exists public.teacher_access_codes (
 teacher_id uuid primary key references public.teachers(id) on delete cascade,
 code_hash text not null,
 updated_at timestamptz not null default now()
);
alter table public.teacher_access_codes enable row level security;
revoke all on table public.teacher_access_codes from anon,authenticated;

create or replace function public.set_teacher_access_code(p_teacher uuid,p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Apenas administradores'; end if;
 if length(p_code)<8 or length(p_code)>60 then raise exception 'Use codigo de 8 a 60 caracteres'; end if;
 if not exists(select 1 from public.teachers where id=p_teacher and active=true) then raise exception 'Professor indisponivel'; end if;
 insert into public.teacher_access_codes(teacher_id,code_hash)
 values (p_teacher,extensions.crypt(p_code,extensions.gen_salt('bf')))
 on conflict(teacher_id) do update set code_hash=excluded.code_hash,updated_at=now();
end;
$$;
revoke all on function public.set_teacher_access_code(uuid,text) from public,anon;
grant execute on function public.set_teacher_access_code(uuid,text) to authenticated;

create table if not exists public.interview_invites (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id) on delete cascade,
 teacher_id uuid not null references public.teachers(id) on delete restrict,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 failed_attempts int not null default 0,
 revoked_at timestamptz,
 used_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists interview_invites_lead_idx on public.interview_invites(lead_id);
alter table public.interview_invites enable row level security;
create policy interview_invite_admin_select on public.interview_invites for select to authenticated using(public.is_admin());
create policy interview_invite_admin_insert on public.interview_invites for insert to authenticated with check(public.is_admin());
create policy interview_invite_admin_update on public.interview_invites for update to authenticated using(public.is_admin()) with check(public.is_admin());

-- Somente Edge Function com role privilegiada pode verificar codigos.
-- A tentativa incorreta fica registrada, bloqueia apos 5 falhas.
create or replace function public.verify_external_interview(p_hash text,p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rec public.interview_invites%rowtype; good boolean;
begin
 select * into rec from public.interview_invites where token_hash=p_hash for update;
 if not found then return null; end if;
 if rec.revoked_at is not null or rec.used_at is not null or rec.expires_at<=now() or rec.failed_attempts>=5 then return null; end if;
 select (tc.code_hash = extensions.crypt(coalesce(p_code,''),tc.code_hash)) into good
 from public.teacher_access_codes tc where tc.teacher_id=rec.teacher_id;
 if coalesce(good,false)=false then
   update public.interview_invites set failed_attempts=failed_attempts+1 where id=rec.id;
   return null;
 end if;
 return jsonb_build_object('invite_id',rec.id,'lead_id',rec.lead_id,'teacher_id',rec.teacher_id);
end;
$$;
revoke all on function public.verify_external_interview(text,text) from public,anon,authenticated;
grant execute on function public.verify_external_interview(text,text) to service_role;

-- Para terminar uma entrevista, a funcao chama esta RPC. Evita reuso do link.
create or replace function public.finish_external_interview(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.interview_invites set used_at=now()
 where id=p_invite and used_at is null and revoked_at is null;
 if not found then raise exception 'Link indisponivel'; end if;
end;
$$;
revoke all on function public.finish_external_interview(uuid) from public,anon,authenticated;
grant execute on function public.finish_external_interview(uuid) to service_role;

-- Modelos DOCX originais sao guardados em um bucket PRIVADO.
alter table public.contract_types add column if not exists template_html text;
alter table public.contract_types add column if not exists template_storage_path text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('campanella-contratos','campanella-contratos',false,2000000,
 array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy campanella_template_admin_select on storage.objects for select to authenticated
using(bucket_id='campanella-contratos' and public.is_admin());
create policy campanella_template_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='campanella-contratos' and public.is_admin());
create policy campanella_template_admin_update on storage.objects for update to authenticated
using(bucket_id='campanella-contratos' and public.is_admin())
with check(bucket_id='campanella-contratos' and public.is_admin());

-- Integridade adicional: impede o admin de reabrir contratos assinados via update comum.
-- Contratos encerrados permanecem visíveis no histórico, nunca são apagados.

-- ============================================================
-- 04_upgrade_v1_4.sql
-- ============================================================
-- CAMPANELLA V1.4 - Atualizacao incremental a partir da V1.3
-- Execute SOMENTE apos 01_schema.sql, 02_upgrade_v1_2.sql e 03_upgrade_v1_3.sql.
-- Nao apaga leads, fichas, alunos ou contratos.
-- Faca backup antes de executar em um banco com dados reais.

-- Uma ficha so entra na fila quando a administracao marca o lead.
-- O formulario de entrevista continua completo e separado desta etapa.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ficha_iniciada_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ficha_status text NOT NULL DEFAULT 'open';

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_ficha_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_ficha_status_check
  CHECK (ficha_status IN ('open','lost','archived'));

CREATE INDEX IF NOT EXISTS leads_ficha_status_idx
  ON public.leads (ficha_status, ficha_iniciada_at);

-- Preserva a fila dos leads que ja tinham uma entrevista na V1.3.
UPDATE public.leads l
SET ficha_iniciada_at = i.created_at
FROM public.interviews i
WHERE i.lead_id = l.id
  AND l.ficha_iniciada_at IS NULL;

-- Preserva desistencias e arquivamentos das fichas anteriores.
UPDATE public.leads l
SET ficha_status = i.pipeline_status
FROM public.interviews i
WHERE i.lead_id = l.id
  AND i.pipeline_status IN ('open','lost','archived')
  AND l.ficha_status IS DISTINCT FROM i.pipeline_status;

-- A V1.4 exibe um contrato assinado como "Ativo".
-- Internamente, o banco continua usando "signed" para preservar a
-- integridade das Edge Functions e do historico de assinaturas.
-- Nao e necessario mudar a estrutura dos contratos existentes.

-- ============================================================
-- 05_upgrade_crm_v2.sql
-- ============================================================
-- Campanella V2 | CRM comercial -- executar APOS as migracoes 01 a 04
-- Migração incremental: não exclui nem substitui leads, alunos ou contratos.
BEGIN;
ALTER TABLE public.leads ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_stage text NOT NULL DEFAULT 'novo';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_outcome text NOT NULL DEFAULT 'open';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_service text NOT NULL DEFAULT 'Aulas de inglês';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_region text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_first_contact_on date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_last_contact_on date;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_loss_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_archived_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS crm_origin_ref text;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_crm_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_crm_stage_check CHECK(crm_stage IN ('novo','contato','aguardando','nao_responde','marcar_entrevista','entrevista_agendada','entrevista_realizada','negociacao','contrato_enviado','reativacao','matriculado'));
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_crm_outcome_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_crm_outcome_check CHECK(crm_outcome IN ('open','won','lost'));
CREATE INDEX IF NOT EXISTS leads_crm_pipeline_idx ON public.leads(crm_outcome,crm_stage,created_at DESC);
CREATE INDEX IF NOT EXISTS leads_crm_source_idx ON public.leads(crm_source);
CREATE UNIQUE INDEX IF NOT EXISTS leads_crm_origin_ref_unique ON public.leads(crm_origin_ref) WHERE crm_origin_ref IS NOT NULL;

-- Mantém a conversão automática existente; leads assinados não voltam ao funil.
UPDATE public.leads SET crm_outcome='won',crm_stage='matriculado',crm_archived_at=COALESCE(crm_archived_at,updated_at)
WHERE status='convertido' AND crm_outcome IS DISTINCT FROM 'won';
UPDATE public.leads SET crm_stage='entrevista_realizada'
WHERE status='entrevistado' AND crm_stage='novo' AND crm_outcome='open';
-- Status 'perdido' nas versões antigas não implica motivo preenchido; pode reabrir.
UPDATE public.leads SET crm_outcome='lost',crm_archived_at=COALESCE(crm_archived_at,updated_at)
WHERE status='perdido' AND crm_outcome='open';

CREATE OR REPLACE FUNCTION public.crm_sync_conversion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.status='convertido' THEN
  NEW.crm_outcome='won'; NEW.crm_stage='matriculado'; NEW.crm_archived_at=COALESCE(NEW.crm_archived_at,now());
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS crm_lead_conversion ON public.leads;
CREATE TRIGGER crm_lead_conversion BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_conversion();

-- Próximo contato agendado: planejar, reagendar, concluir ou cancelar.
CREATE TABLE IF NOT EXISTS public.crm_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 due_on date NOT NULL,
 channel text NOT NULL DEFAULT 'WhatsApp' CHECK (channel IN ('WhatsApp','Ligação','E-mail','Outro')),
 note text,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','done','canceled')),
 done_on date,
 result_note text,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT crm_followup_done_date CHECK (state <> 'done' OR done_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS crm_followups_due_idx ON public.crm_followups(state,due_on);
CREATE INDEX IF NOT EXISTS crm_followups_lead_idx ON public.crm_followups(lead_id,created_at DESC);
DROP TRIGGER IF EXISTS crm_followups_updated ON public.crm_followups;
CREATE TRIGGER crm_followups_updated BEFORE UPDATE ON public.crm_followups
FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_at();
ALTER TABLE public.crm_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_followups_admin_select ON public.crm_followups;
CREATE POLICY crm_followups_admin_select ON public.crm_followups FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS crm_followups_admin_insert ON public.crm_followups;
CREATE POLICY crm_followups_admin_insert ON public.crm_followups FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS crm_followups_admin_update ON public.crm_followups;
CREATE POLICY crm_followups_admin_update ON public.crm_followups FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Agenda de entrevistas comerciais, sem substituir a ficha contratual.
CREATE TABLE IF NOT EXISTS public.crm_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 scheduled_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','completed','canceled','no_show')),
 teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
 note text,
 cancellation_reason text,
 finished_at timestamptz,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_one_scheduled_interview ON public.crm_appointments(lead_id) WHERE state='scheduled';
CREATE INDEX IF NOT EXISTS crm_appointments_calendar_idx ON public.crm_appointments(state,scheduled_at);
DROP TRIGGER IF EXISTS crm_appointments_updated ON public.crm_appointments;
CREATE TRIGGER crm_appointments_updated BEFORE UPDATE ON public.crm_appointments
FOR EACH ROW EXECUTE FUNCTION public.stamp_updated_at();
ALTER TABLE public.crm_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_appointments_admin_select ON public.crm_appointments;
CREATE POLICY crm_appointments_admin_select ON public.crm_appointments FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS crm_appointments_admin_insert ON public.crm_appointments;
CREATE POLICY crm_appointments_admin_insert ON public.crm_appointments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS crm_appointments_admin_update ON public.crm_appointments;
CREATE POLICY crm_appointments_admin_update ON public.crm_appointments FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Histórico de atividades: ações anexadas e nunca reescritas pelo painel.
CREATE TABLE IF NOT EXISTS public.crm_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('note','contact','followup','appointment','stage','archive','import','system')),
 title text NOT NULL,
 details text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activity_lead_idx ON public.crm_activities(lead_id,occurred_at DESC);
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_activities_admin_select ON public.crm_activities;
CREATE POLICY crm_activities_admin_select ON public.crm_activities FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS crm_activities_admin_insert ON public.crm_activities;
CREATE POLICY crm_activities_admin_insert ON public.crm_activities FOR INSERT TO authenticated WITH CHECK (public.is_admin());
-- Não há UPDATE ou DELETE para preservar o histórico do atendimento.

-- Integração com os passos de matrícula: status da ficha e envio de contrato.
CREATE OR REPLACE FUNCTION public.crm_interview_completed() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 UPDATE public.leads SET crm_stage='entrevista_realizada'
 WHERE id=NEW.lead_id AND crm_outcome='open'
 AND crm_stage NOT IN ('contrato_enviado','matriculado');
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS crm_interview_saved ON public.interviews;
CREATE TRIGGER crm_interview_saved AFTER INSERT OR UPDATE ON public.interviews
FOR EACH ROW EXECUTE FUNCTION public.crm_interview_completed();

CREATE OR REPLACE FUNCTION public.crm_contract_sent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.status='sent' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
  UPDATE public.leads SET crm_stage='contrato_enviado'
  WHERE id=NEW.lead_id AND crm_outcome='open';
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS crm_contract_link_sent ON public.contracts;
CREATE TRIGGER crm_contract_link_sent AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.crm_contract_sent();

COMMIT;

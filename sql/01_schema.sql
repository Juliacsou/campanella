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
 minor := (dob + interval '18 years')::date > current_date;
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

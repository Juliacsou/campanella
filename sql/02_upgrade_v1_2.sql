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

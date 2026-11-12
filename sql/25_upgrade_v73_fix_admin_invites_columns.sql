-- =============================================================================
-- Campanella V7.3 - Correção de Colunas da Tabela school_admin_invites
-- Garante a existência de token_hash, invite_token e created_by para convites
-- de administradores funcionarem mesmo se a tabela preexistia de versões anteriores
-- =============================================================================
begin;

set local check_function_bodies = false;

-- 1. Se a coluna legada 'token' existir com NOT NULL, remove a restrição
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'school_admin_invites' and column_name = 'token'
  ) then
    alter table public.school_admin_invites alter column token drop not null;
  end if;
end $$;

-- 2. Adiciona colunas esperadas pelo sistema de convites de administradores
alter table public.school_admin_invites
  add column if not exists token_hash text,
  add column if not exists invite_token text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- 3. Garante constraint UNIQUE para token_hash
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conrelid = 'public.school_admin_invites'::regclass and conname = 'school_admin_invites_token_hash_key'
  ) then
    alter table public.school_admin_invites add constraint school_admin_invites_token_hash_key unique (token_hash);
  end if;
end $$;

-- 4. Índices para performance
create index if not exists idx_school_admin_invites_school
  on public.school_admin_invites(school_id, created_at desc);

create index if not exists idx_school_admin_invites_email
  on public.school_admin_invites(lower(btrim(email)));

-- 5. Compatibilidade regressiva: sincroniza token com invite_token e invited_by com created_by se existirem
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'school_admin_invites' and column_name = 'token') then
    update public.school_admin_invites set invite_token = token where invite_token is null and token is not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'school_admin_invites' and column_name = 'invited_by') then
    update public.school_admin_invites set created_by = invited_by where created_by is null and invited_by is not null;
  end if;
end $$;

-- 6. Garantir permissões e RLS
alter table public.school_admin_invites enable row level security;

drop policy if exists "school_admin_invites_select" on public.school_admin_invites;
create policy "school_admin_invites_select"
  on public.school_admin_invites
  for select
  to authenticated
  using (public.is_school_admin(school_id) or public.is_platform_admin());

-- 7. Garantir permissões de execução das funções de checagem para todos os papéis
grant execute on function public.is_school_admin(uuid) to authenticated, anon, service_role;
grant execute on function public.is_school_member(uuid) to authenticated, anon, service_role;
grant execute on function public.is_school_super_admin(uuid) to authenticated, anon, service_role;
grant execute on function public.is_admin() to authenticated, anon, service_role;
grant execute on function public.is_staff() to authenticated, anon, service_role;
grant execute on function public.has_active_school_license(uuid) to authenticated, anon, service_role;

commit;


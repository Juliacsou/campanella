-- =============================================================================
-- Campanella V7.1 - Múltiplos Administradores por Escola, Administrador/Professor
-- Dual Role (em Configurações da Escola) e Correção de Convite Docente com E-mail Confirmado
-- =============================================================================
begin;

set local check_function_bodies = false;

-- 1. Funções de permissão: Administrador Super vs Administradores da Escola
create or replace function public.is_school_super_admin(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.schools s
    where s.id = p_school
      and s.admin_user_id = auth.uid()
  );
$$;

create or replace function public.is_school_admin(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.schools s
    where s.id = p_school
      and (
        s.admin_user_id = auth.uid()
        or exists(
          select 1
          from public.school_members m
          where m.school_id = s.id
            and m.user_id = auth.uid()
            and m.role = 'admin'
        )
      )
  );
$$;

create or replace function public.is_school_member(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_school_admin(p_school);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.schools s where s.admin_user_id = auth.uid()
  ) or exists(
    select 1 from public.school_members m where m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

-- Garantir que todo Administrador Super (schools.admin_user_id) esteja em school_members
insert into public.school_members (school_id, user_id, role)
select s.id, s.admin_user_id, 'admin'
from public.schools s
where s.admin_user_id is not null
on conflict (school_id, user_id) do update set role = 'admin';

-- 2. Restringir exclusão da escola e transferência de propriedade ao Administrador Super
drop function if exists public.schedule_school_deletion(uuid, text);
create or replace function public.schedule_school_deletion(p_school uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_school public.schools%rowtype;
  v_due timestamptz := now() + interval '30 days';
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta.';
  end if;

  select * into v_school
  from public.schools
  where id = p_school
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  if not (public.is_school_super_admin(p_school) or public.is_platform_admin()) then
    raise exception 'Somente o Administrador Super desta escola pode agendar a exclusão.';
  end if;

  if v_school.deletion_requested_at is not null then
    raise exception 'Esta escola já está com exclusão agendada.';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_school.name)) then
    raise exception 'Digite exatamente o nome da escola para confirmar a exclusão.';
  end if;

  update public.schools
  set deletion_requested_at = now(),
      deletion_due_at = v_due,
      deletion_requested_by = auth.uid()
  where id = p_school;

  update public.school_licenses
  set suspended_at = coalesce(suspended_at, now()),
      suspended_reason = 'Exclusão solicitada pelo administrador',
      updated_at = now()
  where school_id = p_school;

  perform public.log_license_event(
    p_school,
    null,
    'exclusao_agendada',
    jsonb_build_object('expira_em', v_due, 'observacao', 'Janela de restauração de 30 dias iniciada')
  );

  return jsonb_build_object('school_id', p_school, 'deletion_due_at', v_due);
end;
$$;

create or replace function public.transfer_school_admin(p_school uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target uuid;
  v_school public.schools%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  select * into v_school
  from public.schools
  where id = p_school
  for update;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  if not (public.is_school_super_admin(p_school) or public.is_platform_admin()) then
    raise exception 'Apenas o Administrador Super atual ou o gestor da plataforma pode transferir o cargo de Administrador Super.';
  end if;

  select id into v_target
  from public.profiles
  where lower(btrim(email)) = v_email;

  if v_target is null then
    raise exception 'O novo administrador precisa criar uma conta no Campanella antes da transferência.';
  end if;

  if v_target = v_school.admin_user_id then
    raise exception 'Este usuário já é o Administrador Super desta escola.';
  end if;

  update public.schools
  set admin_user_id = v_target
  where id = p_school;

  insert into public.school_members(school_id, user_id, role)
  values (p_school, v_target, 'admin')
  on conflict (school_id, user_id) do update set role = 'admin';

  insert into public.school_members(school_id, user_id, role)
  values (p_school, v_school.admin_user_id, 'admin')
  on conflict (school_id, user_id) do update set role = 'admin';

  perform public.log_license_event(
    p_school,
    null,
    'administrador_transferido',
    jsonb_build_object('novo_email', v_email, 'novo_admin', v_target, 'antigo_super_mantido_como_admin', v_school.admin_user_id)
  );
end;
$$;

-- 3. Tabela de convites de administradores da escola
create table if not exists public.school_admin_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null,
  full_name text not null,
  also_teacher boolean not null default false,
  token_hash text not null unique,
  invite_token text,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Garantir que as colunas existam mesmo se a tabela preexistia
alter table public.school_admin_invites
  add column if not exists token_hash text,
  add column if not exists invite_token text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'school_admin_invites' and column_name = 'token'
  ) then
    alter table public.school_admin_invites alter column token drop not null;
  end if;
  if not exists (
    select 1 from pg_constraint 
    where conrelid = 'public.school_admin_invites'::regclass and conname = 'school_admin_invites_token_hash_key'
  ) then
    alter table public.school_admin_invites add constraint school_admin_invites_token_hash_key unique (token_hash);
  end if;
end $$;

create index if not exists idx_school_admin_invites_school
  on public.school_admin_invites(school_id, created_at desc);

create index if not exists idx_school_admin_invites_email
  on public.school_admin_invites(lower(btrim(email)));

alter table public.school_admin_invites enable row level security;

drop policy if exists "school_admin_invites_select" on public.school_admin_invites;
create policy "school_admin_invites_select"
  on public.school_admin_invites
  for select
  to authenticated
  using (public.is_school_admin(school_id) or public.is_platform_admin());

-- Permissão para membros da escola verem os perfis dos demais administradores da mesma escola
drop policy if exists "profiles_select_same_school" on public.profiles;
create policy "profiles_select_same_school"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.school_members m1
      join public.school_members m2 on m2.school_id = m1.school_id
      where m1.user_id = auth.uid()
        and m1.role = 'admin'
        and m2.user_id = profiles.id
    )
  );

-- 4. RPC: Listar administradores, status de professor e convites pendentes da escola
drop function if exists public.school_admin_list(uuid);
create or replace function public.school_admin_list(p_school uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_school public.schools%rowtype;
  v_admins jsonb := '[]'::jsonb;
  v_invites jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if not (public.is_school_admin(p_school) or public.is_platform_admin()) then
    raise exception 'Sem permissão para consultar os administradores desta escola.';
  end if;

  select * into v_school
  from public.schools
  where id = p_school;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.is_super desc, q.created_at asc), '[]'::jsonb)
  into v_admins
  from (
    select
      m.user_id,
      coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(p.email, u.email, ''), '@', 1), 'Administrador') as full_name,
      lower(btrim(coalesce(p.email, u.email, ''))) as email,
      (m.user_id = v_school.admin_user_id) as is_super,
      m.created_at,
      t.id as teacher_id,
      coalesce(t.active, false) as is_teacher
    from public.school_members m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    left join lateral (
      select t1.id, t1.active
      from public.teachers t1
      where t1.school_id = p_school
        and lower(btrim(coalesce(t1.email, ''))) = lower(btrim(coalesce(p.email, u.email, '')))
      order by t1.active desc, t1.created_at asc
      limit 1
    ) t on true
    where m.school_id = p_school
      and m.role = 'admin'
  ) q;

  select coalesce(jsonb_agg(row_to_json(inv)::jsonb order by inv.created_at desc), '[]'::jsonb)
  into v_invites
  from (
    select
      i.id,
      i.full_name,
      i.email,
      i.also_teacher,
      i.invite_token,
      i.expires_at,
      i.created_at
    from public.school_admin_invites i
    where i.school_id = p_school
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  ) inv;

  return jsonb_build_object(
    'school_id', p_school,
    'super_admin_user_id', v_school.admin_user_id,
    'is_super_admin', (v_school.admin_user_id = auth.uid() or public.is_platform_admin()),
    'admins', v_admins,
    'invites', v_invites
  );
end;
$$;

-- 5. RPC: Alternar papel de professor para um administrador (Super ou convidado)
drop function if exists public.school_admin_toggle_teacher(uuid, uuid, boolean, text);
create or replace function public.school_admin_toggle_teacher(
  p_school uuid,
  p_user_id uuid,
  p_enable boolean default true,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_name text;
  v_teacher public.teachers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if not (public.is_school_super_admin(p_school) or public.is_platform_admin() or (public.is_school_admin(p_school) and p_user_id = auth.uid())) then
    raise exception 'Apenas o Administrador Super (ou o próprio administrador) pode alterar a habilitação como professor.';
  end if;

  if not exists (
    select 1 from public.school_members m
    where m.school_id = p_school and m.user_id = p_user_id and m.role = 'admin'
  ) then
    raise exception 'Este usuário não é administrador desta escola.';
  end if;

  select
    lower(btrim(coalesce(p.email, u.email, ''))),
    coalesce(nullif(btrim(p_name), ''), nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(p.email, u.email, ''), '@', 1), 'Professor')
  into v_email, v_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if coalesce(v_email, '') = '' then
    raise exception 'Não foi possível localizar o e-mail deste administrador.';
  end if;

  select * into v_teacher
  from public.teachers t
  where t.school_id = p_school
    and lower(btrim(coalesce(t.email, ''))) = v_email
  order by t.active desc, t.created_at asc
  limit 1
  for update;

  if p_enable then
    if v_teacher.id is null then
      insert into public.teachers (school_id, name, email, active)
      values (p_school, v_name, v_email, true)
      returning * into v_teacher;
    else
      update public.teachers
      set active = true,
          name = coalesce(nullif(btrim(p_name), ''), v_teacher.name)
      where id = v_teacher.id
      returning * into v_teacher;
    end if;

    -- Se a tabela de vínculos docentes do calendário V6 existir, vincula automaticamente o user_id
    if to_regclass('public.calendar_teacher_accounts') is not null then
      execute 'insert into public.calendar_teacher_accounts (school_id, teacher_id, user_id, email)
               values ($1, $2, $3, $4)
               on conflict (teacher_id) do update set user_id = excluded.user_id, email = excluded.email'
      using p_school, v_teacher.id, p_user_id, v_email;
    end if;
  else
    if v_teacher.id is not null then
      update public.teachers
      set active = false
      where id = v_teacher.id
      returning * into v_teacher;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'teacher_id', v_teacher.id,
    'is_teacher', coalesce(v_teacher.active, false)
  );
end;
$$;

-- 6. RPC: Convidar novo administrador da escola (exclusivo do Administrador Super)
drop function if exists public.school_admin_create_invite(uuid, text, text, boolean);
create or replace function public.school_admin_create_invite(
  p_school uuid,
  p_name text,
  p_email text,
  p_also_teacher boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_token text;
  v_hash text;
  v_existing_user uuid;
  v_invite public.school_admin_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if not (public.is_school_super_admin(p_school) or public.is_platform_admin()) then
    raise exception 'Somente o Administrador Super pode convidar outros administradores para a escola.';
  end if;

  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Informe o nome completo do administrador convidado.';
  end if;

  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Informe um e-mail válido para o convite.';
  end if;

  -- Verifica se já é administrador ativo da escola
  select p.id into v_existing_user
  from public.profiles p
  where lower(btrim(p.email)) = v_email
  limit 1;

  if v_existing_user is not null and exists (
    select 1 from public.school_members m
    where m.school_id = p_school and m.user_id = v_existing_user and m.role = 'admin'
  ) then
    if p_also_teacher then
      perform public.school_admin_toggle_teacher(p_school, v_existing_user, true, v_name);
    end if;
    return jsonb_build_object(
      'already_member', true,
      'user_id', v_existing_user,
      'email', v_email,
      'full_name', v_name,
      'also_teacher', p_also_teacher
    );
  end if;

  -- Revoga convites anteriores em aberto para este mesmo e-mail na escola
  update public.school_admin_invites
  set revoked_at = now()
  where school_id = p_school
    and lower(btrim(email)) = v_email
    and accepted_at is null
    and revoked_at is null;

  -- Gera token criptograficamente seguro via pg_catalog nativo sem depender de extensões externas
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := encode(sha256(convert_to(v_token, 'utf8')), 'hex');

  insert into public.school_admin_invites (
    school_id, email, full_name, also_teacher, token_hash, invite_token, expires_at, created_by
  ) values (
    p_school, v_email, v_name, coalesce(p_also_teacher, false), v_hash, v_token, now() + interval '14 days', auth.uid()
  )
  returning * into v_invite;

  -- Se já marcou que também será professor, garante o cadastro do professor na escola desde já
  if p_also_teacher then
    if not exists (
      select 1 from public.teachers t
      where t.school_id = p_school and lower(btrim(coalesce(t.email, ''))) = v_email
    ) then
      insert into public.teachers (school_id, name, email, active)
      values (p_school, v_name, v_email, true);
    else
      update public.teachers
      set active = true
      where school_id = p_school and lower(btrim(coalesce(email, ''))) = v_email;
    end if;
  end if;

  return jsonb_build_object(
    'already_member', false,
    'invite_id', v_invite.id,
    'token', v_token,
    'email', v_invite.email,
    'full_name', v_invite.full_name,
    'also_teacher', v_invite.also_teacher,
    'expires_at', v_invite.expires_at
  );
end;
$$;

-- 7. RPC: Visualizar convite de administrador (público via token)
drop function if exists public.school_admin_invite_preview(text);
create or replace function public.school_admin_invite_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clean text := split_part(split_part(split_part(btrim(coalesce(p_token, '')), '#', 1), '&', 1), '?', 1);
  v_hash text;
  v_invite public.school_admin_invites%rowtype;
  v_school_name text;
  v_user record;
begin
  if v_clean = '' then
    return null;
  end if;

  v_hash := encode(sha256(convert_to(v_clean, 'utf8')), 'hex');

  select * into v_invite
  from public.school_admin_invites i
  where i.token_hash = v_hash
    and i.revoked_at is null
    and i.expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  select s.name into v_school_name
  from public.schools s
  where s.id = v_invite.school_id;

  select u.id, (u.email_confirmed_at is not null) as email_confirmed
  into v_user
  from auth.users u
  where lower(btrim(u.email)) = lower(btrim(v_invite.email))
  limit 1;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'school_id', v_invite.school_id,
    'school_name', coalesce(v_school_name, 'Escola Campanella'),
    'full_name', v_invite.full_name,
    'email', v_invite.email,
    'also_teacher', v_invite.also_teacher,
    'already_accepted', (v_invite.accepted_at is not null),
    'account_exists', (v_user.id is not null),
    'email_confirmed', coalesce(v_user.email_confirmed, false)
  );
end;
$$;

-- 8. RPC: Aceitar convite de administrador
drop function if exists public.school_admin_accept_invite(text);
create or replace function public.school_admin_accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clean text := split_part(split_part(split_part(btrim(coalesce(p_token, '')), '#', 1), '&', 1), '?', 1);
  v_hash text;
  v_invite public.school_admin_invites%rowtype;
  v_my_email text;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  if v_clean = '' then
    raise exception 'Token de convite inválido.';
  end if;

  v_hash := encode(sha256(convert_to(v_clean, 'utf8')), 'hex');

  select * into v_invite
  from public.school_admin_invites i
  where i.token_hash = v_hash
    and i.revoked_at is null
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'O convite expirou, foi revogado ou não existe.';
  end if;

  select lower(btrim(coalesce(u.email, p.email, '')))
  into v_my_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid();

  if v_my_email <> lower(btrim(v_invite.email)) then
    raise exception 'Este convite foi enviado exclusivamente para %.', v_invite.email;
  end if;

  insert into public. profiles (id, email)
  values (auth.uid(), v_my_email)
  on conflict (id) do update set email = excluded.email;

  insert into public.school_members (school_id, user_id, role)
  values (v_invite.school_id, auth.uid(), 'admin')
  on conflict (school_id, user_id) do update set role = 'admin';

  if v_invite.also_teacher then
    perform public.school_admin_toggle_teacher(v_invite.school_id, auth.uid(), true, v_invite.full_name);
  end if;

  update public.school_admin_invites
  set accepted_at = coalesce(accepted_at, now()),
      accepted_by = coalesce(accepted_by, auth.uid())
  where id = v_invite.id;

  return jsonb_build_object(
    'ok', true,
    'school_id', v_invite.school_id,
    'also_teacher', v_invite.also_teacher
  );
end;
$$;

-- 9. RPC: Remover administrador convidado ou revogar convite (exclusivo do Administrador Super)
drop function if exists public.school_admin_remove_member(uuid, uuid);
create or replace function public.school_admin_remove_member(p_school uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_school public.schools%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if not (public.is_school_super_admin(p_school) or public.is_platform_admin()) then
    raise exception 'Somente o Administrador Super pode remover outros administradores.';
  end if;

  select * into v_school
  from public.schools
  where id = p_school;

  if not found then
    raise exception 'Escola não encontrada.';
  end if;

  if p_user_id = v_school.admin_user_id then
    raise exception 'O Administrador Super não pode ser removido. Para alterar o Administrador Super, utilize a transferência de titularidade.';
  end if;

  delete from public.school_members
  where school_id = p_school
    and user_id = p_user_id
    and role = 'admin';

  return jsonb_build_object('ok', true, 'removed_user_id', p_user_id);
end;
$$;

drop function if exists public.school_admin_revoke_invite(uuid, uuid);
create or replace function public.school_admin_revoke_invite(p_school uuid, p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if not (public.is_school_super_admin(p_school) or public.is_platform_admin()) then
    raise exception 'Somente o Administrador Super pode revogar convites de administrador.';
  end if;

  update public.school_admin_invites
  set revoked_at = now()
  where id = p_invite_id
    and school_id = p_school
    and accepted_at is null;

  return jsonb_build_object('ok', true, 'invite_id', p_invite_id);
end;
$$;

-- 10. RPC: Auto-ativar convites pendentes (administrador e professor) para o e-mail já autenticado
-- Resolve definitivamente casos em que o usuário confirmou o e-mail e depois entrou pelo login ou reabriu o link.
drop function if exists public.accept_my_pending_invites();
create or replace function public.accept_my_pending_invites()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_my_email text;
  v_admin_count int := 0;
  v_teacher_count int := 0;
  r_adm record;
begin
  if auth.uid() is null then
    return jsonb_build_object('admin_accepted', 0, 'teacher_accepted', 0);
  end if;

  select lower(btrim(coalesce(u.email, p.email, '')))
  into v_my_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid();

  if coalesce(v_my_email, '') = '' then
    return jsonb_build_object('admin_accepted', 0, 'teacher_accepted', 0);
  end if;

  insert into public.profiles (id, email)
  values (auth.uid(), v_my_email)
  on conflict (id) do update set email = excluded.email;

  -- Ativa convites de administrador pendentes para este e-mail
  for r_adm in
    select *
    from public.school_admin_invites i
    where lower(btrim(i.email)) = v_my_email
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
  loop
    insert into public.school_members (school_id, user_id, role)
    values (r_adm.school_id, auth.uid(), 'admin')
    on conflict (school_id, user_id) do update set role = 'admin';

    if r_adm.also_teacher then
      perform public.school_admin_toggle_teacher(r_adm.school_id, auth.uid(), true, r_adm.full_name);
    end if;

    update public.school_admin_invites
    set accepted_at = now(),
        accepted_by = auth.uid()
    where id = r_adm.id;

    v_admin_count := v_admin_count + 1;
  end loop;

  -- Se o módulo de convites docentes do calendário V6 existir, ativa convites docentes pendentes do mesmo e-mail
  if to_regclass('public.calendar_teacher_invites') is not null and to_regclass('public.calendar_teacher_accounts') is not null then
    execute $dyn$
      with pending as (
        update public.calendar_teacher_invites i
        set used_at = coalesce(i.used_at, now()),
            accepted_user_id = coalesce(i.accepted_user_id, auth.uid())
        from public.teachers t
        where i.teacher_id = t.id
          and i.revoked_at is null
          and i.used_at is null
          and i.expires_at > now()
          and lower(btrim(coalesce(i.email, t.email, ''))) = $1
        returning i.school_id, i.teacher_id, lower(btrim(coalesce(i.email, t.email, ''))) as email
      ),
      linked as (
        insert into public.calendar_teacher_accounts (school_id, teacher_id, user_id, email)
        select distinct p.school_id, p.teacher_id, auth.uid(), p.email
        from pending p
        on conflict (teacher_id) do update
          set user_id = excluded.user_id,
              email = excluded.email
        returning 1
      )
      select count(*)::int from linked
    $dyn$ into v_teacher_count using v_my_email;
  end if;

  return jsonb_build_object(
    'admin_accepted', v_admin_count,
    'teacher_accepted', v_teacher_count
  );
end;
$$;

-- 11. Tornar calendar_invite_preview e calendar_accept_invite tolerantes a sufixos de hash (#access_token, #error)
-- e permitir reabertura do link após confirmação do e-mail sem exibir falso "Link expirado"
do $v71_cal$
begin
  if to_regclass('public.calendar_teacher_invites') is not null then
    execute $fn1$
      create or replace function public.calendar_invite_preview(p_token text)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public, extensions
      as $body$
      declare
        v_clean text := split_part(split_part(split_part(btrim(coalesce(p_token, '')), '#', 1), '&', 1), '?', 1);
        v_hash text;
        v_inv record;
        v_user record;
      begin
        if v_clean = '' then
          return null;
        end if;
        v_hash := encode(sha256(convert_to(v_clean, 'utf8')), 'hex');

        select
          i.id,
          i.school_id,
          i.teacher_id,
          i.used_at,
          i.expires_at,
          coalesce(i.email, t.email) as email,
          t.name as teacher_name,
          s.name as school_name
        into v_inv
        from public.calendar_teacher_invites i
        join public.teachers t on t.id = i.teacher_id
        join public.schools s on s.id = i.school_id
        where i.token_hash = v_hash
          and i.revoked_at is null
          and i.expires_at > now()
        limit 1;

        if not found then
          return null;
        end if;

        select u.id, (u.email_confirmed_at is not null) as email_confirmed
        into v_user
        from auth.users u
        where lower(btrim(u.email)) = lower(btrim(v_inv.email))
        limit 1;

        -- Mesmo que used_at já tenha sido preenchido (ex.: scanner de e-mail ou clique prévio),
        -- retornamos os metadados do convite dentro do prazo de validade para permitir login imediato.
        return jsonb_build_object(
          'school_id', v_inv.school_id,
          'school_name', v_inv.school_name,
          'teacher_id', v_inv.teacher_id,
          'teacher_name', v_inv.teacher_name,
          'email', v_inv.email,
          'already_used', (v_inv.used_at is not null),
          'account_exists', (v_user.id is not null),
          'email_confirmed', coalesce(v_user.email_confirmed, false)
        );
      end;
      $body$;
    $fn1$;

    execute $fn2$
      create or replace function public.calendar_accept_invite(p_token text)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public, extensions
      as $body$
      declare
        v_clean text := split_part(split_part(split_part(btrim(coalesce(p_token, '')), '#', 1), '&', 1), '?', 1);
        v_hash text;
        v_inv record;
        v_email text;
      begin
        if auth.uid() is null then
          raise exception 'Autenticação necessária.';
        end if;
        if v_clean = '' then
          raise exception 'Convite inválido.';
        end if;
        v_hash := encode(sha256(convert_to(v_clean, 'utf8')), 'hex');

        select i.*, coalesce(i.email, t.email) as target_email
        into v_inv
        from public.calendar_teacher_invites i
        join public.teachers t on t.id = i.teacher_id
        where i.token_hash = v_hash
          and i.revoked_at is null
          and i.expires_at > now()
        for update;

        if not found then
          raise exception 'Convite inválido ou expirado.';
        end if;

        select lower(btrim(email)) into v_email
        from auth.users
        where id = auth.uid();

        if v_email is distinct from lower(btrim(v_inv.target_email)) then
          raise exception 'Use o mesmo e-mail convidado pela escola (%).', v_inv.target_email;
        end if;

        insert into public.calendar_teacher_accounts (school_id, teacher_id, user_id, email)
        values (v_inv.school_id, v_inv.teacher_id, auth.uid(), v_email)
        on conflict (teacher_id) do update
          set user_id = excluded.user_id,
              email = excluded.email;

        update public.calendar_teacher_invites
        set used_at = coalesce(used_at, now()),
            accepted_user_id = coalesce(accepted_user_id, auth.uid())
        where id = v_inv.id;

        return jsonb_build_object(
          'school_id', v_inv.school_id,
          'teacher_id', v_inv.teacher_id
        );
      end;
      $body$;
    $fn2$;
  end if;
end;
$v71_cal$;

grant execute on function public.is_school_super_admin(uuid) to authenticated;
grant execute on function public.school_admin_list(uuid) to authenticated;
grant execute on function public.school_admin_toggle_teacher(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.school_admin_create_invite(uuid, text, text, boolean) to authenticated;
grant execute on function public.school_admin_invite_preview(text) to anon, authenticated;
grant execute on function public.school_admin_accept_invite(text) to authenticated;
grant execute on function public.school_admin_remove_member(uuid, uuid) to authenticated;
grant execute on function public.school_admin_revoke_invite(uuid, uuid) to authenticated;
grant execute on function public.accept_my_pending_invites() to authenticated;

commit;

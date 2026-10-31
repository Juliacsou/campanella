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

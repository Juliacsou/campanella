import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createCalendar} from '../js/calendar-v6.js';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const calCode = fs.readFileSync(new URL('../js/calendar-v6.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../sql/23_upgrade_v71_multi_admins_e_convites.sql', import.meta.url), 'utf8');

// 1. Verificar contrato SQL V7.1
for (const fn of [
  'public.is_school_super_admin(p_school uuid)',
  'public.is_school_admin(p_school uuid)',
  'public.school_admin_list(p_school uuid)',
  'public.school_admin_toggle_teacher(',
  'public.school_admin_create_invite(',
  'public.school_admin_invite_preview(p_token text)',
  'public.school_admin_accept_invite(p_token text)',
  'public.school_admin_remove_member(p_school uuid, p_user_id uuid)',
  'public.school_admin_revoke_invite(p_school uuid, p_invite_id uuid)',
  'public.accept_my_pending_invites()',
  'public.calendar_invite_preview(p_token text)',
  'public.calendar_accept_invite(p_token text)'
]) {
  assert.ok(sql.includes(fn), `Falta função SQL: ${fn}`);
}
assert.ok(sql.includes('create table if not exists public.school_admin_invites'));

// 2. Garantir que Administradores está em Configurações (settings-admin) e NÃO no menu lateral (navGroups)
const navGroupsBlock = app.slice(app.indexOf('const navGroups='), app.indexOf('const nav=navGroups'));
assert.ok(!/administrador/i.test(navGroupsBlock), 'Administradores não deve aparecer no menu lateral navGroups');
assert.ok(app.includes("['settings-admin','profile','Administradores e permissões'"));
assert.ok(app.includes('inviteAdminForm') && app.includes('adminToggleTeacher') && app.includes('removeSchoolAdmin'));

// 3. Testar renderização de Configurações -> Administradores e permissões (Super Admin vs Admin convidado + Professor)
const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx = {
  ui: {
    page: 'settings-admin',
    user: {id: 'u1', email: 'super@escola.com', user_metadata: {full_name: 'Super Diretora'}},
    schoolId: 's1',
    role: 'admin',
    schools: [{id: 's1', name: 'Escola Campanella', admin_user_id: 'u1'}],
    isPlatformAdmin: false,
    schoolLicense: {school_id: 's1', kind: 'paga', expires_on: '2027-12-31'},
    licenseActive: true,
    schoolMembers: [{user_id: 'u1', role: 'admin'}, {user_id: 'u2', role: 'admin'}],
    schoolAdmins: {
      school_id: 's1',
      super_admin_user_id: 'u1',
      is_super_admin: true,
      admins: [
        {user_id: 'u1', full_name: 'Super Diretora', email: 'super@escola.com', is_super: true, is_teacher: true, teacher_id: 't1'},
        {user_id: 'u2', full_name: 'Coordenador Convidado', email: 'coord@escola.com', is_super: false, is_teacher: false, teacher_id: null}
      ],
      invites: [
        {id: 'inv1', full_name: 'Novo Admin', email: 'novo@escola.com', also_teacher: true, invite_token: 'tok_adm_1', expires_at: '2027-01-15'}
      ]
    },
    teacherAccess: [{school_id: 's1', teacher_id: 't1', school_name: 'Escola Campanella'}]
  },
  safe,
  today: () => '2026-11-10',
  dateBR: v => v ? `${v.slice(8,10)}/${v.slice(5,7)}/${v.slice(0,4)}` : '—',
  input: (title, name, value = '') => `<label>${safe(title)}<input name="${name}" value="${safe(value)}"></label>`,
  heading: (e, h, t, a = '') => `<header><h1>${h}</h1><p>${t}</p>${a}</header>`,
  card: (t, b) => `<section><h2>${t}</h2>${b}</section>`,
  table: (hs, rows, empty = '') => `<table><thead><tr>${hs.map(x => '<th>' + x + '</th>').join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`,
  row: cells => '<tr>' + cells.map(x => '<td>' + x + '</td>').join('') + '</tr>',
  db: {teachers: [{id: 't1', name: 'Super Diretora', email: 'super@escola.com', active: true}], profiles: []},
  lookup: () => null,
  currentSchool: () => ctx.ui.schools[0],
  schoolLicense: () => ctx.ui.schoolLicense,
  fullSchoolStatus: () => '<span>Ativa</span>',
  licenseExpiration: () => '31/12/2027',
  canAdmin: () => true,
  roleName: () => 'Administrador Super'
};
const v = vm.createContext(ctx);
const runBlock = (start, end) => vm.runInContext(app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start))), v);
runBlock('// SVGs internos', 'function currentSchool()');
runBlock('const profileSections=', 'function activationModal()');

const adminSettingsHtml = vm.runInContext('settingsView()', v);
assert.ok(adminSettingsHtml.includes('Administrador Super'));
assert.ok(adminSettingsHtml.includes('Coordenador Convidado'));
assert.ok(adminSettingsHtml.includes('Também é professor'));
assert.ok(adminSettingsHtml.includes('Tornar professor'));
assert.ok(adminSettingsHtml.includes('Desativar como professor'));
assert.ok(adminSettingsHtml.includes('Remover admin'));
assert.ok(adminSettingsHtml.includes('inviteAdminForm'));
assert.ok(adminSettingsHtml.includes('copyAdminInviteLink'));

// Quando logado como Administrador convidado (não Super), não deve exibir formulário de convidar nem botão de remover outros admins
ctx.ui.user = {id: 'u2', email: 'coord@escola.com', user_metadata: {full_name: 'Coordenador Convidado'}};
const regularAdminHtml = vm.runInContext('settingsView()', v);
assert.ok(!regularAdminHtml.includes('id="inviteAdminForm"'), 'Admin convidado não deve ver formulário de convidar administradores');
assert.ok(!regularAdminHtml.includes('data-action="removeSchoolAdmin"'), 'Admin convidado não deve poder remover administradores');
assert.ok(regularAdminHtml.includes('data-action="adminToggleTeacher" data-id="u2"'), 'Admin convidado pode habilitar a si mesmo como professor');

// 4. Testar fluxo de confirmação de e-mail do convite de professor (sem falso "link expirado")
assert.ok(calCode.includes("'?professor='+encodeURIComponent(token)"), 'emailRedirectTo do professor deve usar query string ?professor= para não colidir com #access_token');

const appNode = {innerHTML: ''};
const storage = new Map();
globalThis.localStorage = {
  getItem: k => storage.get(k) || null,
  setItem: (k, val) => storage.set(k, String(val)),
  removeItem: k => storage.delete(k)
};
globalThis.document = {
  getElementById: id => id === 'app' ? appNode : null,
  querySelectorAll: () => []
};
globalThis.location = {origin: 'https://juliacsou.github.io', pathname: '/campanella/', href: 'https://juliacsou.github.io/campanella/'};
globalThis.history = {replaceState: () => {}};

let previewShouldReturnNull = false;
const sbMock = {
  rpc: async (fn, args) => {
    if (fn === 'calendar_invite_preview') {
      // Garantir que sufixos #access_token ou #error foram removidos antes da chamada RPC
      assert.equal(args.p_token, 'tok_prof_123');
      if (previewShouldReturnNull) return {data: null, error: null};
      return {
        data: {
          school_id: 's1',
          school_name: 'Escola Campanella',
          teacher_id: 't2',
          teacher_name: 'Prof. Lucas',
          email: 'lucas@escola.com',
          account_exists: true,
          email_confirmed: true
        },
        error: null
      };
    }
    return {data: [], error: null};
  }
};

const calendar = createCalendar({
  sb: sbMock,
  ui: {role: null, schools: []},
  db: {teachers: []},
  safe,
  dateBR: v => v,
  today: () => '2026-11-10',
  showModal: () => {},
  closeModal: () => {},
  toast: () => {},
  refresh: async () => {},
  render: () => {},
  initialize: async () => {},
  authWrap: html => `<div class="auth">${html}</div>`,
  lookup: () => null,
  canAdmin: () => false
});

// Caso 4A: Token sujo com segundo hash (#error=access_denied&error_code=otp_expired) vindo da confirmação de e-mail
await calendar.inviteLanding('tok_prof_123#error=access_denied&error_code=otp_expired', null, {emailConfirmed: true});
assert.ok(appNode.innerHTML.includes('E-mail confirmado!'), 'Deve mostrar mensagem de E-mail confirmado');
assert.ok(appNode.innerHTML.includes('calTeacherLogin'), 'Deve mostrar formulário de login docente');
assert.ok(!appNode.innerHTML.includes('Convite indisponível'), 'NÃO deve mostrar Convite indisponível / link expirado');

// Caso 4B: Mesmo que calendar_invite_preview retorne null após confirmação de e-mail, não deve bloquear o professor com erro de link expirado
previewShouldReturnNull = true;
await calendar.inviteLanding('tok_prof_123', null, {emailConfirmed: true});
assert.ok(appNode.innerHTML.includes('Acesse seu calendário docente'), 'Deve permitir login direto quando e-mail já foi confirmado');
assert.ok(appNode.innerHTML.includes('calTeacherLogin'));
assert.ok(!appNode.innerHTML.includes('Convite indisponível'));

console.log('OK: V7.1 multi-administradores (Super Admin + Admin convidado + Professor) em Configurações e confirmação de e-mail de convite sem falso link expirado.');

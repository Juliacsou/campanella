import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from '/tmp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import assert from 'assert';

const ROOT_DIR = process.cwd();
const PORT = 8000;

// 1. Static file server
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end(data);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

await new Promise(resolve => server.listen(PORT, '0.0.0.0', resolve));
console.log(`Servidor local rodando em http://localhost:${PORT}`);

// Read env for access token
let SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_ACCESS_TOKEN) {
  try {
    const envContent = fs.readFileSync('/home/antigravity/.env', 'utf8');
    const m = envContent.match(/SUPABASE_ACCESS_TOKEN=([^\s\r\n]+)/);
    if (m) SUPABASE_ACCESS_TOKEN = m[1];
  } catch (_) {}
}

const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'tyxmskdgbnrcaacwwkhi';

async function sqlQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SQL query failed (${res.status}): ${txt}`);
  }
  return res.json();
}

async function cleanupTestData() {
  console.log('--- Limpando dados de teste (TESTE DEV%) ---');
  await sqlQuery(`
    DELETE FROM public.calendar_lessons WHERE contract_id IN (
      SELECT id FROM public.contracts WHERE student_id IN (
        SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%'
      ) OR student2_id IN (
        SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%'
      ) OR lead_id IN (
        SELECT id FROM public.leads WHERE name ILIKE 'TESTE DEV%'
      )
    );
    DELETE FROM public.contracts WHERE student_id IN (
      SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%'
    ) OR student2_id IN (
      SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%'
    ) OR lead_id IN (
      SELECT id FROM public.leads WHERE name ILIKE 'TESTE DEV%'
    );
    UPDATE public.students SET lead_id = NULL WHERE full_name ILIKE 'TESTE DEV%';
    DELETE FROM public.interviews WHERE lead_id IN (
      SELECT id FROM public.leads WHERE name ILIKE 'TESTE DEV%'
    );
    DELETE FROM public.students WHERE full_name ILIKE 'TESTE DEV%';
    DELETE FROM public.leads WHERE name ILIKE 'TESTE DEV%';
    DELETE FROM public.calendar_blocks WHERE reason ILIKE 'TESTE DEV%';
  `);
  const check = await sqlQuery(`
    SELECT
      (SELECT count(*) FROM public.students WHERE full_name ILIKE 'TESTE DEV%') as students,
      (SELECT count(*) FROM public.leads WHERE name ILIKE 'TESTE DEV%') as leads,
      (SELECT count(*) FROM public.contracts WHERE student_id IN (SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%')) as contracts,
      (SELECT count(*) FROM public.calendar_blocks WHERE reason ILIKE 'TESTE DEV%') as blocks;
  `);
  console.log('✓ Status pós-limpeza:', check);
}

// 2. Fetch session for Julia
console.log('Obtendo credenciais Supabase...');
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys`, {
  headers: { 'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}` }
});
const keys = await keysRes.json();
const serviceRole = keys.find(k => k.name === 'service_role')?.api_key;
assert.ok(serviceRole, 'Chave service_role deve existir');

const linkRes = await fetch(`https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    'apikey': serviceRole,
    'Authorization': `Bearer ${serviceRole}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'magiclink',
    email: 'julia.correa.souza@gmail.com'
  })
});
const linkData = await linkRes.json();
const getRes = await fetch(linkData.action_link, { redirect: 'manual' });
const locationHeader = getRes.headers.get('location') || '';
const hashIdx = locationHeader.indexOf('#');
assert.ok(hashIdx !== -1, 'Location header deve conter hash de autenticação');
const authHash = locationHeader.slice(hashIdx);

console.log('Sessão gerada.');

// 3. Launch browser
console.log('Iniciando Google Chrome headless...');
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  protocolTimeout: 120000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-gpu', '--headless=new'],
  defaultViewport: { width: 1280, height: 900 }
});

const page = await browser.newPage();

const consoleErrors = [];
page.on('console', msg => {
  const text = msg.text();
  if (msg.type() === 'error') {
    consoleErrors.push(text);
    console.error(`[CONSOLE ERROR]:`, text);
  }
});

page.on('pageerror', err => {
  consoleErrors.push(err.message);
  console.error(`[PAGE ERROR]: ${err.message}`);
});

let lastDialogMessage = '';
page.on('dialog', async dialog => {
  lastDialogMessage = dialog.message();
  console.log(`[DIALOG ${dialog.type()}]: ${dialog.message()}`);
  await dialog.accept();
});

try {
  await cleanupTestData();

  console.log(`Carregando http://localhost:${PORT}/ com authHash...`);
  await page.goto(`http://localhost:${PORT}/${authHash}`);

  let appReady = false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.waitForSelector('#app .shell', { timeout: 12000 });
      appReady = true;
      break;
    } catch (e) {
      const errText = await page.evaluate(() => document.body.textContent || '');
      if (errText.includes('Falha de inicialização') || errText.includes('Failed to fetch') || errText.includes('Recarregar página')) {
        console.log(`Tentativa ${attempt}: recarregando página após erro de rede transitório...`);
        await page.reload();
      } else if (attempt === 4) {
        const html = await page.evaluate(() => document.body.innerHTML);
        console.error('HTML atual:', html.slice(0, 1000));
        throw e;
      }
    }
  }
  assert.ok(appReady, 'Aplicação deve estar pronta com #app .shell');
  console.log('✓ Aplicação iniciada com sucesso!');

  const bridgeCheck = await page.evaluate(() => {
    return {
      hasBridge: !!window.campanellaTest,
      schoolId: window.campanellaTest?.ui?.schoolId,
      schoolName: window.campanellaTest?.ui?.schools?.find(s => s.id === window.campanellaTest?.ui?.schoolId)?.name
    };
  });
  console.log('Bridge ativa:', bridgeCheck);
  const schoolId = bridgeCheck.schoolId;

  async function waitForNotBusy() {
    await page.waitForFunction(() => !window.campanellaTest?.isBusy?.(), { timeout: 15000 });
  }

  async function domClick(sel) {
    await waitForNotBusy();
    await page.waitForFunction(s => !!document.querySelector(s), { timeout: 10000 }, sel);
    await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('Elemento não encontrado: ' + s);
      el.click();
    }, sel);
  }

  async function pickTeacherAndFreeSlot(page) {
    const teacherId = await page.evaluate(() => {
      const f = document.querySelector('#manualEnrollmentForm');
      const teacherSelect = f?.elements?.teacher_id;
      if (!teacherSelect) return null;
      const opt = [...teacherSelect.options].find(o => o.text.includes('Ana') || o.text.includes('Syrius') || o.text.includes('Julia'));
      if (opt) teacherSelect.value = opt.value;
      else if (teacherSelect.options.length > 1) teacherSelect.selectedIndex = 1;
      teacherSelect.dispatchEvent(new Event('change', { bubbles: true }));
      return teacherSelect.value;
    });
    console.log('Professor selecionado:', teacherId);
    await new Promise(r => setTimeout(r, 1200));
    await waitForNotBusy();

    const slotSelected = await page.evaluate(() => {
      const form = document.querySelector('#manualEnrollmentForm');
      // Desmarcar qualquer slot já selecionado
      form.querySelectorAll('input[name="cal_slot"]:checked').forEach(input => {
        input.checked = false;
        input.closest('.cal-wpicker-event')?.classList.remove('is-selected');
        input.parentElement?.querySelector('button')?.setAttribute('aria-pressed', 'false');
      });
      // Selecionar o primeiro evento disponível que não esteja ocupado (is-busy) nem travado (is-locked)
      const btn = form.querySelector('.cal-wpicker-event:not(.is-busy):not(.is-locked) button[data-weekly-slot-toggle]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('Horário livre clicado:', slotSelected);
    await new Promise(r => setTimeout(r, 1000));
    await waitForNotBusy();
  }

  // =========================================================================
  // TESTE 1: Parte A - Remoção da seção Regras das Configurações
  // =========================================================================
  console.log('\n--- TESTE 1: Remoção da seção Regras das Configurações ---');
  await domClick('button[data-action="navigate"][data-page="settings"]');
  await waitForNotBusy();

  const rulesCheck = await page.evaluate(() => {
    const navText = document.querySelector('.settings-secondary-sidebar')?.textContent || '';
    const hasRulesLink = navText.includes('Regras de aulas') || navText.includes('Regras de matrícula');
    const settingsPanel = document.querySelector('#settingsEnrollmentRulesForm, #enrollmentRulesForm');
    return { hasRulesLink, hasSettingsPanel: !!settingsPanel };
  });
  assert.strictEqual(rulesCheck.hasRulesLink, false, 'Regras de aulas não deve aparecer na barra de Configurações');
  assert.strictEqual(rulesCheck.hasSettingsPanel, false, 'Painel de regras de matrícula não deve existir');
  console.log('✓ Seção Regras não está mais em Configurações.');

  // =========================================================================
  // TESTE 2: Parte B - D42 & D44 - Salvar matrícula em andamento no primeiro clique
  // =========================================================================
  console.log('\n--- TESTE 2: D42 & D44 - Salvar matrícula em andamento no primeiro clique ---');
  const insRes = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email)
    VALUES ('${schoolId}', 'TESTE DEV ONGOING 1', '11988887771', '11144477735', 'testedev1@exemplo.com')
    RETURNING id;
  `);
  const student1Id = insRes[0]?.id;
  await page.evaluate(async () => {
    try {
      await window.campanellaTest.refresh();
    } catch (e) {
      throw new Error('Erro no refresh: ' + (e?.message || JSON.stringify(e)));
    }
  });
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.studentDetail(id), student1Id);
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.manualEnrollmentForm(id, 'ongoing'), student1Id);
  await waitForNotBusy();
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.elements.start_date.value = '2026-10-01';
    f.elements.schedule_from_date.value = '2026-11-01';
    f.elements.end_date.value = '2027-05-30';
    f.elements.lessons_count.value = '30';
    f.elements.remaining_lessons.value = '15';
    f.elements.total_amount.value = '3000';
    f.elements.installments.value = '6';
  });

  await pickTeacherAndFreeSlot(page);

  console.log('Clicando em Avançar para revisão...');
  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    const btn = f.querySelector('button[type="submit"]');
    btn.click();
  });

  await waitForNotBusy();
  await page.waitForSelector('#btnConfirmActivateOngoing', { timeout: 10000 });
  console.log('Etapa 2 de revisão exibida com sucesso.');

  console.log('Testando primeiro clique e duplo clique em Ativar...');
  const activateResult = await page.evaluate(async () => {
    const btn = document.querySelector('#btnConfirmActivateOngoing');
    const wasDisabledBefore = btn.disabled;
    btn.click();
    const isDisabledAfter = btn.disabled;
    btn.click(); // segundo clique imediato
    return { wasDisabledBefore, isDisabledAfter };
  });

  console.log('Botão no clique:', activateResult);
  assert.strictEqual(activateResult.isDisabledAfter, true, 'Botão deve desabilitar imediatamente no primeiro clique');

  await page.waitForFunction(() => !document.querySelector('#modal')?.open, { timeout: 20000 });
  await waitForNotBusy();

  const contractsCheck = await sqlQuery(`
    SELECT count(*) as count, max(enrollment_origin) as origin, max(status) as status
    FROM public.contracts
    WHERE student_id = '${student1Id}';
  `);
  console.log('Contratos salvos para Aluno 1:', contractsCheck);
  assert.strictEqual(Number(contractsCheck[0].count), 1, 'Exatamente 1 contrato deve ter sido criado');
  assert.strictEqual(contractsCheck[0].origin, 'ongoing', 'Contrato deve ser do tipo ongoing');
  assert.strictEqual(contractsCheck[0].status, 'signed', 'Contrato deve estar assinado');
  console.log('✓ D42 & D44: Matrícula em andamento salva com sucesso no primeiro clique e idempotente!');

  // =========================================================================
  // TESTE 3: Parte B - D33 & D44 - Aluno sem lead vinculado e deduplicação
  // =========================================================================
  console.log('\n--- TESTE 3: D33 & D44 - Aluno sem lead vinculado ---');
  const insRes2 = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email)
    VALUES ('${schoolId}', 'TESTE DEV SEM LEAD', '11988887772', '22244477735', 'testedev2@exemplo.com')
    RETURNING id;
  `);
  const student2Id = insRes2[0]?.id;

  await page.evaluate(() => window.campanellaTest.refresh());
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.studentDetail(id), student2Id);
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.manualEnrollmentForm(id), student2Id);
  await waitForNotBusy();
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.elements.enrollment_mode.value = 'custom';
    f.elements.enrollment_mode.dispatchEvent(new Event('change', { bubbles: true }));

    f.elements.start_date.value = '2026-12-01';
    f.elements.lessons_count.value = '4';
    f.elements.total_amount.value = '500';
    f.elements.installments.value = '1';
    f.elements.installment_amount.value = '500';
    if (f.elements.type_option) {
      const opt = [...f.elements.type_option.options].find(o => o.value === 'preexisting' || o.value.startsWith('custom:'));
      if (opt) f.elements.type_option.value = opt.value;
      f.elements.type_option.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await pickTeacherAndFreeSlot(page);

  const validity = await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    const invalidFields = [...f.elements].filter(el => !el.checkValidity()).map(el => ({ name: el.name, validationMessage: el.validationMessage }));
    return { isValid: f.checkValidity(), invalidFields };
  });
  console.log('Validação do formulário TESTE 3:', validity);

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    const btn = f.querySelector('button[type="submit"]');
    btn.click();
  });

  await new Promise(r => setTimeout(r, 2500));
  await waitForNotBusy();

  const formErr = await page.evaluate(() => {
    return document.querySelector('#manualEnrollmentForm .form-submit-error-banner')?.textContent || null;
  });
  if (formErr) {
    console.error('Erro exibido no formulário:', formErr);
  }

  const leadCheck = await sqlQuery(`
    SELECT l.id, l.name, l.source FROM public.leads l
    JOIN public.students s ON s.lead_id = l.id
    WHERE s.id = '${student2Id}';
  `);
  console.log('Lead criado para aluno sem lead anterior:', leadCheck);
  assert.strictEqual(leadCheck.length, 1, 'Lead deve ter sido criado e vinculado');
  assert.strictEqual(leadCheck[0].source, 'manual', 'Lead source deve ser manual');
  console.log('✓ D33: Aluno sem lead salva normalmente sem erro de source!');
  await page.evaluate(() => window.campanellaTest.closeModal?.());
  await waitForNotBusy();

  // =========================================================================
  // TESTE 4: Parte B - D45 - Recorrência trava em remaining_lessons
  // =========================================================================
  console.log('\n--- TESTE 4: D45 - Modo recorrência trava em remaining_lessons ---');
  const insRes3 = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email)
    VALUES ('${schoolId}', 'TESTE DEV RECORRENCIA', '11988887773', '33344477735', 'testedev3@exemplo.com')
    RETURNING id;
  `);
  const student3Id = insRes3[0]?.id;

  await page.evaluate(() => window.campanellaTest.refresh());
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.studentDetail(id), student3Id);
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.manualEnrollmentForm(id, 'ongoing'), student3Id);
  await waitForNotBusy();
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    const modeSelect = f.elements.enrollment_mode;
    modeSelect.value = 'recurrence';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    f.elements.start_date.value = '2026-10-01';
    f.elements.schedule_from_date.value = '2026-11-01';
    f.elements.end_date.value = '2027-05-30';
    f.elements.lessons_count.value = '8';
    f.elements.remaining_lessons.value = '8'; // SALDO = 8
    f.elements.total_amount.value = '2400';
    f.elements.installments.value = '6';
    f.elements.installment_amount.value = '400';
  });

  await pickTeacherAndFreeSlot(page);

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.querySelector('button[type="submit"]').click();
  });

  await waitForNotBusy();

  const v4 = await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    const invalidFields = f ? [...f.elements].filter(el => !el.checkValidity()).map(el => ({ name: el.name, validationMessage: el.validationMessage })) : [];
    const banner = f?.querySelector?.('.form-submit-error-banner')?.textContent;
    return { isValid: f ? f.checkValidity() : true, invalidFields, banner };
  });
  if (!v4.isValid || v4.banner) console.log('Validação TESTE 4:', v4);

  await page.waitForSelector('#btnConfirmActivateOngoing', { timeout: 10000 });

  await page.evaluate(() => document.querySelector('#btnConfirmActivateOngoing').click());
  await page.waitForFunction(() => !document.querySelector('#modal')?.open, { timeout: 20000 });
  await waitForNotBusy();

  const lessonsCheck = await sqlQuery(`
    SELECT count(*) as count, max((c.terms->>'lessons_count')::int) as contract_lessons_count
    FROM public.calendar_lessons cl
    JOIN public.contracts c ON c.id = cl.contract_id
    WHERE c.student_id = '${student3Id}';
  `);
  console.log('Aulas agendadas no modo recorrência:', lessonsCheck);
  assert.strictEqual(Number(lessonsCheck[0].count), 8, 'Devem ser agendadas exatamente 8 aulas (saldo restante)');
  console.log('✓ D45: Modo recorrência respeitou estritamente remaining_lessons (8 aulas agendadas)!');

  // =========================================================================
  // TESTE 5: Parte B - D46 & D43 - Troca de modo preserva término e campos editáveis
  // =========================================================================
  console.log('\n--- TESTE 5: D46 & D43 - Troca de modo preserva término e campos editáveis ---');
  await page.evaluate(id => window.campanellaTest.manualEnrollmentForm(id, 'ongoing'), student3Id);
  await waitForNotBusy();
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 10000 });

  const modeSwitchCheck = await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.elements.end_date.value = '2026-12-15';
    f.elements.end_date.dispatchEvent(new Event('input', { bubbles: true }));

    f.elements.enrollment_mode.value = 'recurrence';
    f.elements.enrollment_mode.dispatchEvent(new Event('change', { bubbles: true }));
    const endAfterRecurrence = f.elements.end_date.value;

    f.elements.enrollment_mode.value = 'custom';
    f.elements.enrollment_mode.dispatchEvent(new Event('change', { bubbles: true }));
    const endAfterCustom = f.elements.end_date.value;

    const isStartEditable = !f.elements.start_date.disabled && !f.elements.start_date.readOnly;
    const isEndEditable = !f.elements.end_date.disabled && !f.elements.end_date.readOnly;

    return { endAfterRecurrence, endAfterCustom, isStartEditable, isEndEditable };
  });

  console.log('Teste de troca de modo e campos editáveis:', modeSwitchCheck);
  assert.strictEqual(modeSwitchCheck.endAfterRecurrence, '2026-12-15', 'Término deve ser preservado ao mudar para Recorrência');
  assert.strictEqual(modeSwitchCheck.endAfterCustom, '2026-12-15', 'Término deve ser preservado ao mudar para Personalizado');
  assert.strictEqual(modeSwitchCheck.isStartEditable, true, 'Data de início deve permanecer editável');
  assert.strictEqual(modeSwitchCheck.isEndEditable, true, 'Data de término deve permanecer editável');
  console.log('✓ D46 & D43: Troca de modo preserva término e campos continuam editáveis!');

  await page.evaluate(() => window.campanellaTest.closeModal?.());
  await waitForNotBusy();

  // =========================================================================
  // TESTE 6: Parte B - D31 - Alerta de saldo excessivo e checkbox
  // =========================================================================
  console.log('\n--- TESTE 6: D31 - Alerta de saldo excessivo ---');
  const insRes4 = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email)
    VALUES ('${schoolId}', 'TESTE DEV SALDO EXCESSIVO', '11988887774', '44444477735', 'testedev4@exemplo.com')
    RETURNING id;
  `);
  const student4Id = insRes4[0]?.id;

  await page.evaluate(() => window.campanellaTest.refresh());
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.studentDetail(id), student4Id);
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.manualEnrollmentForm(id, 'ongoing'), student4Id);
  await waitForNotBusy();
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.elements.start_date.value = '2026-10-01';
    f.elements.schedule_from_date.value = '2026-11-01';
    f.elements.end_date.value = '2027-05-30';
    f.elements.lessons_count.value = '10'; // CONTRATADAS = 10
    f.elements.remaining_lessons.value = '15'; // RESTANTES = 15 (> 10!)
    f.elements.total_amount.value = '1500';
    f.elements.installments.value = '3';
    f.elements.installment_amount.value = '500';
  });

  await pickTeacherAndFreeSlot(page);

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.querySelector('button[type="submit"]').click();
  });

  await waitForNotBusy();
  await page.waitForSelector('#btnConfirmActivateOngoing', { timeout: 10000 });

  const excessiveCheck = await page.evaluate(() => {
    const box = document.querySelector('#confirmExcessiveBalance');
    const notice = document.querySelector('.excessive-balance-notice');
    return { hasCheckbox: !!box, hasNotice: !!notice, isChecked: box?.checked };
  });

  console.log('Card de saldo excessivo:', excessiveCheck);
  assert.strictEqual(excessiveCheck.hasCheckbox, true, 'Deve exigir checkbox para saldo excessivo');
  assert.strictEqual(excessiveCheck.isChecked, false, 'Checkbox deve começar desmarcado');

  const blockedActivation = await page.evaluate(() => {
    const btn = document.querySelector('#btnConfirmActivateOngoing');
    btn.click();
    return { modalStillOpen: document.querySelector('#modal')?.open };
  });
  assert.strictEqual(blockedActivation.modalStillOpen, true, 'Ativação deve ser bloqueada sem o checkbox');

  await page.evaluate(() => {
    document.querySelector('#confirmExcessiveBalance').checked = true;
    document.querySelector('#btnConfirmActivateOngoing').click();
  });

  await page.waitForFunction(() => !document.querySelector('#modal')?.open, { timeout: 20000 });
  await waitForNotBusy();
  console.log('✓ D31: Alerta de saldo excessivo bloqueou sem confirmação e ativou com confirmação!');

  // =========================================================================
  // TESTE 7: Parte B - D38 & D41 - Aulas antes da implantação no perfil e db.contracts
  // =========================================================================
  console.log('\n--- TESTE 7: D38 & D41 - Aulas antes da implantação no perfil ---');
  const insRes5 = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email)
    VALUES ('${schoolId}', 'TESTE DEV PERFIL DONE BEFORE', '11988887775', '55544477735', 'testedev5@exemplo.com')
    RETURNING id;
  `);
  const student5Id = insRes5[0]?.id;

  await page.evaluate(() => window.campanellaTest.refresh());
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.studentDetail(id), student5Id);
  await waitForNotBusy();

  await page.evaluate(id => window.campanellaTest.manualEnrollmentForm(id, 'ongoing'), student5Id);
  await waitForNotBusy();
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.elements.start_date.value = '2026-09-01';
    f.elements.schedule_from_date.value = '2026-11-01';
    f.elements.end_date.value = '2027-05-30';
    f.elements.lessons_count.value = '30';
    f.elements.remaining_lessons.value = '10';
    f.elements.lessons_done_before.value = '10';
    f.elements.total_amount.value = '3000';
    f.elements.installments.value = '6';
    f.elements.installment_amount.value = '500';
  });

  await pickTeacherAndFreeSlot(page);

  await page.evaluate(() => {
    const f = document.querySelector('#manualEnrollmentForm');
    f.querySelector('button[type="submit"]').click();
  });

  await waitForNotBusy();
  await page.waitForSelector('#btnConfirmActivateOngoing', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#btnConfirmActivateOngoing').click());

  await page.waitForFunction(() => !document.querySelector('#modal')?.open, { timeout: 20000 });
  await waitForNotBusy();

  const profileMetrics = await page.evaluate(() => {
    const text = document.querySelector('.cal-profile-page')?.textContent || '';
    const hasDoneBeforeMetric = text.includes('10') && (text.includes('Antes da implantação') || text.includes('Realizadas antes do início'));
    const hasContractListed = text.includes('30 aula(s) contratada(s)') || text.includes('1 matrícula(s) vinculada(s)');
    return { hasDoneBeforeMetric, hasContractListed, fullText: text.slice(0, 500) };
  });

  console.log('Métricas do perfil:', profileMetrics);
  assert.strictEqual(profileMetrics.hasDoneBeforeMetric, true, 'Perfil deve exibir aulas antes da implantação');
  assert.strictEqual(profileMetrics.hasContractListed, true, 'Perfil deve exibir a matrícula ativada sem reload (D41)');
  console.log('✓ D38 & D41: Perfil exibiu 10 antes da implantação e listou contrato imediatamente!');

  // =========================================================================
  // TESTE 8: Parte B - D36 & D37 & D47 - Bloqueio futuro 0 aulas e Bloqueio passado
  // =========================================================================
  console.log('\n--- TESTE 8: D36, D37 & D47 - Bloqueios de aulas ---');
  await domClick('button[data-action="navigate"][data-page="calendar"]');
  await waitForNotBusy();

  await domClick('button[data-action="calTeacherPage"][data-page="blocks"]');
  await waitForNotBusy();

  const blocksPageText = await page.evaluate(() => {
    return document.querySelector('.cal-section')?.textContent || '';
  });
  assert.strictEqual(blocksPageText.includes('A reagendar a A reagendar'), false, 'Não deve exibir texto corrompido A reagendar a A reagendar');
  console.log('✓ D47: Listagem de bloqueios não tem texto corrompido.');

  // Criar bloqueio futuro onde não há aulas (D36)
  console.log('Criando bloqueio futuro em período sem aulas (D36)...');
  await domClick('button[data-action="calNewBlock"]');
  await waitForNotBusy();
  await page.waitForSelector('#calBlockForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#calBlockForm');
    f.elements.from.value = '2028-05-01';
    f.elements.to.value = '2028-05-05';
    f.elements.reason_preset.value = 'Recesso';
    f.querySelector('button[type="submit"]').click();
  });

  await page.waitForSelector('.camp-app-dialog', { timeout: 10000 });
  const confirmText1 = await page.evaluate(() => document.querySelector('.camp-app-dialog')?.textContent || '');
  console.log('Mensagem de confirmação recebida:', confirmText1);
  assert.ok(confirmText1.includes('Nenhuma aula será afetada'), 'D36: Confirmação deve informar que nenhuma aula será afetada');
  await page.evaluate(() => document.querySelector('.camp-app-dialog button[data-choice="1"]')?.click());

  await page.waitForFunction(() => !document.querySelector('#modal')?.open, { timeout: 20000 });
  await waitForNotBusy();

  // Criar bloqueio no passado (A.3)
  console.log('Criando bloqueio histórico no passado (A.3)...');
  await domClick('button[data-action="calNewBlock"]');
  await waitForNotBusy();
  await page.waitForSelector('#calBlockForm', { timeout: 10000 });

  await page.evaluate(() => {
    const f = document.querySelector('#calBlockForm');
    f.elements.from.value = '2026-01-01';
    f.elements.to.value = '2026-01-10';
    f.elements.reason_preset.value = 'Férias';
    f.querySelector('button[type="submit"]').click();
  });

  await page.waitForSelector('.camp-app-dialog', { timeout: 10000 });
  const confirmText2 = await page.evaluate(() => document.querySelector('.camp-app-dialog')?.textContent || '');
  console.log('Mensagem de confirmação bloqueio passado:', confirmText2);
  assert.ok(confirmText2.includes('bloqueio é inteiramente no passado'), 'A.3: Confirmação deve indicar bloqueio no passado');
  await page.evaluate(() => document.querySelector('.camp-app-dialog button[data-choice="1"]')?.click());

  await page.waitForFunction(() => !document.querySelector('#modal')?.open, { timeout: 20000 });
  await waitForNotBusy();

  const pastBlockCheck = await sqlQuery(`
    SELECT id, reason, start_date, end_date FROM public.calendar_blocks
    WHERE school_id = '${schoolId}' AND start_date = '2026-01-01' AND end_date = '2026-01-10';
  `);
  console.log('Bloqueio passado no banco:', pastBlockCheck);
  assert.strictEqual(pastBlockCheck.length, 1, 'Bloqueio passado deve ter sido criado com sucesso');
  console.log('✓ Parte A.3: Bloqueio no passado criado e salvo com sucesso via calendário escolar normal!');

  // =========================================================================
  // TESTE 9: Limpeza final completa
  // =========================================================================
  console.log('\n--- TESTE 9: Limpeza final de dados de teste (0 resíduos) ---');
  await sqlQuery(`
    DELETE FROM public.calendar_blocks WHERE school_id = '${schoolId}' AND (
      (start_date = '2026-01-01' AND end_date = '2026-01-10') OR
      (start_date = '2028-05-01' AND end_date = '2028-05-05')
    );
  `);
  await cleanupTestData();

  const finalCheck = await sqlQuery(`
    SELECT
      (SELECT count(*) FROM public.students WHERE full_name ILIKE 'TESTE DEV%') as students,
      (SELECT count(*) FROM public.leads WHERE name ILIKE 'TESTE DEV%') as leads,
      (SELECT count(*) FROM public.contracts WHERE student_id IN (SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%')) as contracts;
  `);
  console.log('Resíduos pós-teste no banco de dados:', finalCheck);
  assert.strictEqual(Number(finalCheck[0].students), 0, 'Zero alunos TESTE DEV devem restar');
  assert.strictEqual(Number(finalCheck[0].leads), 0, 'Zero leads TESTE DEV devem restar');
  assert.strictEqual(Number(finalCheck[0].contracts), 0, 'Zero contratos TESTE DEV devem restar');
  console.log('✓ 100% dos dados de teste limpos! Banco de dados sem resíduos.');

  console.log('\n=======================================================');
  console.log('TODOS OS TESTES DA SUÍTE FORAM EXECUTADOS COM SUCESSO!');
  console.log('=======================================================');

} finally {
  await browser.close();
  server.close();
}

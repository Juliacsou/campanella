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
console.log(`Local test server running at http://localhost:${PORT}`);

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
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
  console.log('--- Limpando dados de teste (TESTE DEV) ---');
  await sqlQuery(`
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
  `);
  const check = await sqlQuery(`
    SELECT count(*) as students_count FROM public.students WHERE full_name ILIKE 'TESTE DEV%';
    SELECT count(*) as leads_count FROM public.leads WHERE name ILIKE 'TESTE DEV%';
    SELECT count(*) as contracts_count FROM public.contracts WHERE student_id IN (
      SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%'
    );
  `);
  console.log('✓ Limpeza concluída no banco de dados:', check);
}

// 2. Fetch session for Julia (School Admin of Escola principal)
console.log('Obtendo credenciais e chave service_role...');
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

console.log('Sessão de autenticação gerada com sucesso.');

// 3. Launch browser
console.log('Iniciando Google Chrome headless...');
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  protocolTimeout: 60000,
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
  } else {
    console.log(`[CONSOLE ${msg.type()}]:`, text);
  }
});

page.on('pageerror', err => {
  consoleErrors.push(err.message);
  console.error(`[PAGE ERROR]: ${err.message}`);
});

page.on('requestfailed', req => {
  console.error(`[REQUEST FAILED]: ${req.url()} (${req.failure()?.errorText})`);
});

try {
  // Ensure starting with clean state
  await cleanupTestData();

  const authParams = new URLSearchParams(authHash.replace(/^#/, ''));
  const accessToken = authParams.get('access_token');
  const refreshToken = authParams.get('refresh_token');

  console.log(`Configurando sessão de autenticação no navegador...`);
  await page.evaluateOnNewDocument(({ accessToken, refreshToken }) => {
    localStorage.setItem('sb-tyxmskdgbnrcaacwwkhi-auth-token', JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }));
  }, { accessToken, refreshToken });

  console.log(`Navegando para http://localhost:${PORT}/...`);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 35000 });

  // Wait for shell to render
  try {
    await page.waitForSelector('#app .shell', { timeout: 30000 });
    console.log('✓ Aplicação inicializada com sucesso no navegador!');
  } catch (err) {
    const appHtml = await page.evaluate(() => document.querySelector('#app')?.innerHTML || '');
    console.error('Falha ao encontrar #app .shell. HTML atual de #app:\n', appHtml.slice(0, 1000));
    throw err;
  }

  // Verify campanellaTest bridge
  const bridgeCheck = await page.evaluate(() => {
    return {
      hasBridge: !!window.campanellaTest,
      schoolId: window.campanellaTest?.ui?.schoolId,
      schoolName: window.campanellaTest?.ui?.schools?.find(s => s.id === window.campanellaTest?.ui?.schoolId)?.name
    };
  });
  console.log('Bridge de teste disponível:', bridgeCheck);
  assert.ok(bridgeCheck.hasBridge, 'window.campanellaTest deve estar disponível');
  assert.ok(bridgeCheck.schoolId, 'Deve haver uma escola ativa');

  // Helper to wait for any background operations
  async function waitForNotBusy() {
    await page.waitForFunction(() => {
      return !window.campanellaTest?.isBusy?.();
    }, { timeout: 15000 });
  }

  // Helper for DOM clicks
  async function domClick(sel) {
    await waitForNotBusy();
    await page.waitForFunction(s => !!document.querySelector(s), { timeout: 10000 }, sel);
    await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('Element not found: ' + s);
      el.click();
    }, sel);
  }

  async function fillFormAndSelectSlot(opts = {}) {
    await page.evaluate(async (opts) => {
      const f = document.getElementById('manualEnrollmentForm');
      if (opts.isOngoing) {
        if (opts.schedule_from_date) f.elements.schedule_from_date.value = opts.schedule_from_date;
        if (opts.remaining_lessons != null) f.elements.remaining_lessons.value = String(opts.remaining_lessons);
        if (opts.lessons_done_before != null) f.elements.lessons_done_before.value = String(opts.lessons_done_before);
        if (opts.remaining_source) f.elements.remaining_source.value = opts.remaining_source;
      }

      f.elements.enrollment_mode.value = opts.enrollment_mode || 'custom';
      f.elements.enrollment_mode.dispatchEvent(new Event('change', { bubbles: true }));

      const teacherOpt = Array.from(f.elements.teacher_id.options).find(o => o.text.includes('Ana') || o.value === 'ad1dd498-09e5-46e3-9dee-f3b7a6a697a1') || Array.from(f.elements.teacher_id.options).find(o => o.value);
      if (teacherOpt) {
        f.elements.teacher_id.value = teacherOpt.value;
        f.elements.teacher_id.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Wait for weekly picker slots
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 150));
        const btn = f.querySelector('.cal-wpicker-event:not(.is-busy) button[data-weekly-slot-toggle]') || f.querySelector('.cal-wpicker-event button[data-weekly-slot-toggle]');
        if (btn) {
          btn.click();
          break;
        }
      }

      // Check slot radio if not checked
      const checkedSlot = f.querySelector('input[name="cal_slot"]:checked');
      if (!checkedSlot) {
        const slotRadio = f.querySelector('input[name="cal_slot"]');
        if (slotRadio) {
          slotRadio.checked = true;
          slotRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      if (opts.lessons_count) {
        f.elements.lessons_count.readOnly = false;
        f.elements.lessons_count.value = opts.lessons_count;
        f.elements.lessons_count.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (opts.start_date) {
        f.elements.start_date.value = opts.start_date;
        f.elements.start_date.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (opts.end_date) {
        f.elements.end_date.value = opts.end_date;
        f.elements.end_date.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (opts.total_amount) f.elements.total_amount.value = opts.total_amount;
      if (opts.installments) f.elements.installments.value = opts.installments;
      if (opts.installment_amount) f.elements.installment_amount.value = opts.installment_amount;

      const ctOpt = Array.from(f.elements.type_option.options).find(o => o.value && o.value !== 'preexisting');
      if (ctOpt) f.elements.type_option.value = ctOpt.value;
      f.elements.type_option.dispatchEvent(new Event('change', { bubbles: true }));
    }, opts);
  }

  // Navigate to Alunos directory
  console.log('Navegando para página de Alunos...');
  await domClick('button[data-action="navigate"][data-page="directory"]');
  await page.waitForSelector('button[data-action="editStudent"]', { timeout: 8000 });
  console.log('✓ Página de Alunos carregada.');

  // =========================================================================
  // CENÁRIO 1: Salvar matrícula NOVA de aluno SEM lead vinculado (Bug D33)
  // =========================================================================
  console.log('\n--- CENÁRIO 1: Salvar matrícula NOVA de aluno SEM lead vinculado ---');
  // 1.1 Criar aluno de teste sem lead vinculado via "Novo aluno" com after_create = none
  await domClick('button[data-action="editStudent"]');
  await page.waitForSelector('#studentForm', { timeout: 5000 });

  await page.evaluate(() => {
    const f = document.getElementById('studentForm');
    f.elements.full_name.value = 'TESTE DEV SEM LEAD';
    f.elements.phone.value = '11988887771';
    f.elements.cpf.value = '';
    f.elements.email.value = 'testedev1@exemplo.com';
    // Selecionar professora Ana (com horários livres)
    const teacherOpt = Array.from(f.elements.calendar_teacher_id.options).find(o => o.text.includes('Ana') || o.value === 'ad1dd498-09e5-46e3-9dee-f3b7a6a697a1') || Array.from(f.elements.calendar_teacher_id.options).find(o => o.value);
    if (teacherOpt) f.elements.calendar_teacher_id.value = teacherOpt.value;
    // after_create = none
    const radNone = f.querySelector('input[name="after_create"][value="none"]');
    if (radNone) radNone.checked = true;
    f.requestSubmit();
  });

  // Aguardar modal fechar
  await page.waitForFunction(() => {
    const m = document.querySelector('#modal');
    return !m || !m.open;
  }, { timeout: 10000 });
  console.log('Aluno TESTE DEV SEM LEAD cadastrado com sucesso.');

  // Conferir no banco que o aluno foi criado com lead_id = null
  const checkSemLead = await sqlQuery(`SELECT id, full_name, lead_id FROM public.students WHERE full_name = 'TESTE DEV SEM LEAD';`);
  assert.ok(checkSemLead.length > 0, 'Aluno TESTE DEV SEM LEAD deve existir no banco');
  assert.strictEqual(checkSemLead[0].lead_id, null, 'Aluno inicial deve ter lead_id = null');
  const studentSemLeadId = checkSemLead[0].id;

  // 1.2 Abrir perfil do aluno
  await domClick('button[data-action="studentTab"][data-tab="none"]');
  await domClick(`button[data-action="studentDetail"][data-id="${studentSemLeadId}"]`);
  await page.waitForSelector('button[data-action="manualEnrollment"]', { timeout: 8000 });
  console.log('Perfil do aluno aberto.');

  // 1.3 Clicar em "Criar matrícula"
  await domClick('button[data-action="manualEnrollment"]');
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 5000 });
  console.log('Formulário manualEnrollmentForm aberto.');

  // 1.4 Preencher o formulário
  await fillFormAndSelectSlot({
    lessons_count: '12',
    start_date: '2026-12-01',
    end_date: '2027-03-31',
    total_amount: '1200',
    installments: '6',
    installment_amount: '200'
  });

  // 1.5 Submeter o formulário
  console.log('Submetendo manualEnrollmentForm...');
  await page.evaluate(() => {
    document.getElementById('manualEnrollmentForm').requestSubmit();
  });

  // Aguardar fechamento do modal e conclusão do refresh
  await page.waitForFunction(() => {
    const m = document.querySelector('#modal');
    return !m || !m.open;
  }, { timeout: 10000 });
  await waitForNotBusy();
  console.log('✓ manualEnrollmentForm submetido com sucesso sem erro!');

  // 1.6 Conferir no banco de dados que o lead foi criado com source: 'manual' e vinculado ao aluno e contrato
  const dbCheck1 = await sqlQuery(`
    SELECT s.id as student_id, s.full_name, s.lead_id, l.source as lead_source, l.crm_source, c.id as contract_id, c.status as contract_status
    FROM public.students s
    JOIN public.leads l ON l.id = s.lead_id
    JOIN public.contracts c ON c.student_id = s.id
    WHERE s.id = '${studentSemLeadId}';
  `);
  console.log('Dados gravados no banco para Cenário 1:', dbCheck1);
  assert.ok(dbCheck1.length > 0, 'Registro deve existir no banco');
  assert.strictEqual(dbCheck1[0].lead_source, 'manual', 'Lead criado deve ter source = manual');
  assert.strictEqual(dbCheck1[0].crm_source, 'manual', 'Lead criado deve ter crm_source = manual');
  assert.strictEqual(dbCheck1[0].contract_status, 'pre_enrolled', 'Contrato deve ter status = pre_enrolled');

  // 1.7 Gerar o contrato depois de salvar e verificar se PDF é retornado
  console.log('Testando geração de PDF do contrato salvo...');
  const pdfGen1 = await page.evaluate(async (contractId) => {
    try {
      await window.campanellaTest.refresh();
      const c = window.campanellaTest.lookup('contracts', contractId);
      if (!c) throw new Error('Contrato não encontrado em db.contracts após refresh');
      const html = window.campanellaTest.manualContractHTML(c);
      const base64 = await window.campanellaTest.contractPdfBase64(html);
      return {
        success: true,
        base64Length: base64.length,
        isPdf: atob(base64.slice(0, 50)).startsWith('%PDF-')
      };
    } catch (e) {
      return { error: e.message };
    }
  }, dbCheck1[0].contract_id);
  console.log('Resultado da geração de PDF:', pdfGen1);
  assert.ok(pdfGen1.success, `Falha na geração de PDF: ${pdfGen1.error}`);
  assert.ok(pdfGen1.isPdf, 'PDF gerado deve ter cabeçalho %PDF-');
  console.log('✓ Geração de PDF do contrato validada com sucesso!');

  // =========================================================================
  // CENÁRIO 2: Salvar matrícula NOVA de aluno COM lead vinculado
  // =========================================================================
  console.log('\n--- CENÁRIO 2: Salvar matrícula NOVA de aluno COM lead vinculado ---');
  const schoolId = bridgeCheck.schoolId;
  const leadInsert = await sqlQuery(`
    INSERT INTO public.leads (school_id, name, phone, status, source, crm_source)
    VALUES ('${schoolId}', 'TESTE DEV COM LEAD', '11988887772', 'novo', 'crm', 'crm')
    RETURNING id;
  `);
  const leadId2 = leadInsert[0].id;
  const studentInsert2 = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email, lead_id, calendar_teacher_id)
    VALUES ('${schoolId}', 'TESTE DEV COM LEAD', '11988887772', null, 'testedev2@exemplo.com', '${leadId2}', 'ad1dd498-09e5-46e3-9dee-f3b7a6a697a1')
    RETURNING id;
  `);
  const studentComLeadId = studentInsert2[0].id;
  console.log('Aluno com lead pré-existente criado no banco:', studentComLeadId, 'lead_id:', leadId2);

  // Recarregar dados no app
  await page.evaluate(async () => {
    await window.campanellaTest.refresh();
  });

  // Navegar para directory e abrir perfil
  await domClick('button[data-action="navigate"][data-page="directory"]');
  await domClick('button[data-action="studentTab"][data-tab="none"]');
  await domClick(`button[data-action="studentDetail"][data-id="${studentComLeadId}"]`);
  await page.waitForSelector('button[data-action="manualEnrollment"]', { timeout: 8000 });

  await domClick('button[data-action="manualEnrollment"]');
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 5000 });

  await fillFormAndSelectSlot({
    lessons_count: '10',
    start_date: '2026-12-01',
    end_date: '2027-02-28',
    total_amount: '1000',
    installments: '5',
    installment_amount: '200'
  });

  console.log('Submetendo manualEnrollmentForm (Aluno com lead)...');
  await page.evaluate(() => {
    document.getElementById('manualEnrollmentForm').requestSubmit();
  });

  await page.waitForFunction(() => {
    const m = document.querySelector('#modal');
    return !m || !m.open;
  }, { timeout: 10000 });
  await waitForNotBusy();
  console.log('✓ Matrícula NOVA de aluno COM lead vinculado salva com sucesso!');

  // =========================================================================
  // CENÁRIO 3: Matrícula EM ANDAMENTO via botão do perfil
  // =========================================================================
  console.log('\n--- CENÁRIO 3: Matrícula EM ANDAMENTO via botão do perfil ---');
  const studentInsert3 = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, phone, cpf, email, calendar_teacher_id)
    VALUES ('${schoolId}', 'TESTE DEV ONGOING PERFIL', '11988887773', null, 'testedev3@exemplo.com', 'ad1dd498-09e5-46e3-9dee-f3b7a6a697a1')
    RETURNING id;
  `);
  const studentOngoingPerfilId = studentInsert3[0].id;
  console.log('Aluno criado para matrícula em andamento via perfil:', studentOngoingPerfilId);

  await page.evaluate(async () => {
    await window.campanellaTest.refresh();
  });

  await domClick('button[data-action="navigate"][data-page="directory"]');
  await domClick('button[data-action="studentTab"][data-tab="none"]');
  await domClick(`button[data-action="studentDetail"][data-id="${studentOngoingPerfilId}"]`);
  await page.waitForSelector('button[data-action="manualOngoingEnrollment"]', { timeout: 8000 });

  // Clicar em "Cadastrar matrícula em andamento"
  await domClick('button[data-action="manualOngoingEnrollment"]');
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 5000 });

  await fillFormAndSelectSlot({
    isOngoing: true,
    schedule_from_date: '2026-12-01',
    remaining_lessons: '8',
    lessons_done_before: '16',
    remaining_source: 'manual',
    lessons_count: '24',
    start_date: '2026-08-01',
    end_date: '2027-02-28',
    total_amount: '2400',
    installments: '6',
    installment_amount: '400'
  });

  console.log('Submetendo para tela de revisão de matrícula em andamento...');
  await page.evaluate(() => {
    document.getElementById('manualEnrollmentForm').requestSubmit();
  });

  await domClick('#btnConfirmActivateOngoing');

  await page.waitForFunction(() => {
    const m = document.querySelector('#modal');
    return !m || !m.open;
  }, { timeout: 10000 });
  await waitForNotBusy();

  const dbCheck3 = await sqlQuery(`
    SELECT s.id as student_id, s.full_name, s.lead_id, l.source as lead_source, l.crm_source, c.id as contract_id, c.status as contract_status, c.enrollment_origin, (c.terms->>'remaining_lessons')::int as remaining_lessons
    FROM public.students s
    JOIN public.leads l ON l.id = s.lead_id
    JOIN public.contracts c ON c.student_id = s.id
    WHERE s.id = '${studentOngoingPerfilId}';
  `);
  console.log('Dados gravados no banco para Cenário 3:', dbCheck3);
  assert.ok(dbCheck3.length > 0, 'Registro deve existir no banco');
  assert.strictEqual(dbCheck3[0].lead_source, 'implantacao', 'Lead criado deve ter source = implantacao');
  assert.strictEqual(dbCheck3[0].crm_source, 'implantacao', 'Lead criado deve ter crm_source = implantacao');
  assert.strictEqual(dbCheck3[0].contract_status, 'signed', 'Contrato deve ser ativado com status = signed');
  assert.strictEqual(dbCheck3[0].enrollment_origin, 'ongoing', 'Contrato deve ter enrollment_origin = ongoing');
  assert.strictEqual(Number(dbCheck3[0].remaining_lessons), 8, 'Contrato deve ter remaining_lessons = 8');
  console.log('✓ Matrícula EM ANDAMENTO via botão do perfil salva e ativada com sucesso!');

  // =========================================================================
  // CENÁRIO 4: Matrícula EM ANDAMENTO via Novo aluno > "Salvar cadastro e cadastrar matrícula em andamento"
  // =========================================================================
  console.log('\n--- CENÁRIO 4: Matrícula EM ANDAMENTO via Novo aluno > "Salvar cadastro e cadastrar matrícula em andamento" ---');
  await waitForNotBusy();
  await domClick('button[data-action="navigate"][data-page="directory"]');
  await waitForNotBusy();
  await domClick('button[data-action="editStudent"]');
  await page.waitForSelector('#studentForm', { timeout: 8000 });

  await page.evaluate(() => {
    const f = document.getElementById('studentForm');
    f.elements.full_name.value = 'TESTE DEV ONGOING NOVO ALUNO';
    f.elements.phone.value = '11988887774';
    f.elements.cpf.value = '';
    f.elements.email.value = 'testedev4@exemplo.com';

    const teacherOpt = Array.from(f.elements.calendar_teacher_id.options).find(o => o.text.includes('Ana') || o.value === 'ad1dd498-09e5-46e3-9dee-f3b7a6a697a1') || Array.from(f.elements.calendar_teacher_id.options).find(o => o.value);
    if (teacherOpt) f.elements.calendar_teacher_id.value = teacherOpt.value;

    const radOngoing = f.querySelector('input[name="after_create"][value="ongoing"]');
    if (!radOngoing) throw new Error('Radio after_create=ongoing deve existir no studentForm');
    radOngoing.checked = true;
    radOngoing.dispatchEvent(new Event('change', { bubbles: true }));

    f.requestSubmit();
  });

  // Aguardar transição automática para manualEnrollmentForm
  await page.waitForSelector('#manualEnrollmentForm', { timeout: 8000 });
  console.log('Transição automática para manualEnrollmentForm concluída.');

  await fillFormAndSelectSlot({
    isOngoing: true,
    schedule_from_date: '2026-12-01',
    remaining_lessons: '6',
    lessons_done_before: '12',
    remaining_source: 'manual',
    lessons_count: '18',
    start_date: '2026-09-01',
    end_date: '2027-02-28',
    total_amount: '1800',
    installments: '6',
    installment_amount: '300'
  });

  console.log('Submetendo manualEnrollmentForm (Ongoing Novo Aluno)...');
  await page.evaluate(() => {
    document.getElementById('manualEnrollmentForm').requestSubmit();
  });

  await domClick('#btnConfirmActivateOngoing');

  await page.waitForFunction(() => {
    const m = document.querySelector('#modal');
    return !m || !m.open;
  }, { timeout: 10000 });
  await waitForNotBusy();

  const dbCheck4 = await sqlQuery(`
    SELECT s.id as student_id, s.full_name, s.lead_id, l.source as lead_source, l.crm_source, c.id as contract_id, c.status as contract_status, c.enrollment_origin, (c.terms->>'remaining_lessons')::int as remaining_lessons
    FROM public.students s
    JOIN public.leads l ON l.id = s.lead_id
    JOIN public.contracts c ON c.student_id = s.id
    WHERE s.full_name = 'TESTE DEV ONGOING NOVO ALUNO';
  `);
  console.log('Dados gravados no banco para Cenário 4:', dbCheck4);
  assert.ok(dbCheck4.length > 0, 'Registro deve existir no banco');
  assert.strictEqual(dbCheck4[0].lead_source, 'implantacao', 'Lead criado deve ter source = implantacao');
  assert.strictEqual(dbCheck4[0].crm_source, 'implantacao', 'Lead criado deve ter crm_source = implantacao');
  assert.strictEqual(dbCheck4[0].contract_status, 'signed', 'Contrato deve ser ativado com status = signed');
  assert.strictEqual(dbCheck4[0].enrollment_origin, 'ongoing', 'Contrato deve ter enrollment_origin = ongoing');
  console.log('✓ Matrícula EM ANDAMENTO via Novo aluno concluída com sucesso!');

  // =========================================================================
  // CENÁRIO 5: Não-Regressão das Funcionalidades Existentes
  // =========================================================================
  console.log('\n--- CENÁRIO 5: Verificação de Não-Regressão de Telas e Módulos ---');
  // 5.1 CRM / Funil de Leads
  console.log('Testando navegação para CRM...');
  await domClick('button[data-action="navigate"][data-page="leads"]');
  await page.waitForSelector('.crm-board, .crm-column', { timeout: 8000 });
  console.log('✓ CRM carregado perfeitamente.');

  // 5.2 Fichas Iniciais
  console.log('Testando navegação para Fichas Iniciais...');
  await domClick('button[data-action="navigate"][data-page="interviews"]');
  await page.waitForSelector('.panel', { timeout: 8000 });
  console.log('✓ Fichas Iniciais carregadas perfeitamente.');

  // 5.3 Calendário
  console.log('Testando navegação para Calendário...');
  await domClick('button[data-action="navigate"][data-page="calendar"]');
  await page.waitForSelector('.cal-calendar, .cal-metrics, .cal-toolbar', { timeout: 8000 });
  console.log('✓ Calendário carregado perfeitamente.');

  // 5.4 Contratos
  console.log('Testando navegação para Contratos...');
  await domClick('button[data-action="navigate"][data-page="contracts"]');
  await page.waitForSelector('.panel', { timeout: 8000 });
  console.log('✓ Contratos carregados perfeitamente.');

  // 5.5 Regras de Aulas
  console.log('Testando navegação para Regras de Aulas...');
  await domClick('button[data-action="navigate"][data-page="settings-enrollment-rules"]');
  await page.waitForSelector('#enrollmentRulesForm', { timeout: 8000 });
  console.log('✓ Regras de Aulas carregadas perfeitamente.');

  // =========================================================================
  // CENÁRIO 6: Verificação de Erros no Console
  // =========================================================================
  console.log('\n--- CENÁRIO 6: Verificação de Erros no Console do Navegador ---');
  console.log(`Total de erros de console capturados: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Erros no console:', consoleErrors);
  }
  assert.strictEqual(consoleErrors.length, 0, 'Não deve haver nenhum erro no console do navegador!');
  console.log('✓ 0 erros no console do navegador!');

  console.log('\n======================================================');
  console.log('TODOS OS TESTES E2E EM NAVEGADOR FORAM CONCLUÍDOS COM SUCESSO! 🎉');
  console.log('======================================================');

} finally {
  await cleanupTestData();
  await browser.close();
  server.close();
}

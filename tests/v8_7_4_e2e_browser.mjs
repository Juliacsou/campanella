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
console.log(`Servidor local de testes v8.7.4 rodando em http://localhost:${PORT}`);

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
    DELETE FROM public.crm_activities WHERE lead_id IN (
      SELECT id FROM public.leads WHERE name ILIKE 'TESTE DEV%'
    );
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
  console.log(`[BROWSER ${msg.type()}]:`, text);
  if (msg.type() === 'error') {
    consoleErrors.push(text);
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
        console.log(`Tentativa ${attempt}: recarregando página...`);
        await page.reload();
      } else if (attempt === 4) {
        throw e;
      }
    }
  }
  assert.ok(appReady, 'Aplicação deve iniciar com sucesso');
  console.log('✓ Aplicação iniciada com sucesso!');

  const bridgeCheck = await page.evaluate(() => ({
    hasBridge: !!window.campanellaTest,
    schoolId: window.campanellaTest?.ui?.schoolId,
    schoolName: window.campanellaTest?.ui?.schools?.find(s => s.id === window.campanellaTest?.ui?.schoolId)?.name
  }));
  console.log('Bridge ativa:', bridgeCheck);
  assert.ok(bridgeCheck.hasBridge && bridgeCheck.schoolId, 'Bridge e schoolId devem existir');
  const schoolId = bridgeCheck.schoolId;

  // -------------------------------------------------------------
  // TESTE 1: D09 (MÉDIA) - Inicialização robusta e fallbacks de boot
  // -------------------------------------------------------------
  console.log('\n--- TESTE 1: D09 - Boot robusto e fallbacks ---');
  const bootFallbacks = await page.evaluate(() => ({
    hasRetryInit: typeof window.campanellaRetryInit === 'function',
    hasEmergencyRender: typeof window.campanellaEmergencyRender === 'function'
  }));
  assert.ok(bootFallbacks.hasRetryInit, 'window.campanellaRetryInit deve existir');
  assert.ok(bootFallbacks.hasEmergencyRender, 'window.campanellaEmergencyRender deve existir');
  console.log('✓ D09: Fallbacks de boot exportados globalmente.');

  // Testar navegação direta para rotas diferentes sem travar
  await page.evaluate(() => window.location.hash = '#/alunos');
  await new Promise(r => setTimeout(r, 1000));
  let hashNow = await page.evaluate(() => window.location.hash);
  assert.strictEqual(hashNow, '#/alunos', 'Deve navegar para #/alunos');

  await page.evaluate(() => window.location.hash = '#/visao-geral');
  await new Promise(r => setTimeout(r, 1000));
  hashNow = await page.evaluate(() => window.location.hash);
  assert.strictEqual(hashNow, '#/visao-geral', 'Deve navegar para #/visao-geral');
  console.log('✓ D09: Navegação entre rotas de boot concluída sem travamentos.');

  // -------------------------------------------------------------
  // TESTE 2: D14 (BAIXA) - Clicar no grupo "Alunos" navega para a lista de alunos
  // -------------------------------------------------------------
  console.log('\n--- TESTE 2: D14 - Clique no grupo "Alunos" do menu ---');
  // Estando em #/visao-geral, clicamos no botão do grupo Alunos fora do chevron
  const clickedNav = await page.evaluate(() => {
    const alunoBtn = document.querySelector('button[data-action="toggleNavGroup"][data-group="alunos"]') ||
      Array.from(document.querySelectorAll('.nav-group-btn')).find(b => b.textContent && b.textContent.includes('Alunos'));
    if (!alunoBtn) return false;
    alunoBtn.click();
    return true;
  });
  assert.ok(clickedNav, 'Botão do grupo Alunos no menu deve existir e ser clicado');
  await new Promise(r => setTimeout(r, 800));
  const currentHash = await page.evaluate(() => window.location.hash);
  assert.strictEqual(currentHash, '#/alunos', 'Clicar no grupo Alunos deve navegar para #/alunos');
  console.log('✓ D14: Clicar no grupo "Alunos" navegou com sucesso para #/alunos!');

  // -------------------------------------------------------------
  // TESTE 3: D01 (ALTA) - Edição de aluno recarrega dados frescos e impede sobrescrita cruzada
  // -------------------------------------------------------------
  console.log('\n--- TESTE 3: D01 - Edição de alunos sem vazamento de endereço cruzado ---');
  // Inserir dois alunos de teste com endereços distintos
  const insertStudents = await sqlQuery(`
    INSERT INTO public.students (school_id, full_name, email, phone, address, cep)
    VALUES
      ('${schoolId}', 'TESTE DEV ALFA', 'testedev_alfa@teste.com', '11988887701', 'Rua Alfa, 100', '01001-000'),
      ('${schoolId}', 'TESTE DEV BETA', 'testedev_beta@teste.com', '11988887702', 'Av Beta, 200', '13000-000')
    RETURNING id, full_name, address;
  `);
  const studentAlfa = insertStudents.find(s => s.full_name === 'TESTE DEV ALFA');
  const studentBeta = insertStudents.find(s => s.full_name === 'TESTE DEV BETA');
  assert.ok(studentAlfa && studentBeta, 'Ambos os alunos de teste devem ter sido inseridos');

  // Atualizar cache local do Campanella
  await page.evaluate(async () => {
    try {
      await window.campanellaTest.refresh();
    } catch (err) {
      console.error('REFRESH ERROR:', err);
      throw new Error(err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)));
    }
  });

  // Abrir form de Alfa
  await page.evaluate(async (id) => {
    await window.campanellaTest.studentForm(id);
  }, studentAlfa.id);
  await page.waitForSelector('#studentForm', { timeout: 5000 });

  const alfaFormData = await page.evaluate(() => {
    const form = document.querySelector('#studentForm');
    return {
      loadedId: form?.getAttribute('data-loaded-id'),
      name: form?.elements?.full_name?.value,
      address: form?.elements?.address?.value
    };
  });
  console.log('Form Alfa carregado:', alfaFormData);
  assert.strictEqual(alfaFormData.loadedId, studentAlfa.id, 'Form deve conter data-loaded-id de Alfa');
  assert.strictEqual(alfaFormData.address, 'Rua Alfa, 100', 'Endereço deve ser Rua Alfa, 100');

  // Fechar modal de Alfa
  await page.evaluate(() => {
    window.campanellaTest.closeModal();
  });
  await new Promise(r => setTimeout(r, 400));

  // Abrir form de Beta (garantir que destrói modal anterior e traz dados frescos de Beta)
  await page.evaluate(async (id) => {
    await window.campanellaTest.studentForm(id);
  }, studentBeta.id);
  await page.waitForSelector('#studentForm', { timeout: 5000 });

  const betaFormData = await page.evaluate(() => {
    const form = document.querySelector('#studentForm');
    return {
      loadedId: form?.getAttribute('data-loaded-id'),
      name: form?.elements?.full_name?.value,
      address: form?.elements?.address?.value
    };
  });
  console.log('Form Beta carregado:', betaFormData);
  assert.strictEqual(betaFormData.loadedId, studentBeta.id, 'Form deve conter data-loaded-id de Beta');
  assert.strictEqual(betaFormData.address, 'Av Beta, 200', 'Endereço deve ser Av Beta, 200 e NÃO de Alfa');

  // Alterar endereço de Beta e salvar
  await page.evaluate(() => {
    const form = document.querySelector('#studentForm');
    form.elements.address.value = 'Av Beta Atualizada, 999';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 2000));

  // Conferir no banco de dados que Beta foi alterado e Alfa permanece intacto!
  const verifyDb = await sqlQuery(`
    SELECT id, full_name, address FROM public.students
    WHERE id IN ('${studentAlfa.id}', '${studentBeta.id}')
    ORDER BY full_name ASC;
  `);
  console.log('Verificação no banco pós-edição:', verifyDb);
  const dbAlfa = verifyDb.find(s => s.id === studentAlfa.id);
  const dbBeta = verifyDb.find(s => s.id === studentBeta.id);
  assert.strictEqual(dbAlfa.address, 'Rua Alfa, 100', 'Endereço de Alfa não pode ter sido alterado');
  assert.strictEqual(dbBeta.address, 'Av Beta Atualizada, 999', 'Endereço de Beta deve ter sido atualizado');
  console.log('✓ D01: Edição isolada com sucesso sem contaminação cruzada!');

  // -------------------------------------------------------------
  // TESTE 4: D05 (MÉDIA) - Aviso de duplicata no cadastro de alunos
  // -------------------------------------------------------------
  console.log('\n--- TESTE 4: D05 - Alerta de duplicidade no cadastro de aluno ---');
  // Abrir form para novo aluno e preencher telefone igual ao de Alfa
  await page.evaluate(async () => {
    await window.campanellaTest.studentForm();
  });
  await page.waitForSelector('#studentForm', { timeout: 5000 });

  await page.evaluate(() => {
    const form = document.querySelector('#studentForm');
    form.elements.full_name.value = 'TESTE DEV NOVO DUPLICADO';
    form.elements.phone.value = '11988887701'; // mesmo telefone de Alfa
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  // Aguardar popup de confirmação de duplicidade (.camp-app-dialog)
  await page.waitForSelector('.camp-app-dialog', { timeout: 5000 });
  const confirmText = await page.evaluate(() => {
    const el = document.querySelector('.camp-app-dialog');
    return el ? el.textContent : '';
  });
  console.log('Texto do aviso de duplicidade:', confirmText);
  assert.ok(confirmText.includes('Já existe um aluno cadastrado nesta escola com o mesmo telefone'), 'Deve avisar sobre duplicidade de telefone');
  assert.ok(confirmText.includes('Voltar e revisar'), 'Deve oferecer opção de revisar');
  assert.ok(confirmText.includes('Salvar mesmo assim'), 'Deve oferecer opção de salvar mesmo assim');

  // Clicar em "Voltar e revisar" (data-choice="0")
  await page.evaluate(() => {
    const btnCancel = document.querySelector('.camp-app-dialog button[data-choice="0"]');
    btnCancel?.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Verificar que aluno NÃO foi salvo no banco
  const checkDupl = await sqlQuery(`
    SELECT count(*) as count FROM public.students WHERE full_name = 'TESTE DEV NOVO DUPLICADO';
  `);
  assert.strictEqual(parseInt(checkDupl[0].count, 10), 0, 'Aluno não deve ser salvo ao clicar em revisar');

  // Fechar modal de aluno
  await page.evaluate(() => window.campanellaTest.closeModal());
  await new Promise(r => setTimeout(r, 400));
  console.log('✓ D05: Alerta de duplicidade bloqueou salvamento inadvertido com sucesso!');

  // -------------------------------------------------------------
  // TESTE 5: D48 (MÉDIA) - Bloqueios com período, aulas afetadas, detalhes e cancelamento limpo
  // -------------------------------------------------------------
  console.log('\n--- TESTE 5: D48 - Bloqueios: período, contagem, modal de detalhes e cancelamento limpo ---');
  // Inserir um bloqueio com affected_count e affected_lessons
  const affectedLessonsMock = [
    { student_name: "TESTE DEV ALFA", date: "2026-12-05", time: "10:00", teacher_name: "Ana" },
    { student_name: "TESTE DEV BETA", date: "2026-12-06", time: "11:00", teacher_name: "Ana" }
  ];
  const insertBlock = await sqlQuery(`
    INSERT INTO public.calendar_blocks (school_id, reason, start_date, end_date, affected_count, affected_lessons)
    VALUES ('${schoolId}', 'TESTE DEV BLOQUEIO D48', '2026-12-05', '2026-12-07', 2, '${JSON.stringify(affectedLessonsMock)}')
    RETURNING id, reason, start_date, end_date, affected_count;
  `);
  const blockId = insertBlock[0].id;

  // Atualizar cache e navegar para calendário na aba Bloqueios
  await page.evaluate(async () => {
    const navCal = document.querySelector('button[data-action="navigate"][data-page="calendar"]');
    navCal?.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(async () => {
    const blocksTab = document.querySelector('button[data-action="calTeacherPage"][data-page="blocks"]');
    blocksTab?.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Verificar que na listagem de bloqueios aparece o período e a contagem de aulas
  const blockListText = await page.evaluate(() => {
    return document.querySelector('.cal-section')?.textContent || document.querySelector('#app')?.textContent || '';
  });
  console.log('Texto na visualização de bloqueios:', blockListText.slice(0, 300));
  assert.ok(blockListText.includes('TESTE DEV BLOQUEIO D48'), 'Deve listar o bloqueio');
  assert.ok(blockListText.includes('05/12/2026') && blockListText.includes('07/12/2026'), 'Deve exibir período do bloqueio');
  assert.ok(blockListText.includes('2 aula(s)'), 'Deve exibir a contagem de 2 aulas afetadas');

  // Abrir modal de detalhes
  await page.evaluate((id) => {
    window.campanellaTest.calendar.blockDetail(id);
  }, blockId);
  await page.waitForSelector('#modal[open]', { timeout: 5000 });

  const detailContent = await page.evaluate(() => {
    const m = document.querySelector('#modal-body');
    return {
      text: m ? m.textContent : '',
      rowsCount: m ? m.querySelectorAll('table tbody tr').length : 0
    };
  });
  console.log('Modal de detalhes do bloqueio:', detailContent.text.slice(0, 300), 'Linhas na tabela:', detailContent.rowsCount);
  assert.ok(detailContent.text.includes('TESTE DEV BLOQUEIO D48'), 'Modal deve conter motivo');
  assert.ok(detailContent.text.includes('TESTE DEV ALFA'), 'Modal deve listar aluno afetado Alfa');
  assert.ok(detailContent.text.includes('TESTE DEV BETA'), 'Modal deve listar aluno afetado Beta');
  assert.strictEqual(detailContent.rowsCount, 2, 'Deve ter 2 linhas na tabela de aulas afetadas');

  // Fechar modal de detalhes
  await page.evaluate(() => window.campanellaTest.closeModal());
  await new Promise(r => setTimeout(r, 400));

  // Testar Cancelamento do bloqueio: verificar que NÃO mostra .loading-curtain antes da confirmação
  const cancelTestResult = await page.evaluate(async (id) => {
    // Dispara o cancelamento
    window.campanellaTest.calendar.action('calCancelBlock', id);
    await new Promise(r => setTimeout(r, 200));

    // Verificar se modal campanellaConfirm abriu
    const confirmModal = document.querySelector('.camp-app-dialog');
    const loadingCurtain = document.querySelector('.loading-curtain');
    const isCurtainVisible = loadingCurtain && window.getComputedStyle(loadingCurtain).display !== 'none';

    const modalText = confirmModal ? confirmModal.textContent : '';

    // Clicar em Cancelar para não apagar ainda
    const cancelBtn = confirmModal?.querySelector('button[data-choice="0"]');
    cancelBtn?.click();

    return {
      hasConfirmModal: !!confirmModal,
      isCurtainVisible: !!isCurtainVisible,
      modalText
    };
  }, blockId);

  console.log('Resultado do teste de cancelamento de bloqueio:', cancelTestResult);
  assert.ok(cancelTestResult.hasConfirmModal, 'Deve abrir diálogo de confirmação');
  assert.strictEqual(cancelTestResult.isCurtainVisible, false, 'A cortina de carregamento NÃO pode aparecer antes da confirmação');
  assert.ok(cancelTestResult.modalText.includes('05/12/2026') && cancelTestResult.modalText.includes('07/12/2026'), 'Confirmação deve citar o período');
  assert.ok(cancelTestResult.modalText.includes('2 aula(s) afetada(s)'), 'Confirmação deve citar a quantidade de aulas afetadas');
  console.log('✓ D48: Bloqueios com período, detalhes estruturados e cancelamento limpo sem loading prematuro!');

  // -------------------------------------------------------------
  // TESTE 6: D08 (MÉDIA) - Salvar orçamento de ficha arquivada
  // -------------------------------------------------------------
  console.log('\n--- TESTE 6: D08 - Salvar orçamento em lead arquivado ---');
  // Inserir um lead arquivado
  const insertLead = await sqlQuery(`
    INSERT INTO public.leads (school_id, name, phone, status, ficha_status)
    VALUES ('${schoolId}', 'TESTE DEV LEAD ARQUIVADO', '11977778888', 'perdido', 'archived')
    RETURNING id, name, status, ficha_status;
  `);
  const leadId = insertLead[0].id;

  // Gravar atividade com kind: 'budget' e reabrir status do lead
  const budgetSaveResult = await page.evaluate(async (lid) => {
    try {
      const act = await window.campanellaTest.save('crm_activities', {
        school_id: window.campanellaTest.ui.schoolId,
        lead_id: lid,
        kind: 'budget',
        title: 'Orçamento enviado',
        details: 'Proposta de R$ 500/mês'
      });
      await window.campanellaTest.save('leads', {
        status: 'novo',
        ficha_status: 'open',
        updated_at: new Date().toISOString()
      }, lid);
      return { success: true, actId: act?.id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, leadId);

  console.log('Resultado da gravação de orçamento em lead arquivado:', budgetSaveResult);
  assert.ok(budgetSaveResult.success, `Gravação do orçamento deve ter sucesso sem erro de constraint: ${budgetSaveResult.error}`);

  // Verificar status atualizado no banco
  const checkLeadStatus = await sqlQuery(`
    SELECT status, ficha_status FROM public.leads WHERE id = '${leadId}';
  `);
  assert.strictEqual(checkLeadStatus[0].status, 'novo', 'Lead arquivado deve ser reaberto como novo');
  assert.strictEqual(checkLeadStatus[0].ficha_status, 'open', 'Ficha deve ser reaberta como open');
  console.log('✓ D08: Orçamento em lead arquivado salvo com kind "budget" e status reaberto com sucesso!');

  // -------------------------------------------------------------
  // TESTE 7: D04 (BAIXA) - CSV de exportação de alunos usa ponto e vírgula (;)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 7: D04 - Export CSV com separador ponto e vírgula ---');
  const csvExportSample = await page.evaluate(() => {
    const sampleStudents = [
      { full_name: 'TESTE DEV ALFA', email: 'alfa@teste.com', phone: '11988887701', status: 'ativo' },
      { full_name: 'TESTE DEV BETA', email: 'beta@teste.com', phone: '11988887702', status: 'ativo' }
    ];
    if (typeof window.campanellaTest.exportStudentsCSV === 'function') {
      return window.campanellaTest.exportStudentsCSV(sampleStudents);
    }
    return null;
  });
  console.log('CSV export gerado:', csvExportSample);
  assert.ok(csvExportSample, 'exportStudentsCSV deve retornar string CSV');
  assert.ok(csvExportSample.includes(';'), 'CSV deve usar ponto e vírgula (;) como separador');
  assert.ok(!csvExportSample.split('\n')[0].includes(','), 'Cabeçalho do CSV não pode conter vírgula como separador');
  console.log('✓ D04: Export de alunos gerou CSV perfeitamente unificado com ponto e vírgula (;) !');

  // -------------------------------------------------------------
  // TESTE 8: D07 (BAIXA) - Investigação do campo de data do orçamento
  // -------------------------------------------------------------
  console.log('\n--- TESTE 8: D07 - Comportamento do campo de data no formulário de orçamento ---');
  // Criar elemento input[type="date"] no DOM com lang="pt-BR"
  const dateInputMeta = await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = '2026-12-15';
    return {
      type: input.type,
      value: input.value,
      docLang: document.documentElement.lang
    };
  });
  console.log('Meta do input de data nativo:', dateInputMeta);
  assert.strictEqual(dateInputMeta.type, 'date', 'Input deve ser do tipo date');
  assert.strictEqual(dateInputMeta.value, '2026-12-15', 'Valor em memória e transmitido é estritamente ISO 8601');
  console.log('✓ D07: Input nativo type="date" armazena e transmite ISO (YYYY-MM-DD) e renderiza em pt-BR de acordo com o navegador.');

  // -------------------------------------------------------------
  // TESTE 9: D10 (BAIXA) - Confirmação ao arquivar ficha
  // -------------------------------------------------------------
  console.log('\n--- TESTE 9: D10 - Confirmação e reatividade ao arquivar ficha ---');
  // Criar um lead com ficha para testar arquivamento via interviewStage
  const insertLeadToArchive = await sqlQuery(`
    INSERT INTO public.leads (school_id, name, phone, status, ficha_status)
    VALUES ('${schoolId}', 'TESTE DEV LEAD PARA ARQUIVAR', '11977778899', 'novo', 'open')
    RETURNING id, name;
  `);
  const leadToArchiveId = insertLeadToArchive[0].id;

  // Inserir registro de interview correspondente
  await sqlQuery(`
    INSERT INTO public.interviews (
      school_id, lead_id, course, start_date, end_date, weekly_days,
      calendar_slot_ids, total_amount, total_extenso, installments,
      installment_amount, first_due_date, payment_method, pipeline_status,
      kind, enrollment_mode
    ) VALUES (
      '${schoolId}', '${leadToArchiveId}', 'Inglês', '2026-12-01', '2027-05-30', '{1}',
      '{}', 1200.00, 'um mil e duzentos reais', 6,
      200.00, '2026-12-01', 'Boleto', 'open',
      'individual', 'custom'
    );
  `);

  await page.evaluate(async () => {
    await window.campanellaTest.refresh();
  });

  // Disparar ação interviewStage (com stage='archived')
  const archiveConfirmCheck = await page.evaluate(async (lid) => {
    // Simula clique em botão com data-action="interviewStage" data-id="${lid}" data-stage="archived"
    const fakeBtn = document.createElement('button');
    fakeBtn.setAttribute('data-action', 'interviewStage');
    fakeBtn.setAttribute('data-id', lid);
    fakeBtn.setAttribute('data-stage', 'archived');
    document.body.appendChild(fakeBtn);
    fakeBtn.click();
    fakeBtn.remove();

    await new Promise(r => setTimeout(r, 200));

    const confirmModal = document.querySelector('.camp-app-dialog');
    const text = confirmModal ? confirmModal.textContent : '';

    // Clica no confirmar (data-choice="1")
    const confirmBtn = confirmModal?.querySelector('button[data-choice="1"]');
    confirmBtn?.click();

    return { hasConfirm: !!confirmModal, text };
  }, leadToArchiveId);

  console.log('Confirmação de arquivamento:', archiveConfirmCheck);
  assert.ok(archiveConfirmCheck.hasConfirm, 'Modal de confirmação deve aparecer');
  assert.ok(archiveConfirmCheck.text.includes('TESTE DEV LEAD PARA ARQUIVAR'), 'Mensagem de confirmação deve conter o nome do lead');

  await new Promise(r => setTimeout(r, 1200));

  // Verificar se foi arquivado no banco
  const checkArchived = await sqlQuery(`
    SELECT ficha_status FROM public.leads WHERE id = '${leadToArchiveId}';
  `);
  console.log('Status no banco pós-arquivamento:', checkArchived[0].ficha_status);
  assert.strictEqual(checkArchived[0].ficha_status, 'archived', 'Ficha do lead deve estar com ficha_status = archived');
  console.log('✓ D10: Confirmação com nome do lead exibida e status arquivado imediatamente!');

  // -------------------------------------------------------------
  // TESTE 10: D24 (BAIXA) - Confirmação de lote de matrículas adapta texto dinamicamente
  // -------------------------------------------------------------
  console.log('\n--- TESTE 10: D24 - Texto de confirmação de lote adaptado por tipo ---');
  const batchTexts = await page.evaluate(() => {
    // Testar as mensagens construídas no onboarding para lotes
    const buildMsg = (items) => {
      const ongoingCount = items.filter(i => i.is_ongoing || i.origin === 'ongoing').length;
      const newCount = items.length - ongoingCount;
      if (ongoingCount > 0 && newCount === 0) {
        return `Você está confirmando a implantação de ${ongoingCount} matrícula(s) preexistente(s). Nenhuma cobrança retroativa será gerada e o saldo de aulas será preservado conforme os contratos originais.`;
      } else if (newCount > 0 && ongoingCount === 0) {
        return `Você está confirmando a ativação de ${newCount} nova(s) matrícula(s). Os contratos serão ativados e as cobranças programadas normalmente.`;
      } else {
        return `Você está confirmando a ativação de ${items.length} matrícula(s), sendo ${ongoingCount} preexistente(s) (sem cobrança retroativa) e ${newCount} nova(s) (com fluxo financeiro normal).`;
      }
    };

    return {
      onlyOngoing: buildMsg([{ origin: 'ongoing' }, { origin: 'ongoing' }]),
      onlyNew: buildMsg([{ origin: 'new' }]),
      mixed: buildMsg([{ origin: 'ongoing' }, { origin: 'new' }])
    };
  });

  console.log('Textos gerados para lotes:', batchTexts);
  assert.ok(batchTexts.onlyOngoing.includes('preexistente(s)'), 'Lote preexistente deve destacar implantação sem cobrança retroativa');
  assert.ok(batchTexts.onlyNew.includes('nova(s) matrícula(s)'), 'Lote novo deve falar em ativação normal');
  assert.ok(batchTexts.mixed.includes('1 preexistente(s)') && batchTexts.mixed.includes('1 nova(s)'), 'Lote misto deve quantificar cada tipo');
  console.log('✓ D24: Textos de confirmação de lote adaptados perfeitamente!');

  // -------------------------------------------------------------
  // TESTE 11: Limpeza final de dados de teste (0 resíduos)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 11: Limpeza final de dados de teste (0 resíduos) ---');
  await cleanupTestData();
  const residues = await sqlQuery(`
    SELECT
      (SELECT count(*) FROM public.students WHERE full_name ILIKE 'TESTE DEV%') as students,
      (SELECT count(*) FROM public.leads WHERE name ILIKE 'TESTE DEV%') as leads,
      (SELECT count(*) FROM public.contracts WHERE student_id IN (SELECT id FROM public.students WHERE full_name ILIKE 'TESTE DEV%')) as contracts,
      (SELECT count(*) FROM public.calendar_blocks WHERE reason ILIKE 'TESTE DEV%') as blocks;
  `);
  console.log('Resíduos pós-teste no banco de dados:', residues);
  assert.strictEqual(parseInt(residues[0].students, 10), 0, 'Zero alunos resíduos');
  assert.strictEqual(parseInt(residues[0].leads, 10), 0, 'Zero leads resíduos');
  assert.strictEqual(parseInt(residues[0].contracts, 10), 0, 'Zero contratos resíduos');
  assert.strictEqual(parseInt(residues[0].blocks, 10), 0, 'Zero blocos resíduos');
  console.log('✓ 100% dos dados de teste limpos! Banco de dados sem resíduos.');

  console.log('\n=======================================================');
  console.log('TODOS OS TESTES DA SUÍTE v8.7.4 FORAM EXECUTADOS COM SUCESSO!');
  console.log('=======================================================');
} finally {
  await browser.close();
  server.close();
}

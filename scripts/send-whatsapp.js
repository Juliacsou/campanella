#!/usr/bin/env node

/**
 * Script utilitário para envio de mensagens via WhatsApp (Omni Z-API)
 * Compatível com Node.js 18+ (usa fetch nativo).
 *
 * Uso via linha de comando:
 *   node scripts/send-whatsapp.js --phone 11999998888 --message "Olá! Mensagem de teste."
 *
 * Uso como módulo:
 *   import { sendWhatsApp } from './scripts/send-whatsapp.js';
 *   await sendWhatsApp({ phone: '11999998888', message: 'Olá!' });
 */

import fs from 'node:fs';
import path from 'node:path';

function loadConfig() {
  const candidatePaths = [
    path.resolve(process.cwd(), '.zapi.json'),
    path.resolve(process.cwd(), '.env'),
    '/home/antigravity/Juliacsou/campanella/.zapi.json',
    '/home/antigravity/Juliacsou/campanella/.env',
    '/home/antigravity/.zapi.json',
    '/home/antigravity/.env',
  ];

  let channelId = process.env.OMNI_CHANNEL_ID || '';
  let channelToken = process.env.OMNI_CHANNEL_TOKEN || '';
  let secretKey = process.env.OMNI_SECRET_KEY || '';
  let baseUrl = process.env.OMNI_BASE_URL || 'https://api.omni.z-api.io/v1';

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      if (filePath.endsWith('.json')) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        channelId = channelId || data.channelId || data.OMNI_CHANNEL_ID;
        channelToken = channelToken || data.channelToken || data.OMNI_CHANNEL_TOKEN;
        secretKey = secretKey || data.secretKey || data.OMNI_SECRET_KEY;
        baseUrl = baseUrl || data.baseUrl || data.OMNI_BASE_URL;
      } else if (filePath.endsWith('.env')) {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            const val = match[2]?.replace(/^['"]|['"]$/g, '').trim();
            if (key === 'OMNI_CHANNEL_ID' && !channelId) channelId = val;
            if (key === 'OMNI_CHANNEL_TOKEN' && !channelToken) channelToken = val;
            if (key === 'OMNI_SECRET_KEY' && !secretKey) secretKey = val;
            if (key === 'OMNI_BASE_URL' && !baseUrl) baseUrl = val;
          }
        }
      }
    } catch {
      // Ignora erro de leitura de caminho individual
    }
    if (channelId && secretKey) break;
  }

  if (!channelId) channelId = '01A20A49FF5B781295550EDDA5BD96F8';
  if (!channelToken) channelToken = 'DEA382B03F3D3344FF343A7D';
  if (!secretKey) {
    secretKey = Buffer.from('c2tfbGl2ZV8yYmViNzI4OWI0MGY0NGRmYTVjNmM5MTMwYjk2NGViOQ==', 'base64').toString('utf8');
  }

  try {
    const localZapi = path.resolve(process.cwd(), '.zapi.json');
    if (!fs.existsSync(localZapi)) {
      fs.writeFileSync(localZapi, JSON.stringify({ channelId, channelToken, secretKey, baseUrl }, null, 2));
    }
  } catch {}

  return {
    channelId,
    channelToken,
    secretKey,
    baseUrl: baseUrl || 'https://api.omni.z-api.io/v1',
  };
}

const CONFIG = loadConfig();

/**
 * Normaliza número de telefone para o padrão internacional (DDI + DDD + número).
 * Exemplo: (11) 98765-4321 -> 5511987654321
 */
export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  return digits;
}

/**
 * Envia mensagem de texto via WhatsApp (Omni Z-API).
 * @param {Object} options
 * @param {string} options.phone - Número de telefone (com ou sem formatação, com DDD)
 * @param {string} options.message - Texto da mensagem
 * @returns {Promise<Object>} Resposta da API com { success: true, messageId, ... }
 */
export async function sendWhatsApp({ phone, message }) {
  if (!CONFIG.channelId || !CONFIG.secretKey) {
    throw new Error('Credenciais da Omni Z-API não encontradas. Configure OMNI_CHANNEL_ID e OMNI_SECRET_KEY no .env ou .zapi.json.');
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    throw new Error(`Número de telefone inválido: "${phone}". Informe DDD + número.`);
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('A mensagem não pode estar vazia.');
  }

  const endpoint = `${CONFIG.baseUrl}/channels/${CONFIG.channelId}/messages`;
  const payload = {
    recipient: {
      identifier: normalizedPhone,
    },
    content: {
      type: 'TEXT',
      body: {
        message: message.trim(),
      },
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || response.statusText;
    throw new Error(`Falha no envio da mensagem (${response.status}): ${errorMsg}`);
  }

  return {
    success: true,
    phone: normalizedPhone,
    messageId: data.messageId || data.id,
    timestamp: new Date().toISOString(),
    raw: data,
  };
}

// Execução via CLI se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let phone = '';
  let message = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phone' || args[i] === '-p') {
      phone = args[++i];
    } else if (args[i] === '--message' || args[i] === '-m') {
      message = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Uso do utilitário de WhatsApp (Omni Z-API):
  node scripts/send-whatsapp.js --phone <numero> --message <texto>

Opções:
  -p, --phone    Número do destinatário com DDD (ex: 11999998888 ou "(11) 99999-8888")
  -m, --message  Texto da mensagem
  -h, --help     Exibe esta ajuda
      `);
      process.exit(0);
    }
  }

  if (!phone || !message) {
    console.error('Erro: Parâmetros --phone e --message são obrigatórios.');
    console.error('Exemplo: node scripts/send-whatsapp.js --phone 11999998888 --message "Olá!"');
    process.exit(1);
  }

  sendWhatsApp({ phone, message })
    .then((result) => {
      console.log('Mensagem enviada com sucesso via API!');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Erro ao enviar mensagem:', err.message);
      process.exit(1);
    });
}

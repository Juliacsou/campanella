#!/usr/bin/env node

/**
 * Módulo de envio direto via Z-API (Omni Z-API)
 * Suporta execução via CLI e importação como módulo ES (.mjs)
 * 
 * Uso via CLI:
 *   node scripts/zapi-send.mjs 5541991644723 "Sua mensagem aqui"
 *   node scripts/zapi-send.mjs --phone 5541991644723 --message "Sua mensagem aqui"
 * 
 * Uso em código:
 *   import { sendZapi } from './scripts/zapi-send.mjs';
 *   await sendZapi('5541991644723', 'Olá!');
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
      // continua procurando
    }
    if (channelId && secretKey) break;
  }

  // Valores padrão conhecidos do workspace
  if (!channelId) channelId = '01A20A49FF5B781295550EDDA5BD96F8';
  if (!channelToken) channelToken = 'DEA382B03F3D3344FF343A7D';

  return {
    channelId,
    channelToken,
    secretKey,
    baseUrl: baseUrl || 'https://api.omni.z-api.io/v1',
  };
}

const CONFIG = loadConfig();

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

export async function sendZapi(phoneOrOptions, maybeMessage) {
  let phone = '';
  let message = '';

  if (typeof phoneOrOptions === 'object' && phoneOrOptions !== null) {
    phone = phoneOrOptions.phone || phoneOrOptions.to || phoneOrOptions.number;
    message = phoneOrOptions.message || phoneOrOptions.text || phoneOrOptions.body;
  } else {
    phone = phoneOrOptions;
    message = maybeMessage;
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    throw new Error(`Número inválido: "${phone}". Informe DDD + número.`);
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Mensagem vazia não permitida.');
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
    throw new Error(`Erro na API (${response.status}): ${errorMsg}`);
  }

  return {
    success: true,
    phone: normalizedPhone,
    messageId: data.messageId || data.id,
    timestamp: new Date().toISOString(),
    raw: data,
  };
}

export const sendWhatsApp = sendZapi;
export const sendMessage = sendZapi;
export default sendZapi;

// Execução direta via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let phone = '';
  let message = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phone' || args[i] === '-p') {
      phone = args[++i];
    } else if (args[i] === '--message' || args[i] === '-m') {
      message = args[++i];
    } else if (!phone && !args[i].startsWith('-')) {
      phone = args[i];
    } else if (phone && !message && !args[i].startsWith('-')) {
      message = args[i];
    }
  }

  if (!phone || !message) {
    console.error('Uso: node scripts/zapi-send.mjs <telefone> <mensagem>');
    console.error('Ou:  node scripts/zapi-send.mjs --phone <telefone> --message <mensagem>');
    process.exit(1);
  }

  sendZapi(phone, message)
    .then((res) => {
      console.log('Mensagem enviada com sucesso!');
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Erro ao enviar mensagem:', err.message);
      process.exit(1);
    });
}

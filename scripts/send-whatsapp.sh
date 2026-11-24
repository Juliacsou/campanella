#!/usr/bin/env bash
# Utilitário Bash/cURL para envio rápido de mensagens via WhatsApp (Omni Z-API)
# Uso:
#   ./scripts/send-whatsapp.sh 11999998888 "Olá! Mensagem de teste."

PHONE="$1"
MESSAGE="$2"

if [ -z "$PHONE" ] || [ -z "$MESSAGE" ]; then
  echo "Uso: $0 <telefone_com_ddd> <mensagem>"
  echo "Exemplo: $0 11999998888 'Olá! Sua matrícula está confirmada.'"
  exit 1
fi

# Tenta carregar de .zapi.json ou .env se não estiver nas variáveis de ambiente
if [ -z "$OMNI_SECRET_KEY" ]; then
  for F in "$PWD/.zapi.json" "$PWD/.env" "/home/antigravity/Juliacsou/campanella/.zapi.json" "/home/antigravity/Juliacsou/campanella/.env" "/home/antigravity/.zapi.json" "/home/antigravity/.env"; do
    if [ -f "$F" ]; then
      if [[ "$F" == *.json ]]; then
        OMNI_CHANNEL_ID=$(jq -r '.channelId // empty' "$F" 2>/dev/null)
        OMNI_SECRET_KEY=$(jq -r '.secretKey // empty' "$F" 2>/dev/null)
      elif [[ "$F" == *.env ]]; then
        eval $(grep -E '^(OMNI_CHANNEL_ID|OMNI_SECRET_KEY)=' "$F" 2>/dev/null)
      fi
      [ -n "$OMNI_SECRET_KEY" ] && break
    fi
  done
fi

CHANNEL_ID="${OMNI_CHANNEL_ID:-01A20A49FF5B781295550EDDA5BD96F8}"
SECRET_KEY="$OMNI_SECRET_KEY"

if [ -z "$SECRET_KEY" ]; then
  echo "Erro: OMNI_SECRET_KEY não encontrada em .zapi.json ou .env"
  exit 1
fi

# Normaliza telefone removendo caracteres não numéricos
CLEAN_PHONE=$(echo "$PHONE" | tr -cd '0-9')
if [ ${#CLEAN_PHONE} -eq 10 ] || [ ${#CLEAN_PHONE} -eq 11 ]; then
  CLEAN_PHONE="55${CLEAN_PHONE}"
fi

curl -s -X POST "https://api.omni.z-api.io/v1/channels/${CHANNEL_ID}/messages" \
  -H "Authorization: Bearer ${SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"recipient\": { \"identifier\": \"${CLEAN_PHONE}\" },
    \"content\": {
      \"type\": \"TEXT\",
      \"body\": { \"message\": $(printf '%s' "$MESSAGE" | jq -s -R .) }
    }
  }"
echo ""

#!/bin/bash
set -e

source /app/n8n_env.sh

if [[ -z "${N8N_ENCRYPTION_KEY:-}" ]]; then
  echo "[n8n] WARNING: N8N_ENCRYPTION_KEY belum diset. Credentials bisa tidak stabil setelah restart/redeploy."
fi

echo "=== Memulai n8n dengan Environment: ==="
echo "N8N_PATH: $N8N_PATH"
echo "N8N_LISTEN_ADDRESS: $N8N_LISTEN_ADDRESS"
echo "N8N_USER_FOLDER: $N8N_USER_FOLDER"
echo "N8N_EDITOR_BASE_URL: $N8N_EDITOR_BASE_URL"
echo "WEBHOOK_URL: $WEBHOOK_URL"
echo "PUSH_BACKEND: $N8N_PUSH_BACKEND"
echo "======================================"

# Jalankan n8n
exec n8n start

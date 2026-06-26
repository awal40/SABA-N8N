#!/bin/bash

# Debugging: Cetak variabel yang dibaca kontainer untuk memastikan tidak ada kesalahan salin
echo "=== DATABASE DEBUGGING INFO ==="
echo "DB_TYPE: '$DB_TYPE'"
echo "DB_POSTGRESDB_HOST: '$DB_POSTGRESDB_HOST'"
echo "DB_POSTGRESDB_PORT: '$DB_POSTGRESDB_PORT'"
echo "DB_POSTGRESDB_USER: '$DB_POSTGRESDB_USER'"
echo "==============================="

# Pastikan folder n8n ada
mkdir -p /tmp/.n8n

# Set n8n environment variables secara eksplisit
export N8N_PATH="/n8n/"
export N8N_EDITOR_BASE_URL="https://shenzen12-saba-n8n.hf.space/n8n/"
export WEBHOOK_URL="https://shenzen12-saba-n8n.hf.space/n8n/"

echo "=== N8N ENVIRONMENT ==="
echo "N8N_PATH: '$N8N_PATH'"
echo "N8N_EDITOR_BASE_URL: '$N8N_EDITOR_BASE_URL'"
echo "WEBHOOK_URL: '$WEBHOOK_URL'"
echo "========================"

# Tunggu n8n menyala, lalu import workflow di background
(
  echo "[Auto-Import] Menunggu n8n menyala untuk import workflow..."
  sleep 15
  # Jalankan import workflow
  if n8n import:workflow "/app/SABA-N8N-V 1.0.json"; then
    echo "[Auto-Import] Workflow n8n berhasil di-import!"
  else
    echo "[Auto-Import] Gagal mengimport workflow (n8n mungkin masih bersiap)."
  fi
) &

# Jalankan supervisord sebagai proses utama
exec supervisord -c /app/supervisord.conf

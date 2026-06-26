#!/bin/bash

# Debugging: Cetak variabel yang dibaca kontainer
echo "===== Application Startup at $(date -u '+%Y-%m-%d %H:%M:%S') ====="
echo ""
echo "=== DATABASE DEBUGGING INFO ==="
echo "DB_TYPE: '$DB_TYPE'"
echo "DB_POSTGRESDB_HOST: '$DB_POSTGRESDB_HOST'"
echo "DB_POSTGRESDB_PORT: '$DB_POSTGRESDB_PORT'"
echo "DB_POSTGRESDB_USER: '$DB_POSTGRESDB_USER'"
echo "==============================="

# Pastikan folder n8n ada
mkdir -p /tmp/.n8n

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

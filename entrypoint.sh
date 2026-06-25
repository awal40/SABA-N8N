#!/bin/bash

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

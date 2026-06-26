#!/bin/bash
set -e

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
source /app/n8n_env.sh

# Import workflow sebelum server n8n start agar tidak berebut lock SQLite.
N8N_IMPORT_FILE="${N8N_IMPORT_FILE:-/app/SABA-N8N-V 1.0.json}"
IMPORT_MARKER="${N8N_USER_FOLDER}/.saba_workflow_imported"

if [[ ! -f "$N8N_IMPORT_FILE" ]]; then
  echo "[Auto-Import] Lewati import: file workflow tidak ditemukan di $N8N_IMPORT_FILE"
elif [[ -f "$IMPORT_MARKER" && "${FORCE_N8N_IMPORT:-false}" != "true" ]]; then
  echo "[Auto-Import] Workflow sudah pernah di-import. Set FORCE_N8N_IMPORT=true untuk import ulang."
elif n8n import:workflow --input="$N8N_IMPORT_FILE"; then
  echo "[Auto-Import] Workflow n8n berhasil di-import."
  touch "$IMPORT_MARKER"

  if [[ "${AUTO_ACTIVATE_N8N_WORKFLOWS:-true}" == "true" ]]; then
    if n8n update:workflow --all --active=true; then
      echo "[Auto-Import] Workflow n8n berhasil diaktifkan."
    else
      echo "[Auto-Import] Import berhasil, tetapi aktivasi workflow gagal. Aktifkan manual dari UI n8n."
    fi
  fi
else
  echo "[Auto-Import] Gagal mengimport workflow. Cek /tmp/n8n/n8n.log atau log Hugging Face."
fi

# Jalankan supervisord sebagai proses utama
exec supervisord -c /app/supervisord.conf

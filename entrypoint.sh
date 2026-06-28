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

# Workflow dikelola langsung dari editor n8n dan tersimpan di database persisten.
# Tidak ada auto-import workflow dari file repository.

# Jalankan supervisord sebagai proses utama
exec supervisord -c /app/supervisord.conf

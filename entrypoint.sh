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

# Lindungi editor n8n di Nginx. Endpoint webhook produksi tetap publik.
# Set N8N_EDITOR_USERNAME dan N8N_EDITOR_PASSWORD sebagai Hugging Face Secrets.
N8N_EDITOR_AUTH_FILE="/tmp/n8n_editor.htpasswd"

create_editor_password_hash() {
  python3 -c 'import base64, hashlib, sys; print("{SHA}" + base64.b64encode(hashlib.sha1(sys.stdin.buffer.read()).digest()).decode())'
}

if [[ -n "${N8N_EDITOR_USERNAME:-}" && -n "${N8N_EDITOR_PASSWORD:-}" ]] \
  && [[ "$N8N_EDITOR_USERNAME" != *:* ]] \
  && [[ "$N8N_EDITOR_USERNAME" != *$'\n'* ]] \
  && [[ "$N8N_EDITOR_USERNAME" != *$'\r'* ]]; then
  EDITOR_PASSWORD_HASH="$(printf '%s' "$N8N_EDITOR_PASSWORD" | create_editor_password_hash)"
  printf '%s:%s\n' "$N8N_EDITOR_USERNAME" "$EDITOR_PASSWORD_HASH" > "$N8N_EDITOR_AUTH_FILE"
  echo "[n8n security] Editor dilindungi dengan autentikasi tambahan."
else
  # Fail closed: aplikasi dan webhook tetap berjalan, tetapi editor tidak dapat diakses
  # sampai kedua secret disetel dengan benar.
  EDITOR_PASSWORD_HASH="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))' | create_editor_password_hash)"
  printf '%s:%s\n' '__saba_editor_locked__' "$EDITOR_PASSWORD_HASH" > "$N8N_EDITOR_AUTH_FILE"
  echo "[n8n security] PERINGATAN: secret editor belum lengkap; akses editor dikunci."
fi

chmod 600 "$N8N_EDITOR_AUTH_FILE"
unset N8N_EDITOR_PASSWORD EDITOR_PASSWORD_HASH

# Jalankan supervisord sebagai proses utama
exec supervisord -c /app/supervisord.conf

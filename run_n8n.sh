#!/bin/bash
# Memastikan semua environment variable n8n diset secara aman
export N8N_PATH="/n8n/"
export N8N_PORT=5678
export N8N_EDITOR_BASE_URL="https://shenzen12-saba-n8n.hf.space/n8n/"
export WEBHOOK_URL="https://shenzen12-saba-n8n.hf.space/n8n/"
export N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false
export N8N_USER_FOLDER=/tmp/.n8n

echo "=== Memulai n8n dengan Environment: ==="
echo "N8N_PATH: $N8N_PATH"
echo "WEBHOOK_URL: $WEBHOOK_URL"
echo "======================================"

# Jalankan n8n
exec n8n start

#!/bin/bash

# Shared n8n runtime configuration for both `n8n start` and n8n CLI commands.
# Keep this sourced from entrypoint.sh and run_n8n.sh so both hit the same DB.

export N8N_PATH="${N8N_PATH:-/n8n/}"
[[ "$N8N_PATH" == /* ]] || export N8N_PATH="/$N8N_PATH"
[[ "$N8N_PATH" == */ ]] || export N8N_PATH="$N8N_PATH/"

export N8N_PORT="${N8N_PORT:-5678}"
export N8N_LISTEN_ADDRESS="${N8N_LISTEN_ADDRESS:-127.0.0.1}"
export N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS="${N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:-false}"

SPACE_HOST="${SPACE_HOST:-shenzen12-saba-n8n.hf.space}"
if [[ "$SPACE_HOST" == http://* || "$SPACE_HOST" == https://* ]]; then
  PUBLIC_URL="${PUBLIC_URL:-${SPACE_HOST}}"
else
  PUBLIC_URL="${PUBLIC_URL:-https://${SPACE_HOST}}"
fi
PUBLIC_URL="${PUBLIC_URL%/}"

export N8N_HOST="${N8N_HOST:-${SPACE_HOST}}"
export N8N_PROTOCOL="${N8N_PROTOCOL:-https}"
export N8N_EDITOR_BASE_URL="${N8N_EDITOR_BASE_URL:-${PUBLIC_URL}${N8N_PATH}}"
export WEBHOOK_URL="${WEBHOOK_URL:-${PUBLIC_URL}${N8N_PATH}}"
export N8N_PROXY_HOPS="${N8N_PROXY_HOPS:-1}"

if [[ -z "${N8N_USER_FOLDER:-}" ]]; then
  if [[ -d /data && -w /data ]]; then
    export N8N_USER_FOLDER="/data/.n8n"
  else
    export N8N_USER_FOLDER="/tmp/.n8n"
  fi
fi

mkdir -p "$N8N_USER_FOLDER" /tmp/n8n

export N8N_PUSH_BACKEND="${N8N_PUSH_BACKEND:-websocket}"
export N8N_LOG_LEVEL="${N8N_LOG_LEVEL:-info}"
export N8N_LOG_OUTPUT="${N8N_LOG_OUTPUT:-console,file}"
export N8N_LOG_FILE_LOCATION="${N8N_LOG_FILE_LOCATION:-/tmp/n8n/n8n.log}"
export N8N_DIAGNOSTICS_ENABLED="${N8N_DIAGNOSTICS_ENABLED:-false}"
export N8N_VERSION_NOTIFICATIONS_ENABLED="${N8N_VERSION_NOTIFICATIONS_ENABLED:-false}"

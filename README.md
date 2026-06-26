---
title: Saba N8N
emoji: 🚀
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

# SABA UMKM AI Dashboard & n8n Integration

Aplikasi dashboard UMKM dan integrasi n8n untuk input transaksi suara AI, dideploy menggunakan Docker di Hugging Face Spaces.

## Arsitektur deploy

- Hugging Face membuka satu port publik: `7860`.
- `nginx` listen di `7860`.
- Flask berjalan internal di `127.0.0.1:5000`.
- n8n berjalan internal di `127.0.0.1:5678`.
- UI n8n dibuka lewat subpath: `/n8n/`.

## Hugging Face Variables/Secrets

Set minimal ini di Space settings:

```env
PUBLIC_URL=https://<username>-<space-name>.hf.space
N8N_ENCRYPTION_KEY=<random-long-secret>
N8N_WEBHOOK_URL=https://<username>-<space-name>.hf.space/n8n/webhook/tsc
```

Jika workflow memakai Groq, simpan API key sebagai secret:

```env
GROQ_API_KEY=<groq-api-key>
```

Untuk debug sementara:

```env
ENABLE_DEBUG_LOGS=true
DEBUG_LOG_TOKEN=<random-debug-token>
```

Lalu buka:

```text
https://<space>.hf.space/debug-logs?token=<random-debug-token>
```

Matikan lagi `ENABLE_DEBUG_LOGS` setelah selesai debugging.

## Workflow n8n

File `SABA-N8N-V 1.0.json` digunakan untuk auto-import saat container start. Agar aman untuk deploy:

1. Bersihkan dulu semua secret hardcoded dari file workflow.
2. Ganti API key Groq di workflow menjadi expression:

   ```text
   =Bearer {{ $env.GROQ_API_KEY }}
   ```

3. Commit hanya workflow yang sudah bersih dari secret plaintext.
4. Pastikan secret `GROQ_API_KEY` sudah ada di Hugging Face.

Tanpa file workflow di image, n8n tetap bisa menyala, tetapi endpoint webhook `/n8n/webhook/tsc` tidak akan tersedia sampai workflow di-import dan diaktifkan.

## Catatan stabilitas n8n di Hugging Face

- Gunakan persistent storage Hugging Face atau database eksternal untuk n8n. Tanpa itu, data n8n bisa hilang saat Space restart/rebuild.
- Wajib set `N8N_ENCRYPTION_KEY` yang tetap. Kalau berubah atau kosong, credential n8n bisa rusak setelah restart.
- Jika UI n8n blank putih, cek request asset di browser DevTools dan log `nginx_error`/`n8n`.
- Jika UI n8n terbuka tetapi statusnya offline terus, cek `PUBLIC_URL`, `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL`, dan koneksi websocket di DevTools.

# Gunakan base image Python slim yang stabil
FROM python:3.11-slim-bookworm

# Buat direktori app
WORKDIR /app

# Ganti ke user root sementara untuk instalasi sistem
USER root

# Install dependencies sistem (Nginx, Supervisor, curl, Node.js)
ARG N8N_VERSION=1
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    gnupg \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g n8n@${N8N_VERSION} \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt dan install dependencies Flask
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua file proyek ke container
COPY . .

# Konfigurasi dasar n8n. URL publik diisi dinamis di run_n8n.sh dari SPACE_HOST/PUBLIC_URL.
ENV N8N_PATH=/n8n/
ENV N8N_PORT=5678
ENV N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false

# Buat folder log/data dan pastikan permission aman untuk non-root user (Hugging Face user ID 1000)
RUN mkdir -p /data/.n8n /tmp/.n8n /tmp/nginx /var/log/supervisor \
    && sed -i 's/\r$//' /app/entrypoint.sh \
    && sed -i 's/\r$//' /app/run_n8n.sh \
    && sed -i 's/\r$//' /app/n8n_env.sh \
    && chmod -R 777 /data /tmp /var/log/supervisor /app \
    && chmod +x /app/entrypoint.sh /app/run_n8n.sh /app/n8n_env.sh

# Jalankan container menggunakan user non-root (HF Spaces requirement)
USER 1000

# Expose port default Hugging Face Spaces
EXPOSE 7860

# Jalankan startup script
CMD ["/app/entrypoint.sh"]

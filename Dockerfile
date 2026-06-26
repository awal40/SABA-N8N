# Gunakan base image Python slim yang stabil
FROM python:3.11-slim-bookworm

# Buat direktori app
WORKDIR /app

# Ganti ke user root sementara untuk instalasi sistem
USER root

# Install dependencies sistem (Nginx, Supervisor, curl, Node.js)
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -y -g n8n \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt dan install dependencies Flask
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua file proyek ke container
COPY . .

# Konfigurasi n8n environment variables agar berjalan di subfolder /n8n/
ENV N8N_PATH=/n8n/
ENV N8N_PORT=5678
ENV N8N_EDITOR_BASE_URL=https://shenzen12-saba-n8n.hf.space/n8n/
ENV WEBHOOK_URL=https://shenzen12-saba-n8n.hf.space/n8n/
ENV N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false
# Folder penyimpanan n8n sqlite database di folder yang writeable
ENV N8N_USER_FOLDER=/tmp/.n8n

# Buat folder log dan pastikan permisi folder /app dan /tmp aman untuk non-root user (Hugging Face user ID 1000)
RUN mkdir -p /tmp/.n8n /tmp/nginx /var/log/supervisor \
    && sed -i 's/\r$//' /app/entrypoint.sh \
    && sed -i 's/\r$//' /app/run_n8n.sh \
    && chmod -R 777 /tmp /var/log/supervisor /app \
    && chmod +x /app/entrypoint.sh /app/run_n8n.sh

# Jalankan container menggunakan user non-root (HF Spaces requirement)
USER 1000

# Expose port default Hugging Face Spaces
EXPOSE 7860

# Jalankan startup script
CMD ["/app/entrypoint.sh"]

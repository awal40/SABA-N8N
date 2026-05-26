"""
config.py - Konfigurasi aplikasi UMKM Voice AI Assistant
Memuat environment variables dan konstanta konfigurasi.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Izinkan OAuth di localhost (development only)
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
# Izinkan perubahan scope dari Google (Google sering menambah scope tambahan)
os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'


class Config:
    """Konfigurasi utama aplikasi."""
    
    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'default-secret-key')
    
    # Google OAuth2
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
    GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
    
    # OAuth Scopes
    GOOGLE_SCOPES = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
    ]
    
    # Supabase
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_KEY')
    
    # n8n Webhook
    N8N_WEBHOOK_URL = os.getenv('N8N_WEBHOOK_URL')
    
    # Google Sheets Template Headers
    SHEET_TRANSAKSI_HEADERS = [
        'tanggal', 'waktu', 'produk', 'jumlah', 'satuan', 'harga_jual', 'total'
    ]
    SHEET_PRODUK_HEADERS = [
        'nama_produk', 'harga_jual', 'modal', 'stok', 'satuan', 'terakhir_update'
    ]

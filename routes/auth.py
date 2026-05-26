"""
auth.py - Route autentikasi Google OAuth2.
Menangani login, callback, logout, dan auto-refresh token.
"""

import requests
from flask import Blueprint, redirect, url_for, session, request, flash
from google_auth_oauthlib.flow import Flow
from config import Config
from services import supabase_service
from services.google_sheets import create_spreadsheet, refresh_access_token
from functools import wraps
from datetime import datetime, timedelta

auth_bp = Blueprint('auth', __name__)


def login_required(f):
    """Decorator untuk memastikan user sudah login."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            flash('Silakan login terlebih dahulu.', 'warning')
            return redirect(url_for('auth.login'))
        
        # Auto-refresh token jika mendekati expired
        token_expiry = session.get('token_expiry')
        if token_expiry:
            try:
                expiry_time = datetime.fromisoformat(token_expiry)
                if datetime.now() >= expiry_time - timedelta(minutes=5):
                    # Token akan segera expired, refresh
                    refreshed = _refresh_user_token()
                    if not refreshed:
                        flash('Sesi telah berakhir, silakan login kembali.', 'warning')
                        return redirect(url_for('auth.login'))
            except (ValueError, TypeError):
                pass
        
        return f(*args, **kwargs)
    return decorated_function


def _refresh_user_token():
    """Refresh access token user dari session."""
    google_id = session.get('user', {}).get('google_id')
    if not google_id:
        return False
    
    refresh_token = supabase_service.get_user_refresh_token(google_id)
    if not refresh_token:
        return False
    
    token_data = refresh_access_token(refresh_token)
    if not token_data:
        return False
    
    session['access_token'] = token_data['access_token']
    session['token_expiry'] = (
        datetime.now() + timedelta(seconds=token_data.get('expires_in', 3600))
    ).isoformat()
    
    return True


def _create_oauth_flow():
    """Buat Google OAuth2 flow."""
    flow = Flow.from_client_config(
        client_config={
            'web': {
                'client_id': Config.GOOGLE_CLIENT_ID,
                'client_secret': Config.GOOGLE_CLIENT_SECRET,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            }
        },
        scopes=Config.GOOGLE_SCOPES,
    )
    flow.redirect_uri = url_for('auth.callback', _external=True)
    return flow


@auth_bp.route('/')
def index():
    """Redirect ke dashboard jika sudah login, ke login jika belum."""
    if 'user' in session:
        return redirect(url_for('chat.chat_page'))
    return redirect(url_for('auth.login'))


@auth_bp.route('/login')
def login():
    """Halaman login."""
    if 'user' in session:
        return redirect(url_for('chat.chat_page'))
    return __import__('flask').render_template('login.html')


@auth_bp.route('/auth/google')
def google_login():
    """Mulai proses OAuth2 dengan Google."""
    flow = _create_oauth_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',  # Selalu minta consent untuk mendapat refresh_token
    )
    session['oauth_state'] = state
    return redirect(authorization_url)


@auth_bp.route('/auth/callback')
def callback():
    """Callback dari Google OAuth2 setelah user memberikan izin."""
    try:
        flow = _create_oauth_flow()
        flow.fetch_token(authorization_response=request.url)
        
        credentials = flow.credentials
        access_token = credentials.token
        refresh_token = credentials.refresh_token
        
        # Ambil info user dari Google
        userinfo_response = requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        userinfo = userinfo_response.json()
        
        google_id = userinfo.get('id')
        email = userinfo.get('email')
        name = userinfo.get('name', email)
        picture = userinfo.get('picture', '')
        
        # Cek/buat user di Supabase
        user = supabase_service.get_user_by_google_id(google_id)
        
        if not user:
            # User baru → buat di Supabase
            user = supabase_service.create_user(
                email=email,
                google_id=google_id,
                refresh_token=refresh_token,
            )
        else:
            # Update refresh_token jika ada
            if refresh_token:
                supabase_service.update_user_refresh_token(google_id, refresh_token)
        
        # Cek apakah user sudah punya spreadsheet
        spreadsheet_id = user.get('spreadsheet_id') if user else None
        
        # Validasi: jika spreadsheet_id ada, cek apakah masih valid di Google
        if spreadsheet_id:
            try:
                from services.google_sheets import _build_sheets_service
                svc = _build_sheets_service(access_token)
                svc.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            except Exception:
                # Spreadsheet sudah dihapus atau tidak bisa diakses → reset
                spreadsheet_id = None
        
        if not spreadsheet_id:
            # Buat spreadsheet baru
            try:
                spreadsheet_id = create_spreadsheet(access_token, email)
                supabase_service.update_user_spreadsheet(google_id, spreadsheet_id)
            except Exception as e:
                flash(f'Gagal membuat spreadsheet: {str(e)}', 'danger')
                return redirect(url_for('auth.login'))
        
        # Simpan ke session
        session['user'] = {
            'google_id': google_id,
            'email': email,
            'name': name,
            'picture': picture,
        }
        session['access_token'] = access_token
        session['spreadsheet_id'] = spreadsheet_id
        session['token_expiry'] = (
            datetime.now() + timedelta(seconds=3600)
        ).isoformat()
        
        flash(f'Selamat datang, {name}! 👋', 'success')
        return redirect(url_for('chat.chat_page'))
        
    except Exception as e:
        flash(f'Login gagal: {str(e)}', 'danger')
        return redirect(url_for('auth.login'))


@auth_bp.route('/logout')
def logout():
    """Logout dan hapus session."""
    session.clear()
    flash('Anda telah logout.', 'info')
    return redirect(url_for('auth.login'))

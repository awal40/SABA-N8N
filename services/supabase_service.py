"""
supabase_service.py - Layanan koneksi dan operasi database Supabase.
Mengelola data user, chat history, dan audio storage.
"""

from datetime import datetime, timedelta, timezone
from supabase import create_client
from config import Config


_client = None


def get_client():
    """Return a reusable Supabase client (singleton)."""
    global _client
    if _client is None:
        _client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
    return _client


# ==================== USER OPERATIONS ====================

def get_user_by_google_id(google_id: str) -> dict | None:
    """Ambil data user berdasarkan google_id."""
    client = get_client()
    result = client.table('users').select('*').eq('google_id', google_id).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def create_user(email: str, google_id: str, refresh_token: str = None) -> dict:
    """Buat user baru di Supabase."""
    client = get_client()
    data = {
        'email': email,
        'google_id': google_id,
    }
    if refresh_token:
        data['refresh_token'] = refresh_token
    result = client.table('users').insert(data).execute()
    return result.data[0] if result.data else None


def update_user_spreadsheet(google_id: str, spreadsheet_id: str) -> dict:
    """Update spreadsheet_id user."""
    client = get_client()
    result = (
        client.table('users')
        .update({'spreadsheet_id': spreadsheet_id})
        .eq('google_id', google_id)
        .execute()
    )
    return result.data[0] if result.data else None


def update_user_refresh_token(google_id: str, refresh_token: str) -> dict:
    """Update refresh_token user."""
    client = get_client()
    result = (
        client.table('users')
        .update({'refresh_token': refresh_token})
        .eq('google_id', google_id)
        .execute()
    )
    return result.data[0] if result.data else None


def get_user_spreadsheet_id(google_id: str) -> str | None:
    """Ambil spreadsheet_id user."""
    user = get_user_by_google_id(google_id)
    return user.get('spreadsheet_id') if user else None


def get_user_refresh_token(google_id: str) -> str | None:
    """Ambil refresh_token user."""
    user = get_user_by_google_id(google_id)
    return user.get('refresh_token') if user else None


def get_user_id_by_google_id(google_id: str) -> int | None:
    """Ambil user.id (bigint) dari google_id."""
    user = get_user_by_google_id(google_id)
    return user.get('id') if user else None


# ==================== CHAT HISTORY ====================

def get_chat_history(user_id: int, limit: int = 50) -> list:
    """
    Ambil chat history dari Supabase, ordered by created_at ascending.
    Returns list of chat messages.
    """
    client = get_client()
    result = (
        client.table('chat_history')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def save_chat_message(
    user_id: int,
    role: str,
    message: str,
    audio_url: str = None,
    audio_expires_at: str = None,
) -> dict | None:
    """
    Simpan pesan chat ke Supabase.
    role: 'user' atau 'ai'
    """
    client = get_client()
    data = {
        'user_id': user_id,
        'role': role,
        'message': message,
    }
    if audio_url:
        data['audio_url'] = audio_url
    if audio_expires_at:
        data['audio_expires_at'] = audio_expires_at

    result = client.table('chat_history').insert(data).execute()
    return result.data[0] if result.data else None


def check_deleted_audio(user_id: int) -> bool:
    """
    Cek apakah user memiliki pesan dengan audio yang sudah dihapus
    (role='user', audio_url IS NULL, tapi message ada).
    """
    client = get_client()
    result = (
        client.table('chat_history')
        .select('id')
        .eq('user_id', user_id)
        .eq('role', 'user')
        .is_('audio_url', 'null')
        .limit(1)
        .execute()
    )
    return len(result.data) > 0 if result.data else False


# ==================== AUDIO STORAGE ====================

def upload_audio(user_id: int, audio_bytes: bytes, filename: str) -> str | None:
    """
    Upload audio ke Supabase Storage bucket 'audio'.
    Returns: path di storage (bukan URL).
    """
    client = get_client()
    storage_path = f"{user_id}/{filename}"

    try:
        client.storage.from_('audio').upload(
            path=storage_path,
            file=audio_bytes,
            file_options={"content-type": "audio/webm"},
        )
        return storage_path
    except Exception as e:
        print(f"[Supabase] Upload audio error: {e}")
        return None


def get_audio_signed_url(storage_path: str, expires_in: int = 3600) -> str | None:
    """
    Generate signed URL untuk audio playback.
    expires_in: durasi URL aktif dalam detik (default 1 jam).
    """
    if not storage_path:
        return None
    client = get_client()
    try:
        result = client.storage.from_('audio').create_signed_url(
            path=storage_path,
            expires_in=expires_in,
        )
        return result.get('signedURL') or result.get('signedUrl')
    except Exception as e:
        print(f"[Supabase] Signed URL error: {e}")
        return None


def cleanup_expired_audio():
    """
    Hapus audio yang sudah expired (> 3 hari) dari Supabase Storage.
    Update audio_url menjadi NULL di chat_history.
    Dijalankan oleh APScheduler setiap hari.
    """
    client = get_client()
    now = datetime.now(timezone.utc).isoformat()

    try:
        # Ambil semua chat yang audio-nya sudah expired
        result = (
            client.table('chat_history')
            .select('id, audio_url')
            .not_.is_('audio_url', 'null')
            .lt('audio_expires_at', now)
            .execute()
        )

        if not result.data:
            print("[Scheduler] Tidak ada audio expired.")
            return

        expired_rows = result.data
        print(f"[Scheduler] Ditemukan {len(expired_rows)} audio expired.")

        # Hapus file dari storage
        paths_to_delete = []
        ids_to_update = []
        for row in expired_rows:
            audio_url = row.get('audio_url', '')
            if audio_url:
                paths_to_delete.append(audio_url)
            ids_to_update.append(row['id'])

        if paths_to_delete:
            try:
                client.storage.from_('audio').remove(paths_to_delete)
                print(f"[Scheduler] Dihapus {len(paths_to_delete)} file dari storage.")
            except Exception as e:
                print(f"[Scheduler] Gagal hapus dari storage: {e}")

        # Update audio_url menjadi NULL
        for chat_id in ids_to_update:
            client.table('chat_history').update(
                {'audio_url': None}
            ).eq('id', chat_id).execute()

        print(f"[Scheduler] Updated {len(ids_to_update)} rows audio_url → NULL.")

    except Exception as e:
        print(f"[Scheduler] Cleanup error: {e}")

"""
supabase_service.py - Layanan koneksi dan operasi database Supabase.
Mengelola data user, chat history, dan audio storage.
"""

import logging
import threading
import time
from datetime import datetime, timezone

import httpx
from supabase import create_client
from config import Config


_client = None
_client_lock = threading.Lock()
logger = logging.getLogger(__name__)


class SupabaseTemporaryError(RuntimeError):
    """Koneksi Supabase gagal setelah satu kali pemulihan otomatis."""


def _close_postgrest(client):
    """Tutup pool PostgREST jika pernah dibuat, tanpa membuat pool baru."""
    postgrest = getattr(client, '_postgrest', None)
    if postgrest is None:
        return
    try:
        postgrest.aclose()
    except Exception:
        logger.debug('Gagal menutup client PostgREST lama.', exc_info=True)


def _reset_client(failed_client=None):
    """Buang singleton hanya jika masih menunjuk ke client yang gagal."""
    global _client
    with _client_lock:
        if failed_client is not None and _client is not failed_client:
            return
        old_client = _client
        _client = None
    if old_client is not None:
        _close_postgrest(old_client)


def _execute_with_reconnect(operation, *, retry=True, operation_name='operasi'):
    """
    Jalankan operasi menggunakan client aktif.

    Retry hanya digunakan oleh pemanggil untuk operasi baca atau update yang
    idempoten. Insert harus memakai retry=False agar tidak menghasilkan duplikat.
    """
    attempts = 2 if retry else 1
    for attempt in range(attempts):
        client = get_client()
        try:
            return operation(client)
        except httpx.TransportError as exc:
            _reset_client(client)
            if attempt + 1 < attempts:
                logger.warning(
                    'Koneksi Supabase terputus saat %s; membuat client baru dan mencoba sekali lagi.',
                    operation_name,
                )
                time.sleep(0.2)
                continue
            raise SupabaseTemporaryError(
                'Layanan database sementara tidak dapat dihubungi.'
            ) from exc


def get_client():
    """Return a reusable Supabase client (singleton)."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
    return _client


# ==================== USER OPERATIONS ====================

def get_user_by_google_id(google_id: str) -> dict | None:
    """Ambil data user berdasarkan google_id."""
    result = _execute_with_reconnect(
        lambda client: (
            client.table('users')
            .select('*')
            .eq('google_id', google_id)
            .execute()
        ),
        operation_name='membaca pengguna',
    )
    if result.data and len(result.data) > 0:
        return result.data[0]
    return None


def create_user(email: str, google_id: str, refresh_token: str = None) -> dict:
    """Buat user baru di Supabase."""
    data = {
        'email': email,
        'google_id': google_id,
    }
    if refresh_token:
        data['refresh_token'] = refresh_token
    try:
        result = _execute_with_reconnect(
            lambda client: client.table('users').insert(data).execute(),
            retry=False,
            operation_name='membuat pengguna',
        )
        return result.data[0] if result.data else None
    except SupabaseTemporaryError:
        # Insert mungkin sudah diterima server sebelum respons terputus. Jangan
        # mengulang insert; periksa menggunakan koneksi baru terlebih dahulu.
        existing_user = get_user_by_google_id(google_id)
        if existing_user:
            return existing_user
        raise


def update_user_spreadsheet(google_id: str, spreadsheet_id: str) -> dict:
    """Update spreadsheet_id user."""
    result = _execute_with_reconnect(
        lambda client: (
            client.table('users')
            .update({'spreadsheet_id': spreadsheet_id})
            .eq('google_id', google_id)
            .execute()
        ),
        operation_name='memperbarui spreadsheet pengguna',
    )
    return result.data[0] if result.data else None


def update_user_refresh_token(google_id: str, refresh_token: str) -> dict:
    """Update refresh_token user."""
    result = _execute_with_reconnect(
        lambda client: (
            client.table('users')
            .update({'refresh_token': refresh_token})
            .eq('google_id', google_id)
            .execute()
        ),
        operation_name='memperbarui token pengguna',
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
    result = _execute_with_reconnect(
        lambda client: (
            client.table('chat_history')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', desc=True)
            .limit(limit)
            .execute()
        ),
        operation_name='membaca riwayat chat',
    )
    return list(reversed(result.data or []))


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
    data = {
        'user_id': user_id,
        'role': role,
        'message': message,
    }
    if audio_url:
        data['audio_url'] = audio_url
    if audio_expires_at:
        data['audio_expires_at'] = audio_expires_at

    result = _execute_with_reconnect(
        lambda client: client.table('chat_history').insert(data).execute(),
        retry=False,
        operation_name='menyimpan pesan chat',
    )
    return result.data[0] if result.data else None


def check_deleted_audio(user_id: int) -> bool:
    """
    Cek apakah user memiliki pesan dengan audio yang sudah dihapus
    (role='user', audio_url IS NULL, tapi message ada).
    """
    result = _execute_with_reconnect(
        lambda client: (
            client.table('chat_history')
            .select('id')
            .eq('user_id', user_id)
            .eq('role', 'user')
            .is_('audio_url', 'null')
            .limit(1)
            .execute()
        ),
        operation_name='memeriksa audio kedaluwarsa',
    )
    return len(result.data) > 0 if result.data else False


# ==================== AUDIO STORAGE ====================

def upload_audio(user_id: int, audio_bytes: bytes, filename: str) -> str | None:
    """
    Upload audio ke Supabase Storage bucket 'audio'.
    Returns: path di storage (bukan URL).
    """
    storage_path = f"{user_id}/{filename}"

    try:
        _execute_with_reconnect(
            lambda client: client.storage.from_('audio').upload(
                path=storage_path,
                file=audio_bytes,
                file_options={"content-type": "audio/webm"},
            ),
            retry=False,
            operation_name='mengunggah audio',
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
    try:
        result = _execute_with_reconnect(
            lambda client: client.storage.from_('audio').create_signed_url(
                path=storage_path,
                expires_in=expires_in,
            ),
            operation_name='membuat URL audio',
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
    now = datetime.now(timezone.utc).isoformat()

    try:
        # Ambil semua chat yang audio-nya sudah expired
        result = _execute_with_reconnect(
            lambda client: (
                client.table('chat_history')
                .select('id, audio_url')
                .not_.is_('audio_url', 'null')
                .lt('audio_expires_at', now)
                .execute()
            ),
            operation_name='mencari audio kedaluwarsa',
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
                _execute_with_reconnect(
                    lambda client: client.storage.from_('audio').remove(paths_to_delete),
                    operation_name='menghapus audio kedaluwarsa',
                )
                print(f"[Scheduler] Dihapus {len(paths_to_delete)} file dari storage.")
            except Exception as e:
                print(f"[Scheduler] Gagal hapus dari storage: {e}")

        # Update audio_url menjadi NULL
        for chat_id in ids_to_update:
            _execute_with_reconnect(
                lambda client, current_id=chat_id: (
                    client.table('chat_history')
                    .update({'audio_url': None})
                    .eq('id', current_id)
                    .execute()
                ),
                operation_name='memperbarui status audio',
            )

        print(f"[Scheduler] Updated {len(ids_to_update)} rows audio_url → NULL.")

    except Exception as e:
        print(f"[Scheduler] Cleanup error: {e}")

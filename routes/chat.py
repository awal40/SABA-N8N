"""
chat.py - Route halaman chat dan API chat history.
Menangani tampilan chat, pengiriman audio ke n8n, dan penyimpanan ke Supabase.
"""

import requests
from datetime import datetime, timedelta, timezone
from flask import Blueprint, render_template, session, request, jsonify
from routes.auth import login_required
from services import supabase_service
from config import Config

chat_bp = Blueprint('chat', __name__)


def _get_user_id():
    """Get user_id from session cache, or fetch and cache it."""
    user_id = session.get('user_id')
    if user_id:
        return user_id
    google_id = session.get('user', {}).get('google_id')
    if not google_id:
        return None
    user_id = supabase_service.get_user_id_by_google_id(google_id)
    if user_id:
        session['user_id'] = user_id
    return user_id


@chat_bp.route('/chat')
@login_required
def chat_page():
    """Halaman chat utama (halaman default setelah login)."""
    return render_template('chat.html', user=session.get('user'))


@chat_bp.route('/api/chat/history')
@login_required
def api_chat_history():
    """API endpoint untuk mengambil chat history + check deleted audio."""
    user_id = _get_user_id()
    if not user_id:
        return jsonify({'error': 'User tidak ditemukan'}), 404

    try:
        history = supabase_service.get_chat_history(user_id)

        messages = []
        now = datetime.now(timezone.utc)
        has_deleted = False

        for msg in history:
            item = {
                'id': msg.get('id'),
                'role': msg.get('role'),
                'message': msg.get('message', ''),
                'created_at': msg.get('created_at'),
                'has_audio': False,
                'audio_expired': False,
            }

            audio_url = msg.get('audio_url')
            audio_expires_at = msg.get('audio_expires_at')

            if msg.get('role') == 'user':
                if audio_url:
                    if audio_expires_at:
                        try:
                            expires = datetime.fromisoformat(
                                audio_expires_at.replace('Z', '+00:00')
                            )
                            if now < expires:
                                # Only generate signed URL for non-expired audio
                                signed = supabase_service.get_audio_signed_url(audio_url)
                                if signed:
                                    item['has_audio'] = True
                                    item['audio_url'] = signed
                            else:
                                item['audio_expired'] = True
                                has_deleted = True
                        except (ValueError, TypeError):
                            item['audio_expired'] = True
                            has_deleted = True
                    else:
                        item['audio_expired'] = True
                        has_deleted = True
                elif msg.get('message'):
                    # Has message but no audio_url = audio was deleted
                    item['audio_expired'] = True
                    has_deleted = True

            messages.append(item)

        return jsonify({
            'messages': messages,
            'has_deleted': has_deleted,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/api/chat/send-audio', methods=['POST'])
@login_required
def api_send_audio():
    """API endpoint untuk mengirim audio."""
    if 'file' not in request.files:
        return jsonify({'error': 'File audio tidak ditemukan'}), 400

    audio_file = request.files['file']
    user_id = _get_user_id()
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')

    if not user_id or not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401

    try:
        # 1. Upload audio ke Supabase Storage
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{user_id}_{timestamp}.webm"
        audio_bytes = audio_file.read()

        storage_path = supabase_service.upload_audio(user_id, audio_bytes, filename)

        # 2. Kirim ke n8n webhook dengan timeout 60
        audio_file.seek(0)
        ai_message = ''
        user_message_transcription = ''
        n8n_status = 'error'  # Default if it fails
        
        try:
            n8n_response = requests.post(
                Config.N8N_WEBHOOK_URL,
                files={
                    'file': (audio_file.filename or filename, audio_bytes,
                             audio_file.content_type or 'audio/webm')
                },
                data={
                    'spreadsheet_id': spreadsheet_id,
                    'access_token': access_token,
                },
                timeout=60,
            )
            
            if n8n_response.status_code == 200:
                try:
                    result = n8n_response.json()

                    # === MULTI-TRANSAKSI: n8n mengembalikan Array of Objects ===
                    if isinstance(result, list):
                        messages = []
                        has_error = False
                        transcription = ''

                        for item in result:
                            msg = item.get('message', '')
                            status = item.get('status', 'success')
                            if status == 'error':
                                has_error = True
                            if msg:
                                messages.append(msg)
                            # Ambil transcription dari item pertama yang punya
                            if not transcription:
                                transcription = item.get('transcription', item.get('text', ''))

                        n8n_status = 'error' if has_error else 'success'
                        ai_message = '\n\n'.join(messages) if messages else 'Gagal memproses respons server.'
                        user_message_transcription = transcription

                    # === SINGLE OBJECT: n8n mengembalikan satu Object ===
                    elif isinstance(result, dict):
                        status_flag = result.get('status')
                        message_text = result.get('message')
                        legacy_error = result.get('error') or result.get('errorMessage')

                        if status_flag == 'error':
                            n8n_status = 'error'
                            ai_message = message_text or 'Terjadi kesalahan pada sistem.'
                        elif status_flag == 'success':
                            n8n_status = 'success'
                            ai_message = message_text or 'Data berhasil diproses.'
                        elif legacy_error:
                            n8n_status = 'error'
                            ai_message = f'n8n error: {legacy_error}'
                        else:
                            # Fallback format lama (hanya result, message string)
                            ai_result = result.get('result') or result.get('message') or result.get('output')
                            if ai_result:
                                n8n_status = 'success'
                                ai_message = ai_result
                            else:
                                n8n_status = 'error'
                                ai_message = 'n8n tidak mengembalikan hasil yang dikenali.'

                        user_message_transcription = result.get('transcription', result.get('text', ''))

                    else:
                        # Format tidak dikenali
                        n8n_status = 'error'
                        ai_message = 'Gagal memproses respons server.'
                        user_message_transcription = ''

                except ValueError:
                    text = n8n_response.text.strip()
                    n8n_status = 'success' if text and 'error' not in text.lower() else 'error'
                    ai_message = text if text else 'n8n mengembalikan response kosong.'
            else:
                n8n_status = 'error'
                ai_message = f'Terjadi kesalahan (HTTP {n8n_response.status_code})'

        except requests.exceptions.Timeout:
            n8n_status = 'error'
            ai_message = 'Timeout: n8n tidak merespons dalam waktu 60 detik.'
        except requests.exceptions.ConnectionError:
            n8n_status = 'error'
            ai_message = 'Tidak dapat terhubung ke n8n. Pastikan n8n sudah berjalan.'
        except Exception as e:
            n8n_status = 'error'
            ai_message = f'Error: {str(e)}'

        # 3. Siapkan data untuk disimpan
        audio_expires = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

        user_message = user_message_transcription if user_message_transcription else '🎤 (Audio dikirim)'

        # 4. Simpan ke chat_history
        user_msg = supabase_service.save_chat_message(
            user_id=user_id,
            role='user',
            message=user_message,
            audio_url=storage_path,
            audio_expires_at=audio_expires,
        )

        ai_msg = supabase_service.save_chat_message(
            user_id=user_id,
            role='ai',
            message=ai_message,
        )

        # Generate signed URL untuk response inline
        audio_signed_url = None
        if storage_path:
            audio_signed_url = supabase_service.get_audio_signed_url(storage_path)

        return jsonify({
            'success': True,
            'n8n_status': n8n_status,
            'user_message': {
                'id': user_msg.get('id') if user_msg else None,
                'role': 'user',
                'message': user_message,
                'has_audio': bool(audio_signed_url),
                'audio_url': audio_signed_url,
                'audio_expired': False,
                'created_at': user_msg.get('created_at') if user_msg else None,
            },
            'ai_message': {
                'id': ai_msg.get('id') if ai_msg else None,
                'role': 'ai',
                'message': ai_message,
                'status': n8n_status,
                'created_at': ai_msg.get('created_at') if ai_msg else None,
            },
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chat_bp.route('/api/chat/check-deleted-audio')
@login_required
def api_check_deleted_audio():
    """Kept for backward compat, but history API now includes has_deleted."""
    user_id = _get_user_id()
    if not user_id:
        return jsonify({'has_deleted': False})

    try:
        has_deleted = supabase_service.check_deleted_audio(user_id)
        return jsonify({'has_deleted': has_deleted})
    except Exception:
        return jsonify({'has_deleted': False})

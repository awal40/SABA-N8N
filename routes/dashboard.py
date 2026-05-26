"""
dashboard.py - Route dashboard dan API transaksi suara.
Menampilkan statistik, grafik dengan filter tanggal custom.
"""

from flask import Blueprint, render_template, session, request, jsonify, flash, redirect, url_for
from routes.auth import login_required
from services.google_sheets import get_dashboard_data
from config import Config

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/dashboard')
@login_required
def dashboard():
    """Halaman dashboard utama."""
    return render_template('dashboard.html', user=session.get('user'))


@dashboard_bp.route('/api/dashboard-data')
@login_required
def api_dashboard_data():
    """API endpoint untuk data dashboard (dipanggil via AJAX)."""
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')

    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Sesi tidak valid. Silakan login ulang.'}), 401

    try:
        data = get_dashboard_data(access_token, spreadsheet_id, date_from, date_to)
        return jsonify(data)
    except Exception as e:
        error_msg = str(e)
        # Buat pesan error yang user-friendly
        if 'not found' in error_msg.lower() or '404' in error_msg:
            friendly_msg = 'Spreadsheet tidak ditemukan. Silakan login ulang untuk membuat baru.'
        elif 'forbidden' in error_msg.lower() or '403' in error_msg:
            friendly_msg = 'Akses ke spreadsheet ditolak. Silakan login ulang.'
        elif 'invalid' in error_msg.lower() or '401' in error_msg:
            friendly_msg = 'Token akses tidak valid. Silakan login ulang.'
        else:
            friendly_msg = 'Gagal memuat data. Coba refresh halaman atau login ulang.'
        print(f'[Dashboard API] Error: {error_msg}')
        return jsonify({'error': friendly_msg}), 500


@dashboard_bp.route('/api/transaksi/<int:row_number>', methods=['DELETE'])
@login_required
def api_delete_transaksi(row_number):
    """API endpoint untuk menghapus transaksi."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Sesi tidak valid. Silakan login ulang.'}), 401

    try:
        from services.google_sheets import delete_transaksi
        delete_transaksi(access_token, spreadsheet_id, row_number)
        return jsonify({'success': True})
    except Exception as e:
        print(f'[Dashboard API] Delete transaksi error: {e}')
        return jsonify({'error': 'Gagal menghapus transaksi. Coba lagi.'}), 500


@dashboard_bp.route('/api/produk/<int:row_number>', methods=['DELETE'])
@login_required
def api_delete_produk(row_number):
    """API endpoint untuk menghapus produk."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Sesi tidak valid. Silakan login ulang.'}), 401

    try:
        from services.google_sheets import delete_produk
        delete_produk(access_token, spreadsheet_id, row_number)
        return jsonify({'success': True})
    except Exception as e:
        print(f'[Dashboard API] Delete produk error: {e}')
        return jsonify({'error': 'Gagal menghapus produk. Coba lagi.'}), 500

"""
transaksi.py - Route CRUD transaksi.
Menampilkan daftar transaksi, edit, dan hapus via Google Sheets API.
"""

from flask import Blueprint, render_template, session, request, jsonify
from routes.auth import login_required
from services.google_sheets import get_all_transaksi, update_transaksi, delete_transaksi

transaksi_bp = Blueprint('transaksi', __name__)


@transaksi_bp.route('/transaksi')
@login_required
def transaksi_list():
    """Halaman daftar semua transaksi."""
    return render_template('transaksi_list.html', user=session.get('user'))


@transaksi_bp.route('/api/transaksi-list')
@login_required
def api_transaksi_list():
    """API endpoint untuk daftar transaksi (AJAX)."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    period = request.args.get('period', 'semua')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        transaksi = get_all_transaksi(access_token, spreadsheet_id)
        
        # Filter berdasarkan periode jika diperlukan
        if period != 'semua':
            from datetime import datetime, timedelta
            now = datetime.now()
            filtered = []
            for t in transaksi:
                try:
                    tanggal = datetime.strptime(t.get('tanggal', ''), '%Y-%m-%d')
                except (ValueError, TypeError):
                    try:
                        tanggal = datetime.strptime(t.get('tanggal', ''), '%d/%m/%Y')
                    except (ValueError, TypeError):
                        continue
                
                if period == 'hari' and tanggal.date() == now.date():
                    filtered.append(t)
                elif period == 'minggu':
                    start_week = now - timedelta(days=now.weekday())
                    if tanggal.date() >= start_week.date():
                        filtered.append(t)
                elif period == 'bulan' and tanggal.month == now.month and tanggal.year == now.year:
                    filtered.append(t)
                elif period == 'tahun' and tanggal.year == now.year:
                    filtered.append(t)
            transaksi = filtered
        
        return jsonify({'data': transaksi})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@transaksi_bp.route('/api/transaksi/update', methods=['POST'])
@login_required
def api_update_transaksi():
    """API endpoint untuk update transaksi."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        data = request.get_json()
        row_number = int(data.get('row_number'))
        
        update_transaksi(access_token, spreadsheet_id, row_number, data)
        return jsonify({'success': True, 'message': 'Transaksi berhasil diperbarui!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@transaksi_bp.route('/api/transaksi/delete', methods=['POST'])
@login_required
def api_delete_transaksi():
    """API endpoint untuk hapus transaksi."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        data = request.get_json()
        row_number = int(data.get('row_number'))
        
        delete_transaksi(access_token, spreadsheet_id, row_number)
        return jsonify({'success': True, 'message': 'Transaksi berhasil dihapus!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

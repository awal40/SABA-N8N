"""
produk.py - Route CRUD produk.
Menampilkan daftar produk, tambah, edit, dan hapus via Google Sheets API.
"""

from flask import Blueprint, render_template, session, request, jsonify
from routes.auth import login_required
from services.google_sheets import get_all_produk, add_produk, update_produk, delete_produk

produk_bp = Blueprint('produk', __name__)


@produk_bp.route('/produk')
@login_required
def produk_list():
    """Halaman daftar semua produk."""
    return render_template('produk_list.html', user=session.get('user'))


@produk_bp.route('/api/produk-list')
@login_required
def api_produk_list():
    """API endpoint untuk daftar produk (AJAX)."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        produk = get_all_produk(access_token, spreadsheet_id)
        return jsonify({'data': produk})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@produk_bp.route('/api/produk/add', methods=['POST'])
@login_required
def api_add_produk():
    """API endpoint untuk tambah produk baru."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        data = request.get_json()
        add_produk(access_token, spreadsheet_id, data)
        return jsonify({'success': True, 'message': 'Produk berhasil ditambahkan!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@produk_bp.route('/api/produk/update', methods=['POST'])
@login_required
def api_update_produk():
    """API endpoint untuk update produk."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        data = request.get_json()
        row_number = int(data.get('row_number'))
        
        update_produk(access_token, spreadsheet_id, row_number, data)
        return jsonify({'success': True, 'message': 'Produk berhasil diperbarui!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@produk_bp.route('/api/produk/delete', methods=['POST'])
@login_required
def api_delete_produk():
    """API endpoint untuk hapus produk."""
    access_token = session.get('access_token')
    spreadsheet_id = session.get('spreadsheet_id')
    
    if not access_token or not spreadsheet_id:
        return jsonify({'error': 'Session tidak valid'}), 401
    
    try:
        data = request.get_json()
        row_number = int(data.get('row_number'))
        
        delete_produk(access_token, spreadsheet_id, row_number)
        return jsonify({'success': True, 'message': 'Produk berhasil dihapus!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

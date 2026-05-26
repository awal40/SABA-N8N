"""
google_sheets.py - Layanan Google Sheets API.
Mengelola pembuatan spreadsheet, CRUD data transaksi & produk,
dan auto-refresh access token menggunakan refresh_token.
"""

import requests
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from config import Config


def _build_sheets_service(access_token: str):
    """Buat Google Sheets API service dari access_token."""
    creds = Credentials(token=access_token)
    return build('sheets', 'v4', credentials=creds)


def _build_drive_service(access_token: str):
    """Buat Google Drive API service dari access_token."""
    creds = Credentials(token=access_token)
    return build('drive', 'v3', credentials=creds)


def refresh_access_token(refresh_token: str) -> dict:
    """
    Refresh access_token menggunakan refresh_token.
    Returns dict dengan 'access_token' dan 'expires_in'.
    """
    response = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': Config.GOOGLE_CLIENT_ID,
        'client_secret': Config.GOOGLE_CLIENT_SECRET,
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token',
    })
    if response.status_code == 200:
        return response.json()
    return None


def _build_format_requests(sheet_id: int, sheet_name: str) -> list:
    """
    Buat list request formatting untuk satu sheet:
    - Header (baris 1): background BIRU, teks PUTIH, bold
    - Freeze baris header
    - Format otomatis untuk kolom Tanggal dan Waktu
    """
    requests_list = [
        # 0) SOLUSI KUNCI: Set baris 2 sampai ribuan menjadi PUTIH & Teks Normal
        # Ini akan memutus rantai pewarisan warna biru dari header.
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 1, # Dimulai dari baris ke-2 (index 1)
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 1.0, 'green': 1.0, 'blue': 1.0},
                        'textFormat': {
                            'foregroundColor': {'red': 0.0, 'green': 0.0, 'blue': 0.0},
                            'bold': False
                        },
                    },
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat)',
            },
        },
        # 1) Set header background BIRU hanya baris 1 (Tetap seperti kodemu)
        {
            'repeatCell': {
                'range': {
                    'sheetId': sheet_id,
                    'startRowIndex': 0,
                    'endRowIndex': 1,
                },
                'cell': {
                    'userEnteredFormat': {
                        'backgroundColor': {'red': 0.082, 'green': 0.396, 'blue': 0.753},
                        'textFormat': {
                            'foregroundColor': {'red': 1.0, 'green': 1.0, 'blue': 1.0},
                            'bold': True,
                        },
                    },
                },
                'fields': 'userEnteredFormat(backgroundColor,textFormat)',
            },
        },
        # 2) Freeze baris header (Tetap seperti kodemu)
        {
            'updateSheetProperties': {
                'properties': {
                    'sheetId': sheet_id,
                    'gridProperties': {'frozenRowCount': 1},
                },
                'fields': 'gridProperties.frozenRowCount',
            },
        },
    ]

    # ================= TAMBAHAN FORMAT TANGGAL & WAKTU =================
    if sheet_name == 'produk':
        # Format Kolom F (Index 5) sebagai Tanggal di sheet Produk
        requests_list.append({
            'repeatCell': {
                'range': {'sheetId': sheet_id, 'startColumnIndex': 5, 'endColumnIndex': 6},
                'cell': {
                    'userEnteredFormat': {'numberFormat': {'type': 'DATE', 'pattern': 'dd/MM/yyyy'}}
                },
                'fields': 'userEnteredFormat.numberFormat'
            }
        })

    elif sheet_name == 'transaksi':
        # Format Kolom A (Index 0) sebagai Tanggal di sheet Transaksi
        requests_list.append({
            'repeatCell': {
                'range': {'sheetId': sheet_id, 'startColumnIndex': 0, 'endColumnIndex': 1},
                'cell': {
                    'userEnteredFormat': {'numberFormat': {'type': 'DATE', 'pattern': 'dd/MM/yyyy'}}
                },
                'fields': 'userEnteredFormat.numberFormat'
            }
        })
        # Format Kolom B (Index 1) sebagai Waktu di sheet Transaksi
        requests_list.append({
            'repeatCell': {
                'range': {'sheetId': sheet_id, 'startColumnIndex': 1, 'endColumnIndex': 2},
                'cell': {
                    'userEnteredFormat': {'numberFormat': {'type': 'TIME', 'pattern': 'HH:mm'}}
                },
                'fields': 'userEnteredFormat.numberFormat'
            }
        })

    return requests_list


def create_spreadsheet(access_token: str, user_email: str) -> str:
    """
    Buat Google Spreadsheet baru untuk user UMKM.
    Membuat 2 sheet: transaksi, produk.
    Returns spreadsheet_id.
    """
    service = _build_sheets_service(access_token)

    # Buat spreadsheet dengan 2 sheets (tanpa dashboard)
    spreadsheet_body = {
        'properties': {
            'title': f'UMKM Data - {user_email}',
        },
        'sheets': [
            {
                'properties': {
                    'title': 'transaksi',
                    'index': 0,
                },
            },
            {
                'properties': {
                    'title': 'produk',
                    'index': 1,
                },
            },
        ],
    }

    spreadsheet = service.spreadsheets().create(
        body=spreadsheet_body
    ).execute()

    spreadsheet_id = spreadsheet['spreadsheetId']

    # Tambah headers ke sheet transaksi (A1:G1)
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range='transaksi!A1:G1',
        valueInputOption='RAW',
        body={
            'values': [Config.SHEET_TRANSAKSI_HEADERS],
        },
    ).execute()

    # Tambah headers ke sheet produk (A1:F1) — sekarang 6 kolom termasuk 'stok'
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range='produk!A1:F1',
        valueInputOption='RAW',
        body={
            'values': [Config.SHEET_PRODUK_HEADERS],
        },
    ).execute()

    # Ambil sheet IDs
    sheet_ids = {}
    for sheet in spreadsheet['sheets']:
        sheet_ids[sheet['properties']['title']] = sheet['properties']['sheetId']

    # Format header: BIRU baris 1, PUTIH baris 2+, freeze header
    format_requests = []
    for sheet_name in ['transaksi', 'produk']:
        format_requests.extend(_build_format_requests(sheet_ids[sheet_name], sheet_name))

    if format_requests:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={'requests': format_requests},
        ).execute()

    return spreadsheet_id


# ==================== CRUD TRANSAKSI ====================

def get_all_transaksi(access_token: str, spreadsheet_id: str) -> list:
    """Ambil semua data transaksi dari Google Sheets."""
    service = _build_sheets_service(access_token)
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range='transaksi!A:G',
    ).execute()

    values = result.get('values', [])
    if len(values) <= 1:  # Hanya header atau kosong
        return []

    headers = values[0]
    transaksi_list = []
    for i, row in enumerate(values[1:], start=2):  # start=2 karena row 1 = header
        item = {'row_number': i}
        for j, header in enumerate(headers):
            item[header] = row[j] if j < len(row) else ''
        transaksi_list.append(item)

    return transaksi_list


def update_transaksi(access_token: str, spreadsheet_id: str, row_number: int, data: dict):
    """Update satu baris transaksi berdasarkan row_number."""
    service = _build_sheets_service(access_token)
    values = [
        data.get('tanggal', ''),
        data.get('waktu', ''),
        data.get('produk', ''),
        data.get('jumlah', ''),
        data.get('satuan', ''),
        data.get('harga_jual', ''),
        data.get('total', ''),
    ]
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f'transaksi!A{row_number}:G{row_number}',
        valueInputOption='USER_ENTERED',
        body={'values': [values]},
    ).execute()


def delete_transaksi(access_token: str, spreadsheet_id: str, row_number: int):
    """Hapus satu baris transaksi berdasarkan row_number."""
    service = _build_sheets_service(access_token)

    # Dapatkan sheetId untuk sheet 'transaksi'
    spreadsheet = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
    ).execute()

    sheet_id = None
    for sheet in spreadsheet['sheets']:
        if sheet['properties']['title'] == 'transaksi':
            sheet_id = sheet['properties']['sheetId']
            break

    if sheet_id is not None:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={
                'requests': [
                    {
                        'deleteDimension': {
                            'range': {
                                'sheetId': sheet_id,
                                'dimension': 'ROWS',
                                'startIndex': row_number - 1,  # 0-indexed
                                'endIndex': row_number,
                            },
                        },
                    },
                ],
            },
        ).execute()


# ==================== CRUD PRODUK ====================

def get_all_produk(access_token: str, spreadsheet_id: str) -> list:
    """Ambil semua data produk dari Google Sheets."""
    service = _build_sheets_service(access_token)
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range='produk!A:F',
    ).execute()

    values = result.get('values', [])
    if len(values) <= 1:
        return []

    headers = values[0]
    produk_list = []
    for i, row in enumerate(values[1:], start=2):
        item = {'row_number': i}
        for j, header in enumerate(headers):
            item[header] = row[j] if j < len(row) else ''
        produk_list.append(item)

    return produk_list


def add_produk(access_token: str, spreadsheet_id: str, data: dict):
    """Tambah produk baru ke Google Sheets."""
    service = _build_sheets_service(access_token)
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    values = [
        data.get('nama_produk', ''),
        data.get('harga_jual', ''),
        data.get('modal', ''),
        data.get('stok', ''),
        data.get('satuan', ''),
        now,  # terakhir_update
    ]
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range='produk!A:F',
        valueInputOption='USER_ENTERED',
        insertDataOption='INSERT_ROWS',
        body={'values': [values]},
    ).execute()


def update_produk(access_token: str, spreadsheet_id: str, row_number: int, data: dict):
    """Update satu baris produk berdasarkan row_number."""
    service = _build_sheets_service(access_token)
    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    values = [
        data.get('nama_produk', ''),
        data.get('harga_jual', ''),
        data.get('modal', ''),
        data.get('stok', ''),
        data.get('satuan', ''),
        now,
    ]
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f'produk!A{row_number}:F{row_number}',
        valueInputOption='USER_ENTERED',
        body={'values': [values]},
    ).execute()


def delete_produk(access_token: str, spreadsheet_id: str, row_number: int):
    """Hapus satu baris produk berdasarkan row_number."""
    service = _build_sheets_service(access_token)

    spreadsheet = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
    ).execute()

    sheet_id = None
    for sheet in spreadsheet['sheets']:
        if sheet['properties']['title'] == 'produk':
            sheet_id = sheet['properties']['sheetId']
            break

    if sheet_id is not None:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={
                'requests': [
                    {
                        'deleteDimension': {
                            'range': {
                                'sheetId': sheet_id,
                                'dimension': 'ROWS',
                                'startIndex': row_number - 1,
                                'endIndex': row_number,
                            },
                        },
                    },
                ],
            },
        ).execute()


# ==================== DASHBOARD DATA ====================

def get_dashboard_data(access_token: str, spreadsheet_id: str, date_from: str = '', date_to: str = '') -> dict:
    """
    Ambil data untuk dashboard berdasarkan rentang tanggal.
    OPTIMIZED: 1x batchGet instead of 2x sequential API calls.
    """
    service = _build_sheets_service(access_token)

    # === SATU panggilan API untuk ambil kedua sheet sekaligus ===
    batch_result = service.spreadsheets().values().batchGet(
        spreadsheetId=spreadsheet_id,
        ranges=['transaksi!A:G', 'produk!A:F'],
    ).execute()

    value_ranges = batch_result.get('valueRanges', [])

    # Parse transaksi
    transaksi_values = value_ranges[0].get('values', []) if len(value_ranges) > 0 else []
    transaksi = []
    if len(transaksi_values) > 1:
        headers_t = transaksi_values[0]
        for i, row in enumerate(transaksi_values[1:], start=2):
            item = {'row_number': i}
            for j, header in enumerate(headers_t):
                item[header] = row[j] if j < len(row) else ''
            transaksi.append(item)

    # Parse produk
    produk_values = value_ranges[1].get('values', []) if len(value_ranges) > 1 else []
    produk = []
    if len(produk_values) > 1:
        headers_p = produk_values[0]
        for i, row in enumerate(produk_values[1:], start=2):
            item = {'row_number': i}
            for j, header in enumerate(headers_p):
                item[header] = row[j] if j < len(row) else ''
            produk.append(item)

    # Parse date range
    d_from = None
    d_to = None
    if date_from:
        try:
            d_from = datetime.strptime(date_from, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    if date_to:
        try:
            d_to = datetime.strptime(date_to, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass

    # Default: hari ini jika tidak ada filter
    if not d_from and not d_to:
        d_from = d_to = datetime.now().date()

    # Filter transaksi berdasarkan rentang tanggal
    filtered = []
    for t in transaksi:
        try:
            tanggal = datetime.strptime(t.get('tanggal', ''), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            try:
                tanggal = datetime.strptime(t.get('tanggal', ''), '%d/%m/%Y').date()
            except (ValueError, TypeError):
                continue

        include = True
        if d_from and tanggal < d_from:
            include = False
        if d_to and tanggal > d_to:
            include = False

        if include:
            filtered.append(t)

    # Hitung statistik
    total_penjualan = 0
    produk_counter = {}
    daily_sales = {}

    for t in filtered:
        try:
            total = float(str(t.get('total', '0')).replace(',', '').replace('.', '', str(t.get('total', '0')).count('.') - 1) if '.' in str(t.get('total', '0')) else str(t.get('total', '0')).replace(',', ''))
        except (ValueError, TypeError):
            total = 0
        total_penjualan += total

        # Hitung produk terlaris
        nama_produk = t.get('produk', 'Unknown')
        jumlah = 0
        try:
            jumlah = float(str(t.get('jumlah', '0')).replace(',', ''))
        except (ValueError, TypeError):
            jumlah = 0
        produk_counter[nama_produk] = produk_counter.get(nama_produk, 0) + jumlah

        # Hitung penjualan harian
        tanggal_str = t.get('tanggal', '')
        daily_sales[tanggal_str] = daily_sales.get(tanggal_str, 0) + total

    # Produk terlaris
    produk_terlaris = '-'
    if produk_counter:
        produk_terlaris = max(produk_counter, key=produk_counter.get)

    # Hitung margin per produk
    produk_dict = {p.get('nama_produk', ''): p for p in produk}

    margin_data = []
    for nama, count in produk_counter.items():
        if nama in produk_dict:
            try:
                harga_jual = float(str(produk_dict[nama].get('harga_jual', '0')).replace(',', ''))
                modal = float(str(produk_dict[nama].get('modal', '0')).replace(',', ''))
                margin = (harga_jual - modal) * count
                margin_data.append({
                    'nama_produk': nama,
                    'margin': margin,
                    'harga_jual': harga_jual,
                    'modal': modal,
                    'jumlah_terjual': count,
                })
            except (ValueError, TypeError):
                pass

    # Sort daily sales by date
    sorted_daily = sorted(daily_sales.items())

    # Hitung total margin
    total_margin = sum(m.get('margin', 0) for m in margin_data)

    # Stok menipis: produk dengan stok < 5
    STOK_MENIPIS_THRESHOLD = 5
    stok_menipis = []
    for p in produk:
        try:
            stok_val = float(str(p.get('stok', '0')).replace(',', '') or '0')
        except (ValueError, TypeError):
            stok_val = 0
        if stok_val < STOK_MENIPIS_THRESHOLD:
            stok_menipis.append({
                'nama_produk': p.get('nama_produk', ''),
                'stok': stok_val,
                'satuan': p.get('satuan', ''),
                'row_number': p.get('row_number', 0),
            })

    return {
        'total_penjualan': total_penjualan,
        'jumlah_transaksi': len(filtered),
        'produk_terlaris': produk_terlaris,
        'total_margin': total_margin,
        'margin_data': margin_data,
        'daily_labels': [d[0] for d in sorted_daily],
        'daily_values': [d[1] for d in sorted_daily],
        'transaksi_terbaru': filtered[-10:] if filtered else [],
        'transaksi_list': filtered,
        'produk_list': produk,
        'stok_menipis': stok_menipis,
    }


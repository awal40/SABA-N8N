/**
 * dashboard.js - Dashboard data loading dan Chart.js visualisasi.
 * Menggunakan date range filter (date_from / date_to) dengan shortcut buttons dan flatpickr.
 * Includes: stok menipis alert, ringkasan stok progress bars, stok column in produk table.
 */

(function () {
    'use strict';

    let salesChart = null;
    let marginChart = null;
    let dateFrom = '';
    let dateTo = '';

    // Warna chart
    const COLORS = {
        primary: '#6366f1',
        primaryLight: 'rgba(99, 102, 241, 0.15)',
        accent: '#06b6d4',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        purple: '#a855f7',
        pink: '#ec4899',
        chartPalette: [
            '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
            '#ef4444', '#a855f7', '#ec4899', '#14b8a6',
            '#f97316', '#8b5cf6',
        ],
        gridColor: 'rgba(148, 163, 184, 0.08)',
        textColor: '#94a3b8',
    };

    // ==================== FORMAT HELPERS ====================

    /**
     * Format stok value: tampilkan desimal jika ada, hilangkan jika bulat.
     */
    function formatStok(stok) {
        const num = parseFloat(stok);
        if (isNaN(num)) return '0';
        return num % 1 === 0 ? num.toFixed(0) : num.toFixed(1);
    }

    /**
     * Mendapatkan level stok untuk styling:
     * > 10: 'ok' (hijau), 5-10: 'warning' (kuning), < 5: 'danger' (merah)
     */
    function getStokLevel(stok) {
        const num = parseFloat(stok) || 0;
        if (num > 10) return 'ok';
        if (num >= 5) return 'warning';
        return 'danger';
    }

    // ==================== DATE HELPERS ====================

    function toDateStr(d) {
        const yr = d.getFullYear();
        const mn = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        return `${yr}-${mn}-${dy}`;
    }

    function getShortcutDates(shortcut) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let from, to;

        switch (shortcut) {
            case 'hari_ini':
                from = to = toDateStr(today);
                break;
            case 'kemarin': {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                from = to = toDateStr(yesterday);
                break;
            }
            case '7hari': {
                const d7 = new Date(today);
                d7.setDate(d7.getDate() - 6);
                from = toDateStr(d7);
                to = toDateStr(today);
                break;
            }
            case '30hari': {
                const d30 = new Date(today);
                d30.setDate(d30.getDate() - 29);
                from = toDateStr(d30);
                to = toDateStr(today);
                break;
            }
            case 'bulan_ini':
                from = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
                to = toDateStr(today);
                break;
            default:
                from = to = toDateStr(today);
        }
        return { from, to };
    }

    // ==================== DATA LOADING ====================

    function loadDashboardData() {
        const params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);

        fetch(`/api/dashboard-data?${params.toString()}`)
            .then(r => {
                // Handle HTTP errors (401, 500, dll)
                if (r.status === 401) {
                    showToast('warning', 'Sesi habis, silakan login ulang.');
                    setTimeout(() => { window.location.href = '/login'; }, 1500);
                    return null;
                }
                if (!r.ok) {
                    throw new Error(`Server error (${r.status})`);
                }
                return r.json();
            })
            .then(data => {
                if (!data) return; // null dari 401 redirect
                if (data.error) {
                    console.error('[Dashboard] Error:', data.error);
                    showToast('error', data.error);
                    return;
                }
                updateStats(data);
                updateSalesChart(data);
                updateMarginChart(data);
                updateTransaksiTable(data);
                updateProdukTable(data);
                updateStokMenipis(data);
                updateRingkasanStok(data);
            })
            .catch(err => {
                console.error('[Dashboard] Fetch error:', err);
                showToast('error', 'Gagal memuat data dashboard. Coba refresh halaman.');
            });
    }

    // Expose ke global scope
    window.loadDashboardData = loadDashboardData;

    // ==================== STATS CARDS ====================

    function updateStats(data) {
        animateValue('stat-penjualan', formatCurrency(data.total_penjualan || 0));
        animateValue('stat-transaksi', String(data.jumlah_transaksi || 0));
        animateValue('stat-produk', data.produk_terlaris || '-');

        // Gunakan total_margin dari backend jika ada, fallback ke kalkulasi lokal
        let totalMargin = data.total_margin || 0;
        if (!totalMargin && data.margin_data) {
            data.margin_data.forEach(m => { totalMargin += m.margin || 0; });
        }
        animateValue('stat-margin', formatCurrency(totalMargin));
    }

    function animateValue(elementId, newValue) {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(() => {
            el.textContent = newValue;
            el.style.transition = 'all 0.3s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 150);
    }

    // ==================== STOK MENIPIS ALERT ====================

    function updateStokMenipis(data) {
        const card = document.getElementById('stok-alert-card');
        const container = document.getElementById('stok-alert-items');
        if (!card || !container) return;

        const stokMenipis = data.stok_menipis || [];

        if (stokMenipis.length === 0) {
            card.classList.remove('show');
            return;
        }

        card.classList.add('show');

        container.innerHTML = stokMenipis.map(item => {
            const stokStr = formatStok(item.stok);
            const satuan = escapeHtml(item.satuan || '');
            const nama = escapeHtml(item.nama_produk || '-');
            return `
                <div class="stok-alert-badge">
                    <i class="bi bi-exclamation-circle-fill"></i>
                    <span>${nama}: ${stokStr} ${satuan}</span>
                </div>
            `;
        }).join('');
    }

    // ==================== RINGKASAN STOK ====================

    function updateRingkasanStok(data) {
        const container = document.getElementById('stok-summary');
        if (!container) return;

        const produkList = data.produk_list || [];

        if (produkList.length === 0) {
            container.innerHTML = `
                <div class="stok-empty-state">
                    <i class="bi bi-box-seam"></i>
                    <span>Belum ada data produk</span>
                </div>
            `;
            return;
        }

        // Cari stok tertinggi untuk progress bar relative
        let maxStok = 0;
        const stokData = produkList.map(p => {
            const stokVal = parseFloat(String(p.stok || '0').replace(/,/g, '') || '0') || 0;
            if (stokVal > maxStok) maxStok = stokVal;
            return {
                nama: p.nama_produk || '-',
                stok: stokVal,
                satuan: p.satuan || '',
            };
        });

        // Fallback jika semua stok 0
        if (maxStok === 0) maxStok = 1;

        container.innerHTML = stokData.map(item => {
            const pct = Math.min((item.stok / maxStok) * 100, 100);
            const pctRounded = Math.round(pct);
            const level = getStokLevel(item.stok);
            const stokStr = formatStok(item.stok);

            let statusIcon, statusLabel;
            if (level === 'ok') {
                statusIcon = '<i class="bi bi-check-circle-fill" style="color:#10b981;"></i>';
                statusLabel = 'Aman';
            } else if (level === 'warning') {
                statusIcon = '<i class="bi bi-exclamation-triangle-fill" style="color:#f59e0b;"></i>';
                statusLabel = 'Rendah';
            } else {
                statusIcon = '<i class="bi bi-exclamation-circle-fill" style="color:#ef4444;"></i>';
                statusLabel = 'Kritis';
            }

            return `
                <div class="stok-item">
                    <div class="stok-item-info">
                        <span class="stok-item-name" title="${escapeHtml(item.nama)}">
                            ${statusIcon}
                            ${escapeHtml(item.nama)}
                        </span>
                        <span class="stok-item-status text-${level}">${statusLabel}</span>
                    </div>
                    <div class="stok-item-bar-container">
                        <div class="stok-progress">
                            <div class="stok-progress-fill fill-${level}" data-width="${pct}"></div>
                        </div>
                        <div class="stok-bar-labels">
                            <span></span>
                            <span class="stok-item-value text-${level}">
                                ${stokStr} ${escapeHtml(item.satuan)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Animate progress bars
        requestAnimationFrame(() => {
            setTimeout(() => {
                container.querySelectorAll('.stok-progress-fill').forEach(bar => {
                    const width = bar.getAttribute('data-width');
                    bar.style.width = width + '%';
                });
            }, 50);
        });
    }

    // ==================== SALES CHART ====================

    function updateSalesChart(data) {
        const ctx = document.getElementById('salesChart');
        if (!ctx) return;

        const labels = data.daily_labels || [];
        const values = data.daily_values || [];

        // Detect theme for chart colors
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const pointBorderColor = isDark ? '#1e293b' : '#ffffff';

        if (salesChart) {
            salesChart.data.labels = labels;
            salesChart.data.datasets[0].data = values;
            salesChart.data.datasets[0].pointBorderColor = pointBorderColor;
            salesChart.update('none');
            return;
        }

        salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Penjualan (Rp)',
                    data: values,
                    borderColor: COLORS.primary,
                    backgroundColor: COLORS.primaryLight,
                    borderWidth: 2.5,
                    pointBackgroundColor: COLORS.primary,
                    pointBorderColor: pointBorderColor,
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: isDark ? '#f1f5f9' : '#0f172a',
                        bodyColor: isDark ? '#94a3b8' : '#475569',
                        borderColor: 'rgba(148, 163, 184, 0.12)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        callbacks: {
                            label: ctx => 'Penjualan: ' + formatCurrency(ctx.parsed.y),
                        }
                    },
                },
                scales: {
                    x: {
                        grid: { color: COLORS.gridColor },
                        ticks: { color: COLORS.textColor, font: { size: 11 }, maxRotation: 45 },
                    },
                    y: {
                        grid: { color: COLORS.gridColor },
                        ticks: {
                            color: COLORS.textColor,
                            font: { size: 11 },
                            callback: val => 'Rp ' + (val / 1000) + 'k',
                        },
                        beginAtZero: true,
                    },
                },
            }
        });
    }

    // ==================== MARGIN CHART ====================

    function updateMarginChart(data) {
        const ctx = document.getElementById('marginChart');
        if (!ctx) return;

        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const borderColor = isDark ? '#1e293b' : '#ffffff';

        const marginData = data.margin_data || [];
        const labels = marginData.map(m => m.nama_produk);
        const values = marginData.map(m => m.margin || 0);
        const colors = marginData.map((_, i) => COLORS.chartPalette[i % COLORS.chartPalette.length]);

        if (marginChart) {
            marginChart.data.labels = labels;
            marginChart.data.datasets[0].data = values;
            marginChart.data.datasets[0].backgroundColor = colors;
            marginChart.data.datasets[0].borderColor = borderColor;
            marginChart.update('none');
        } else {
            marginChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data: values,
                        backgroundColor: colors,
                        borderColor: borderColor,
                        borderWidth: 2,
                        hoverOffset: 6,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            titleColor: isDark ? '#f1f5f9' : '#0f172a',
                            bodyColor: isDark ? '#94a3b8' : '#475569',
                            borderColor: 'rgba(148, 163, 184, 0.12)',
                            borderWidth: 1,
                            cornerRadius: 8,
                            padding: 12,
                            callbacks: {
                                label: ctx => ctx.label + ': ' + formatCurrency(ctx.parsed),
                            }
                        },
                    },
                },
            });
        }

        // Custom legend
        const legendContainer = document.getElementById('margin-legend');
        if (legendContainer) {
            if (marginData.length === 0) {
                legendContainer.innerHTML = '<p class="text-muted text-center mb-0">Belum ada data margin</p>';
            } else {
                legendContainer.innerHTML = marginData.map((m, i) => `
                    <div class="margin-legend-item">
                        <span class="margin-legend-color" style="background:${colors[i]}"></span>
                        <span class="flex-grow-1">${m.nama_produk}</span>
                        <strong>${formatCurrency(m.margin)}</strong>
                    </div>
                `).join('');
            }
        }
    }

    // ==================== DATA TABLES ====================

    function updateTransaksiTable(data) {
        const tbody = document.getElementById('transaksi-body');
        if (!tbody) return;

        const transaksi = data.transaksi_list || [];

        if (transaksi.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4">
                        <i class="bi bi-inbox fs-2 text-muted d-block mb-2"></i>
                        <span class="text-muted">Belum ada transaksi pada periode ini</span>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = transaksi.map((t, idx) => {
            const jumlahStr = escapeHtml(String(t.jumlah || '0'));
            const satuanStr = escapeHtml(t.satuan || '');
            const qtyDisplay = `${jumlahStr} ${satuanStr}`.trim();

            return `
                <tr>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <span class="trx-number">${idx + 1}</span>
                            <strong>${escapeHtml(t.produk || '-')}</strong>
                        </div>
                    </td>
                    <td>${escapeHtml(t.tanggal || '-')}</td>
                    <td>${escapeHtml(t.waktu || '-')}</td>
                    <td class="text-center">
                        <span class="qty-badge">${qtyDisplay}</span>
                    </td>
                    <td class="text-end">${formatCurrency(t.harga_jual)}</td>
                    <td class="text-end"><strong class="text-success">${formatCurrency(t.total)}</strong></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger btn-delete-transaksi" data-row="${t.row_number}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach event listeners
        tbody.querySelectorAll('.btn-delete-transaksi').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = this.dataset.row;
                deleteTransaksi(row);
            });
        });
    }

    function updateProdukTable(data) {
        const tbody = document.getElementById('produk-body');
        if (!tbody) return;

        const produk = data.produk_list || [];

        if (produk.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4">
                        <i class="bi bi-box-seam fs-2 text-muted d-block mb-2"></i>
                        <span class="text-muted">Belum ada data produk</span>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = produk.map(p => {
            const stokVal = parseFloat(String(p.stok || '0').replace(/,/g, '') || '0') || 0;
            const stokStr = formatStok(stokVal);
            const level = getStokLevel(stokVal);
            const satuan = escapeHtml(p.satuan || '');

            let stokIcon = '';
            if (level === 'ok') {
                stokIcon = '<i class="bi bi-check-circle-fill"></i>';
            } else if (level === 'warning') {
                stokIcon = '<i class="bi bi-exclamation-triangle-fill"></i>';
            } else {
                stokIcon = '<i class="bi bi-exclamation-circle-fill"></i>';
            }

            // Hitung margin per unit
            let hargaJual = 0, modal = 0, marginPerUnit = 0;
            try {
                hargaJual = parseFloat(String(p.harga_jual || '0').replace(/,/g, '')) || 0;
                modal = parseFloat(String(p.modal || '0').replace(/,/g, '')) || 0;
                marginPerUnit = hargaJual - modal;
            } catch(e) {}

            const marginClass = marginPerUnit > 0 ? 'text-success' : marginPerUnit < 0 ? 'text-danger' : 'text-muted';
            const marginPrefix = marginPerUnit > 0 ? '+' : '';

            return `
                <tr>
                    <td><strong>${escapeHtml(p.nama_produk || '-')}</strong></td>
                    <td class="text-end">${formatCurrency(p.harga_jual)}</td>
                    <td class="text-end">${formatCurrency(p.modal)}</td>
                    <td class="text-end"><strong class="${marginClass}">${marginPrefix}${formatCurrency(marginPerUnit)}</strong></td>
                    <td class="text-center">
                        <span class="stok-badge stok-${level}">
                            ${stokIcon}
                            ${stokStr} ${satuan}
                        </span>
                    </td>
                    <td>${escapeHtml(p.terakhir_update || '-')}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger btn-delete-produk" data-row="${p.row_number}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach event listeners
        tbody.querySelectorAll('.btn-delete-produk').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = this.dataset.row;
                deleteProduk(row);
            });
        });
    }

    // ==================== DELETE ACTIONS ====================

    function deleteTransaksi(rowNumber) {
        Swal.fire({
            title: 'Hapus Transaksi?',
            text: "Data yang dihapus tidak dapat dikembalikan!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, hapus!',
            cancelButtonText: 'Batal',
            background: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
        }).then((result) => {
            if (result.isConfirmed) {
                showToast('info', 'Menghapus transaksi...');
                fetch(`/api/transaksi/${rowNumber}`, { method: 'DELETE' })
                    .then(r => {
                        if (r.status === 401) {
                            showToast('warning', 'Sesi habis, silakan login ulang.');
                            setTimeout(() => { window.location.href = '/login'; }, 1500);
                            return null;
                        }
                        return r.json();
                    })
                    .then(res => {
                        if (!res) return;
                        if (res.success) {
                            showToast('success', 'Transaksi berhasil dihapus');
                            loadDashboardData();
                        } else {
                            showToast('error', res.error || 'Gagal menghapus transaksi');
                        }
                    })
                    .catch(err => {
                        console.error('[Dashboard] Delete transaksi error:', err);
                        showToast('error', 'Gagal menghapus transaksi. Coba lagi.');
                    });
            }
        });
    }

    function deleteProduk(rowNumber) {
        Swal.fire({
            title: 'Hapus Produk?',
            text: "Data produk ini akan dihapus dari sistem!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, hapus!',
            cancelButtonText: 'Batal',
            background: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
        }).then((result) => {
            if (result.isConfirmed) {
                showToast('info', 'Menghapus produk...');
                fetch(`/api/produk/${rowNumber}`, { method: 'DELETE' })
                    .then(r => {
                        if (r.status === 401) {
                            showToast('warning', 'Sesi habis, silakan login ulang.');
                            setTimeout(() => { window.location.href = '/login'; }, 1500);
                            return null;
                        }
                        return r.json();
                    })
                    .then(res => {
                        if (!res) return;
                        if (res.success) {
                            showToast('success', 'Produk berhasil dihapus');
                            loadDashboardData();
                        } else {
                            showToast('error', res.error || 'Gagal menghapus produk');
                        }
                    })
                    .catch(err => {
                        console.error('[Dashboard] Delete produk error:', err);
                        showToast('error', 'Gagal menghapus produk. Coba lagi.');
                    });
            }
        });
    }

    // Helper escape html
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==================== INIT ====================

    document.addEventListener('DOMContentLoaded', () => {
        // Default: Hari Ini
        const defaults = getShortcutDates('hari_ini');
        dateFrom = defaults.from;
        dateTo = defaults.to;
        loadDashboardData();

        // Init flatpickr
        const fpOptions = {
            dateFormat: 'Y-m-d',
            locale: typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns.id
                ? flatpickr.l10ns.id : 'default',
            disableMobile: true,
        };

        const fpFrom = document.getElementById('date-from');
        const fpTo = document.getElementById('date-to');
        if (fpFrom && typeof flatpickr !== 'undefined') flatpickr(fpFrom, fpOptions);
        if (fpTo && typeof flatpickr !== 'undefined') flatpickr(fpTo, fpOptions);

        // Shortcut filter buttons
        const filterGroup = document.getElementById('period-filter');
        const customRange = document.getElementById('custom-date-range');

        if (filterGroup) {
            filterGroup.querySelectorAll('.btn-filter').forEach(btn => {
                btn.addEventListener('click', function () {
                    // Update active state
                    filterGroup.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');

                    const shortcut = this.dataset.shortcut;

                    if (shortcut === 'custom') {
                        // Show custom date range
                        if (customRange) customRange.style.display = 'flex';
                    } else {
                        // Hide custom range and load data
                        if (customRange) customRange.style.display = 'none';
                        const dates = getShortcutDates(shortcut);
                        dateFrom = dates.from;
                        dateTo = dates.to;
                        loadDashboardData();
                    }
                });
            });
        }

        // Apply custom filter
        const applyBtn = document.getElementById('btn-apply-custom');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const from = document.getElementById('date-from')?.value;
                const to = document.getElementById('date-to')?.value;

                if (!from || !to) {
                    showToast('warning', 'Pilih tanggal Dari dan Sampai');
                    return;
                }

                if (from > to) {
                    showToast('warning', 'Tanggal "Dari" harus sebelum "Sampai"');
                    return;
                }

                dateFrom = from;
                dateTo = to;
                loadDashboardData();
            });
        }
    });

})();

/**
 * Dashboard SABA — ringkasan bisnis yang berorientasi tindakan.
 */
(function () {
    'use strict';

    const PAGE_SIZE = 10;
    const state = {
        dateFrom: '',
        dateTo: '',
        activeTab: 'produk',
        search: '',
        productsVisible: PAGE_SIZE,
        transactionsVisible: PAGE_SIZE,
        products: [],
        transactions: [],
        currentData: null,
        requestId: 0,
        controller: null,
        hasLoaded: false,
    };

    let salesChart = null;
    let marginChart = null;

    const COLORS = {
        primary: '#6366f1',
        primaryLight: 'rgba(99, 102, 241, 0.14)',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        palette: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6'],
    };

    const page = document.getElementById('dashboard-page');
    if (!page) return;

    function formatNumber(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(number);
    }

    function formatStock(value) {
        const number = Number.parseFloat(value);
        if (Number.isNaN(number)) return '0';
        return Number.isInteger(number) ? String(number) : number.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    }

    function formatCompactRupiah(value) {
        const number = Number(value) || 0;
        if (Math.abs(number) >= 1_000_000) return `Rp ${formatNumber(number / 1_000_000)} jt`;
        if (Math.abs(number) >= 1_000) return `Rp ${formatNumber(number / 1_000)} rb`;
        return `Rp ${formatNumber(number)}`;
    }

    function toDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function parseDate(value) {
        if (!value) return null;
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(value);
        if (iso) {
            const [year, month, day] = value.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        if (local) return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
        return null;
    }

    function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
        const date = parseDate(value);
        return date ? date.toLocaleDateString('id-ID', options) : (value || '-');
    }

    function getShortcutDates(shortcut) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let from;
        let to;

        switch (shortcut) {
            case 'kemarin': {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                from = to = toDateString(yesterday);
                break;
            }
            case '7hari': {
                const start = new Date(today);
                start.setDate(start.getDate() - 6);
                from = toDateString(start);
                to = toDateString(today);
                break;
            }
            case '30hari': {
                const start = new Date(today);
                start.setDate(start.getDate() - 29);
                from = toDateString(start);
                to = toDateString(today);
                break;
            }
            case 'bulan_ini':
                from = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
                to = toDateString(today);
                break;
            case 'hari_ini':
            default:
                from = to = toDateString(today);
        }
        return { from, to };
    }

    function getPeriodLabel(from = state.dateFrom, to = state.dateTo) {
        if (!from || !to) return 'Periode dipilih';
        if (from === to) return formatDate(from, { day: 'numeric', month: 'long', year: 'numeric' });
        return `${formatDate(from, { day: 'numeric', month: 'short' })} – ${formatDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }

    function escapeHtml(value) {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML;
    }

    function setLoading(loading) {
        page.setAttribute('aria-busy', String(loading));
        const indicator = document.getElementById('dashboard-loading-indicator');
        indicator?.classList.toggle('is-hidden', !loading);
        document.querySelectorAll('#period-filter .btn-filter, #btn-apply-custom').forEach(button => {
            button.disabled = loading;
        });
        if (loading) {
            const freshness = document.getElementById('dashboard-last-updated');
            if (freshness) freshness.innerHTML = '<i class="bi bi-arrow-repeat"></i>Memperbarui data';
        }
    }

    function setError(message = '') {
        const panel = document.getElementById('dashboard-error');
        const messageElement = document.getElementById('dashboard-error-message');
        if (!panel || !messageElement) return;
        if (!message) {
            panel.hidden = true;
            return;
        }
        messageElement.textContent = message;
        panel.hidden = false;
    }

    function renderUnavailableState() {
        ['stat-penjualan', 'stat-transaksi', 'stat-produk', 'stat-margin'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '—';
        });
        ['stat-penjualan-meta', 'stat-transaksi-meta', 'stat-produk-meta', 'stat-margin-meta'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = 'Data tidak tersedia';
        });
        renderEmpty(document.getElementById('recent-transactions'), 'bi-receipt', 'Transaksi belum tersedia', 'Coba muat ulang data.');
        renderEmpty(document.getElementById('stok-summary'), 'bi-box-seam', 'Stok belum tersedia', 'Coba muat ulang data.');
    }

    async function loadDashboardData() {
        if (state.controller) state.controller.abort();
        state.controller = new AbortController();
        const requestId = ++state.requestId;
        setLoading(true);
        setError('');

        const params = new URLSearchParams({ date_from: state.dateFrom, date_to: state.dateTo });
        try {
            const response = await fetch(`/api/dashboard-data?${params.toString()}`, {
                signal: state.controller.signal,
            });
            if (response.status === 401) {
                showToast('warning', 'Sesi habis, silakan login ulang.');
                window.setTimeout(() => { window.location.href = '/login'; }, 1200);
                return;
            }
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || `Server error (${response.status})`);
            if (requestId !== state.requestId) return;

            state.currentData = data;
            state.hasLoaded = true;
            updateDashboard(data);
            const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const freshness = document.getElementById('dashboard-last-updated');
            if (freshness) freshness.innerHTML = `<i class="bi bi-check-circle-fill"></i>Diperbarui ${now}`;
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('[Dashboard] Gagal memuat:', error);
            setError(error.message || 'Periksa koneksi lalu coba lagi.');
            const freshness = document.getElementById('dashboard-last-updated');
            if (freshness) freshness.innerHTML = '<i class="bi bi-exclamation-circle-fill"></i>Gagal diperbarui';
            if (!state.hasLoaded) renderUnavailableState();
        } finally {
            if (requestId === state.requestId) setLoading(false);
        }
    }

    window.loadDashboardData = loadDashboardData;

    function updateDashboard(data) {
        updatePeriod(data.period || {});
        updateStats(data);
        updateStockAlert(data.stok_menipis || []);
        updateRecentTransactions(data.transaksi_terbaru || (data.transaksi_list || []).slice(0, 5));
        updateStockSummary(data.produk_list || []);
        updateSalesChart(data);
        updateMarginChart(data);
        state.products = data.produk_list || [];
        state.transactions = data.transaksi_list || [];
        state.productsVisible = PAGE_SIZE;
        state.transactionsVisible = PAGE_SIZE;
        document.getElementById('produk-count').textContent = state.products.length;
        document.getElementById('transaksi-count').textContent = state.transactions.length;
        renderActiveDataPanel();
    }

    function updatePeriod(period) {
        const from = period.from || state.dateFrom;
        const to = period.to || state.dateTo;
        const label = getPeriodLabel(from, to);
        const activeLabel = document.getElementById('active-period-label');
        const selectionLabel = document.getElementById('period-selection-label');
        if (activeLabel) activeLabel.textContent = `Performa bisnis untuk ${label}`;
        if (selectionLabel) selectionLabel.textContent = label;
    }

    function setStatValue(id, value) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = value;
        element.animate(
            [{ opacity: .35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 220, easing: 'ease-out' }
        );
    }

    function setTrend(id, change, fallback) {
        const element = document.getElementById(id);
        if (!element) return;
        element.className = 'stat-meta';
        if (change === null || change === undefined || Number.isNaN(Number(change))) {
            element.classList.add('trend-neutral');
            element.innerHTML = `<i class="bi bi-minus"></i>${fallback}`;
            return;
        }
        const number = Number(change);
        const direction = number > 0 ? 'up' : number < 0 ? 'down' : 'neutral';
        const icon = number > 0 ? 'arrow-up-right' : number < 0 ? 'arrow-down-right' : 'dash';
        element.classList.add(`trend-${direction}`);
        element.innerHTML = `<i class="bi bi-${icon}"></i>${Math.abs(number).toLocaleString('id-ID')}% vs periode sebelumnya`;
    }

    function updateStats(data) {
        const comparison = data.comparison || {};
        setStatValue('stat-penjualan', formatCurrency(data.total_penjualan || 0));
        setStatValue('stat-transaksi', formatNumber(data.jumlah_transaksi || 0));
        setStatValue('stat-produk', data.produk_terlaris || '-');
        setStatValue('stat-margin', formatCurrency(data.total_margin || 0));
        setTrend('stat-penjualan-meta', comparison.sales_change, 'Belum ada pembanding');
        setTrend('stat-transaksi-meta', comparison.transactions_change, 'Belum ada pembanding');
        setTrend('stat-margin-meta', comparison.margin_change, 'Belum ada pembanding');
        const productMeta = document.getElementById('stat-produk-meta');
        if (productMeta) productMeta.innerHTML = `<i class="bi bi-box-arrow-up-right"></i>${formatNumber(data.produk_terlaris_qty || 0)} unit terjual`;
    }

    function updateStockAlert(items) {
        const panel = document.getElementById('stok-alert-card');
        const container = document.getElementById('stok-alert-items');
        if (!panel || !container) return;
        panel.hidden = items.length === 0;
        container.innerHTML = items.map(item => `
            <span class="stock-alert-item">
                <i class="bi bi-exclamation-circle-fill"></i>
                ${escapeHtml(item.nama_produk || '-')}: ${formatStock(item.stok)} ${escapeHtml(item.satuan || '')}
            </span>
        `).join('');
    }

    function getStockLevel(stock) {
        const value = Number.parseFloat(stock) || 0;
        if (value < 5) return { key: 'danger', label: 'Kritis', icon: 'exclamation-circle-fill', description: 'Segera restok' };
        if (value <= 10) return { key: 'warning', label: 'Rendah', icon: 'exclamation-triangle-fill', description: 'Perlu dipantau' };
        return { key: 'ok', label: 'Aman', icon: 'check-circle-fill', description: 'Stok mencukupi' };
    }

    function updateStockSummary(products) {
        const container = document.getElementById('stok-summary');
        if (!container) return;
        if (!products.length) {
            renderEmpty(container, 'bi-box-seam', 'Belum ada produk', 'Tambahkan produk melalui chat untuk mulai memantau stok.');
            return;
        }

        const sorted = [...products].sort((a, b) => (Number(a.stok) || 0) - (Number(b.stok) || 0));
        const visible = sorted.slice(0, 6);
        container.innerHTML = visible.map(product => {
            const level = getStockLevel(product.stok);
            return `
                <div class="dashboard-stock-item">
                    <div class="stock-name">
                        <i class="bi bi-${level.icon} stock-${level.key}"></i>
                        <span><strong>${escapeHtml(product.nama_produk || '-')}</strong><small>${level.description}</small></span>
                    </div>
                    <div class="stock-value">
                        <strong>${formatStock(product.stok)} ${escapeHtml(product.satuan || '')}</strong>
                        <span class="stock-status stock-${level.key}">${level.label}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (sorted.length > visible.length) {
            container.insertAdjacentHTML('beforeend', `<div class="dashboard-inline-loading">${sorted.length - visible.length} produk lainnya tersedia pada daftar produk</div>`);
        }
    }

    function updateRecentTransactions(transactions) {
        const container = document.getElementById('recent-transactions');
        if (!container) return;
        if (!transactions.length) {
            renderEmpty(container, 'bi-receipt', 'Belum ada transaksi', 'Catat transaksi melalui chat untuk melihat aktivitas terbaru.');
            return;
        }
        container.innerHTML = transactions.slice(0, 5).map(transaction => `
            <div class="dashboard-recent-item">
                <span class="recent-product-icon"><i class="bi bi-bag-check-fill"></i></span>
                <div><strong>${escapeHtml(transaction.produk || '-')}</strong><p>${formatDate(transaction.tanggal)} · ${escapeHtml(transaction.waktu || '-')}</p></div>
                <div class="recent-total"><strong>${formatCurrency(transaction.total || 0)}</strong><span>${escapeHtml(transaction.jumlah || '0')} ${escapeHtml(transaction.satuan || '')}</span></div>
            </div>
        `).join('');
    }

    function getChartTheme() {
        const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        return {
            dark,
            text: dark ? '#cbd5e1' : '#64748b',
            grid: dark ? 'rgba(148,163,184,.14)' : 'rgba(15,23,42,.08)',
            surface: dark ? '#202e43' : '#ffffff',
            border: dark ? '#334155' : '#ffffff',
        };
    }

    function updateSalesChart(data) {
        const canvas = document.getElementById('salesChart');
        const empty = document.getElementById('sales-chart-empty');
        if (!canvas || typeof Chart === 'undefined') return;
        const labels = (data.daily_labels || []).map(label => formatDate(label, { day: 'numeric', month: 'short' }));
        const values = data.daily_values || [];
        empty.hidden = values.length > 0;
        const theme = getChartTheme();

        if (salesChart) salesChart.destroy();
        salesChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets: [{ data: values, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight, borderWidth: 2.5, pointBackgroundColor: COLORS.primary, pointBorderColor: theme.border, pointBorderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6, tension: .35, fill: true }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: theme.surface, titleColor: theme.dark ? '#f8fafc' : '#0f172a', bodyColor: theme.text, borderColor: theme.grid, borderWidth: 1, padding: 11, callbacks: { label: context => `Penjualan: ${formatCurrency(context.parsed.y)}` } },
                },
                scales: {
                    x: { grid: { color: theme.grid }, ticks: { color: theme.text, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                    y: { beginAtZero: true, grid: { color: theme.grid }, ticks: { color: theme.text, font: { size: 10 }, callback: value => formatCompactRupiah(value) } },
                },
            },
        });
    }

    const centerTextPlugin = {
        id: 'sabaCenterText',
        afterDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta.data.length) return;
            const { x, y } = meta.data[0];
            const total = chart.data.datasets[0].data.reduce((sum, value) => sum + (Number(value) || 0), 0);
            const context = chart.ctx;
            const theme = getChartTheme();
            context.save();
            context.textAlign = 'center';
            context.fillStyle = theme.text;
            context.font = '600 10px Inter, sans-serif';
            context.fillText('TOTAL LABA', x, y - 5);
            context.fillStyle = theme.dark ? '#f8fafc' : '#0f172a';
            context.font = '700 12px Inter, sans-serif';
            context.fillText(formatCompactRupiah(total), x, y + 13);
            context.restore();
        },
    };

    function updateMarginChart(data) {
        const canvas = document.getElementById('marginChart');
        const empty = document.getElementById('margin-chart-empty');
        const legend = document.getElementById('margin-legend');
        if (!canvas || !legend || typeof Chart === 'undefined') return;
        const marginData = data.margin_data || [];
        const colors = marginData.map((_, index) => COLORS.palette[index % COLORS.palette.length]);
        empty.hidden = marginData.length > 0;
        const theme = getChartTheme();

        if (marginChart) marginChart.destroy();
        marginChart = new Chart(canvas, {
            type: 'doughnut',
            data: { labels: marginData.map(item => item.nama_produk), datasets: [{ data: marginData.map(item => item.margin || 0), backgroundColor: colors, borderColor: theme.border, borderWidth: 2, hoverOffset: 5 }] },
            plugins: [centerTextPlugin],
            options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { display: false }, tooltip: { backgroundColor: theme.surface, titleColor: theme.dark ? '#f8fafc' : '#0f172a', bodyColor: theme.text, borderColor: theme.grid, borderWidth: 1, padding: 11, callbacks: { label: context => `${context.label}: ${formatCurrency(context.parsed)}` } } } },
        });

        legend.innerHTML = marginData.length
            ? marginData.map((item, index) => `<div class="margin-legend-item"><span class="margin-legend-color" style="background:${colors[index]}"></span><span class="flex-grow-1">${escapeHtml(item.nama_produk)}</span><strong>${formatCurrency(item.margin)}</strong></div>`).join('')
            : '';
    }

    function renderEmpty(container, icon, title, description) {
        if (!container) return;
        container.innerHTML = `<div class="dashboard-empty-state"><i class="bi ${icon}"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>`;
    }

    function getFilteredProducts() {
        const query = state.search.toLowerCase();
        return state.products.filter(product => !query || String(product.nama_produk || '').toLowerCase().includes(query));
    }

    function getFilteredTransactions() {
        const query = state.search.toLowerCase();
        return state.transactions.filter(transaction => !query || String(transaction.produk || '').toLowerCase().includes(query));
    }

    function renderProducts() {
        const tbody = document.getElementById('produk-body');
        const mobile = document.getElementById('produk-mobile-list');
        const loadMore = document.getElementById('produk-load-more');
        const filtered = getFilteredProducts();
        const visible = filtered.slice(0, state.productsVisible);
        if (!tbody || !mobile || !loadMore) return;

        if (!visible.length) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="dashboard-empty-state"><i class="bi bi-box-seam"></i><strong>Produk tidak ditemukan</strong><span>Coba kata pencarian lain.</span></div></td></tr>';
            renderEmpty(mobile, 'bi-box-seam', 'Produk tidak ditemukan', 'Coba kata pencarian lain.');
        } else {
            tbody.innerHTML = visible.map(product => {
                const sell = Number.parseFloat(product.harga_jual) || 0;
                const cost = Number.parseFloat(product.modal) || 0;
                const margin = sell - cost;
                const level = getStockLevel(product.stok);
                return `<tr><td><strong>${escapeHtml(product.nama_produk || '-')}</strong></td><td class="text-end">${formatCurrency(sell)}</td><td class="text-end">${formatCurrency(cost)}</td><td class="text-end"><strong class="${margin >= 0 ? 'text-success' : 'text-danger'}">${margin > 0 ? '+' : ''}${formatCurrency(margin)}</strong></td><td class="text-center"><span class="stok-badge stock-${level.key}"><i class="bi bi-${level.icon}"></i>${formatStock(product.stok)} ${escapeHtml(product.satuan || '')}</span></td><td>${escapeHtml(product.terakhir_update || '-')}</td><td class="text-center"><button class="dashboard-row-action btn-delete-produk" type="button" data-row="${product.row_number}" data-name="${escapeHtml(product.nama_produk || 'produk')}" aria-label="Hapus produk ${escapeHtml(product.nama_produk || '')}" title="Hapus produk"><i class="bi bi-trash3"></i></button></td></tr>`;
            }).join('');

            mobile.innerHTML = visible.map(product => {
                const sell = Number.parseFloat(product.harga_jual) || 0;
                const cost = Number.parseFloat(product.modal) || 0;
                const margin = sell - cost;
                const level = getStockLevel(product.stok);
                return `<article class="dashboard-mobile-card"><div class="mobile-card-head"><div class="mobile-card-title"><strong>${escapeHtml(product.nama_produk || '-')}</strong><span>Diperbarui ${escapeHtml(product.terakhir_update || '-')}</span></div>${mobileActionMenu('produk', product.row_number, product.nama_produk || 'produk')}</div><div class="mobile-card-details"><span><small>Harga jual</small><strong>${formatCurrency(sell)}</strong></span><span><small>Modal</small><strong>${formatCurrency(cost)}</strong></span><span><small>Margin/unit</small><strong class="${margin >= 0 ? 'text-success' : 'text-danger'}">${margin > 0 ? '+' : ''}${formatCurrency(margin)}</strong></span><span><small>Stok</small><strong class="stock-${level.key}">${formatStock(product.stok)} ${escapeHtml(product.satuan || '')}</strong></span></div></article>`;
            }).join('');
        }
        loadMore.hidden = visible.length >= filtered.length;
    }

    function renderTransactions() {
        const tbody = document.getElementById('transaksi-body');
        const mobile = document.getElementById('transaksi-mobile-list');
        const loadMore = document.getElementById('transaksi-load-more');
        const filtered = getFilteredTransactions();
        const visible = filtered.slice(0, state.transactionsVisible);
        if (!tbody || !mobile || !loadMore) return;

        if (!visible.length) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="dashboard-empty-state"><i class="bi bi-receipt"></i><strong>Transaksi tidak ditemukan</strong><span>Coba periode atau pencarian lain.</span></div></td></tr>';
            renderEmpty(mobile, 'bi-receipt', 'Transaksi tidak ditemukan', 'Coba periode atau pencarian lain.');
        } else {
            tbody.innerHTML = visible.map((transaction, index) => `<tr><td><div class="d-flex align-items-center gap-2"><span class="trx-number">${index + 1}</span><strong>${escapeHtml(transaction.produk || '-')}</strong></div></td><td>${formatDate(transaction.tanggal)}</td><td>${escapeHtml(transaction.waktu || '-')}</td><td class="text-center"><span class="qty-badge">${escapeHtml(transaction.jumlah || '0')} ${escapeHtml(transaction.satuan || '')}</span></td><td class="text-end">${formatCurrency(transaction.harga_jual || 0)}</td><td class="text-end"><strong class="text-success">${formatCurrency(transaction.total || 0)}</strong></td><td class="text-center"><button class="dashboard-row-action btn-delete-transaksi" type="button" data-row="${transaction.row_number}" data-name="${escapeHtml(transaction.produk || 'transaksi')}" data-total="${Number(transaction.total) || 0}" aria-label="Hapus transaksi ${escapeHtml(transaction.produk || '')}" title="Hapus transaksi"><i class="bi bi-trash3"></i></button></td></tr>`).join('');
            mobile.innerHTML = visible.map(transaction => `<article class="dashboard-mobile-card"><div class="mobile-card-head"><div class="mobile-card-title"><strong>${escapeHtml(transaction.produk || '-')}</strong><span>${formatDate(transaction.tanggal)} · ${escapeHtml(transaction.waktu || '-')}</span></div>${mobileActionMenu('transaksi', transaction.row_number, transaction.produk || 'transaksi', transaction.total || 0)}</div><strong class="mobile-card-total">${formatCurrency(transaction.total || 0)}</strong><div class="mobile-card-details"><span><small>Jumlah</small><strong>${escapeHtml(transaction.jumlah || '0')} ${escapeHtml(transaction.satuan || '')}</strong></span><span><small>Harga satuan</small><strong>${formatCurrency(transaction.harga_jual || 0)}</strong></span></div></article>`).join('');
        }
        loadMore.hidden = visible.length >= filtered.length;
    }

    function mobileActionMenu(type, row, name, total = 0) {
        const safeName = escapeHtml(name);
        const totalAttribute = type === 'transaksi' ? ` data-total="${Number(total) || 0}"` : '';
        return `<div class="dropdown mobile-action-menu"><button type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Buka aksi untuk ${safeName}"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item text-danger btn-delete-${type}" type="button" data-row="${row}" data-name="${safeName}"${totalAttribute}><i class="bi bi-trash3 me-2"></i>Hapus ${type}</button></li></ul></div>`;
    }

    function renderActiveDataPanel() {
        if (state.activeTab === 'produk') renderProducts();
        else renderTransactions();
    }

    async function deleteRecord(type, row, name, total = 0) {
        const isTransaction = type === 'transaksi';
        const detail = isTransaction
            ? `Hapus transaksi ${name} senilai ${formatCurrency(total)}?`
            : `Hapus produk ${name}? Data produk akan dihapus permanen.`;
        const result = await Swal.fire({
            title: isTransaction ? 'Hapus transaksi?' : 'Hapus produk?',
            text: detail,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, hapus',
            cancelButtonText: 'Batal',
            focusCancel: true,
            background: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
        });
        if (!result.isConfirmed) return;

        try {
            showToast('info', `Menghapus ${type}...`);
            const response = await fetch(`/api/${type}/${row}`, { method: 'DELETE' });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.error || `Gagal menghapus ${type}`);
            showToast('success', `${isTransaction ? 'Transaksi' : 'Produk'} berhasil dihapus`);
            await loadDashboardData();
        } catch (error) {
            showToast('error', error.message || `Gagal menghapus ${type}`);
        }
    }

    function selectDataTab(tab) {
        state.activeTab = tab === 'transaksi' ? 'transaksi' : 'produk';
        state.search = '';
        const search = document.getElementById('dashboard-data-search');
        if (search) {
            search.value = '';
            search.placeholder = state.activeTab === 'produk' ? 'Cari produk...' : 'Cari transaksi...';
        }
        document.querySelectorAll('[data-data-tab]').forEach(button => {
            const active = button.dataset.dataTab === state.activeTab;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('[data-data-panel]').forEach(panel => {
            const active = panel.dataset.dataPanel === state.activeTab;
            panel.hidden = !active;
            panel.classList.toggle('active', active);
        });
        renderActiveDataPanel();
    }

    function initializeFilters() {
        const defaults = getShortcutDates('hari_ini');
        state.dateFrom = defaults.from;
        state.dateTo = defaults.to;

        const flatpickrOptions = {
            dateFormat: 'Y-m-d',
            locale: typeof flatpickr !== 'undefined' && flatpickr.l10ns?.id ? flatpickr.l10ns.id : 'default',
            disableMobile: true,
        };
        if (typeof flatpickr !== 'undefined') {
            flatpickr(document.getElementById('date-from'), flatpickrOptions);
            flatpickr(document.getElementById('date-to'), flatpickrOptions);
        }

        document.querySelectorAll('#period-filter .btn-filter').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('#period-filter .btn-filter').forEach(item => item.classList.remove('active'));
                button.classList.add('active');
                const custom = document.getElementById('custom-date-range');
                if (button.dataset.shortcut === 'custom') {
                    custom.hidden = false;
                    document.getElementById('date-from')?.focus();
                    return;
                }
                custom.hidden = true;
                const dates = getShortcutDates(button.dataset.shortcut);
                state.dateFrom = dates.from;
                state.dateTo = dates.to;
                loadDashboardData();
            });
        });

        document.getElementById('btn-apply-custom')?.addEventListener('click', () => {
            const from = document.getElementById('date-from').value;
            const to = document.getElementById('date-to').value;
            if (!from || !to) return showToast('warning', 'Pilih tanggal awal dan akhir.');
            if (from > to) return showToast('warning', 'Tanggal awal harus sebelum tanggal akhir.');
            state.dateFrom = from;
            state.dateTo = to;
            loadDashboardData();
        });
    }

    function initializeInteractions() {
        document.getElementById('dashboard-retry')?.addEventListener('click', loadDashboardData);
        document.getElementById('show-all-transactions')?.addEventListener('click', () => {
            selectDataTab('transaksi');
            document.getElementById('dashboard-data-section')?.scrollIntoView({ behavior: 'smooth' });
        });
        document.querySelectorAll('[data-data-tab]').forEach(button => button.addEventListener('click', () => selectDataTab(button.dataset.dataTab)));
        document.getElementById('dashboard-data-search')?.addEventListener('input', event => {
            state.search = event.target.value.trim();
            if (state.activeTab === 'produk') state.productsVisible = PAGE_SIZE;
            else state.transactionsVisible = PAGE_SIZE;
            renderActiveDataPanel();
        });
        document.getElementById('produk-load-more')?.addEventListener('click', () => { state.productsVisible += PAGE_SIZE; renderProducts(); });
        document.getElementById('transaksi-load-more')?.addEventListener('click', () => { state.transactionsVisible += PAGE_SIZE; renderTransactions(); });

        page.addEventListener('click', event => {
            const productButton = event.target.closest('.btn-delete-produk');
            const transactionButton = event.target.closest('.btn-delete-transaksi');
            if (productButton) deleteRecord('produk', productButton.dataset.row, productButton.dataset.name || 'produk');
            if (transactionButton) deleteRecord('transaksi', transactionButton.dataset.row, transactionButton.dataset.name || 'transaksi', Number(transactionButton.dataset.total) || 0);
        });

        const analytics = document.getElementById('dashboard-analytics');
        const toggle = document.getElementById('analytics-toggle');
        if (window.matchMedia('(max-width: 768px)').matches) analytics?.classList.add('is-collapsed');
        function updateAnalyticsToggle() {
            if (!analytics || !toggle) return;
            const collapsed = analytics.classList.contains('is-collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.querySelector('span').textContent = collapsed ? 'Tampilkan grafik' : 'Sembunyikan grafik';
            toggle.querySelector('i').className = `bi bi-chevron-${collapsed ? 'down' : 'up'}`;
        }
        toggle?.addEventListener('click', () => {
            analytics.classList.toggle('is-collapsed');
            updateAnalyticsToggle();
            if (!analytics.classList.contains('is-collapsed')) {
                requestAnimationFrame(() => {
                    salesChart?.resize();
                    marginChart?.resize();
                });
            }
        });
        updateAnalyticsToggle();

        new MutationObserver(mutations => {
            if (mutations.some(mutation => mutation.attributeName === 'data-bs-theme') && state.currentData) {
                updateSalesChart(state.currentData);
                updateMarginChart(state.currentData);
            }
        }).observe(document.documentElement, { attributes: true });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initializeFilters();
        initializeInteractions();
        loadDashboardData();
    });
})();

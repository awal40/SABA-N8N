/**
 * main.js - Utilitas umum, inisialisasi global, dan dark/light mode toggle.
 * Flash alert auto-dismiss, format helper, theme switching.
 */

// ==================== DARK/LIGHT MODE ====================

(function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', saved);
    
    // Update icon setelah DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        updateThemeIcon(saved);
        
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-bs-theme');
                const next = current === 'dark' ? 'light' : 'dark';
                
                document.documentElement.setAttribute('data-bs-theme', next);
                localStorage.setItem('theme', next);
                updateThemeIcon(next);
            });
        }
    });
})();

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (theme === 'dark') {
        icon.className = 'bi bi-moon-stars-fill';
    } else {
        icon.className = 'bi bi-sun-fill';
    }
}

// ==================== FLASH ALERTS ====================

document.addEventListener('DOMContentLoaded', () => {
    // Auto-dismiss flash alerts setelah 5 detik
    document.querySelectorAll('.flash-alert').forEach(alert => {
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 5000);
    });
});


/**
 * Format angka ke Rupiah (untuk digunakan global).
 */
function formatCurrency(value) {
    if (!value && value !== 0) return 'Rp 0';
    const num = parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(num)) return 'Rp 0';
    return 'Rp ' + num.toLocaleString('id-ID');
}


/**
 * Toast notification menggunakan SweetAlert2.
 */
function showToast(icon, title) {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        background: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
    });
    Toast.fire({ icon, title });
}

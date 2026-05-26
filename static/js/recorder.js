/**
 * recorder.js - Audio recorder untuk input transaksi via suara.
 * Menggunakan MediaRecorder API untuk merekam audio dari mikrofon.
 * Audio dikirim ke Flask /api/transaksi endpoint sebagai multipart/form-data.
 */

(function () {
    'use strict';

    const micButton = document.getElementById('mic-button');
    const micStatus = document.getElementById('mic-status');

    if (!micButton || !micStatus) return;

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let recordingTimer = null;
    let recordingStartTime = null;

    // ==================== INIT ====================

    /**
     * Inisialisasi: request akses mikrofon.
     */
    async function initRecorder() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            // Cek format yang didukung
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm';
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/ogg;codecs=opus';
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = ''; // Biarkan browser pilih default
            }

            const options = mimeType ? { mimeType } : {};
            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                if (audioChunks.length > 0) {
                    const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                    sendAudio(audioBlob);
                }
                audioChunks = [];
            };

            console.log('[Recorder] Ready with mimeType:', mimeType || 'default');
        } catch (err) {
            console.error('[Recorder] Microphone access denied:', err);
            micStatus.textContent = '⚠️ Mikrofon tidak tersedia';
            micButton.disabled = true;
            micButton.style.opacity = '0.5';
        }
    }

    // ==================== RECORDING ====================

    function startRecording() {
        if (!mediaRecorder || mediaRecorder.state === 'recording') return;

        audioChunks = [];
        mediaRecorder.start(100); // Collect data setiap 100ms
        isRecording = true;
        recordingStartTime = Date.now();

        // UI update
        micButton.classList.add('recording');
        micStatus.classList.add('recording');
        micStatus.textContent = '🔴 Merekam... 0s';

        // Timer update
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            micStatus.textContent = `🔴 Merekam... ${elapsed}s`;
        }, 1000);

        console.log('[Recorder] Recording started');
    }

    function stopRecording() {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

        mediaRecorder.stop();
        isRecording = false;

        // Clear timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }

        // UI update
        micButton.classList.remove('recording');
        micStatus.classList.remove('recording');
        micStatus.classList.add('processing');
        micStatus.textContent = '⏳ Memproses audio...';

        console.log('[Recorder] Recording stopped');
    }

    // ==================== SEND AUDIO ====================

    async function sendAudio(audioBlob) {
        const formData = new FormData();

        // Tentukan ekstensi file
        let ext = 'webm';
        if (audioBlob.type.includes('ogg')) ext = 'ogg';
        formData.append('file', audioBlob, `recording.${ext}`);

        try {
            const response = await fetch('/api/transaksi', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            // Mendeteksi status baru n8n atau server override
            const nStatus = result.status || result.n8n_status;
            const msg = result.message || result.result || result.error || 'Terjadi kesalahan yang tidak diketahui';

            micStatus.classList.remove('processing');
            micStatus.textContent = 'Tahan untuk merekam';

            if (response.ok && (nStatus === 'success' || (!nStatus && result.success))) {
                // Sukses
                showToast('success', msg);

                // Refresh dashboard jika ada
                if (typeof loadDashboardData === 'function') {
                    loadDashboardData();
                }
            } else {
                // Error dari server atau error logika n8n
                showToast('error', msg.replace('⚠️ ', ''));
            }
        } catch (err) {
            console.error('[Recorder] Send error:', err);
            micStatus.classList.remove('processing');
            micStatus.textContent = 'Tahan untuk merekam';

            showToast('error', 'Gagal mengirim audio. Periksa koneksi.');
        }
    }

    // ==================== EVENT LISTENERS ====================

    // Mouse events (Desktop)
    micButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startRecording();
    });

    micButton.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (isRecording) stopRecording();
    });

    micButton.addEventListener('mouseleave', (e) => {
        if (isRecording) stopRecording();
    });

    // Touch events (Mobile)
    micButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });

    micButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (isRecording) stopRecording();
    });

    micButton.addEventListener('touchcancel', (e) => {
        if (isRecording) stopRecording();
    });

    // Keyboard (Accessibility: Space/Enter)
    micButton.addEventListener('keydown', (e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !isRecording) {
            e.preventDefault();
            startRecording();
        }
    });

    micButton.addEventListener('keyup', (e) => {
        if ((e.key === ' ' || e.key === 'Enter') && isRecording) {
            e.preventDefault();
            stopRecording();
        }
    });

    // ==================== INIT ON LOAD ====================
    initRecorder();

})();

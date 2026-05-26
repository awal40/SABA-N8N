/**
 * chat.js - Logic halaman chat.
 * Mengelola bubble chat, audio recorder, audio player,
 * auto-scroll, dan loading indicator.
 */

(function () {
    'use strict';

    const chatMessages = document.getElementById('chat-messages');
    const chatContainer = document.getElementById('chat-container');
    const chatLoading = document.getElementById('chat-loading');
    const micButton = document.getElementById('chat-mic-button');
    const micStatus = document.getElementById('mic-status-container');
    const micStatusText = document.getElementById('mic-status-text');
    const banner = document.getElementById('audio-deleted-banner');
    const closeBannerBtn = document.getElementById('close-banner-btn');
    const micInstruction = document.getElementById('mic-instruction');
    const micIcon = document.getElementById('mic-icon');

    if (!chatMessages || !micButton) return;

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let recordingTimer = null;
    let recordingStartTime = null;

    const initials = window.USER_INITIALS || 'U';

    function getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    async function fixAudioDuration(blob) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.src = URL.createObjectURL(blob);
            audio.addEventListener('loadedmetadata', () => {
                if (audio.duration === Infinity || isNaN(audio.duration)) {
                    audio.currentTime = 1e101;
                    audio.addEventListener('timeupdate',
                        function handler() {
                            audio.removeEventListener('timeupdate', handler);
                            resolve(audio.duration);
                        }
                    );
                } else {
                    resolve(audio.duration);
                }
            });
            audio.addEventListener('error', () => resolve(0));
        });
    }

    function formatBoldText(text) {
        if (!text) return '';
        const escaped = escapeHtml(text);
        return escaped.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--primary-light)">$1</strong>');
    }

    // ==================== LOAD CHAT HISTORY ====================

    async function loadChatHistory() {
        try {
            const res = await fetch('/api/chat/history');
            const data = await res.json();

            if (chatLoading) chatLoading.remove();

            if (data.error) {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted p-5 mt-5">
                        <i class="bi bi-wifi-off" style="font-size:2rem;"></i>
                        <p class="mt-2 small">${data.error}</p>
                    </div>`;
                return;
            }

            const messages = data.messages || [];
            if (messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="text-center text-muted p-5 mt-5">
                        <i class="bi bi-chat-square-text" style="font-size:3rem;opacity:0.4;"></i>
                        <h5 class="mt-3 fw-bold" style="color:var(--text-primary);">Belum ada percakapan</h5>
                        <p class="small">Mulai dengan menahan tombol mic di bawah!</p>
                    </div>`;
                return;
            }

            chatMessages.innerHTML = '';
            let lastDate = '';

            // Show deleted audio banner SEKALI per sesi saja
            if (data.has_deleted && banner && !sessionStorage.getItem('audio_banner_dismissed')) {
                banner.style.display = 'block';
                sessionStorage.setItem('audio_banner_dismissed', '1');
            }

            messages.forEach(msg => {
                const d = new Date(msg.created_at);
                const isToday = d.toDateString() === new Date().toDateString();
                const dStr = isToday ? 'Hari Ini' : d.toLocaleDateString('id-ID', {day: 'numeric', month: 'short'});

                if (dStr !== lastDate) {
                    appendDateSeparator(dStr);
                    lastDate = dStr;
                }
                appendBubble(msg, false);
            });
            scrollToBottom();
        } catch (err) {
            console.error('[Chat] Load history error:', err);
            if (chatLoading) chatLoading.remove();
            chatMessages.innerHTML = `
                <div class="text-center text-muted p-5 mt-5">
                    <i class="bi bi-wifi-off" style="font-size:2rem;"></i>
                    <p class="mt-2 small">Gagal memuat chat. Periksa koneksi.</p>
                </div>`;
        }
    }

    // ==================== BUBBLES UI ====================
    function appendDateSeparator(text) {
        const div = document.createElement('div');
        div.className = 'date-separator';
        div.innerHTML = `<span>${text}</span>`;
        chatMessages.appendChild(div);
    }

    function appendBubble(msg, animate = true) {
        const isUser = msg.role === 'user';
        const timeStr = formatTime(msg.created_at);
        const bubbleWrap = document.createElement('div');
        bubbleWrap.className = `bubble-wrap ${isUser ? 'user' : 'ai'}`;
        if (!animate) bubbleWrap.style.animation = 'none';

        if (isUser) {
            let audioHTML = '';
            let isExpired = msg.audio_expired;
            let transcription = escapeHtml(msg.message || '');

            if (isExpired) {
                bubbleWrap.innerHTML = `
                    <div class="bubble-label user">
                        <span>Anda</span>
                        <div class="avatar">${initials}</div>
                    </div>
                    <div class="bubble expired">
                        <div class="d-flex align-items-center gap-2" style="opacity:0.6;">
                            <i class="bi bi-mic-mute" style="font-size:1.2rem;"></i>
                            <div>
                                <div style="height:6px;width:100px;background:var(--border-color);border-radius:3px;"></div>
                                <small class="fst-italic mt-1 d-block">Audio tidak tersedia</small>
                            </div>
                        </div>
                        ${transcription ? `<p class="mt-2 mb-0 fw-medium small">${transcription}</p>` : ''}
                    </div>
                    <span class="bubble-time">${timeStr}</span>`;
            } else {
                if (msg.has_audio && msg.audio_url) {
                    audioHTML = `
                        <div class="chat-audio-player" data-src="${msg.audio_url}">
                            <button class="audio-play-btn">
                                <i class="bi bi-play-fill" style="font-size:1.2rem;"></i>
                            </button>
                            <div style="flex:1;min-width:100px;">
                                <div class="audio-progress">
                                    <div class="audio-progress-bar"></div>
                                </div>
                                <div class="d-flex justify-content-between mt-1">
                                    <span class="audio-duration">00:00</span>
                                    <span style="font-size:0.65rem;color:rgba(255,255,255,0.5);">Voice Note</span>
                                </div>
                            </div>
                        </div>`;
                }

                bubbleWrap.innerHTML = `
                    <div class="bubble-label user">
                        <span>Anda</span>
                        <div class="avatar">${initials}</div>
                    </div>
                    <div class="bubble user">
                        ${audioHTML}
                        ${transcription ? `<p class="mb-0 fw-semibold">${transcription}</p>` : ''}
                    </div>
                    <span class="bubble-time">${timeStr}</span>`;
            }
        } else {
            // AI Bubble
            const rawMsg = msg.message || '';
            const messageTxt = formatBoldText(rawMsg);
            
            // Bergantung penuh pada msg.status == 'error' atau pengecekan manual untuk chat history terdahulu
            const isError = (msg.status === 'error') || 
                (msg.status !== 'success' && (rawMsg.includes('⚠️') || rawMsg.includes('Terjadi kesalahan')));
                
            const iconClass = isError ? 'bi-x-circle-fill' : 'bi-robot';
            const iconColor = isError ? 'color: var(--danger); font-size: 1.1rem;' : 'color: var(--primary); font-size: 1.1rem;';
            const bubbleErrorClass = isError ? ' ai-error' : '';

            bubbleWrap.innerHTML = `
                <div class="bubble-label ai">
                    <div class="avatar"><i class="bi bi-robot"></i></div>
                    <span>Asisten AI</span>
                </div>
                <div class="bubble ai${bubbleErrorClass}">
                    <div class="d-flex align-items-start gap-2">
                        <i class="bi ${iconClass}" style="margin-top:3px;${iconColor}flex-shrink:0;"></i>
                        <div style="white-space:pre-wrap;line-height:1.6;flex-grow:1;">${messageTxt}</div>
                    </div>
                </div>
                <span class="bubble-time">${timeStr}</span>`;
        }

        chatMessages.appendChild(bubbleWrap);

        // Init player
        if (isUser && msg.has_audio && msg.audio_url && !msg.audio_expired) {
            const player = bubbleWrap.querySelector('.chat-audio-player');
            if (player) initAudioPlayer(player);
        }
    }

    function appendTypingIndicator() {
        const wrap = document.createElement('div');
        wrap.className = 'bubble-wrap ai';
        wrap.id = 'typing-indicator';
        wrap.innerHTML = `
            <div class="bubble-label ai">
                <div class="avatar"><i class="bi bi-robot"></i></div>
                <span>Asisten AI</span>
            </div>
            <div class="bubble ai">
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>`;
        chatMessages.appendChild(wrap);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const el = document.getElementById('typing-indicator');
        if (el) el.remove();
    }

    // ==================== AUDIO PLAYER ====================

    function initAudioPlayer(playerEl) {
        const playBtn = playerEl.querySelector('.audio-play-btn');
        const playIcon = playBtn.querySelector('i');
        const progressBar = playerEl.querySelector('.audio-progress-bar');
        const durationEl = playerEl.querySelector('.audio-duration');
        const progressContainer = playerEl.querySelector('.audio-progress');
        const src = playerEl.dataset.src;

        let audio = new Audio(src);
        let isPlaying = false;

        audio.addEventListener('loadedmetadata', () => {
            if (audio.duration === Infinity || isNaN(audio.duration)) {
                audio.currentTime = 1e101;
                audio.ontimeupdate = () => {
                    audio.ontimeupdate = null;
                    durationEl.textContent = formatDuration(audio.duration);
                    audio.currentTime = 0;
                };
            } else {
                durationEl.textContent = formatDuration(audio.duration);
            }
        });

        audio.addEventListener('error', () => {
            durationEl.textContent = '00:00';
            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
            playBtn.style.cursor = 'not-allowed';
        });

        playBtn.addEventListener('click', () => {
            if (!audio.src) return;

            if (isPlaying) {
                audio.pause();
                isPlaying = false;
                playIcon.className = 'bi bi-play-fill';
            } else {
                audio.play().catch(() => {});
                isPlaying = true;
                playIcon.className = 'bi bi-pause-fill';
            }
        });

        audio.addEventListener('timeupdate', () => {
            if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
                const pct = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = pct + '%';
            }
        });

        audio.addEventListener('ended', () => {
            isPlaying = false;
            playIcon.className = 'bi bi-play-fill';
            progressBar.style.width = '0%';
            audio.currentTime = 0;
        });

        progressContainer.addEventListener('click', (e) => {
            if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
                const rect = progressContainer.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                audio.currentTime = pos * audio.duration;
            }
        });
    }

    // ==================== AUDIO RECORDER ====================

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

            const mimeType = getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};
            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                if (audioChunks.length > 0) {
                    const blob = new Blob(audioChunks, {
                        type: mediaRecorder.mimeType || mimeType || 'audio/webm'
                    });
                    await fixAudioDuration(blob);
                    sendAudioToChat(blob);
                } else {
                    audioChunks = [];
                }
            };

            console.log('[Chat Recorder] Ready:', mimeType || 'default');
        } catch (err) {
            console.error('[Chat Recorder] Mic access denied:', err);
            if (micStatusText) micStatusText.textContent = 'MIKROFON TIDAK TERSEDIA';
            if (micStatus) {
                micStatus.classList.add('visible');
            }
            micButton.disabled = true;
            micButton.style.opacity = '0.5';
            if (micInstruction) micInstruction.style.opacity = '0';
        }
    }

    function startRecording() {
        if (!mediaRecorder || mediaRecorder.state === 'recording') return;
        audioChunks = [];
        mediaRecorder.start(100);
        isRecording = true;
        recordingStartTime = Date.now();

        // UI Updates for Recording
        micButton.classList.add('recording');
        if (micIcon) micIcon.className = 'bi bi-mic-fill';

        if (micStatus) {
            micStatus.classList.add('visible');
            micStatusText.textContent = 'MENDENGARKAN...';
        }
        if (micInstruction) micInstruction.style.opacity = '0';

        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            micStatusText.textContent = `MENDENGARKAN... ${formatDuration(elapsed)}`;
        }, 1000);
    }

    function stopRecording() {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        mediaRecorder.stop();
        isRecording = false;

        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }

        // UI Updates for Processing
        micButton.classList.remove('recording');
        micButton.classList.add('processing');

        if (micStatus) {
            micStatusText.textContent = 'MEMPROSES...';
        }
    }

    // ==================== SEND AUDIO ====================

    async function sendAudioToChat(audioBlob) {
        audioChunks = [];
        appendTypingIndicator();
        scrollToBottom();

        const formData = new FormData();
        let ext = 'webm';
        if (audioBlob.type.includes('ogg')) ext = 'ogg';
        formData.append('file', audioBlob, `recording.${ext}`);

        try {
            const response = await fetch('/api/chat/send-audio', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();
            removeTypingIndicator();
            resetMicUI();

            if (response.ok && result.success) {
                appendBubble(result.user_message, true);
                appendBubble(result.ai_message, true);
                scrollToBottom();
            } else {
                const errorMsg = result.error || 'Gagal memproses audio';
                appendBubble({
                    role: 'ai',
                    message: errorMsg,
                    status: 'error',
                    created_at: new Date().toISOString()
                }, true);
                scrollToBottom();
            }
        } catch (err) {
            console.error('[Chat] Send audio error:', err);
            removeTypingIndicator();
            resetMicUI();

            appendBubble({
                role: 'ai',
                message: `⚠️ Gagal mengirim audio. Periksa koneksi internet Anda.`,
                created_at: new Date().toISOString()
            }, true);
            scrollToBottom();
        }
    }

    function resetMicUI() {
        micButton.classList.remove('recording', 'processing');
        if (micStatus) micStatus.classList.remove('visible');
        if (micInstruction) micInstruction.style.opacity = '1';
    }

    // ==================== HELPERS ====================

    if (closeBannerBtn && banner) {
        closeBannerBtn.addEventListener('click', () => {
            banner.style.display = 'none';
            sessionStorage.setItem('audio_banner_dismissed', '1');
        });
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        });
    }

    function formatTime(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return '';
        }
    }

    function formatDuration(seconds) {
        if (seconds === Infinity || isNaN(seconds) || seconds == null) return '00:00';
        seconds = Math.max(0, seconds);
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==================== INIT ====================

    document.addEventListener('DOMContentLoaded', () => {
        loadChatHistory();
        initRecorder();

        // Mouse Events
        micButton.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            startRecording();
        });
        window.addEventListener('mouseup', () => {
            if (isRecording) stopRecording();
        });

        // Touch Events
        micButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startRecording();
        });
        window.addEventListener('touchend', () => {
            if (isRecording) stopRecording();
        });
        window.addEventListener('touchcancel', () => {
            if (isRecording) stopRecording();
        });

        // Keyboard
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
    });

})();

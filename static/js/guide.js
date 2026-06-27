/**
 * Onboarding dan pusat panduan SABA.
 * Status selesai disimpan per akun pada browser pengguna.
 */
(function () {
    'use strict';

    const config = window.SABA_GUIDE || {};
    const overlay = document.getElementById('guide-overlay');
    const dialog = overlay?.querySelector('.guide-dialog');
    const onboarding = document.getElementById('guide-onboarding');
    const library = document.getElementById('guide-library');
    const title = document.getElementById('guide-dialog-title');
    const eyebrow = document.getElementById('guide-dialog-eyebrow');
    const stepCount = document.getElementById('guide-step-count');
    const steps = Array.from(document.querySelectorAll('[data-guide-step]'));
    const dots = Array.from(document.querySelectorAll('.guide-progress-dots span'));
    const nextButton = document.getElementById('guide-next');
    const backButton = document.getElementById('guide-back');
    const skipButton = document.getElementById('guide-skip');
    const coachmark = document.getElementById('guide-mic-coachmark');
    const toast = document.getElementById('guide-toast');

    if (!overlay || !dialog || !onboarding || !library) return;

    const storageKey = `saba_onboarding_v1:${config.userKey || 'user'}`;
    const coachmarkKey = 'saba_show_mic_coachmark';
    let currentStep = 0;
    let currentView = 'onboarding';
    let lastFocusedElement = null;
    let toastTimer = null;

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (_) { /* Browser privacy mode */ }
    }

    function sessionGet(key) {
        try { return sessionStorage.getItem(key); } catch (_) { return null; }
    }

    function sessionSet(key, value) {
        try { sessionStorage.setItem(key, value); } catch (_) { /* Browser privacy mode */ }
    }

    function sessionRemove(key) {
        try { sessionStorage.removeItem(key); } catch (_) { /* Browser privacy mode */ }
    }

    function showStep(index) {
        currentStep = Math.max(0, Math.min(index, steps.length - 1));
        steps.forEach((step, stepIndex) => {
            const active = stepIndex === currentStep;
            step.hidden = !active;
            step.classList.toggle('active', active);
        });
        dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex <= currentStep));
        stepCount.textContent = `${currentStep + 1} dari ${steps.length}`;
        backButton.disabled = currentStep === 0;
        nextButton.innerHTML = currentStep === steps.length - 1
            ? 'Coba sekarang<i class="bi bi-mic-fill"></i>'
            : 'Lanjut<i class="bi bi-arrow-right"></i>';
        skipButton.textContent = currentStep === steps.length - 1 ? 'Buka panduan lengkap' : 'Lewati';
    }

    function setView(view) {
        currentView = view === 'library' ? 'library' : 'onboarding';
        const showLibrary = currentView === 'library';
        onboarding.hidden = showLibrary;
        library.hidden = !showLibrary;
        eyebrow.textContent = showLibrary ? 'Pusat Panduan' : 'Panduan SABA';
        title.textContent = showLibrary ? 'Apa yang ingin Anda lakukan?' : 'Mulai dengan percaya diri';
        if (!showLibrary) showStep(0);
    }

    function openGuide(view = 'library') {
        hideCoachmark();
        lastFocusedElement = document.activeElement;
        setView(view);
        overlay.hidden = false;
        document.body.classList.add('guide-open');
        requestAnimationFrame(() => overlay.querySelector('[data-guide-close]')?.focus());
    }

    function completeOnboarding() {
        storageSet(storageKey, 'completed');
    }

    function closeGuide(markOnboardingComplete = true) {
        if (currentView === 'onboarding' && markOnboardingComplete) completeOnboarding();
        overlay.hidden = true;
        document.body.classList.remove('guide-open');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }

    function finishOnboarding() {
        completeOnboarding();
        closeGuide(false);
        goToChatCoachmark();
    }

    function goToChatCoachmark() {
        if (config.currentPath === '/chat') {
            window.setTimeout(showCoachmark, 250);
            return;
        }
        sessionSet(coachmarkKey, '1');
        window.location.href = config.chatUrl || '/chat';
    }

    function showCoachmark() {
        const mic = document.getElementById('chat-mic-button');
        if (!mic || !coachmark) return;
        coachmark.hidden = false;
        mic.classList.add('guide-mic-highlight');
        mic.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideCoachmark() {
        coachmark.hidden = true;
        document.getElementById('chat-mic-button')?.classList.remove('guide-mic-highlight');
        sessionRemove(coachmarkKey);
    }

    function selectTopic(topicName, focusHeading = false) {
        document.querySelectorAll('[data-guide-topic]').forEach(button => {
            const active = button.dataset.guideTopic === topicName;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('[data-guide-panel]').forEach(panel => {
            const active = panel.dataset.guidePanel === topicName;
            panel.hidden = !active;
            panel.classList.toggle('active', active);
            if (active && focusHeading) {
                const heading = panel.querySelector('h2');
                heading?.setAttribute('tabindex', '-1');
                heading?.focus();
            }
        });
    }

    function showToast(message) {
        if (!toast) return;
        window.clearTimeout(toastTimer);
        toast.textContent = message;
        toast.hidden = false;
        toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2200);
    }

    async function copyCommand(command) {
        try {
            await navigator.clipboard.writeText(command);
            showToast('Contoh perintah disalin');
        } catch (_) {
            const field = document.createElement('textarea');
            field.value = command;
            field.setAttribute('readonly', '');
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            document.execCommand('copy');
            field.remove();
            showToast('Contoh perintah disalin');
        }
    }

    function speakCommand(command) {
        if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
            showToast('Pemutar suara tidak didukung browser ini');
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(command);
        utterance.lang = 'id-ID';
        utterance.rate = 0.92;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
        showToast('Memutar contoh pengucapan');
    }

    function trapFocus(event) {
        if (event.key === 'Escape') {
            closeGuide(true);
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(dialog.querySelectorAll(
            'button:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex="-1"])'
        )).filter(element => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    nextButton?.addEventListener('click', () => {
        if (currentStep < steps.length - 1) showStep(currentStep + 1);
        else finishOnboarding();
    });
    backButton?.addEventListener('click', () => showStep(currentStep - 1));
    skipButton?.addEventListener('click', () => {
        if (currentStep === steps.length - 1) {
            completeOnboarding();
            setView('library');
        }
        else {
            completeOnboarding();
            closeGuide(false);
        }
    });

    document.querySelectorAll('[data-guide-open]').forEach(button => {
        button.addEventListener('click', () => openGuide(button.dataset.guideOpen || 'library'));
    });
    document.querySelectorAll('[data-guide-close]').forEach(button => {
        button.addEventListener('click', () => closeGuide(true));
    });
    document.querySelectorAll('[data-guide-topic]').forEach(button => {
        button.addEventListener('click', () => selectTopic(button.dataset.guideTopic, true));
    });
    document.querySelectorAll('[data-copy-command]').forEach(button => {
        button.addEventListener('click', () => copyCommand(button.dataset.copyCommand));
    });
    document.querySelectorAll('[data-speak-command]').forEach(button => {
        button.addEventListener('click', () => speakCommand(button.dataset.speakCommand));
    });
    document.querySelectorAll('[data-guide-go-chat]').forEach(button => {
        button.addEventListener('click', () => {
            closeGuide(false);
            goToChatCoachmark();
        });
    });

    coachmark?.querySelector('.guide-coachmark-close')?.addEventListener('click', hideCoachmark);
    coachmark?.querySelector('.guide-coachmark-done')?.addEventListener('click', hideCoachmark);
    overlay.addEventListener('keydown', trapFocus);

    selectTopic('start');
    showStep(0);

    function initializeGuide() {
        if (sessionGet(coachmarkKey) === '1') {
            window.setTimeout(showCoachmark, 500);
        } else if (storageGet(storageKey) !== 'completed') {
            window.setTimeout(() => openGuide('onboarding'), 700);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeGuide, { once: true });
    } else {
        initializeGuide();
    }
})();

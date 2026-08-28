const ThemeCtl = {
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,

    init() {
        this.$btn = document.getElementById('btn-theme');
        this.$iconAuto = document.getElementById('theme-icon-auto');
        this.$iconLight = document.getElementById('theme-icon-light');
        this.$iconDark = document.getElementById('theme-icon-dark');

        this.apply(this.getStored() || 'auto');
        this.$btn.addEventListener('click', () => this.cycle());
    },

    getStored() {
        return localStorage.getItem('qrdrop_theme');
    },

    cycle() {
        const order = ['auto', 'light', 'dark'];
        const next = order[(order.indexOf(this.getStored() || 'auto') + 1) % order.length];
        this.apply(next);
    },

    apply(mode) {
        if (mode === 'auto') {
            localStorage.removeItem('qrdrop_theme');
        } else {
            localStorage.setItem('qrdrop_theme', mode);
        }

        const resolved = mode === 'auto' ? (this.prefersDark ? 'dark' : 'light') : mode;
        document.documentElement.setAttribute('data-theme', resolved);

        [this.$iconAuto, this.$iconLight, this.$iconDark].forEach(el => el.classList.remove('active'));
        ({ auto: this.$iconAuto, light: this.$iconLight, dark: this.$iconDark })[mode].classList.add('active');
    }
};

function createOverlay(overlayId, openBtnId, closeBtnId, onOpen) {
    const $overlay = document.getElementById(overlayId);
    const $openBtn = document.getElementById(openBtnId);
    const $closeBtn = document.getElementById(closeBtnId);
    if (!$overlay || !$openBtn) return null;

    const ctl = {
        $overlay,
        open() {
            $overlay.classList.add('show');
            if (onOpen) onOpen();
        },
        close() {
            $overlay.classList.remove('show');
        }
    };

    $openBtn.addEventListener('click', () => ctl.open());
    $closeBtn.addEventListener('click', () => ctl.close());
    $overlay.addEventListener('click', e => {
        if (e.target === $overlay) ctl.close();
    });
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') ctl.close();
    });

    return ctl;
}

const TextCtl = {
    init() {
        this.$textarea = document.getElementById('text-input');
        this.$sendBtn = document.getElementById('text-send');
        this.$toast = document.getElementById('text-toast');
        this.$toastBody = document.getElementById('text-toast-body');
        this.$toastCopy = document.getElementById('text-toast-copy');
        this.$toastClose = document.getElementById('text-toast-close');
        if (!this.$sendBtn) return;

        this.dialog = createOverlay('text-overlay', 'btn-text', 'text-close', () => {
            this.$textarea.value = '';
            this.$textarea.focus();
        });

        this.$sendBtn.addEventListener('click', () => this.send());
        this.$toastCopy.addEventListener('click', () => this.copyReceived());
        this.$toastClose.addEventListener('click', () => this.hideToast());

        window.addEventListener('text-received', e => this.onReceived(e.detail));
    },

    targets() {
        if (window.qrdrop && window.qrdrop.peers) return Object.keys(window.qrdrop.peers.peers);
        if (window.qrdropSender && window.qrdropSender.targetPeerId) return [window.qrdropSender.targetPeerId];
        return [];
    },

    send() {
        const text = this.$textarea.value.trim();
        if (!text) return;
        this.targets().forEach(id => Events.fire('send-text', { to: id, text }));
        this.dialog.close();
    },

    onReceived(detail) {
        this._received = detail.text;
        this.$toastBody.textContent = detail.text;
        this.$toast.classList.add('show');
    },

    copyReceived() {
        if (!this._received) return;
        navigator.clipboard.writeText(this._received).catch(() => {});
        this.hideToast();
    },

    hideToast() {
        this.$toast.classList.remove('show');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    ThemeCtl.init();
    createOverlay('about-overlay', 'btn-about', 'about-close');
    TextCtl.init();
    I18n.applyStatic();

    const langBtn = document.getElementById('btn-lang');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            I18n.setLang(I18n.current === 'es' ? 'en' : 'es');
        });
    }
});

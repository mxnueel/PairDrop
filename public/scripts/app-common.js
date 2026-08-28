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

const AboutCtl = {
    init() {
        this.$overlay = document.getElementById('about-overlay');
        this.$openBtn = document.getElementById('btn-about');
        this.$closeBtn = document.getElementById('about-close');
        if (!this.$overlay || !this.$openBtn) return;

        this.$openBtn.addEventListener('click', () => this.open());
        this.$closeBtn.addEventListener('click', () => this.close());
        this.$overlay.addEventListener('click', e => {
            if (e.target === this.$overlay) this.close();
        });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.close();
        });
    },
    open() { this.$overlay.classList.add('show'); },
    close() { this.$overlay.classList.remove('show'); }
};

window.addEventListener('DOMContentLoaded', () => {
    ThemeCtl.init();
    AboutCtl.init();
    I18n.applyStatic();

    const langBtn = document.getElementById('btn-lang');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            I18n.setLang(I18n.current === 'es' ? 'en' : 'es');
        });
    }
});

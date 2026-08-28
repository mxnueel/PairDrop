const I18N_STRINGS = {
    es: {
        scan_title: 'Escanea<br>para enviar',
        scan_subtitle: 'Abre la cámara de tu celular, escanea el código y manda fotos o archivos directo a esta pantalla.',
        files_received: 'Archivos recibidos',
        download_all: 'Descargar todo',
        download: 'Descargar',
        preparing_zip: 'Preparando zip…',
        empty_hint: 'Aún no llega nada.',
        connecting: 'Conectando…',
        waiting_scan: 'Esperando que escanees el código…',
        phone_connected: 'Teléfono conectado',
        phones_connected: '{n} teléfonos conectados',
        send_title: '¿Qué envías?',
        send_subtitle: 'Se manda directo a la pantalla que escaneaste, sin subir a ningún servidor.',
        quality_original: 'Calidad original',
        quality_fast: 'Envío rápido',
        btn_photos: 'Fotos',
        btn_files: 'Archivos',
        invalid_title: 'Código no válido',
        invalid_missing: 'Falta el código de la sala. Escanea el QR de nuevo.',
        invalid_expired: 'Este código ya no es válido. Pide uno nuevo.',
        lost_connection: 'Se perdió la conexión con la PC.',
        ready_to_send: 'Conectado. Elige qué enviar.',
        compressing: 'Comprimiendo…',
        preparing_files: 'Preparando {n} archivo(s)…',
        sending: 'Enviando…',
        sent_ok: 'Enviado. Puedes elegir más.',
        about_claim: 'La forma más rápida de mandar fotos y archivos entre tu celular y tu PC. Directo entre dispositivos, sin subir nada a un servidor.',
        about_github: 'Ver en GitHub',
        text_title: 'Enviar texto',
        text_placeholder: 'Escribe algo…',
        text_send: 'Enviar',
        text_received_title: 'Texto recibido',
        text_copy: 'Copiar',
        messages: 'Mensajes',
        no_messages: 'Nada por aquí.'
    },
    en: {
        scan_title: 'Scan<br>to send',
        scan_subtitle: 'Open your phone camera, scan the code, and send photos or files straight to this screen.',
        files_received: 'Received files',
        download_all: 'Download all',
        download: 'Download',
        preparing_zip: 'Preparing zip…',
        empty_hint: 'Nothing yet.',
        connecting: 'Connecting…',
        waiting_scan: 'Waiting for you to scan the code…',
        phone_connected: 'Phone connected',
        phones_connected: '{n} phones connected',
        send_title: 'What are you sending?',
        send_subtitle: 'Goes straight to the screen you scanned, no server upload.',
        quality_original: 'Original quality',
        quality_fast: 'Fast send',
        btn_photos: 'Photos',
        btn_files: 'Files',
        invalid_title: 'Invalid code',
        invalid_missing: 'Missing room code. Scan the QR again.',
        invalid_expired: 'This code is no longer valid. Ask for a new one.',
        lost_connection: 'Lost connection to the PC.',
        ready_to_send: 'Connected. Choose what to send.',
        compressing: 'Compressing…',
        preparing_files: 'Preparing {n} file(s)…',
        sending: 'Sending…',
        sent_ok: 'Sent. You can choose more.',
        about_claim: 'The fastest way to send photos and files between your phone and your PC. Direct between devices, nothing uploaded to a server.',
        about_github: 'View on GitHub',
        text_title: 'Send text',
        text_placeholder: 'Type something…',
        text_send: 'Send',
        text_received_title: 'Text received',
        text_copy: 'Copy',
        messages: 'Messages',
        no_messages: 'Nothing yet.'
    }
};

const I18n = {
    current: localStorage.getItem('qrdrop_lang') || (navigator.language && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es'),

    t(key, vars) {
        let str = (I18N_STRINGS[this.current] && I18N_STRINGS[this.current][key]) || I18N_STRINGS.es[key] || key;
        if (vars) {
            for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
        }
        return str;
    },

    setLang(lang) {
        if (!I18N_STRINGS[lang] || lang === this.current) return;
        this.current = lang;
        localStorage.setItem('qrdrop_lang', lang);
        this.applyStatic();
        window.dispatchEvent(new CustomEvent('lang-changed', { detail: lang }));
    },

    applyStatic() {
        document.documentElement.lang = this.current;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.innerHTML = this.t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
        });
        const langBtn = document.getElementById('btn-lang');
        if (langBtn) langBtn.textContent = this.current.toUpperCase();
    }
};

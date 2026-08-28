class Events {
    static fire(type, detail = {}) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }
    static on(type, callback, options) {
        return window.addEventListener(type, callback, options);
    }
}

class QRDropSender {
    constructor() {
        this.$choose = document.getElementById('choose-screen');
        this.$invalid = document.getElementById('invalid-screen');
        this.$btnPhotos = document.getElementById('btn-photos');
        this.$btnFiles = document.getElementById('btn-files');
        this.$inputPhotos = document.getElementById('input-photos');
        this.$inputFiles = document.getElementById('input-files');
        this.$progressTrack = document.getElementById('progress-track');
        this.$progressFill = document.getElementById('progress-fill');
        this.$feedback = document.getElementById('feedback');

        this.targetPeerId = null;

        this.localization = new Localization();
        this.persistentStorage = new PersistentStorage();
        this.broadcast = new BrowserTabsConnector();

        const params = new URLSearchParams(location.search);
        this.roomId = params.get('room_id');

        if (!this.roomId) {
            this._showInvalid('Falta el código de la sala. Escanea el QR de nuevo.');
            return;
        }

        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('public-room-id-invalid', _ => this._showInvalid('Este código ya no es válido. Pide uno nuevo.'));
        Events.on('peer-connected', _ => this._setReady(true));
        Events.on('peer-disconnected', _ => this._setReady(false));
        Events.on('set-progress', e => this._onProgress(e.detail));
        Events.on('files-sent', _ => this._onSent());
        Events.on('file-transfer-accepted', _ => this._onAccepted());

        this.$btnPhotos.addEventListener('click', () => this.$inputPhotos.click());
        this.$btnFiles.addEventListener('click', () => this.$inputFiles.click());
        this.$inputPhotos.addEventListener('change', () => this._send(this.$inputPhotos));
        this.$inputFiles.addEventListener('change', () => this._send(this.$inputFiles));

        this.localization.setInitialTranslation().catch(() => {});

        this.server = new ServerConnection();
        this.peers = new PeersManager(this.server);
    }

    _onWsConnected() {
        Events.fire('join-public-room', { roomId: this.roomId, createIfInvalid: false });
    }

    _onPeers(message) {
        if (message.peers && message.peers.length) {
            this.targetPeerId = message.peers[0].id;
        }
    }

    _onPeerJoined(message) {
        // In case this device is the second to join (rare), track it too.
        if (!this.targetPeerId) this.targetPeerId = message.peer.id;
    }

    _showInvalid(text) {
        this.$choose.style.display = 'none';
        this.$invalid.style.display = 'flex';
        this.$invalid.querySelector('p').textContent = text;
    }

    _setReady(connected) {
        this.$btnPhotos.disabled = !connected;
        this.$btnFiles.disabled = !connected;
        if (!connected) {
            this._setFeedback('Se perdió la conexión con la PC.', 'err');
        } else {
            this._setFeedback('Conectado — elige qué enviar', 'info');
        }
    }

    _send(inputEl) {
        const files = inputEl.files;
        if (!files || !files.length || !this.targetPeerId) return;

        this.$progressTrack.classList.add('show');
        this.$progressFill.style.width = '0%';
        this._setFeedback(`Preparando ${files.length} archivo(s)…`, 'info');

        Events.fire('files-selected', { to: this.targetPeerId, files: files });
        inputEl.value = '';
    }

    _onAccepted() {
        this._setFeedback('Enviando…', 'info');
    }

    _onProgress(detail) {
        const pct = Math.round((detail.progress || 0) * 100);
        this.$progressFill.style.width = pct + '%';
    }

    _onSent() {
        this.$progressTrack.classList.remove('show');
        this.$progressFill.style.width = '0%';
        this._setFeedback('✅ Enviado. Puedes elegir más.', 'ok');
    }

    _setFeedback(text, kind) {
        this.$feedback.textContent = text;
        this.$feedback.className = 'feedback ' + kind;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.qrdropSender = new QRDropSender();
});

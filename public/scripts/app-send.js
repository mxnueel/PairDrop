class Events {
    static fire(type, detail = {}) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }
    static on(type, callback, options) {
        return window.addEventListener(type, callback, options);
    }
}

const COMPRESS_MAX_DIMENSION = 1600;
const COMPRESS_QUALITY = 0.75;
const COMPRESS_MIN_SIZE = 700 * 1024; // only worth compressing above this

function compressImage(file, maxDim = COMPRESS_MAX_DIMENSION, quality = COMPRESS_QUALITY) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                if (width >= height) {
                    height = Math.round(height * (maxDim / width));
                    width = maxDim;
                } else {
                    width = Math.round(width * (maxDim / height));
                    height = maxDim;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(objectUrl);
                if (!blob) { reject(new Error('toBlob failed')); return; }
                resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            }, 'image/jpeg', quality);
        };
        img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e); };
        img.src = objectUrl;
    });
}

async function prepareFilesForFastMode(files) {
    const result = [];
    for (const file of files) {
        const isCompressible = file.type.startsWith('image/') && file.type !== 'image/gif';
        if (isCompressible && file.size > COMPRESS_MIN_SIZE) {
            try {
                result.push(await compressImage(file));
                continue;
            } catch (e) {
                console.error('Compression failed, sending original:', e);
            }
        }
        result.push(file);
    }
    return result;
}

class QRDropSender {
    constructor() {
        this.$choose = document.getElementById('choose-screen');
        this.$invalid = document.getElementById('invalid-screen');
        this.$invalidReason = document.getElementById('invalid-reason');
        this.$btnPhotos = document.getElementById('btn-photos');
        this.$btnFiles = document.getElementById('btn-files');
        this.$inputPhotos = document.getElementById('input-photos');
        this.$inputFiles = document.getElementById('input-files');
        this.$progressTrack = document.getElementById('progress-track');
        this.$progressFill = document.getElementById('progress-fill');
        this.$feedback = document.getElementById('feedback');
        this.$qOriginal = document.getElementById('q-original');
        this.$qFast = document.getElementById('q-fast');

        this.targetPeerId = null;
        this.qualityMode = 'original';
        this.peerConnected = false;
        this._lastFeedback = { key: 'connecting', kind: 'info' };
        this._lastInvalidKey = null;

        this.localization = new Localization();
        this.persistentStorage = new PersistentStorage();
        this.broadcast = new BrowserTabsConnector();

        window.addEventListener('lang-changed', () => this._onLangChanged());

        const params = new URLSearchParams(location.search);
        this.roomId = params.get('room_id');

        if (!this.roomId) {
            this._showInvalid('invalid_missing');
            return;
        }

        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('public-room-id-invalid', _ => this._showInvalid('invalid_expired'));
        Events.on('peer-connected', _ => { this.peerConnected = true; this._setReady(true); });
        Events.on('peer-disconnected', _ => { this.peerConnected = false; this._setReady(false); this._scheduleReconnect(); });
        Events.on('set-progress', e => this._onProgress(e.detail));
        Events.on('files-sent', _ => this._onSent());
        Events.on('file-transfer-accepted', _ => this._onAccepted());

        this.$qOriginal.addEventListener('click', () => this._setQuality('original'));
        this.$qFast.addEventListener('click', () => this._setQuality('fast'));

        this.$btnPhotos.addEventListener('click', () => this.$inputPhotos.click());
        this.$btnFiles.addEventListener('click', () => this.$inputFiles.click());
        this.$inputPhotos.addEventListener('change', () => this._send(this.$inputPhotos, true));
        this.$inputFiles.addEventListener('change', () => this._send(this.$inputFiles, false));

        this.localization.setInitialTranslation().catch(() => {});

        this.server = new ServerConnection();
        this.peers = new PeersManager(this.server);
    }

    _setQuality(mode) {
        this.qualityMode = mode;
        this.$qOriginal.classList.toggle('active', mode === 'original');
        this.$qFast.classList.toggle('active', mode === 'fast');
    }

    _onWsConnected() {
        // A backgrounded tab (e.g. while the native photo picker is open) can
        // silently reconnect the WebSocket. Rejoining the room in that case
        // makes the server force a leave+rejoin cycle that tears down an
        // already-working RTC connection. Only (re)join when we don't
        // already have one.
        if (this.peerConnected) return;
        Events.fire('join-public-room', { roomId: this.roomId, createIfInvalid: false });
    }

    _scheduleReconnect() {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
            if (this.peerConnected) return;
            Events.fire('join-public-room', { roomId: this.roomId, createIfInvalid: false });
        }, 1500);
    }

    _onPeers(message) {
        if (message.peers && message.peers.length) {
            this.targetPeerId = message.peers[0].id;
        }
    }

    _onPeerJoined(message) {
        if (!this.targetPeerId) this.targetPeerId = message.peer.id;
    }

    _showInvalid(key) {
        this._lastInvalidKey = key;
        this.$choose.style.display = 'none';
        this.$invalid.style.display = 'flex';
        this.$invalidReason.textContent = I18n.t(key);
    }

    _setReady(connected) {
        this.$btnPhotos.disabled = !connected;
        this.$btnFiles.disabled = !connected;
        this._setFeedback(connected ? 'ready_to_send' : 'lost_connection', connected ? 'info' : 'err');
    }

    async _send(inputEl, isPhotos) {
        const originalFiles = Array.from(inputEl.files || []);
        if (!originalFiles.length || !this.targetPeerId) return;

        let files = originalFiles;
        if (isPhotos && this.qualityMode === 'fast') {
            this._setFeedback('compressing', 'info');
            files = await prepareFilesForFastMode(originalFiles);
        }

        this.$progressTrack.classList.add('show');
        this.$progressFill.style.width = '0%';
        this._setFeedback('preparing_files', 'info', { n: files.length });

        Events.fire('files-selected', { to: this.targetPeerId, files: files });
        inputEl.value = '';
    }

    _onAccepted() {
        this._setFeedback('sending', 'info');
    }

    _onProgress(detail) {
        const pct = Math.round((detail.progress || 0) * 100);
        this.$progressFill.style.width = pct + '%';
    }

    _onSent() {
        this.$progressTrack.classList.remove('show');
        this.$progressFill.style.width = '0%';
        this._setFeedback('sent_ok', 'ok');
    }

    _setFeedback(key, kind, vars) {
        this.$feedback.textContent = I18n.t(key, vars);
        this.$feedback.className = 'feedback ' + kind;
        this._lastFeedback = { key, kind, vars };
    }

    _onLangChanged() {
        if (this._lastInvalidKey) {
            this.$invalidReason.textContent = I18n.t(this._lastInvalidKey);
        }
        this._setFeedback(this._lastFeedback.key, this._lastFeedback.kind, this._lastFeedback.vars);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.qrdropSender = new QRDropSender();
});

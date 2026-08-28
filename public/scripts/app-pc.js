class Events {
    static fire(type, detail = {}) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }
    static on(type, callback, options) {
        return window.addEventListener(type, callback, options);
    }
}

const FILE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>';

class QRDropReceiver {
    constructor() {
        this.$qrFrame = document.getElementById('qr-frame');
        this.$qrSvg = document.getElementById('qr-svg');
        this.$roomCode = document.getElementById('room-code');
        this.$statusDot = document.getElementById('status-dot');
        this.$statusText = document.getElementById('status-text');
        this.$fileList = document.getElementById('file-list');
        this.$emptyHint = document.getElementById('empty-hint');
        this.$downloadAllBtn = document.getElementById('btn-download-all');
        this.$downloadAllLabel = document.getElementById('download-all-label');
        this.$lightbox = document.getElementById('lightbox-overlay');
        this.$lightboxImg = document.getElementById('lightbox-img');
        this.$lightboxClose = document.getElementById('lightbox-close');
        this.$btnSendToPhone = document.getElementById('btn-send-to-phone');
        this.$inputSendToPhone = document.getElementById('input-send-to-phone');
        this.$sendFeedback = document.getElementById('send-feedback');

        this.connectedPeerIds = new Set();
        this._pendingSendCompletions = 0;
        this.roomId = null;
        this.receivedFiles = [];
        this._lastStatus = { state: 'waiting', key: 'connecting', vars: undefined };

        this.localization = new Localization();
        this.persistentStorage = new PersistentStorage();
        this.broadcast = new BrowserTabsConnector();

        Events.on('public-room-created', e => this._onRoomCreated(e.detail));
        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('peer-joined', e => this._onPeerJoined(e.detail.peer.id));
        Events.on('peer-connected', e => this._onPeerConnected(e.detail.peerId));
        Events.on('peer-disconnected', e => this._onPeerDisconnected(e.detail));
        Events.on('files-transfer-request', e => this._onFilesTransferRequest(e.detail));
        Events.on('files-received', e => this._onFilesReceived(e.detail));
        Events.on('files-sent', _ => this._onSendToPhoneCompleted());
        window.addEventListener('lang-changed', () => this._setStatus(this._lastStatus.state, this._lastStatus.key, this._lastStatus.vars));
        window.addEventListener('beforeunload', e => {
            if (this.receivedFiles.length > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        this.$downloadAllBtn.addEventListener('click', () => this._downloadAll());
        this.$btnSendToPhone.addEventListener('click', () => this.$inputSendToPhone.click());
        this.$inputSendToPhone.addEventListener('change', () => this._sendToPhones());
        this.$lightboxClose.addEventListener('click', () => this._closeLightbox());
        this.$lightbox.addEventListener('click', e => {
            if (e.target === this.$lightbox) this._closeLightbox();
        });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') this._closeLightbox();
        });

        this.localization.setInitialTranslation().catch(() => {});

        this.server = new ServerConnection();
        this.peers = new PeersManager(this.server);
    }

    _onWsConnected() {
        // A reconnect (tab backgrounded/throttled, brief network drop) fires
        // this again. Rejoining while phones are already connected makes the
        // server force a leave+rejoin cycle that disconnects them and
        // double-counts them when re-announced. Only skip if we have
        // something to protect; with no live peers, rejoining is safe and
        // needed to restore server-side room membership for new scanners.
        if (this.connectedPeerIds.size > 0) return;
        this._setStatus('waiting', 'waiting_scan');
        // Reuse the same room across reloads so an already-displayed QR
        // keeps working for anyone who hasn't scanned it yet.
        const stored = localStorage.getItem('qrdrop_room_id');
        if (stored) {
            this._renderRoom(stored);
            Events.fire('join-public-room', { roomId: stored, createIfInvalid: true });
        } else {
            Events.fire('create-public-room');
        }
    }

    _onRoomCreated(roomId) {
        localStorage.setItem('qrdrop_room_id', roomId);
        this._renderRoom(roomId);
    }

    _renderRoom(roomId) {
        this.roomId = roomId;
        const url = new URL('send.html', location.href);
        url.searchParams.set('room_id', roomId);

        const qr = new QRCode({
            content: url.href,
            width: 200,
            height: 200,
            padding: 1,
            background: '#ffffff',
            color: '#111318',
            ecl: 'M',
            join: true
        });
        this.$qrSvg.innerHTML = qr.svg();
        this._setRoomCode(roomId.toUpperCase());
    }

    _setRoomCode(code) {
        this.$roomCode.innerHTML = '';
        [...code].forEach((char, i) => {
            const span = document.createElement('span');
            span.className = 'rc-char';
            const flipDelay = 0.35 + i * 0.06;
            const floatDelay = flipDelay + 0.55 + i * 0.08;
            span.style.animationDelay = `${flipDelay}s, ${floatDelay}s`;
            span.textContent = char;
            this.$roomCode.appendChild(span);
        });
    }

    _onPeerJoined(peerId) {
        this.connectedPeerIds.add(peerId);
        this._setConnectedStatus();
        this.$qrFrame.classList.add('connected');
    }

    _onPeerConnected(peerId) {
        this.connectedPeerIds.add(peerId);
        this._setConnectedStatus();
        this.$qrFrame.classList.add('connected');
        this.$btnSendToPhone.disabled = false;
    }

    _setConnectedStatus() {
        const n = this.connectedPeerIds.size;
        if (n > 1) {
            this._setStatus('connected', 'phones_connected', { n });
        } else {
            this._setStatus('connected', 'phone_connected');
        }
    }

    _onPeerDisconnected(peerId) {
        this.connectedPeerIds.delete(peerId);
        if (this.connectedPeerIds.size === 0) {
            this._setStatus('waiting', 'waiting_scan');
            this.$qrFrame.classList.remove('connected');
            this.$btnSendToPhone.disabled = true;
        } else {
            this._setConnectedStatus();
        }
    }

    _sendToPhones() {
        const files = Array.from(this.$inputSendToPhone.files || []);
        this.$inputSendToPhone.value = '';
        if (!files.length || this.connectedPeerIds.size === 0) return;

        const targets = [...this.connectedPeerIds];
        this._pendingSendCompletions = targets.length;
        this.$sendFeedback.textContent = I18n.t('sending_to_phone');
        this.$sendFeedback.className = 'send-feedback info';

        targets.forEach(peerId => {
            Events.fire('files-selected', { to: peerId, files: files });
        });
    }

    _onSendToPhoneCompleted() {
        if (this._pendingSendCompletions <= 0) return;
        this._pendingSendCompletions--;
        if (this._pendingSendCompletions === 0) {
            this.$sendFeedback.textContent = I18n.t('sent_to_phone_ok');
            this.$sendFeedback.className = 'send-feedback ok';
        }
    }

    _onFilesTransferRequest(detail) {
        // Auto-accept: this is a private, freshly generated room, no need to confirm.
        Events.fire('respond-to-files-transfer-request', { to: detail.peerId, accepted: true });
    }

    _onFilesReceived(detail) {
        this.$emptyHint.style.display = 'none';
        for (const file of detail.files) {
            this.receivedFiles.push(file);
            this._addFileRow(file);
        }
        this.$downloadAllBtn.disabled = this.receivedFiles.length === 0;
    }

    _addFileRow(file) {
        const url = URL.createObjectURL(file);
        const row = document.createElement('div');
        row.className = 'file-row';

        const isImage = file.type.startsWith('image/');
        const icon = document.createElement(isImage ? 'img' : 'div');
        icon.className = 'icon';
        if (isImage) {
            icon.src = url;
            icon.classList.add('viewable');
            icon.addEventListener('click', () => this._openLightbox(url));
        } else {
            icon.innerHTML = FILE_ICON_SVG;
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = file.name;
        const size = document.createElement('div');
        size.className = 'size';
        size.textContent = this._formatSize(file.size);
        meta.appendChild(name);
        meta.appendChild(size);

        const dl = document.createElement('a');
        dl.className = 'dl';
        dl.href = url;
        dl.download = file.name;
        dl.textContent = I18n.t('download');

        row.appendChild(icon);
        row.appendChild(meta);
        row.appendChild(dl);
        this.$fileList.prepend(row);
    }

    async _downloadAll() {
        if (!this.receivedFiles.length) return;

        this.$downloadAllBtn.disabled = true;
        this.$downloadAllLabel.textContent = I18n.t('preparing_zip');

        try {
            const usedNames = new Set();
            zipper.createNewZipWriter();
            for (const file of this.receivedFiles) {
                let name = file.name;
                let i = 1;
                while (usedNames.has(name)) {
                    const dot = file.name.lastIndexOf('.');
                    name = dot > 0
                        ? `${file.name.slice(0, dot)} (${i})${file.name.slice(dot)}`
                        : `${file.name} (${i})`;
                    i++;
                }
                usedNames.add(name);
                const entry = name === file.name ? file : new File([file], name, { type: file.type });
                await zipper.addFile(entry);
            }
            const blobUrl = await zipper.getBlobURL();

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = 'qrdrop.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            console.error('Could not build zip:', e);
        } finally {
            this.$downloadAllLabel.textContent = I18n.t('download_all');
            this.$downloadAllBtn.disabled = false;
        }
    }

    _openLightbox(url) {
        this.$lightboxImg.src = url;
        this.$lightbox.classList.add('show');
    }

    _closeLightbox() {
        this.$lightbox.classList.remove('show');
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    _setStatus(state, key, vars) {
        this.$statusDot.className = 'status-dot ' + state;
        this.$statusText.textContent = I18n.t(key, vars);
        this._lastStatus = { state, key, vars };
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.qrdrop = new QRDropReceiver();
});

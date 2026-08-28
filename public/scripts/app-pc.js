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
        this.$roomCode = document.getElementById('room-code');
        this.$statusDot = document.getElementById('status-dot');
        this.$statusText = document.getElementById('status-text');
        this.$fileList = document.getElementById('file-list');
        this.$emptyHint = document.getElementById('empty-hint');
        this.$downloadAllBtn = document.getElementById('btn-download-all');
        this.$downloadAllLabel = document.getElementById('download-all-label');

        this.connectedPeers = 0;
        this.roomId = null;
        this.receivedFiles = [];
        this._lastStatus = { state: 'waiting', key: 'connecting', vars: undefined };

        this.localization = new Localization();
        this.persistentStorage = new PersistentStorage();
        this.broadcast = new BrowserTabsConnector();

        Events.on('public-room-created', e => this._onRoomCreated(e.detail));
        Events.on('ws-connected', _ => this._onWsConnected());
        Events.on('peer-joined', _ => this._onPeerJoined());
        Events.on('peer-connected', _ => this._onPeerConnected());
        Events.on('peer-disconnected', _ => this._onPeerDisconnected());
        Events.on('files-transfer-request', e => this._onFilesTransferRequest(e.detail));
        Events.on('files-received', e => this._onFilesReceived(e.detail));
        window.addEventListener('lang-changed', () => this._setStatus(this._lastStatus.state, this._lastStatus.key, this._lastStatus.vars));

        this.$downloadAllBtn.addEventListener('click', () => this._downloadAll());

        this.localization.setInitialTranslation().catch(() => {});

        this.server = new ServerConnection();
        this.peers = new PeersManager(this.server);
    }

    _onWsConnected() {
        this._setStatus('waiting', 'waiting_scan');
        Events.fire('create-public-room');
    }

    _onRoomCreated(roomId) {
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
        this.$qrFrame.innerHTML = qr.svg();
        this._setRoomCode(roomId.toUpperCase());
    }

    _setRoomCode(code) {
        this.$roomCode.innerHTML = '';
        [...code].forEach((char, i) => {
            const span = document.createElement('span');
            span.className = 'rc-char';
            span.style.animationDelay = `${0.35 + i * 0.06}s`;
            span.textContent = char;
            this.$roomCode.appendChild(span);
        });
    }

    _onPeerJoined() {
        this.connectedPeers++;
        this._setConnectedStatus();
        this.$qrFrame.classList.add('connected');
    }

    _onPeerConnected() {
        this._setConnectedStatus();
        this.$qrFrame.classList.add('connected');
    }

    _setConnectedStatus() {
        if (this.connectedPeers > 1) {
            this._setStatus('connected', 'phones_connected', { n: this.connectedPeers });
        } else {
            this._setStatus('connected', 'phone_connected');
        }
    }

    _onPeerDisconnected() {
        this.connectedPeers = Math.max(0, this.connectedPeers - 1);
        if (this.connectedPeers === 0) {
            this._setStatus('waiting', 'waiting_scan');
            this.$qrFrame.classList.remove('connected');
        } else {
            this._setConnectedStatus();
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

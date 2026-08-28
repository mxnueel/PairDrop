class Events {
    static fire(type, detail = {}) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }
    static on(type, callback, options) {
        return window.addEventListener(type, callback, options);
    }
}

class QRDropReceiver {
    constructor() {
        this.$qrFrame = document.getElementById('qr-frame');
        this.$roomCode = document.getElementById('room-code');
        this.$statusDot = document.getElementById('status-dot');
        this.$statusText = document.getElementById('status-text');
        this.$fileList = document.getElementById('file-list');
        this.$emptyHint = document.getElementById('empty-hint');

        this.connectedPeers = 0;
        this.roomId = null;

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

        this.localization.setInitialTranslation().catch(() => {});

        this.server = new ServerConnection();
        this.peers = new PeersManager(this.server);
    }

    _onWsConnected() {
        this._setStatus('waiting', 'Esperando que escanees el código…');
        Events.fire('create-public-room');
    }

    _onRoomCreated(roomId) {
        this.roomId = roomId;
        const url = new URL('send.html', location.href);
        url.searchParams.set('room_id', roomId);

        const qr = new QRCode({
            content: url.href,
            width: 220,
            height: 220,
            padding: 1,
            background: '#ffffff',
            color: '#111318',
            ecl: 'M',
            join: true
        });
        this.$qrFrame.innerHTML = qr.svg();
        this.$roomCode.textContent = roomId.toUpperCase();
    }

    _onPeerJoined() {
        this.connectedPeers++;
        this._setStatus('connected', 'Teléfono conectado — listo para recibir');
    }

    _onPeerConnected() {
        this._setStatus('connected', 'Teléfono conectado — listo para recibir');
    }

    _onPeerDisconnected() {
        this.connectedPeers = Math.max(0, this.connectedPeers - 1);
        if (this.connectedPeers === 0) {
            this._setStatus('waiting', 'Esperando que escanees el código…');
        }
    }

    _onFilesTransferRequest(detail) {
        // Auto-accept: this is a private, freshly generated room, no need to confirm.
        Events.fire('respond-to-files-transfer-request', { to: detail.peerId, accepted: true });
    }

    _onFilesReceived(detail) {
        this.$emptyHint.style.display = 'none';
        for (const file of detail.files) {
            this._addFileRow(file);
        }
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
            icon.textContent = '📄';
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
        dl.textContent = 'Descargar';

        row.appendChild(icon);
        row.appendChild(meta);
        row.appendChild(dl);
        this.$fileList.prepend(row);
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    _setStatus(state, text) {
        this.$statusDot.className = 'status-dot ' + state;
        this.$statusText.textContent = text;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.qrdrop = new QRDropReceiver();
});

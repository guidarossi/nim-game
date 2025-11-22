class WebRTCManager {
    constructor(socket, myPlayerId, roomID) {
        this.socket = socket;
        this.myPlayerId = myPlayerId;
        this.roomID = roomID;
        this.peerConnection = null;
        this.localStream = null;
        
        this.remoteVideoEl = document.getElementById('remote-video');
        this.localVideoEl = document.getElementById('local-video');
        this.placeholderEl = document.getElementById('camera-placeholder');
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.socket.on('webrtc_signal', (data) => this.handleSignal(data));
    }

    createPeerConnection() {
        if (this.peerConnection) return;

        this.peerConnection = new RTCPeerConnection(this.configuration);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) this.sendSignal('candidate', event.candidate);
        };

        this.peerConnection.ontrack = (event) => {
            if (this.remoteVideoEl.srcObject !== event.streams[0]) {
                this.remoteVideoEl.srcObject = event.streams[0];
                this.placeholderEl.classList.add('hidden');
            }
        };
    }

    async startLocalStream() {
        try {
            // Pede ambos
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            this.localVideoEl.srcObject = this.localStream;
            this.localVideoEl.muted = true; // Muta localmente para evitar eco

            // Esconde placeholder se eu liguei
            this.placeholderEl.classList.add('hidden');

            if (!this.peerConnection) this.createPeerConnection();

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            return true;
        } catch (error) {
            console.error("Erro media:", error);
            alert("Erro ao acessar câmera/microfone: " + error.name);
            return false;
        }
    }

    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                // Remove da conexão
                if (this.peerConnection) {
                    const sender = this.peerConnection.getSenders().find(s => s.track === track);
                    if (sender) this.peerConnection.removeTrack(sender);
                }
            });
            this.localStream = null;
            this.localVideoEl.srcObject = null;
            
            // Restaura placeholder se o remoto também estiver off
            if (!this.remoteVideoEl.srcObject) {
                this.placeholderEl.classList.remove('hidden');
            }
        }
    }

    // --- MÉTODOS NOVOS DE CONTROLE ---
    
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return audioTrack.enabled; // Retorna true se estiver ligado, false se mudo
            }
        }
        return false;
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                return videoTrack.enabled; // Retorna estado atual
            }
        }
        return false;
    }

    async createOffer() {
        if (!this.peerConnection) this.createPeerConnection();
        try {
            const offerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: true, iceRestart: true };
            const offer = await this.peerConnection.createOffer(offerOptions);
            await this.peerConnection.setLocalDescription(offer);
            this.sendSignal('offer', offer);
        } catch (err) { console.error(err); }
    }

    sendSignal(type, payload) {
        this.socket.emit('webrtc_signal', { roomID: this.roomID, type: type, payload: payload });
    }

    async handleSignal(data) {
        if (!this.peerConnection) this.createPeerConnection();
        const { type, payload } = data;
        try {
            if (type === 'offer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.sendSignal('answer', answer);
            } 
            else if (type === 'answer') await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
            else if (type === 'candidate' && payload) await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) { console.error(e); }
    }
}
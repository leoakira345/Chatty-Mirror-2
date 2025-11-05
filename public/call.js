// WebRTC Call Manager with Sound Effects
class CallManager {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.userId = null;
        this.friendId = null;
        this.friendName = null;
        this.isVideoCall = true;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.callStartTime = null;
        this.timerInterval = null;
        this.currentCamera = 'user';
        
        // Audio elements
        this.outgoingRingtone = null;
        this.incomingRingtone = null;
        this.callEndSound = null;

        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.init();
    }

    init() {
        // Get call parameters from URL
        const params = new URLSearchParams(window.location.search);
        this.userId = params.get('userId');
        this.friendId = params.get('friendId');
        this.friendName = params.get('friendName') || 'User';
        this.isVideoCall = params.get('type') === 'video';

        // Initialize audio
        this.initializeAudio();

        // Connect to Socket.IO server
        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.socket.emit('register', this.userId);
        });

        // WebRTC signaling events
        this.socket.on('call:offer', (data) => this.handleOffer(data));
        this.socket.on('call:answer', (data) => this.handleAnswer(data));
        this.socket.on('call:ice-candidate', (data) => this.handleIceCandidate(data));
        this.socket.on('call:ended', () => this.handleCallEnded());
        this.socket.on('call:declined', () => this.handleCallDeclined());

        this.setupUI();
        this.checkCallType();
    }

    initializeAudio() {
        // Outgoing call ringtone (for caller)
        this.outgoingRingtone = new Audio();
        this.outgoingRingtone.loop = true;
        // Using a simple tone generator or you can use a URL to an audio file
        this.outgoingRingtone.src = this.generateOutgoingTone();
        
        // Incoming call ringtones (for receiver) - random selection
        const incomingRingtones = [
            this.generateIncomingTone1(),
            this.generateIncomingTone2(),
            this.generateIncomingTone3(),
            this.generateIncomingTone4()
        ];
        
        // Select random ringtone
        const randomIndex = Math.floor(Math.random() * incomingRingtones.length);
        this.incomingRingtone = new Audio();
        this.incomingRingtone.loop = true;
        this.incomingRingtone.src = incomingRingtones[randomIndex];

        // Call end sound
        this.callEndSound = new Audio();
        this.callEndSound.src = this.generateCallEndSound();
    }

    // Generate outgoing ringtone (simple beep pattern)
    generateOutgoingTone() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 2;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Create beep pattern: 0.4s on, 0.2s off, 0.4s on, 1.0s off
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const freq = 440; // A4 note
            
            if ((time < 0.4) || (time >= 0.6 && time < 1.0)) {
                data[i] = Math.sin(2 * Math.PI * freq * time) * 0.3;
            } else {
                data[i] = 0;
            }
        }
        
        // Convert to WAV and create blob URL
        return this.bufferToWave(buffer, sampleRate);
    }

    // Generate incoming ringtone 1 (Classic phone ring)
    generateIncomingTone1() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 4;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const cycle = time % 4;
            
            if (cycle < 2) {
                // Ring for 2 seconds
                const freq1 = 440;
                const freq2 = 480;
                data[i] = (Math.sin(2 * Math.PI * freq1 * time) + 
                          Math.sin(2 * Math.PI * freq2 * time)) * 0.25;
            } else {
                // Silence for 2 seconds
                data[i] = 0;
            }
        }
        
        return this.bufferToWave(buffer, sampleRate);
    }

    // Generate incoming ringtone 2 (Ascending tones)
    generateIncomingTone2() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 3;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        const frequencies = [523, 587, 659, 698]; // C5, D5, E5, F5
        
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const noteIndex = Math.floor((time % 3) / 0.3) % frequencies.length;
            const freq = frequencies[noteIndex];
            
            if ((time % 3) < 1.2) {
                data[i] = Math.sin(2 * Math.PI * freq * time) * 0.3;
            } else {
                data[i] = 0;
            }
        }
        
        return this.bufferToWave(buffer, sampleRate);
    }

    // Generate incoming ringtone 3 (Two-tone alert)
    generateIncomingTone3() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 2.5;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const cycle = time % 2.5;
            
            if (cycle < 0.5) {
                data[i] = Math.sin(2 * Math.PI * 800 * time) * 0.3;
            } else if (cycle >= 0.5 && cycle < 1.0) {
                data[i] = Math.sin(2 * Math.PI * 1000 * time) * 0.3;
            } else {
                data[i] = 0;
            }
        }
        
        return this.bufferToWave(buffer, sampleRate);
    }

    // Generate incoming ringtone 4 (Triple beep)
    generateIncomingTone4() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 3;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const cycle = time % 3;
            const freq = 600;
            
            if ((cycle < 0.2) || (cycle >= 0.4 && cycle < 0.6) || (cycle >= 0.8 && cycle < 1.0)) {
                data[i] = Math.sin(2 * Math.PI * freq * time) * 0.3;
            } else {
                data[i] = 0;
            }
        }
        
        return this.bufferToWave(buffer, sampleRate);
    }

    // Generate call end sound (descending tone)
    generateCallEndSound() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 0.5;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        const startFreq = 800;
        const endFreq = 400;
        
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const progress = time / duration;
            const freq = startFreq - (startFreq - endFreq) * progress;
            const envelope = 1 - progress; // Fade out
            
            data[i] = Math.sin(2 * Math.PI * freq * time) * envelope * 0.4;
        }
        
        return this.bufferToWave(buffer, sampleRate);
    }

    // Convert AudioBuffer to WAV format
    bufferToWave(buffer, sampleRate) {
        const length = buffer.length * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);
        const channels = 1;
        const data = buffer.getChannelData(0);
        
        // WAV header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, channels * 2, true);
        view.setUint16(34, 16, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, length, true);
        
        // Write audio data
        let offset = 44;
        for (let i = 0; i < data.length; i++) {
            const sample = Math.max(-1, Math.min(1, data[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        
        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    playOutgoingRingtone() {
        if (this.outgoingRingtone) {
            this.outgoingRingtone.play().catch(e => console.log('Ringtone play failed:', e));
        }
    }

    playIncomingRingtone() {
        if (this.incomingRingtone) {
            this.incomingRingtone.play().catch(e => console.log('Ringtone play failed:', e));
        }
    }

    playCallEndSound() {
        if (this.callEndSound) {
            this.callEndSound.play().catch(e => console.log('Call end sound failed:', e));
        }
    }

    stopRingtones() {
        if (this.outgoingRingtone) {
            this.outgoingRingtone.pause();
            this.outgoingRingtone.currentTime = 0;
        }
        if (this.incomingRingtone) {
            this.incomingRingtone.pause();
            this.incomingRingtone.currentTime = 0;
        }
    }

    setupUI() {
        // Incoming call buttons
        document.getElementById('acceptBtn').addEventListener('click', () => this.acceptCall());
        document.getElementById('declineBtn').addEventListener('click', () => this.declineCall());

        // Call control buttons
        document.getElementById('toggleVideoBtn').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudioBtn').addEventListener('click', () => this.toggleAudio());
        document.getElementById('switchCameraBtn').addEventListener('click', () => this.switchCamera());
        document.getElementById('endCallBtn').addEventListener('click', () => this.endCall());

        // Close button
        document.getElementById('closeCallBtn').addEventListener('click', () => {
            window.close();
        });

        // Set caller info
        document.getElementById('callerName').textContent = this.friendName;
        document.getElementById('callerInitial').textContent = this.friendName.charAt(0).toUpperCase();
        document.getElementById('remoteUserName').textContent = this.friendName;
        document.getElementById('remoteUserInitial').textContent = this.friendName.charAt(0).toUpperCase();
    }

    async checkCallType() {
        const type = new URLSearchParams(window.location.search).get('callType');
        
        if (type === 'outgoing') {
            // Outgoing call - start immediately and play ringtone
            this.playOutgoingRingtone();
            await this.startCall();
        } else {
            // Incoming call - show incoming screen and play ringtone
            this.playIncomingRingtone();
            document.getElementById('incomingCallScreen').style.display = 'flex';
            document.getElementById('callType').textContent = this.isVideoCall ? 'Video Call' : 'Voice Call';
        }
    }

    async startCall() {
        try {
            // Get user media
            await this.getUserMedia();

            // Show active call screen
            this.showActiveCallScreen();

            // Create peer connection
            this.createPeerConnection();

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('call:offer', {
                to: this.friendId,
                from: this.userId,
                offer: offer,
                isVideoCall: this.isVideoCall
            });

            document.getElementById('callStatus').textContent = 'Calling...';
        } catch (error) {
            console.error('Error starting call:', error);
            this.stopRingtones();
            alert('Failed to start call: ' + error.message);
        }
    }

    async acceptCall() {
        try {
            // Stop incoming ringtone
            this.stopRingtones();

            // Get user media
            await this.getUserMedia();

            // Hide incoming screen, show active screen
            document.getElementById('incomingCallScreen').style.display = 'none';
            this.showActiveCallScreen();

            document.getElementById('callStatus').textContent = 'Connecting...';

            // Notify the caller that call was accepted
            this.socket.emit('call:accepted', {
                to: this.friendId,
                from: this.userId
            });
        } catch (error) {
            console.error('Error accepting call:', error);
            this.stopRingtones();
            alert('Failed to accept call: ' + error.message);
        }
    }

    declineCall() {
        this.stopRingtones();
        this.socket.emit('call:declined', {
            to: this.friendId,
            from: this.userId
        });
        window.close();
    }

    async getUserMedia() {
        const constraints = {
            audio: true,
            video: this.isVideoCall ? {
                facingMode: this.currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } : false
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            document.getElementById('localVideo').srcObject = this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);

        // Add local stream tracks
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                document.getElementById('remoteVideo').srcObject = this.remoteStream;
            }
            this.remoteStream.addTrack(event.track);
            
            // Hide placeholder when video starts
            if (event.track.kind === 'video') {
                document.getElementById('remoteVideoPlaceholder').style.display = 'none';
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('call:ice-candidate', {
                    to: this.friendId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.onCallConnected();
            } else if (this.peerConnection.connectionState === 'disconnected' || 
                       this.peerConnection.connectionState === 'failed') {
                this.handleCallEnded();
            }
        };
    }

    async handleOffer(data) {
        try {
            this.createPeerConnection();
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('call:answer', {
                to: data.from,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(data) {
        try {
            // Stop outgoing ringtone when call is answered
            this.stopRingtones();
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(data) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    onCallConnected() {
        // Stop all ringtones
        this.stopRingtones();
        
        document.getElementById('callStatus').style.display = 'none';
        document.getElementById('callTimer').style.display = 'block';
        this.callStartTime = Date.now();
        this.startTimer();
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            document.getElementById('callTimer').textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    showActiveCallScreen() {
        document.getElementById('incomingCallScreen').style.display = 'none';
        document.getElementById('activeCallScreen').style.display = 'block';
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                this.isVideoEnabled = !this.isVideoEnabled;
                videoTrack.enabled = this.isVideoEnabled;

                // Update button UI
                const videoBtn = document.getElementById('toggleVideoBtn');
                document.getElementById('videoOnIcon').style.display = this.isVideoEnabled ? 'block' : 'none';
                document.getElementById('videoOffIcon').style.display = this.isVideoEnabled ? 'none' : 'block';
                
                if (this.isVideoEnabled) {
                    videoBtn.classList.remove('active');
                } else {
                    videoBtn.classList.add('active');
                }
            }
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                this.isAudioEnabled = !this.isAudioEnabled;
                audioTrack.enabled = this.isAudioEnabled;

                // Update button UI
                const audioBtn = document.getElementById('toggleAudioBtn');
                document.getElementById('audioOnIcon').style.display = this.isAudioEnabled ? 'block' : 'none';
                document.getElementById('audioOffIcon').style.display = this.isAudioEnabled ? 'none' : 'block';
                
                if (this.isAudioEnabled) {
                    audioBtn.classList.remove('active');
                } else {
                    audioBtn.classList.add('active');
                }
            }
        }
    }

    async switchCamera() {
        if (!this.isVideoCall || !this.localStream) return;

        try {
            // Stop current video track
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.stop();
            }

            // Switch camera
            this.currentCamera = this.currentCamera === 'user' ? 'environment' : 'user';

            // Get new video stream
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: this.currentCamera,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            // Replace video track
            const newVideoTrack = newStream.getVideoTracks()[0];
            this.localStream.removeTrack(videoTrack);
            this.localStream.addTrack(newVideoTrack);

            // Update local video
            document.getElementById('localVideo').srcObject = this.localStream;

            // Update peer connection
            if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(newVideoTrack);
                }
            }
        } catch (error) {
            console.error('Error switching camera:', error);
        }
    }

    endCall() {
        this.playCallEndSound();
        this.stopRingtones();
        this.socket.emit('call:ended', {
            to: this.friendId,
            from: this.userId
        });
        this.cleanupCall();
        
        // Delay showing ended screen to let sound play
        setTimeout(() => {
            this.showCallEndedScreen();
        }, 500);
    }

    handleCallEnded() {
        this.playCallEndSound();
        this.stopRingtones();
        this.cleanupCall();
        
        // Delay showing ended screen to let sound play
        setTimeout(() => {
            this.showCallEndedScreen();
        }, 500);
    }

    handleCallDeclined() {
        this.stopRingtones();
        alert('Call declined');
        window.close();
    }

    cleanupCall() {
        // Stop ringtones
        this.stopRingtones();

        // Stop timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Stop all tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
        }
    }

    showCallEndedScreen() {
        document.getElementById('activeCallScreen').style.display = 'none';
        document.getElementById('callEndedScreen').style.display = 'flex';

        // Show call duration
        if (this.callStartTime) {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            document.getElementById('callDuration').textContent = `Duration: ${minutes}:${seconds}`;
        } else {
            document.getElementById('callDuration').textContent = 'Call not connected';
        }
    }
}

// Initialize call manager when page loads
window.addEventListener('DOMContentLoaded', () => {
    new CallManager();
});
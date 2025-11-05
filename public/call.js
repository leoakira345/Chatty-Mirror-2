// FULLY DEBUGGED WebRTC Call Manager - CONNECTING FIX
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
        this.pendingIceCandidates = [];
        this.isOfferCreated = false;
        this.isAnswerCreated = false;
        this.hasRemoteDescription = false;
        
        // Audio elements
        this.outgoingRingtone = null;
        this.incomingRingtone = null;
        this.callEndSound = null;

        // Better ICE servers configuration
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        this.init();
    }

    init() {
        const params = new URLSearchParams(window.location.search);
        this.userId = params.get('userId');
        this.friendId = params.get('friendId');
        this.friendName = params.get('friendName') || 'User';
        this.isVideoCall = params.get('type') === 'video';

        console.log('📞 Call Manager initialized:', {
            userId: this.userId,
            friendId: this.friendId,
            isVideoCall: this.isVideoCall
        });

        this.initializeAudio();
        this.connectSocket();
        this.setupUI();
    }

    connectSocket() {
        this.socket = io('http://localhost:3000', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
            console.log('✅ Socket connected:', this.socket.id);
            this.socket.emit('user_connected', this.userId);
            
            // Start call flow after connection
            setTimeout(() => this.checkCallType(), 500);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket connection error:', error);
            alert('Failed to connect to server. Please check if server is running.');
        });

        // WebRTC signaling events
        this.socket.on('call:offer', (data) => this.handleOffer(data));
        this.socket.on('call:answer', (data) => this.handleAnswer(data));
        this.socket.on('call:ice-candidate', (data) => this.handleIceCandidate(data));
        this.socket.on('call:accepted', (data) => this.handleCallAccepted(data));
        this.socket.on('call:ended', (data) => this.handleCallEnded(data));
        this.socket.on('call:declined', (data) => this.handleCallDeclined(data));

        this.socket.on('disconnect', () => {
            console.log('⚠️ Socket disconnected');
        });
    }

    initializeAudio() {
        this.outgoingRingtone = new Audio();
        this.outgoingRingtone.loop = true;
        this.outgoingRingtone.src = this.generateOutgoingTone();
        
        const incomingRingtones = [
            this.generateIncomingTone1(),
            this.generateIncomingTone2(),
            this.generateIncomingTone3(),
            this.generateIncomingTone4()
        ];
        
        const randomIndex = Math.floor(Math.random() * incomingRingtones.length);
        this.incomingRingtone = new Audio();
        this.incomingRingtone.loop = true;
        this.incomingRingtone.src = incomingRingtones[randomIndex];

        this.callEndSound = new Audio();
        this.callEndSound.src = this.generateCallEndSound();
    }

    generateOutgoingTone() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 2;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < data.length; i++) {
            const time = i / sampleRate;
            const freq = 440;
            if ((time < 0.4) || (time >= 0.6 && time < 1.0)) {
                data[i] = Math.sin(2 * Math.PI * freq * time) * 0.3;
            } else {
                data[i] = 0;
            }
        }
        return this.bufferToWave(buffer, sampleRate);
    }

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
                const freq1 = 440;
                const freq2 = 480;
                data[i] = (Math.sin(2 * Math.PI * freq1 * time) + 
                          Math.sin(2 * Math.PI * freq2 * time)) * 0.25;
            } else {
                data[i] = 0;
            }
        }
        return this.bufferToWave(buffer, sampleRate);
    }

    generateIncomingTone2() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 3;
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        const frequencies = [523, 587, 659, 698];
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
            const envelope = 1 - progress;
            data[i] = Math.sin(2 * Math.PI * freq * time) * envelope * 0.4;
        }
        return this.bufferToWave(buffer, sampleRate);
    }

    bufferToWave(buffer, sampleRate) {
        const length = buffer.length * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);
        const channels = 1;
        const data = buffer.getChannelData(0);
        
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
        document.getElementById('acceptBtn').addEventListener('click', () => this.acceptCall());
        document.getElementById('declineBtn').addEventListener('click', () => this.declineCall());
        document.getElementById('toggleVideoBtn').addEventListener('click', () => this.toggleVideo());
        document.getElementById('toggleAudioBtn').addEventListener('click', () => this.toggleAudio());
        document.getElementById('switchCameraBtn').addEventListener('click', () => this.switchCamera());
        document.getElementById('endCallBtn').addEventListener('click', () => this.endCall());
        document.getElementById('closeCallBtn').addEventListener('click', () => window.close());

        document.getElementById('callerName').textContent = this.friendName;
        document.getElementById('callerInitial').textContent = this.friendName.charAt(0).toUpperCase();
        document.getElementById('remoteUserName').textContent = this.friendName;
        document.getElementById('remoteUserInitial').textContent = this.friendName.charAt(0).toUpperCase();
    }

    async checkCallType() {
        const type = new URLSearchParams(window.location.search).get('callType');
        
        console.log('🔍 Call type:', type);
        
        if (type === 'outgoing') {
            console.log('📞 Starting as CALLER');
            this.playOutgoingRingtone();
            await this.startOutgoingCall();
        } else {
            console.log('📞 Starting as RECEIVER');
            this.playIncomingRingtone();
            document.getElementById('incomingCallScreen').style.display = 'flex';
            document.getElementById('callType').textContent = this.isVideoCall ? 'Video Call' : 'Voice Call';
        }
    }

    async startOutgoingCall() {
        try {
            console.log('\n' + '='.repeat(50));
            console.log('🔵 STARTING OUTGOING CALL');
            console.log('='.repeat(50));
            
            // Show active call screen
            this.showActiveCallScreen();
            document.getElementById('callStatus').textContent = 'Getting media...';
            
            // Step 1: Get user media
            console.log('1️⃣ Getting user media...');
            await this.getUserMedia();
            console.log('✅ Got media');
            
            document.getElementById('callStatus').textContent = 'Setting up connection...';
            
            // Step 2: Create peer connection
            console.log('2️⃣ Creating peer connection...');
            this.createPeerConnection();
            console.log('✅ Peer connection created');
            
            document.getElementById('callStatus').textContent = 'Creating offer...';
            
            // Step 3: Create offer
            console.log('3️⃣ Creating offer...');
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: this.isVideoCall
            });
            console.log('✅ Offer created');
            
            // Step 4: Set local description
            console.log('4️⃣ Setting local description...');
            await this.peerConnection.setLocalDescription(offer);
            this.isOfferCreated = true;
            console.log('✅ Local description set');
            
            document.getElementById('callStatus').textContent = 'Calling...';
            
            // Step 5: Send offer
            console.log('5️⃣ Sending offer to:', this.friendId);
            this.socket.emit('call:offer', {
                to: this.friendId,
                from: this.userId,
                offer: offer,
                isVideoCall: this.isVideoCall
            });
            console.log('✅ Offer sent');
            console.log('='.repeat(50) + '\n');

        } catch (error) {
            console.error('❌ Error starting call:', error);
            this.stopRingtones();
            alert('Failed to start call: ' + error.message);
            window.close();
        }
    }

    async acceptCall() {
        try {
            console.log('\n' + '='.repeat(50));
            console.log('🟢 ACCEPTING INCOMING CALL');
            console.log('='.repeat(50));
            
            this.stopRingtones();
            
            // Hide incoming screen, show active screen
            document.getElementById('incomingCallScreen').style.display = 'none';
            this.showActiveCallScreen();
            document.getElementById('callStatus').textContent = 'Getting media...';

            // Step 1: Get user media
            console.log('1️⃣ Getting user media...');
            await this.getUserMedia();
            console.log('✅ Got media');
            
            document.getElementById('callStatus').textContent = 'Setting up connection...';
            
            // Step 2: Create peer connection
            console.log('2️⃣ Creating peer connection...');
            this.createPeerConnection();
            console.log('✅ Peer connection created');
            
            document.getElementById('callStatus').textContent = 'Waiting for caller...';
            
            // Step 3: Notify caller that call was accepted
            console.log('3️⃣ Sending call accepted notification');
            this.socket.emit('call:accepted', {
                to: this.friendId,
                from: this.userId
            });
            console.log('✅ Acceptance sent, waiting for offer...');
            console.log('='.repeat(50) + '\n');
            
        } catch (error) {
            console.error('❌ Error accepting call:', error);
            this.stopRingtones();
            alert('Failed to accept call: ' + error.message);
            
            this.socket.emit('call:declined', {
                to: this.friendId,
                from: this.userId,
                reason: 'Failed to accept call'
            });
            
            setTimeout(() => window.close(), 500);
        }
    }

    declineCall() {
        console.log('❌ DECLINING CALL');
        this.stopRingtones();
        
        this.socket.emit('call_rejected', {
            callerId: this.friendId,
            receiverId: this.userId
        });
        
        this.socket.emit('call:declined', {
            to: this.friendId,
            from: this.userId,
            reason: 'Call declined by user'
        });
        
        setTimeout(() => window.close(), 500);
    }

    async getUserMedia() {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: this.isVideoCall ? {
                facingMode: this.currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } : false
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            localVideo.muted = true;
            
            console.log('📹 Local stream tracks:', 
                this.localStream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
            
        } catch (error) {
            console.error('❌ getUserMedia error:', error);
            throw error;
        }
    }

    createPeerConnection() {
        console.log('🔗 Creating RTCPeerConnection with config:', this.iceServers);
        
        this.peerConnection = new RTCPeerConnection(this.iceServers);

        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                const sender = this.peerConnection.addTrack(track, this.localStream);
                console.log('➕ Added local track:', track.kind, track.id);
            });
        }

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('📺 ontrack event - kind:', event.track.kind, 'id:', event.track.id);
            console.log('📺 Streams:', event.streams.length);
            
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
                const remoteVideo = document.getElementById('remoteVideo');
                remoteVideo.srcObject = this.remoteStream;
                remoteVideo.muted = false;
                console.log('✅ Remote video element configured');
            }
            
            this.remoteStream.addTrack(event.track);
            console.log('✅ Added remote track:', event.track.kind);
            
            if (event.track.kind === 'video') {
                document.getElementById('remoteVideoPlaceholder').style.display = 'none';
                console.log('✅ Remote video placeholder hidden');
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 New ICE candidate:', event.candidate.type);
                this.socket.emit('call:ice-candidate', {
                    to: this.friendId,
                    from: this.userId,
                    candidate: event.candidate
                });
            } else {
                console.log('🧊 ICE gathering complete');
            }
        };

        // ICE gathering state
        this.peerConnection.onicegatheringstatechange = () => {
            console.log('🧊 ICE gathering state:', this.peerConnection.iceGatheringState);
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('🔄 Connection state changed to:', state);
            
            if (state === 'connected') {
                console.log('✅✅✅ PEER CONNECTION ESTABLISHED ✅✅✅');
                this.onCallConnected();
            } else if (state === 'disconnected') {
                console.log('⚠️ Connection disconnected');
            } else if (state === 'failed') {
                console.log('❌ Connection failed');
                this.handleCallEnded();
            } else if (state === 'closed') {
                console.log('🔒 Connection closed');
            }
        };

        // Handle ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('❄️ ICE connection state:', state);
            
            if (state === 'checking') {
                console.log('🔍 ICE candidates are being checked...');
            } else if (state === 'connected' || state === 'completed') {
                console.log('✅ ICE connection established');
            } else if (state === 'failed') {
                console.log('❌ ICE connection failed');
                console.log('💡 This might be a firewall/NAT issue. May need TURN server.');
                // Try to restart ICE
                console.log('🔄 Attempting ICE restart...');
                this.peerConnection.restartIce();
            } else if (state === 'disconnected') {
                console.log('⚠️ ICE disconnected');
            }
        };

        // Signaling state
        this.peerConnection.onsignalingstatechange = () => {
            console.log('📡 Signaling state:', this.peerConnection.signalingState);
        };

        console.log('✅ Peer connection fully configured with all event handlers');
    }

    async handleOffer(data) {
        try {
            console.log('\n' + '='.repeat(50));
            console.log('📥 RECEIVED OFFER');
            console.log('='.repeat(50));
            console.log('From:', data.from);
            console.log('Video call:', data.isVideoCall);
            
            if (!this.peerConnection) {
                console.log('⚠️ Peer connection not ready, retrying in 200ms...');
                setTimeout(() => this.handleOffer(data), 200);
                return;
            }

            document.getElementById('callStatus').textContent = 'Processing offer...';

            // Set remote description (the offer)
            console.log('1️⃣ Setting remote description (offer)...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            this.hasRemoteDescription = true;
            console.log('✅ Remote description set');

            // Process pending ICE candidates
            if (this.pendingIceCandidates.length > 0) {
                console.log(`2️⃣ Processing ${this.pendingIceCandidates.length} pending ICE candidates...`);
                for (const candidate of this.pendingIceCandidates) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingIceCandidates = [];
                console.log('✅ Pending candidates added');
            }

            document.getElementById('callStatus').textContent = 'Creating answer...';

            // Create answer
            console.log('3️⃣ Creating answer...');
            const answer = await this.peerConnection.createAnswer();
            console.log('✅ Answer created');

            // Set local description
            console.log('4️⃣ Setting local description (answer)...');
            await this.peerConnection.setLocalDescription(answer);
            this.isAnswerCreated = true;
            console.log('✅ Local description set');

            document.getElementById('callStatus').textContent = 'Connecting...';

            // Send answer
            console.log('5️⃣ Sending answer to:', data.from);
            this.socket.emit('call:answer', {
                to: data.from,
                from: this.userId,
                answer: answer
            });
            console.log('✅ Answer sent');
            console.log('='.repeat(50) + '\n');
            
        } catch (error) {
            console.error('❌ Error handling offer:', error);
            alert('Failed to process call: ' + error.message);
            this.endCall();
        }
    }

    async handleAnswer(data) {
        try {
            console.log('\n' + '='.repeat(50));
            console.log('📥 RECEIVED ANSWER');
            console.log('='.repeat(50));
            console.log('From:', data.from);
            
            this.stopRingtones();
            
            if (!this.peerConnection) {
                console.error('❌ Peer connection not initialized');
                return;
            }

            document.getElementById('callStatus').textContent = 'Processing answer...';

            // Set remote description (the answer)
            console.log('1️⃣ Setting remote description (answer)...');
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            this.hasRemoteDescription = true;
            console.log('✅ Remote description set');

            // Process pending ICE candidates
            if (this.pendingIceCandidates.length > 0) {
                console.log(`2️⃣ Processing ${this.pendingIceCandidates.length} pending ICE candidates...`);
                for (const candidate of this.pendingIceCandidates) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingIceCandidates = [];
                console.log('✅ Pending candidates added');
            }

            document.getElementById('callStatus').textContent = 'Connecting...';
            console.log('⏳ Waiting for ICE to establish connection...');
            console.log('='.repeat(50) + '\n');
            
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    async handleIceCandidate(data) {
        try {
            if (!data.candidate) {
                console.log('🧊 Received empty ICE candidate (end of candidates)');
                return;
            }

            console.log('🧊 Received ICE candidate from:', data.from || 'unknown');
            console.log('   Type:', data.candidate.type || 'unknown');
            console.log('   Protocol:', data.candidate.protocol || 'unknown');

            // Queue if remote description not set
            if (!this.peerConnection || !this.hasRemoteDescription) {
                console.log('📦 Queueing ICE candidate (no remote description yet)');
                this.pendingIceCandidates.push(data.candidate);
                return;
            }

            // Add candidate
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('✅ ICE candidate added successfully');
            
        } catch (error) {
            console.error('❌ Error handling ICE candidate:', error);
            // Don't fail the call for individual candidate errors
        }
    }

    handleCallAccepted(data) {
        console.log('✅ Call accepted by:', data.from);
        this.stopRingtones();
        document.getElementById('callStatus').textContent = 'Connecting...';
    }

    onCallConnected() {
        console.log('\n' + '🎉'.repeat(25));
        console.log('✅ CALL SUCCESSFULLY CONNECTED!');
        console.log('🎉'.repeat(25) + '\n');
        
        this.stopRingtones();
        
        // Update UI
        document.getElementById('callStatus').style.display = 'none';
        document.getElementById('callTimer').style.display = 'block';
        this.callStartTime = Date.now();
        this.startTimer();
        
        // Log stream info
        console.log('📊 Connection Stats:');
        console.log('  Local tracks:', this.localStream?.getTracks().map(t => t.kind));
        console.log('  Remote tracks:', this.remoteStream?.getTracks().map(t => t.kind));
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

                const videoBtn = document.getElementById('toggleVideoBtn');
                document.getElementById('videoOnIcon').style.display = this.isVideoEnabled ? 'block' : 'none';
                document.getElementById('videoOffIcon').style.display = this.isVideoEnabled ? 'none' : 'block';
                
                if (this.isVideoEnabled) {
                    videoBtn.classList.remove('active');
                } else {
                    videoBtn.classList.add('active');
                }
                
                console.log('📹 Video toggled:', this.isVideoEnabled ? 'ON' : 'OFF');
            }
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                this.isAudioEnabled = !this.isAudioEnabled;
                audioTrack.enabled = this.isAudioEnabled;

                const audioBtn = document.getElementById('toggleAudioBtn');
                document.getElementById('audioOnIcon').style.display = this.isAudioEnabled ? 'block' : 'none';
                document.getElementById('audioOffIcon').style.display = this.isAudioEnabled ? 'none' : 'block';
                
                if (this.isAudioEnabled) {
                    audioBtn.classList.remove('active');
                } else {
                    audioBtn.classList.add('active');
                }
                
                console.log('🎤 Audio toggled:', this.isAudioEnabled ? 'ON' : 'OFF');
            }
        }
    }

    async switchCamera() {
        if (!this.isVideoCall || !this.localStream) return;

        try {
            console.log('🔄 Switching camera...');
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.stop();
            }

            this.currentCamera = this.currentCamera === 'user' ? 'environment' : 'user';

            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: this.currentCamera,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            const newVideoTrack = newStream.getVideoTracks()[0];
            this.localStream.removeTrack(videoTrack);
            this.localStream.addTrack(newVideoTrack);

            document.getElementById('localVideo').srcObject = this.localStream;

            if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(newVideoTrack);
                }
            }
            
            console.log('✅ Camera switched to:', this.currentCamera);
        } catch (error) {
            console.error('❌ Error switching camera:', error);
        }
    }

    endCall() {
        console.log('📞 Ending call from this side');
        
        this.playCallEndSound();
        this.stopRingtones();
        
        this.socket.emit('call:ended', {
            to: this.friendId,
            from: this.userId
        });
        
        this.cleanupCall();
        
        setTimeout(() => {
            this.showCallEndedScreen();
        }, 500);
    }

    handleCallEnded(data) {
        console.log('📞 Call ended by:', data?.from || 'remote');
        
        this.playCallEndSound();
        this.stopRingtones();
        this.cleanupCall();
        
        setTimeout(() => {
            this.showCallEndedScreen();
        }, 500);
    }

    handleCallDeclined(data) {
        console.log('❌ Call declined:', data);
        
        this.stopRingtones();
        this.cleanupCall();
        
        const reason = data?.reason || 'Call declined';
        alert(reason);
        
        setTimeout(() => {
            window.close();
        }, 500);
    }

    cleanupCall() {
        console.log('🧹 Cleaning up call resources...');
        
        this.stopRingtones();

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                console.log('⏹️ Stopped track:', track.kind);
            });
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            console.log('🔒 Peer connection closed');
        }
        
        console.log('✅ Cleanup complete');
    }

    showCallEndedScreen() {
        document.getElementById('activeCallScreen').style.display = 'none';
        document.getElementById('callEndedScreen').style.display = 'flex';

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

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Call Manager...');
    new CallManager();
});


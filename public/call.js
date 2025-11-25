// ==========================================
// CONFIGURATION
// ==========================================
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const SOCKET_URL = isDevelopment
    ? 'http://localhost:3000'
    : 'https://chatty-mirror-2.onrender.com';

console.log('🔧 Call Environment:', isDevelopment ? 'Development' : 'Production');
console.log('🔧 Socket URL:', SOCKET_URL);

// ==========================================
// STATE VARIABLES
// ==========================================
let socket = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;

let myUserId = null;
let friendId = null;
let friendName = null;
let callType = null; // 'audio' or 'video'
let isOutgoingCall = false;

let callStartTime = null;
let callDurationInterval = null;

let isMicMuted = false;
let isVideoOff = false;

// ==========================================
// DOM ELEMENTS
// ==========================================
const incomingCallScreen = document.getElementById('incomingCallScreen');
const connectingScreen = document.getElementById('connectingScreen');
const activeCallScreen = document.getElementById('activeCallScreen');
const callEndedScreen = document.getElementById('callEndedScreen');

const incomingCallerAvatar = document.getElementById('incomingCallerAvatar');
const incomingCallerName = document.getElementById('incomingCallerName');
const incomingCallType = document.getElementById('incomingCallType');
const declineIncomingBtn = document.getElementById('declineIncomingBtn');
const acceptIncomingBtn = document.getElementById('acceptIncomingBtn');

const connectingAvatar = document.getElementById('connectingAvatar');
const connectingName = document.getElementById('connectingName');
const connectingStatus = document.getElementById('connectingStatus');
const cancelCallBtn = document.getElementById('cancelCallBtn');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callInfoOverlay = document.getElementById('callInfoOverlay');
const activeCallName = document.getElementById('activeCallName');
const callDuration = document.getElementById('callDuration');
const audioModeAvatar = document.getElementById('audioModeAvatar');
const audioCallName = document.getElementById('audioCallName');
const audioDuration = document.getElementById('audioDuration');

const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const endCallBtn = document.getElementById('endCallBtn');
const toggleSpeakerBtn = document.getElementById('toggleSpeakerBtn');

const callEndedTitle = document.getElementById('callEndedTitle');
const callEndedMessage = document.getElementById('callEndedMessage');
const finalCallDuration = document.getElementById('finalCallDuration');
const closeWindowBtn = document.getElementById('closeWindowBtn');

const ringingSound = document.getElementById('ringingSound');
const callEndedSound = document.getElementById('callEndedSound');

// ==========================================
// WEBRTC CONFIGURATION
// ==========================================
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    parseURLParameters();
    initializeSocket();
    setupEventListeners();
    
    if (isOutgoingCall) {
        showConnectingScreen();
        startOutgoingCall();
    } else {
        // Incoming call - show incoming call screen immediately
        showIncomingCallScreen();
    }
});

function parseURLParameters() {
    const params = new URLSearchParams(window.location.search);
    
    myUserId = params.get('userId');
    friendId = params.get('friendId');
    friendName = params.get('friendName') || 'User';
    callType = params.get('type') || 'audio'; // 'audio' or 'video'
    const callDirection = params.get('callType'); // 'outgoing' or 'incoming'
    
    isOutgoingCall = callDirection === 'outgoing';
    
    console.log('📞 Call Parameters:', {
        myUserId,
        friendId,
        friendName,
        callType,
        isOutgoingCall
    });
    
    if (!myUserId || !friendId) {
        alert('Invalid call parameters');
        window.close();
    }
}

function initializeSocket() {
    console.log('🔌 Connecting to Socket.IO:', SOCKET_URL);
    
    socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('✅ Socket connected:', socket.id);
        socket.emit('user_connected', myUserId);
    });

    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
    });

    // WebRTC Signaling Events
    socket.on('call:offer', handleCallOffer);
    socket.on('call:answer', handleCallAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:declined', handleCallDeclined);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:resend-offer', handleResendOffer);
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    declineIncomingBtn.addEventListener('click', declineIncomingCall);
    acceptIncomingBtn.addEventListener('click', acceptIncomingCall);
    
    cancelCallBtn.addEventListener('click', cancelOutgoingCall);
    
    toggleMicBtn.addEventListener('click', toggleMicrophone);
    toggleVideoBtn.addEventListener('click', toggleVideo);
    endCallBtn.addEventListener('click', endCall);
    toggleSpeakerBtn.addEventListener('click', toggleSpeaker);
    
    closeWindowBtn.addEventListener('click', () => window.close());
    
    // Handle window close
    window.addEventListener('beforeunload', cleanup);
}

// ==========================================
// SCREEN MANAGEMENT
// ==========================================
function showIncomingCallScreen() {
    hideAllScreens();
    incomingCallScreen.classList.add('active');
    
    incomingCallerName.textContent = friendName;
    incomingCallType.textContent = callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Voice Call';
    
    const initial = friendName[0].toUpperCase();
    document.getElementById('incomingCallerInitial').textContent = initial;
    
    playRingingSound();
}

function showConnectingScreen() {
    hideAllScreens();
    connectingScreen.classList.add('active');
    
    connectingName.textContent = friendName;
    connectingStatus.textContent = callType === 'video' ? 'Starting video call...' : 'Calling...';
    
    const initial = friendName[0].toUpperCase();
    document.getElementById('connectingInitial').textContent = initial;
    
    if (isOutgoingCall) {
        playRingingSound();
    }
}

function showActiveCallScreen() {
    hideAllScreens();
    stopRingingSound();
    activeCallScreen.classList.add('active');
    
    activeCallName.textContent = friendName;
    audioCallName.textContent = friendName;
    
    const initial = friendName[0].toUpperCase();
    document.getElementById('audioAvatarInitial').textContent = initial;
    
    // Show/hide video controls based on call type
    if (callType === 'video') {
        toggleVideoBtn.style.display = 'flex';
        audioModeAvatar.style.display = 'none';
        callInfoOverlay.style.display = 'block';
    } else {
        toggleVideoBtn.style.display = 'none';
        audioModeAvatar.style.display = 'block';
        callInfoOverlay.style.display = 'none';
    }
    
    startCallDurationTimer();
}

function showCallEndedScreen(reason = 'The call has ended') {
    hideAllScreens();
    stopRingingSound();
    playCallEndedSound();
    callEndedScreen.classList.add('active');
    
    callEndedMessage.textContent = reason;
    
    if (callStartTime) {
        const duration = Math.floor((Date.now() - callStartTime) / 1000);
        finalCallDuration.textContent = `Duration: ${formatDuration(duration)}`;
    }
    
    stopCallDurationTimer();
    cleanup();
}

function hideAllScreens() {
    incomingCallScreen.classList.remove('active');
    connectingScreen.classList.remove('active');
    activeCallScreen.classList.remove('active');
    callEndedScreen.classList.remove('active');
}

// ==========================================
// OUTGOING CALL
// ==========================================
async function startOutgoingCall() {
    try {
        console.log('📞 Starting outgoing call...');
        
        // Get local media
        await getLocalMedia();
        
        // Create peer connection
        createPeerConnection();
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Create and send offer
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === 'video'
        });
        
        await peerConnection.setLocalDescription(offer);
        
        console.log('📤 Sending call offer to:', friendId);
        
        socket.emit('call:offer', {
            to: friendId,
            from: myUserId,
            offer: offer,
            isVideoCall: callType === 'video'
        });
        
    } catch (error) {
        console.error('❌ Error starting call:', error);
        alert('Failed to start call: ' + error.message);
        window.close();
    }
}

// ==========================================
// INCOMING CALL HANDLERS
// ==========================================
function declineIncomingCall() {
    console.log('❌ Declining incoming call');
    
    socket.emit('call:declined', {
        to: friendId,
        from: myUserId,
        reason: 'Call declined by user'
    });
    
    stopRingingSound();
    showCallEndedScreen('Call declined');
    
    setTimeout(() => window.close(), 2000);
}

async function acceptIncomingCall() {
    try {
        console.log('✅ Accepting incoming call');
        
        stopRingingSound();
        showConnectingScreen();
        connectingStatus.textContent = 'Connecting...';
        
        // Get local media
        await getLocalMedia();
        
        // Create peer connection
        createPeerConnection();
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Notify caller that call was accepted
        socket.emit('call:accepted', {
            to: friendId,
            from: myUserId
        });
        
        console.log('✅ Ready to receive offer');
        
    } catch (error) {
        console.error('❌ Error accepting call:', error);
        alert('Failed to accept call: ' + error.message);
        declineIncomingCall();
    }
}

function cancelOutgoingCall() {
    console.log('❌ Canceling outgoing call');
    
    socket.emit('call:declined', {
        to: friendId,
        from: myUserId,
        reason: 'Call cancelled'
    });
    
    stopRingingSound();
    showCallEndedScreen('Call cancelled');
    
    setTimeout(() => window.close(), 2000);
}

// ==========================================
// WEBRTC PEER CONNECTION
// ==========================================
function createPeerConnection() {
    console.log('🔗 Creating peer connection');
    
    peerConnection = new RTCPeerConnection(iceServers);
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('🧊 Sending ICE candidate');
            socket.emit('call:ice-candidate', {
                to: friendId,
                from: myUserId,
                candidate: event.candidate
            });
        }
    };
    
    // Handle incoming tracks (remote stream)
    peerConnection.ontrack = (event) => {
        console.log('📥 Received remote track:', event.track.kind);
        
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        
        remoteStream.addTrack(event.track);
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            console.log('✅ Peer connection established');
            showActiveCallScreen();
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            console.log('❌ Peer connection lost');
            endCall();
        }
    };
    
    return peerConnection;
}

async function getLocalMedia() {
    try {
        console.log('🎥 Getting local media...');
        
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: callType === 'video' ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } : false
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        localVideo.srcObject = localStream;
        
        console.log('✅ Local media ready');
        
    } catch (error) {
        console.error('❌ Error getting local media:', error);
        throw new Error('Could not access camera/microphone. Please check permissions.');
    }
}

// ==========================================
// WEBRTC SIGNALING HANDLERS
// ==========================================
async function handleCallOffer(data) {
    try {
        console.log('📥 Received call offer from:', data.from);
        
        // If this is an incoming call (no local stream yet), wait for acceptance
        if (!localStream) {
            console.log('⚠️ No local stream yet, user needs to accept first');
            return; // The offer will be handled after user accepts
        }
        
        // Create peer connection if not exists
        if (!peerConnection) {
            createPeerConnection();
            
            // Add local stream
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('📤 Sending answer');
        
        socket.emit('call:answer', {
            to: data.from,
            from: myUserId,
            answer: answer
        });
        
    } catch (error) {
        console.error('❌ Error handling offer:', error);
        endCall();
    }
}

async function handleCallAnswer(data) {
    try {
        console.log('📥 Received call answer from:', data.from);
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        
        console.log('✅ Answer set successfully');
        
    } catch (error) {
        console.error('❌ Error handling answer:', error);
        endCall();
    }
}

async function handleIceCandidate(data) {
    try {
        if (data.candidate && peerConnection) {
            console.log('📥 Adding ICE candidate');
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('❌ Error adding ICE candidate:', error);
    }
}

function handleCallDeclined(data) {
    console.log('❌ Call declined:', data.reason);
    stopRingingSound();
    showCallEndedScreen(data.reason || 'Call declined');
    setTimeout(() => window.close(), 3000);
}

function handleCallEnded(data) {
    console.log('📞 Call ended by remote user');
    showCallEndedScreen('Call ended');
    setTimeout(() => window.close(), 3000);
}

function handleCallAccepted(data) {
    console.log('✅ Call accepted by:', data.from);
    stopRingingSound();
    connectingStatus.textContent = 'Connecting...';
}

async function handleResendOffer(data) {
    try {
        console.log('🔄 Resending offer to:', data.to);
        
        if (!peerConnection) {
            console.error('❌ No peer connection to resend offer');
            return;
        }
        
        // Create and send new offer
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === 'video'
        });
        
        await peerConnection.setLocalDescription(offer);
        
        console.log('📤 Resending call offer to:', friendId);
        
        socket.emit('call:offer', {
            to: friendId,
            from: myUserId,
            offer: offer,
            isVideoCall: callType === 'video'
        });
        
    } catch (error) {
        console.error('❌ Error resending offer:', error);
    }
}

// ==========================================
// CALL CONTROLS
// ==========================================
function toggleMicrophone() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMicMuted = !audioTrack.enabled;
        
        toggleMicBtn.classList.toggle('muted', isMicMuted);
        
        const micOn = toggleMicBtn.querySelector('.mic-on');
        const micOff = toggleMicBtn.querySelector('.mic-off');
        
        if (isMicMuted) {
            micOn.style.display = 'none';
            micOff.style.display = 'block';
        } else {
            micOn.style.display = 'block';
            micOff.style.display = 'none';
        }
        
        console.log(isMicMuted ? '🔇 Microphone muted' : '🎤 Microphone unmuted');
    }
}

function toggleVideo() {
    if (!localStream || callType !== 'video') return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isVideoOff = !videoTrack.enabled;
        
        toggleVideoBtn.classList.toggle('video-off', isVideoOff);
        
        const videoOn = toggleVideoBtn.querySelector('.video-on');
        const videoOff = toggleVideoBtn.querySelector('.video-off');
        
        if (isVideoOff) {
            videoOn.style.display = 'none';
            videoOff.style.display = 'block';
        } else {
            videoOn.style.display = 'block';
            videoOff.style.display = 'none';
        }
        
        console.log(isVideoOff ? '📹 Video disabled' : '📹 Video enabled');
    }
}

function toggleSpeaker() {
    // This is mostly for UI feedback - actual speaker control is browser-dependent
    const speakerOn = toggleSpeakerBtn.querySelector('.speaker-on');
    const speakerOff = toggleSpeakerBtn.querySelector('.speaker-off');
    
    if (speakerOn.style.display === 'none') {
        speakerOn.style.display = 'block';
        speakerOff.style.display = 'none';
        console.log('🔊 Speaker on');
    } else {
        speakerOn.style.display = 'none';
        speakerOff.style.display = 'block';
        console.log('🔇 Speaker off');
    }
}

function endCall() {
    console.log('📞 Ending call');
    
    socket.emit('call:ended', {
        to: friendId,
        from: myUserId
    });
    
    showCallEndedScreen('Call ended');
    
    setTimeout(() => window.close(), 3000);
}

// ==========================================
// CALL DURATION TIMER
// ==========================================
function startCallDurationTimer() {
    callStartTime = Date.now();
    
    callDurationInterval = setInterval(() => {
        const duration = Math.floor((Date.now() - callStartTime) / 1000);
        const formatted = formatDuration(duration);
        
        callDuration.textContent = formatted;
        audioDuration.textContent = formatted;
    }, 1000);
}

function stopCallDurationTimer() {
    if (callDurationInterval) {
        clearInterval(callDurationInterval);
        callDurationInterval = null;
    }
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ==========================================
// SOUND EFFECTS
// ==========================================
function playRingingSound() {
    if (ringingSound) {
        ringingSound.currentTime = 0;
        ringingSound.play().catch(e => console.warn('Could not play ringing sound:', e));
    }
}

function stopRingingSound() {
    if (ringingSound) {
        ringingSound.pause();
        ringingSound.currentTime = 0;
    }
}

function playCallEndedSound() {
    if (callEndedSound) {
        callEndedSound.currentTime = 0;
        callEndedSound.play().catch(e => console.warn('Could not play ended sound:', e));
    }
}

// ==========================================
// CLEANUP
// ==========================================
function cleanup() {
    console.log('🧹 Cleaning up...');
    
    stopRingingSound();
    stopCallDurationTimer();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (socket) {
        socket.disconnect();
    }
}

// ==========================================
// END OF FILE
// ==========================================
console.log('✅ call.js loaded successfully');

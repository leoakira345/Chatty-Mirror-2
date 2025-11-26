// ==========================================
// CALL.JS - WebRTC Video/Voice Call Logic
// ==========================================

// Configuration
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const SOCKET_URL = isDevelopment
    ? 'http://localhost:3000'
    : 'https://chatty-mirror-2.onrender.com';

// ICE Servers (STUN/TURN)
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Global Variables
let socket = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentUser = null;
let friendId = null;
let friendName = null;
let callType = 'audio'; // 'audio' or 'video'
let isIncoming = false;
let isCallActive = false;
let callStartTime = null;
let callDurationInterval = null;

// Audio elements
let ringingSound = null;
let callEndedSound = null;

// DOM Elements
let incomingCallScreen, outgoingCallScreen, activeCallScreen, callEndedScreen;
let localVideo, remoteVideo, remoteVideoPlaceholder;
let muteBtn, videoToggleBtn, endCallBtn, speakerBtn;
let callDurationEl, callStatusEl;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 Call window loaded');
    
    initializeDOM();
    initializeSounds();
    parseURLParameters();
    initializeSocket();
    setupEventListeners();
    
    if (isIncoming) {
        showIncomingCallScreen();
    } else {
        showOutgoingCallScreen();
        initiateCall();
    }
});

function initializeDOM() {
    // Screens
    incomingCallScreen = document.getElementById('incomingCallScreen');
    outgoingCallScreen = document.getElementById('outgoingCallScreen');
    activeCallScreen = document.getElementById('activeCallScreen');
    callEndedScreen = document.getElementById('callEndedScreen');
    
    // Videos
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');
    remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
    
    // Controls
    muteBtn = document.getElementById('muteBtn');
    videoToggleBtn = document.getElementById('videoToggleBtn');
    endCallBtn = document.getElementById('endCallBtn');
    speakerBtn = document.getElementById('speakerBtn');
    
    // Info
    callDurationEl = document.getElementById('callDuration');
    callStatusEl = document.getElementById('callStatus');
    
    console.log('✅ DOM elements initialized');
}

function initializeSounds() {
    ringingSound = document.getElementById('ringingSound');
    callEndedSound = document.getElementById('callEndedSound');
    
    // Set volume
    if (ringingSound) ringingSound.volume = 0.3;
    if (callEndedSound) callEndedSound.volume = 0.5;
    
    console.log('✅ Audio initialized');
}

function parseURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    const storedUser = localStorage.getItem('chatty_mirror_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
    } else {
        alert('User not authenticated. Please login first.');
        window.close();
        return;
    }
    
    friendId = urlParams.get('friendId');
    friendName = decodeURIComponent(urlParams.get('friendName') || 'Friend');
    callType = urlParams.get('type') || 'audio';
    const callTypeParam = urlParams.get('callType');
    isIncoming = callTypeParam === 'incoming';
    
    console.log('📋 Call parameters:', {
        currentUser: currentUser.id,
        friendId,
        friendName,
        callType,
        isIncoming
    });
    
    // Update UI with friend info
    updateUIWithFriendInfo();
}

function updateUIWithFriendInfo() {
    const initial = friendName[0].toUpperCase();
    
    // Incoming screen
    document.getElementById('incomingCallerName').textContent = friendName;
    document.getElementById('incomingCallType').textContent = 
        callType === 'video' ? '📹 Incoming Video Call...' : '📞 Incoming Voice Call...';
    document.getElementById('incomingCallerAvatar').textContent = initial;
    
    // Outgoing screen
    document.getElementById('outgoingCallerName').textContent = friendName;
    document.getElementById('outgoingCallType').textContent = 
        callType === 'video' ? '📹 Calling...' : '📞 Calling...';
    document.getElementById('outgoingCallerAvatar').textContent = initial;
    
    // Active screen
    document.getElementById('activeCallerName').textContent = friendName;
    document.getElementById('remotePlaceholderName').textContent = friendName;
    document.getElementById('remotePlaceholderAvatar').textContent = initial;
    
    // Show/hide video button based on call type
    if (callType === 'video') {
        videoToggleBtn.style.display = 'flex';
    }
}

// ==========================================
// SOCKET.IO CONNECTION
// ==========================================
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
        socket.emit('user_connected', currentUser.id);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
    });
    
    // WebRTC Signaling Events
    socket.on('call:offer', handleRemoteOffer);
    socket.on('call:answer', handleRemoteAnswer);
    socket.on('call:ice-candidate', handleRemoteIceCandidate);
    socket.on('call:declined', handleCallDeclined);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:accepted', handleCallAccepted);
    
    console.log('✅ Socket event listeners registered');
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Incoming call buttons
    document.getElementById('acceptIncomingBtn').addEventListener('click', acceptIncomingCall);
    document.getElementById('declineIncomingBtn').addEventListener('click', declineIncomingCall);
    
    // Outgoing call button
    document.getElementById('cancelOutgoingBtn').addEventListener('click', cancelOutgoingCall);
    
    // Active call controls
    muteBtn.addEventListener('click', toggleMute);
    videoToggleBtn.addEventListener('click', toggleVideo);
    endCallBtn.addEventListener('click', endCall);
    speakerBtn.addEventListener('click', toggleSpeaker);
    
    // Call ended button
    document.getElementById('closeCallWindowBtn').addEventListener('click', () => {
        window.close();
    });
    
    // Window close/unload
    window.addEventListener('beforeunload', cleanup);
    
    console.log('✅ Event listeners attached');
}

// ==========================================
// SCREEN TRANSITIONS
// ==========================================
function showIncomingCallScreen() {
    hideAllScreens();
    incomingCallScreen.style.display = 'flex';
    playRingingSound();
    console.log('📱 Showing incoming call screen');
}

function showOutgoingCallScreen() {
    hideAllScreens();
    outgoingCallScreen.style.display = 'flex';
    playRingingSound();
    console.log('📱 Showing outgoing call screen');
}

function showActiveCallScreen() {
    hideAllScreens();
    activeCallScreen.style.display = 'flex';
    stopRingingSound();
    startCallDuration();
    console.log('📱 Showing active call screen');
}

function showCallEndedScreen(reason = '') {
    hideAllScreens();
    callEndedScreen.style.display = 'flex';
    stopRingingSound();
    playCallEndedSound();
    stopCallDuration();
    
    if (callStartTime) {
        const duration = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        document.getElementById('callEndedDuration').textContent = 
            `Duration: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    if (reason) {
        document.getElementById('callEndedReason').textContent = reason;
    }
    
    console.log('📱 Showing call ended screen');
}

function hideAllScreens() {
    incomingCallScreen.style.display = 'none';
    outgoingCallScreen.style.display = 'none';
    activeCallScreen.style.display = 'none';
    callEndedScreen.style.display = 'none';
}

// ==========================================
// SOUND EFFECTS
// ==========================================
function playRingingSound() {
    if (ringingSound) {
        ringingSound.play().catch(err => {
            console.warn('Could not play ringing sound:', err);
        });
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
        callEndedSound.play().catch(err => {
            console.warn('Could not play call ended sound:', err);
        });
    }
}

// ==========================================
// CALL DURATION TIMER
// ==========================================
function startCallDuration() {
    callStartTime = Date.now();
    callDurationInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        callDurationEl.textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function stopCallDuration() {
    if (callDurationInterval) {
        clearInterval(callDurationInterval);
        callDurationInterval = null;
    }
}

// ==========================================
// WEBRTC - GET LOCAL MEDIA
// ==========================================
async function getLocalMedia() {
    try {
        console.log('🎥 Getting local media...', callType);
        
        const constraints = {
            audio: true,
            video: callType === 'video' ? { width: 1280, height: 720 } : false
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        
        console.log('✅ Local media acquired');
        return true;
    } catch (error) {
        console.error('❌ Error getting local media:', error);
        alert('Could not access camera/microphone: ' + error.message);
        return false;
    }
}

// ==========================================
// WEBRTC - PEER CONNECTION
// ==========================================
async function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(ICE_SERVERS);
        
        // Add local stream tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('📡 Received remote track:', event.track.kind);
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
            
            // Hide placeholder when video starts
            if (event.track.kind === 'video') {
                remoteVideoPlaceholder.style.display = 'none';
                remoteVideo.style.display = 'block';
            }
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 Sending ICE candidate');
                socket.emit('call:ice-candidate', {
                    to: friendId,
                    from: currentUser.id,
                    candidate: event.candidate
                });
            }
        };
        
        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', peerConnection.connectionState);
            updateCallStatus(peerConnection.connectionState);
            
            if (peerConnection.connectionState === 'connected') {
                callStatusEl.textContent = 'Connected';
                isCallActive = true;
            } else if (peerConnection.connectionState === 'disconnected' || 
                       peerConnection.connectionState === 'failed') {
                endCall();
            }
        };
        
        console.log('✅ Peer connection created');
        return true;
    } catch (error) {
        console.error('❌ Error creating peer connection:', error);
        return false;
    }
}

function updateCallStatus(state) {
    const statusMap = {
        'new': 'Initializing...',
        'connecting': 'Connecting...',
        'connected': 'Connected',
        'disconnected': 'Disconnected',
        'failed': 'Connection Failed',
        'closed': 'Call Ended'
    };
    callStatusEl.textContent = statusMap[state] || state;
}

// ==========================================
// OUTGOING CALL - INITIATE
// ==========================================
async function initiateCall() {
    console.log('📞 Initiating outgoing call...');
    
    const mediaOk = await getLocalMedia();
    if (!mediaOk) {
        showCallEndedScreen('Failed to access camera/microphone');
        return;
    }
    
    const peerOk = await createPeerConnection();
    if (!peerOk) {
        showCallEndedScreen('Failed to establish connection');
        return;
    }
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log('📤 Sending call offer to', friendId);
        socket.emit('call:offer', {
            to: friendId,
            from: currentUser.id,
            offer: offer,
            isVideoCall: callType === 'video'
        });
    } catch (error) {
        console.error('❌ Error creating offer:', error);
        showCallEndedScreen('Failed to initiate call');
    }
}

// ==========================================
// INCOMING CALL - ACCEPT
// ==========================================
async function acceptIncomingCall() {
    console.log('✅ Accepting incoming call');
    stopRingingSound();
    
    const mediaOk = await getLocalMedia();
    if (!mediaOk) {
        declineIncomingCall();
        return;
    }
    
    const peerOk = await createPeerConnection();
    if (!peerOk) {
        declineIncomingCall();
        return;
    }
    
    showActiveCallScreen();
    
    // Notify caller that we accepted
    socket.emit('call:accepted', {
        to: friendId,
        from: currentUser.id
    });
}

// ==========================================
// INCOMING CALL - DECLINE
// ==========================================
function declineIncomingCall() {
    console.log('❌ Declining incoming call');
    stopRingingSound();
    
    socket.emit('call_rejected', {
        callerId: friendId,
        receiverId: currentUser.id
    });
    
    showCallEndedScreen('Call Declined');
    
    setTimeout(() => {
        window.close();
    }, 2000);
}

// ==========================================
// OUTGOING CALL - CANCEL
// ==========================================
function cancelOutgoingCall() {
    console.log('❌ Cancelling outgoing call');
    stopRingingSound();
    
    socket.emit('call:declined', {
        to: friendId,
        from: currentUser.id,
        reason: 'Call cancelled by caller'
    });
    
    cleanup();
    showCallEndedScreen('Call Cancelled');
    
    setTimeout(() => {
        window.close();
    }, 2000);
}

// ==========================================
// END ACTIVE CALL
// ==========================================
function endCall() {
    console.log('📞 Ending call');
    
    if (socket && socket.connected) {
        socket.emit('call:ended', {
            to: friendId,
            from: currentUser.id
        });
    }
    
    cleanup();
    showCallEndedScreen('Call Ended');
    
    setTimeout(() => {
        window.close();
    }, 3000);
}

// ==========================================
// WEBRTC SIGNALING HANDLERS
// ==========================================
async function handleRemoteOffer(data) {
    console.log('📥 Received call offer from', data.from);
    
    if (!peerConnection) {
        await createPeerConnection();
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('📤 Sending answer');
        socket.emit('call:answer', {
            to: data.from,
            from: currentUser.id,
            answer: answer
        });
        
        if (isIncoming) {
            // Answer sent after accepting
        }
    } catch (error) {
        console.error('❌ Error handling offer:', error);
        endCall();
    }
}

async function handleRemoteAnswer(data) {
    console.log('📥 Received answer from', data.from);
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        showActiveCallScreen();
    } catch (error) {
        console.error('❌ Error handling answer:', error);
        endCall();
    }
}

async function handleRemoteIceCandidate(data) {
    console.log('📥 Received ICE candidate');
    
    try {
        if (peerConnection && data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('❌ Error adding ICE candidate:', error);
    }
}

function handleCallDeclined(data) {
    console.log('❌ Call declined:', data.reason);
    stopRingingSound();
    cleanup();
    showCallEndedScreen(data.reason || 'Call Declined');
    
    setTimeout(() => {
        window.close();
    }, 2000);
}

function handleCallEnded(data) {
    console.log('📞 Call ended by remote peer');
    cleanup();
    showCallEndedScreen('Call Ended');
    
    setTimeout(() => {
        window.close();
    }, 3000);
}

async function handleCallAccepted(data) {
    console.log('✅ Call accepted by', data.from);
    stopRingingSound();
    
    // Re-create and send offer after acceptance
    if (peerConnection) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            socket.emit('call:offer', {
                to: friendId,
                from: currentUser.id,
                offer: offer,
                isVideoCall: callType === 'video'
            });
        } catch (error) {
            console.error('❌ Error re-sending offer:', error);
        }
    }
}

// ==========================================
// CALL CONTROLS
// ==========================================
function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        muteBtn.classList.toggle('active');
        
        const iconMute = muteBtn.querySelector('.icon-mute');
        const iconUnmute = muteBtn.querySelector('.icon-unmute');
        
        if (audioTrack.enabled) {
            iconMute.style.display = 'block';
            iconUnmute.style.display = 'none';
            muteBtn.querySelector('.control-label').textContent = 'Mute';
        } else {
            iconMute.style.display = 'none';
            iconUnmute.style.display = 'block';
            muteBtn.querySelector('.control-label').textContent = 'Unmute';
        }
        
        console.log('🎤 Microphone', audioTrack.enabled ? 'unmuted' : 'muted');
    }
}

function toggleVideo() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoToggleBtn.classList.toggle('active');
        
        const iconOn = videoToggleBtn.querySelector('.icon-video-on');
        const iconOff = videoToggleBtn.querySelector('.icon-video-off');
        
        if (videoTrack.enabled) {
            iconOn.style.display = 'block';
            iconOff.style.display = 'none';
            videoToggleBtn.querySelector('.control-label').textContent = 'Video';
            localVideo.style.display = 'block';
        } else {
            iconOn.style.display = 'none';
            iconOff.style.display = 'block';
            videoToggleBtn.querySelector('.control-label').textContent = 'Video Off';
            localVideo.style.display = 'none';
        }
        
        console.log('📹 Video', videoTrack.enabled ? 'enabled' : 'disabled');
    }
}

function toggleSpeaker() {
    // Note: Speaker control is limited in web browsers
    // This is more of a visual indicator
    speakerBtn.classList.toggle('active');
    
    const iconOn = speakerBtn.querySelector('.icon-speaker-on');
    const iconOff = speakerBtn.querySelector('.icon-speaker-off');
    
    if (speakerBtn.classList.contains('active')) {
        iconOn.style.display = 'none';
        iconOff.style.display = 'block';
        remoteVideo.muted = true;
    } else {
        iconOn.style.display = 'block';
        iconOff.style.display = 'none';
        remoteVideo.muted = false;
    }
    
    console.log('🔊 Speaker toggled');
}

// ==========================================
// CLEANUP
// ==========================================
function cleanup() {
    console.log('🧹 Cleaning up...');
    
    stopRingingSound();
    stopCallDuration();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    isCallActive = false;
    
    console.log('✅ Cleanup complete');
}

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
window.addEventListener('error', (event) => {
    console.error('❌ Global error:', event.error);
});

console.log('✅ call.js loaded successfully');

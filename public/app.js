// public/app.js
// ==========================================
// ADD THIS AT THE VERY BEGINNING OF app.js
// BEFORE ANY OTHER CODE
// ==========================================

// Check if user is authenticated
function checkAuthentication() {
    const storedUser = localStorage.getItem('chatty_mirror_user');
    
    // If no user is stored, redirect to auth page
    if (!storedUser) {
        console.log('❌ No authenticated user found, redirecting to login...');
        window.location.href = 'auth.html';
        return false;
    }
    
    try {
        const user = JSON.parse(storedUser);
        
        // Check if user object has required fields
        if (!user.id || !user.username) {
            console.log('❌ Invalid user data, redirecting to login...');
            localStorage.removeItem('chatty_mirror_user');
            window.location.href = 'auth.html';
            return false;
        }
        
        console.log('✅ User authenticated:', user.id);
        return true;
        
    } catch (error) {
        console.error('❌ Error parsing user data:', error);
        localStorage.removeItem('chatty_mirror_user');
        window.location.href = 'auth.html';
        return false;
    }
}

// Run authentication check immediately
if (!checkAuthentication()) {
    // Stop script execution if not authenticated
    throw new Error('Authentication required');
}

// ==========================================
// REST OF YOUR EXISTING app.js CODE CONTINUES BELOW
// ==========================================

// ==========================================
// CAPACITOR PLATFORM DETECTION - UPDATED
// ==========================================
const isNativeApp = typeof window.Capacitor !== 'undefined';
const platform = isNativeApp && window.Capacitor ? window.Capacitor.getPlatform() : 'web';
const isAndroid = platform === 'android';

console.log('🔍 Platform:', platform, '| Native:', isNativeApp, '| Android:', isAndroid);


// HTML Entity Decoder
function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}


// ==========================================
// CONFIGURATION - AUTO-DETECT ENVIRONMENT
// ==========================================
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '';

// ✅ FIX: Use local server for development
const API_URL = isDevelopment 
    ? 'http://localhost:3000/api'  // ✅ Local server
    : 'https://chatty-mirror-2.onrender.com/api';  // Production server

const SOCKET_URL = isDevelopment
    ? 'http://localhost:3000'  // ✅ Local server
    : 'https://chatty-mirror-2.onrender.com';  // Production server

console.log('🔧 Environment:', isDevelopment ? 'Development (Local)' : 'Production');
console.log('🔧 API URL:', API_URL);
console.log('🔧 Socket URL:', SOCKET_URL);

// ==========================================
// DARK MODE THEME MANAGER - ADD THIS ENTIRE SECTION
// ==========================================
class ThemeManager {
    constructor() {
        this.theme = this.getStoredTheme() || this.getSystemTheme();
        this.init();
    }

    init() {
        this.applyTheme(this.theme);
        this.createToggleButton();
        this.watchSystemTheme();
        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 100);
    }

    createToggleButton() {
        const headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'theme-toggle';
        toggleBtn.setAttribute('aria-label', 'Toggle theme');
        toggleBtn.innerHTML = `
            <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
        `;

        const settingsBtn = headerActions.querySelector('.settings-btn');
        if (settingsBtn) {
            headerActions.insertBefore(toggleBtn, settingsBtn);
        } else {
            headerActions.appendChild(toggleBtn);
        }

        toggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    getStoredTheme() {
        return localStorage.getItem('theme');
    }

    setStoredTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.theme = theme;
        this.updateMetaThemeColor(theme);
    }

    updateMetaThemeColor(theme) {
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.setAttribute('name', 'theme-color');
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#1e293b' : '#2563eb');
    }

    toggleTheme() {
        const newTheme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        this.setStoredTheme(newTheme);
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
    }

    watchSystemTheme() {
        if (!window.matchMedia) return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', (e) => {
                if (!this.getStoredTheme()) {
                    this.applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    getCurrentTheme() {
        return this.theme;
    }

    setTheme(theme) {
        if (theme === 'dark' || theme === 'light') {
            this.applyTheme(theme);
            this.setStoredTheme(theme);
        }
    }
}

let themeManager;

// Helper functions
function isDarkMode() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

function onThemeChange(callback) {
    window.addEventListener('themechange', (e) => {
        callback(e.detail.theme);
    });
}

// ==========================================
// SOCKET.IO
// ==========================================
let socket = null;

// ==========================================
// STATE
// ==========================================
let currentUser = null;
let friends = [];
let selectedFriend = null;
let messages = [];
let typingTimeout = null;

// REPLY MESSAGE STATE
// ==========================================
let replyingTo = null; // Stores the message being replied to

// ==========================================
// KARAOKE STATE - UPDATED
// ==========================================
let youtubePlayer = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let micStream = null;
let desktopStream = null;
let recordingStartTime = null;
let recordingInterval = null;
let selectedVideoId = null;
let audioContext = null;
let mediaStreamDestination = null;
let nativeRecordingActive = false; // NEW: Track native recording

// ==========================================
// YOUTUBE API LOADER - IMPROVED
// ==========================================
let youtubeAPIReady = false;
let youtubeAPILoadAttempts = 0;

function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
        youtubeAPIReady = true;
        console.log('✅ YouTube API already loaded');
        return;
    }

    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        console.log('⏳ YouTube API script already added, waiting...');
        return;
    }

    console.log('📺 Loading YouTube IFrame API...');
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
        console.error('❌ Failed to load YouTube API');
        if (youtubeAPILoadAttempts < 3) {
            youtubeAPILoadAttempts++;
            console.log(`🔄 Retrying... (${youtubeAPILoadAttempts}/3)`);
            setTimeout(loadYouTubeAPI, 2000);
        }
    };
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
    youtubeAPIReady = true;
    console.log('✅ YouTube IFrame API Ready!');
    
    const searchBtn = document.getElementById('youtubeSearchBtn');
    if (searchBtn) {
        searchBtn.disabled = false;
    }
};

// ==========================================
// EMOJIS
// ==========================================
const emojis = ['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '✨', '🎉', '💯', '😊', '🙌', '💪', '🌟'];


// ==========================================
// SOUND EFFECTS - WhatsApp Style
// ==========================================
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;
        this.volume = 0.5; // 50% volume
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // Generate WhatsApp-style "pop" sound for sent messages
    playSentSound() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 600;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }

    // Generate WhatsApp-style notification sound for received messages
    playReceivedSound() {
        if (!this.enabled || !this.audioContext) return;

        const times = [0, 0.1];
        const frequencies = [800, 600];

        times.forEach((time, index) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = frequencies[index];
            oscillator.type = 'sine';

            const startTime = this.audioContext.currentTime + time;
            gainNode.gain.setValueAtTime(this.volume * 0.4, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.15);
        });
    }

    // Generate subtle typing sound
    playTypingSound() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 300 + Math.random() * 100;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(this.volume * 0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.05);
    }

    // Enable/disable sounds
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    // Set volume (0.0 to 1.0)
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
}

// Initialize sound manager
let soundManager;
// ==========================================
// DOM ELEMENTS
// ==========================================
const loadingOverlay = document.getElementById('loadingOverlay');
const currentUserIdEl = document.getElementById('currentUserId');
const connectionStatus = document.getElementById('connectionStatus');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const friendsList = document.getElementById('friendsList');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResult = document.getElementById('searchResult');
const noChatSelected = document.getElementById('noChatSelected');
const chatContainer = document.getElementById('chatContainer');
const chatAvatar = document.getElementById('chatAvatar');
const chatFriendName = document.getElementById('chatFriendName');
const chatFriendId = document.getElementById('chatFriendId');
const onlineIndicator = document.getElementById('onlineIndicator');
const typingIndicator = document.getElementById('typingIndicator');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileBtn = document.getElementById('fileBtn');
const fileInput = document.getElementById('fileInput');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');

const settingsModal = document.getElementById('settingsModal');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const editProfileBtn = document.getElementById('editProfileBtn');

const editProfileModal = document.getElementById('editProfileModal');
const editProfileOverlay = document.getElementById('editProfileOverlay');
const closeEditProfileBtn = document.getElementById('closeEditProfileBtn');
const backToSettingsBtn = document.getElementById('backToSettingsBtn');
const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
const profilePhotoInput = document.getElementById('profilePhotoInput');
const profilePhotoImg = document.getElementById('profilePhotoImg');
const profilePhotoInitial = document.getElementById('profilePhotoInitial');
const usernameInput = document.getElementById('usernameInput');
const saveProfileBtn = document.getElementById('saveProfileBtn');

const karaokeBtn = document.getElementById('karaokeBtn');
const karaokeModal = document.getElementById('karaokeModal');
const karaokeOverlay = document.getElementById('karaokeOverlay');
const closeKaraokeBtn = document.getElementById('closeKaraokeBtn');
const youtubeSearchInput = document.getElementById('youtubeSearchInput');
const youtubeSearchBtn = document.getElementById('youtubeSearchBtn');
const youtubeResults = document.getElementById('youtubeResults');
const karaokePlayerSection = document.getElementById('karaokePlayerSection');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTimer = document.getElementById('recordingTimer');
const recordedAudioPreview = document.getElementById('recordedAudioPreview');
const recordedAudio = document.getElementById('recordedAudio');
const sendRecordingBtn = document.getElementById('sendRecordingBtn');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNumber = document.getElementById('countdownNumber');

// ==========================================
// INITIALIZE
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize dark mode FIRST
    document.body.classList.add('preload');
    themeManager = new ThemeManager();
    soundManager = new SoundManager(); // ← ADD THIS LINE
    loadYouTubeAPI();
    await initializeApp();
    setupEventListeners();
    initializeEmojiPicker();
    initializeSocket();
    setupMobileMenu();
    setupSettingsModal();
    setupImageModal();
    setupKaraokeModal();
    setupPaintModal(); // Add this line
    setupLogoutButton();
    setupCallButtons(); // ✅ ADD CALL FUNCTIONALITY
});

async function initializeApp() {
    try {
        const storedUser = localStorage.getItem('chatty_mirror_user');

        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            console.log('Loaded existing user:', currentUser.id);
            currentUserIdEl.textContent = currentUser.id;

            try {
                const verifyResponse = await fetch(`${API_URL}/user/${currentUser.id}`);
                const verifyData = await verifyResponse.json();

                if (verifyData.success && verifyData.user) {
                    currentUser = verifyData.user;
                    localStorage.setItem('chatty_mirror_user', JSON.stringify(currentUser));
                    console.log('User verified and synced:', currentUser.id);
                } else {
                    console.log('User not found on server, keeping local user');
                }
            } catch (verifyError) {
                console.error('Error verifying user:', verifyError);
                console.log('Keeping local user due to verification error');
            }
        } else {
            await createNewUser();
        }

        await loadFriends();
        loadUserProfile();
    } catch (error) {
        console.error('Error initializing app:', error);
        showConnectionError();
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function createNewUser() {
    const response = await fetch(`${API_URL}/user/init`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    if (data.success) {
        currentUser = data.user;
        localStorage.setItem('chatty_mirror_user', JSON.stringify(currentUser));
        console.log('Created new user:', currentUser.id);
        currentUserIdEl.textContent = currentUser.id;
    } else {
        throw new Error('Failed to initialize user');
    }
}

function showConnectionError() {
    const errorMessage = `
        <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <svg style="width: 64px; height: 64px; margin: 0 auto 1rem;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3>Connection Failed</h3>
            <p>Unable to connect to the server.</p>
            <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Retry</button>
        </div>
    `;
    document.body.innerHTML = errorMessage;
}

function initializeSocket() {
    console.log('Initializing Socket.IO connection to:', SOCKET_URL);
    
    socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling'],
        upgrade: true,
        timeout: 20000
    });

    socket.on('connect', () => {
        console.log('✅ Socket connected:', socket.id);
        connectionStatus.style.color = '#10b981';
        connectionStatus.title = 'Connected';

        if (currentUser) {
            console.log('Emitting user_connected for:', currentUser.id);
            socket.emit('user_connected', currentUser.id);
            
            setTimeout(() => checkServerStatus(), 1000);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('❌ Socket disconnected:', reason);
        connectionStatus.style.color = '#ef4444';
        connectionStatus.title = 'Disconnected';
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Reconnected after', attemptNumber, 'attempts');
        if (currentUser) {
            socket.emit('user_connected', currentUser.id);
        }
        loadFriends();
        if (selectedFriend) loadMessages();
    });

    socket.on('new_message', (message) => {
    console.log('📨 New message received:', {
        id: message.id,
        type: message.type,
        from: message.senderId,
        to: message.receiverId,
        contentLength: message.content?.length
    });

    // Play received sound if message is from someone else
    if (message.senderId !== currentUser.id && soundManager) {
        soundManager.playReceivedSound(); // ← ADD THIS LINE
    }

    const isRelevant = selectedFriend && (
            (message.senderId === selectedFriend.id && message.receiverId === currentUser.id) ||
            (message.senderId === currentUser.id && message.receiverId === selectedFriend.id)
        );

        if (isRelevant) {
            const exists = messages.some(m => 
                m.id === message.id ||
                (m.timestamp === message.timestamp && m.senderId === message.senderId && m.content === message.content)
            );

            if (!exists) {
                messages.push(message);
                renderMessages();
                scrollToBottom();
                
                if (message.senderId === selectedFriend.id) {
                    markMessageAsSeen(message.id);
                }
            }
        }

        loadFriends();

        if (message.senderId !== currentUser.id) {
            showNotification(message);
        }
    });

    socket.on('message_sent', (data) => {
        console.log('📤 Message sent response:', data);
        
        if (data.success) {
            console.log('✅ Message sent successfully:', data.message.id);
            
            const tempIndex = messages.findIndex(m => m.id.startsWith('temp_'));
            if (tempIndex !== -1) {
                messages[tempIndex] = data.message;
                renderMessages();
            }
        } else {
            console.error('❌ Send failed:', data.error);
            alert('Failed to send message: ' + (data.error || 'Unknown error'));
            if (messages.length > 0 && messages[messages.length - 1].id.startsWith('temp_')) {
                messages.pop();
                renderMessages();
            }
        }
    });

    socket.on('friend_added', async (data) => {
        console.log('👥 Friend added:', data);
        await loadFriends();
    });

    socket.on('user_status', (data) => {
        const friend = friends.find(f => f.id === data.userId);
        if (friend) {
            friend.isOnline = data.status === 'online';
            renderFriends();
            if (selectedFriend && selectedFriend.id === data.userId) {
                updateOnlineStatus(data.status === 'online');
            }
        }
    });

    socket.on('user_typing', (data) => {
        if (selectedFriend && data.userId === selectedFriend.id) {
            typingIndicator.style.display = 'block';
        }
    });

    socket.on('user_stop_typing', (data) => {
        if (selectedFriend && data.userId === selectedFriend.id) {
            typingIndicator.style.display = 'none';
        }
    });

    socket.on('message_seen', (data) => {
        console.log('👁️ Message seen:', data.messageId);
        
        const message = messages.find(m => m.id === data.messageId);
        if (message) {
            message.status = 'seen';
            renderMessages();
        }
    });

    socket.on('message_deleted', (data) => {
        console.log('🗑️ Message deleted:', data.messageId);
        
        const index = messages.findIndex(m => m.id === data.messageId);
        if (index !== -1) {
            messages.splice(index, 1);
            renderMessages();
            console.log('✅ Message removed from UI');
        }
    });

    // ==========================================
    // INCOMING CALL HANDLER - NEW
    // ==========================================
    socket.on('incoming_call', (data) => {
    console.log('📞 Incoming call from:', data.callerId, 'Type:', data.callType);
    
    const caller = friends.find(f => f.id === data.callerId);
    const callerName = caller ? caller.username : (data.callerName || 'Someone');
    
    const callType = data.callType === 'video' ? '📹 Video' : '📞 Voice';
    
    // Show browser confirmation dialog
    const answer = confirm(`${callType} Call from ${callerName}\n\nAnswer call?`);
    
    if (answer) {
        console.log('✅ User accepted the call');
        
        // Open call window for incoming call
        const callWindow = window.open(
            `call.html?userId=${currentUser.id}&friendId=${data.callerId}&friendName=${encodeURIComponent(callerName)}&type=${data.callType}&callType=incoming`,
            'CallWindow',
            'width=800,height=600,resizable=yes,scrollbars=yes'
        );
        
        if (!callWindow) {
            alert('Failed to open call window. Please allow pop-ups.');
            socket.emit('call_rejected', {
                callerId: data.callerId,
                receiverId: currentUser.id
            });
        }
    } else {
        console.log('❌ User declined the call');
        
        // Notify caller that call was rejected
        socket.emit('call_rejected', {
            callerId: data.callerId,
            receiverId: currentUser.id
        });
    }
});

// Add handler for when call fails to connect
socket.on('call_failed', (data) => {
    console.log('❌ Call failed:', data.reason);
    alert(`Call failed: ${data.reason}`);
});

    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error.message);
        connectionStatus.style.color = '#ef4444';
        connectionStatus.title = 'Connection Error';
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
}

async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        console.log('📊 Server Status:', {
            active: data.activeUsers,
            users: data.activeUsersList
        });
    } catch (error) {
        console.error('Failed to check server status');
    }
}

// ==========================================
// DELETE MESSAGE FUNCTION
// ==========================================
function deleteMessage(messageId) {
    const message = messages.find(m => m.id === messageId);
    
    if (!message) {
        alert('Message not found');
        return;
    }
    
    if (message.senderId !== currentUser.id) {
        alert('You can only delete your own messages');
        return;
    }
    
    if (!confirm('Delete this message? This cannot be undone.')) {
        return;
    }
    
    console.log('🗑️ Deleting message:', messageId);
    
    if (!socket || !socket.connected) {
        alert('Not connected to server');
        return;
    }
    
    socket.emit('delete_message', {
        messageId: messageId,
        userId: currentUser.id,
        receiverId: selectedFriend.id
    });
    
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
        messages.splice(index, 1);
        renderMessages();
    }
}

function markMessageAsSeen(messageId) {
    if (!socket || !socket.connected) return;
    
    socket.emit('mark_seen', {
        messageId: messageId,
        userId: currentUser.id
    });
}

function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        if (!selectedFriend || message.senderId !== selectedFriend.id || !document.hasFocus()) {
            const friend = friends.find(f => f.id === message.senderId);
            const friendName = friend ? friend.username : 'Someone';
            
            let body = 'You have a new message';
            if (message.type === 'text') {
                body = message.content.substring(0, 50);
            } else if (message.type === 'image') {
                body = '📷 Sent an image';
            } else if (message.type === 'video') {
                body = '🎥 Sent a video';
            } else if (message.type === 'file') {
                body = '📎 Sent a file';
            } else if (message.type === 'audio') {
                body = '🎤 Sent a voice message';
            }

            new Notification(`${friendName} - Chatty Mirror`, {
                body: body,
                icon: '/favicon.ico'
            });
        }
    }
}

function setupEventListeners() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    searchBtn.addEventListener('click', searchUser);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchUser();
    });
    searchInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        if (!selectedFriend || !socket || !socket.connected) return;

        // Play typing sound
        if (soundManager) {
            soundManager.playTypingSound(); // ← ADD THIS LINE
        }

        socket.emit('typing', {
            senderId: currentUser.id,
            receiverId: selectedFriend.id
        });

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop_typing', {
                senderId: currentUser.id,
                receiverId: selectedFriend.id
            });
        }, 1000);
    });

    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'flex' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.style.display = 'none';
        }
    });

    window.addEventListener('focus', () => {
        if (selectedFriend) {
            markAllMessagesAsSeen();
        }
    });
}

function markAllMessagesAsSeen() {
    if (!selectedFriend || !socket || !socket.connected) return;
    
    const unseenMessages = messages.filter(m => 
        m.senderId === selectedFriend.id && 
        m.receiverId === currentUser.id &&
        m.status !== 'seen'
    );
    
    unseenMessages.forEach(msg => {
        markMessageAsSeen(msg.id);
    });
}

function switchTab(tabName) {
    tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

async function loadFriends() {
    try {
        const response = await fetch(`${API_URL}/friends/${currentUser.id}`);
        const data = await response.json();

        if (data.success) {
            friends = data.friends;
            console.log('Friends loaded:', friends);
            renderFriends();
        }
    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

function renderFriends() {
    if (friends.length === 0) {
        friendsList.innerHTML = `
            <div class="empty-state">
                <svg class="icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <p>No friends yet</p>
                <p class="text-small">Add friends to start chatting!</p>
            </div>
        `;
        return;
    }

    friendsList.innerHTML = friends.map(friend => {
        let avatarContent;
        if (friend.profilePhoto) {
            avatarContent = `<img src="${friend.profilePhoto}" alt="${escapeHtml(friend.username)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            avatarContent = friend.username[0].toUpperCase();
        }
        
        return `
            <div class="friend-item ${selectedFriend?.id === friend.id ? 'active' : ''}" data-friend-id="${friend.id}">
                <div class="avatar-container">
                    <div class="avatar">${avatarContent}</div>
                    ${friend.isOnline ? '<span class="online-indicator online"></span>' : '<span class="online-indicator"></span>'}
                </div>
                <div class="friend-info">
                    <p class="friend-name">${escapeHtml(friend.username)}</p>
                    <p class="friend-id">ID: ${friend.id}</p>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.friend-item').forEach(item => {
        item.addEventListener('click', () => {
            selectFriend(item.dataset.friendId);
        });
    });
}

// ==========================================
// LONG-PRESS HANDLER FOR MOBILE
// ==========================================
let longPressTimer = null;
let longPressTarget = null;

function handleLongPressStart(e) {
    // Only for touch devices
    if (!e.touches) return;
    
    const messageContent = e.currentTarget;
    longPressTarget = messageContent;
    
    // Start 1 second timer
    longPressTimer = setTimeout(() => {
        messageContent.classList.add('show-mobile-buttons');
        
        // Add haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }, 1000);
}

function handleLongPressEnd(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function handleLongPressMove(e) {
    // Cancel long press if finger moves
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

// Click outside to hide buttons
document.addEventListener('click', (e) => {
    if (!e.target.closest('.message-content')) {
        document.querySelectorAll('.message-content.show-mobile-buttons').forEach(el => {
            el.classList.remove('show-mobile-buttons');
        });
    }
});


function selectFriend(friendId) {
    selectedFriend = friends.find(f => f.id === friendId);

    if (selectedFriend) {
        noChatSelected.style.display = 'none';
        chatContainer.style.display = 'flex';

        if (selectedFriend.profilePhoto) {
            chatAvatar.innerHTML = `<img src="${selectedFriend.profilePhoto}" alt="${escapeHtml(selectedFriend.username)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            chatAvatar.innerHTML = selectedFriend.username[0].toUpperCase();
        }
        
        chatFriendName.textContent = selectedFriend.username;
        chatFriendId.textContent = `ID: ${selectedFriend.id}`;

        updateOnlineStatus(selectedFriend.isOnline);
        renderFriends();
        loadMessages();
    }
}

function updateOnlineStatus(isOnline) {
    if (isOnline) {
        onlineIndicator.classList.add('online');
        onlineIndicator.title = 'Online';
    } else {
        onlineIndicator.classList.remove('online');
        onlineIndicator.title = 'Offline';
    }
}

async function searchUser() {
    const userId = searchInput.value.trim();

    if (!userId || userId.length !== 4) {
        alert('Please enter a valid 4-digit ID');
        return;
    }

    if (userId === currentUser.id) {
        alert('You cannot add yourself!');
        return;
    }

    searchBtn.disabled = true;
    searchBtn.innerHTML = `
        <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
    `;

    try {
        const response = await fetch(`${API_URL}/user/${userId}`);
        const data = await response.json();

        if (data.success && data.user) {
            const isFriend = friends.some(f => f.id === data.user.id);
            displaySearchResult(data.user, isFriend);
        } else {
            alert('User not found with this ID');
            searchResult.style.display = 'none';
        }
    } catch (error) {
        console.error('Error searching user:', error);
        alert('Failed to search user. Please try again.');
        searchResult.style.display = 'none';
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>
        `;
    }
}

function displaySearchResult(user, isFriend) {
    let avatarContent;
    if (user.profilePhoto) {
        avatarContent = `<img src="${user.profilePhoto}" alt="${escapeHtml(user.username)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
        avatarContent = user.username[0].toUpperCase();
    }
    
    searchResult.style.display = 'block';
    searchResult.innerHTML = `
        <div class="search-result-content">
            <div class="avatar">${avatarContent}</div>
            <div class="friend-info">
                <p class="friend-name">${escapeHtml(user.username)}</p>
                <p class="friend-id">ID: ${user.id}</p>
            </div>
        </div>
        ${isFriend
            ? `<div class="already-friend">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Already friends
               </div>`
            : `<button class="add-friend-btn" onclick="addFriend('${user.id}', '${escapeHtml(user.username)}')">Add Friend</button>`
        }
    `;
}

async function addFriend(friendId, friendUsername) {
    try {
        const response = await fetch(`${API_URL}/friends/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id,
                friendId: friendId
            })
        });

        const data = await response.json();

        if (data.success) {
            await loadFriends();
            searchResult.style.display = 'none';
            searchInput.value = '';
            switchTab('chats');
            alert(`${friendUsername} added successfully!`);
        } else {
            alert(data.message || 'Failed to add friend.');
        }
    } catch (error) {
        console.error('Error adding friend:', error);
        alert('Failed to add friend.');
    }
}

async function loadMessages() {
    if (!selectedFriend) return;

    try {
        const response = await fetch(`${API_URL}/messages/${currentUser.id}/${selectedFriend.id}`);
        const data = await response.json();

        if (data.success) {
            messages = data.messages;
            renderMessages();
            scrollToBottom();
            markAllMessagesAsSeen();
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function renderMessages() {
    if (messages.length === 0) {
        messagesArea.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 2rem;">No messages yet. Start the conversation!</div>';
        return;
    }

    messagesArea.innerHTML = messages.map(msg => {
        const isOwn = msg.senderId === currentUser.id;
        const messageStatus = getMessageStatus(msg, isOwn);
        
        // Parse reply data if exists
        let replyPreview = '';
        if (msg.replyTo) {
            const replyUsername = msg.replyTo.senderId === currentUser.id ? 'You' : selectedFriend.username;
            
            let replyContent = msg.replyTo.content;
            if (msg.replyTo.type === 'image') {
                replyContent = '📷 Image';
            } else if (msg.replyTo.type === 'video') {
                replyContent = '🎥 Video';
            } else if (msg.replyTo.type === 'audio') {
                replyContent = '🎤 Voice Message';
            } else if (msg.replyTo.type === 'file') {
                replyContent = '📎 File';
            } else if (replyContent.length > 50) {
                replyContent = replyContent.substring(0, 50) + '...';
            }
            
            // Create safe text content for reply
const usernameDiv = document.createElement('div');
usernameDiv.textContent = replyUsername;
const safeReplyUsername = usernameDiv.innerHTML;

const contentDiv = document.createElement('div');
contentDiv.textContent = replyContent;
const safeReplyContent = contentDiv.innerHTML;

replyPreview = `
    <div class="reply-preview" onclick="scrollToMessage('${msg.replyTo.id}')">
        <div class="reply-line"></div>
        <div class="reply-content">
            <div class="reply-username">${safeReplyUsername}</div>
            <div class="reply-text">${safeReplyContent}</div>
        </div>
    </div>
`;
        }

       if (msg.type === 'image') {
    const fileData = JSON.parse(msg.content);
    
    // Create safe filename
    const nameDiv = document.createElement('div');
    nameDiv.textContent = fileData.name;
    const safeFileName = nameDiv.innerHTML;
    
    return `
        <div class="message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
            <div class="message-content">
                ${replyPreview}
                <button class="message-reply-btn" onclick="handleReplyClick('${msg.id}')" title="Reply">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 10l-5 5 5 5"/>
                        <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                    </svg>
                </button>
                ${isOwn ? `
                    <button class="message-delete-btn" onclick="handleDeleteClick('${msg.id}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                ` : ''}
                <img src="${fileData.data}" 
                     alt="${safeFileName}" 
                     class="message-image" 
                     loading="lazy"
                     data-image-src="${fileData.data}"
                     data-image-name="${safeFileName}">
                <p style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;">
                    ${safeFileName}
                    ${messageStatus}
                </p>
            </div>
        </div>
    `;
}

        if (msg.type === 'video') {
            const fileData = JSON.parse(msg.content);
            return `
                <div class="message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
                    <button class="message-reply-btn" data-message-id="${msg.id}" title="Reply">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 10l-5 5 5 5"/>
                            <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                        </svg>
                    </button>
                    ${isOwn ? `
                        <button class="message-delete-btn" data-message-id="${msg.id}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                <line x1="10" y1="11" x2="10" y2="17"/>
                                <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                        </button>
                    ` : ''}
                    <div class="message-content">
                        ${replyPreview}
                        <video src="${fileData.data}" controls class="message-video" preload="metadata"></video>
                        <p style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;">
                            ${escapeHtml(fileData.name)}
                            ${messageStatus}
                        </p>
                    </div>
                </div>
            `;
        }

        if (msg.type === 'audio') {
            const fileData = JSON.parse(msg.content);
            return `
                <div class="message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
                    <button class="message-reply-btn" data-message-id="${msg.id}" title="Reply">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 10l-5 5 5 5"/>
                            <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                        </svg>
                    </button>
                    ${isOwn ? `
                        <button class="message-delete-btn" data-message-id="${msg.id}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                <line x1="10" y1="11" x2="10" y2="17"/>
                                <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                        </button>
                    ` : ''}
                    <div class="message-content">
                        ${replyPreview}
                        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem;">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px; flex-shrink: 0;">
                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" x2="12" y1="19" y2="22"></line>
                            </svg>
                            <audio src="${fileData.data}" controls style="flex: 1; max-width: 300px;"></audio>
                        </div>
                        <p style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.8;">
                            ${fileData.name || 'Voice Message'}
                            ${messageStatus}
                        </p>
                    </div>
                </div>
            `;
        }

        if (msg.type === 'file') {
            const fileData = JSON.parse(msg.content);
            return `
                <div class="message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
                    <button class="message-reply-btn" data-message-id="${msg.id}" title="Reply">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 10l-5 5 5 5"/>
                            <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                        </svg>
                    </button>
                    ${isOwn ? `
                        <button class="message-delete-btn" data-message-id="${msg.id}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                <line x1="10" y1="11" x2="10" y2="17"/>
                                <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                        </button>
                    ` : ''}
                    <div class="message-content">
                        ${replyPreview}
                        <div class="file-message">
                            <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <div class="file-info">
                                <p class="file-name">${escapeHtml(fileData.name)}</p>
                                <p class="file-size">
                                    ${(fileData.size / 1024).toFixed(2)} KB
                                    ${messageStatus}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Text messages - SIMPLIFIED FIX
const textDiv = document.createElement('div');
textDiv.textContent = msg.content;

return `
    <div class="message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
        <div class="message-content">
            ${replyPreview}
            <button class="message-reply-btn" onclick="handleReplyClick('${msg.id}')" title="Reply">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 10l-5 5 5 5"/>
                    <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                </svg>
            </button>
            ${isOwn ? `
                <button class="message-delete-btn" onclick="handleDeleteClick('${msg.id}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            ` : ''}
            <span class="message-text-${msg.id}"></span>
            ${messageStatus}
        </div>
    </div>
`;
    }).join('');

    // ✅ SET TEXT CONTENT SAFELY (fixes apostrophes)
    messages.forEach(msg => {
        if (msg.type === 'text') {
            const textSpan = messagesArea.querySelector(`.message-text-${msg.id}`);
            if (textSpan) {
                textSpan.textContent = msg.content;
            }
        }
    });

    
        // ADD LONG-PRESS HANDLERS FOR MOBILE
        const messageContents = messagesArea.querySelectorAll('.message-content');
        messageContents.forEach(content => {
            content.addEventListener('touchstart', handleLongPressStart, { passive: true });
            content.addEventListener('touchend', handleLongPressEnd, { passive: true });
            content.addEventListener('touchmove', handleLongPressMove, { passive: true });
        });
}

function getMessageStatus(msg, isOwn) {
    if (!isOwn) return '';
    
    const status = msg.status || 'sent';
    if (status === 'seen') {
        return `
            <span class="message-status seen tick-double">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </span>
        `;
    } else {
        return `
            <span class="message-status sent tick-single">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </span>
        `;
    }
}

function setReplyMessage(messageId) {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    replyingTo = message;
    showReplyBar();
    messageInput.focus();
}

function showReplyBar() {
    if (!replyingTo) return;
    
    // Remove existing reply bar if any
    const existingBar = document.querySelector('.reply-bar');
    if (existingBar) existingBar.remove();
    
    const replyBar = document.createElement('div');
    replyBar.className = 'reply-bar';
    
    const isOwnMessage = replyingTo.senderId === currentUser.id;
    const username = isOwnMessage ? 'You' : selectedFriend.username;
    
    let content = replyingTo.content;
    if (replyingTo.type === 'image') {
        content = '📷 Image';
    } else if (replyingTo.type === 'video') {
        content = '🎥 Video';
    } else if (replyingTo.type === 'audio') {
        content = '🎤 Voice Message';
    } else if (replyingTo.type === 'file') {
        const fileData = JSON.parse(replyingTo.content);
        content = `📎 ${fileData.name}`;
    } else if (content.length > 50) {
        content = content.substring(0, 50) + '...';
    }
    
    replyBar.innerHTML = `
        <div class="reply-bar-line"></div>
        <div class="reply-bar-content">
            <div class="reply-bar-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 10l-5 5 5 5"/>
                    <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                </svg>
                <span class="reply-bar-username">${escapeHtml(username)}</span>
            </div>
            <div class="reply-bar-text">${escapeHtml(content)}</div>
        </div>
        <button class="reply-bar-close" onclick="cancelReply()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    const inputArea = document.querySelector('.input-area');
    inputArea.insertBefore(replyBar, inputArea.firstChild);
}

function cancelReply() {
    replyingTo = null;
    const replyBar = document.querySelector('.reply-bar');
    if (replyBar) replyBar.remove();
}

function scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('highlight');
        setTimeout(() => {
            messageElement.classList.remove('highlight');
        }, 2000);
    }
}

function scrollToBottom() {
    setTimeout(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }, 100);
}

function sendMessage() {
    const content = messageInput.value.trim();

    if (!content) {
        console.log('Cannot send empty message');
        return;
    }

    if (!selectedFriend) {
        alert('Please select a friend first');
        return;
    }

    if (!socket) {
        console.error('Socket is not initialized');
        alert('Connection not established. Please refresh the page.');
        return;
    }

    if (!socket.connected) {
        alert('Not connected to server. Please wait for connection...');
        return;
    }

    console.log('📤 Sending message:', {
        from: currentUser.id,
        to: selectedFriend.id,
        content: content.substring(0, 50) + '...',
        hasReply: !!replyingTo,
        socketConnected: socket.connected,
        socketId: socket.id
    });

    // Create message data with reply info if exists
    const messageData = {
        senderId: currentUser.id,
        receiverId: selectedFriend.id,
        content: content,
        type: 'text'
    };

    // Add reply information if replying to a message
    if (replyingTo) {
        messageData.replyTo = {
            id: replyingTo.id,
            senderId: replyingTo.senderId,
            content: replyingTo.content,
            type: replyingTo.type
        };
    }

    const tempMessage = {
        id: 'temp_' + Date.now() + Math.random().toString(36).substr(2, 9),
        ...messageData,
        timestamp: Date.now(),
        status: 'sent'
    };

    messages.push(tempMessage);
    renderMessages();
    scrollToBottom();

    // Play sent sound
    if (soundManager) {
        soundManager.playSentSound(); // ← ADD THIS LINE
    }

    messageInput.value = '';
    emojiPicker.style.display = 'none';
    
    // Clear reply state
    cancelReply();

    console.log('📨 Emitting send_message event:', messageData);

    socket.emit('send_message', messageData, (response) => {
        console.log('📬 Send message callback:', response);
    });

    if (typingTimeout) clearTimeout(typingTimeout);
    socket.emit('stop_typing', {
        senderId: currentUser.id,
        receiverId: selectedFriend.id
    });
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        fileInput.value = '';
        return;
    }

    if (!selectedFriend) {
        alert('Please select a friend first');
        fileInput.value = '';
        return;
    }

    if (!socket || !socket.connected) {
        alert('Not connected to server.');
        fileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        const fileData = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: event.target.result
        };

        let messageType = 'file';
        if (file.type.startsWith('image/')) {
            messageType = 'image';
        } else if (file.type.startsWith('video/')) {
            messageType = 'video';
        }

        console.log('🚀 PREPARING TO SEND FILE:', {
            fileName: fileData.name,
            fileType: fileData.type,
            fileSize: fileData.size,
            messageType: messageType,
            senderId: currentUser.id,
            receiverId: selectedFriend.id,
            socketConnected: socket?.connected,
            socketId: socket?.id,
            dataLength: fileData.data.length
        });

        const tempMessage = {
            id: 'temp_' + Date.now() + Math.random().toString(36).substr(2, 9),
            senderId: currentUser.id,
            receiverId: selectedFriend.id,
            content: JSON.stringify(fileData),
            type: messageType,
            timestamp: Date.now(),
            status: 'sent'
        };

        messages.push(tempMessage);
        renderMessages();
        scrollToBottom();

        console.log('🚀 EMITTING send_message event to server');
        console.log('📦 Message payload:', {
            senderId: currentUser.id,
            receiverId: selectedFriend.id,
            type: messageType,
            contentLength: JSON.stringify(fileData).length
        });

        socket.emit('send_message', {
            senderId: currentUser.id,
            receiverId: selectedFriend.id,
            content: JSON.stringify(fileData),
            type: messageType
        }, (response) => {
            console.log('📬 File send callback:', response);
        });

        console.log('✅ send_message event emitted successfully');

        fileInput.value = '';
    };

    reader.onerror = () => {
        alert('Failed to read file.');
        fileInput.value = '';
    };

    reader.readAsDataURL(file);
}

function initializeEmojiPicker() {
    emojiPicker.innerHTML = emojis.map(emoji =>
        `<button class="emoji-btn" onclick="insertEmoji('${emoji}')">${emoji}</button>`
    ).join('');
}

function insertEmoji(emoji) {
    messageInput.value += emoji;
    messageInput.focus();
    emojiPicker.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupMobileMenu() {
    const mobileToggle = document.createElement('button');
    mobileToggle.className = 'mobile-menu-toggle';
    mobileToggle.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
    `;
    mobileToggle.setAttribute('aria-label', 'Toggle friends list');
    document.body.appendChild(mobileToggle);

    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-backdrop';
    document.body.appendChild(backdrop);

    const sidebar = document.querySelector('.sidebar');

    mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active');
    });

    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.friend-item') && window.innerWidth < 768) {
            setTimeout(() => {
                sidebar.classList.remove('mobile-open');
                backdrop.classList.remove('active');
            }, 300);
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth >= 768) {
                sidebar.classList.remove('mobile-open');
                backdrop.classList.remove('active');
            }
        }, 250);
    });
}

// ==========================================
// SETTINGS MODAL FUNCTIONALITY
// ==========================================
function setupSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }

    closeSettingsBtn.addEventListener('click', closeSettingsModal);
    settingsOverlay.addEventListener('click', closeSettingsModal);

    editProfileBtn.addEventListener('click', () => {
        closeSettingsModal();
        openEditProfileModal();
    });

    closeEditProfileBtn.addEventListener('click', closeEditProfileModal);
    editProfileOverlay.addEventListener('click', closeEditProfileModal);

    backToSettingsBtn.addEventListener('click', () => {
        closeEditProfileModal();
        openSettingsModal();
    });

    uploadPhotoBtn.addEventListener('click', () => {
        profilePhotoInput.click();
    });

    profilePhotoInput.addEventListener('change', handleProfilePhotoUpload);

    saveProfileBtn.addEventListener('click', saveProfile);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const imageModal = document.getElementById('imageModal');
            if (imageModal && imageModal.classList.contains('active')) {
                imageModal.classList.remove('active');
            } else if (editProfileModal.style.display === 'flex') {
                closeEditProfileModal();
            } else if (settingsModal.style.display === 'flex') {
                closeSettingsModal();
            } else if (karaokeModal.style.display === 'flex') {
                closeKaraokeModal();
            }
        }
    });
}

function openSettingsModal() {
    settingsModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
    settingsModal.style.display = 'none';
    document.body.style.overflow = '';
}

function openEditProfileModal() {
    editProfileModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    loadUserProfile();
}

function closeEditProfileModal() {
    editProfileModal.style.display = 'none';
    document.body.style.overflow = '';
}

function loadUserProfile() {
    if (!currentUser) return;

    usernameInput.value = currentUser.username || '';

    if (currentUser.profilePhoto) {
        profilePhotoImg.src = currentUser.profilePhoto;
        profilePhotoImg.style.display = 'block';
        profilePhotoInitial.style.display = 'none';
    } else {
        profilePhotoImg.style.display = 'none';
        profilePhotoInitial.style.display = 'flex';
        profilePhotoInitial.textContent = currentUser.username ? currentUser.username[0].toUpperCase() : 'U';
    }
}

function handleProfilePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        profilePhotoInput.value = '';
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        alert('Image size must be less than 2MB');
        profilePhotoInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const imageData = event.target.result;
        
        profilePhotoImg.src = imageData;
        profilePhotoImg.style.display = 'block';
        profilePhotoInitial.style.display = 'none';
        
        profilePhotoInput.setAttribute('data-temp-photo', imageData);
    };

    reader.onerror = () => {
        alert('Failed to read image file.');
        profilePhotoInput.value = '';
    };

    reader.readAsDataURL(file);
}

async function saveProfile() {
    const newUsername = usernameInput.value.trim();

    if (!newUsername) {
        alert('Please enter a username');
        return;
    }

    if (newUsername.length < 2) {
        alert('Username must be at least 2 characters');
        return;
    }

    if (newUsername.length > 25) {
        alert('Username must be less than 25 characters');
        return;
    }

    try {
        saveProfileBtn.disabled = true;
        saveProfileBtn.innerHTML = `
            <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span>Saving...</span>
        `;

        const tempPhoto = profilePhotoInput.getAttribute('data-temp-photo');
        const profilePhoto = tempPhoto || currentUser.profilePhoto || null;

        const response = await fetch(`${API_URL}/user/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: currentUser.id,
                username: newUsername,
                profilePhoto: profilePhoto
            })
        });

        const data = await response.json();

        if (data.success) {
            currentUser.username = newUsername;
            currentUser.profilePhoto = profilePhoto;
            localStorage.setItem('chatty_mirror_user', JSON.stringify(currentUser));

            if (tempPhoto) {
                profilePhotoInput.removeAttribute('data-temp-photo');
            }

            loadUserProfile();
            
            alert('Profile updated successfully!');
            
            closeEditProfileModal();

            await loadFriends();
            
            if (selectedFriend) {
                renderFriends();
            }
        } else {
            alert(data.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Failed to update profile. Please try again.');
    } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Save</span>
        `;
    }
}

// ==========================================
// IMAGE MODAL FUNCTIONALITY
// ==========================================
function setupImageModal() {
    const modal = document.getElementById('imageModal');
    const closeBtn = document.querySelector('.image-modal-close');
    const modalImg = document.getElementById('modalImage');

    if (!modal || !closeBtn || !modalImg) {
        console.error('❌ Image modal elements not found in HTML');
        return;
    }

    console.log('✅ Image modal found and setting up...');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        console.log('Modal closed via X button');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            console.log('Modal closed via backdrop click');
        }
    });

    console.log('✅ Image modal setup complete');
}

function openImageModal(imageSrc, imageName = '') {
    console.log('🖼️ Opening image modal:', { 
        imageSrc: imageSrc.substring(0, 50) + '...', 
        imageName 
    });
    
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');

    if (modal && modalImg) {
        modalImg.src = imageSrc;
        modalImg.alt = imageName || 'Full size image';
        modal.classList.add('active');
        console.log('✅ Modal opened successfully');
    } else {
        console.error('❌ Modal elements not found:', { 
            modal: !!modal, 
            modalImg: !!modalImg 
        });
    }
}

// ==========================================
// KARAOKE MODAL FUNCTIONALITY
// ==========================================
function setupKaraokeModal() {
    if (!karaokeBtn) {
        console.error('❌ Karaoke button not found');
        return;
    }

    karaokeBtn.addEventListener('click', openKaraokeModal);
    closeKaraokeBtn.addEventListener('click', closeKaraokeModal);
    karaokeOverlay.addEventListener('click', closeKaraokeModal);

    youtubeSearchBtn.addEventListener('click', searchYouTube);
    youtubeSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchYouTube();
    });

    startRecordBtn.addEventListener('click', startCountdown);
    stopRecordBtn.addEventListener('click', stopRecording);
    sendRecordingBtn.addEventListener('click', sendKaraokeRecording);

    const downloadRecordingBtn = document.getElementById('downloadRecordingBtn');
    if (downloadRecordingBtn) {
        downloadRecordingBtn.addEventListener('click', downloadKaraokeRecording);
    }

    console.log('✅ Karaoke modal setup complete');
}

function openKaraokeModal() {
    if (!selectedFriend) {
        alert('Please select a friend first to send karaoke recordings');
        return;
    }

    karaokeModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    console.log('🎤 Karaoke modal opened');
}

function closeKaraokeModal() {
    console.log('🚪 Closing karaoke modal...');
    
    karaokeModal.style.display = 'none';
    document.body.style.overflow = '';
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log('⏹️ Stopping active recording...');
        mediaRecorder.stop();
    }
    mediaRecorder = null;
    
    if (youtubePlayer) {
        try {
            console.log('⏹️ Stopping YouTube player...');
            youtubePlayer.stopVideo();
            youtubePlayer.destroy();
        } catch (e) {
            console.warn('Error stopping player:', e);
        }
        youtubePlayer = null;
    }
    
    if (window.karaokeIframe) {
        console.log('🗑️ Removing hidden YouTube iframe...');
        window.karaokeIframe.remove();
        window.karaokeIframe = null;
    }
    
    if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
    }
    
    cleanupStreams();
    
    startRecordBtn.style.display = 'inline-flex';
    stopRecordBtn.style.display = 'none';
    
    const downloadBtn = document.getElementById('downloadRecordingBtn');
    if (downloadBtn) {
        downloadBtn.style.display = 'none';
    }
    
    youtubeSearchInput.value = '';
    recordingTimer.textContent = '00:00';
    
    selectedVideoId = null;
    recordedBlob = null;
    audioChunks = [];
    
    const playerDiv = document.getElementById('youtubePlayer');
    if (playerDiv) {
        playerDiv.innerHTML = '';
    }
    
    console.log('✅ UI reset complete');
}

async function searchYouTube() {
    const query = youtubeSearchInput.value.trim();
    
    if (!query) {
        alert('Please enter a search term');
        return;
    }

    youtubeSearchBtn.disabled = true;
    youtubeSearchBtn.innerHTML = `
        <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <span>Searching...</span>
    `;

    try {
        const response = await fetch(`${API_URL}/youtube/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.success && data.results && data.results.length > 0) {
            displayYouTubeResults(data.results);
            console.log('✅ Search results loaded');
        } else {
            alert('No results found. Please try a different search term.');
            youtubeResults.style.display = 'none';
        }
    } catch (error) {
        console.error('Error searching YouTube:', error);
        alert('Failed to search YouTube. Please check your internet connection.');
        youtubeResults.style.display = 'none';
    } finally {
        youtubeSearchBtn.disabled = false;
        youtubeSearchBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span>Search YouTube</span>
        `;
    }
}

function displayYouTubeResults(items) {
    youtubeResults.style.display = 'block';
    youtubeResults.innerHTML = items.map(item => {
        const videoId = item.videoId;
        const title = item.title;
        const author = item.author;
        const thumbnail = item.videoThumbnails && item.videoThumbnails.length > 0 
            ? item.videoThumbnails.find(t => t.quality === 'medium')?.url || item.videoThumbnails[0].url
            : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        
        return `
            <div class="youtube-video-item" data-video-id="${videoId}" onclick="selectYouTubeVideo('${videoId}', '${escapeHtml(title)}')">
                <img src="${thumbnail}" alt="${escapeHtml(title)}" class="youtube-thumbnail" onerror="this.src='https://i.ytimg.com/vi/${videoId}/mqdefault.jpg'">
                <div class="youtube-video-info">
                    <div class="youtube-video-title">${escapeHtml(title)}</div>
                    <div class="youtube-video-channel">${escapeHtml(author)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function selectYouTubeVideo(videoId, title) {
    selectedVideoId = videoId;
    console.log('🎵 Selected video:', videoId, title);
    
    document.querySelectorAll('.youtube-video-item').forEach(item => {
        item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    loadYouTubePlayer(videoId);
}

function loadYouTubePlayer(videoId) {
    console.log('📺 Loading YouTube player for:', videoId);
    
    karaokePlayerSection.style.display = 'block';
    recordedAudioPreview.style.display = 'none';
    
    const playerDiv = document.getElementById('youtubePlayer');
    if (playerDiv) {
        playerDiv.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading player...</div>';
    }
    
    if (youtubePlayer) {
        try {
            youtubePlayer.destroy();
        } catch (e) {
            console.warn('Error destroying old player:', e);
        }
        youtubePlayer = null;
    }
    
    if (!youtubeAPIReady) {
        console.warn('⚠️ YouTube API not ready, waiting...');
        
        playerDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #6b7280;">
                <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; margin: 0 auto 1rem;">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
                <p>Loading YouTube player...</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Please wait a moment</p>
            </div>
        `;
        
        const checkInterval = setInterval(() => {
            if (youtubeAPIReady) {
                clearInterval(checkInterval);
                console.log('✅ API ready, loading player now');
                loadYouTubePlayer(videoId);
            }
        }, 500);
        
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!youtubeAPIReady) {
                playerDiv.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #ef4444;">
                        <p>❌ Failed to load YouTube player</p>
                        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Refresh Page</button>
                    </div>
                `;
            }
        }, 10000);
        
        return;
    }
    
    try {
        playerDiv.innerHTML = '';
        
        youtubePlayer = new YT.Player('youtubePlayer', {
            height: '400',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'autoplay': 0,
                'controls': 1,
                'modestbranding': 1,
                'rel': 0,
                'fs': 1,
                'playsinline': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onError': onPlayerError,
                'onStateChange': onPlayerStateChange
            }
        });
        
        console.log('✅ YouTube player created successfully');
    } catch (error) {
        console.error('❌ Error creating player:', error);
        playerDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #ef4444;">
                <p>❌ Error loading video</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">${error.message}</p>
            </div>
        `;
    }
}

function onPlayerReady(event) {
    console.log('✅ YouTube player ready and loaded');
}

function onPlayerError(event) {
    console.error('❌ YouTube player error:', event.data);
    
    const errorMessages = {
        2: 'Invalid video ID',
        5: 'HTML5 player error',
        100: 'Video not found or private',
        101: 'Video cannot be embedded',
        150: 'Video cannot be embedded'
    };
    
    const message = errorMessages[event.data] || 'Unknown error';
    
    alert(`Cannot play this video: ${message}\n\nPlease try another karaoke song.`);
    
    karaokePlayerSection.style.display = 'none';
    youtubeResults.style.display = 'block';
}

function onPlayerStateChange(event) {
    const states = {
        '-1': 'unstarted',
        '0': 'ended',
        '1': 'playing',
        '2': 'paused',
        '3': 'buffering',
        '5': 'video cued'
    };
    console.log('▶️ Player state:', states[event.data] || event.data);
}

function startCountdown() {
    if (!selectedVideoId) {
        alert('Please select a karaoke song first');
        return;
    }

    countdownOverlay.style.display = 'flex';
    let count = 3;
    countdownNumber.textContent = count;

    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNumber.textContent = count;
            countdownNumber.style.animation = 'none';
            setTimeout(() => {
                countdownNumber.style.animation = 'countdown 1s ease-in-out';
            }, 10);
        } else {
            clearInterval(countdownInterval);
            countdownOverlay.style.display = 'none';
            startRecording();
        }
    }, 1000);
}

async function startRecording() {
    try {
        console.log('🎤 Starting karaoke recording...');
        console.log('Platform:', platform, 'Native:', isNativeApp, 'Android:', isAndroid);
        
        if (isNativeApp && isAndroid) {
            console.log('📱 Android Native App - Using internal audio capture');
            await startNativeAndroidRecording();
            return;
        }
        
        console.log('🌐 Web Browser - Using standard recording');
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 2
            }
        });

        let finalStream;
        let recordingMode = 'mic-only';
        
        if (!isMobile) {
            try {
                desktopStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true,
                    preferCurrentTab: true
                });

                const audioTracks = desktopStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    audioContext = new AudioContext({ sampleRate: 48000 });
                    const micSource = audioContext.createMediaStreamSource(micStream);
                    const desktopSource = audioContext.createMediaStreamSource(desktopStream);
                    
                    const micGain = audioContext.createGain();
                    const musicGain = audioContext.createGain();
                    micGain.gain.value = 1.5;
                    musicGain.gain.value = 0.7;
                    
                    const destination = audioContext.createMediaStreamDestination();
                    micSource.connect(micGain).connect(destination);
                    desktopSource.connect(musicGain).connect(destination);
                    
                    desktopStream.getVideoTracks().forEach(t => t.stop());
                    finalStream = destination.stream;
                    recordingMode = 'mic+music';
                    console.log('✅ Desktop: Mixed audio');
                }
            } catch {
                finalStream = micStream;
            }
        } else {
            finalStream = micStream;
        }

        mediaRecorder = new MediaRecorder(finalStream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 192000
        });

        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = handleRecordingStop;
        mediaRecorder.start(100);
        recordingStartTime = Date.now();

        if (youtubePlayer?.playVideo) {
            youtubePlayer.playVideo();
        }

        updateRecordingUI(recordingMode);
        recordingInterval = setInterval(updateRecordingTimer, 1000);

    } catch (error) {
        console.error('❌ Recording error:', error);
        alert('Recording failed: ' + error.message);
        cleanupStreams();
    }
}

async function startNativeAndroidRecording() {
    try {
        console.log('📱 Starting native Android recording...');
        
        const InternalAudioCapture = window.Capacitor.Plugins.InternalAudioCapture;
        
        if (!InternalAudioCapture) {
            throw new Error('InternalAudioCapture plugin not found');
        }
        
        console.log('✅ Plugin found, requesting permission...');
        
        const permResult = await InternalAudioCapture.requestPermission();
        
        if (!permResult.granted) {
            throw new Error('Permission denied by user');
        }
        
        console.log('✅ Permission granted, starting recording...');
        
        await InternalAudioCapture.startRecording();
        
        nativeRecordingActive = true;
        recordingStartTime = Date.now();
        
        if (youtubePlayer?.playVideo) {
            youtubePlayer.playVideo();
        }
        
        startRecordBtn.style.display = 'none';
        stopRecordBtn.style.display = 'inline-flex';
        recordingIndicator.style.display = 'flex';
        recordingIndicator.innerHTML = `
            <span class="recording-pulse"></span>
            <span>🎤🎵 Recording (MIC + MUSIC) [NATIVE]</span>
        `;
        
        recordingInterval = setInterval(updateRecordingTimer, 1000);
        
        console.log('✅ Native recording started successfully!');
        
    } catch (error) {
        console.error('❌ Native recording error:', error);
        alert('Native recording failed: ' + error.message + '\n\nFalling back to web recording...');
        nativeRecordingActive = false;
        await startWebRecording();
    }
}

function updateRecordingUI(mode) {
    startRecordBtn.style.display = 'none';
    stopRecordBtn.style.display = 'inline-flex';
    recordingIndicator.style.display = 'flex';
    
    const platformLabel = isNativeApp ? '[NATIVE]' : '[WEB]';
    
    if (mode === 'mic+music') {
        recordingIndicator.innerHTML = `
            <span class="recording-pulse"></span>
            <span>Recording (MIC + MUSIC) 🎤🎵 ${platformLabel}</span>
        `;
    } else {
        recordingIndicator.innerHTML = `
            <span class="recording-pulse"></span>
            <span>Recording (MIC ONLY) 🎤 ${platformLabel}</span>
        `;
    }
}

function updateRecordingTimer() {
    if (!recordingStartTime) return;
    
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    recordingTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function stopRecording() {
    console.log('⏹️ Stopping recording...');
    
    if (nativeRecordingActive) {
        try {
            const InternalAudioCapture = window.Capacitor.Plugins.InternalAudioCapture;
            
            if (!InternalAudioCapture) {
                throw new Error('Plugin not available');
            }
            
            console.log('⏹️ Stopping native recording...');
            const result = await InternalAudioCapture.stopRecording();
            
            console.log('✅ Recording stopped successfully');
            console.log('📁 File size:', (result.size / 1024).toFixed(2), 'KB');
            
            const base64Data = result.base64;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            recordedBlob = new Blob([byteArray], { type: 'audio/wav' });
            
            nativeRecordingActive = false;
            
            const audioUrl = URL.createObjectURL(recordedBlob);
            recordedAudio.src = audioUrl;
            recordedAudioPreview.style.display = 'block';
            
            const downloadBtn = document.getElementById('downloadRecordingBtn');
            if (downloadBtn) {
                downloadBtn.style.display = 'inline-flex';
                downloadBtn.disabled = false;
            }
            
            console.log('✅ Recording ready:', (recordedBlob.size / 1024).toFixed(2), 'KB');
            
        } catch (error) {
            console.error('❌ Error stopping native recording:', error);
            alert('Failed to stop recording: ' + error.message);
        }
    } else {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') {
            console.warn('⚠️ No active recording');
            return;
        }

        mediaRecorder.stop();
        
        if (youtubePlayer?.pauseVideo) {
            youtubePlayer.pauseVideo();
        }
    }
    
    if (recordingInterval) {
        clearInterval(recordingInterval);
        recordingInterval = null;
    }
    
    startRecordBtn.style.display = 'inline-flex';
    stopRecordBtn.style.display = 'none';
    recordingIndicator.style.display = 'none';
    
    console.log('✅ Recording stopped');
}

function handleRecordingStop() {
    console.log('🎬 Processing recording...');
    
    if (audioChunks.length === 0) {
        console.error('❌ No audio chunks recorded');
        alert('Recording failed: No audio data captured');
        cleanupStreams();
        return;
    }
    
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    recordedBlob = audioBlob;
    
    const audioUrl = URL.createObjectURL(audioBlob);
    recordedAudio.src = audioUrl;
    
    recordedAudioPreview.style.display = 'block';
    
    const downloadBtn = document.getElementById('downloadRecordingBtn');
    if (downloadBtn) {
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.disabled = false;
    }
    
    console.log('✅ Recording ready!', (audioBlob.size / 1024).toFixed(2), 'KB');
    
    cleanupStreams();
}

async function startWebRecording() {
    try {
        console.log('🌐 Starting web microphone recording...');
        
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: true,
                sampleRate: 48000
            }
        });

        mediaRecorder = new MediaRecorder(micStream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
        });

        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };
        mediaRecorder.onstop = handleRecordingStop;
        mediaRecorder.start(1000);
        recordingStartTime = Date.now();

        if (youtubePlayer?.playVideo) {
            youtubePlayer.playVideo();
        }

        startRecordBtn.style.display = 'none';
        stopRecordBtn.style.display = 'inline-flex';
        recordingIndicator.style.display = 'flex';
        recordingIndicator.innerHTML = `
            <span class="recording-pulse"></span>
            <span>🎤 Recording (MIC ONLY) [WEB]</span>
        `;
        
        recordingInterval = setInterval(updateRecordingTimer, 1000);
        
        console.log('✅ Web recording started');
        
    } catch (error) {
        console.error('❌ Web recording error:', error);
        alert('Recording failed: ' + error.message);
        cleanupStreams();
    }
}

function downloadKaraokeRecording() {
    if (!recordedBlob) {
        alert('No recording to download');
        return;
    }

    try {
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const extension = recordedBlob.type.includes('wav') ? 'wav' : 'webm';
        a.download = `Karaoke_${timestamp}.${extension}`;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log('✅ Recording downloaded');
    } catch (error) {
        console.error('❌ Download error:', error);
        alert('Failed to download recording');
    }
}

window.downloadKaraokeRecording = downloadKaraokeRecording;

function cleanupStreams() {
    console.log('🧹 Cleaning up streams...');
    
    document.querySelectorAll('iframe[src*="youtube.com"]').forEach(iframe => {
        if (iframe.id !== 'youtubePlayer') {
            iframe.remove();
        }
    });
    
    if (window.karaokeIframe) {
        try {
            window.karaokeIframe.remove();
        } catch (e) {}
        window.karaokeIframe = null;
    }
    
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    
    if (desktopStream) {
        desktopStream.getTracks().forEach(track => track.stop());
        desktopStream = null;
    }
    
    if (audioContext) {
        if (audioContext.state !== 'closed') {
            audioContext.close().catch(e => console.warn('Error closing audio context:', e));
        }
        audioContext = null;
    }
    
    mediaStreamDestination = null;
    recordingStartTime = null;
    audioChunks = [];
    nativeRecordingActive = false;
    
    console.log('✅ Streams cleaned up');
}

async function sendKaraokeRecording() {
    if (!recordedBlob) {
        alert('No recording to send');
        return;
    }

    if (!selectedFriend) {
        alert('Please select a friend first');
        return;
    }

    if (!socket || !socket.connected) {
        alert('Not connected to server');
        return;
    }

    try {
        sendRecordingBtn.disabled = true;
        sendRecordingBtn.innerHTML = `
            <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span>Sending...</span>
        `;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const audioData = {
                name: `Karaoke Recording - ${new Date().toLocaleString()}`,
                type: recordedBlob.type,
                size: recordedBlob.size,
                data: event.target.result
            };

            console.log('🎤 Sending karaoke:', audioData.size, 'bytes');

            const newMessage = {
                id: 'temp_' + Date.now() + Math.random().toString(36).substr(2, 9),
                senderId: currentUser.id,
                receiverId: selectedFriend.id,
                content: JSON.stringify(audioData),
                type: 'audio',
                timestamp: Date.now(),
                status: 'sent'
            };

            messages.push(newMessage);
            renderMessages();
            scrollToBottom();

            socket.emit('send_message', {
                senderId: currentUser.id,
                receiverId: selectedFriend.id,
                content: JSON.stringify(audioData),
                type: 'audio'
            }, (response) => {
                console.log('📬 Karaoke send response:', response);
            });

            alert('Karaoke recording sent! 🎤\n\nYou can record another or close the modal.');
            
            sendRecordingBtn.disabled = false;
            sendRecordingBtn.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                    <path d="M2 2l7.586 7.586"></path>
                    <circle cx="11" cy="11" r="2"></circle>
                </svg>
                <span>Send to Chat</span>
            `;
        };

        reader.onerror = () => {
            alert('Failed to process recording');
            sendRecordingBtn.disabled = false;
            sendRecordingBtn.innerHTML = `<span>Send to Chat</span>`;
        };

        reader.readAsDataURL(recordedBlob);
    } catch (error) {
        console.error('Error sending:', error);
        alert('Failed to send. Please try again.');
        sendRecordingBtn.disabled = false;
    }
}

// ==========================================
// LOGOUT FUNCTIONS
// ==========================================
function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (!logoutBtn) {
        console.error('❌ Logout button not found');
        return;
    }
    
    logoutBtn.addEventListener('click', showLogoutConfirmation);
    
    console.log('✅ Logout button setup complete');
}

function showLogoutConfirmation() {
    let modal = document.getElementById('logoutModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'logoutModal';
        modal.className = 'logout-modal';
        modal.innerHTML = `
            <div class="logout-modal-content">
                <div class="logout-modal-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <h3>Logout</h3>
                </div>
                <div class="logout-modal-body">
                    <p>Are you sure you want to logout? You can always login again with your User ID and password.</p>
                </div>
                <div class="logout-modal-actions">
                    <button class="logout-cancel-btn" onclick="hideLogoutConfirmation()">Cancel</button>
                    <button class="logout-confirm-btn" onclick="performLogout()">Logout</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideLogoutConfirmation();
            }
        });
    }
    
    modal.classList.add('active');
}

function hideLogoutConfirmation() {
    const modal = document.getElementById('logoutModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function performLogout() {
    const confirmBtn = document.querySelector('.logout-confirm-btn');
    
    if (!confirmBtn) return;
    
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
        <svg class="icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; display: inline-block; margin-right: 0.5rem;">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        Logging out...
    `;
    
    try {
        if (currentUser && currentUser.id) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                await fetch(`${API_URL}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('✅ Server notified of logout');
                
            } catch (error) {
                console.warn('⚠️ Server logout notification failed (continuing anyway):', error.message);
            }
        }
        
        if (socket && socket.connected) {
            socket.disconnect();
            console.log('🔌 Socket disconnected');
        }
        
        localStorage.removeItem('chatty_mirror_user');
        console.log('✅ User data cleared from localStorage');
        
        confirmBtn.innerHTML = '✅ Logged out!';
        
        setTimeout(() => {
            window.location.href = 'auth.html';
        }, 500);
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        
        localStorage.removeItem('chatty_mirror_user');
        console.log('🔄 Forcing logout despite error');
        
        setTimeout(() => {
            window.location.href = 'auth.html';
        }, 500);
    }
}

window.showLogoutConfirmation = showLogoutConfirmation;
window.hideLogoutConfirmation = hideLogoutConfirmation;
window.performLogout = performLogout;

// ==========================================
// CALL FUNCTIONALITY
// ==========================================
function setupCallButtons() {
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const videoCallBtn = document.getElementById('videoCallBtn');
    
    if (voiceCallBtn) {
        voiceCallBtn.addEventListener('click', () => {
            if (selectedFriend) {
                startCall('audio');
            } else {
                alert('Please select a friend first');
            }
        });
    }
    
    if (videoCallBtn) {
        videoCallBtn.addEventListener('click', () => {
            if (selectedFriend) {
                startCall('video');
            } else {
                alert('Please select a friend first');
            }
        });
    }
    
    console.log('✅ Call buttons setup complete');
}

function startCall(type) {
    if (!selectedFriend || !currentUser) {
        alert('Unable to start call - missing user information');
        return;
    }
    
    if (!socket || !socket.connected) {
        alert('Not connected to server. Please check your connection.');
        return;
    }
    
    console.log(`📞 Starting ${type} call with:`, selectedFriend.username);
    
    // First, notify the receiver through Socket.IO
    socket.emit('initiate_call', {
        callerId: currentUser.id,
        receiverId: selectedFriend.id,
        callerName: currentUser.username,
        callType: type
    });
    
    // Then open the call window for the caller
    const callWindow = window.open(
        `call.html?userId=${currentUser.id}&friendId=${selectedFriend.id}&friendName=${encodeURIComponent(selectedFriend.username)}&type=${type}&callType=outgoing`,
        'CallWindow',
        'width=800,height=600,resizable=yes,scrollbars=yes'
    );
    
    if (!callWindow) {
        alert('Failed to open call window. Please allow pop-ups for this site.');
    } else {
        console.log('✅ Call window opened for outgoing call');
    }
}

window.startCall = startCall;

// ==========================================
// ==========================================
// PAINT MODAL FUNCTIONALITY
// ==========================================
function setupPaintModal() {
    const openPaintBtn = document.getElementById('openPaintBtn');
    const paintBtn = document.getElementById('paintBtn');
    
    if (!openPaintBtn && !paintBtn) {
        console.log('⚠️ Paint buttons not found - skipping paint setup');
        return;
    }
    
    // Handle the sidebar "Open Paint Studio" button
    if (openPaintBtn) {
        openPaintBtn.addEventListener('click', () => {
            if (!selectedFriend) {
                alert('Please select a friend first to send drawings');
                return;
            }
            
            window.open(
                'paint.html',
                'PaintWindow',
                'width=1000,height=700,resizable=yes,scrollbars=yes'
            );
        });
    }
    
    // Handle the input area paint button (if exists)
    if (paintBtn) {
        paintBtn.addEventListener('click', () => {
            if (!selectedFriend) {
                alert('Please select a friend first to send drawings');
                return;
            }
            
            window.open(
                'paint.html',
                'PaintWindow',
                'width=1000,height=700,resizable=yes,scrollbars=yes'
            );
        });
    }
    
    console.log('✅ Paint button setup complete');
}

// ==========================================
// MUSIC STUDIO BUTTON
// ==========================================
const openMusicBtn = document.getElementById('openMusicBtn');
if (openMusicBtn) {
    openMusicBtn.addEventListener('click', () => {
        window.open('studio.html', 'MusicStudio', 'width=1600,height=900,resizable=yes,scrollbars=yes');
    });
}

// ==========================================
// MAKE FUNCTIONS GLOBALLY ACCESSIBLE
// ==========================================
window.addFriend = addFriend;
window.selectYouTubeVideo = selectYouTubeVideo;
window.insertEmoji = insertEmoji;
window.openImageModal = openImageModal;
window.setReplyMessage = setReplyMessage;
window.cancelReply = cancelReply;
window.scrollToMessage = scrollToMessage;
window.deleteMessage = deleteMessage;  // ← ADD THIS
// ==========================================
// END OF FILE
// ==========================================
console.log('✅ app.js loaded successfully');

// ==========================================
// KEYBOARD SHORTCUT FOR THEME TOGGLE
// ==========================================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        if (themeManager) {
            themeManager.toggleTheme();
        }
    }
});

// ==========================================
// GLOBAL MESSAGE ACTION HANDLERS
// ==========================================
function handleReplyClick(messageId) {
    console.log('💬 Reply clicked:', messageId);
    if (messageId) {
        setReplyMessage(messageId);
    }
}

function handleDeleteClick(messageId) {
    console.log('🗑️ Delete clicked:', messageId);
    if (messageId) {
        deleteMessage(messageId);
    }
}

// Make them globally accessible
window.handleReplyClick = handleReplyClick;
window.handleDeleteClick = handleDeleteClick;

// Reconnect when window regains focus (after call window closes)
window.addEventListener('focus', () => {
    if (socket && !socket.connected && currentUser) {
        console.log('🔄 Window focused, reconnecting...');
        socket.connect();
        socket.emit('user_connected', currentUser.id);
    }
});

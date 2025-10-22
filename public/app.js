// public/app.js

// Simple URL configuration - works for both local and deployed
const API_URL = '/api';
const SOCKET_URL = window.location.origin;

console.log('Connecting to:', { API_URL, SOCKET_URL });

// Socket.IO
let socket = null;

// State
let currentUser = null;
let friends = [];
let selectedFriend = null;
let messages = [];
let typingTimeout = null;

// Emojis
const emojis = ['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '❤️', '🔥', '✨', '🎉', '💯', '😊', '🙌', '💪', '🌟'];

// DOM Elements
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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    setupEventListeners();
    initializeEmojiPicker();
    initializeSocket();
});

async function initializeApp() {
    try {
        // Check if user already exists in localStorage
        const storedUser = localStorage.getItem('chatty_mirror_user');

        if (storedUser) {
            // Use existing user
            currentUser = JSON.parse(storedUser);
            console.log('Loaded existing user:', currentUser.id);
            currentUserIdEl.textContent = currentUser.id;

            // Verify user still exists on server
            const verifyResponse = await fetch(`${API_URL}/user/${currentUser.id}`);
            const verifyData = await verifyResponse.json();

            if (!verifyData.success || !verifyData.user) {
                // User doesn't exist on server, create new one
                console.log('User not found on server, creating new user');
                await createNewUser();
            }
        } else {
            // Create new user
            await createNewUser();
        }

        await loadFriends();
    } catch (error) {
        console.error('Error initializing app:', error);
        alert('Failed to connect to server. Please check your internet connection.');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function createNewUser() {
    const response = await fetch(`${API_URL}/user/init`, {
        method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
        currentUser = data.user;
        // Save user to localStorage
        localStorage.setItem('chatty_mirror_user', JSON.stringify(currentUser));
        console.log('Created new user:', currentUser.id);
        currentUserIdEl.textContent = currentUser.id;
    } else {
        throw new Error('Failed to initialize user');
    }
}

function initializeSocket() {
    socket = io(SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        transports: ['polling', 'websocket'] // Polling first for better compatibility
    });

    // Connection status
    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        connectionStatus.style.color = '#10b981';
        connectionStatus.title = 'Connected';

        if (currentUser) {
            socket.emit('user_connected', currentUser.id);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        connectionStatus.style.color = '#ef4444';
        connectionStatus.title = 'Disconnected';
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts');
        if (currentUser) {
            socket.emit('user_connected', currentUser.id);
        }
    });

    // New message received
    socket.on('new_message', (message) => {
        console.log('New message received:', message);

        // Check if message is relevant to current conversation
        const isRelevant = selectedFriend && (
            message.senderId === selectedFriend.id || 
            message.receiverId === selectedFriend.id
        );

        if (isRelevant) {
            // Check if message already exists (to prevent duplicates)
            const exists = messages.some(m => 
                m.timestamp === message.timestamp && 
                m.senderId === message.senderId &&
                m.content === message.content
            );

            if (!exists) {
                messages.push(message);
                renderMessages();
                scrollToBottom();
            }
        }

        // Update friend list
        loadFriends();

        // Show notification
        if ('Notification' in window && Notification.permission === 'granted') {
            if (message.senderId !== currentUser.id && 
                (!selectedFriend || message.senderId !== selectedFriend.id || !document.hasFocus())) {
                new Notification('New message from Chatty Mirror', {
                    body: 'You have a new message',
                    icon: '/favicon.ico'
                });
            }
        }
    });

    // Message sent confirmation
    socket.on('message_sent', (data) => {
        if (data.success) {
            console.log('Message sent successfully');
        } else {
            console.error('Message send failed:', data.error);
            alert('Failed to send message. Please try again.');
            
            if (messages.length > 0 && messages[messages.length - 1].senderId === currentUser.id) {
                messages.pop();
                renderMessages();
            }
        }
    });

    // Friend added notification
    socket.on('friend_added', async (data) => {
        console.log('Friend added:', data);
        await loadFriends();
    });

    // User status updates
    socket.on('user_status', (data) => {
        console.log('User status:', data);
        const friend = friends.find(f => f.id === data.userId);
        if (friend) {
            friend.isOnline = data.status === 'online';
            renderFriends();

            if (selectedFriend && selectedFriend.id === data.userId) {
                updateOnlineStatus(data.status === 'online');
            }
        }
    });

    // Typing indicator
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

    // Connection error
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        connectionStatus.style.color = '#ef4444';
        connectionStatus.title = 'Connection Error';
    });
}

function setupEventListeners() {
    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });

    // Search user
    searchBtn.addEventListener('click', searchUser);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchUser();
    });
    searchInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });

    // Send message
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Typing indicator
    messageInput.addEventListener('input', () => {
        if (!selectedFriend || !socket || !socket.connected) return;

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

    // File upload
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Emoji picker
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'flex' : 'none';
    });

    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.style.display = 'none';
        }
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

    friendsList.innerHTML = friends.map(friend => `
        <div class="friend-item ${selectedFriend?.id === friend.id ? 'active' : ''}" data-friend-id="${friend.id}">
            <div class="avatar-container">
                <div class="avatar">${friend.username[0].toUpperCase()}</div>
                ${friend.isOnline ? '<span class="online-indicator online"></span>' : '<span class="online-indicator"></span>'}
            </div>
            <div class="friend-info">
                <p class="friend-name">${escapeHtml(friend.username)}</p>
                <p class="friend-id">ID: ${friend.id}</p>
            </div>
        </div>
    `).join('');

    // Add click listeners
    document.querySelectorAll('.friend-item').forEach(item => {
        item.addEventListener('click', () => {
            const friendId = item.dataset.friendId;
            selectFriend(friendId);
        });
    });
}

function selectFriend(friendId) {
    selectedFriend = friends.find(f => f.id === friendId);

    if (selectedFriend) {
        noChatSelected.style.display = 'none';
        chatContainer.style.display = 'flex';

        chatAvatar.textContent = selectedFriend.username[0].toUpperCase();
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
    }
}

function displaySearchResult(user, isFriend) {
    searchResult.style.display = 'block';
    searchResult.innerHTML = `
        <div class="search-result-content">
            <div class="avatar">${user.username[0].toUpperCase()}</div>
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
            alert(`${friendUsername} added as friend successfully!`);
        } else {
            alert('Failed to add friend. Please try again.');
        }
    } catch (error) {
        console.error('Error adding friend:', error);
        alert('Failed to add friend. Please try again.');
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

        if (msg.type === 'image') {
            const fileData = JSON.parse(msg.content);
            return `
                <div class="message ${isOwn ? 'own' : ''}">
                    <div class="message-content">
                        <img src="${fileData.data}" alt="${escapeHtml(fileData.name)}" class="message-image" loading="lazy">
                        <p style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;">${escapeHtml(fileData.name)}</p>
                    </div>
                </div>
            `;
        }

        if (msg.type === 'video') {
            const fileData = JSON.parse(msg.content);
            return `
                <div class="message ${isOwn ? 'own' : ''}">
                    <div class="message-content">
                        <video src="${fileData.data}" controls class="message-video" preload="metadata"></video>
                        <p style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.8;">${escapeHtml(fileData.name)}</p>
                    </div>
                </div>
            `;
        }

        if (msg.type === 'file') {
            const fileData = JSON.parse(msg.content);
            return `
                <div class="message ${isOwn ? 'own' : ''}">
                    <div class="message-content">
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
                                <p class="file-size">${(fileData.size / 1024).toFixed(2)} KB</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="message ${isOwn ? 'own' : ''}">
                <div class="message-content">${escapeHtml(msg.content)}</div>
            </div>
        `;
    }).join('');
}

function scrollToBottom() {
    setTimeout(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }, 100);
}

function sendMessage() {
    const content = messageInput.value.trim();

    if (!content || !selectedFriend) return;

    if (!socket || !socket.connected) {
        alert('Not connected to server. Please check your connection.');
        return;
    }

    // Send via Socket.IO
    socket.emit('send_message', {
        senderId: currentUser.id,
        receiverId: selectedFriend.id,
        content: content,
        type: 'text'
    });

    // Add to local messages immediately
    const message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        senderId: currentUser.id,
        receiverId: selectedFriend.id,
        content: content,
        type: 'text',
        timestamp: Date.now()
    };

    messages.push(message);
    renderMessages();
    scrollToBottom();

    messageInput.value = '';
    emojiPicker.style.display = 'none';

    // Stop typing indicator
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
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
        alert('Not connected to server. Please check your connection.');
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

        // Send via Socket.IO
        socket.emit('send_message', {
            senderId: currentUser.id,
            receiverId: selectedFriend.id,
            content: JSON.stringify(fileData),
            type: messageType
        });

        // Add to local messages immediately
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            senderId: currentUser.id,
            receiverId: selectedFriend.id,
            content: JSON.stringify(fileData),
            type: messageType,
            timestamp: Date.now()
        };

        messages.push(message);
        renderMessages();
        scrollToBottom();

        fileInput.value = '';
    };

    reader.onerror = () => {
        alert('Failed to read file. Please try again.');
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
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});

// Reconnect socket when coming back online
window.addEventListener('online', () => {
    console.log('Back online');
    if (socket && !socket.connected) {
        socket.connect();
    }
});

window.addEventListener('offline', () => {
    console.log('Gone offline');
});

// Global functions for inline onclick handlers
window.addFriend = addFriend;
window.insertEmoji = insertEmoji;

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

// Import MongoDB database module
const {
    connectDB,
    userOperations,
    messageOperations,
    friendshipOperations,
    migrateFromFiles
} = require('./db');

const app = express();
const server = http.createServer(app);

// CORS Configuration
const io = socketIO(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3001",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 10e6
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3001",
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.'
});

app.use('/api/', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

const activeUsers = new Map();
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function parseDuration(duration) {
    try {
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        if (!match) return 0;
        
        const hours = (match[1] || '0H').slice(0, -1);
        const minutes = (match[2] || '0M').slice(0, -1);
        const seconds = (match[3] || '0S').slice(0, -1);
        
        return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
    } catch (error) {
        console.error('Error parsing duration:', error);
        return 0;
    }
}

async function generateUniqueUserId() {
    let userId;
    let isUnique = false;
    
    while (!isUnique) {
        userId = Math.floor(1000 + Math.random() * 9000).toString();
        const exists = await userOperations.userExists(userId);
        if (!exists) {
            isUnique = true;
        }
    }
    
    return userId;
}

async function hashPassword(password) {
    try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        console.error('❌ Error hashing password:', error);
        throw new Error('Password hashing failed');
    }
}

async function verifyPassword(password, hash) {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        console.error('❌ Error verifying password:', error);
        return false;
    }
}

function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return validator.escape(input.trim());
}

// ==========================================
// SOCKET.IO EVENTS
// ==========================================

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // DEBUG: Log all incoming events
    const originalOnevent = socket.onevent;
    socket.onevent = function(packet) {
        const args = packet.data || [];
        const eventName = args[0];
        
        // Log all events except the noisy ones
        if (!['ping', 'pong'].includes(eventName)) {
            console.log(`📡 EVENT RECEIVED: "${eventName}"`, 
                args[1] ? JSON.stringify(args[1]).substring(0, 100) : '');
        }
        
        originalOnevent.call(this, packet);
    };

    socket.on('user_connected', async (userId) => {
        if (!/^\d{4}$/.test(userId)) {
            socket.emit('error', { message: 'Invalid user ID format' });
            return;
        }

        if (activeUsers.has(userId)) {
            const oldSocketId = activeUsers.get(userId);
            console.log(`🔄 User ${userId} reconnecting, removing old socket ${oldSocketId}`);
        }
        
        activeUsers.set(userId, socket.id);
        socket.userId = userId;
        console.log(`👤 User ${userId} connected with socket ${socket.id}`);
        console.log(`📊 Total active users: ${activeUsers.size}`);
        
        socket.broadcast.emit('user_status', { userId, status: 'online' });
        
        // Deliver pending messages from database
        try {
            const undeliveredMessages = await messageOperations.getUndeliveredMessages(userId);
            
            if (undeliveredMessages.length > 0) {
                console.log(`📬 Delivering ${undeliveredMessages.length} pending messages to ${userId}`);
                undeliveredMessages.forEach(msg => {
                    socket.emit('new_message', {
                        id: msg.messageId,
                        senderId: msg.senderId,
                        receiverId: msg.receiverId,
                        content: msg.content,
                        type: msg.type,
                        timestamp: msg.timestamp,
                        status: msg.status,
                        seenAt: msg.seenAt
                    });
                });
            }
        } catch (error) {
            console.error('❌ Error delivering pending messages:', error);
        }
    });

    socket.on('send_message', async (data) => {
        console.log('\n' + '='.repeat(60));
        console.log('📨 INCOMING MESSAGE EVENT');
        console.log('='.repeat(60));
        
        const { senderId, receiverId, content, type } = data;
        
        console.log('📋 Message Details:');
        console.log('  - From:', senderId);
        console.log('  - To:', receiverId);
        console.log('  - Type:', type);
        
        try {
            // Validate input
            if (!senderId || !receiverId || !content || !type) {
                throw new Error('Missing required fields');
            }

            if (!/^\d{4}$/.test(senderId) || !/^\d{4}$/.test(receiverId)) {
                throw new Error('Invalid user ID format');
            }

            const validTypes = ['text', 'image', 'video', 'file', 'audio'];
            if (!validTypes.includes(type)) {
                throw new Error('Invalid message type');
            }

            let sanitizedContent = content;
            if (type === 'text' && typeof content === 'string') {
                sanitizedContent = sanitizeInput(content);
                
                if (sanitizedContent.length > 5000) {
                    throw new Error('Message too long');
                }
            }

            console.log('✅ Validation passed');
            
            const message = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                senderId: senderId,
                receiverId: receiverId,
                content: sanitizedContent,
                type: type,
                timestamp: Date.now(),
                status: 'sent',
                seenAt: null
            };
            
            console.log('📝 Message ID:', message.id);
            
            // Save to MongoDB
            const savedMessage = await messageOperations.saveMessage(message);
            
            if (!savedMessage) {
                throw new Error('Failed to save message to database');
            }
            
            console.log('✅ Message saved to database successfully');
            
            socket.emit('message_sent', { 
                success: true, 
                message: message 
            });
            console.log('✅ Confirmation sent to sender:', senderId);
            
            const receiverSocketId = activeUsers.get(receiverId);
            console.log('🔍 Looking for receiver:', receiverId);
            console.log('🔍 Receiver socket ID:', receiverSocketId || 'NOT FOUND');
            
            if (receiverSocketId) {
                const receiverSocket = io.sockets.sockets.get(receiverSocketId);
                if (receiverSocket) {
                    receiverSocket.emit('new_message', message);
                    console.log('✅ Message emitted to receiver socket:', receiverSocketId);
                    
                    if (type === 'audio') {
                        console.log('🎤 Karaoke recording delivered to receiver');
                    }
                } else {
                    console.log('⚠️  Receiver socket ID exists but socket is disconnected');
                    activeUsers.delete(receiverId);
                }
            } else {
                console.log('💤 Receiver is offline - message saved for later delivery');
            }
            
            console.log('='.repeat(60));
            console.log('✅ MESSAGE PROCESSING COMPLETE');
            console.log('='.repeat(60) + '\n');
            
        } catch (error) {
            console.error('❌ ERROR HANDLING MESSAGE:');
            console.error('  -', error.message);
            socket.emit('message_sent', { 
                success: false, 
                error: error.message 
            });
            console.log('='.repeat(60) + '\n');
        }
    });

    socket.on('typing', (data) => {
        const { senderId, receiverId } = data;
        
        if (!/^\d{4}$/.test(senderId) || !/^\d{4}$/.test(receiverId)) {
            return;
        }
        
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', { userId: senderId });
        }
    });

    socket.on('stop_typing', (data) => {
        const { senderId, receiverId } = data;
        
        if (!/^\d{4}$/.test(senderId) || !/^\d{4}$/.test(receiverId)) {
            return;
        }
        
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_stop_typing', { userId: senderId });
        }
    });

    socket.on('mark_seen', async (data) => {
        const { messageId, userId } = data;
        
        console.log(`👁️  Mark seen request:`, { messageId, userId });
        
        if (!/^\d{4}$/.test(userId)) {
            return;
        }
        
        try {
            const updatedMessage = await messageOperations.markMessageSeen(messageId, Date.now());
            
            if (updatedMessage) {
                console.log(`✅ Message ${messageId} marked as seen`);
                
                const senderSocketId = activeUsers.get(updatedMessage.senderId);
                if (senderSocketId) {
                    io.to(senderSocketId).emit('message_seen', {
                        messageId: messageId,
                        seenBy: userId,
                        seenAt: Date.now()
                    });
                    console.log(`✅ Notified sender ${updatedMessage.senderId}`);
                }
            } else {
                console.log(`⚠️  Message ${messageId} not found`);
            }
            
        } catch (error) {
            console.error('❌ Error marking message as seen:', error);
        }
    });

    // WEBRTC CALL SIGNALING - FIXED VERSION
// Replace your existing call signaling section with this
// ==========================================

// Handle call initiation (notification to receiver)
socket.on('initiate_call', (data) => {
    const { callerId, receiverId, callerName, callType } = data;
    
    console.log(`📞 Call initiation: ${callerId} -> ${receiverId} (${callType})`);
    
    const receiverSocketId = activeUsers.get(receiverId);
    
    if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
            console.log(`✅ Notifying receiver ${receiverId} about incoming call`);
            
            receiverSocket.emit('incoming_call', {
                callerId: callerId,
                callerName: callerName,
                callType: callType
            });
        } else {
            console.log(`⚠️ Receiver socket not found for ${receiverId}`);
            socket.emit('call:declined', { reason: 'User not available' });
        }
    } else {
        console.log(`⚠️ Receiver ${receiverId} is offline`);
        socket.emit('call:declined', { reason: 'User is offline' });
    }
});

// Handle call rejection (when user clicks decline)
socket.on('call_rejected', (data) => {
    const { callerId, receiverId } = data;
    
    console.log(`❌ Call rejected: ${receiverId} declined call from ${callerId}`);
    
    const callerSocketId = activeUsers.get(callerId);
    if (callerSocketId) {
        const callerSocket = io.sockets.sockets.get(callerSocketId);
        if (callerSocket) {
            callerSocket.emit('call:declined', { reason: 'Call declined' });
            console.log(`✅ Notified caller ${callerId} about rejection`);
        }
    }
});

// Handle WebRTC offer
socket.on('call:offer', (data) => {
    const { to, from, offer, isVideoCall } = data;
    
    console.log(`📞 Call offer from ${from} to ${to} (${isVideoCall ? 'video' : 'audio'})`);
    
    const receiverSocketId = activeUsers.get(to);
    if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
            receiverSocket.emit('call:offer', {
                from: from,
                offer: offer,
                isVideoCall: isVideoCall
            });
            console.log(`✅ Call offer sent to ${to}`);
        } else {
            console.log(`⚠️ Receiver socket not found for ${to}`);
            socket.emit('call:declined', { reason: 'User not available' });
        }
    } else {
        console.log(`⚠️ Receiver ${to} is offline`);
        socket.emit('call:declined', { reason: 'User is offline' });
    }
});

// Handle WebRTC answer
socket.on('call:answer', (data) => {
    const { to, from, answer } = data;
    
    console.log(`📞 Call answer from ${from} to ${to}`);
    
    const receiverSocketId = activeUsers.get(to);
    if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
            receiverSocket.emit('call:answer', {
                from: from,
                answer: answer
            });
            console.log(`✅ Call answer sent to ${to}`);
        }
    }
});

// Handle ICE candidates
socket.on('call:ice-candidate', (data) => {
    const { to, candidate } = data;
    
    const receiverSocketId = activeUsers.get(to);
    if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
            receiverSocket.emit('call:ice-candidate', {
                candidate: candidate
            });
        }
    }
});

// Handle call accepted notification
socket.on('call:accepted', (data) => {
    const { to, from } = data;
    
    console.log(`✅ Call accepted by ${from}, notifying ${to}`);
    
    const callerSocketId = activeUsers.get(to);
    if (callerSocketId) {
        const callerSocket = io.sockets.sockets.get(callerSocketId);
        if (callerSocket) {
            callerSocket.emit('call:accepted', { from: from });
            console.log(`✅ Acceptance notification sent to ${to}`);
        }
    }
});

// Handle call declined (from call window decline button)
socket.on('call:declined', (data) => {
    const { to, from } = data;
    
    console.log(`❌ Call declined by ${from}, notifying ${to}`);
    
    const callerSocketId = activeUsers.get(to);
    if (callerSocketId) {
        const callerSocket = io.sockets.sockets.get(callerSocketId);
        if (callerSocket) {
            callerSocket.emit('call:declined', { reason: 'Call declined by user' });
            console.log(`✅ Decline notification sent to ${to}`);
        }
    }
});

// Handle call ended
socket.on('call:ended', (data) => {
    const { to, from } = data;
    
    console.log(`📞 Call ended by ${from}, notifying ${to}`);
    
    const receiverSocketId = activeUsers.get(to);
    if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId);
        if (receiverSocket) {
            receiverSocket.emit('call:ended');
            console.log(`✅ End notification sent to ${to}`);
        }
    }
});
    // ==========================================
    // DISCONNECT AND ERROR HANDLERS
    // ==========================================

    socket.on('disconnect', () => {
        let disconnectedUserId = null;
        for (const [userId, socketId] of activeUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                activeUsers.delete(userId);
                break;
            }
        }
        
        if (disconnectedUserId) {
            console.log(`👋 User ${disconnectedUserId} disconnected`);
            console.log(`📊 Total active users: ${activeUsers.size}`);
            socket.broadcast.emit('user_status', { 
                userId: disconnectedUserId, 
                status: 'offline' 
            });
        }
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });

}); // ← CLOSING BRACKET FOR io.on('connection')


// ==========================================
// API ROUTES
// ==========================================

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Chatty Mirror Server with MongoDB',
        version: '4.0-mongodb',
        activeUsers: activeUsers.size,
        database: 'MongoDB',
        features: [
            'Persistent data storage',
            'Text messaging',
            'Image sharing',
            'Video sharing',
            'File sharing',
            'Audio messages',
            'Karaoke recordings',
            'Secure authentication'
        ]
    });
});

app.post('/api/user/init', async (req, res) => {
    try {
        console.log('⚠️ /api/user/init called - creating new user');
        
        const userId = await generateUniqueUserId();
        const user = {
            id: userId,
            username: `User${userId}`,
            email: null,
            password: null,
            profilePhoto: null,
            createdAt: Date.now(),
            isLegacy: true
        };
        
        await userOperations.createUser(user);
        console.log(`👤 New legacy user created: ${userId}`);
        
        const { password: _, ...userWithoutPassword } = user;
        
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        console.error('❌ Error initializing user:', error);
        res.status(500).json({ success: false, message: 'Failed to initialize user' });
    }
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        let { userId } = req.params;
        userId = userId.trim();
        
        console.log(`🔍 Searching for user: "${userId}"`);
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({ 
                success: false, 
                message: 'User ID must be exactly 4 digits' 
            });
        }
        
        const user = await userOperations.getUserById(userId);
        
        if (!user) {
            console.log(`❌ User not found: ${userId}`);
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        console.log(`✅ User found: ${userId}`);
        
        res.json({
            success: true,
            user: {
                id: user.userId,
                username: user.username || `User${userId}`,
                email: user.email || null,
                profilePhoto: user.profilePhoto || null,
                createdAt: user.createdAt || Date.now()
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message
        });
    }
});

app.post('/api/user/update', async (req, res) => {
    try {
        let { userId, username, profilePhoto } = req.body;

        if (!userId || !/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }

        const user = await userOperations.getUserById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        const updates = {};

        if (username) {
            username = sanitizeInput(username);
            
            if (username.length < 2 || username.length > 25) {
                return res.json({ success: false, message: 'Username must be 2-25 characters' });
            }
            updates.username = username;
        }

        if (profilePhoto !== undefined) {
            updates.profilePhoto = profilePhoto;
        }

        const updatedUser = await userOperations.updateUser(userId, updates);

        if (updatedUser) {
            res.json({ 
                success: true, 
                user: {
                    id: updatedUser.userId,
                    username: updatedUser.username,
                    email: updatedUser.email,
                    profilePhoto: updatedUser.profilePhoto,
                    createdAt: updatedUser.createdAt
                }
            });
        } else {
            res.json({ success: false, message: 'Failed to save' });
        }
    } catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/friends/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }
        
        const friendIds = await friendshipOperations.getFriends(userId);
        
        const friends = [];
        for (const friendId of friendIds) {
            const friend = await userOperations.getUserById(friendId);
            if (friend) {
                friends.push({
                    id: friend.userId,
                    username: friend.username,
                    profilePhoto: friend.profilePhoto || null,
                    isOnline: activeUsers.has(friendId)
                });
            }
        }
        
        res.json({ success: true, friends: friends });
    } catch (error) {
        console.error('❌ Error getting friends:', error);
        res.status(500).json({ success: false, message: 'Failed to get friends' });
    }
});

app.post('/api/friends/add', async (req, res) => {
    try {
        const { userId, friendId } = req.body;
        
        console.log(`👥 Friend add request: ${userId} -> ${friendId}`);
        
        if (!userId || !friendId) {
            return res.json({ success: false, message: 'Missing userId or friendId' });
        }
        
        if (!/^\d{4}$/.test(userId) || !/^\d{4}$/.test(friendId)) {
            return res.json({ success: false, message: 'Invalid user ID format' });
        }
        
        if (userId === friendId) {
            return res.json({ success: false, message: 'Cannot add yourself as friend' });
        }
        
        const user = await userOperations.getUserById(userId);
        const friendUser = await userOperations.getUserById(friendId);
        
        if (!user) {
            return res.json({ success: false, message: 'Your user account not found' });
        }
        
        if (!friendUser) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        const added = await friendshipOperations.addFriend(userId, friendId);
        
        if (added) {
            console.log(`✅ Friend relationship established: ${userId} <-> ${friendId}`);
            
            // Notify both users via socket
            const userSocketId = activeUsers.get(userId);
            const friendSocketId = activeUsers.get(friendId);
            
            if (userSocketId) {
                const userSocket = io.sockets.sockets.get(userSocketId);
                if (userSocket) {
                    userSocket.emit('friend_added', { 
                        friendId: friendId,
                        friend: {
                            id: friendUser.userId,
                            username: friendUser.username,
                            profilePhoto: friendUser.profilePhoto
                        }
                    });
                }
            }
            
            if (friendSocketId) {
                const friendSocket = io.sockets.sockets.get(friendSocketId);
                if (friendSocket) {
                    friendSocket.emit('friend_added', { 
                        friendId: userId,
                        friend: {
                            id: user.userId,
                            username: user.username,
                            profilePhoto: user.profilePhoto
                        }
                    });
                }
            }
            
            res.json({ 
                success: true, 
                message: 'Friend added successfully',
                friend: {
                    id: friendUser.userId,
                    username: friendUser.username,
                    profilePhoto: friendUser.profilePhoto
                }
            });
        } else {
            res.json({ success: false, message: 'Failed to add friend' });
        }
    } catch (error) {
        console.error('❌ Error adding friend:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add friend: ' + error.message 
        });
    }
});

app.get('/api/messages/:userId1/:userId2', async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        
        if (!/^\d{4}$/.test(userId1) || !/^\d{4}$/.test(userId2)) {
            return res.json({ success: false, message: 'Invalid user ID format' });
        }
        
        const dbMessages = await messageOperations.getMessages(userId1, userId2);
        
        const messages = dbMessages.map(msg => ({
            id: msg.messageId,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            content: msg.content,
            type: msg.type,
            timestamp: msg.timestamp,
            status: msg.status,
            seenAt: msg.seenAt
        }));
        
        console.log(`📬 Loading messages for ${userId1}<->${userId2}: ${messages.length} messages`);
        
        res.json({
            success: true,
            messages: messages
        });
    } catch (error) {
        console.error('❌ Error getting messages:', error);
        res.status(500).json({ success: false, message: 'Failed to get messages' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running with MongoDB',
        activeUsers: activeUsers.size,
        database: 'MongoDB',
        timestamp: Date.now(),
        version: '4.0-mongodb'
    });
});

app.get('/api/karaoke/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }
        
        const dbRecordings = await messageOperations.getKaraokeRecordings(userId);
        
        const karaokeMessages = dbRecordings.map(msg => ({
            id: msg.messageId,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            content: msg.content,
            type: msg.type,
            timestamp: msg.timestamp,
            status: msg.status
        }));
        
        res.json({
            success: true,
            count: karaokeMessages.length,
            recordings: karaokeMessages
        });
    } catch (error) {
        console.error('❌ Error getting karaoke recordings:', error);
        res.status(500).json({ success: false, message: 'Failed to get karaoke recordings' });
    }
});

app.get('/api/youtube/search', async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query) {
            return res.status(400).json({ 
                success: false, 
                message: 'Query parameter is required' 
            });
        }

        console.log('🔍 YouTube search request:', query);

        if (!YOUTUBE_API_KEY) {
            console.error('❌ YouTube API key not configured');
            return res.json({
                success: false,
                message: 'YouTube API key not configured',
                results: []
            });
        }

        try {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
            const searchParams = {
                part: 'snippet',
                q: query + ' karaoke',
                type: 'video',
                maxResults: 20,
                key: YOUTUBE_API_KEY,
                videoCategoryId: '10',
                videoEmbeddable: 'true',
                videoSyndicated: 'true'
            };

            console.log('🔍 Calling YouTube Data API...');
            
            const searchResponse = await axios.get(searchUrl, { params: searchParams });

            if (searchResponse.status === 200 && searchResponse.data.items && searchResponse.data.items.length > 0) {
                const videoIds = searchResponse.data.items.map(item => item.id.videoId).join(',');
                
                const videosUrl = `https://www.googleapis.com/youtube/v3/videos`;
                const videosParams = {
                    part: 'snippet,contentDetails,status',
                    id: videoIds,
                    key: YOUTUBE_API_KEY
                };

                const videosResponse = await axios.get(videosUrl, { params: videosParams });

                const embeddableVideos = videosResponse.data.items.filter(video => 
                    video.status && video.status.embeddable === true
                );

                console.log(`✅ Found ${embeddableVideos.length} embeddable videos`);

                if (embeddableVideos.length === 0) {
                    res.json({
                        success: false,
                        message: 'No embeddable karaoke videos found',
                        results: []
                    });
                } else {
                    const results = embeddableVideos.slice(0, 5).map(video => ({
                        videoId: video.id,
                        title: video.snippet.title,
                        author: video.snippet.channelTitle,
                        lengthSeconds: parseDuration(video.contentDetails.duration),
                        videoThumbnails: [
                            { 
                                url: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url, 
                                quality: 'medium' 
                            }
                        ],
                        embeddable: true
                    }));

                    res.json({
                        success: true,
                        results: results,
                        source: 'YouTube Data API v3'
                    });
                }
            } else {
                res.json({
                    success: false,
                    message: 'No results found',
                    results: []
                });
            }
        } catch (apiError) {
            console.error('❌ YouTube API Error:', apiError.response?.data || apiError.message);
            
            if (apiError.response?.status === 403) {
                res.json({
                    success: false,
                    message: 'YouTube API quota exceeded or invalid API key',
                    results: []
                });
            } else {
                res.json({
                    success: false,
                    message: 'Failed to search YouTube',
                    results: []
                });
            }
        }
    } catch (error) {
        console.error('❌ YouTube search error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search YouTube',
            error: error.message
        });
    }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
        let { name, email, password } = req.body;
        
        console.log('📝 Signup request:', { name, email });
        
        if (!name || !email || !password) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        name = sanitizeInput(name);
        email = email.toLowerCase().trim();
        
        if (name.length < 2 || name.length > 25) {
            return res.json({ 
                success: false, 
                message: 'Name must be 2-25 characters' 
            });
        }
        
        if (!validator.isEmail(email)) {
            return res.json({ 
                success: false, 
                message: 'Invalid email format' 
            });
        }
        
        if (password.length < 6) {
            return res.json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        const existingUser = await userOperations.getUserByEmail(email);
        if (existingUser) {
            return res.json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        const userId = await generateUniqueUserId();
        const hashedPassword = await hashPassword(password);
        
        const user = {
            id: userId,
            username: name,
            email: email,
            password: hashedPassword,
            profilePhoto: null,
            createdAt: Date.now()
        };
        
        const savedUser = await userOperations.createUser(user);
        
        if (savedUser) {
            console.log(`✅ New user registered: ${userId} (${name})`);
            
            res.json({ 
                success: true, 
                user: {
                    id: savedUser.userId,
                    username: savedUser.username,
                    email: savedUser.email,
                    profilePhoto: savedUser.profilePhoto,
                    createdAt: savedUser.createdAt
                },
                message: 'Account created successfully' 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Failed to create account' 
            });
        }
        
    } catch (error) {
        console.error('❌ Signup error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during signup' 
        });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        let { identifier, password } = req.body;
        
        console.log('🔐 Login attempt:', identifier);
        
        if (!identifier || !password) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        identifier = identifier.trim();
        
        let foundUser = null;
        
        if (/^\d{4}$/.test(identifier)) {
            foundUser = await userOperations.getUserById(identifier);
        } else if (validator.isEmail(identifier)) {
            foundUser = await userOperations.getUserByEmail(identifier);
        } else {
            foundUser = await userOperations.getUserByUsername(identifier);
        }
        
        if (!foundUser) {
            return res.json({ 
                success: false, 
                message: 'User not found. Please check your ID/username/email or sign up.' 
            });
        }
        
        // Handle legacy users (no password field)
        if (!foundUser.password) {
            console.log('⚠️ Legacy user detected:', foundUser.userId);
            
            const hashedPassword = await hashPassword(password);
            await userOperations.updateUser(foundUser.userId, {
                password: hashedPassword,
                email: foundUser.email || `user${foundUser.userId}@legacy.local`,
                migratedAt: Date.now()
            });
            
            console.log('✅ Legacy user migrated:', foundUser.userId);
        } else {
            const isPasswordValid = await verifyPassword(password, foundUser.password);
            
            if (!isPasswordValid) {
                return res.json({ 
                    success: false, 
                    message: 'Incorrect password' 
                });
            }
        }
        
        console.log(`✅ User logged in: ${foundUser.userId} (${foundUser.username})`);
        
        await userOperations.updateUser(foundUser.userId, {
            lastLogin: Date.now()
        });
        
        res.json({ 
            success: true, 
            user: {
                id: foundUser.userId,
                username: foundUser.username,
                email: foundUser.email,
                profilePhoto: foundUser.profilePhoto,
                createdAt: foundUser.createdAt
            },
            message: 'Login successful' 
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

app.post('/api/auth/check-email', async (req, res) => {
    try {
        let { email } = req.body;
        
        if (!email) {
            return res.json({ exists: false });
        }
        
        email = email.toLowerCase().trim();
        
        const user = await userOperations.getUserByEmail(email);
        
        res.json({ exists: !!user });
        
    } catch (error) {
        console.error('❌ Check email error:', error);
        res.json({ exists: false });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (userId && activeUsers.has(userId)) {
            activeUsers.delete(userId);
            
            io.emit('user_status', { userId, status: 'offline' });
            
            console.log(`👋 User logged out: ${userId}`);
        }
        
        res.json({ success: true, message: 'Logged out successfully' });
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.json({ success: false, message: 'Logout failed' });
    }
});

// Migration endpoint
app.post('/api/admin/migrate-from-files', async (req, res) => {
    try {
        const path = require('path');
        const DATA_DIR = path.join(__dirname, 'data');
        
        console.log('🔄 Starting migration from files...');
        
        const result = await migrateFromFiles(DATA_DIR);
        
        res.json({
            success: true,
            message: 'Migration complete',
            migrated: result
        });
        
    } catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({
            success: false,
            message: 'Migration failed: ' + error.message
        });
    }
});

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
    try {
        // Connect to MongoDB first
        await connectDB();
        
        server.listen(PORT, HOST, () => {
            console.log('\n' + '='.repeat(60));
            console.log('  🚀 CHATTY MIRROR SERVER - MONGODB VERSION');
            console.log('='.repeat(60));
            console.log(`  ✅ Server: http://localhost:${PORT}`);
            console.log(`  ✅ Version: 4.0 (MongoDB)`);
            console.log(`  🗄️  Database: MongoDB (Persistent Storage)`);
            console.log(`  🔒 Features: bcrypt, rate limiting, input validation`);
            console.log(`  🎤 Karaoke: Text, Images, Videos, Files, Audio`);
            console.log('='.repeat(60));
            console.log('\n  ⚠️  SECURITY REMINDERS:');
            console.log('  - Set MONGODB_URI in environment variables');
            console.log('  - Set YOUTUBE_API_KEY in environment variables');
            console.log('  - Set CLIENT_URL to your frontend domain');
            console.log('  - Never commit secrets to version control');
            console.log('='.repeat(60) + '\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

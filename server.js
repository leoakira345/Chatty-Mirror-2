const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

const app = express();
const server = http.createServer(app);

// FIXED: Restrict CORS to your actual domain
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

// FIXED: Restrict CORS
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3001",
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Limit each IP to 5 login attempts per 15 minutes
    message: 'Too many login attempts, please try again later.'
});

app.use('/api/', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const activeUsers = new Map();
const writeLocks = new Map();

// FIXED: No hardcoded API key
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

async function ensureDataDirectory() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log('✅ Data directory ready');
        await cleanupTempFiles();
    } catch (error) {
        console.error('❌ Error creating data directory:', error);
    }
}

async function cleanupTempFiles() {
    try {
        const files = await fs.readdir(DATA_DIR);
        const tempFiles = files.filter(f => f.endsWith('.tmp'));
        
        if (tempFiles.length > 0) {
            console.log(`🧹 Cleaning up ${tempFiles.length} temporary files...`);
            
            for (const tempFile of tempFiles) {
                const tempPath = path.join(DATA_DIR, tempFile);
                try {
                    const stats = await fs.stat(tempPath);
                    if (Date.now() - stats.mtimeMs > 60000) {
                        await fs.unlink(tempPath);
                        console.log(`   Deleted: ${tempFile}`);
                    }
                } catch (err) {
                    // File might have been deleted already
                }
            }
        }
    } catch (error) {
        console.error('⚠️  Error cleaning temp files:', error.message);
    }
}

async function readJSON(filename) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        const data = await fs.readFile(filePath, 'utf8');
        
        if (!data || data.trim().length === 0) {
            console.log(`⚠️  Empty file: ${filename}`);
            return null;
        }
        
        try {
            const parsed = JSON.parse(data);
            return parsed;
        } catch (parseError) {
            console.error(`❌ JSON Parse Error in ${filename}:`, parseError.message);
            const backupPath = path.join(DATA_DIR, `${filename}.corrupted.${Date.now()}`);
            await fs.writeFile(backupPath, data, 'utf8');
            console.log(`   Backed up to: ${backupPath}`);
            return null;
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        console.error(`❌ Error reading file ${filename}:`, error);
        throw error;
    }
}

async function writeJSON(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    const tempPath = filePath + '.tmp';
    
    let waitCount = 0;
    while (writeLocks.get(filename)) {
        await new Promise(resolve => setTimeout(resolve, 10));
        waitCount++;
        if (waitCount > 100) {
            console.error(`⚠️  Write lock timeout for ${filename}`);
            break;
        }
    }
    
    writeLocks.set(filename, true);
    
    try {
        let jsonString;
        
        try {
            jsonString = JSON.stringify(data, null, 2);
        } catch (stringifyError) {
            console.error('❌ Error stringifying data:', stringifyError);
            return false;
        }
        
        try {
            JSON.parse(jsonString);
        } catch (validateError) {
            console.error('❌ Generated invalid JSON:', validateError);
            return false;
        }
        
        await fs.writeFile(tempPath, jsonString, 'utf8');
        
        try {
            const verifyData = await fs.readFile(tempPath, 'utf8');
            JSON.parse(verifyData);
        } catch (verifyError) {
            console.error('❌ Temporary file verification failed:', verifyError);
            await fs.unlink(tempPath);
            return false;
        }
        
        await fs.rename(tempPath, filePath);
        return true;
        
    } catch (error) {
        console.error(`❌ Error writing JSON ${filename}:`, error);
        
        try {
            await fs.unlink(tempPath);
        } catch (unlinkError) {
            // Ignore if temp file doesn't exist
        }
        
        return false;
    } finally {
        writeLocks.delete(filename);
    }
}

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
        const existingUser = await readJSON(`user_${userId}.json`);
        if (!existingUser) {
            isUnique = true;
        }
    }
    
    return userId;
}

// FIXED: Secure password hashing with bcrypt
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

// Input sanitization function
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return validator.escape(input.trim());
}

// ==========================================
// SOCKET.IO EVENTS
// ==========================================

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('user_connected', async (userId) => {
        // Validate userId format
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
        
        try {
            const files = await fs.readdir(DATA_DIR);
            const messageFiles = files.filter(f => 
                f.startsWith('messages_') && 
                f.includes(userId) && 
                f.endsWith('.json')
            );
            
            for (const file of messageFiles) {
                const messagesData = await readJSON(file);
                if (messagesData && messagesData.messages) {
                    const undeliveredMessages = messagesData.messages.filter(m => 
                        m.receiverId === userId && 
                        m.status === 'sent'
                    );
                    
                    if (undeliveredMessages.length > 0) {
                        console.log(`📬 Delivering ${undeliveredMessages.length} pending messages to ${userId}`);
                        undeliveredMessages.forEach(msg => {
                            socket.emit('new_message', msg);
                        });
                    }
                }
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

            // Validate message type
            const validTypes = ['text', 'image', 'video', 'file', 'audio'];
            if (!validTypes.includes(type)) {
                throw new Error('Invalid message type');
            }

            // Sanitize text content
            let sanitizedContent = content;
            if (type === 'text' && typeof content === 'string') {
                sanitizedContent = sanitizeInput(content);
                
                // Check message length
                if (sanitizedContent.length > 5000) {
                    throw new Error('Message too long');
                }
            }

            console.log('✅ Validation passed');

            const chatId = [senderId, receiverId].sort().join('_');
            console.log('💾 Chat ID:', chatId);
            
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
            
            let messagesData = await readJSON(`messages_${chatId}.json`);
            console.log('📂 Existing messages:', messagesData ? messagesData.messages?.length : 0);
            
            if (!messagesData) {
                messagesData = { messages: [] };
                console.log('📂 Creating new messages file');
            }
            
            if (!Array.isArray(messagesData.messages)) {
                console.log('⚠️  Messages was not an array, creating new array');
                messagesData.messages = [];
            }
            
            messagesData.messages.push(message);
            console.log('📊 Total messages in chat:', messagesData.messages.length);
            
            const saved = await writeJSON(`messages_${chatId}.json`, messagesData);
            
            if (!saved) {
                throw new Error('Failed to save message to file');
            }
            
            console.log('✅ Message saved to file successfully');
            
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
            const files = await fs.readdir(DATA_DIR);
            const messageFiles = files.filter(f => f.startsWith('messages_') && f.endsWith('.json'));
            
            let messageFound = false;
            
            for (const file of messageFiles) {
                const messagesData = await readJSON(file);
                
                if (messagesData && messagesData.messages) {
                    const messageIndex = messagesData.messages.findIndex(m => m.id === messageId);
                    
                    if (messageIndex !== -1) {
                        const message = messagesData.messages[messageIndex];
                        
                        messagesData.messages[messageIndex].status = 'seen';
                        messagesData.messages[messageIndex].seenAt = Date.now();
                        
                        await writeJSON(file, messagesData);
                        
                        messageFound = true;
                        console.log(`✅ Message ${messageId} marked as seen`);
                        
                        const senderSocketId = activeUsers.get(message.senderId);
                        if (senderSocketId) {
                            io.to(senderSocketId).emit('message_seen', {
                                messageId: messageId,
                                seenBy: userId,
                                seenAt: Date.now()
                            });
                            console.log(`✅ Notified sender ${message.senderId}`);
                        }
                        
                        break;
                    }
                }
            }
            
            if (!messageFound) {
                console.log(`⚠️  Message ${messageId} not found`);
            }
            
        } catch (error) {
            console.error('❌ Error marking message as seen:', error);
        }
    });

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
});

// ==========================================
// API ROUTES
// ==========================================

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Chatty Mirror Server is running',
        version: '3.0-secure',
        activeUsers: activeUsers.size,
        features: [
            'Text messaging',
            'Image sharing',
            'Video sharing',
            'File sharing',
            'Audio messages',
            'Karaoke recordings',
            'Secure authentication',
            'Rate limiting'
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
        
        await writeJSON(`user_${userId}.json`, user);
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
        
        const user = await readJSON(`user_${userId}.json`);
        
        if (!user) {
            console.log(`❌ User not found: ${userId}`);
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        console.log(`✅ User found: ${userId}`);
        
        const { password: _, ...userWithoutPassword } = user;
        
        res.json({
            success: true,
            user: {
                id: userWithoutPassword.id,
                username: userWithoutPassword.username || `User${userId}`,
                email: userWithoutPassword.email || null,
                profilePhoto: userWithoutPassword.profilePhoto || null,
                createdAt: userWithoutPassword.createdAt || Date.now()
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

        const user = await readJSON(`user_${userId}.json`);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        if (username) {
            username = sanitizeInput(username);
            
            if (username.length < 2 || username.length > 25) {
                return res.json({ success: false, message: 'Username must be 2-25 characters' });
            }
            user.username = username;
        }

        if (profilePhoto !== undefined) {
            user.profilePhoto = profilePhoto;
        }

        user.updatedAt = Date.now();
        const saved = await writeJSON(`user_${userId}.json`, user);

        if (saved) {
            const { password: _, ...userWithoutPassword } = user;
            res.json({ success: true, user: userWithoutPassword });
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
        
        const friendsData = await readJSON(`friends_${userId}.json`);
        
        if (!friendsData || !friendsData.friendIds) {
            return res.json({ success: true, friends: [] });
        }
        
        const friends = [];
        for (const friendId of friendsData.friendIds) {
            const friend = await readJSON(`user_${friendId}.json`);
            if (friend) {
                const { password: _, ...friendWithoutPassword } = friend;
                friends.push({
                    id: friendWithoutPassword.id,
                    username: friendWithoutPassword.username,
                    profilePhoto: friendWithoutPassword.profilePhoto || null,
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
        
        const user = await readJSON(`user_${userId}.json`);
        const friendUser = await readJSON(`user_${friendId}.json`);
        
        if (!user) {
            return res.json({ success: false, message: 'Your user account not found' });
        }
        
        if (!friendUser) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        let userFriends = await readJSON(`friends_${userId}.json`) || { friendIds: [] };
        if (!Array.isArray(userFriends.friendIds)) {
            userFriends.friendIds = [];
        }
        
        if (!userFriends.friendIds.includes(friendId)) {
            userFriends.friendIds.push(friendId);
            await writeJSON(`friends_${userId}.json`, userFriends);
            console.log(`✅ Added ${friendId} to ${userId}'s friend list`);
        }
        
        let friendFriends = await readJSON(`friends_${friendId}.json`) || { friendIds: [] };
        if (!Array.isArray(friendFriends.friendIds)) {
            friendFriends.friendIds = [];
        }
        
        if (!friendFriends.friendIds.includes(userId)) {
            friendFriends.friendIds.push(userId);
            await writeJSON(`friends_${friendId}.json`, friendFriends);
            console.log(`✅ Added ${userId} to ${friendId}'s friend list`);
        }
        
        const userSocketId = activeUsers.get(userId);
        const friendSocketId = activeUsers.get(friendId);
        
        if (userSocketId) {
            const userSocket = io.sockets.sockets.get(userSocketId);
            if (userSocket) {
                const { password: _, ...friendWithoutPassword } = friendUser;
                userSocket.emit('friend_added', { 
                    friendId: friendId,
                    friend: friendWithoutPassword 
                });
            }
        }
        
        if (friendSocketId) {
            const friendSocket = io.sockets.sockets.get(friendSocketId);
            if (friendSocket) {
                const { password: _, ...userWithoutPassword } = user;
                friendSocket.emit('friend_added', { 
                    friendId: userId,
                    friend: userWithoutPassword 
                });
            }
        }
        
        console.log(`✅ Friend relationship established: ${userId} <-> ${friendId}`);
        
        const { password: _, ...friendWithoutPassword } = friendUser;
        res.json({ 
            success: true, 
            message: 'Friend added successfully',
            friend: friendWithoutPassword
        });
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
        
        const chatId = [userId1, userId2].sort().join('_');
        const messagesData = await readJSON(`messages_${chatId}.json`);
        
        console.log(`📬 Loading messages for ${chatId}: ${messagesData?.messages?.length || 0} messages`);
        
        res.json({
            success: true,
            messages: messagesData?.messages || []
        });
    } catch (error) {
        console.error('❌ Error getting messages:', error);
        res.status(500).json({ success: false, message: 'Failed to get messages' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        activeUsers: activeUsers.size,
        writeLocks: writeLocks.size,
        timestamp: Date.now(),
        version: '3.0-secure'
    });
});

app.get('/api/karaoke/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }
        
        const files = await fs.readdir(DATA_DIR);
        const messageFiles = files.filter(f => f.startsWith('messages_') && f.endsWith('.json'));
        
        const karaokeMessages = [];
        
        for (const file of messageFiles) {
            const messagesData = await readJSON(file);
            if (messagesData && messagesData.messages) {
                const userKaraoke = messagesData.messages.filter(m => 
                    m.type === 'audio' && 
                    (m.senderId === userId || m.receiverId === userId)
                );
                karaokeMessages.push(...userKaraoke);
            }
        }
        
        karaokeMessages.sort((a, b) => b.timestamp - a.timestamp);
        
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

        // FIXED: Check if API key exists
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

// Sign Up Route
app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
        let { name, email, password } = req.body;
        
        console.log('📝 Signup request:', { name, email });
        
        // Validation
        if (!name || !email || !password) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        // Sanitize inputs
        name = sanitizeInput(name);
        email = email.toLowerCase().trim();
        
        if (name.length < 2 || name.length > 25) {
            return res.json({ 
                success: false, 
                message: 'Name must be 2-25 characters' 
            });
        }
        
        // Validate email using validator library
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
        
        // Check if email already exists
        const files = await fs.readdir(DATA_DIR);
        const userFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
        
        for (const file of userFiles) {
            const userData = await readJSON(file);
            if (userData && userData.email && userData.email.toLowerCase() === email) {
                return res.json({ 
                    success: false, 
                    message: 'Email already registered' 
                });
            }
        }
        
        // Generate unique user ID
        const userId = await generateUniqueUserId();
        
        // Hash password with bcrypt
        const hashedPassword = await hashPassword(password);
        
        // Create user object
        const user = {
            id: userId,
            username: name,
            email: email,
            password: hashedPassword,
            profilePhoto: null,
            createdAt: Date.now()
        };
        
        // Save user
        const saved = await writeJSON(`user_${userId}.json`, user);
        
        if (saved) {
            console.log(`✅ New user registered: ${userId} (${name})`);
            
            // Return user without password
            const { password: _, ...userWithoutPassword } = user;
            
            res.json({ 
                success: true, 
                user: userWithoutPassword,
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

// Login Route
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
        
        // Search for user by ID or username or email
        const files = await fs.readdir(DATA_DIR);
        const userFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
        
        let foundUser = null;
        
        // Check if identifier is a 4-digit ID
        if (/^\d{4}$/.test(identifier)) {
            // Search by ID
            const userData = await readJSON(`user_${identifier}.json`);
            if (userData) {
                foundUser = userData;
            }
        } else {
            // Search by username or email
            for (const file of userFiles) {
                const userData = await readJSON(file);
                if (userData) {
                    const matchUsername = userData.username && userData.username.toLowerCase() === identifier.toLowerCase();
                    const matchEmail = userData.email && userData.email.toLowerCase() === identifier.toLowerCase();
                    
                    if (matchUsername || matchEmail) {
                        foundUser = userData;
                        break;
                    }
                }
            }
        }
        
        if (!foundUser) {
            return res.json({ 
                success: false, 
                message: 'User not found. Please check your ID/username/email or sign up.' 
            });
        }
        
        // Handle legacy users (no password field)
        if (!foundUser.password) {
            console.log('⚠️ Legacy user detected:', foundUser.id);
            
            // Set password for legacy user
            const hashedPassword = await hashPassword(password);
            foundUser.password = hashedPassword;
            foundUser.email = foundUser.email || `user${foundUser.id}@legacy.local`;
            foundUser.migratedAt = Date.now();
            
            const saved = await writeJSON(`user_${foundUser.id}.json`, foundUser);
            
            if (saved) {
                console.log('✅ Legacy user migrated:', foundUser.id);
            } else {
                return res.json({ 
                    success: false, 
                    message: 'Failed to update user. Please try again.' 
                });
            }
        } else {
            // Verify password for regular users using bcrypt
            const isPasswordValid = await verifyPassword(password, foundUser.password);
            
            if (!isPasswordValid) {
                return res.json({ 
                    success: false, 
                    message: 'Incorrect password' 
                });
            }
        }
        
        console.log(`✅ User logged in: ${foundUser.id} (${foundUser.username})`);
        
        // Update last login time
        foundUser.lastLogin = Date.now();
        await writeJSON(`user_${foundUser.id}.json`, foundUser);
        
        // Return user without password
        const { password: _, ...userWithoutPassword } = foundUser;
        
        res.json({ 
            success: true, 
            user: userWithoutPassword,
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

// Check if email exists
app.post('/api/auth/check-email', async (req, res) => {
    try {
        let { email } = req.body;
        
        if (!email) {
            return res.json({ exists: false });
        }
        
        email = email.toLowerCase().trim();
        
        const files = await fs.readdir(DATA_DIR);
        const userFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
        
        for (const file of userFiles) {
            const userData = await readJSON(file);
            if (userData && userData.email && userData.email.toLowerCase() === email) {
                return res.json({ exists: true });
            }
        }
        
        res.json({ exists: false });
        
    } catch (error) {
        console.error('❌ Check email error:', error);
        res.json({ exists: false });
    }
});

// Logout Route
app.post('/api/auth/logout', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (userId && activeUsers.has(userId)) {
            activeUsers.delete(userId);
            
            // Notify others that user is offline
            io.emit('user_status', { userId, status: 'offline' });
            
            console.log(`👋 User logged out: ${userId}`);
        }
        
        res.json({ success: true, message: 'Logged out successfully' });
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.json({ success: false, message: 'Logout failed' });
    }
});

// Migrate all legacy users (call this once after deployment)
app.post('/api/admin/migrate-legacy-users', async (req, res) => {
    try {
        const files = await fs.readdir(DATA_DIR);
        const userFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
        
        let migratedCount = 0;
        let alreadyMigratedCount = 0;
        
        for (const file of userFiles) {
            const userData = await readJSON(file);
            
            if (userData && !userData.password) {
                // Legacy user - add default password and email
                const hashedPassword = await hashPassword('default123'); // Default password
                userData.password = hashedPassword;
                userData.email = userData.email || `user${userData.id}@legacy.local`;
                
                const saved = await writeJSON(file, userData);
                
                if (saved) {
                    migratedCount++;
                    console.log(`✅ Migrated user: ${userData.id}`);
                }
            } else if (userData && userData.password) {
                alreadyMigratedCount++;
            }
        }
        
        res.json({
            success: true,
            message: 'Migration complete',
            migrated: migratedCount,
            alreadyMigrated: alreadyMigratedCount,
            total: userFiles.length
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
    await ensureDataDirectory();
    
    server.listen(PORT, HOST, () => {
        console.log('\n' + '='.repeat(60));
        console.log('  🚀 CHATTY MIRROR SERVER - SECURE VERSION');
        console.log('='.repeat(60));
        console.log(`  ✅ Server: http://localhost:${PORT}`);
        console.log(`  ✅ Version: 3.0 (Secure)`);
        console.log(`  🔒 Features: bcrypt, rate limiting, input validation`);
        console.log(`  🎤 Karaoke: Text, Images, Videos, Files, Audio`);
        console.log('='.repeat(60));
        console.log('\n  ⚠️  SECURITY REMINDERS:');
        console.log('  - Set YOUTUBE_API_KEY in environment variables');
        console.log('  - Set CLIENT_URL to your frontend domain');
        console.log('  - Never commit API keys to version control');
        console.log('  - Consider using a real database for production');
        console.log('='.repeat(60) + '\n');
    });
}

startServer();

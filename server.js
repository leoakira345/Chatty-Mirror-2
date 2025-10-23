const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Middleware
app.use(cors({
    origin: "*",
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');

// Store active users and their socket IDs
const activeUsers = new Map();

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log('✅ Data directory ready');
    } catch (error) {
        console.error('❌ Error creating data directory:', error);
    }
}

// Helper function to read JSON file
async function readJSON(filename) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

// Helper function to write JSON file
async function writeJSON(filename, data) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error writing JSON:', error);
        return false;
    }
}

// Generate unique 4-digit user ID
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

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // User connects
    socket.on('user_connected', (userId) => {
        activeUsers.set(userId, socket.id);
        socket.userId = userId;
        console.log(`👤 User ${userId} connected with socket ${socket.id}`);
        console.log(`📊 Total active users: ${activeUsers.size}`);
        
        // Notify friends that user is online
        socket.broadcast.emit('user_status', { userId, status: 'online' });
    });

    // User sends message - ULTRA DETAILED VERSION
    socket.on('send_message', async (data) => {
        console.log('\n' + '='.repeat(60));
        console.log('📨 INCOMING MESSAGE EVENT');
        console.log('='.repeat(60));
        
        const { senderId, receiverId, content, type } = data;
        
        console.log('📋 Message Details:');
        console.log('  - From:', senderId);
        console.log('  - To:', receiverId);
        console.log('  - Type:', type);
        console.log('  - Content length:', content ? content.length : 0);
        
        if (type === 'image' || type === 'video' || type === 'file') {
            try {
                const parsed = JSON.parse(content);
                console.log('  - File name:', parsed.name);
                console.log('  - File type:', parsed.type);
                console.log('  - File size:', parsed.size, 'bytes');
                console.log('  - Data length:', parsed.data ? parsed.data.length : 0);
            } catch (e) {
                console.log('  - Could not parse file data');
            }
        } else {
            console.log('  - Text preview:', content ? content.substring(0, 50) : 'empty');
        }
        
        try {
            // Validate required fields
            if (!senderId) {
                throw new Error('Missing senderId');
            }
            if (!receiverId) {
                throw new Error('Missing receiverId');
            }
            if (!content) {
                throw new Error('Missing content');
            }
            if (!type) {
                throw new Error('Missing type');
            }

            console.log('✅ Validation passed');

            // Create consistent chat ID (sorted IDs)
            const chatId = [senderId, receiverId].sort().join('_');
            console.log('💾 Chat ID:', chatId);
            
            // Create complete message object
            const message = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                senderId: senderId,
                receiverId: receiverId,
                content: content,
                type: type,
                timestamp: Date.now()
            };
            
            console.log('📝 Message ID:', message.id);
            
            // Load existing messages
            let messagesData = await readJSON(`messages_${chatId}.json`);
            console.log('📂 Existing messages:', messagesData ? messagesData.messages.length : 0);
            
            if (!messagesData) {
                messagesData = { messages: [] };
                console.log('📂 Creating new messages file');
            }
            
            // Ensure messages array exists
            if (!Array.isArray(messagesData.messages)) {
                console.log('⚠️  Messages was not an array, creating new array');
                messagesData.messages = [];
            }
            
            // Add new message
            messagesData.messages.push(message);
            console.log('📊 Total messages in chat:', messagesData.messages.length);
            
            // Save messages to file
            const saved = await writeJSON(`messages_${chatId}.json`, messagesData);
            
            if (!saved) {
                throw new Error('Failed to save message to file');
            }
            
            console.log('✅ Message saved to file successfully');
            
            // Send confirmation to sender
            socket.emit('message_sent', { 
                success: true, 
                message: message 
            });
            console.log('✅ Confirmation sent to sender:', senderId);
            
            // Check if receiver is online
            const receiverSocketId = activeUsers.get(receiverId);
            console.log('🔍 Looking for receiver:', receiverId);
            console.log('🔍 Receiver socket ID:', receiverSocketId || 'NOT FOUND');
            console.log('🔍 Active users:', Array.from(activeUsers.keys()).join(', '));
            
            if (receiverSocketId) {
                // Emit to receiver
                io.to(receiverSocketId).emit('new_message', message);
                console.log('✅ Message emitted to receiver socket:', receiverSocketId);
                
                // Verify the socket exists
                const receiverSocket = io.sockets.sockets.get(receiverSocketId);
                if (receiverSocket) {
                    console.log('✅ Receiver socket is connected and active');
                } else {
                    console.log('⚠️  Receiver socket ID exists in map but socket not found');
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
            console.error('  - Stack:', error.stack);
            socket.emit('message_sent', { 
                success: false, 
                error: error.message 
            });
            console.log('='.repeat(60) + '\n');
        }
    });

    // User typing indicator
    socket.on('typing', (data) => {
        const { senderId, receiverId } = data;
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', { userId: senderId });
            console.log(`⌨️  ${senderId} is typing to ${receiverId}`);
        }
    });

    // User stopped typing
    socket.on('stop_typing', (data) => {
        const { senderId, receiverId } = data;
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_stop_typing', { userId: senderId });
        }
    });

    // User disconnects
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
        } else {
            console.log(`👋 Unknown socket ${socket.id} disconnected`);
        }
    });

    // Error handling
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// API Routes

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Chatty Mirror Server is running',
        version: '2.0-debug',
        activeUsers: activeUsers.size,
        endpoints: {
            health: '/api/health',
            initUser: '/api/user/init',
            getUser: '/api/user/:userId',
            updateUser: '/api/user/update',
            friends: '/api/friends/:userId',
            messages: '/api/messages/:userId1/:userId2'
        }
    });
});

// Initialize or get user
app.post('/api/user/init', async (req, res) => {
    try {
        const userId = await generateUniqueUserId();
        const user = {
            id: userId,
            username: `User${userId}`,
            profilePhoto: null,
            createdAt: Date.now()
        };
        
        await writeJSON(`user_${userId}.json`, user);
        console.log(`👤 New user created: ${userId}`);
        
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('❌ Error initializing user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize user'
        });
    }
});

// Get user by ID
app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({
                success: false,
                message: 'Invalid user ID'
            });
        }
        
        const user = await readJSON(`user_${userId}.json`);
        
        if (user) {
            if (!user.hasOwnProperty('profilePhoto')) {
                user.profilePhoto = null;
            }
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    profilePhoto: user.profilePhoto || null,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                }
            });
        } else {
            res.json({
                success: false,
                message: 'User not found'
            });
        }
    } catch (error) {
        console.error('❌ Error getting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user'
        });
    }
});

// Update user profile
app.post('/api/user/update', async (req, res) => {
    try {
        const { userId, username, profilePhoto } = req.body;

        if (!userId) {
            return res.json({ 
                success: false, 
                message: 'User ID is required' 
            });
        }

        if (!/^\d{4}$/.test(userId)) {
            return res.json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const user = await readJSON(`user_${userId}.json`);
        
        if (!user) {
            return res.json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        if (username !== undefined) {
            if (username.length < 2 || username.length > 25) {
                return res.json({ 
                    success: false, 
                    message: 'Username must be between 2 and 25 characters' 
                });
            }
            user.username = username;
        }

        if (profilePhoto !== undefined) {
            user.profilePhoto = profilePhoto;
            console.log(`📸 Profile photo updated for user ${userId}`);
        }

        user.updatedAt = Date.now();

        const saved = await writeJSON(`user_${userId}.json`, user);

        if (saved) {
            console.log(`✅ Profile updated for user ${userId}`);
            
            res.json({ 
                success: true, 
                user: {
                    id: user.id,
                    username: user.username,
                    profilePhoto: user.profilePhoto || null,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                },
                message: 'Profile updated successfully' 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Failed to save profile' 
            });
        }

    } catch (error) {
        console.error('❌ Error updating user profile:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating profile' 
        });
    }
});

// Get friends list
app.get('/api/friends/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const friendsData = await readJSON(`friends_${userId}.json`);
        
        if (!friendsData || !friendsData.friendIds) {
            return res.json({
                success: true,
                friends: []
            });
        }
        
        const friends = [];
        for (const friendId of friendsData.friendIds) {
            const friend = await readJSON(`user_${friendId}.json`);
            if (friend) {
                friends.push({
                    id: friend.id,
                    username: friend.username,
                    profilePhoto: friend.profilePhoto || null,
                    isOnline: activeUsers.has(friendId),
                    createdAt: friend.createdAt,
                    updatedAt: friend.updatedAt
                });
            }
        }
        
        res.json({
            success: true,
            friends: friends
        });
    } catch (error) {
        console.error('❌ Error getting friends:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get friends'
        });
    }
});

// Add friend
app.post('/api/friends/add', async (req, res) => {
    try {
        const { userId, friendId } = req.body;
        
        if (!userId || !friendId) {
            return res.status(400).json({
                success: false,
                message: 'Missing userId or friendId'
            });
        }
        
        const friendUser = await readJSON(`user_${friendId}.json`);
        if (!friendUser) {
            return res.json({
                success: false,
                message: 'Friend user not found'
            });
        }
        
        let userFriends = await readJSON(`friends_${userId}.json`) || { friendIds: [] };
        if (!userFriends.friendIds.includes(friendId)) {
            userFriends.friendIds.push(friendId);
            await writeJSON(`friends_${userId}.json`, userFriends);
        }
        
        let friendFriends = await readJSON(`friends_${friendId}.json`) || { friendIds: [] };
        if (!friendFriends.friendIds.includes(userId)) {
            friendFriends.friendIds.push(userId);
            await writeJSON(`friends_${friendId}.json`, friendFriends);
        }
        
        const userSocketId = activeUsers.get(userId);
        const friendSocketId = activeUsers.get(friendId);
        
        if (userSocketId) {
            io.to(userSocketId).emit('friend_added', { friendId });
        }
        if (friendSocketId) {
            io.to(friendSocketId).emit('friend_added', { friendId: userId });
        }
        
        console.log(`👥 Friend added: ${userId} <-> ${friendId}`);
        
        res.json({
            success: true,
            message: 'Friend added successfully'
        });
    } catch (error) {
        console.error('❌ Error adding friend:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add friend'
        });
    }
});

// Get messages between two users
app.get('/api/messages/:userId1/:userId2', async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        
        const chatId = [userId1, userId2].sort().join('_');
        
        const messagesData = await readJSON(`messages_${chatId}.json`);
        
        console.log(`📬 Loading messages for chat ${chatId}: ${messagesData?.messages?.length || 0} messages`);
        
        res.json({
            success: true,
            messages: messagesData?.messages || []
        });
    } catch (error) {
        console.error('❌ Error getting messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get messages'
        });
    }
});

// Send message (fallback API)
app.post('/api/messages/send', async (req, res) => {
    try {
        const { senderId, receiverId, content, type } = req.body;
        
        if (!senderId || !receiverId || !content || !type) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        const chatId = [senderId, receiverId].sort().join('_');
        
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            senderId: senderId,
            receiverId: receiverId,
            content: content,
            type: type,
            timestamp: Date.now()
        };
        
        let messagesData = await readJSON(`messages_${chatId}.json`) || { messages: [] };
        messagesData.messages.push(message);
        
        await writeJSON(`messages_${chatId}.json`, messagesData);
        
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('new_message', message);
        }
        
        console.log(`📨 Message sent via API from ${senderId} to ${receiverId}`);
        
        res.json({
            success: true,
            message: 'Message sent successfully',
            data: message
        });
    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
});

// Get online status
app.get('/api/status/:userId', (req, res) => {
    const { userId } = req.params;
    const isOnline = activeUsers.has(userId);
    res.json({
        success: true,
        userId: userId,
        isOnline: isOnline
    });
});

// Delete all data (for testing/reset)
app.delete('/api/data/reset', async (req, res) => {
    try {
        const files = await fs.readdir(DATA_DIR);
        for (const file of files) {
            await fs.unlink(path.join(DATA_DIR, file));
        }
        console.log('🗑️  All data deleted');
        res.json({
            success: true,
            message: 'All data deleted'
        });
    } catch (error) {
        console.error('❌ Error resetting data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset data'
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        activeUsers: activeUsers.size,
        activeUserIds: Array.from(activeUsers.keys()),
        timestamp: Date.now(),
        port: PORT
    });
});

// Start server
async function startServer() {
    await ensureDataDirectory();
    
    server.listen(PORT, HOST, () => {
        console.log('\n' + '='.repeat(60));
        console.log('  🚀 CHATTY MIRROR SERVER - DEBUG MODE');
        console.log('='.repeat(60));
        console.log(`  ✅ Server: http://localhost:${PORT}`);
        console.log(`  ✅ API: http://localhost:${PORT}/api`);
        console.log(`  ✅ WebSocket: ws://localhost:${PORT}`);
        console.log(`  ✅ Host: ${HOST} (All network interfaces)`);
        console.log('='.repeat(60));
        console.log('  📍 Local access: http://localhost:' + PORT);
        console.log('  📍 Network access: http://YOUR_IP:' + PORT);
        console.log('  💡 Find your IP with: ipconfig or ifconfig');
        console.log('='.repeat(60));
        console.log('  ⚡ Extensive logging enabled');
        console.log('  📊 Monitor console for detailed message flow');
        console.log('  🔍 Each message will show full processing details');
        console.log('='.repeat(60) + '\n');
    });
}

startServer();

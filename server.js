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
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');

// Store active users and their socket IDs
const activeUsers = new Map(); // userId -> socketId

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log('Data directory ready');
    } catch (error) {
        console.error('Error creating data directory:', error);
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
        console.error('Error writing JSON:', error);
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
    console.log('New client connected:', socket.id);

    // User connects
    socket.on('user_connected', (userId) => {
        activeUsers.set(userId, socket.id);
        socket.userId = userId; // Store userId on socket for easy lookup
        console.log(`User ${userId} connected with socket ${socket.id}`);
        
        // Notify friends that user is online
        socket.broadcast.emit('user_status', { userId, status: 'online' });
    });

    // User sends message - FIXED VERSION
    socket.on('send_message', async (data) => {
        const { senderId, receiverId, content, type } = data;
        
        console.log(`Message from ${senderId} to ${receiverId}:`, { type, contentLength: content?.length });
        
        try {
            // Create consistent chat ID (sorted IDs)
            const chatId = [senderId, receiverId].sort().join('_');
            
            // Create complete message object with ALL required fields
            const message = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                senderId: senderId,
                receiverId: receiverId, // IMPORTANT: Include receiverId
                content: content,
                type: type,
                timestamp: Date.now()
            };
            
            // Load existing messages
            let messagesData = await readJSON(`messages_${chatId}.json`) || { messages: [] };
            messagesData.messages.push(message);
            
            // Save messages
            await writeJSON(`messages_${chatId}.json`, messagesData);
            
            console.log(`Message saved: ${message.id}`);
            
            // Send to sender (confirmation)
            socket.emit('message_sent', { success: true, message });
            
            // Send to receiver if online - with complete message object
            const receiverSocketId = activeUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', message);
                console.log(`Message delivered to ${receiverId} (socket: ${receiverSocketId})`);
            } else {
                console.log(`Receiver ${receiverId} is offline - message will be delivered when they connect`);
            }
            
        } catch (error) {
            console.error('Error handling message:', error);
            socket.emit('message_sent', { success: false, error: error.message });
        }
    });

    // User typing indicator
    socket.on('typing', (data) => {
        const { senderId, receiverId } = data;
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', { userId: senderId });
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
        // Find and remove user from active users
        let disconnectedUserId = null;
        for (const [userId, socketId] of activeUsers.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                activeUsers.delete(userId);
                break;
            }
        }
        
        if (disconnectedUserId) {
            console.log(`User ${disconnectedUserId} disconnected`);
            socket.broadcast.emit('user_status', { userId: disconnectedUserId, status: 'offline' });
        }
    });
});

// API Routes

// Initialize or get user
app.post('/api/user/init', async (req, res) => {
    try {
        const userId = await generateUniqueUserId();
        const user = {
            id: userId,
            username: `User${userId}`,
            createdAt: Date.now()
        };
        
        await writeJSON(`user_${userId}.json`, user);
        
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('Error initializing user:', error);
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
            res.json({
                success: true,
                user: user
            });
        } else {
            res.json({
                success: false,
                message: 'User not found'
            });
        }
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user'
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
                // Add online status
                friend.isOnline = activeUsers.has(friendId);
                friends.push(friend);
            }
        }
        
        res.json({
            success: true,
            friends: friends
        });
    } catch (error) {
        console.error('Error getting friends:', error);
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
        
        // Check if friend exists
        const friendUser = await readJSON(`user_${friendId}.json`);
        if (!friendUser) {
            return res.json({
                success: false,
                message: 'Friend user not found'
            });
        }
        
        // Add friend to user's list
        let userFriends = await readJSON(`friends_${userId}.json`) || { friendIds: [] };
        if (!userFriends.friendIds.includes(friendId)) {
            userFriends.friendIds.push(friendId);
            await writeJSON(`friends_${userId}.json`, userFriends);
        }
        
        // Add user to friend's list (bidirectional)
        let friendFriends = await readJSON(`friends_${friendId}.json`) || { friendIds: [] };
        if (!friendFriends.friendIds.includes(userId)) {
            friendFriends.friendIds.push(userId);
            await writeJSON(`friends_${friendId}.json`, friendFriends);
        }
        
        // Notify both users via socket
        const userSocketId = activeUsers.get(userId);
        const friendSocketId = activeUsers.get(friendId);
        
        if (userSocketId) {
            io.to(userSocketId).emit('friend_added', { friendId });
        }
        if (friendSocketId) {
            io.to(friendSocketId).emit('friend_added', { friendId: userId });
        }
        
        res.json({
            success: true,
            message: 'Friend added successfully'
        });
    } catch (error) {
        console.error('Error adding friend:', error);
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
        
        // Create consistent chat ID (sorted IDs)
        const chatId = [userId1, userId2].sort().join('_');
        
        const messagesData = await readJSON(`messages_${chatId}.json`);
        
        res.json({
            success: true,
            messages: messagesData?.messages || []
        });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get messages'
        });
    }
});

// Send message (fallback API - Socket.IO is preferred)
app.post('/api/messages/send', async (req, res) => {
    try {
        const { senderId, receiverId, content, type } = req.body;
        
        if (!senderId || !receiverId || !content || !type) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        // Create consistent chat ID (sorted IDs)
        const chatId = [senderId, receiverId].sort().join('_');
        
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            senderId: senderId,
            receiverId: receiverId, // Include receiverId
            content: content,
            type: type,
            timestamp: Date.now()
        };
        
        // Load existing messages
        let messagesData = await readJSON(`messages_${chatId}.json`) || { messages: [] };
        messagesData.messages.push(message);
        
        // Save messages
        await writeJSON(`messages_${chatId}.json`, messagesData);
        
        // Notify receiver via socket if online
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('new_message', message);
        }
        
        res.json({
            success: true,
            message: 'Message sent successfully'
        });
    } catch (error) {
        console.error('Error sending message:', error);
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
        res.json({
            success: true,
            message: 'All data deleted'
        });
    } catch (error) {
        console.error('Error resetting data:', error);
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
        timestamp: Date.now()
    });
});

// Start server
async function startServer() {
    await ensureDataDirectory();
    
    server.listen(PORT, () => {
        console.log('=================================');
        console.log('  Chatty Mirror Server Started');
        console.log('  WITH SOCKET.IO REAL-TIME');
        console.log('=================================');
        console.log(`  Server: http://localhost:${PORT}`);
        console.log(`  API: http://localhost:${PORT}/api`);
        console.log(`  WebSocket: ws://localhost:${PORT}`);
        console.log('=================================');
        console.log('  Server is ready to accept connections');
        console.log('  Press Ctrl+C to stop');
        console.log('=================================');
    });
}

startServer();
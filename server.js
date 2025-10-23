const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');

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

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// Middleware
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

// Store active users and their socket IDs
const activeUsers = new Map();

// Initialize database tables
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(4) PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                profile_photo TEXT,
                created_at BIGINT NOT NULL,
                updated_at BIGINT
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS friendships (
                user_id VARCHAR(4) NOT NULL,
                friend_id VARCHAR(4) NOT NULL,
                created_at BIGINT NOT NULL,
                PRIMARY KEY (user_id, friend_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(50) PRIMARY KEY,
                sender_id VARCHAR(4) NOT NULL,
                receiver_id VARCHAR(4) NOT NULL,
                content TEXT NOT NULL,
                type VARCHAR(20) NOT NULL,
                timestamp BIGINT NOT NULL,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_users 
            ON messages(sender_id, receiver_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
            ON messages(timestamp)
        `);

        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
    }
}

// Generate unique 4-digit user ID
async function generateUniqueUserId() {
    let userId;
    let isUnique = false;
    
    while (!isUnique) {
        userId = Math.floor(1000 + Math.random() * 9000).toString();
        const result = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            isUnique = true;
        }
    }
    
    return userId;
}

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('user_connected', (userId) => {
        activeUsers.set(userId, socket.id);
        socket.userId = userId;
        console.log(`👤 User ${userId} connected with socket ${socket.id}`);
        console.log(`📊 Total active users: ${activeUsers.size}`);
        socket.broadcast.emit('user_status', { userId, status: 'online' });
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
        console.log('  - Content length:', content ? content.length : 0);
        
        if (type === 'image' || type === 'video' || type === 'file') {
            try {
                const parsed = JSON.parse(content);
                console.log('  - File name:', parsed.name);
                console.log('  - File type:', parsed.type);
                console.log('  - File size:', parsed.size, 'bytes');
            } catch (e) {
                console.log('  - Could not parse file data');
            }
        }
        
        try {
            if (!senderId || !receiverId || !content || !type) {
                throw new Error('Missing required fields');
            }

            console.log('✅ Validation passed');

            const message = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                senderId,
                receiverId,
                content,
                type,
                timestamp: Date.now()
            };

            console.log('📝 Message ID:', message.id);

            // Save to database
            await pool.query(
                'INSERT INTO messages (id, sender_id, receiver_id, content, type, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
                [message.id, message.senderId, message.receiverId, message.content, message.type, message.timestamp]
            );

            console.log('✅ Message saved to database');

            // Send confirmation to sender
            socket.emit('message_sent', { success: true, message });
            console.log('✅ Confirmation sent to sender:', senderId);

            // Send to receiver if online
            const receiverSocketId = activeUsers.get(receiverId);
            console.log('🔍 Receiver socket ID:', receiverSocketId || 'NOT FOUND');
            
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', message);
                console.log('✅ Message sent to receiver');
            } else {
                console.log('💤 Receiver offline - message saved for later');
            }

            console.log('='.repeat(60));
            console.log('✅ MESSAGE PROCESSING COMPLETE');
            console.log('='.repeat(60) + '\n');

        } catch (error) {
            console.error('❌ ERROR HANDLING MESSAGE:', error.message);
            socket.emit('message_sent', { success: false, error: error.message });
            console.log('='.repeat(60) + '\n');
        }
    });

    socket.on('typing', (data) => {
        const { senderId, receiverId } = data;
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_typing', { userId: senderId });
            console.log(`⌨️  ${senderId} is typing to ${receiverId}`);
        }
    });

    socket.on('stop_typing', (data) => {
        const { senderId, receiverId } = data;
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user_stop_typing', { userId: senderId });
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

// API Routes

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Chatty Mirror Server - PostgreSQL Version',
        version: '3.0-postgresql',
        activeUsers: activeUsers.size,
        database: 'Connected'
    });
});

app.post('/api/user/init', async (req, res) => {
    try {
        const userId = await generateUniqueUserId();
        const user = {
            id: userId,
            username: `User${userId}`,
            profilePhoto: null,
            createdAt: Date.now()
        };
        
        await pool.query(
            'INSERT INTO users (id, username, profile_photo, created_at) VALUES ($1, $2, $3, $4)',
            [user.id, user.username, user.profilePhoto, user.createdAt]
        );
        
        console.log(`👤 New user created: ${userId}`);
        
        res.json({ success: true, user });
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ success: false, message: 'Failed to create user' });
    }
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }
        
        const result = await pool.query(
            'SELECT id, username, profile_photo, created_at, updated_at FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    profilePhoto: user.profile_photo,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                }
            });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('❌ Error getting user:', error);
        res.status(500).json({ success: false, message: 'Failed to get user' });
    }
});

app.post('/api/user/update', async (req, res) => {
    try {
        const { userId, username, profilePhoto } = req.body;

        if (!userId || !/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }

        if (username && (username.length < 2 || username.length > 25)) {
            return res.json({ 
                success: false, 
                message: 'Username must be between 2 and 25 characters' 
            });
        }

        const updatedAt = Date.now();
        
        await pool.query(
            'UPDATE users SET username = $1, profile_photo = $2, updated_at = $3 WHERE id = $4',
            [username, profilePhoto, updatedAt, userId]
        );

        const result = await pool.query(
            'SELECT id, username, profile_photo, created_at, updated_at FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log(`✅ Profile updated for user ${userId}`);
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    profilePhoto: user.profile_photo,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                },
                message: 'Profile updated successfully'
            });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('❌ Error updating user:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

app.get('/api/friends/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            SELECT u.id, u.username, u.profile_photo, u.created_at, u.updated_at
            FROM users u
            INNER JOIN friendships f ON u.id = f.friend_id
            WHERE f.user_id = $1
        `, [userId]);

        const friends = result.rows.map(row => ({
            id: row.id,
            username: row.username,
            profilePhoto: row.profile_photo,
            isOnline: activeUsers.has(row.id),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));

        res.json({ success: true, friends });
    } catch (error) {
        console.error('❌ Error getting friends:', error);
        res.status(500).json({ success: false, message: 'Failed to get friends' });
    }
});

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
        const friendCheck = await pool.query('SELECT id FROM users WHERE id = $1', [friendId]);
        if (friendCheck.rows.length === 0) {
            return res.json({ success: false, message: 'Friend user not found' });
        }

        const createdAt = Date.now();

        // Add friendship (both directions)
        await pool.query(`
            INSERT INTO friendships (user_id, friend_id, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
        `, [userId, friendId, createdAt]);

        await pool.query(`
            INSERT INTO friendships (user_id, friend_id, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
        `, [friendId, userId, createdAt]);

        // Notify both users if online
        const userSocketId = activeUsers.get(userId);
        const friendSocketId = activeUsers.get(friendId);
        
        if (userSocketId) io.to(userSocketId).emit('friend_added', { friendId });
        if (friendSocketId) io.to(friendSocketId).emit('friend_added', { friendId: userId });

        console.log(`👥 Friend added: ${userId} <-> ${friendId}`);

        res.json({ success: true, message: 'Friend added successfully' });
    } catch (error) {
        console.error('❌ Error adding friend:', error);
        res.status(500).json({ success: false, message: 'Failed to add friend' });
    }
});

app.get('/api/messages/:userId1/:userId2', async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;

        const result = await pool.query(`
            SELECT id, sender_id, receiver_id, content, type, timestamp
            FROM messages
            WHERE (sender_id = $1 AND receiver_id = $2)
               OR (sender_id = $2 AND receiver_id = $1)
            ORDER BY timestamp ASC
        `, [userId1, userId2]);

        const messages = result.rows.map(row => ({
            id: row.id,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            content: row.content,
            type: row.type,
            timestamp: row.timestamp
        }));

        console.log(`📬 Loading ${messages.length} messages for ${userId1} <-> ${userId2}`);

        res.json({ success: true, messages });
    } catch (error) {
        console.error('❌ Error getting messages:', error);
        res.status(500).json({ success: false, message: 'Failed to get messages' });
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const { senderId, receiverId, content, type } = req.body;
        
        if (!senderId || !receiverId || !content || !type) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            senderId,
            receiverId,
            content,
            type,
            timestamp: Date.now()
        };
        
        await pool.query(
            'INSERT INTO messages (id, sender_id, receiver_id, content, type, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
            [message.id, message.senderId, message.receiverId, message.content, message.type, message.timestamp]
        );
        
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

app.get('/api/status/:userId', (req, res) => {
    const { userId } = req.params;
    const isOnline = activeUsers.has(userId);
    res.json({
        success: true,
        userId: userId,
        isOnline: isOnline
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        database: 'PostgreSQL',
        activeUsers: activeUsers.size,
        timestamp: Date.now()
    });
});

// Start server
async function startServer() {
    await initializeDatabase();
    
    server.listen(PORT, HOST, () => {
        console.log('\n' + '='.repeat(60));
        console.log('  🚀 CHATTY MIRROR SERVER - POSTGRESQL');
        console.log('='.repeat(60));
        console.log(`  ✅ Server: http://localhost:${PORT}`);
        console.log(`  ✅ Database: PostgreSQL`);
        console.log(`  ✅ Host: ${HOST}`);
        console.log('='.repeat(60));
        console.log('  📊 All data persists in database');
        console.log('  🔍 Users, messages, and friends stored permanently');
        console.log('='.repeat(60) + '\n');
    });
}

startServer();

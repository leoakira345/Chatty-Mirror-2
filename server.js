const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

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
    pingInterval: 25000,
    maxHttpBufferSize: 10e6 // 10MB for large audio files
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

// YouTube API Key
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyC1xGrajAjGg67nL6QjCAJn5ZXSg8mPtTg';

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        console.log('✅ Data directory ready');
    } catch (error) {
        console.error('❌ Error creating data directory:', error);
    }
}

// Helper function to read JSON file with better error handling
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
            console.error(`   File size: ${data.length} bytes`);
            console.error(`   First 100 chars: ${data.substring(0, 100)}`);
            
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

// Helper function to write JSON file with validation
async function writeJSON(filename, data) {
    try {
        const filePath = path.join(DATA_DIR, filename);
        
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
        
        await fs.writeFile(filePath, jsonString, 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error writing JSON:', error);
        return false;
    }
}

// Helper function to parse YouTube duration format (PT4M13S -> seconds)
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
        
        socket.broadcast.emit('user_status', { userId, status: 'online' });
    });

    // User sends message (handles text, images, videos, files, AND audio/karaoke)
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
        
        if (type === 'image' || type === 'video' || type === 'file' || type === 'audio') {
            try {
                const parsed = JSON.parse(content);
                console.log('  - File name:', parsed.name);
                console.log('  - File type:', parsed.type);
                console.log('  - File size:', parsed.size, 'bytes');
                console.log('  - Data length:', parsed.data ? parsed.data.length : 0);
                
                if (type === 'audio') {
                    console.log('🎤 KARAOKE/AUDIO MESSAGE DETECTED');
                }
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
            
            // Create complete message object WITH STATUS
            const message = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                senderId: senderId,
                receiverId: receiverId,
                content: content,
                type: type,
                timestamp: Date.now(),
                status: 'sent',
                seenAt: null
            };
            
            console.log('📝 Message ID:', message.id);
            
            // Load existing messages
            let messagesData = await readJSON(`messages_${chatId}.json`);
            console.log('📂 Existing messages:', messagesData ? messagesData.messages?.length : 0);
            
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
            
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', message);
                console.log('✅ Message emitted to receiver socket:', receiverSocketId);
                
                if (type === 'audio') {
                    console.log('🎤 Karaoke recording delivered to receiver');
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

    // Mark message as seen
    socket.on('mark_seen', async (data) => {
        const { messageId, userId } = data;
        
        console.log(`👁️  Mark seen request:`, { messageId, userId });
        
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
        message: 'Chatty Mirror Server is running',
        version: '2.4-karaoke-iframe-method',
        activeUsers: activeUsers.size,
        features: [
            'Text messaging',
            'Image sharing',
            'Video sharing',
            'File sharing',
            'Audio messages',
            'Karaoke recordings with YouTube Iframe API',
            'Real-time typing indicators',
            'Message seen status',
            'Online/offline status'
        ]
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
        
        await writeJSON(`user_${userId}.json`, user);
        console.log(`👤 New user created: ${userId}`);
        
        res.json({ success: true, user: user });
    } catch (error) {
        console.error('❌ Error initializing user:', error);
        res.status(500).json({ success: false, message: 'Failed to initialize user' });
    }
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!/^\d{4}$/.test(userId)) {
            return res.json({ success: false, message: 'Invalid user ID' });
        }
        
        const user = await readJSON(`user_${userId}.json`);
        
        if (user) {
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    profilePhoto: user.profilePhoto || null,
                    createdAt: user.createdAt
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

        const user = await readJSON(`user_${userId}.json`);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }

        if (username) {
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
            res.json({ success: true, user: user });
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
        const friendsData = await readJSON(`friends_${userId}.json`);
        
        if (!friendsData || !friendsData.friendIds) {
            return res.json({ success: true, friends: [] });
        }
        
        const friends = [];
        for (const friendId of friendsData.friendIds) {
            const friend = await readJSON(`user_${friendId}.json`);
            if (friend) {
                friends.push({
                    id: friend.id,
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
        
        if (!userId || !friendId) {
            return res.json({ success: false, message: 'Missing userId or friendId' });
        }
        
        const friendUser = await readJSON(`user_${friendId}.json`);
        if (!friendUser) {
            return res.json({ success: false, message: 'User not found' });
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
        timestamp: Date.now(),
        version: '2.4-karaoke-iframe-method'
    });
});

// Fix corrupted messages file
app.post('/api/messages/fix/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const filename = `messages_${chatId}.json`;
        
        const filePath = path.join(DATA_DIR, filename);
        const data = await fs.readFile(filePath, 'utf8');
        
        try {
            JSON.parse(data);
            res.json({ success: true, message: 'File is valid' });
        } catch (parseError) {
            const backupPath = path.join(DATA_DIR, `${filename}.backup.${Date.now()}`);
            await fs.writeFile(backupPath, data, 'utf8');
            
            await writeJSON(filename, { messages: [] });
            
            res.json({ 
                success: true, 
                message: 'Corrupted file fixed',
                backup: backupPath
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get karaoke recordings for a user
app.get('/api/karaoke/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
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

// YouTube Search Proxy - FIXED VERSION WITH EMBEDDABLE FILTER
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

        // Check if API key is set
        if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
            console.error('❌ YouTube API key not configured');
            return res.json({
                success: false,
                message: 'YouTube API key not configured. Please add your API key to server.js',
                results: []
            });
        }

        try {
            // Step 1: Search for videos with embeddable filter
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

            console.log('🔍 Calling YouTube Data API (Search with embeddable filter)...');
            
            const searchResponse = await axios.get(searchUrl, { params: searchParams });

            if (searchResponse.status === 200 && searchResponse.data.items && searchResponse.data.items.length > 0) {
                const videoIds = searchResponse.data.items.map(item => item.id.videoId).join(',');
                
                const videosUrl = `https://www.googleapis.com/youtube/v3/videos`;
                const videosParams = {
                    part: 'snippet,contentDetails,status',
                    id: videoIds,
                    key: YOUTUBE_API_KEY
                };

                console.log('🔍 Getting video details to verify embeddability...');
                const videosResponse = await axios.get(videosUrl, { params: videosParams });

                const embeddableVideos = videosResponse.data.items.filter(video => 
                    video.status && video.status.embeddable === true
                );

                console.log(`✅ Found ${embeddableVideos.length} embeddable videos out of ${searchResponse.data.items.length} total`);

                if (embeddableVideos.length === 0) {
                    console.log('⚠️ No embeddable videos found after filtering');
                    res.json({
                        success: false,
                        message: 'No embeddable karaoke videos found. Try a different search term.',
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
                            },
                            { 
                                url: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url, 
                                quality: 'high' 
                            }
                        ],
                        embeddable: true
                    }));

                    console.log(`✅ Returning ${results.length} embeddable karaoke videos`);

                    res.json({
                        success: true,
                        results: results,
                        source: 'YouTube Data API v3 (Embeddable Only)',
                        info: 'All videos are verified to be embeddable'
                    });
                }
            } else {
                console.log('❌ No results found in initial search');
                res.json({
                    success: false,
                    message: 'No results found for this search.',
                    results: []
                });
            }
        } catch (apiError) {
            console.error('❌ YouTube API Error:', apiError.response?.data || apiError.message);
            
            if (apiError.response?.status === 403) {
                res.json({
                    success: false,
                    message: 'YouTube API quota exceeded or invalid API key. Please check your API key.',
                    results: []
                });
            } else if (apiError.response?.status === 400) {
                res.json({
                    success: false,
                    message: 'Invalid search query. Please try different search terms.',
                    results: []
                });
            } else {
                res.json({
                    success: false,
                    message: 'Failed to search YouTube. Please try again.',
                    results: []
                });
            }
        }
    } catch (error) {
        console.error('❌ YouTube search error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search YouTube. Please try again.',
            error: error.message
        });
    }
});

async function startServer() {
    await ensureDataDirectory();
    
    server.listen(PORT, HOST, () => {
        console.log('\n' + '='.repeat(60));
        console.log('  🚀 CHATTY MIRROR SERVER');
        console.log('='.repeat(60));
        console.log(`  ✅ Server: http://localhost:${PORT}`);
        console.log(`  ✅ Version: 2.4 (Karaoke Iframe Method)`);
        console.log(`  🎤 Features: Text, Images, Videos, Files, Karaoke`);
        console.log(`  🎵 YouTube: Iframe API for audio capture`);
        console.log(`  🔒 YouTube: Embeddable videos only`);
        console.log('='.repeat(60) + '\n');
    });
}

startServer();


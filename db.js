// db.js - MongoDB Database Module for Chatty Mirror
const mongoose = require('mongoose');

// ==========================================
// MONGODB CONNECTION
// ==========================================
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatty_mirror';
        
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        console.error('⚠️  Retrying in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err);
});

// ==========================================
// SCHEMAS
// ==========================================

// User Schema
const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        index: true
    },
    password: {
        type: String
    },
    profilePhoto: {
        type: String,
        default: null
    },
    isLegacy: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    },
    migratedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Message Schema
const messageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    senderId: {
        type: String,
        required: true,
        index: true
    },
    receiverId: {
        type: String,
        required: true,
        index: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'file', 'audio'],
        default: 'text'
    },
    status: {
        type: String,
        enum: ['sent', 'seen'],
        default: 'sent'
    },
    seenAt: {
        type: Date,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false
});

// Compound index for efficient chat queries
messageSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });
messageSchema.index({ receiverId: 1, status: 1 });

// Friendship Schema
const friendshipSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    friendIds: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure unique userId
friendshipSchema.index({ userId: 1 }, { unique: true });

// ==========================================
// MODELS
// ==========================================
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const Friendship = mongoose.model('Friendship', friendshipSchema);

// ==========================================
// DATABASE OPERATIONS
// ==========================================

// User Operations
const userOperations = {
    // Create new user
    async createUser(userData) {
        try {
            const user = new User({
                userId: userData.id,
                username: userData.username,
                email: userData.email || null,
                password: userData.password || null,
                profilePhoto: userData.profilePhoto || null,
                isLegacy: userData.isLegacy || false,
                createdAt: userData.createdAt || Date.now()
            });
            await user.save();
            return user;
        } catch (error) {
            if (error.code === 11000) {
                throw new Error('User ID already exists');
            }
            throw error;
        }
    },

    // Get user by ID
    async getUserById(userId) {
        try {
            return await User.findOne({ userId });
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    },

    // Get user by email
    async getUserByEmail(email) {
        try {
            return await User.findOne({ email: email.toLowerCase() });
        } catch (error) {
            console.error('Error getting user by email:', error);
            return null;
        }
    },

    // Get user by username
    async getUserByUsername(username) {
        try {
            return await User.findOne({ 
                username: { $regex: new RegExp(`^${username}$`, 'i') } 
            });
        } catch (error) {
            console.error('Error getting user by username:', error);
            return null;
        }
    },

    // Update user
    async updateUser(userId, updates) {
        try {
            updates.updatedAt = Date.now();
            return await User.findOneAndUpdate(
                { userId },
                { $set: updates },
                { new: true }
            );
        } catch (error) {
            console.error('Error updating user:', error);
            return null;
        }
    },

    // Check if user exists
    async userExists(userId) {
        try {
            const count = await User.countDocuments({ userId });
            return count > 0;
        } catch (error) {
            console.error('Error checking user existence:', error);
            return false;
        }
    },

    // Get all users (for migration)
    async getAllUsers() {
        try {
            return await User.find({});
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }
};

// Message Operations
const messageOperations = {
    // Save message
    async saveMessage(messageData) {
        try {
            const message = new Message({
                messageId: messageData.id,
                senderId: messageData.senderId,
                receiverId: messageData.receiverId,
                content: messageData.content,
                type: messageData.type,
                status: messageData.status || 'sent',
                seenAt: messageData.seenAt || null,
                timestamp: messageData.timestamp || Date.now()
            });
            await message.save();
            return message;
        } catch (error) {
            if (error.code === 11000) {
                console.warn('Duplicate message ID:', messageData.id);
                return null;
            }
            throw error;
        }
    },

    // Get messages between two users
    async getMessages(userId1, userId2) {
        try {
            return await Message.find({
                $or: [
                    { senderId: userId1, receiverId: userId2 },
                    { senderId: userId2, receiverId: userId1 }
                ]
            }).sort({ timestamp: 1 });
        } catch (error) {
            console.error('Error getting messages:', error);
            return [];
        }
    },

    // Mark message as seen
    async markMessageSeen(messageId, seenAt) {
        try {
            return await Message.findOneAndUpdate(
                { messageId },
                { 
                    $set: { 
                        status: 'seen',
                        seenAt: seenAt || Date.now()
                    }
                },
                { new: true }
            );
        } catch (error) {
            console.error('Error marking message as seen:', error);
            return null;
        }
    },

    // Get undelivered messages for user
    async getUndeliveredMessages(userId) {
        try {
            return await Message.find({
                receiverId: userId,
                status: 'sent'
            }).sort({ timestamp: 1 });
        } catch (error) {
            console.error('Error getting undelivered messages:', error);
            return [];
        }
    },

    // Get karaoke recordings for user
    async getKaraokeRecordings(userId) {
        try {
            return await Message.find({
                $or: [
                    { senderId: userId, type: 'audio' },
                    { receiverId: userId, type: 'audio' }
                ]
            }).sort({ timestamp: -1 });
        } catch (error) {
            console.error('Error getting karaoke recordings:', error);
            return [];
        }
    },

    // Delete old messages (optional cleanup)
    async deleteOldMessages(daysOld = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            const result = await Message.deleteMany({
                timestamp: { $lt: cutoffDate }
            });
            
            return result.deletedCount;
        } catch (error) {
            console.error('Error deleting old messages:', error);
            return 0;
        }
    }
};

// Friendship Operations
const friendshipOperations = {
    // Get user's friends
    async getFriends(userId) {
        try {
            const friendship = await Friendship.findOne({ userId });
            return friendship ? friendship.friendIds : [];
        } catch (error) {
            console.error('Error getting friends:', error);
            return [];
        }
    },

    // Add friend
    async addFriend(userId, friendId) {
        try {
            // Add to user's friend list
            await Friendship.findOneAndUpdate(
                { userId },
                { 
                    $addToSet: { friendIds: friendId },
                    $set: { updatedAt: Date.now() }
                },
                { upsert: true, new: true }
            );

            // Add to friend's friend list
            await Friendship.findOneAndUpdate(
                { userId: friendId },
                { 
                    $addToSet: { friendIds: userId },
                    $set: { updatedAt: Date.now() }
                },
                { upsert: true, new: true }
            );

            return true;
        } catch (error) {
            console.error('Error adding friend:', error);
            return false;
        }
    },

    // Remove friend
    async removeFriend(userId, friendId) {
        try {
            // Remove from user's friend list
            await Friendship.findOneAndUpdate(
                { userId },
                { 
                    $pull: { friendIds: friendId },
                    $set: { updatedAt: Date.now() }
                }
            );

            // Remove from friend's friend list
            await Friendship.findOneAndUpdate(
                { userId: friendId },
                { 
                    $pull: { friendIds: userId },
                    $set: { updatedAt: Date.now() }
                }
            );

            return true;
        } catch (error) {
            console.error('Error removing friend:', error);
            return false;
        }
    },

    // Check if users are friends
    async areFriends(userId, friendId) {
        try {
            const friendship = await Friendship.findOne({ 
                userId,
                friendIds: friendId
            });
            return !!friendship;
        } catch (error) {
            console.error('Error checking friendship:', error);
            return false;
        }
    }
};

// ==========================================
// MIGRATION HELPER (File to MongoDB)
// ==========================================
async function migrateFromFiles(dataDir) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
        console.log('🔄 Starting migration from files to MongoDB...');
        
        const files = await fs.readdir(dataDir);
        
        // Migrate users
        const userFiles = files.filter(f => f.startsWith('user_') && f.endsWith('.json'));
        let userCount = 0;
        
        for (const file of userFiles) {
            try {
                const data = await fs.readFile(path.join(dataDir, file), 'utf8');
                const userData = JSON.parse(data);
                
                const exists = await userOperations.userExists(userData.id);
                if (!exists) {
                    await userOperations.createUser(userData);
                    userCount++;
                }
            } catch (err) {
                console.error(`Error migrating user file ${file}:`, err.message);
            }
        }
        
        console.log(`✅ Migrated ${userCount} users`);
        
        // Migrate friendships
        const friendFiles = files.filter(f => f.startsWith('friends_') && f.endsWith('.json'));
        let friendshipCount = 0;
        
        for (const file of friendFiles) {
            try {
                const data = await fs.readFile(path.join(dataDir, file), 'utf8');
                const friendData = JSON.parse(data);
                const userId = file.replace('friends_', '').replace('.json', '');
                
                if (friendData.friendIds && friendData.friendIds.length > 0) {
                    for (const friendId of friendData.friendIds) {
                        await friendshipOperations.addFriend(userId, friendId);
                        friendshipCount++;
                    }
                }
            } catch (err) {
                console.error(`Error migrating friend file ${file}:`, err.message);
            }
        }
        
        console.log(`✅ Migrated ${friendshipCount} friendships`);
        
        // Migrate messages
        const messageFiles = files.filter(f => f.startsWith('messages_') && f.endsWith('.json'));
        let messageCount = 0;
        
        for (const file of messageFiles) {
            try {
                const data = await fs.readFile(path.join(dataDir, file), 'utf8');
                const messagesData = JSON.parse(data);
                
                if (messagesData.messages && messagesData.messages.length > 0) {
                    for (const msg of messagesData.messages) {
                        try {
                            await messageOperations.saveMessage(msg);
                            messageCount++;
                        } catch (msgErr) {
                            // Skip duplicate messages
                        }
                    }
                }
            } catch (err) {
                console.error(`Error migrating message file ${file}:`, err.message);
            }
        }
        
        console.log(`✅ Migrated ${messageCount} messages`);
        console.log('✅ Migration completed successfully!');
        
        return {
            users: userCount,
            friendships: friendshipCount,
            messages: messageCount
        };
        
    } catch (error) {
        console.error('❌ Migration error:', error);
        throw error;
    }
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
    connectDB,
    User,
    Message,
    Friendship,
    userOperations,
    messageOperations,
    friendshipOperations,
    migrateFromFiles
};
const redis = require('redis');
const crypto = require('crypto');

class RedisStore {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect(url = 'redis://localhost:6379') {
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('Redis: Too many reconnection attempts');
              return new Error('Too many reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis: Connected successfully');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis: Ready to accept commands');
      });

      this.client.on('reconnecting', () => {
        console.log('Redis: Reconnecting...');
      });

      await this.client.connect();
      return true;
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // User Management
  async createUser(username, userData = {}) {
    if (!this.isConnected) return null;
    
    try {
      const userId = crypto.randomBytes(16).toString('hex');
      const user = {
        userId,
        username,
        createdAt: Date.now(),
        customization: null,
        stats: {
          playtime: 0,
          junksDestroyed: 0,
          materialsCollected: 0
        },
        ...userData
      };

      // Store user data
      await this.client.hSet(`user:${userId}`, Object.entries(user).map(([k, v]) => [k, JSON.stringify(v)]).flat());
      
      // Create username -> userId mapping for lookups
      await this.client.set(`username:${username.toLowerCase()}`, userId);
      
      return user;
    } catch (err) {
      console.error('Redis: Error creating user:', err);
      return null;
    }
  }

  async getUserById(userId) {
    if (!this.isConnected) return null;
    
    try {
      const userData = await this.client.hGetAll(`user:${userId}`);
      if (!userData || Object.keys(userData).length === 0) return null;
      
      // Parse JSON fields
      return Object.entries(userData).reduce((acc, [key, value]) => {
        try {
          acc[key] = JSON.parse(value);
        } catch {
          acc[key] = value;
        }
        return acc;
      }, {});
    } catch (err) {
      console.error('Redis: Error getting user:', err);
      return null;
    }
  }

  async getUserByUsername(username) {
    if (!this.isConnected) return null;
    
    try {
      const userId = await this.client.get(`username:${username.toLowerCase()}`);
      if (!userId) return null;
      
      return this.getUserById(userId);
    } catch (err) {
      console.error('Redis: Error getting user by username:', err);
      return null;
    }
  }

  async updateUser(userId, updates) {
    if (!this.isConnected) return false;
    
    try {
      const entries = Object.entries(updates).map(([k, v]) => [k, JSON.stringify(v)]).flat();
      await this.client.hSet(`user:${userId}`, entries);
      return true;
    } catch (err) {
      console.error('Redis: Error updating user:', err);
      return false;
    }
  }

  async updateUserCustomization(userId, customization) {
    return this.updateUser(userId, { customization });
  }

  async updateUserStats(userId, stats) {
    if (!this.isConnected) return false;
    
    try {
      const user = await this.getUserById(userId);
      if (!user) return false;
      
      const updatedStats = { ...user.stats, ...stats };
      return this.updateUser(userId, { stats: updatedStats });
    } catch (err) {
      console.error('Redis: Error updating user stats:', err);
      return false;
    }
  }

  // Session Management
  async createSession(userId, username) {
    if (!this.isConnected) return null;
    
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        userId,
        username,
        createdAt: Date.now()
      };

      // Store session with 24 hour expiry
      await this.client.setEx(`session:${token}`, 86400, JSON.stringify(session));
      
      // Track active sessions for user
      await this.client.sAdd(`user_sessions:${userId}`, token);
      
      return { token, ...session };
    } catch (err) {
      console.error('Redis: Error creating session:', err);
      return null;
    }
  }

  async getSession(token) {
    if (!this.isConnected) return null;
    
    try {
      const sessionData = await this.client.get(`session:${token}`);
      if (!sessionData) return null;
      
      const session = JSON.parse(sessionData);
      
      // Refresh session expiry on access
      await this.client.expire(`session:${token}`, 86400);
      
      return session;
    } catch (err) {
      console.error('Redis: Error getting session:', err);
      return null;
    }
  }

  async deleteSession(token) {
    if (!this.isConnected) return false;
    
    try {
      const session = await this.getSession(token);
      if (session) {
        await this.client.sRem(`user_sessions:${session.userId}`, token);
      }
      
      await this.client.del(`session:${token}`);
      return true;
    } catch (err) {
      console.error('Redis: Error deleting session:', err);
      return false;
    }
  }

  async deleteAllUserSessions(userId) {
    if (!this.isConnected) return false;
    
    try {
      const sessions = await this.client.sMembers(`user_sessions:${userId}`);
      
      if (sessions.length > 0) {
        await this.client.del(sessions.map(token => `session:${token}`));
      }
      
      await this.client.del(`user_sessions:${userId}`);
      return true;
    } catch (err) {
      console.error('Redis: Error deleting user sessions:', err);
      return false;
    }
  }

  // Room/Game State Management
  async saveRoomState(roomId, state) {
    if (!this.isConnected) return false;
    
    try {
      // Store room state with 1 hour expiry (rooms are temporary)
      await this.client.setEx(`room:${roomId}`, 3600, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('Redis: Error saving room state:', err);
      return false;
    }
  }

  async getRoomState(roomId) {
    if (!this.isConnected) return null;
    
    try {
      const stateData = await this.client.get(`room:${roomId}`);
      return stateData ? JSON.parse(stateData) : null;
    } catch (err) {
      console.error('Redis: Error getting room state:', err);
      return null;
    }
  }

  // Leaderboard
  async updateLeaderboard(userId, score, leaderboardKey = 'global') {
    if (!this.isConnected) return false;
    
    try {
      await this.client.zAdd(`leaderboard:${leaderboardKey}`, {
        score: score,
        value: userId
      });
      return true;
    } catch (err) {
      console.error('Redis: Error updating leaderboard:', err);
      return false;
    }
  }

  async getLeaderboard(leaderboardKey = 'global', limit = 10) {
    if (!this.isConnected) return [];
    
    try {
      const results = await this.client.zRangeWithScores(
        `leaderboard:${leaderboardKey}`,
        0,
        limit - 1,
        { REV: true }
      );
      
      // Fetch user details for each entry
      const leaderboard = [];
      for (const entry of results) {
        const user = await this.getUserById(entry.value);
        if (user) {
          leaderboard.push({
            userId: entry.value,
            username: user.username,
            score: entry.score
          });
        }
      }
      
      return leaderboard;
    } catch (err) {
      console.error('Redis: Error getting leaderboard:', err);
      return [];
    }
  }

  // Friend System (for future use)
  async addFriend(userId1, userId2) {
    if (!this.isConnected) return false;
    
    try {
      // Add bidirectional friend relationship
      await this.client.sAdd(`friends:${userId1}`, userId2);
      await this.client.sAdd(`friends:${userId2}`, userId1);
      return true;
    } catch (err) {
      console.error('Redis: Error adding friend:', err);
      return false;
    }
  }

  async getFriends(userId) {
    if (!this.isConnected) return [];
    
    try {
      const friendIds = await this.client.sMembers(`friends:${userId}`);
      const friends = [];
      
      for (const friendId of friendIds) {
        const friend = await this.getUserById(friendId);
        if (friend) {
          friends.push({
            userId: friend.userId,
            username: friend.username,
            online: await this.isUserOnline(friendId)
          });
        }
      }
      
      return friends;
    } catch (err) {
      console.error('Redis: Error getting friends:', err);
      return [];
    }
  }

  async removeFriend(userId1, userId2) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.sRem(`friends:${userId1}`, userId2);
      await this.client.sRem(`friends:${userId2}`, userId1);
      return true;
    } catch (err) {
      console.error('Redis: Error removing friend:', err);
      return false;
    }
  }

  // Online Status
  async setUserOnline(userId, socketId) {
    if (!this.isConnected) return false;
    
    try {
      // Store user as online with 5 minute expiry (requires heartbeat)
      await this.client.setEx(`online:${userId}`, 300, socketId);
      await this.client.sAdd('online_users', userId);
      return true;
    } catch (err) {
      console.error('Redis: Error setting user online:', err);
      return false;
    }
  }

  async setUserOffline(userId) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.del(`online:${userId}`);
      await this.client.sRem('online_users', userId);
      return true;
    } catch (err) {
      console.error('Redis: Error setting user offline:', err);
      return false;
    }
  }

  async isUserOnline(userId) {
    if (!this.isConnected) return false;
    
    try {
      const result = await this.client.exists(`online:${userId}`);
      return result === 1;
    } catch (err) {
      console.error('Redis: Error checking online status:', err);
      return false;
    }
  }

  async getOnlineUsers() {
    if (!this.isConnected) return [];
    
    try {
      return await this.client.sMembers('online_users');
    } catch (err) {
      console.error('Redis: Error getting online users:', err);
      return [];
    }
  }

  async heartbeat(userId) {
    if (!this.isConnected) return false;
    
    try {
      // Refresh online status
      await this.client.expire(`online:${userId}`, 300);
      return true;
    } catch (err) {
      console.error('Redis: Error updating heartbeat:', err);
      return false;
    }
  }
}

module.exports = RedisStore;
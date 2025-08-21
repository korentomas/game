const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store connected players
const rooms = new Map(); // roomId -> Set of player connections
const playerRooms = new Map(); // ws -> roomId

// Simple in-memory user storage (replace with Redis later)
const users = new Map(); // username -> user data
const sessions = new Map(); // token -> session data

class Player {
  constructor(ws, id, username = null) {
    this.ws = ws;
    this.id = id;
    this.username = username;
    this.position = { x: 0, y: 10, z: 0 };
    this.rotation = 0;
    this.customization = null;
  }
}

wss.on('connection', (ws) => {
  // Generate a temporary ID - will be replaced with userId if authenticated
  let playerId = Math.random().toString(36).substr(2, 9);
  ws.playerId = playerId; // Store on ws object so it persists
  console.log(`Connection ${playerId} established`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'auth-login': {
          handleLogin(ws, data.username);
          break;
        }
        
        case 'auth-validate': {
          handleValidateSession(ws, data.token);
          break;
        }
        
        case 'join-room': {
          const roomId = data.roomId || 'default';
          let customization = data.customization || null;
          
          // If a token is provided, validate it and get the username and saved customization
          if (data.token) {
            const session = sessions.get(data.token);
            if (session) {
              // Valid session - use userId as playerId for consistency
              ws.username = session.username;
              ws.userId = session.userId;
              ws.playerId = session.userId; // Use userId as playerId so refreshes keep same ID
              playerId = session.userId; // Update local variable too
              
              // Load user's saved customization
              const user = users.get(session.userId);
              if (user && user.customization) {
                customization = user.customization;
                console.log(`Loaded saved customization for ${ws.username}`);
              }
            }
          }
          
          joinRoom(ws, playerId, roomId, customization);
          break;
        }
        
        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          // Forward WebRTC signaling to specific player or all in room
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              if (data.to) {
                // Send to specific player
                const targetPlayer = Array.from(room).find(p => p.id === data.to);
                if (targetPlayer && targetPlayer.ws.readyState === WebSocket.OPEN) {
                  targetPlayer.ws.send(JSON.stringify({
                    type: data.type,
                    data: data.data,
                    from: ws.playerId
                  }));
                }
              } else {
                // Broadcast to all others (fallback)
                room.forEach(player => {
                  if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                      type: data.type,
                      data: data.data,
                      from: ws.playerId
                    }));
                  }
                });
              }
            }
          }
          break;
        }
        
        case 'chat-message': {
          // Broadcast chat message to all players in room
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              // Find the sender to get their username
              const sender = Array.from(room).find(p => p.ws === ws);
              const senderName = sender?.username || `Player-${playerId.substr(0, 6)}`;
              
              room.forEach(player => {
                if (player.ws.readyState === WebSocket.OPEN) {
                  player.ws.send(JSON.stringify({
                    type: 'chat-message',
                    playerId: ws.playerId,
                    playerName: senderName,
                    text: data.text
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'shoot': {
          // Broadcast shoot event to other players
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              room.forEach(other => {
                if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(JSON.stringify({
                    type: 'shoot',
                    playerId: ws.playerId,
                    position: data.position,
                    heading: data.heading
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'junk-collected': {
          // Broadcast junk collection to other players
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              room.forEach(other => {
                if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(JSON.stringify({
                    type: 'junk-collected',
                    playerId: ws.playerId,
                    chunkKey: data.chunkKey,
                    junkIndex: data.junkIndex
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'material-spawn': {
          // Broadcast material spawn to all players
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              room.forEach(other => {
                if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(JSON.stringify({
                    type: 'material-spawn',
                    id: data.id,
                    position: data.position,
                    materialType: data.materialType,
                    spawnerId: ws.playerId
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'material-collect': {
          // Broadcast material collection to all players
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              room.forEach(other => {
                if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(JSON.stringify({
                    type: 'material-collect',
                    id: data.id,
                    collectorId: data.collectorId || ws.playerId
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'junk-spawn': {
          // Broadcast junk spawn to all players
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              room.forEach(other => {
                if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(JSON.stringify({
                    type: 'junk-spawn',
                    chunkKey: data.chunkKey,
                    junkData: data.junkData,
                    spawnerId: ws.playerId
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'junk-destroy': {
          // Broadcast junk destruction to all players
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              room.forEach(other => {
                if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(JSON.stringify({
                    type: 'junk-destroy',
                    junkId: data.junkId,
                    destroyerId: ws.playerId
                  }));
                }
              });
            }
          }
          break;
        }
        
        case 'customization-update': {
          // Handle customization update from authenticated user
          const roomId = playerRooms.get(ws);
          if (roomId && ws.userId) {
            const room = rooms.get(roomId);
            if (room) {
              // Update user's stored customization
              const user = users.get(ws.userId);
              if (user) {
                user.customization = data.customization;
                console.log(`Updated customization for user ${ws.username}`);
              }
              
              // Update player in room
              const player = Array.from(room).find(p => p.ws === ws);
              if (player) {
                player.customization = data.customization;
                
                // Broadcast to all other players in room
                room.forEach(other => {
                  if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                    other.ws.send(JSON.stringify({
                      type: 'player-customization-update',
                      playerId: ws.playerId,
                      customization: data.customization
                    }));
                  }
                });
              }
            }
          }
          break;
        }
        
        case 'position-update': {
          // Fallback position sync (before WebRTC is established)
          const roomId = playerRooms.get(ws);
          if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
              const player = Array.from(room).find(p => p.ws === ws);
              if (player) {
                player.position = data.position;
                player.rotation = data.rotation;
                
                // Broadcast to others in room
                room.forEach(other => {
                  if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
                    other.ws.send(JSON.stringify({
                      type: 'player-update',
                      playerId: ws.playerId,
                      position: data.position,
                      rotation: data.rotation
                    }));
                  }
                });
              }
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`Player ${ws.playerId} disconnected`);
    leaveRoom(ws, ws.playerId);
  });

  // Send player their ID
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId: ws.playerId
  }));
});

function joinRoom(ws, playerId, roomId, customization = null) {
  // Leave current room if any
  leaveRoom(ws, playerId);
  
  // Create room if doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  
  const room = rooms.get(roomId);
  
  // Check if this player ID is already in the room (reconnection)
  const existingPlayer = Array.from(room).find(p => p.id === playerId);
  const wasReconnection = !!existingPlayer; // Store this for later use
  if (existingPlayer) {
    console.log(`Found stale connection for player ${playerId}, cleaning up...`);
    
    // Notify all other players that this player left (forces cleanup)
    room.forEach(other => {
      if (other.ws !== existingPlayer.ws && other.ws.readyState === WebSocket.OPEN) {
        other.ws.send(JSON.stringify({
          type: 'player-left',
          playerId: playerId
        }));
      }
    });
    
    // Remove the old connection
    room.delete(existingPlayer);
    playerRooms.delete(existingPlayer.ws);
    
    // Close the stale websocket if it's still open
    if (existingPlayer.ws.readyState === WebSocket.OPEN || 
        existingPlayer.ws.readyState === WebSocket.CONNECTING) {
      existingPlayer.ws.close();
    }
    
    console.log(`Cleaned up stale connection for player ${playerId}`);
  }
  // Get username from session if available
  const username = ws.username || null;
  const player = new Player(ws, playerId, username);
  player.customization = customization;
  room.add(player);
  playerRooms.set(ws, roomId);
  
  // Notify player of room join with their actual player ID and customization
  const joinMessage = {
    type: 'room-joined',
    roomId: roomId,
    playerId: player.id  // Send the actual player ID being used
  };
  
  // Include customization if they have one saved
  if (player.customization) {
    joinMessage.customization = player.customization;
  }
  
  ws.send(JSON.stringify(joinMessage));
  
  // Small delay before sending existing players to allow client sync overlay to show
  setTimeout(() => {
    // Notify player of existing players
    const otherPlayers = Array.from(room)
    .filter(p => p.ws !== ws)
    .map(p => ({
      id: p.id,
      username: p.username,
      position: p.position,
      rotation: p.rotation,
      customization: p.customization
    }));
    
    if (otherPlayers.length > 0) {
      ws.send(JSON.stringify({
        type: 'existing-players',
        players: otherPlayers
      }));
    }
  }, 200); // 200ms delay for sync overlay
  
  // Notify others of new player (with small delay if it was a reconnection)
  const notifyDelay = wasReconnection ? 100 : 0; // 100ms delay if reconnecting
  setTimeout(() => {
    room.forEach(other => {
      if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
        other.ws.send(JSON.stringify({
          type: 'player-joined',
          playerId: player.id,
          username: player.username,
          position: player.position,
          rotation: player.rotation,
          customization: player.customization
        }));
      }
    });
  }, notifyDelay);
  
  console.log(`Player ${playerId} joined room ${roomId}. Room now has ${room.size} players`);
}

function leaveRoom(ws, playerId) {
  const roomId = playerRooms.get(ws);
  if (!roomId) return;
  
  const room = rooms.get(roomId);
  if (!room) return;
  
  // Remove player from room
  const player = Array.from(room).find(p => p.ws === ws);
  if (player) {
    room.delete(player);
  }
  playerRooms.delete(ws);
  
  // Notify others
  room.forEach(other => {
    if (other.ws.readyState === WebSocket.OPEN) {
      other.ws.send(JSON.stringify({
        type: 'player-left',
        playerId: player.id
      }));
    }
  });
  
  // Clean up empty room
  if (room.size === 0) {
    rooms.delete(roomId);
  }
  
  console.log(`Player ${playerId} left room ${roomId}`);
}

// Authentication functions
function handleLogin(ws, username) {
  // Validate username
  if (!username || username.length < 3 || username.length > 20) {
    ws.send(JSON.stringify({
      type: 'auth-error',
      error: 'Invalid username'
    }));
    return;
  }
  
  // Check if username is already taken (case-insensitive)
  const lowerUsername = username.toLowerCase();
  const existingUser = Array.from(users.values()).find(
    u => u.username.toLowerCase() === lowerUsername
  );
  
  if (existingUser) {
    ws.send(JSON.stringify({
      type: 'auth-error',
      error: 'Username already taken'
    }));
    return;
  }
  
  // Create new user
  const userId = crypto.randomBytes(16).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  
  const userData = {
    userId: userId,
    username: username,
    createdAt: Date.now(),
    customization: null // Will store ship customization here
  };
  
  users.set(userId, userData);
  sessions.set(token, {
    userId: userId,
    username: username,
    createdAt: Date.now()
  });
  
  // Store username on the websocket for later use
  ws.username = username;
  ws.userId = userId;
  
  console.log(`User ${username} (${userId}) logged in`);
  
  ws.send(JSON.stringify({
    type: 'auth-success',
    username: username,
    userId: userId,
    token: token
  }));
}

function handleValidateSession(ws, token) {
  const session = sessions.get(token);
  
  if (session) {
    // Check if session is still valid (24 hours)
    const age = Date.now() - session.createdAt;
    if (age < 24 * 60 * 60 * 1000) {
      ws.send(JSON.stringify({
        type: 'auth-valid',
        username: session.username,
        userId: session.userId
      }));
      
      // Store username on the websocket
      ws.username = session.username;
      ws.userId = session.userId;
      return;
    } else {
      // Session expired
      sessions.delete(token);
    }
  }
  
  ws.send(JSON.stringify({
    type: 'auth-invalid'
  }));
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Store connected players
const rooms = new Map(); // roomId -> Set of player connections
const playerRooms = new Map(); // ws -> roomId

class Player {
  constructor(ws, id) {
    this.ws = ws;
    this.id = id;
    this.position = { x: 0, y: 10, z: 0 };
    this.rotation = 0;
  }
}

wss.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substr(2, 9);
  console.log(`Player ${playerId} connected`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join-room': {
          const roomId = data.roomId || 'default';
          joinRoom(ws, playerId, roomId);
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
                    from: playerId
                  }));
                }
              } else {
                // Broadcast to all others (fallback)
                room.forEach(player => {
                  if (player.ws !== ws && player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                      type: data.type,
                      data: data.data,
                      from: playerId
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
              room.forEach(player => {
                if (player.ws.readyState === WebSocket.OPEN) {
                  player.ws.send(JSON.stringify({
                    type: 'chat-message',
                    playerId: playerId,
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
                    playerId: playerId,
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
                    playerId: playerId,
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
                    spawnerId: playerId
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
                    collectorId: data.collectorId || playerId
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
                    spawnerId: playerId
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
                    destroyerId: playerId
                  }));
                }
              });
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
                      playerId: playerId,
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
    console.log(`Player ${playerId} disconnected`);
    leaveRoom(ws, playerId);
  });

  // Send player their ID
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId: playerId
  }));
});

function joinRoom(ws, playerId, roomId) {
  // Leave current room if any
  leaveRoom(ws, playerId);
  
  // Create room if doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  
  const room = rooms.get(roomId);
  const player = new Player(ws, playerId);
  room.add(player);
  playerRooms.set(ws, roomId);
  
  // Notify player of room join
  ws.send(JSON.stringify({
    type: 'room-joined',
    roomId: roomId,
    playerId: playerId
  }));
  
  // Notify player of existing players
  const otherPlayers = Array.from(room)
    .filter(p => p.ws !== ws)
    .map(p => ({
      id: p.id,
      position: p.position,
      rotation: p.rotation
    }));
    
  if (otherPlayers.length > 0) {
    ws.send(JSON.stringify({
      type: 'existing-players',
      players: otherPlayers
    }));
  }
  
  // Notify others of new player
  room.forEach(other => {
    if (other.ws !== ws && other.ws.readyState === WebSocket.OPEN) {
      other.ws.send(JSON.stringify({
        type: 'player-joined',
        playerId: playerId,
        position: player.position,
        rotation: player.rotation
      }));
    }
  });
  
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
        playerId: playerId
      }));
    }
  });
  
  // Clean up empty room
  if (room.size === 0) {
    rooms.delete(roomId);
  }
  
  console.log(`Player ${playerId} left room ${roomId}`);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
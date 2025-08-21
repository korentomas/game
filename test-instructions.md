# Multiplayer Test Instructions

## What's Working:
✅ **Player Movement Sync** - Both players see each other move in real-time
✅ **WebRTC P2P Connection** - Ultra-low latency position updates  
✅ **Deterministic World** - Same terrain generation from seed
✅ **Deterministic Junk Generation** - Same collectibles spawn in same positions with identical appearance (colors, shapes, lights)

## Known Issues:
⚠️ **Junk Collection Not Synced** - When one player collects junk, the other doesn't see it disappear (no collision detection implemented yet)
⚠️ **No Projectiles Yet** - Shooting not implemented

## Testing:
1. Start server: `npm run server` (already running on port 3001)
2. Start dev server: `npm run dev` (already running on port 5173)
3. Open two tabs:
   - Tab 1: http://localhost:5173/?room=test
   - Tab 2: http://localhost:5173/?room=test
   
Or visit http://localhost:5173 and you'll be assigned a random room.

Both players in the same room will:
- See the same world (room name determines the world seed)
- See the same terrain and junk positions
- See each other as red ships
- Move independently with real-time sync

## Technical Details:
- Each room has its own deterministic world based on the room name
- Junk spawning uses seeded RNG: `createSeededRng(\`junk_${cx}_${cz}\`)`
- This ensures all clients in the same room see identical worlds
- Position sync happens at 20Hz over WebRTC DataChannel
- WebSocket used for initial signaling and fallback

## Next Steps:
- Add junk collision detection
- Sync collection events
- Add projectile system
- Implement lag compensation
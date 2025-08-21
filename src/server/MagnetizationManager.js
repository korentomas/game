// Server-side magnetization physics manager
// Handles authoritative physics for magnetized junk/materials

const PHYSICS_TIMESTEP = 1000 / 60; // Fixed 60Hz physics timestep
const MAGNETIZATION_RANGE = 15; // Maximum magnetization range
const MAGNETIZATION_FORCE = 12; // Base attraction force
const MAGNETIZATION_SPEED = 28; // Maximum speed toward target

class MagnetizationManager {
  constructor() {
    // Map of junkId -> magnetization state
    this.magnetizedObjects = new Map();
    
    // Track physics simulation
    this.lastPhysicsUpdate = Date.now();
    this.accumulator = 0;
  }
  
  // Start magnetizing objects for a player
  startMagnetization(playerId, junkIds, playerPosition) {
    const now = Date.now();
    
    for (const junkId of junkIds) {
      // Check if already magnetized by another player
      const existing = this.magnetizedObjects.get(junkId);
      if (existing) {
        // First-come-first-served rule
        console.log(`Junk ${junkId} already magnetized by ${existing.playerId}`);
        continue;
      }
      
      this.magnetizedObjects.set(junkId, {
        junkId,
        playerId,
        startTime: now,
        targetPosition: { ...playerPosition },
        currentPosition: null, // Will be set from entity sync
        velocity: { x: 0, y: 0, z: 0 },
        collected: false
      });
    }
    
    return Array.from(this.magnetizedObjects.values())
      .filter(m => m.playerId === playerId)
      .map(m => m.junkId);
  }
  
  // Stop magnetizing objects for a player
  stopMagnetization(playerId) {
    const stopped = [];
    
    for (const [junkId, state] of this.magnetizedObjects.entries()) {
      if (state.playerId === playerId) {
        this.magnetizedObjects.delete(junkId);
        stopped.push(junkId);
      }
    }
    
    return stopped;
  }
  
  // Update target position for magnetized objects
  updatePlayerPosition(playerId, position) {
    for (const state of this.magnetizedObjects.values()) {
      if (state.playerId === playerId) {
        state.targetPosition = { ...position };
      }
    }
  }
  
  // Update current position of junk (from entity sync)
  updateJunkPosition(junkId, position) {
    const state = this.magnetizedObjects.get(junkId);
    if (state && !state.currentPosition) {
      // Initialize position on first update
      state.currentPosition = { ...position };
    }
  }
  
  // Fixed timestep physics update
  update(currentTime) {
    if (!currentTime) currentTime = Date.now();
    
    const deltaTime = currentTime - this.lastPhysicsUpdate;
    this.lastPhysicsUpdate = currentTime;
    this.accumulator += deltaTime;
    
    const updates = [];
    
    // Fixed timestep physics simulation
    while (this.accumulator >= PHYSICS_TIMESTEP) {
      this.accumulator -= PHYSICS_TIMESTEP;
      const dt = PHYSICS_TIMESTEP / 1000; // Convert to seconds
      
      for (const [junkId, state] of this.magnetizedObjects.entries()) {
        if (!state.currentPosition) continue;
        
        // Calculate direction to target
        const dx = state.targetPosition.x - state.currentPosition.x;
        const dy = state.targetPosition.y - state.currentPosition.y;
        const dz = state.targetPosition.z - state.currentPosition.z;
        
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Check if collected (very close to target)
        if (distance < 0.5) {
          state.collected = true;
          updates.push({
            junkId,
            collected: true,
            playerId: state.playerId
          });
          continue;
        }
        
        // Check if out of range
        if (distance > MAGNETIZATION_RANGE) {
          this.magnetizedObjects.delete(junkId);
          updates.push({
            junkId,
            released: true
          });
          continue;
        }
        
        // Apply magnetization physics
        const elapsed = (currentTime - state.startTime) / 1000;
        
        // Increase force over time for smooth acceleration
        const force = MAGNETIZATION_FORCE * (1 + elapsed * 2);
        const maxSpeed = MAGNETIZATION_SPEED * (1 + elapsed);
        
        // Normalize direction
        const dirX = dx / distance;
        const dirY = dy / distance;
        const dirZ = dz / distance;
        
        // Apply acceleration (force / mass, assuming mass = 1)
        state.velocity.x += dirX * force * dt;
        state.velocity.y += dirY * force * dt;
        state.velocity.z += dirZ * force * dt;
        
        // Clamp to max speed
        const speed = Math.sqrt(
          state.velocity.x * state.velocity.x +
          state.velocity.y * state.velocity.y +
          state.velocity.z * state.velocity.z
        );
        
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          state.velocity.x *= scale;
          state.velocity.y *= scale;
          state.velocity.z *= scale;
        }
        
        // Apply damping for smoother movement
        const damping = 0.95;
        state.velocity.x *= damping;
        state.velocity.y *= damping;
        state.velocity.z *= damping;
        
        // Update position
        state.currentPosition.x += state.velocity.x * dt;
        state.currentPosition.y += state.velocity.y * dt;
        state.currentPosition.z += state.velocity.z * dt;
        
        updates.push({
          junkId,
          position: { ...state.currentPosition },
          velocity: { ...state.velocity },
          magnetizingPlayerId: state.playerId
        });
      }
    }
    
    // Remove collected objects
    for (const update of updates) {
      if (update.collected) {
        this.magnetizedObjects.delete(update.junkId);
      }
    }
    
    return updates;
  }
  
  // Get current state of magnetized objects
  getMagnetizedObjects() {
    return Array.from(this.magnetizedObjects.values());
  }
  
  // Check if an object is being magnetized
  isMagnetized(junkId) {
    return this.magnetizedObjects.has(junkId);
  }
  
  // Get magnetization state for a specific object
  getMagnetizationState(junkId) {
    return this.magnetizedObjects.get(junkId);
  }
  
  // Clear all magnetization for a player (on disconnect)
  clearPlayer(playerId) {
    return this.stopMagnetization(playerId);
  }
}

module.exports = MagnetizationManager;
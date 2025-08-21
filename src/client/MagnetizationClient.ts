import * as THREE from 'three';
import { SnapshotBuffer } from '../networking/SnapshotBuffer';

interface MagnetizedJunk {
  junkId: string;
  magnetizingPlayerId: string;
  snapshotBuffer: SnapshotBuffer;
  lastUpdate: number;
  collected: boolean;
}

export class MagnetizationClient {
  private magnetizedJunk: Map<string, MagnetizedJunk> = new Map();
  private localPlayerId: string = '';
  
  // Callbacks
  private onJunkMagnetized?: (junkId: string, playerId: string) => void;
  private onJunkReleased?: (junkId: string) => void;
  private onJunkPositionUpdate?: (junkId: string, position: THREE.Vector3, velocity: THREE.Vector3) => void;
  private onJunkCollected?: (junkId: string, collectorId: string) => void;
  
  constructor(localPlayerId: string) {
    this.localPlayerId = localPlayerId;
  }
  
  setCallbacks(callbacks: {
    onJunkMagnetized?: (junkId: string, playerId: string) => void;
    onJunkReleased?: (junkId: string) => void;
    onJunkPositionUpdate?: (junkId: string, position: THREE.Vector3, velocity: THREE.Vector3) => void;
    onJunkCollected?: (junkId: string, collectorId: string) => void;
  }) {
    this.onJunkMagnetized = callbacks.onJunkMagnetized;
    this.onJunkReleased = callbacks.onJunkReleased;
    this.onJunkPositionUpdate = callbacks.onJunkPositionUpdate;
    this.onJunkCollected = callbacks.onJunkCollected;
  }
  
  // Handle magnetization start notification from server
  handleMagnetizeStarted(playerId: string, junkIds: string[]) {
    for (const junkId of junkIds) {
      if (!this.magnetizedJunk.has(junkId)) {
        const magnetized: MagnetizedJunk = {
          junkId,
          magnetizingPlayerId: playerId,
          snapshotBuffer: new SnapshotBuffer(100), // 100ms buffer for smooth interpolation
          lastUpdate: Date.now(),
          collected: false
        };
        
        this.magnetizedJunk.set(junkId, magnetized);
        
        if (this.onJunkMagnetized) {
          this.onJunkMagnetized(junkId, playerId);
        }
      }
    }
  }
  
  // Handle magnetization stop notification from server
  handleMagnetizeStopped(playerId: string, junkIds: string[]) {
    for (const junkId of junkIds) {
      const magnetized = this.magnetizedJunk.get(junkId);
      if (magnetized && magnetized.magnetizingPlayerId === playerId) {
        this.magnetizedJunk.delete(junkId);
        
        if (this.onJunkReleased) {
          this.onJunkReleased(junkId);
        }
      }
    }
  }
  
  // Handle physics updates from server
  handlePhysicsUpdate(updates: any[]) {
    const now = Date.now();
    
    for (const update of updates) {
      if (update.collected) {
        // Handle collection
        this.handleCollection(update.junkId, update.playerId);
        continue;
      }
      
      if (update.released) {
        // Handle release
        const magnetized = this.magnetizedJunk.get(update.junkId);
        if (magnetized) {
          this.magnetizedJunk.delete(update.junkId);
          if (this.onJunkReleased) {
            this.onJunkReleased(update.junkId);
          }
        }
        continue;
      }
      
      // Normal position update
      let magnetized = this.magnetizedJunk.get(update.junkId);
      
      // If not tracked yet but has update, add it
      if (!magnetized && update.magnetizingPlayerId) {
        magnetized = {
          junkId: update.junkId,
          magnetizingPlayerId: update.magnetizingPlayerId,
          snapshotBuffer: new SnapshotBuffer(100),
          lastUpdate: now,
          collected: false
        };
        this.magnetizedJunk.set(update.junkId, magnetized);
      }
      
      if (magnetized) {
        // Add snapshot for interpolation
        const snapshot = {
          timestamp: now,
          position: new THREE.Vector3(
            update.position.x,
            update.position.y,
            update.position.z
          ),
          rotation: 0, // Junk doesn't need rotation
          velocity: new THREE.Vector3(
            update.velocity?.x || 0,
            update.velocity?.y || 0,
            update.velocity?.z || 0
          ),
          isThrusting: false
        };
        
        magnetized.snapshotBuffer.addSnapshot(snapshot);
        magnetized.lastUpdate = now;
      }
    }
  }
  
  // Handle junk collection
  handleCollection(junkId: string, collectorId: string) {
    const magnetized = this.magnetizedJunk.get(junkId);
    if (magnetized) {
      magnetized.collected = true;
      this.magnetizedJunk.delete(junkId);
    }
    
    if (this.onJunkCollected) {
      this.onJunkCollected(junkId, collectorId);
    }
  }
  
  // Update interpolation for all magnetized junk
  update(dt: number) {
    const now = Date.now();
    
    // Clean up old entries
    const toRemove: string[] = [];
    
    this.magnetizedJunk.forEach((magnetized, junkId) => {
      // Remove if too old (no updates for 2 seconds)
      if (now - magnetized.lastUpdate > 2000) {
        toRemove.push(junkId);
        return;
      }
      
      // Get interpolated state
      const interpolatedState = magnetized.snapshotBuffer.getInterpolatedState(now);
      
      if (interpolatedState && this.onJunkPositionUpdate) {
        this.onJunkPositionUpdate(
          junkId,
          interpolatedState.position,
          interpolatedState.velocity
        );
      }
    });
    
    // Remove old entries
    for (const junkId of toRemove) {
      this.magnetizedJunk.delete(junkId);
      if (this.onJunkReleased) {
        this.onJunkReleased(junkId);
      }
    }
  }
  
  // Check if junk is being magnetized
  isMagnetized(junkId: string): boolean {
    return this.magnetizedJunk.has(junkId);
  }
  
  // Check if junk is being magnetized by local player
  isLocallyMagnetized(junkId: string): boolean {
    const magnetized = this.magnetizedJunk.get(junkId);
    return magnetized ? magnetized.magnetizingPlayerId === this.localPlayerId : false;
  }
  
  // Get all junk IDs being magnetized
  getMagnetizedJunkIds(): string[] {
    return Array.from(this.magnetizedJunk.keys());
  }
  
  // Clear all magnetization state
  clear() {
    this.magnetizedJunk.clear();
  }
}
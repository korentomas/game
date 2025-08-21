import * as THREE from 'three';

export interface Snapshot {
  timestamp: number;
  position: THREE.Vector3;
  rotation: number;
  velocity: THREE.Vector3;
  isThrusting: boolean;
  sequence?: number;
}

export class SnapshotBuffer {
  private buffer: Snapshot[] = [];
  private maxBufferSize: number = 10;
  private bufferDelay: number = 100; // 100ms delay for interpolation
  private lastInterpolatedPos: THREE.Vector3 = new THREE.Vector3();
  private lastInterpolatedRot: number = 0;
  
  constructor(bufferDelay: number = 100) {
    this.bufferDelay = bufferDelay;
  }
  
  addSnapshot(snapshot: Snapshot) {
    // Insert snapshot in chronological order
    const insertIndex = this.buffer.findIndex(s => s.timestamp > snapshot.timestamp);
    
    if (insertIndex === -1) {
      this.buffer.push(snapshot);
    } else {
      this.buffer.splice(insertIndex, 0, snapshot);
    }
    
    // Keep buffer size manageable
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }
  
  getInterpolatedState(currentTime: number): {
    position: THREE.Vector3;
    rotation: number;
    velocity: THREE.Vector3;
    isThrusting: boolean;
  } | null {
    const targetTime = currentTime - this.bufferDelay;
    
    // Find the two snapshots to interpolate between
    let snapshotA: Snapshot | null = null;
    let snapshotB: Snapshot | null = null;
    
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].timestamp <= targetTime && this.buffer[i + 1].timestamp >= targetTime) {
        snapshotA = this.buffer[i];
        snapshotB = this.buffer[i + 1];
        break;
      }
    }
    
    // Clean up old snapshots
    this.buffer = this.buffer.filter(s => s.timestamp > currentTime - 1000);
    
    if (snapshotA && snapshotB) {
      // Interpolate between snapshots
      const timeDiff = snapshotB.timestamp - snapshotA.timestamp;
      const factor = timeDiff > 0 ? (targetTime - snapshotA.timestamp) / timeDiff : 0;
      
      // Smooth factor with easing function
      const smoothFactor = this.smoothstep(0, 1, factor);
      
      const interpolatedPos = snapshotA.position.clone().lerp(snapshotB.position, smoothFactor);
      
      // Interpolate rotation (handle wrap-around)
      let rotDiff = snapshotB.rotation - snapshotA.rotation;
      if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      const interpolatedRot = snapshotA.rotation + rotDiff * smoothFactor;
      
      // Interpolate velocity
      const interpolatedVel = snapshotA.velocity.clone().lerp(snapshotB.velocity, smoothFactor);
      
      this.lastInterpolatedPos.copy(interpolatedPos);
      this.lastInterpolatedRot = interpolatedRot;
      
      return {
        position: interpolatedPos,
        rotation: interpolatedRot,
        velocity: interpolatedVel,
        isThrusting: factor > 0.5 ? snapshotB.isThrusting : snapshotA.isThrusting
      };
    } else if (this.buffer.length > 0) {
      // Extrapolate from the latest snapshot
      const latest = this.buffer[this.buffer.length - 1];
      const timeSinceSnapshot = (currentTime - latest.timestamp) / 1000;
      
      // Only extrapolate for recent snapshots
      if (timeSinceSnapshot < 0.5) {
        const extrapolatedPos = latest.position.clone().add(
          latest.velocity.clone().multiplyScalar(timeSinceSnapshot * 0.8) // Reduced extrapolation
        );
        
        return {
          position: extrapolatedPos,
          rotation: latest.rotation,
          velocity: latest.velocity,
          isThrusting: latest.isThrusting
        };
      } else {
        // Too old, just return last known position
        return {
          position: latest.position.clone(),
          rotation: latest.rotation,
          velocity: latest.velocity,
          isThrusting: false
        };
      }
    }
    
    return null;
  }
  
  // Smoothstep function for better interpolation
  private smoothstep(edge0: number, edge1: number, x: number): number {
    x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }
  
  // Check if we have enough snapshots for smooth interpolation
  hasEnoughData(currentTime: number): boolean {
    const targetTime = currentTime - this.bufferDelay;
    return this.buffer.some(s => s.timestamp <= targetTime) && 
           this.buffer.some(s => s.timestamp >= targetTime);
  }
  
  // Get current buffer size
  getBufferSize(): number {
    return this.buffer.length;
  }
  
  // Adjust buffer delay based on network conditions
  adjustBufferDelay(jitter: number) {
    // Higher jitter = more buffer delay needed
    if (jitter > 100) {
      this.bufferDelay = Math.min(200, this.bufferDelay + 10);
    } else if (jitter < 30) {
      this.bufferDelay = Math.max(50, this.bufferDelay - 5);
    }
  }
}
import * as THREE from 'three';
import { MaterialDrop, MaterialType } from './MaterialDrop';

export class MaterialManager {
  public group: THREE.Group;
  private materials: Map<string, MaterialDrop> = new Map();
  private onCollect?: (type: MaterialType, value: number, materialId: string) => void;
  private onMagnetizing?: (materialId: string, position: THREE.Vector3) => void;
  private nextId: number = 0;
  private playerId: string = 'offline';
  private lastPositions: Map<string, THREE.Vector3> = new Map();
  private remoteMagnetizing: Map<string, {target: THREE.Vector3, startTime: number}> = new Map();
  
  constructor(onCollect?: (type: MaterialType, value: number, materialId: string) => void) {
    this.group = new THREE.Group();
    this.onCollect = onCollect;
  }
  
  setPlayerId(id: string) {
    this.playerId = id;
  }
  
  setOnMagnetizing(callback: (materialId: string, position: THREE.Vector3) => void) {
    this.onMagnetizing = callback;
  }
  
  spawnMaterials(position: THREE.Vector3, count: number = 3, rng?: () => number): Array<{id: string, position: THREE.Vector3, type: MaterialType}> {
    const spawned: Array<{id: string, position: THREE.Vector3, type: MaterialType}> = [];
    
    for (let i = 0; i < count; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 4
      );
      
      const spawnPos = position.clone().add(offset);
      const type = MaterialDrop.getRandomType(rng);
      const id = `${this.playerId}_mat_${this.nextId++}`;
      
      const material = new MaterialDrop(spawnPos, type);
      this.materials.set(id, material);
      this.group.add(material.mesh);
      
      spawned.push({ id, position: spawnPos, type });
    }
    
    return spawned;
  }
  
  spawnRemote(id: string, position: THREE.Vector3, type: MaterialType) {
    if (this.materials.has(id)) return;
    
    const material = new MaterialDrop(position, type);
    this.materials.set(id, material);
    this.group.add(material.mesh);
  }
  
  collectRemote(id: string, collectorId?: string, collectorPosition?: THREE.Vector3) {
    const material = this.materials.get(id);
    if (material) {
      // Animate briefly toward the collector position if provided
      const target = collectorPosition ? collectorPosition.clone() : material.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
      this.remoteMagnetizing.set(id, { target, startTime: Date.now() });
      
      setTimeout(() => {
        if (this.materials.has(id)) {
          this.group.remove(material.mesh);
          material.dispose();
          this.materials.delete(id);
          this.remoteMagnetizing.delete(id);
        }
      }, 800);
    }
  }
  
  updateRemotePosition(id: string, position: THREE.Vector3) {
    const material = this.materials.get(id);
    if (!material) return;

    // Apply remote updates even for locally-owned materials unless we are actively magnetizing them
    if (!material.isMagnetizingTo()) {
      material.setTargetPosition(position);
    }
  }
  
  update(dt: number, playerPosition?: THREE.Vector3, allPlayerPositions?: Map<string, THREE.Vector3>): string[] {
    const toRemove: Array<{id: string, material: MaterialDrop}> = [];
    const collected: string[] = [];
    const magnetizing: Map<string, THREE.Vector3> = new Map();
    
    this.materials.forEach((material, id) => {
      const isLocalMaterial = id.startsWith(this.playerId);
      
      let materialAlive: boolean;
      
      if (isLocalMaterial) {
        // Choose nearest collector among all players (including local)
        let nearestTarget: THREE.Vector3 | undefined;
        let nearestDist = Infinity;
        const candidates: THREE.Vector3[] = [];
        if (playerPosition) candidates.push(playerPosition);
        if (allPlayerPositions && allPlayerPositions.size > 0) {
          allPlayerPositions.forEach(pos => candidates.push(pos));
        }
        if (candidates.length > 0) {
          for (const candidate of candidates) {
            const d = material.mesh.position.distanceTo(candidate);
            if (d < nearestDist) {
              nearestDist = d;
              nearestTarget = candidate;
            }
          }
        }

        if (nearestTarget) {
          materialAlive = material.update(dt, nearestTarget, true);
        } else {
          materialAlive = material.update(dt, undefined as any, false);
        }
        
        const lastPos = this.lastPositions.get(id);
        const currentPos = material.mesh.position;
        const moved = !lastPos || currentPos.distanceTo(lastPos) > 0.01;
        
        if (moved || material.isMagnetizingTo()) {
          magnetizing.set(id, currentPos.clone());
          this.lastPositions.set(id, currentPos.clone());
        }
      } else {
        // Never magnetize non-local materials toward the local player.
        const remoteMagnet = this.remoteMagnetizing.get(id);
        if (remoteMagnet) {
          const elapsed = (Date.now() - remoteMagnet.startTime) / 1000;
          if (elapsed < 0.8) {
            const speed = 28 * (1 + elapsed * 2);
            const direction = remoteMagnet.target.clone().sub(material.mesh.position);
            const distanceToTarget = direction.length();
            if (distanceToTarget > 0.0001) {
              direction.normalize();
              const eased = Math.min(1, elapsed / 0.8);
              material.mesh.position.add(direction.multiplyScalar(speed * dt * (0.5 + 0.5 * eased)));
            }
            const scale = 1 - (elapsed / 0.8) * 0.6;
            material.mesh.scale.setScalar(scale);
          }
        } else {
          material.updateRemote(dt);
        }
        materialAlive = material.update(dt, undefined, false);
      }
      
      if (!materialAlive) {
        if (material.isCollected()) {
          collected.push(id);
          if (this.onCollect) {
            this.onCollect(material.type, material.value, id);
          }
        }
        toRemove.push({id, material});
      }
    });
    
    if (this.onMagnetizing && magnetizing.size > 0) {
      magnetizing.forEach((position, materialId) => {
        this.onMagnetizing!(materialId, position);
      });
    }
    
    toRemove.forEach(({id, material}) => {
      this.group.remove(material.mesh);
      material.dispose();
      this.materials.delete(id);
    });
    
    return collected;
  }
  
  clear() {
    this.materials.forEach(material => {
      this.group.remove(material.mesh);
      material.dispose();
    });
    this.materials.clear();
  }
  
  getActiveCount(): number {
    return this.materials.size;
  }
}
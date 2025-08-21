import * as THREE from 'three';
import { MaterialDrop, MaterialType } from './MaterialDrop';

export class MaterialManager {
  public group: THREE.Group;
  private materials: Map<string, MaterialDrop> = new Map();
  private onCollect?: (type: MaterialType, value: number, materialId: string) => void;
  private onMagnetizing?: (materialId: string, position: THREE.Vector3) => void;
  private nextId: number = 0;
  private playerId: string = 'local';
  
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
      // Random offset for spawn position
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
  
  // Spawn material from network (remote player spawned it)
  spawnRemote(id: string, position: THREE.Vector3, type: MaterialType) {
    // Don't spawn if already exists
    if (this.materials.has(id)) return;
    
    const material = new MaterialDrop(position, type);
    this.materials.set(id, material);
    this.group.add(material.mesh);
  }
  
  // Force collect a material (from network)
  collectRemote(id: string) {
    const material = this.materials.get(id);
    if (material) {
      this.group.remove(material.mesh);
      material.dispose();
      this.materials.delete(id);
    }
  }
  
  // Update remote material position (from network)
  updateRemotePosition(id: string, position: THREE.Vector3) {
    const material = this.materials.get(id);
    if (material && !id.startsWith('local_')) {
      // Smoothly interpolate to new position for remote materials
      material.mesh.position.lerp(position, 0.3);
    }
  }
  
  update(dt: number, playerPosition?: THREE.Vector3, allPlayerPositions?: Map<string, THREE.Vector3>): string[] {
    const toRemove: Array<{id: string, material: MaterialDrop}> = [];
    const collected: string[] = [];
    const magnetizing: Map<string, THREE.Vector3> = new Map();
    
    this.materials.forEach((material, id) => {
      // For local player's view, handle magnetization to local player
      let materialAlive = material.update(dt, playerPosition);
      
      // Check if ANY material is being magnetized to local player
      if (playerPosition) {
        const distance = material.mesh.position.distanceTo(playerPosition);
        if (distance < 8 && distance > 1.5) { // In magnet range but not collected yet
          magnetizing.set(id, material.mesh.position.clone());
        }
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
    
    // Send position updates for ALL materials being magnetized (not just local ones)
    if (this.onMagnetizing && magnetizing.size > 0) {
      magnetizing.forEach((position, materialId) => {
        this.onMagnetizing(materialId, position);
      });
    }
    
    // Remove dead/collected materials
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
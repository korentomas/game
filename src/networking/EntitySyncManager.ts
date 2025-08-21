import * as THREE from 'three';
import { SnapshotBuffer } from './SnapshotBuffer';

export enum EntityType {
  SHIP = 'ship',
  MATERIAL = 'material',
  JUNK = 'junk',
  PROJECTILE = 'projectile',
  ENEMY = 'enemy',
  STRUCTURE = 'structure'
}

export interface SyncedEntity {
  id: string;
  type: EntityType;
  ownerId: string; // Player who spawned/controls this entity
  position: THREE.Vector3;
  rotation?: number | THREE.Euler;
  velocity?: THREE.Vector3;
  scale?: THREE.Vector3;
  metadata?: any; // Type-specific data (health, damage, etc.)
  lastUpdate: number;
  snapshotBuffer: SnapshotBuffer;
  mesh?: THREE.Object3D; // Reference to the visual representation
}

export class EntitySyncManager {
  private entities: Map<string, SyncedEntity> = new Map();
  private localPlayerId: string = '';
  private onEntityUpdate?: (entity: SyncedEntity) => void;
  private onEntityRemove?: (entityId: string) => void;
  
  // Network callbacks
  private sendEntityUpdate?: (entityId: string, state: any) => void;
  private sendEntitySpawn?: (entity: any) => void;
  private sendEntityDestroy?: (entityId: string) => void;
  
  constructor(localPlayerId: string) {
    this.localPlayerId = localPlayerId;
  }
  
  setLocalPlayerId(id: string) {
    this.localPlayerId = id;
  }
  
  setNetworkCallbacks(callbacks: {
    onUpdate?: (entityId: string, state: any) => void;
    onSpawn?: (entity: any) => void;
    onDestroy?: (entityId: string) => void;
  }) {
    this.sendEntityUpdate = callbacks.onUpdate;
    this.sendEntitySpawn = callbacks.onSpawn;
    this.sendEntityDestroy = callbacks.onDestroy;
  }
  
  // Register a new entity (local or remote)
  registerEntity(
    id: string,
    type: EntityType,
    ownerId: string,
    position: THREE.Vector3,
    options?: {
      rotation?: number | THREE.Euler;
      velocity?: THREE.Vector3;
      scale?: THREE.Vector3;
      metadata?: any;
      mesh?: THREE.Object3D;
    }
  ): SyncedEntity {
    const entity: SyncedEntity = {
      id,
      type,
      ownerId,
      position: position.clone(),
      rotation: options?.rotation,
      velocity: options?.velocity || new THREE.Vector3(),
      scale: options?.scale || new THREE.Vector3(1, 1, 1),
      metadata: options?.metadata || {},
      lastUpdate: Date.now(),
      snapshotBuffer: new SnapshotBuffer(this.getBufferDelayForType(type)),
      mesh: options?.mesh
    };
    
    this.entities.set(id, entity);
    
    // If this is a local entity, broadcast its creation
    if (ownerId === this.localPlayerId && this.sendEntitySpawn) {
      this.sendEntitySpawn({
        id,
        type,
        ownerId,
        position: { x: position.x, y: position.y, z: position.z },
        rotation: options?.rotation,
        velocity: options?.velocity ? { x: options.velocity.x, y: options.velocity.y, z: options.velocity.z } : undefined,
        metadata: options?.metadata
      });
    }
    
    return entity;
  }
  
  // Update entity from network
  updateRemoteEntity(
    id: string,
    position: { x: number; y: number; z: number },
    options?: {
      rotation?: number | THREE.Euler;
      velocity?: { x: number; y: number; z: number };
      metadata?: any;
    }
  ) {
    let entity = this.entities.get(id);
    
    if (!entity) {
      console.warn(`Entity ${id} not found for update`);
      return;
    }
    
    // Add snapshot for interpolation
    const snapshot = {
      timestamp: Date.now(),
      position: new THREE.Vector3(position.x, position.y, position.z),
      rotation: options?.rotation || entity.rotation || 0,
      velocity: options?.velocity 
        ? new THREE.Vector3(options.velocity.x, options.velocity.y, options.velocity.z)
        : entity.velocity || new THREE.Vector3(),
      isThrusting: options?.metadata?.isThrusting || false
    };
    
    entity.snapshotBuffer.addSnapshot(snapshot);
    
    // Update entity state
    entity.position.set(position.x, position.y, position.z);
    if (options?.rotation !== undefined) entity.rotation = options.rotation;
    if (options?.velocity) {
      entity.velocity?.set(options.velocity.x, options.velocity.y, options.velocity.z);
    }
    if (options?.metadata) {
      entity.metadata = { ...entity.metadata, ...options.metadata };
    }
    entity.lastUpdate = Date.now();
    
    if (this.onEntityUpdate) {
      this.onEntityUpdate(entity);
    }
  }
  
  // Update local entity and broadcast
  updateLocalEntity(
    id: string,
    position: THREE.Vector3,
    options?: {
      rotation?: number | THREE.Euler;
      velocity?: THREE.Vector3;
      metadata?: any;
    }
  ) {
    const entity = this.entities.get(id);
    if (!entity || entity.ownerId !== this.localPlayerId) return;
    
    // Update local state
    entity.position.copy(position);
    if (options?.rotation !== undefined) entity.rotation = options.rotation;
    if (options?.velocity) entity.velocity?.copy(options.velocity);
    if (options?.metadata) {
      entity.metadata = { ...entity.metadata, ...options.metadata };
    }
    entity.lastUpdate = Date.now();
    
    // Broadcast update
    if (this.sendEntityUpdate) {
      this.sendEntityUpdate(id, {
        position: { x: position.x, y: position.y, z: position.z },
        rotation: options?.rotation,
        velocity: options?.velocity ? { 
          x: options.velocity.x, 
          y: options.velocity.y, 
          z: options.velocity.z 
        } : undefined,
        metadata: options?.metadata
      });
    }
  }
  
  // Remove entity
  removeEntity(id: string, broadcast: boolean = true) {
    const entity = this.entities.get(id);
    if (!entity) return;
    
    // Broadcast removal if it's a local entity
    if (broadcast && entity.ownerId === this.localPlayerId && this.sendEntityDestroy) {
      this.sendEntityDestroy(id);
    }
    
    this.entities.delete(id);
    
    if (this.onEntityRemove) {
      this.onEntityRemove(id);
    }
  }
  
  // Update all entities (called each frame)
  update(dt: number) {
    const now = Date.now();
    
    this.entities.forEach(entity => {
      // Skip local entities (they update themselves)
      if (entity.ownerId === this.localPlayerId) return;
      
      // Get interpolated state from snapshot buffer
      const interpolatedState = entity.snapshotBuffer.getInterpolatedState(now);
      
      if (interpolatedState && entity.mesh) {
        // Apply interpolated position
        const lerpFactor = this.getLerpFactorForType(entity.type, dt);
        entity.mesh.position.lerp(interpolatedState.position, lerpFactor);
        
        // Apply rotation if it's a number (for ships, etc.)
        if (typeof interpolatedState.rotation === 'number' && typeof entity.rotation === 'number') {
          const targetRotation = interpolatedState.rotation;
          const currentRotation = entity.mesh.rotation.y;
          let rotDiff = targetRotation - currentRotation;
          
          // Handle wrap-around
          if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
          if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
          
          entity.mesh.rotation.y += rotDiff * lerpFactor;
        }
        
        // Update visual state based on metadata
        if (entity.metadata?.onInterpolate) {
          entity.metadata.onInterpolate(interpolatedState, entity);
        }
      } else if (entity.mesh) {
        // Fallback: simple extrapolation
        const timeSinceUpdate = (now - entity.lastUpdate) / 1000;
        
        if (timeSinceUpdate < 0.5 && entity.velocity) {
          const extrapolatedPos = entity.position.clone();
          extrapolatedPos.add(
            entity.velocity.clone().multiplyScalar(timeSinceUpdate * 0.3)
          );
          
          const lerpFactor = this.getLerpFactorForType(entity.type, dt);
          entity.mesh.position.lerp(extrapolatedPos, lerpFactor);
        }
      }
    });
    
    // Clean up old entities
    const entitiesToRemove: string[] = [];
    this.entities.forEach((entity, id) => {
      if (now - entity.lastUpdate > 5000) { // Remove after 5 seconds of no updates
        entitiesToRemove.push(id);
      }
    });
    
    entitiesToRemove.forEach(id => this.removeEntity(id, false));
  }
  
  // Get buffer delay based on entity type
  private getBufferDelayForType(type: EntityType): number {
    switch (type) {
      case EntityType.SHIP:
        return 100; // 100ms for ships
      case EntityType.PROJECTILE:
        return 50; // Lower delay for fast projectiles
      case EntityType.MATERIAL:
      case EntityType.JUNK:
        return 150; // Higher delay for less critical entities
      case EntityType.ENEMY:
      case EntityType.STRUCTURE:
        return 120; // Medium delay for AI entities
      default:
        return 100;
    }
  }
  
  // Get lerp factor based on entity type
  private getLerpFactorForType(type: EntityType, dt: number): number {
    switch (type) {
      case EntityType.SHIP:
        return Math.min(dt * 10, 1);
      case EntityType.PROJECTILE:
        return Math.min(dt * 20, 1); // Faster for projectiles
      case EntityType.MATERIAL:
        return Math.min(dt * 8, 1); // Smoother for materials
      case EntityType.JUNK:
        return Math.min(dt * 6, 1); // Even smoother for junk
      case EntityType.ENEMY:
      case EntityType.STRUCTURE:
        return Math.min(dt * 8, 1);
      default:
        return Math.min(dt * 10, 1);
    }
  }
  
  // Get entity by ID
  getEntity(id: string): SyncedEntity | undefined {
    return this.entities.get(id);
  }
  
  // Get all entities of a specific type
  getEntitiesByType(type: EntityType): SyncedEntity[] {
    return Array.from(this.entities.values()).filter(e => e.type === type);
  }
  
  // Get all entities owned by a specific player
  getEntitiesByOwner(ownerId: string): SyncedEntity[] {
    return Array.from(this.entities.values()).filter(e => e.ownerId === ownerId);
  }
  
  // Check if entity is local
  isLocalEntity(id: string): boolean {
    const entity = this.entities.get(id);
    return entity ? entity.ownerId === this.localPlayerId : false;
  }
  
  // Clear all entities
  clear() {
    this.entities.clear();
  }
  
  // Get statistics
  getStats() {
    const stats: Record<EntityType, number> = {
      [EntityType.SHIP]: 0,
      [EntityType.MATERIAL]: 0,
      [EntityType.JUNK]: 0,
      [EntityType.PROJECTILE]: 0,
      [EntityType.ENEMY]: 0,
      [EntityType.STRUCTURE]: 0
    };
    
    this.entities.forEach(entity => {
      stats[entity.type]++;
    });
    
    return {
      total: this.entities.size,
      byType: stats,
      local: Array.from(this.entities.values()).filter(e => e.ownerId === this.localPlayerId).length,
      remote: Array.from(this.entities.values()).filter(e => e.ownerId !== this.localPlayerId).length
    };
  }
}
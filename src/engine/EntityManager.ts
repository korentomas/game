import * as THREE from 'three';

export interface EntityLOD {
  FULL: number;    // 0-30 units: Full detail
  MEDIUM: number;  // 30-80 units: Reduced detail
  LOW: number;     // 80-150 units: Basic representation
  CULLED: number;  // 150+ units: Not rendered
}

export const ENTITY_LOD: EntityLOD = {
  FULL: 30,
  MEDIUM: 80, 
  LOW: 150,
  CULLED: 300
};

export enum EntityType {
  JUNK = 'junk',
  PARTICLE_THRUSTER = 'thruster_particles',
  PARTICLE_DUST = 'dust_particles',
  SHIP = 'ship',
  CHUNK = 'chunk',
  LIGHT = 'light',
  DRONE = 'drone',
  PROJECTILE = 'projectile'
}

export interface EntityStats {
  total: number;
  visible: number;
  culled: number;
  lod_full: number;
  lod_medium: number;
  lod_low: number;
  pooled?: number;
}

export class EntityManager {
  private entities = new Map<string, Set<THREE.Object3D>>();
  private entityPositions = new Map<THREE.Object3D, THREE.Vector3>();
  private entityLODLevels = new Map<THREE.Object3D, keyof EntityLOD>();
  private entityTypes = new Map<THREE.Object3D, EntityType>();
  
  // Entity pools for reuse
  private entityPools = new Map<EntityType, THREE.Object3D[]>();
  private maxPoolSizes = new Map<EntityType, number>([
    [EntityType.JUNK, 200],
    [EntityType.LIGHT, 100],
    [EntityType.DRONE, 50],
    [EntityType.PROJECTILE, 100]
  ]);
  
  // Performance tracking
  private lastCullTime = 0;
  private cullFrequency = 66; // 15fps culling updates for smoother visuals
  
  // Stats
  public stats = new Map<EntityType, EntityStats>();
  
  constructor() {
    // Initialize stats for each entity type
    Object.values(EntityType).forEach(type => {
      this.stats.set(type, {
        total: 0,
        visible: 0,
        culled: 0,
        lod_full: 0,
        lod_medium: 0,
        lod_low: 0,
        pooled: 0
      });
      this.entities.set(type, new Set());
      this.entityPools.set(type, []);
    });
  }
  
  registerEntity(entity: THREE.Object3D, type: EntityType, position?: THREE.Vector3) {
    const typeSet = this.entities.get(type)!;
    typeSet.add(entity);
    
    this.entityTypes.set(entity, type);
    if (position) {
      this.entityPositions.set(entity, position.clone());
    }
    
    // Update stats
    const stats = this.stats.get(type)!;
    stats.total++;
    stats.visible++; // Assume visible by default
  }
  
  unregisterEntity(entity: THREE.Object3D) {
    const type = this.entityTypes.get(entity);
    if (!type) return;
    
    const typeSet = this.entities.get(type)!;
    typeSet.delete(entity);
    
    this.entityTypes.delete(entity);
    this.entityPositions.delete(entity);
    this.entityLODLevels.delete(entity);
    
    // Update stats
    const stats = this.stats.get(type)!;
    stats.total = Math.max(0, stats.total - 1);
    if (entity.visible) {
      stats.visible = Math.max(0, stats.visible - 1);
    } else {
      stats.culled = Math.max(0, stats.culled - 1);
    }
  }
  
  updateEntityPosition(entity: THREE.Object3D, position: THREE.Vector3) {
    this.entityPositions.set(entity, position.clone());
  }
  
  performCulling(viewerPosition: THREE.Vector3, camera?: THREE.Camera) {
    const now = performance.now();
    if (now - this.lastCullTime < this.cullFrequency) return;
    this.lastCullTime = now;
    
    // Reset stats for this frame
    this.stats.forEach(stat => {
      stat.visible = 0;
      stat.culled = 0;
      stat.lod_full = 0;
      stat.lod_medium = 0;
      stat.lod_low = 0;
    });
    
    // Frustum culling setup
    const frustum = new THREE.Frustum();
    const cameraMatrix = new THREE.Matrix4();
    if (camera) {
      cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(cameraMatrix);
    }
    
    // Process each entity type
    for (const [type, entitySet] of this.entities) {
      const stats = this.stats.get(type)!;
      
      for (const entity of entitySet) {
        const position = this.entityPositions.get(entity) || entity.position;
        const distance = viewerPosition.distanceTo(position);
        
        // Distance-based LOD and culling
        let shouldRender = true;
        let lodLevel: keyof EntityLOD = 'FULL';
        
        if (distance > ENTITY_LOD.CULLED) {
          shouldRender = false;
          lodLevel = 'CULLED';
        } else if (distance > ENTITY_LOD.LOW) {
          lodLevel = 'LOW';
        } else if (distance > ENTITY_LOD.MEDIUM) {
          lodLevel = 'MEDIUM';
        } else {
          lodLevel = 'FULL';
        }
        
        // Frustum culling for visible entities
        if (shouldRender && camera) {
          const sphere = new THREE.Sphere(position, this.getEntityRadius(entity, type));
          shouldRender = frustum.intersectsSphere(sphere);
        }
        
        // Apply type-specific culling rules
        shouldRender = this.applyTypeSpecificCulling(entity, type, distance, shouldRender);
        
        // Update entity visibility and LOD
        this.setEntityLOD(entity, type, lodLevel, shouldRender);
        
        // Update stats
        this.entityLODLevels.set(entity, lodLevel);
        if (shouldRender) {
          stats.visible++;
          switch(lodLevel) {
            case 'FULL': stats.lod_full++; break;
            case 'MEDIUM': stats.lod_medium++; break;
            case 'LOW': stats.lod_low++; break;
          }
        } else {
          stats.culled++;
        }
      }
    }
  }
  
  private getEntityRadius(entity: THREE.Object3D, type: EntityType): number {
    switch (type) {
      case EntityType.JUNK: return 2;
      case EntityType.SHIP: return 3;
      case EntityType.CHUNK: return 20;
      case EntityType.LIGHT: return 1;
      default: return 1;
    }
  }
  
  private applyTypeSpecificCulling(entity: THREE.Object3D, type: EntityType, distance: number, shouldRender: boolean): boolean {
    switch (type) {
      case EntityType.JUNK:
        // Junk is less important at distance
        return shouldRender && distance < 120;
        
      case EntityType.PARTICLE_THRUSTER:
        // Thruster particles always visible - they manage their own visibility
        return true;
        
      case EntityType.PARTICLE_DUST:
        // Dust field always visible but can reduce density
        return true;
        
      case EntityType.LIGHT:
        // Lights are important for atmosphere, visible at longer range
        return shouldRender && distance < 120;
        
      case EntityType.CHUNK:
        // Chunks handled by world system
        return shouldRender;
        
      default:
        return shouldRender;
    }
  }
  
  private setEntityLOD(entity: THREE.Object3D, type: EntityType, lodLevel: keyof EntityLOD, shouldRender: boolean) {
    entity.visible = shouldRender;
    
    if (!shouldRender) return;
    
    // Apply LOD-specific optimizations
    switch (type) {
      case EntityType.JUNK:
        this.applyJunkLOD(entity, lodLevel);
        break;
        
      case EntityType.LIGHT:
        this.applyLightLOD(entity, lodLevel);
        break;
        
      case EntityType.PARTICLE_DUST:
        this.applyParticleLOD(entity, lodLevel);
        break;
        
      case EntityType.DRONE:
        this.applyDroneLOD(entity, lodLevel);
        break;
        
      case EntityType.PROJECTILE:
        // Projectiles are small and fast, minimal LOD needed
        break;
    }
  }
  
  private applyJunkLOD(entity: THREE.Object3D, lodLevel: keyof EntityLOD) {
    // Find light child and adjust intensity based on LOD
    entity.traverse(child => {
      if (child instanceof THREE.PointLight) {
        const originalIntensity = child.userData.originalIntensity || child.intensity;
        const originalDistance = child.userData.originalDistance || child.distance;
        
        child.userData.originalIntensity = originalIntensity;
        child.userData.originalDistance = originalDistance;
        
        switch (lodLevel) {
          case 'FULL':
            child.intensity = originalIntensity;
            child.distance = originalDistance;
            break;
          case 'MEDIUM':
            child.intensity = originalIntensity * 0.8; // Less reduction
            child.distance = originalDistance * 0.9;
            break;
          case 'LOW':
            child.intensity = originalIntensity * 0.5; // Better minimum
            child.distance = originalDistance * 0.7;
            break;
        }
      }
    });
  }
  
  private applyLightLOD(entity: THREE.Object3D, lodLevel: keyof EntityLOD) {
    if (entity instanceof THREE.Light) {
      const originalIntensity = entity.userData.originalIntensity || entity.intensity;
      const originalDistance = entity.userData.originalDistance || (entity as any).distance;
      
      entity.userData.originalIntensity = originalIntensity;
      entity.userData.originalDistance = originalDistance;
      
      switch (lodLevel) {
        case 'FULL':
          entity.intensity = originalIntensity;
          if (originalDistance) (entity as any).distance = originalDistance;
          break;
        case 'MEDIUM':
          entity.intensity = originalIntensity * 0.8;
          if (originalDistance) (entity as any).distance = originalDistance * 0.9;
          break;
        case 'LOW':
          entity.intensity = originalIntensity * 0.6;
          if (originalDistance) (entity as any).distance = originalDistance * 0.8;
          break;
      }
    }
  }
  
  private applyParticleLOD(entity: THREE.Object3D, lodLevel: keyof EntityLOD) {
    // Reduce particle density based on LOD
    if (entity instanceof THREE.Points) {
      const material = entity.material as THREE.PointsMaterial;
      const originalSize = material.userData.originalSize || material.size;
      material.userData.originalSize = originalSize;
      
      switch (lodLevel) {
        case 'FULL':
          material.size = originalSize;
          break;
        case 'MEDIUM':
          material.size = originalSize * 0.8;
          break;
        case 'LOW':
          material.size = originalSize * 0.6;
          break;
      }
    }
  }
  
  private applyDroneLOD(entity: THREE.Object3D, lodLevel: keyof EntityLOD) {
    // Adjust drone visual complexity and emission based on distance
    entity.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        if (material.emissive) {
          const originalIntensity = material.userData.originalEmissiveIntensity || material.emissiveIntensity;
          material.userData.originalEmissiveIntensity = originalIntensity;
          
          switch (lodLevel) {
            case 'FULL':
              material.emissiveIntensity = originalIntensity;
              break;
            case 'MEDIUM':
              material.emissiveIntensity = originalIntensity * 0.7;
              break;
            case 'LOW':
              material.emissiveIntensity = originalIntensity * 0.4;
              break;
          }
        }
      }
    });
  }
  
  // Entity pooling for performance
  getFromPool(type: EntityType): THREE.Object3D | null {
    const pool = this.entityPools.get(type);
    if (pool && pool.length > 0) {
      const entity = pool.pop()!;
      const stats = this.stats.get(type)!;
      stats.pooled = Math.max(0, (stats.pooled || 0) - 1);
      return entity;
    }
    return null;
  }
  
  returnToPool(entity: THREE.Object3D, type: EntityType) {
    const pool = this.entityPools.get(type);
    const maxSize = this.maxPoolSizes.get(type) || 50;
    
    if (pool && pool.length < maxSize) {
      // Reset entity state
      entity.visible = false;
      entity.position.set(99999, 99999, 99999); // Move offscreen
      
      pool.push(entity);
      const stats = this.stats.get(type)!;
      stats.pooled = (stats.pooled || 0) + 1;
    } else {
      // Dispose if pool is full
      entity.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
  }
  
  getDebugInfo(): Record<string, EntityStats> {
    const result: Record<string, EntityStats> = {};
    for (const [type, stats] of this.stats) {
      result[type] = { ...stats };
    }
    return result;
  }
  
  // Adaptive culling frequency based on performance
  updateCullFrequency(frameTime: number) {
    if (frameTime > 20) { // Poor performance
      this.cullFrequency = Math.min(150, this.cullFrequency + 10);
    } else if (frameTime < 14) { // Good performance
      this.cullFrequency = Math.max(33, this.cullFrequency - 5);
    }
  }
}
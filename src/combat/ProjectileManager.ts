import * as THREE from 'three';
import { Projectile, WeaponStats } from './Projectile';

export class ProjectileManager {
  public group: THREE.Group;
  private projectilesMap: Map<string, Projectile> = new Map();
  private nextId: number = 0;
  private world: any; // Reference to world for terrain collision
  private junkManager: any; // Reference to junk manager for targeting
  private getShipPositions: () => Array<{position: THREE.Vector3, velocity?: THREE.Vector3, id: string}>; // Function to get ship positions
  
  constructor(world?: any) {
    this.group = new THREE.Group();
    this.world = world;
  }
  
  // Set references for homing missiles
  setTargetingSystems(junkManager: any, getShipPositions: () => Array<{position: THREE.Vector3, velocity?: THREE.Vector3, id: string}>) {
    this.junkManager = junkManager;
    this.getShipPositions = getShipPositions;
  }
  
  get projectiles(): Projectile[] {
    return Array.from(this.projectilesMap.values());
  }
  
  getProjectileById(id: string): Projectile | undefined {
    return this.projectilesMap.get(id);
  }
  
  spawn(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    stats: WeaponStats,
    ownerId: string = 'local'
  ): string {
    const id = `${ownerId}_proj_${this.nextId++}`;
    const projectile = new Projectile(position, direction, stats, ownerId);
    projectile.id = id;
    
    this.projectilesMap.set(id, projectile);
    this.group.add(projectile.mesh);
    
    return id;
  }
  
  // Spawn projectile from network data (uses default stats for now)
  spawnRemote(id: string, position: THREE.Vector3, direction: THREE.Vector3, ownerId: string) {
    // Don't spawn if already exists
    if (this.projectilesMap.has(id)) {
      console.log('Projectile already exists:', id);
      return;
    }
    
    console.log(`Spawning remote projectile: ${id} at`, position, 'dir', direction, 'owner', ownerId);
    
    // Default remote projectile stats (match current ship defaults)
    const defaultStats: WeaponStats = {
      damage: 10,
      speed: 50,
      range: 20,  // Updated to match local ship
      lifetime: 0.8  // Updated to match local ship
    };
    
    const projectile = new Projectile(position, direction, defaultStats, ownerId);
    projectile.id = id;
    this.projectilesMap.set(id, projectile);
    this.group.add(projectile.mesh);
    
    console.log('Remote projectile spawned, mesh position:', projectile.mesh.position);
  }
  
  update(dt: number) {
    // Update all projectiles and remove dead ones
    const toRemove: string[] = [];
    
    // Get current ship positions for homing
    const shipPositions = this.getShipPositions ? this.getShipPositions() : [];
    
    this.projectilesMap.forEach((projectile, id) => {
      const alive = projectile.update(dt, this.world, this.junkManager, shipPositions);
      if (!alive) {
        toRemove.push(id);
      }
    });
    
    // Remove dead projectiles
    toRemove.forEach(id => {
      this.remove(id);
    });
  }
  
  remove(id: string) {
    const projectile = this.projectilesMap.get(id);
    if (projectile) {
      this.group.remove(projectile.mesh);
      projectile.dispose();
      this.projectilesMap.delete(id);
    }
  }
  
  checkCollisions(targets: Array<{object: THREE.Object3D, radius: number, type: string}>): Array<{projectileId: string, target: any, damage: number}> {
    const hits: Array<{projectileId: string, target: any, damage: number}> = [];
    
    this.projectilesMap.forEach((projectile, id) => {
      // Don't check collisions for projectiles from same owner against that owner
      for (const target of targets) {
        // Skip self-collision
        if (target.type === 'ship' && projectile.ownerId === 'local') {
          continue;
        }
        
        const distance = projectile.mesh.position.distanceTo(target.object.position);
        
        // Check collision with appropriate radius
        if (distance < target.radius) {
          hits.push({ 
            projectileId: id, 
            target: target,
            damage: projectile.damage
          });
          break; // One hit per projectile per frame
        }
      }
    });
    
    return hits;
  }
  
  getProjectile(id: string): Projectile | undefined {
    return this.projectilesMap.get(id);
  }
  
  clear() {
    this.projectilesMap.forEach((projectile, id) => {
      this.remove(id);
    });
  }
}
import * as THREE from 'three';
import { EntityManager, EntityType } from '../engine/EntityManager';
import { FadeManager } from '../engine/FadeManager';

class JunkPiece {
  public group = new THREE.Group();
  private blinkT: number;
  public lights: THREE.PointLight[] = [];
  private neonColors = [0x00e5ff, 0xff4d6d, 0x00ff88, 0xff8800, 0x8800ff, 0xffff00];
  public health: number;
  public maxHealth: number;
  public size: number;
  public id: string;
  
  constructor(public position: THREE.Vector3, private rng: () => number, chunkKey?: string, index?: number) {
    this.blinkT = rng() * 10;
    const rand = rng();
    
    // Initialize health based on random size
    this.size = 0.5 + rng() * 1.0; // Size between 0.5 and 1.5
    this.maxHealth = Math.floor(20 + this.size * 30); // 20-50 health
    this.health = this.maxHealth;
    // Deterministic ID based on chunk and index only (no random component)
    // This ensures all players have the same ID for the same junk
    this.id = `junk_${chunkKey}_${index}`;
    
    // Varied junk geometries scaled by size
    const geometries = [
      new THREE.DodecahedronGeometry(0.6 * this.size, 0),
      new THREE.OctahedronGeometry(0.7 * this.size, 0),
      new THREE.IcosahedronGeometry(0.5 * this.size, 0),
      new THREE.BoxGeometry(0.8 * this.size, 0.4 * this.size, 1.2 * this.size)
    ];
    
    const body = new THREE.Mesh(
      geometries[Math.floor(rand * geometries.length)],
      new THREE.MeshStandardMaterial({ 
        color: 0x2f3a44, 
        roughness: 0.8, 
        metalness: 0.3,
        emissive: 0x001122,
        emissiveIntensity: 0.2
      })
    );
    
    // Multiple neon panels with different colors
    const numPanels = Math.floor(rand * 3) + 1; // 1-3 panels
    for (let i = 0; i < numPanels; i++) {
      const neonColor = this.neonColors[Math.floor(rng() * this.neonColors.length)];
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3 + rng() * 0.4, 0.15 + rng() * 0.2),
        new THREE.MeshStandardMaterial({ 
          color: 0x111111, 
          emissive: neonColor, 
          emissiveIntensity: 3.0 + rng() * 1.5  // Much brighter glow
        })
      );
      
      // Random panel positioning
      const angle = (i / numPanels) * Math.PI * 2 + rng() * 0.5;
      panel.position.set(
        Math.cos(angle) * 0.4,
        0.1 + rng() * 0.3,
        Math.sin(angle) * 0.4
      );
      panel.rotation.y = angle + Math.PI/2;
      panel.rotation.x = (rng() - 0.5) * 0.3;
      
      this.group.add(panel);
      
      // Corresponding point light for each panel - much brighter
      const light = new THREE.PointLight(neonColor, 1.5 + rng() * 1.0, 12 + rng() * 6, 1.0);
      light.position.copy(panel.position);
      light.position.y += 0.2;
      
      // Store original values for LOD
      light.userData.originalIntensity = light.intensity;
      light.userData.originalDistance = light.distance;
      light.userData.fadeOriginalIntensity = light.intensity;
      
      this.lights.push(light);
      this.group.add(light);
    }
    
    // Add some floating neon orbs with intense glow
    if (rng() > 0.6) {
      const orbColor = this.neonColors[Math.floor(rng() * this.neonColors.length)];
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 6),
        new THREE.MeshStandardMaterial({ 
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 4.0,  // Super bright floating orbs
          transparent: true,
          opacity: 0.9
        })
      );
      orb.position.set(
        (rng() - 0.5) * 1.5,
        0.8 + rng() * 0.5,
        (rng() - 0.5) * 1.5
      );
      this.group.add(orb);
      
      // Add a point light for the orb too
      const orbLight = new THREE.PointLight(orbColor, 1.0, 6, 1.5);
      orbLight.position.copy(orb.position);
      this.lights.push(orbLight);
      this.group.add(orbLight);
    }
    
    this.group.add(body);
    this.group.position.copy(position);
    this.group.rotation.y = rng() * Math.PI * 2;
  }
  
  takeDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    
    // Visual feedback - flash red
    this.showDamageEffect();
    
    // Scale down slightly when damaged
    const healthPercent = this.health / this.maxHealth;
    const targetScale = 0.8 + healthPercent * 0.2;
    this.group.scale.setScalar(targetScale);
    
    return this.health <= 0; // Return true if destroyed
  }
  
  showDamageEffect() {
    // Visual feedback - flash red (used for both local and remote hits)
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const originalEmissive = child.material.emissive.clone();
        child.material.emissive = new THREE.Color(0xff0000);
        child.material.emissiveIntensity = 2.0;
        
        // Reset after flash
        setTimeout(() => {
          child.material.emissive = originalEmissive;
          child.material.emissiveIntensity = 0.2;
        }, 100);
      }
    });
  }

  update(dt: number) {
    this.blinkT += dt;
    
    // Update all lights with varied pulsing patterns
    this.lights.forEach((light, index) => {
      const offset = index * 2.1; // Different phase for each light
      const frequency = 2.5 + index * 0.3; // Varied frequencies
      const pulse = (Math.sin(this.blinkT * frequency + offset) + 1) * 0.5;
      const baseIntensity = light.userData.originalIntensity || 0.8;
      light.intensity = baseIntensity * (0.6 + pulse * 0.8); // More dramatic pulsing
    });
    
    // Subtle rotation for floating orbs
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
        child.position.y += Math.sin(this.blinkT * 1.5 + child.position.x) * dt * 0.5;
        child.rotation.y += dt * 0.5;
      }
    });
  }
}

export class JunkManager {
  public group = new THREE.Group();
  private junk: JunkPiece[] = [];
  private junkById = new Map<string, JunkPiece>(); // Track junk by ID for network sync
  private destroyedJunkIds = new Set<string>(); // Track globally destroyed junk
  private rng: () => number;
  private activeChunks: Set<string> = new Set(); // Track only currently active chunks
  private entityManager: EntityManager;
  private fadeManager: FadeManager;
  private effectsManager: any; // Reference to EffectsManager
  private onJunkDestroy?: (junkId: string) => void;
  
  // Entity management
  private junkByChunk = new Map<string, JunkPiece[]>();
  private maxJunkDistance = 150; // Cull junk beyond this distance

  constructor(seed: string, entityManager: EntityManager, fadeManager: FadeManager, effectsManager?: any) {
    this.rng = seededRandom(seed + 'junk');
    this.entityManager = entityManager;
    this.fadeManager = fadeManager;
    this.effectsManager = effectsManager;
  }
  
  setNetworkCallbacks(callbacks: {
    onJunkDestroy?: (junkId: string) => void;
  }) {
    this.onJunkDestroy = callbacks.onJunkDestroy;
  }
  
  // Called when a chunk is removed from the world
  onChunkRemoved(cx: number, cz: number) {
    const k = `${cx},${cz}`;
    this.activeChunks.delete(k);
    
    // Also clean up junk pieces from this chunk
    const chunkJunk = this.junkByChunk.get(k);
    if (chunkJunk) {
      for (const j of chunkJunk) {
        // Remove from main array
        const idx = this.junk.indexOf(j);
        if (idx >= 0) this.junk.splice(idx, 1);
        
        // Remove from ID map
        this.junkById.delete(j.id);
        
        // Remove from scene
        this.group.remove(j.group);
        
        // Unregister from entity manager
        this.entityManager.unregisterEntity(j.group);
        j.lights.forEach(light => {
          this.entityManager.unregisterEntity(light);
        });
      }
      this.junkByChunk.delete(k);
    }
  }

  spawnInChunk(cx: number, cz: number, group: THREE.Group, world?: any) {
    const localRng = seededRandom(`junk_${cx}_${cz}`);
    const k = `${cx},${cz}`;
    if (this.activeChunks.has(k)) return;
    
    // Mark chunk as active immediately
    this.activeChunks.add(k);
    
    console.log(`JunkManager: Processing chunk ${k}`);
    
    const chunkJunk: JunkPiece[] = [];
    const junkDataForNetwork: Array<{id: string, position: THREE.Vector3, size: number}> = [];
    const count = Math.floor(localRng() * 4); // 0-3 pieces per chunk
    
    // Every player generates the same junk locally (deterministic based on seed)
    // No need to sync since everyone gets the same result
    
    for (let i = 0; i < count; i++) {
      // Generate deterministic junk ID for this position
      const junkId = `junk_${k}_${i}`;
      
      // Skip if this junk was already destroyed
      if (this.destroyedJunkIds.has(junkId)) {
        continue;
      }
      
      // Try to get from pool first
      let j = this.getJunkFromPool();
      
      if (!j) {
        const x = localRng() * 16;
        const z = localRng() * 16;
        const worldX = group.position.x + x;
        const worldZ = group.position.z + z;
        
        // Get ground height at this position if world is available
        let y = 2 + localRng() * 2; // Default height
        if (world && world.sampleHeight) {
          const groundY = world.sampleHeight(worldX, worldZ);
          y = groundY + 2.0 + localRng() * 1.5; // Place junk 2-3.5 units above ground (same range as ships)
        }
        
        const pos = new THREE.Vector3(worldX, y, worldZ);
        j = new JunkPiece(pos, localRng, k, i);
      } else {
        // Reposition pooled junk
        const x = localRng() * 16;
        const z = localRng() * 16;
        const worldX = group.position.x + x;
        const worldZ = group.position.z + z;
        
        let y = 2 + localRng() * 2;
        if (world && world.sampleHeight) {
          const groundY = world.sampleHeight(worldX, worldZ);
          y = groundY + 2.0 + localRng() * 1.5;
        }
        
        j.position.set(worldX, y, worldZ);
        j.group.position.copy(j.position);
        j.group.visible = true;
        // Update the junk's ID to match the deterministic one
        j.id = junkId;
      }
      
      this.junk.push(j);
      chunkJunk.push(j);
      this.junkById.set(j.id, j);
      this.group.add(j.group);
      
      // Track data for network sync
      junkDataForNetwork.push({
        id: j.id,
        position: j.position.clone(),
        size: j.size
      });
      
      // Register with entity manager
      this.entityManager.registerEntity(j.group, EntityType.JUNK, j.position);
      
      // Start invisible and register for fade-in effect
      j.group.visible = false;
      j.group.userData.isFadingOut = false;
      this.fadeManager.registerEntity(j.group, true);
      
      // Trigger fade in immediately if within range
      if (world && world.ship) {
        const distance = j.position.distanceTo(world.ship.position);
        if (distance < 80) {
          j.group.visible = true;
          this.fadeManager.fadeIn(j.group);
        }
      }
      
      // Register all lights separately for culling
      j.lights.forEach(light => {
        this.entityManager.registerEntity(light, EntityType.LIGHT, j.position);
      });
    }
    
    this.junkByChunk.set(k, chunkJunk);
    
    if (junkDataForNetwork.length > 0) {
      console.log(`JunkManager: Spawned ${junkDataForNetwork.length} junk pieces in chunk ${k}`);
    }
    
    // No need to broadcast junk spawn - everyone generates the same junk locally
  }
  
  // Spawn junk from network (remote player generated it)
  spawnRemoteJunk(chunkKey: string, junkData: Array<{id: string, position: THREE.Vector3, size: number}>) {
    if (this.placed.has(chunkKey)) return; // Already have junk for this chunk
    this.placed.add(chunkKey);
    
    const chunkJunk: JunkPiece[] = [];
    const localRng = seededRandom(chunkKey); // Use chunk key for consistent randomness
    
    for (const data of junkData) {
      // Create junk with the same ID and properties as the remote player
      const j = new JunkPiece(data.position, localRng);
      j.id = data.id; // Override the ID to match remote
      j.size = data.size;
      
      this.junk.push(j);
      chunkJunk.push(j);
      this.junkById.set(j.id, j);
      this.group.add(j.group);
      
      // Register with entity manager
      this.entityManager.registerEntity(j.group, EntityType.JUNK, j.position);
      
      // Start invisible and register for fade-in effect
      j.group.visible = false;
      j.group.userData.isFadingOut = false;
      this.fadeManager.registerEntity(j.group, true);
      
      // Trigger fade in immediately if within range
      if (world && world.ship) {
        const distance = j.position.distanceTo(world.ship.position);
        if (distance < 80) {
          j.group.visible = true;
          this.fadeManager.fadeIn(j.group);
        }
      }
      
      // Register all lights separately for culling
      j.lights.forEach(light => {
        this.entityManager.registerEntity(light, EntityType.LIGHT, j.position);
      });
    }
    
    this.junkByChunk.set(chunkKey, chunkJunk);
  }
  
  // Destroy junk from network (remote player destroyed it)
  destroyRemoteJunk(junkId: string) {
    // Always mark as destroyed, even if we haven't spawned it yet
    this.destroyedJunkIds.add(junkId);
    
    const junk = this.junkById.get(junkId);
    if (!junk) {
      // Junk hasn't been spawned yet on this client, but we've marked it as destroyed
      console.log(`Marked future junk ${junkId} as destroyed`);
      return;
    }
    
    // Create destruction effect
    this.createDestructionEffect(junk);
    
    // Remove from scene and lists (this also adds to destroyedJunkIds but that's ok)
    this.destroyJunk(junk);
  }
  
  // Apply hit effect from network (remote player hit junk)
  applyRemoteHit(junkId: string, damage: number) {
    const junk = this.junkById.get(junkId);
    if (!junk) return;
    
    // Apply visual damage effect without actually damaging (health is handled by owner)
    junk.showDamageEffect();
  }

  getActiveJunk(): THREE.Object3D[] {
    const active: THREE.Object3D[] = [];
    this.junk.forEach(j => {
      if (j.group.visible) {
        active.push(j.group);
      }
    });
    return active;
  }
  
  getJunkInRadius(position: THREE.Vector3, radius: number): JunkPiece[] {
    const nearby: JunkPiece[] = [];
    for (const j of this.junk) {
      if (!j.group.visible) continue;
      const distance = j.position.distanceTo(position);
      if (distance <= radius) {
        nearby.push(j);
      }
    }
    return nearby;
  }
  
  checkProjectileCollisions(projectilePosition: THREE.Vector3, damage: number): string | null {
    for (const j of this.junk) {
      if (!j.group.visible) continue;
      
      // Simple sphere collision check
      const distance = j.position.distanceTo(projectilePosition);
      if (distance < j.size + 0.3) { // 0.3 is projectile radius
        const destroyed = j.takeDamage(damage);
        
        if (destroyed) {
          // Create destruction effect
          this.createDestructionEffect(j);
          
          // Send network message about destruction
          if (this.onJunkDestroy) {
            this.onJunkDestroy(j.id);
          }
          
          // Remove from scene and lists
          this.destroyJunk(j);
          
          return j.id; // Return ID of destroyed junk
        }
        
        return 'hit'; // Hit but not destroyed
      }
    }
    return null;
  }
  
  getJunkAtPosition(position: THREE.Vector3): string | null {
    for (const j of this.junk) {
      if (!j.group.visible) continue;
      
      const distance = j.position.distanceTo(position);
      if (distance < j.size + 0.5) {
        return j.id;
      }
    }
    return null;
  }
  
  private createDestructionEffect(junk: JunkPiece) {
    // Flash all lights brightly before removal
    junk.lights.forEach(light => {
      light.intensity = 10;
      light.distance = 30;
    });
    
    // Spawn explosion effect if effects manager is available
    if (this.effectsManager) {
      // Get a random neon color from the junk piece
      const colors = [0x00e5ff, 0xff4d6d, 0x00ff88, 0xff8800, 0x8800ff, 0xffff00];
      const explosionColor = colors[Math.floor(Math.random() * colors.length)];
      this.effectsManager.spawnExplosion(junk.position.clone(), explosionColor);
    }
  }
  
  private destroyJunk(junk: JunkPiece) {
    // Mark as destroyed globally
    this.destroyedJunkIds.add(junk.id);
    
    // Unregister from entity manager
    this.entityManager.unregisterEntity(junk.group);
    this.fadeManager.unregisterEntity(junk.group);
    
    // Unregister lights
    junk.lights.forEach(light => {
      this.entityManager.unregisterEntity(light);
    });
    
    // Remove from scene
    this.group.remove(junk.group);
    
    // Remove from tracking arrays
    const index = this.junk.indexOf(junk);
    if (index >= 0) this.junk.splice(index, 1);
    
    // Remove from ID map
    this.junkById.delete(junk.id);
    
    // Remove from chunk tracking
    for (const [chunkKey, chunkJunk] of this.junkByChunk) {
      const chunkIndex = chunkJunk.indexOf(junk);
      if (chunkIndex >= 0) {
        chunkJunk.splice(chunkIndex, 1);
        break;
      }
    }
  }
  
  update(dt: number, focus?: THREE.Vector3) {
    // Define fade distances
    const fadeInDistance = 80;  // Start fading in at this distance
    const fadeOutDistance = 100; // Start fading out at this distance
    const cullDistance = 150;    // Remove from scene at this distance
    
    // Update visibility and animations for all junk
    for (const j of this.junk) {
      if (focus) {
        const distance = j.position.distanceTo(focus);
        
        // Handle fade based on distance
        if (distance < fadeInDistance) {
          // Close enough - ensure it's visible and faded in
          if (!j.group.visible || j.group.userData.isFadingOut) {
            j.group.visible = true;
            this.fadeManager.fadeIn(j.group);
            j.group.userData.isFadingOut = false;
          }
        } else if (distance < fadeOutDistance) {
          // In transition zone - keep current state
          // This creates a hysteresis effect to prevent flickering
        } else if (distance < cullDistance) {
          // Far but not too far - start fading out
          if (j.group.visible && !j.group.userData.isFadingOut) {
            this.fadeManager.fadeOut(j.group);
            j.group.userData.isFadingOut = true;
          }
        } else {
          // Too far - hide immediately (will be cleaned up)
          if (j.group.visible) {
            j.group.visible = false;
            j.group.userData.isFadingOut = true;
          }
        }
        
        // Update entity manager position
        this.entityManager.updateEntityPosition(j.group, j.position);
      }
      
      // Update animations for visible junk only
      if (j.group.visible) {
        j.update(dt);
      }
    }
    
    // Update fade effects
    this.fadeManager.update(dt);
    
    // Cleanup distant chunks
    if (focus) {
      this.cleanupDistantJunk(focus);
    }
  }
  
  private cleanupDistantJunk(focus: THREE.Vector3) {
    const toRemove: string[] = [];
    
    for (const [chunkKey, chunkJunk] of this.junkByChunk) {
      if (chunkJunk.length === 0) continue;
      
      // Check if any junk in this chunk is too far
      const sampleJunk = chunkJunk[0];
      const distance = sampleJunk.position.distanceTo(focus);
      
      if (distance > this.maxJunkDistance) {
        // Fade out and remove all junk in this chunk
        for (const j of chunkJunk) {
          // Start fade out
          this.fadeManager.fadeOut(j.group);
          
          // Schedule removal after fade completes
          setTimeout(() => {
            this.returnJunkToPool(j);
            this.entityManager.unregisterEntity(j.group);
            this.fadeManager.unregisterEntity(j.group);
            
            // Unregister lights
            j.lights.forEach(light => {
              this.entityManager.unregisterEntity(light);
            });
            
            this.group.remove(j.group);
            const index = this.junk.indexOf(j);
            if (index >= 0) this.junk.splice(index, 1);
          }, 600); // Wait for fade out to complete
        }
        
        toRemove.push(chunkKey);
        this.activeChunks.delete(chunkKey); // Allow respawn if player returns
      }
    }
    
    // Remove empty chunk entries
    for (const key of toRemove) {
      this.junkByChunk.delete(key);
    }
  }
  
  private getJunkFromPool(): JunkPiece | null {
    const pooled = this.entityManager.getFromPool(EntityType.JUNK);
    if (pooled && (pooled as any).junkPiece) {
      return (pooled as any).junkPiece;
    }
    return null;
  }
  
  private returnJunkToPool(junk: JunkPiece) {
    // Store reference for pooling
    (junk.group as any).junkPiece = junk;
    this.entityManager.returnToPool(junk.group, EntityType.JUNK);
  }
}

function seededRandom(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

import * as THREE from 'three';

// Weapon stats that can be modified by ship upgrades
export interface WeaponStats {
  damage: number;          // Base damage
  speed: number;           // Projectile speed
  range: number;           // Maximum effective range
  turnRate?: number;       // Homing turn rate multiplier (optional)
  acquisitionRange?: number; // Target acquisition range (optional)
  lifetime?: number;       // How long projectile lives (optional)
}

export class Projectile {
  public id: string = '';
  public mesh: THREE.Group;
  private core: THREE.Mesh;
  private outer: THREE.Mesh;
  public velocity: THREE.Vector3;
  public lifetime: number;
  public damage: number;
  public baseDamage: number; // Original damage for degradation calculation
  public ownerId: string;
  public maxRange: number; // Maximum effective range
  public distanceTraveled: number = 0; // Track distance for damage falloff
  public startPosition: THREE.Vector3; // Where projectile was fired from
  private trail: THREE.Points;
  private trailPositions: Float32Array;
  private trailIndex: number = 0;
  private light: THREE.PointLight;
  private time: number = 0;
  private hoverHeight: number = 2.0; // Height to maintain above terrain
  private verticalSmoothing: number = 8.0; // How quickly to adjust to terrain changes
  
  // Homing missile properties
  private target: { position: THREE.Vector3, velocity?: THREE.Vector3, type: 'junk' | 'ship' } | null = null;
  private baseTurnRate: number = Math.PI / 2; // 90 degrees per second base turn rate
  private junkTurnRateMultiplier: number = 5.0; // Much faster turning for junk (450 deg/sec)
  private acquisitionCone: number = Math.PI / 2; // 90 degree cone for wider target acquisition
  private acquisitionRange: number = 50; // Increased range to acquire targets
  private trackingError: number = 0; // Random offset for imperfect tracking (ships only)
  private trackingErrorRate: number = 2; // How fast the error changes
  private lastTargetSearch: number = 0; // Time since last target search
  private searchInterval: number = 0.033; // Search for targets very frequently (30Hz - every 0.033 seconds)
  private lockStrength: number = 0; // How strong the lock is (0-1)
  
  private static coreGeometry: THREE.SphereGeometry;
  private static outerGeometry: THREE.SphereGeometry;
  private static coreMaterial: THREE.MeshStandardMaterial;
  private static outerMaterial: THREE.MeshStandardMaterial;
  
  constructor(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    stats: WeaponStats,
    ownerId: string = 'local'
  ) {
    // Create shared geometry/material on first use
    if (!Projectile.coreGeometry) {
      Projectile.coreGeometry = new THREE.SphereGeometry(0.08, 8, 6);
      Projectile.outerGeometry = new THREE.SphereGeometry(0.2, 12, 8);
      
      Projectile.coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 4.0,
        transparent: true,
        opacity: 1.0,
        toneMapped: false // Keep projectiles bright
      });
      
      Projectile.outerMaterial = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 3.0,
        transparent: true,
        opacity: 0.6,
        toneMapped: false
      });
    }
    
    this.mesh = new THREE.Group();
    
    // Create instance materials for this projectile (so we can fade individually)
    this.core = new THREE.Mesh(
      Projectile.coreGeometry, 
      Projectile.coreMaterial.clone()
    );
    this.mesh.add(this.core);
    
    this.outer = new THREE.Mesh(
      Projectile.outerGeometry, 
      Projectile.outerMaterial.clone()
    );
    this.mesh.add(this.outer);
    
    this.mesh.position.copy(position);
    this.startPosition = position.clone();
    
    // Set velocity in the given direction (horizontal only for terrain following)
    this.velocity = direction.normalize().multiplyScalar(stats.speed);
    this.velocity.y = 0; // No vertical component - we'll follow terrain instead
    
    this.lifetime = stats.lifetime || 2.0; // Default 2 seconds (shorter for faster decay)
    this.damage = stats.damage;
    this.baseDamage = stats.damage; // Store original damage
    this.maxRange = stats.range;
    this.ownerId = ownerId;
    
    // Apply custom stats to homing if provided
    if (stats.turnRate) {
      this.junkTurnRateMultiplier = stats.turnRate;
    }
    if (stats.acquisitionRange) {
      this.acquisitionRange = stats.acquisitionRange;
    }
    
    // Add much stronger glow effect
    this.light = new THREE.PointLight(0x00e5ff, 4.0, 20, 1.2);
    this.mesh.add(this.light);
    
    // Create enhanced trail effect
    const trailLength = 30;
    this.trailPositions = new Float32Array(trailLength * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    
    const trailMaterial = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    this.trail = new THREE.Points(trailGeometry, trailMaterial);
    this.mesh.add(this.trail);
  }
  
  // Set an initial target hint from the ship's targeting system
  setInitialTarget(targetPosition: THREE.Vector3) {
    // Only set if we don't already have a target
    if (!this.target) {
      this.target = { position: targetPosition, type: 'junk' };
      this.lockStrength = 0.5; // Start with moderate lock
      this.trackingError = 0;
    }
  }
  
  // Find and lock onto a target
  private acquireTarget(junkManager: any, shipPositions: Array<{position: THREE.Vector3, velocity?: THREE.Vector3, id: string}>) {
    const myPos = this.mesh.position;
    const forward = this.velocity.clone().normalize();
    
    let bestTarget: typeof this.target = null;
    let bestScore = Infinity;
    
    // Check junk targets (priority) - strongly prefer closer targets
    if (junkManager) {
      // Use a very small search radius to focus only on nearby junk
      const searchRadius = Math.min(15, this.acquisitionRange); // Max 15 units for initial acquisition
      const junkPieces = junkManager.getJunkInRadius(myPos, searchRadius);
      
      for (const junk of junkPieces) {
        const toTarget = junk.position.clone().sub(myPos);
        const distance = toTarget.length();
        
        if (distance < 0.2) continue; // Only skip if about to collide
        
        // Check if within acquisition cone
        toTarget.normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(forward.dot(toTarget), -1, 1));
        
        // More lenient angle for close targets
        const angleThreshold = distance < 10 ? this.acquisitionCone * 1.2 : this.acquisitionCone;
        
        if (angle <= angleThreshold) {
          // STRONGLY prioritize closer targets
          // Use exponential distance penalty to heavily favor nearby junk
          const distancePenalty = distance * distance * 0.1; // Quadratic penalty
          const anglePenalty = angle * 2;
          const score = distancePenalty + anglePenalty;
          
          if (score < bestScore) {
            bestScore = score;
            bestTarget = { position: junk.position, type: 'junk' };
          }
        }
      }
    }
    
    // If no junk found, check ships (but only if we don't already have a junk target)
    if (!bestTarget) {
      for (const ship of shipPositions) {
        if (ship.id === this.ownerId) continue; // Don't target own ship
        
        const toTarget = ship.position.clone().sub(myPos);
        const distance = toTarget.length();
        
        if (distance > this.acquisitionRange * 0.75 || distance < 3) continue; // Shorter range for ships
        
        toTarget.normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(forward.dot(toTarget), -1, 1));
        
        if (angle <= this.acquisitionCone * 0.75) { // Narrower cone for ships
          const score = distance + angle * 10 + 30; // Higher penalty for ships
          if (score < bestScore) {
            bestScore = score;
            bestTarget = { 
              position: ship.position, 
              velocity: ship.velocity,
              type: 'ship' 
            };
          }
        }
      }
    }
    
    this.target = bestTarget;
    
    // Initialize lock strength and tracking error
    if (this.target) {
      this.lockStrength = 0.2; // Start with weak lock
      if (this.target.type === 'ship') {
        this.trackingError = (Math.random() - 0.5) * 3; // Larger error for ships
      } else {
        this.trackingError = 0; // No error for junk - perfect tracking
      }
    }
  }
  
  // Update velocity to track target in full 3D
  private updateTracking(dt: number) {
    if (!this.target) return;
    
    // Increase lock strength over time - faster for junk
    const lockRate = this.target.type === 'junk' ? 5.0 : 2.0;
    this.lockStrength = Math.min(1.0, this.lockStrength + dt * lockRate); // Reach full lock in 0.2s for junk, 0.5s for ships
    
    const myPos = this.mesh.position;
    let targetPos = this.target.position.clone();
    
    // Different tracking behavior for junk vs ships
    if (this.target.type === 'ship' && this.target.velocity) {
      // For ships - imperfect prediction with wobble
      const timeToTarget = myPos.distanceTo(targetPos) / this.velocity.length();
      const prediction = this.target.velocity.clone().multiplyScalar(timeToTarget * 0.3); // Poor prediction
      targetPos.add(prediction);
      
      // Add wobbling tracking error
      this.trackingError += (Math.random() - 0.5) * this.trackingErrorRate * dt;
      this.trackingError = THREE.MathUtils.clamp(this.trackingError, -5, 5);
      
      // Apply error perpendicular to direction
      const toTarget = targetPos.clone().sub(myPos).normalize();
      const errorVector = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(this.trackingError);
      targetPos.add(errorVector);
    } else if (this.target.type === 'junk') {
      // For junk - EXTREMELY aggressive tracking at close range
      const distance = myPos.distanceTo(targetPos);
      
      // At very close range, directly steer toward target
      if (distance < 5) {
        // DIRECT steering - ignore physics, just go straight at it
        const directPath = targetPos.clone().sub(myPos).normalize();
        const steerStrength = (5 - distance) / 5; // 0 to 1 based on proximity
        
        // Blend current velocity with direct path
        this.velocity.lerp(directPath.multiplyScalar(this.velocity.length()), steerStrength);
      } else if (distance < 15) {
        // Medium range - strong magnetic pull
        const pullStrength = (15 - distance) / 15;
        const pullVector = targetPos.clone().sub(myPos).normalize().multiplyScalar(pullStrength * 20);
        this.velocity.add(pullVector.multiplyScalar(dt));
      }
    }
    
    // Calculate FULL 3D direction to target
    const toTarget = targetPos.clone().sub(myPos);
    const distance = toTarget.length();
    
    if (distance < 0.3) return; // Extremely close, about to hit
    
    const desired = toTarget.normalize();
    
    // Current direction in full 3D
    const current = this.velocity.clone().normalize();
    
    // Calculate separate turn rates for horizontal and vertical
    // PRIORITIZE VERTICAL TRACKING (1.5x faster) since that's the current weakness
    const horizontalTurnRate = this.target.type === 'junk' 
      ? this.baseTurnRate * this.junkTurnRateMultiplier * this.lockStrength
      : this.baseTurnRate;
    const verticalTurnRate = horizontalTurnRate * 1.5; // 50% faster vertical tracking
    
    // Calculate horizontal and vertical components
    const currentHorizontal = new THREE.Vector3(current.x, 0, current.z).normalize();
    const desiredHorizontal = new THREE.Vector3(desired.x, 0, desired.z).normalize();
    
    const horizontalAngle = Math.acos(THREE.MathUtils.clamp(currentHorizontal.dot(desiredHorizontal), -1, 1));
    const verticalDiff = desired.y - current.y; // Direct vertical difference
    
    // Apply turn rates
    const maxHorizontalTurn = horizontalTurnRate * dt;
    const maxVerticalChange = verticalTurnRate * dt;
    
    // Create new direction with separate H/V handling
    let newDirection = current.clone();
    
    // Horizontal adjustment
    if (horizontalAngle > 0.001) {
      const hTurnAmount = Math.min(horizontalAngle, maxHorizontalTurn);
      const hTurnRatio = hTurnAmount / horizontalAngle;
      
      // For junk, be MUCH more aggressive when close
      let finalHTurnRatio = hTurnRatio;
      if (this.target.type === 'junk') {
        if (distance < 5) {
          finalHTurnRatio = 1.0; // Instant turn at very close range
        } else if (distance < 10) {
          finalHTurnRatio = Math.min(1.0, hTurnRatio * 2.0);
        } else {
          finalHTurnRatio = Math.min(1.0, hTurnRatio * 1.5);
        }
      }
      
      const newHorizontal = currentHorizontal.multiplyScalar(1 - finalHTurnRatio)
        .add(desiredHorizontal.multiplyScalar(finalHTurnRatio)).normalize();
      
      newDirection.x = newHorizontal.x;
      newDirection.z = newHorizontal.z;
    }
    
    // Vertical adjustment - EXTREMELY AGGRESSIVE at close range
    if (Math.abs(verticalDiff) > 0.001) {
      const vChange = THREE.MathUtils.clamp(verticalDiff, -maxVerticalChange, maxVerticalChange);
      
      // For junk, allow instant vertical adjustment when very close
      let finalVChange = vChange;
      if (this.target.type === 'junk') {
        if (distance < 5) {
          finalVChange = verticalDiff; // Direct vertical alignment at close range
        } else if (distance < 10) {
          finalVChange = vChange * 3.0; // Triple vertical speed
        } else {
          finalVChange = vChange * 2.0; // Double vertical speed
        }
      }
      
      newDirection.y = THREE.MathUtils.clamp(current.y + finalVChange, -0.95, 0.95); // Allow steeper angles
    }
    
    newDirection.normalize();
    
    // Update velocity with new 3D direction
    const speed = this.velocity.length();
    this.velocity.copy(newDirection.multiplyScalar(speed));
    
    // Update visual effects based on lock status and strength
    if (this.target.type === 'junk') {
      // Intense red for junk lock - gets brighter with lock strength
      const intensity = 0x44 + Math.floor(0xBB * this.lockStrength);
      const color = 0xff0000 | (intensity << 8) | intensity; // Red with some yellow as lock strengthens
      this.light.color.setHex(color);
      this.outer.material.emissive.setHex(color);
      this.light.intensity = 4.0 + this.lockStrength * 4.0; // Brighter light when locked
    } else {
      // Orange for ship lock
      this.light.color.setHex(0xffaa00);
      this.outer.material.emissive.setHex(0xffaa00);
      this.light.intensity = 4.0 + this.lockStrength * 2.0;
    }
  }
  
  update(dt: number, world?: any, junkManager?: any, shipPositions?: Array<{position: THREE.Vector3, velocity?: THREE.Vector3, id: string}>): boolean {
    this.time += dt;
    
    // Search for targets periodically
    this.lastTargetSearch += dt;
    if (this.lastTargetSearch >= this.searchInterval) {
      this.lastTargetSearch = 0;
      
      // Always re-evaluate targets if we have access to junkManager
      if (junkManager && shipPositions) {
        // Check if current junk target still exists
        if (this.target && this.target.type === 'junk') {
          const junkStillExists = junkManager.getJunkInRadius(this.target.position, 1).length > 0;
          if (!junkStillExists) {
            this.target = null; // Target destroyed
          }
        }
        
        // Only switch targets if we find something MUCH closer
        const myPos = this.mesh.position;
        const currentTargetDistance = this.target ? myPos.distanceTo(this.target.position) : Infinity;
        let closestJunk = null;
        let closestDistance = currentTargetDistance * 0.7; // Only switch if 30% closer
        
        // Only look for new targets if current one is far or we have no target
        if (!this.target || currentTargetDistance > 10) {
          // Check for closer junk targets - use smaller search radius
          const searchRadius = Math.min(12, this.acquisitionRange); // Very limited search range
          const junkPieces = junkManager.getJunkInRadius(myPos, searchRadius);
          
          for (const junk of junkPieces) {
            const distance = junk.position.distanceTo(myPos);
            
            // Skip if too close (might be debris)
            if (distance < 0.5) continue;
            
            // Check if this junk is significantly closer than our current target
            if (distance < closestDistance) {
              // Also check if it's within our forward cone (don't track backwards)
              const forward = this.velocity.clone().normalize();
              const toTarget = junk.position.clone().sub(myPos).normalize();
              const angle = Math.acos(THREE.MathUtils.clamp(forward.dot(toTarget), -1, 1));
              
              if (angle <= this.acquisitionCone) {
                closestJunk = junk;
                closestDistance = distance;
              }
            }
          }
        }
        
        // Switch to closer junk if found
        if (closestJunk) {
          // If switching from another target, reset lock strength for smooth transition
          if (!this.target || this.target.position !== closestJunk.position) {
            this.lockStrength = 0.3; // Start with partial lock when switching
          }
          this.target = { position: closestJunk.position, type: 'junk' };
          this.trackingError = 0; // Perfect tracking for junk
        } else if (!this.target) {
          // No junk found and no current target, try to find a ship
          this.acquireTarget(junkManager, shipPositions);
        }
      }
    }
    
    // Update tracking if we have a target
    if (this.target) {
      this.updateTracking(dt);
    }
    
    // Update FULL 3D position - allow vertical movement!
    const oldPos = this.mesh.position.clone();
    this.mesh.position.addScaledVector(this.velocity, dt);
    
    // Terrain collision check - but allow flying above terrain
    if (world) {
      const groundY = world.sampleHeight(this.mesh.position.x, this.mesh.position.z);
      const minHeight = groundY + 1.0; // Minimum clearance above ground
      
      // Only constrain if below minimum height
      if (this.mesh.position.y < minHeight) {
        this.mesh.position.y = minHeight;
        // Bounce velocity upward if hitting ground
        if (this.velocity.y < 0) {
          this.velocity.y = Math.abs(this.velocity.y) * 0.5; // Bounce up with damping
        }
      }
    }
    
    // Animate core and outer glow
    const pulse = Math.sin(this.time * 15) * 0.5 + 0.5;
    this.core.scale.setScalar(0.8 + pulse * 0.4);
    this.outer.scale.setScalar(1.0 + pulse * 0.2);
    
    // Adjust light intensity based on lock status
    const baseIntensity = this.target ? 6.0 : 4.0;
    this.light.intensity = baseIntensity + pulse * 2.0;
    
    // Update trail
    if (this.trailIndex < this.trailPositions.length / 3) {
      const i = this.trailIndex * 3;
      this.trailPositions[i] = oldPos.x - this.mesh.position.x;
      this.trailPositions[i + 1] = oldPos.y - this.mesh.position.y;
      this.trailPositions[i + 2] = oldPos.z - this.mesh.position.z;
      this.trailIndex++;
      
      const geometry = this.trail.geometry as THREE.BufferGeometry;
      geometry.attributes.position.needsUpdate = true;
      geometry.setDrawRange(0, this.trailIndex);
    }
    
    // Update distance traveled
    this.distanceTraveled = this.mesh.position.distanceTo(this.startPosition);
    
    // Update lifetime
    this.lifetime -= dt;
    
    // Calculate range-based degradation (VERY aggressive)
    const rangePercent = Math.max(0, 1 - (this.distanceTraveled / this.maxRange));
    const maxLifetime = 1.2; // Short max lifetime
    const timePercent = Math.max(0, this.lifetime / maxLifetime);
    
    // Use whichever is worse (distance or time)
    const effectivePercent = Math.min(rangePercent, timePercent);
    
    // Damage degradation: 100% -> 5% based on range
    // Much sharper exponential decay
    const damagePercent = 0.05 + 0.95 * Math.pow(effectivePercent, 2.0);
    this.damage = this.baseDamage * damagePercent;
    
    // Visual degradation starts at 75% range/lifetime (earlier)
    if (effectivePercent < 0.75) {
      // VERY aggressive fading
      const fadePercent = effectivePercent / 0.75; // 0 to 1 as we approach death
      
      // Fade materials
      const coreMat = this.core.material as THREE.MeshStandardMaterial;
      const outerMat = this.outer.material as THREE.MeshStandardMaterial;
      
      // Fade to nearly invisible VERY quickly
      const cubedFade = fadePercent * fadePercent * fadePercent; // Cubed for extremely fast falloff
      coreMat.opacity = Math.max(0.01, cubedFade);
      outerMat.opacity = Math.max(0.01, cubedFade * 0.5);
      
      // Reduce emissive intensity to almost nothing
      coreMat.emissiveIntensity = cubedFade * 2.0;
      outerMat.emissiveIntensity = cubedFade * 1.5;
      
      // Fade light extremely aggressively
      const baseLightIntensity = this.target ? 6.0 : 4.0;
      this.light.intensity = baseLightIntensity * cubedFade; // Cubed for extreme falloff
      this.light.distance = 15 * cubedFade;
      
      // Shrink to almost nothing
      const scale = 0.1 + 0.9 * cubedFade;
      this.core.scale.setScalar(scale * (0.8 + pulse * 0.4));
      this.outer.scale.setScalar(scale * (1.0 + pulse * 0.2));
      
      // Fade trail completely
      const trailMat = this.trail.material as THREE.PointsMaterial;
      trailMat.opacity = Math.max(0.01, 0.6 * cubedFade);
      trailMat.size = Math.max(0.005, 0.1 * cubedFade);
    }
    
    // Destroy if exceeded range, lifetime expired, too low, or nearly invisible
    const shouldDestroy = this.distanceTraveled > this.maxRange || 
                         this.lifetime <= 0 || 
                         this.mesh.position.y < -10 ||
                         effectivePercent < 0.1; // Destroy earlier when faded to 10%
    
    return !shouldDestroy;
  }
  
  private createImpactEffect() {
    // Quick flash effect - scale up and fade out
    this.core.scale.setScalar(3);
    this.outer.scale.setScalar(4);
    this.light.intensity = 10;
    this.light.distance = 30;
    
    // Could add particle explosion here in the future
  }
  
  dispose() {
    // Clean up cloned materials
    if (this.core.material) (this.core.material as THREE.Material).dispose();
    if (this.outer.material) (this.outer.material as THREE.Material).dispose();
    
    // Clean up light and trail
    while (this.mesh.children.length > 0) {
      const child = this.mesh.children[0];
      this.mesh.remove(child);
      if (child instanceof THREE.Points) {
        (child.geometry as THREE.BufferGeometry).dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }
}
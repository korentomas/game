import * as THREE from 'three';
import { Input } from '../engine/input';
import { World } from '../world/World';
import { WeaponStats } from '../combat/Projectile';
import { ShipCustomization, ShipCustomizer } from './ShipCustomization';

// Map boundary configuration
const MAP_BOUNDS = {
  minX: -2500,
  maxX: 2500,
  minZ: -2500,
  maxZ: 2500
};

export class Ship {
  public group = new THREE.Group();
  public velocity = new THREE.Vector3();
  public heading = 0; // radians yaw
  public thrustPower = 20;
  public turnRate = 2.5; // rad/s
  public maxHull = 100;
  public hull = 100;
  public maxEnergy = 100;
  public energy = 100;
  private fireCooldown = 0;
  public isThrusting = false; // Track if player is actively thrusting
  public lights: any; // Light references for dynamic effects
  public customization: ShipCustomization;
  
  // Targeting system
  private currentTarget: { position: THREE.Vector3, object: any } | null = null;
  private targetHighlight: THREE.Mesh | null = null;
  public targetingStyle: 'brackets' | 'crosshair' | 'triangles' = 'brackets'; // Customizable
  
  // Weapon stats - can be upgraded
  public weaponStats: WeaponStats = {
    damage: 10,        // Base damage
    speed: 50,         // Projectile speed
    range: 20,         // Short range for close combat
    turnRate: 5.0,     // Strong homing aggressiveness for junk (450 deg/sec)
    acquisitionRange: 15, // Very short acquisition range - only nearby targets
    lifetime: 0.8      // Short lifetime (0.8 seconds)
  };

  constructor(customization?: ShipCustomization) {
    // Load or use provided customization
    this.customization = customization || ShipCustomizer.getDefault();
    
    // Create ship geometry based on model type
    const geometry = ShipCustomizer.createShipGeometry(this.customization.modelType);
    
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(this.customization.colors.primary),
        emissive: new THREE.Color(this.customization.colors.primary),
        emissiveIntensity: 0.2,
        roughness: 0.8, 
        metalness: 0.3 
      })
    );
    body.name = 'hull';
    body.position.y = 0.4;

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.8, 4),
      new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(this.customization.colors.secondary),
        emissive: new THREE.Color(this.customization.colors.engine),
        emissiveIntensity: 0.4  // Subtle glow
      })
    );
    nose.name = 'cockpit';
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.6, 1.1);

    // Enhanced engine glow with multiple lights - stronger for better reflection
    const engineColor = new THREE.Color(this.customization.colors.engine);
    const mainEngineLight = new THREE.PointLight(engineColor, 4.0, 25, 1.0);  // Much stronger and wider range
    mainEngineLight.position.set(0, 0.5, -0.9);
    mainEngineLight.castShadow = false; // Performance optimization
    
    // Additional accent lights - much brighter for reflection on particles
    const accentLight1 = new THREE.PointLight(0xff4d6d, 2.5, 18, 1.2);
    accentLight1.position.set(-0.3, 0.4, 0.5);
    accentLight1.castShadow = false;
    
    const accentLight2 = new THREE.PointLight(0xff4d6d, 2.5, 18, 1.2);
    accentLight2.position.set(0.3, 0.4, 0.5);
    accentLight2.castShadow = false;
    
    // Engine core with subtle but visible glow
    const engineCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12), 
      new THREE.MeshStandardMaterial({ 
        color: engineColor,
        emissive: engineColor,
        emissiveIntensity: 1.2,  // Moderate glow
        transparent: true,
        opacity: 0.9
      })
    );
    engineCore.name = 'engine';
    engineCore.position.copy(mainEngineLight.position);
    
    // Wing tip lights with moderate glow but strong light emission
    const wingTip1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ 
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 1.0,  // Subtle glow on the tips themselves
        transparent: true,
        opacity: 0.9
      })
    );
    wingTip1.position.set(-0.6, 0.3, -0.2);
    
    const wingTip2 = wingTip1.clone();
    wingTip2.position.set(0.6, 0.3, -0.2);
    
    // Add wing tip point lights for extra glow and particle illumination
    const wingLight1 = new THREE.PointLight(0x00ff88, 1.5, 12, 1.8);
    wingLight1.position.copy(wingTip1.position);
    wingLight1.castShadow = false;
    
    const wingLight2 = new THREE.PointLight(0x00ff88, 1.5, 12, 1.8);
    wingLight2.position.copy(wingTip2.position);
    wingLight2.castShadow = false;
    
    // Store light references for dynamic effects
    this.lights = {
      mainEngine: mainEngineLight,
      accent1: accentLight1,
      accent2: accentLight2,
      wing1: wingLight1,
      wing2: wingLight2
    };
    
    this.group.add(body, nose, mainEngineLight, accentLight1, accentLight2, engineCore, wingTip1, wingTip2, wingLight1, wingLight2);
  }

  get position() {
    return this.group.position;
  }
  
  applyCustomization(customization: ShipCustomization) {
    this.customization = customization;
    
    // Apply customization to existing meshes
    const config = ShipCustomizer.applyCustomization(this.group, customization);
    
    // Update ship stats based on model type
    const modelConfig = {
      fighter: { thrust: 20, turn: 2.5, hull: 100 },
      cruiser: { thrust: 16, turn: 1.8, hull: 150 },
      speeder: { thrust: 28, turn: 3.2, hull: 70 }
    };
    
    const stats = modelConfig[customization.modelType];
    this.thrustPower = stats.thrust;
    this.turnRate = stats.turn;
    this.maxHull = stats.hull;
    
    // Update engine light colors
    if (this.lights) {
      const engineColor = new THREE.Color(customization.colors.engine);
      this.lights.mainEngine.color = engineColor;
      
      // Update wing lights if they exist
      if (this.lights.wing1) {
        this.lights.wing1.color = engineColor;
        this.lights.wing2.color = engineColor;
      }
    }
    
    return config;
  }

  updateTargeting(junkManager: any) {
    // Clear previous highlight
    if (this.targetHighlight) {
      if (this.targetHighlight.parent) {
        this.targetHighlight.parent.remove(this.targetHighlight);
      }
      this.targetHighlight.geometry.dispose();
      (this.targetHighlight.material as THREE.Material).dispose();
      this.targetHighlight = null;
    }
    
    // Find best target in forward cone
    const shipPos = this.group.position;
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    
    // Targeting parameters
    const maxRange = 20; // Maximum targeting range
    const coneAngle = Math.PI / 4; // 45 degree cone (90 degrees total)
    const verticalTolerance = 10; // Allow targets up to 10 units above/below
    
    let bestTarget = null;
    let bestScore = Infinity;
    
    if (junkManager) {
      const nearbyJunk = junkManager.getJunkInRadius(shipPos, maxRange);
      
      for (const junk of nearbyJunk) {
        const toTarget = junk.position.clone().sub(shipPos);
        const distance = toTarget.length();
        
        if (distance < 1) continue; // Too close
        
        // Check if within forward cone
        const horizontalDir = new THREE.Vector3(toTarget.x, 0, toTarget.z).normalize();
        const angle = Math.acos(THREE.MathUtils.clamp(forward.dot(horizontalDir), -1, 1));
        
        // Check vertical difference
        const verticalDiff = Math.abs(toTarget.y);
        
        if (angle <= coneAngle && verticalDiff <= verticalTolerance) {
          // Score based on distance and angle (prefer closer and more centered)
          const angleScore = angle / coneAngle; // 0 to 1
          const distanceScore = distance / maxRange; // 0 to 1
          const score = distanceScore + angleScore * 0.5; // Distance is more important
          
          if (score < bestScore) {
            bestScore = score;
            bestTarget = junk;
          }
        }
      }
    }
    
    this.currentTarget = bestTarget ? { position: bestTarget.position, object: bestTarget } : null;
    
    // Create highlight for current target
    if (this.currentTarget && this.currentTarget.object) {
      const junk = this.currentTarget.object;
      const size = junk.size ? junk.size * 2 : 2;
      const time = performance.now() * 0.001;
      
      let geometry: THREE.BufferGeometry;
      let material: THREE.LineBasicMaterial | THREE.MeshBasicMaterial;
      
      switch (this.targetingStyle) {
        case 'brackets':
          // Corner brackets with gaps
          geometry = new THREE.BufferGeometry();
          const bracketVertices = new Float32Array([
            // Top-left bracket
            -size, size, 0,
            -size * 0.6, size, 0,
            -size, size, 0,
            -size, size * 0.6, 0,
            
            // Top-right bracket
            size, size, 0,
            size * 0.6, size, 0,
            size, size, 0,
            size, size * 0.6, 0,
            
            // Bottom-left bracket
            -size, -size, 0,
            -size * 0.6, -size, 0,
            -size, -size, 0,
            -size, -size * 0.6, 0,
            
            // Bottom-right bracket
            size, -size, 0,
            size * 0.6, -size, 0,
            size, -size, 0,
            size, -size * 0.6, 0,
          ]);
          geometry.setAttribute('position', new THREE.BufferAttribute(bracketVertices, 3));
          break;
          
        case 'crosshair':
          // Classic crosshair with center gap
          geometry = new THREE.BufferGeometry();
          const gap = size * 0.3;
          const crosshairVertices = new Float32Array([
            // Top line
            0, size * 1.2, 0,
            0, gap, 0,
            // Bottom line
            0, -gap, 0,
            0, -size * 1.2, 0,
            // Left line
            -size * 1.2, 0, 0,
            -gap, 0, 0,
            // Right line
            gap, 0, 0,
            size * 1.2, 0, 0,
          ]);
          geometry.setAttribute('position', new THREE.BufferAttribute(crosshairVertices, 3));
          break;
          
        case 'triangles':
          // Four triangles pointing inward
          geometry = new THREE.BufferGeometry();
          const triSize = size * 0.3;
          const triDist = size * 0.9;
          const triangleVertices = new Float32Array([
            // Top triangle
            0, triDist + triSize, 0,
            -triSize * 0.6, triDist, 0,
            0, triDist + triSize, 0,
            triSize * 0.6, triDist, 0,
            -triSize * 0.6, triDist, 0,
            triSize * 0.6, triDist, 0,
            
            // Bottom triangle
            0, -triDist - triSize, 0,
            -triSize * 0.6, -triDist, 0,
            0, -triDist - triSize, 0,
            triSize * 0.6, -triDist, 0,
            -triSize * 0.6, -triDist, 0,
            triSize * 0.6, -triDist, 0,
            
            // Left triangle
            -triDist - triSize, 0, 0,
            -triDist, -triSize * 0.6, 0,
            -triDist - triSize, 0, 0,
            -triDist, triSize * 0.6, 0,
            -triDist, -triSize * 0.6, 0,
            -triDist, triSize * 0.6, 0,
            
            // Right triangle
            triDist + triSize, 0, 0,
            triDist, -triSize * 0.6, 0,
            triDist + triSize, 0, 0,
            triDist, triSize * 0.6, 0,
            triDist, -triSize * 0.6, 0,
            triDist, triSize * 0.6, 0,
          ]);
          geometry.setAttribute('position', new THREE.BufferAttribute(triangleVertices, 3));
          break;
      }
      
      // Material with glow effect - more transparent
      material = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        linewidth: 3,
        transparent: true,
        opacity: 0.4,  // More transparent base
      });
      
      // Create main reticle
      this.targetHighlight = new THREE.LineSegments(geometry, material);
      this.targetHighlight.position.copy(this.currentTarget.position);
      
      // Add glow effect with additional geometry
      const glowGeometry = geometry.clone();
      const glowMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        linewidth: 8,
        transparent: true,
        opacity: 0.15,  // Very faint glow
      });
      const glowMesh = new THREE.LineSegments(glowGeometry, glowMaterial);
      this.targetHighlight.add(glowMesh);
      
      // Animations based on style
      if (this.targetingStyle === 'brackets') {
        this.targetHighlight.rotation.z = time * 1.5; // Slow rotation
      } else if (this.targetingStyle === 'crosshair') {
        // Crosshair pulsing scale
        const pulse = Math.sin(time * 3) * 0.1 + 1.0;
        this.targetHighlight.scale.setScalar(pulse);
      } else if (this.targetingStyle === 'triangles') {
        // Triangles rotate opposite direction
        this.targetHighlight.rotation.z = -time * 2;
      }
      
      // Pulse the opacity for all styles
      const pulse = Math.sin(time * 4) * 0.2 + 0.3;  // Subtle pulse, more transparent
      (this.targetHighlight.material as THREE.LineBasicMaterial).opacity = pulse;
      
      // Add to scene
      if (junk.group && junk.group.parent) {
        junk.group.parent.add(this.targetHighlight);
      }
    }
  }
  
  update(dt: number, input: Input, world: World, junkManager?: any) {
    // Update targeting system
    if (junkManager) {
      this.updateTargeting(junkManager);
    }
    // Turn with Q/E or mouse delta
    const { dx } = input.consumeMouseDelta();
    this.heading += dx * 0.002;
    if (input.isDown('q')) this.heading += this.turnRate * dt;
    if (input.isDown('e')) this.heading -= this.turnRate * dt;

    // Thrust with WASD relative to heading
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    let move = new THREE.Vector3();
    if (input.isDown('w')) move.add(forward);
    if (input.isDown('s')) move.sub(forward);
    if (input.isDown('a')) move.sub(right);
    if (input.isDown('d')) move.add(right);
    
    // Track if player is actively thrusting
    this.isThrusting = move.lengthSq() > 0;
    if (this.isThrusting) move.normalize();

    const boost = input.isDown('shift') ? 2.0 : 1.0;
    const accel = move.multiplyScalar(this.thrustPower * boost);

    // Automatic hover: target altitude over terrain (like before)
    const groundY = world.sampleHeight(this.group.position.x, this.group.position.z);
    const targetY = groundY + 2.0;
    const hoverError = targetY - this.group.position.y;
    const hoverAccel = THREE.MathUtils.clamp(hoverError * 5 - this.velocity.y * 3, -20, 20);

    // Subtle constant hover effect (gentle stutter)
    const time = performance.now() * 0.001;
    const hoverStutter = Math.sin(time * 3.2) * 0.8 + Math.sin(time * 5.1) * 0.4;

    this.velocity.x += accel.x * dt;
    this.velocity.z += accel.z * dt;
    this.velocity.y += (hoverAccel + hoverStutter) * dt;

    // Drag
    const drag = Math.exp(-dt * 2.0);
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    this.group.position.addScaledVector(this.velocity, dt);
    
    // Enforce map boundaries
    if (this.group.position.x < MAP_BOUNDS.minX) {
      this.group.position.x = MAP_BOUNDS.minX;
      this.velocity.x = Math.max(0, this.velocity.x); // Stop movement beyond boundary
    } else if (this.group.position.x > MAP_BOUNDS.maxX) {
      this.group.position.x = MAP_BOUNDS.maxX;
      this.velocity.x = Math.min(0, this.velocity.x);
    }
    
    if (this.group.position.z < MAP_BOUNDS.minZ) {
      this.group.position.z = MAP_BOUNDS.minZ;
      this.velocity.z = Math.max(0, this.velocity.z);
    } else if (this.group.position.z > MAP_BOUNDS.maxZ) {
      this.group.position.z = MAP_BOUNDS.maxZ;
      this.velocity.z = Math.min(0, this.velocity.z);
    }
    
    this.group.rotation.y = this.heading;

    // Dynamic light intensity based on thrust and movement for better particle reflection
    const speed = this.velocity.length();
    const baseIntensity = 1.0;
    const thrustBonus = this.isThrusting ? 1.5 : 0.8;
    const speedBonus = Math.min(speed * 0.3, 1.0);
    const lightMultiplier = baseIntensity + thrustBonus + speedBonus;

    if (this.lights) {
      // Make engine light pulse with thrust
      this.lights.mainEngine.intensity = 4.0 * lightMultiplier;
      
      // Accent lights pulse with general activity
      this.lights.accent1.intensity = 2.5 * (lightMultiplier * 0.8);
      this.lights.accent2.intensity = 2.5 * (lightMultiplier * 0.8);
      
      // Wing lights steady but responsive
      this.lights.wing1.intensity = 1.5 * (0.7 + lightMultiplier * 0.3);
      this.lights.wing2.intensity = 1.5 * (0.7 + lightMultiplier * 0.3);
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    // regen
    this.energy = Math.min(this.maxEnergy, this.energy + 12 * dt);
  }

  tryFire(projectileManager: any, world?: any): string | null {
    if (this.fireCooldown > 0 || this.energy < 5) return null;
    
    // Calculate base direction
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    
    // If we have a target, aim towards it
    let fireDirection = forward.clone();
    if (this.currentTarget) {
      // Calculate direction to target with some prediction
      const targetDir = this.currentTarget.position.clone().sub(this.group.position);
      const distance = targetDir.length();
      
      // Blend forward direction with target direction for smooth aiming
      // More weight to target direction when closer
      const targetWeight = Math.max(0.3, 1.0 - distance / 20);
      targetDir.normalize();
      
      fireDirection = forward.multiplyScalar(1 - targetWeight).add(targetDir.multiplyScalar(targetWeight)).normalize();
    }
    
    // Spawn from ship's position
    const muzzle = new THREE.Vector3();
    this.group.getWorldPosition(muzzle);
    
    // Add forward offset from the ship's front
    muzzle.addScaledVector(forward, 1.5); // Use forward, not fireDirection for spawn position
    
    // Account for ship's velocity
    const velocityOffset = this.velocity.clone().multiplyScalar(0.05);
    muzzle.add(velocityOffset);
    
    // Ensure projectile starts at proper height relative to terrain
    if (world) {
      const groundY = world.sampleHeight(muzzle.x, muzzle.z);
      muzzle.y = Math.max(this.group.position.y, groundY + 2.0);
    }
    
    // Spawn projectile aimed at target (or forward if no target)
    const projectileId = projectileManager.spawn(muzzle, fireDirection, this.weaponStats, 'local');
    
    // If we have a target, tell the projectile about it immediately
    if (this.currentTarget && projectileManager.getProjectileById) {
      const projectile = projectileManager.getProjectileById(projectileId);
      if (projectile) {
        // Set initial target for better tracking
        projectile.setInitialTarget(this.currentTarget.position);
      }
    }
    
    this.energy -= 5;
    this.fireCooldown = 0.15;
    
    return projectileId;
  }

  applyDamage(amount: number) {
    this.hull = Math.max(0, this.hull - amount);
  }
  
  // Cycle through targeting styles
  cycleTargetingStyle() {
    const styles: Array<'brackets' | 'crosshair' | 'triangles'> = ['brackets', 'crosshair', 'triangles'];
    const currentIndex = styles.indexOf(this.targetingStyle);
    this.targetingStyle = styles[(currentIndex + 1) % styles.length];
  }
  
  // Set specific targeting style (for weapon customization)
  setTargetingStyle(style: 'brackets' | 'crosshair' | 'triangles') {
    this.targetingStyle = style;
  }
  
  // Example upgrade methods for weapon customization
  upgradeWeaponDamage(multiplier: number) {
    this.weaponStats.damage *= multiplier;
  }
  
  upgradeWeaponRange(additionalRange: number) {
    this.weaponStats.range += additionalRange;
  }
  
  upgradeWeaponSpeed(speedBoost: number) {
    this.weaponStats.speed += speedBoost;
  }
  
  // Apply a complete weapon upgrade (e.g., from an item)
  applyWeaponUpgrade(upgrade: Partial<WeaponStats>) {
    if (upgrade.damage !== undefined) this.weaponStats.damage = upgrade.damage;
    if (upgrade.speed !== undefined) this.weaponStats.speed = upgrade.speed;
    if (upgrade.range !== undefined) this.weaponStats.range = upgrade.range;
    if (upgrade.turnRate !== undefined) this.weaponStats.turnRate = upgrade.turnRate;
    if (upgrade.acquisitionRange !== undefined) this.weaponStats.acquisitionRange = upgrade.acquisitionRange;
    if (upgrade.lifetime !== undefined) this.weaponStats.lifetime = upgrade.lifetime;
  }
  
  // Get map bounds for other systems
  static getMapBounds() {
    return { ...MAP_BOUNDS };
  }
  
  // Check if position is within bounds
  static isWithinBounds(x: number, z: number): boolean {
    return x >= MAP_BOUNDS.minX && x <= MAP_BOUNDS.maxX &&
           z >= MAP_BOUNDS.minZ && z <= MAP_BOUNDS.maxZ;
  }
}

import * as THREE from 'three';

export enum MaterialType {
  SCRAP_METAL = 'scrap_metal',
  ENERGY_CRYSTAL = 'energy_crystal',
  RARE_ALLOY = 'rare_alloy',
  PLASMA_CORE = 'plasma_core'
}

export interface MaterialConfig {
  type: MaterialType;
  color: number;
  emissiveColor: number;
  value: number;
  rarity: number; // 0-1, higher is rarer
  name: string;
}

export const MATERIALS: Record<MaterialType, MaterialConfig> = {
  [MaterialType.SCRAP_METAL]: {
    type: MaterialType.SCRAP_METAL,
    color: 0x888888,
    emissiveColor: 0x444444,
    value: 1,
    rarity: 0.6,
    name: 'Scrap Metal'
  },
  [MaterialType.ENERGY_CRYSTAL]: {
    type: MaterialType.ENERGY_CRYSTAL,
    color: 0x00ffff,
    emissiveColor: 0x00aaaa,
    value: 5,
    rarity: 0.3,
    name: 'Energy Crystal'
  },
  [MaterialType.RARE_ALLOY]: {
    type: MaterialType.RARE_ALLOY,
    color: 0xff8800,
    emissiveColor: 0xaa5500,
    value: 10,
    rarity: 0.09,
    name: 'Rare Alloy'
  },
  [MaterialType.PLASMA_CORE]: {
    type: MaterialType.PLASMA_CORE,
    color: 0xff00ff,
    emissiveColor: 0xaa00aa,
    value: 20,
    rarity: 0.01,
    name: 'Plasma Core'
  }
};

export class MaterialDrop {
  public mesh: THREE.Group;
  public type: MaterialType;
  public value: number;
  public lifetime: number = 30; // Seconds before despawn
  private rotationSpeed: THREE.Vector3;
  private floatOffset: number;
  private floatSpeed: number;
  private collected: boolean = false;
  private light: THREE.PointLight;
  private magnetRange: number = 8; // Range for auto-collection
  private magnetSpeed: number = 15;
  private spawnTime: number = Date.now(); // Track when material spawned
  private collectDelay: number = 0.5;
  private isMagnetizing: boolean = false;
  private magnetTarget: THREE.Vector3 | null = null;
  private targetPosition: THREE.Vector3 | null = null;
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private lastUpdateTime: number = Date.now();
  
  constructor(position: THREE.Vector3, type: MaterialType) {
    this.mesh = new THREE.Group();
    this.type = type;
    
    const config = MATERIALS[type];
    this.value = config.value;
    
    // Create floating crystal/cube
    const geometry = type === MaterialType.ENERGY_CRYSTAL 
      ? new THREE.OctahedronGeometry(0.3)
      : new THREE.BoxGeometry(0.4, 0.4, 0.4);
    
    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      emissive: config.emissiveColor,
      emissiveIntensity: 2.0,
      roughness: 0.3,
      metalness: 0.7
    });
    
    const crystal = new THREE.Mesh(geometry, material);
    this.mesh.add(crystal);
    
    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: config.emissiveColor,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.mesh.add(glow);
    
    // Add point light
    this.light = new THREE.PointLight(config.emissiveColor, 0.5, 5, 2);
    this.mesh.add(this.light);
    
    // Set position
    this.mesh.position.copy(position);
    
    // Random rotation and float parameters
    this.rotationSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    
    this.floatOffset = Math.random() * Math.PI * 2;
    this.floatSpeed = 2 + Math.random();
  }
  
  update(dt: number, playerPosition?: THREE.Vector3, isLocalPlayer: boolean = false): boolean {
    if (this.collected) return false;
    
    this.lifetime -= dt;
    if (this.lifetime <= 0) return false;
    
    if (this.lifetime < 3) {
      const alpha = this.lifetime / 3;
      this.mesh.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          child.material.opacity = alpha;
          child.material.transparent = true;
        }
      });
      this.light.intensity = 0.5 * alpha;
    }
    
    const timeSinceSpawn = (Date.now() - this.spawnTime) / 1000;
    if (isLocalPlayer && playerPosition && timeSinceSpawn > this.collectDelay) {
      const distance = this.mesh.position.distanceTo(playerPosition);
      
      if (distance < this.magnetRange) {
        const direction = new THREE.Vector3()
          .subVectors(playerPosition, this.mesh.position)
          .normalize();
        
        const pullStrength = 1 - (distance / this.magnetRange);
        const speed = this.magnetSpeed * pullStrength * dt;
        
        this.mesh.position.addScaledVector(direction, speed);
        this.isMagnetizing = true;
        this.magnetTarget = playerPosition.clone();
        
        if (distance < 1.5) {
          this.collected = true;
          return false;
        }
      } else {
        this.isMagnetizing = false;
        this.magnetTarget = null;
      }
    }
    
    this.mesh.rotation.x += this.rotationSpeed.x * dt;
    this.mesh.rotation.y += this.rotationSpeed.y * dt;
    this.mesh.rotation.z += this.rotationSpeed.z * dt;
    
    const floatHeight = Math.sin(Date.now() * 0.001 * this.floatSpeed + this.floatOffset) * 0.2;
    this.mesh.children[0].position.y = floatHeight;
    
    this.light.intensity = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
    
    return true;
  }
  
  isCollected(): boolean {
    return this.collected;
  }
  
  isMagnetizingTo(): boolean {
    return this.isMagnetizing;
  }
  
  getMagnetTarget(): THREE.Vector3 | null {
    return this.magnetTarget;
  }
  
  getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }
  
  setTargetPosition(position: THREE.Vector3) {
    if (!this.targetPosition) {
      this.targetPosition = position.clone();
      if (this.mesh.position.distanceTo(position) > 10) {
        this.mesh.position.copy(position);
      }
    } else {
      const now = Date.now();
      const dt = (now - this.lastUpdateTime) / 1000;
      if (dt > 0 && dt < 1) {
        this.velocity.subVectors(position, this.targetPosition).divideScalar(dt);
      }
      this.targetPosition.copy(position);
    }
    this.lastUpdateTime = Date.now();
  }
  
  updateRemote(dt: number) {
    if (this.targetPosition) {
      const predictedPos = this.targetPosition.clone().addScaledVector(this.velocity, dt * 0.5);
      
      const distance = this.mesh.position.distanceTo(predictedPos);
      let lerpFactor = 0.15;
      
      if (distance > 5) {
        lerpFactor = 0.3;
      } else if (distance < 0.5) {
        lerpFactor = 0.1;
      }
      
      this.mesh.position.lerp(predictedPos, lerpFactor);
      this.velocity.multiplyScalar(0.95);
    }
  }
  
  dispose() {
    this.mesh.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
  
  static getRandomType(rng: () => number = Math.random): MaterialType {
    const roll = rng();
    let cumulative = 0;
    
    for (const [type, config] of Object.entries(MATERIALS)) {
      cumulative += config.rarity;
      if (roll < cumulative) {
        return type as MaterialType;
      }
    }
    
    return MaterialType.SCRAP_METAL; // Fallback
  }
}
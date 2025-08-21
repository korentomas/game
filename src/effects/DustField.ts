import * as THREE from 'three';

export class DustField {
  public points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private geom: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  private rng: () => number;
  private count: number;
  private radius: number;
  
  // Performance tracking
  private lastUpdateTime = 0;
  private updateFrequency = 33; // 30fps updates
  private lodLevel: 'full' | 'medium' | 'low' = 'full';
  private visibleCount: number;
  
  // Movement tracking
  private currentCenter = new THREE.Vector3();
  private targetCenter = new THREE.Vector3();

  constructor(seed: string, count: number = 800, radius: number = 180) {
    this.count = count;
    this.visibleCount = count;
    this.radius = radius;
    this.rng = seededRandom(seed + 'dust');

    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    
    // Initialize particles around origin
    for (let i = 0; i < count; i++) {
      const theta = this.rng() * Math.PI * 2;
      const phi = Math.acos(2 * this.rng() - 1);
      const r = this.radius * Math.cbrt(this.rng()); // Cubic root for better volume distribution
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.3; // Flatten vertically
      const z = r * Math.cos(phi);
      
      this.positions[i * 3 + 0] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      
      // Small random velocities for organic movement
      this.velocities[i * 3 + 0] = (this.rng() - 0.5) * 0.02;
      this.velocities[i * 3 + 1] = (this.rng() - 0.5) * 0.01;
      this.velocities[i * 3 + 2] = (this.rng() - 0.5) * 0.02;
    }

    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Create material with better visibility settings
    this.mat = new THREE.PointsMaterial({
      color: 0x9fb3c7,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // Better for space dust
      vertexColors: false
    });

    this.points = new THREE.Points(this.geom, this.mat);
    
    // Set initial bounding sphere
    this.geom.computeBoundingSphere();
    if (this.geom.boundingSphere) {
      this.geom.boundingSphere.radius = this.radius * 2;
    }
  }

  update(playerPosition: THREE.Vector3, dt: number) {
    // Throttle updates based on LOD
    const now = performance.now();
    if (now - this.lastUpdateTime < this.updateFrequency) return;
    this.lastUpdateTime = now;
    
    // Instantly follow player position to prevent layering
    this.targetCenter.copy(playerPosition);
    this.currentCenter.copy(playerPosition); // No lerping - instant follow
    
    // Calculate how much the center has moved
    const centerDelta = new THREE.Vector3().subVectors(this.currentCenter, this.targetCenter);
    
    // Update particles
    const step = this.lodLevel === 'full' ? 1 : (this.lodLevel === 'medium' ? 2 : 3);
    
    for (let i = 0; i < this.visibleCount; i += step) {
      // Update velocities with slight random drift
      this.velocities[i * 3 + 0] += (this.rng() - 0.5) * 0.0005 * dt;
      this.velocities[i * 3 + 1] += (this.rng() - 0.5) * 0.00025 * dt;
      this.velocities[i * 3 + 2] += (this.rng() - 0.5) * 0.0005 * dt;
      
      // Damping to prevent runaway velocities
      this.velocities[i * 3 + 0] *= 0.98;
      this.velocities[i * 3 + 1] *= 0.98;
      this.velocities[i * 3 + 2] *= 0.98;
      
      // Update positions with velocity
      this.positions[i * 3 + 0] += this.velocities[i * 3 + 0] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      
      // Get particle position relative to current center
      const relX = this.positions[i * 3 + 0] - this.currentCenter.x;
      const relY = this.positions[i * 3 + 1] - this.currentCenter.y;
      const relZ = this.positions[i * 3 + 2] - this.currentCenter.z;
      
      // Check distance from center
      const distSq = relX * relX + relY * relY + relZ * relZ;
      const maxDistSq = this.radius * this.radius;
      
      // If particle is too far, instantly wrap it to opposite side
      if (distSq > maxDistSq) {
        const dist = Math.sqrt(distSq);
        
        // Wrap to exactly opposite side at edge of sphere
        // This prevents gaps by placing particles right at the boundary
        const scale = (this.radius * 0.95) / dist; // Slightly inside to ensure visibility
        
        // Calculate opposite position with minimal randomness
        const oppositeX = -relX * scale * (0.95 + this.rng() * 0.1);
        const oppositeY = -relY * scale * (0.95 + this.rng() * 0.1);
        const oppositeZ = -relZ * scale * (0.95 + this.rng() * 0.1);
        
        // Instantly move particle to opposite side (no lerping)
        this.positions[i * 3 + 0] = this.currentCenter.x + oppositeX;
        this.positions[i * 3 + 1] = this.currentCenter.y + oppositeY;
        this.positions[i * 3 + 2] = this.currentCenter.z + oppositeZ;
        
        // Reset velocity for wrapped particle
        this.velocities[i * 3 + 0] *= 0.5;
        this.velocities[i * 3 + 1] *= 0.5;
        this.velocities[i * 3 + 2] *= 0.5;
      } else {
        // Particle is within bounds, update normally
        this.positions[i * 3 + 0] = this.currentCenter.x + relX;
        this.positions[i * 3 + 1] = this.currentCenter.y + relY;
        this.positions[i * 3 + 2] = this.currentCenter.z + relZ;
      }
    }
    
    // Update geometry
    this.geom.attributes.position.needsUpdate = true;
    
    // Update bounding sphere to follow player
    if (this.geom.boundingSphere) {
      this.geom.boundingSphere.center.copy(this.currentCenter);
      this.geom.boundingSphere.radius = this.radius * 1.5;
    }
  }
  
  // Initialize particles around a specific center position
  initializeAroundCenter(center: THREE.Vector3) {
    this.currentCenter.copy(center);
    this.targetCenter.copy(center);
    
    for (let i = 0; i < this.count; i++) {
      const theta = this.rng() * Math.PI * 2;
      const phi = Math.acos(2 * this.rng() - 1);
      const r = this.radius * Math.cbrt(this.rng());
      
      const x = center.x + r * Math.sin(phi) * Math.cos(theta);
      const y = center.y + r * Math.sin(phi) * Math.sin(theta) * 0.3;
      const z = center.z + r * Math.cos(phi);
      
      this.positions[i * 3 + 0] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
    }
    
    this.geom.attributes.position.needsUpdate = true;
    
    if (this.geom.boundingSphere) {
      this.geom.boundingSphere.center.copy(center);
      this.geom.boundingSphere.radius = this.radius * 1.5;
    }
  }
  
  // LOD control
  setLOD(lodLevel: 'full' | 'medium' | 'low') {
    this.lodLevel = lodLevel;
    
    switch (lodLevel) {
      case 'full':
        this.visibleCount = this.count;
        this.updateFrequency = 33; // 30fps
        this.mat.size = 0.3;
        this.mat.opacity = 0.6;
        break;
      case 'medium':
        this.visibleCount = Math.floor(this.count * 0.7);
        this.updateFrequency = 50; // 20fps
        this.mat.size = 0.25;
        this.mat.opacity = 0.5;
        break;
      case 'low':
        this.visibleCount = Math.floor(this.count * 0.4);
        this.updateFrequency = 66; // 15fps
        this.mat.size = 0.2;
        this.mat.opacity = 0.4;
        break;
    }
    
    // Hide invisible particles
    for (let i = this.visibleCount; i < this.count; i++) {
      this.positions[i * 3 + 0] = 99999;
      this.positions[i * 3 + 1] = 99999;
      this.positions[i * 3 + 2] = 99999;
    }
    
    this.geom.attributes.position.needsUpdate = true;
  }
  
  getVisibleCount(): number {
    return this.visibleCount;
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
import * as THREE from 'three';

export interface ParticleOptions {
  maxParticles?: number;
  color?: number;
  size?: number;
  opacity?: number;
  additive?: boolean;
}

interface ParticleInternal {
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
}

export class ParticleSystem {
  public points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private alphas: Float32Array;
  private velocities: ParticleInternal[];
  private geom: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private max: number;
  private cursor = 0;
  
  // Performance optimization
  private activeCount = 0;

  constructor(options: ParticleOptions = {}) {
    this.max = options.maxParticles ?? 1000;
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 4); // RGBA instead of RGB
    this.alphas = new Float32Array(this.max); // Keep for internal tracking
    this.velocities = new Array(this.max);

    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geom.setAttribute('color', new THREE.BufferAttribute(this.colors, 4)); // 4 components for RGBA

    this.material = new THREE.PointsMaterial({
      size: options.size ?? 0.12,
      vertexColors: true,
      transparent: true,
      opacity: options.opacity ?? 1.0,
      depthWrite: false,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geom, this.material);
    this.clear();
  }

  clear() {
    for (let i = 0; i < this.max; i++) {
      this.positions[i * 3 + 0] = 99999;
      this.positions[i * 3 + 1] = 99999;
      this.positions[i * 3 + 2] = 99999;
      this.colors[i * 4 + 0] = 1; // R
      this.colors[i * 4 + 1] = 1; // G
      this.colors[i * 4 + 2] = 1; // B
      this.colors[i * 4 + 3] = 0; // A (alpha in color channel)
      this.alphas[i] = 0;
      this.velocities[i] = { life: 0, maxLife: 0, velocity: new THREE.Vector3() };
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.color.needsUpdate = true;
  }

  spawn(position: THREE.Vector3, velocity: THREE.Vector3, life: number, color: THREE.Color, alpha: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.positions[i * 3 + 0] = position.x;
    this.positions[i * 3 + 1] = position.y;
    this.positions[i * 3 + 2] = position.z;
    this.colors[i * 4 + 0] = color.r;
    this.colors[i * 4 + 1] = color.g;
    this.colors[i * 4 + 2] = color.b;
    this.colors[i * 4 + 3] = alpha; // Store alpha in color's alpha channel
    this.alphas[i] = alpha; // Keep for internal tracking
    this.velocities[i].life = life;
    this.velocities[i].maxLife = life;
    this.velocities[i].velocity.copy(velocity);
  }

  update(dt: number) {
    this.activeCount = 0;
    
    for (let i = 0; i < this.max; i++) {
      const v = this.velocities[i];
      if (v.life > 0) {
        this.activeCount++;
        v.life -= dt;
        const t = 1 - v.life / v.maxLife;
        // fade out
        const alpha = Math.max(0, 1 - t);
        this.alphas[i] = alpha;
        this.colors[i * 4 + 3] = alpha; // Update alpha in RGBA color
        this.positions[i * 3 + 0] += v.velocity.x * dt;
        this.positions[i * 3 + 1] += v.velocity.y * dt;
        this.positions[i * 3 + 2] += v.velocity.z * dt;
      } else if (this.alphas[i] !== 0) {
        // hide offscreen
        this.positions[i * 3 + 0] = 99999;
        this.positions[i * 3 + 1] = 99999;
        this.positions[i * 3 + 2] = 99999;
        this.alphas[i] = 0;
        this.colors[i * 4 + 3] = 0; // Set alpha to 0 in RGBA color
      }
    }
    
    // Force GPU buffer updates every frame for immediate particle visibility
    this.geom.attributes.position.needsUpdate = true;
    this.geom.attributes.color.needsUpdate = true;
    
    // Update bounding sphere for proper frustum culling
    this.geom.computeBoundingSphere();
  }
  
  getActiveCount(): number {
    return this.activeCount;
  }
  
  // LOD control
  setLOD(lodLevel: 'full' | 'medium' | 'low') {
    if (!this.material.userData.originalSize) {
      this.material.userData.originalSize = this.material.size;
    }
    
    switch (lodLevel) {
      case 'full':
        this.material.size = this.material.userData.originalSize;
        break;
      case 'medium':
        this.material.size = this.material.userData.originalSize * 0.9;
        break;
      case 'low':
        this.material.size = this.material.userData.originalSize * 0.8;
        break;
    }
  }
}

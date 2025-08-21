import * as THREE from 'three';

export class ExplosionEffect {
  private particles: THREE.Points;
  private velocities: THREE.Vector3[] = [];
  private lifetime: number = 1.0;
  private material: THREE.PointsMaterial;
  
  constructor(
    position: THREE.Vector3,
    color: number = 0x00e5ff,
    particleCount: number = 30,
    speed: number = 10
  ) {
    // Create particles
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    const particleColor = new THREE.Color(color);
    
    for (let i = 0; i < particleCount; i++) {
      // All particles start at the explosion center
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      
      // Random colors with variations
      const intensity = 0.5 + Math.random() * 0.5;
      colors[i * 3] = particleColor.r * intensity;
      colors[i * 3 + 1] = particleColor.g * intensity;
      colors[i * 3 + 2] = particleColor.b * intensity;
      
      // Random velocities in all directions
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = speed * (0.5 + Math.random() * 0.5);
      
      this.velocities.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      ));
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    this.material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.particles = new THREE.Points(geometry, this.material);
    this.particles.position.copy(position);
  }
  
  get mesh(): THREE.Points {
    return this.particles;
  }
  
  update(dt: number): boolean {
    this.lifetime -= dt;
    
    if (this.lifetime <= 0) {
      return false; // Effect finished
    }
    
    // Update particle positions
    const positions = this.particles.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < this.velocities.length; i++) {
      const vel = this.velocities[i];
      positions[i * 3] += vel.x * dt;
      positions[i * 3 + 1] += vel.y * dt;
      positions[i * 3 + 2] += vel.z * dt;
      
      // Apply gravity
      vel.y -= 15 * dt;
      
      // Apply drag
      vel.multiplyScalar(0.98);
    }
    
    this.particles.geometry.attributes.position.needsUpdate = true;
    
    // Fade out
    this.material.opacity = this.lifetime;
    
    return true;
  }
  
  dispose() {
    this.particles.geometry.dispose();
    this.material.dispose();
  }
}
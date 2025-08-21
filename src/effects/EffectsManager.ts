import * as THREE from 'three';
import { ExplosionEffect } from './ExplosionEffect';

interface Effect {
  mesh: THREE.Object3D;
  update(dt: number): boolean;
  dispose(): void;
}

export class EffectsManager {
  public group: THREE.Group;
  private effects: Effect[] = [];
  
  constructor() {
    this.group = new THREE.Group();
  }
  
  spawnExplosion(position: THREE.Vector3, color: number = 0x00e5ff) {
    const explosion = new ExplosionEffect(position, color, 40, 12);
    this.effects.push(explosion);
    this.group.add(explosion.mesh);
  }
  
  update(dt: number) {
    // Update all effects and remove finished ones
    const toRemove: Effect[] = [];
    
    this.effects.forEach(effect => {
      const alive = effect.update(dt);
      if (!alive) {
        toRemove.push(effect);
      }
    });
    
    // Remove finished effects
    toRemove.forEach(effect => {
      this.group.remove(effect.mesh);
      effect.dispose();
      const index = this.effects.indexOf(effect);
      if (index >= 0) {
        this.effects.splice(index, 1);
      }
    });
  }
  
  clear() {
    this.effects.forEach(effect => {
      this.group.remove(effect.mesh);
      effect.dispose();
    });
    this.effects = [];
  }
}
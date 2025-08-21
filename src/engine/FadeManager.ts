import * as THREE from 'three';

export interface FadeableEntity {
  group: THREE.Group;
  targetOpacity: number;
  fadeSpeed: number;
  isVisible: boolean;
}

export class FadeManager {
  private fadeEntities = new Map<THREE.Object3D, FadeableEntity>();
  private fadeInDuration = 0.8; // seconds to fade in
  private fadeOutDuration = 0.5; // seconds to fade out
  
  // Register an entity for fade effects
  registerEntity(entity: THREE.Object3D, shouldFadeIn: boolean = true) {
    if (this.fadeEntities.has(entity)) return;
    
    const fadeData: FadeableEntity = {
      group: entity as THREE.Group,
      targetOpacity: shouldFadeIn ? 1.0 : 0.0,
      fadeSpeed: shouldFadeIn ? (1.0 / this.fadeInDuration) : (1.0 / this.fadeOutDuration),
      isVisible: !shouldFadeIn
    };
    
    this.fadeEntities.set(entity, fadeData);
    
    // Set initial opacity
    if (shouldFadeIn) {
      this.setEntityOpacity(entity, 0.0);
      entity.visible = true;
    }
  }
  
  // Start fade out for an entity
  fadeOut(entity: THREE.Object3D) {
    const fadeData = this.fadeEntities.get(entity);
    if (!fadeData) return;
    
    fadeData.targetOpacity = 0.0;
    fadeData.fadeSpeed = 1.0 / this.fadeOutDuration;
    fadeData.isVisible = false;
  }
  
  // Start fade in for an entity
  fadeIn(entity: THREE.Object3D) {
    const fadeData = this.fadeEntities.get(entity);
    if (!fadeData) {
      this.registerEntity(entity, true);
      return;
    }
    
    fadeData.targetOpacity = 1.0;
    fadeData.fadeSpeed = 1.0 / this.fadeInDuration;
    fadeData.isVisible = true;
    entity.visible = true;
  }
  
  // Update all fading entities
  update(dt: number) {
    for (const [entity, fadeData] of this.fadeEntities) {
      const currentOpacity = this.getEntityOpacity(entity);
      
      if (Math.abs(currentOpacity - fadeData.targetOpacity) > 0.01) {
        let newOpacity = currentOpacity;
        
        if (currentOpacity < fadeData.targetOpacity) {
          // Fade in
          newOpacity = Math.min(fadeData.targetOpacity, currentOpacity + fadeData.fadeSpeed * dt);
        } else {
          // Fade out
          newOpacity = Math.max(fadeData.targetOpacity, currentOpacity - fadeData.fadeSpeed * dt);
        }
        
        this.setEntityOpacity(entity, newOpacity);
        
        // Hide entity when fully faded out
        if (newOpacity <= 0.01 && !fadeData.isVisible) {
          entity.visible = false;
        }
      } else {
        // Fade complete - clean up if faded out
        if (fadeData.targetOpacity <= 0.01 && !fadeData.isVisible) {
          entity.visible = false;
        }
      }
    }
  }
  
  // Clean up entity from fade tracking
  unregisterEntity(entity: THREE.Object3D) {
    this.fadeEntities.delete(entity);
  }
  
  // Set opacity for an entity and all its children
  private setEntityOpacity(entity: THREE.Object3D, opacity: number) {
    entity.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach(mat => {
            mat.transparent = true;
            mat.opacity = opacity;
          });
        } else {
          material.transparent = true;
          material.opacity = opacity;
        }
      } else if (child instanceof THREE.Points) {
        const material = child.material as THREE.PointsMaterial;
        material.transparent = true;
        material.opacity = opacity;
      } else if (child instanceof THREE.Light && (child as any).intensity !== undefined) {
        // Fade light intensity but preserve original values
        const originalIntensity = child.userData.fadeOriginalIntensity || (child as any).intensity;
        child.userData.fadeOriginalIntensity = originalIntensity;
        (child as any).intensity = originalIntensity * opacity;
      }
    });
  }
  
  // Get current opacity of an entity
  private getEntityOpacity(entity: THREE.Object3D): number {
    let opacity = 1.0;
    
    entity.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material;
        if (Array.isArray(material)) {
          if (material.length > 0) opacity = material[0].opacity;
        } else {
          opacity = material.opacity;
        }
        return; // Use first found material
      }
    });
    
    return opacity;
  }
  
  // Get stats for debug
  getStats() {
    return {
      totalFading: this.fadeEntities.size,
      fadingIn: Array.from(this.fadeEntities.values()).filter(f => f.targetOpacity > 0.5).length,
      fadingOut: Array.from(this.fadeEntities.values()).filter(f => f.targetOpacity < 0.5).length
    };
  }
}
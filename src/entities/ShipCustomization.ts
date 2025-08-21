import * as THREE from 'three';

export interface ShipColors {
  primary: string;      // Main hull color
  secondary: string;    // Accent/stripe color
  engine: string;       // Engine glow color
  trail: string;        // Thruster trail color
}

export interface ShipCustomization {
  colors: ShipColors;
  modelType: 'fighter' | 'cruiser' | 'speeder';
  decalType: 'none' | 'stripes' | 'flames' | 'stars';
}

export class ShipCustomizer {
  private static defaultColors: ShipColors = {
    primary: '#ff4444',    // Red
    secondary: '#222222',  // Dark gray
    engine: '#00e5ff',     // Cyan
    trail: '#ff6600'       // Orange
  };
  
  private static modelConfigs = {
    fighter: {
      scale: 1.0,
      speed: 1.0,
      agility: 1.2,
      armor: 0.9
    },
    cruiser: {
      scale: 1.3,
      speed: 0.8,
      agility: 0.7,
      armor: 1.5
    },
    speeder: {
      scale: 0.8,
      speed: 1.4,
      agility: 1.5,
      armor: 0.6
    }
  };
  
  static getDefault(): ShipCustomization {
    return {
      colors: { ...this.defaultColors },
      modelType: 'fighter',
      decalType: 'none'
    };
  }
  
  static loadFromLocalStorage(playerId: string): ShipCustomization | null {
    const key = `ship_customization_${playerId}`;
    const data = localStorage.getItem(key);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('Failed to load ship customization:', e);
      }
    }
    return null;
  }
  
  static saveToLocalStorage(playerId: string, customization: ShipCustomization) {
    try {
      const key = `ship_customization_${playerId}`;
      // Only save essential data, not the entire object
      const dataToSave = {
        colors: customization.colors,
        modelType: customization.modelType,
        decalType: customization.decalType
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    } catch (e) {
      // Handle quota exceeded error gracefully
      console.warn('Failed to save ship customization to localStorage:', e);
      // Try to clear old data if quota exceeded
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        try {
          // Clear old chunk cache data which takes up most space
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('chunk_')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
          console.log(`Cleared ${keysToRemove.length} old chunk cache entries`);
          // Try again after clearing
          const key = `ship_customization_${playerId}`;
          localStorage.setItem(key, JSON.stringify(customization));
        } catch (retryError) {
          console.error('Still failed after clearing cache:', retryError);
        }
      }
    }
  }
  
  static applyCustomization(
    shipGroup: THREE.Group,
    customization: ShipCustomization
  ) {
    const config = this.modelConfigs[customization.modelType];
    
    // Apply scale based on model type
    shipGroup.scale.setScalar(config.scale);
    
    // Apply colors to ship meshes
    shipGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        
        // Determine which color to apply based on mesh name or position
        if (child.name === 'hull' || child.name === 'body' || !child.name) {
          // Main hull
          material.color = new THREE.Color(customization.colors.primary);
          material.emissive = new THREE.Color(customization.colors.primary);
          material.emissiveIntensity = 0.2;
        } else if (child.name === 'cockpit' || child.name === 'window') {
          // Cockpit windows - keep them glowing cyan
          material.color = new THREE.Color(customization.colors.engine);
          material.emissive = new THREE.Color(customization.colors.engine);
          material.emissiveIntensity = 0.8;
        } else if (child.name === 'engine' || child.name === 'thruster') {
          // Engine parts
          material.color = new THREE.Color(customization.colors.secondary);
          material.emissive = new THREE.Color(customization.colors.engine);
          material.emissiveIntensity = 0.5;
        }
        
        // Apply decal patterns
        if (customization.decalType !== 'none') {
          this.applyDecal(child, customization.decalType, customization.colors.secondary);
        }
      }
    });
    
    return config;
  }
  
  private static applyDecal(
    mesh: THREE.Mesh,
    decalType: string,
    color: string
  ) {
    // For now, we'll modify the material properties
    // In a full implementation, you'd use texture maps or geometry modifications
    const material = mesh.material as THREE.MeshStandardMaterial;
    
    switch (decalType) {
      case 'stripes':
        // Add metallic stripes effect
        material.metalness = 0.8;
        material.roughness = 0.2;
        break;
      case 'flames':
        // Add emissive flames effect
        material.emissive = new THREE.Color(color);
        material.emissiveIntensity = 0.3;
        break;
      case 'stars':
        // Add sparkly effect
        material.metalness = 0.9;
        material.roughness = 0.1;
        break;
    }
  }
  
  static createShipGeometry(modelType: 'fighter' | 'cruiser' | 'speeder'): THREE.BufferGeometry {
    switch (modelType) {
      case 'fighter':
        return this.createFighterGeometry();
      case 'cruiser':
        return this.createCruiserGeometry();
      case 'speeder':
        return this.createSpeederGeometry();
      default:
        return this.createFighterGeometry();
    }
  }
  
  private static createFighterGeometry(): THREE.BufferGeometry {
    // Classic fighter design - balanced
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.5);
    shape.lineTo(-0.4, -0.3);
    shape.lineTo(-0.2, -0.5);
    shape.lineTo(0.2, -0.5);
    shape.lineTo(0.4, -0.3);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 3
    });
    
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(2, 2, 2);
    
    return geometry;
  }
  
  private static createCruiserGeometry(): THREE.BufferGeometry {
    // Bulky cruiser design - tanky
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.6);
    shape.lineTo(-0.5, -0.2);
    shape.lineTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, -0.2);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.4,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.08,
      bevelSegments: 3
    });
    
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(2.2, 2.2, 2.2);
    
    return geometry;
  }
  
  private static createSpeederGeometry(): THREE.BufferGeometry {
    // Sleek speeder design - fast
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.7);
    shape.lineTo(-0.3, -0.4);
    shape.lineTo(-0.1, -0.6);
    shape.lineTo(0.1, -0.6);
    shape.lineTo(0.3, -0.4);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2
    });
    
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(1.8, 1.8, 1.8);
    
    return geometry;
  }
  
  static generateRandomCustomization(): ShipCustomization {
    const colors = [
      '#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff',
      '#ff8800', '#00ff88', '#8800ff', '#ff0088', '#88ff00', '#0088ff'
    ];
    
    const secondaryColors = [
      '#222222', '#ffffff', '#444444', '#888888', '#000000'
    ];
    
    const engineColors = [
      '#00e5ff', '#ff00ff', '#00ff00', '#ffff00', '#ff8800'
    ];
    
    const models: Array<'fighter' | 'cruiser' | 'speeder'> = ['fighter', 'cruiser', 'speeder'];
    const decals: Array<'none' | 'stripes' | 'flames' | 'stars'> = ['none', 'stripes', 'flames', 'stars'];
    
    return {
      colors: {
        primary: colors[Math.floor(Math.random() * colors.length)],
        secondary: secondaryColors[Math.floor(Math.random() * secondaryColors.length)],
        engine: engineColors[Math.floor(Math.random() * engineColors.length)],
        trail: engineColors[Math.floor(Math.random() * engineColors.length)]
      },
      modelType: models[Math.floor(Math.random() * models.length)],
      decalType: decals[Math.floor(Math.random() * decals.length)]
    };
  }
}
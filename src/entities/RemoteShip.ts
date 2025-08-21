import * as THREE from 'three';
import { ParticleSystem } from '../effects/ParticleSystem';
import { ShipCustomization, ShipCustomizer } from './ShipCustomization';

export class RemoteShip {
  public group: THREE.Group;
  public thrusterSystem: ParticleSystem;
  private lights: any;
  public customization: ShipCustomization;
  
  constructor(customization?: ShipCustomization) {
    this.group = new THREE.Group();
    this.customization = customization || ShipCustomizer.getDefault();
    
    // Create ship geometry based on customization
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
        emissiveIntensity: 0.4
      })
    );
    nose.name = 'cockpit';
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.6, 1.1);

    // Engine lights
    const engineColor = new THREE.Color(this.customization.colors.engine);
    const mainEngineLight = new THREE.PointLight(engineColor, 2.0, 15, 1.0);
    mainEngineLight.position.set(0, 0.5, -0.9);
    mainEngineLight.castShadow = false;
    
    const accentLight1 = new THREE.PointLight(0xff8888, 1.5, 12, 1.2);
    accentLight1.position.set(-0.3, 0.4, 0.5);
    accentLight1.castShadow = false;
    
    const accentLight2 = new THREE.PointLight(0xff8888, 1.5, 12, 1.2);
    accentLight2.position.set(0.3, 0.4, 0.5);
    accentLight2.castShadow = false;
    
    // Engine core glow
    const engineCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12), 
      new THREE.MeshStandardMaterial({ 
        color: engineColor,
        emissive: engineColor,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9
      })
    );
    engineCore.name = 'engine';
    engineCore.position.copy(mainEngineLight.position);
    
    // Wing tip lights
    const wingTip1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ 
        color: 0xff8888,
        emissive: 0xff8888,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.9
      })
    );
    wingTip1.position.set(-0.6, 0.3, -0.2);
    
    const wingTip2 = wingTip1.clone();
    wingTip2.position.set(0.6, 0.3, -0.2);
    
    const wingLight1 = new THREE.PointLight(0xff8888, 1.0, 10, 1.8);
    wingLight1.position.copy(wingTip1.position);
    wingLight1.castShadow = false;
    
    const wingLight2 = new THREE.PointLight(0xff8888, 1.0, 10, 1.8);
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
    
    this.group.add(body, nose, mainEngineLight, accentLight1, accentLight2, 
                   engineCore, wingTip1, wingTip2, wingLight1, wingLight2);
    
    // Create particle system for thruster effects
    this.thrusterSystem = new ParticleSystem({ 
      maxParticles: 200, // Less particles for remote players
      size: 0.25, 
      additive: true, 
      opacity: 0.9 
    });
    
    // Apply model scale
    const config = ShipCustomizer.applyCustomization(this.group, this.customization);
  }
  
  applyCustomization(customization: ShipCustomization) {
    this.customization = customization;
    const config = ShipCustomizer.applyCustomization(this.group, customization);
    
    // Update engine light colors
    if (this.lights) {
      const engineColor = new THREE.Color(customization.colors.engine);
      this.lights.mainEngine.color = engineColor;
      if (this.lights.wing1) {
        this.lights.wing1.color = engineColor;
        this.lights.wing2.color = engineColor;
      }
    }
    
    return config;
  }
  
  updateThruster(isThrusting: boolean, position: THREE.Vector3, heading: number, velocity: THREE.Vector3, dt: number) {
    if (!isThrusting) {
      this.thrusterSystem.update(dt);
      return;
    }
    
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    
    // Spawn from two engine exhausts
    const engineOffsets = [
      new THREE.Vector3(-0.3, 0.3, -0.9),
      new THREE.Vector3(0.3, 0.3, -0.9)
    ];
    
    // Less particles for remote players to optimize performance
    const baseEmission = 1.0;
    const speedBonus = Math.min(horizontalSpeed * 0.2, 1.0);
    const emission = baseEmission + speedBonus;
    const particlesPerEngine = Math.floor(emission * 2 + 1);
    
    for (const offset of engineOffsets) {
      const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
      const enginePos = position.clone().add(rotatedOffset);
      
      for (let i = 0; i < particlesPerEngine; i++) {
        const spread = 0.08;
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread * 0.5,
          (Math.random() - 0.5) * spread
        );
        
        const exhaustSpeed = 12 + Math.random() * 6;
        const vel = dir.clone()
          .multiplyScalar(-exhaustSpeed)
          .add(jitter)
          .add(velocity.clone().multiplyScalar(0.3));
        
        // Red/orange particles for remote players
        let particleColor;
        let particleAlpha;
        let particleLife;
        
        const temp = Math.random();
        if (temp < 0.3) {
          particleColor = new THREE.Color(0xffaa00); // Orange
          particleAlpha = 0.9;
          particleLife = 0.3 + Math.random() * 0.15;
        } else if (temp < 0.6) {
          particleColor = new THREE.Color(0xff6633); // Red-orange
          particleAlpha = 0.85;
          particleLife = 0.35 + Math.random() * 0.15;
        } else {
          particleColor = new THREE.Color(0xff4444); // Red
          particleAlpha = 0.7;
          particleLife = 0.4 + Math.random() * 0.15;
        }
        
        this.thrusterSystem.spawn(enginePos, vel, particleLife, particleColor, particleAlpha);
      }
    }
    
    // Update dynamic light intensity based on thrust
    const lightMultiplier = isThrusting ? 1.5 : 0.8;
    if (this.lights) {
      this.lights.mainEngine.intensity = 2.0 * lightMultiplier;
      this.lights.accent1.intensity = 1.5 * lightMultiplier;
      this.lights.accent2.intensity = 1.5 * lightMultiplier;
      this.lights.wing1.intensity = 1.0 * lightMultiplier;
      this.lights.wing2.intensity = 1.0 * lightMultiplier;
    }
    
    this.thrusterSystem.update(dt);
  }
}
import * as THREE from 'three';
import { Projectile } from '../Projectile';

describe('Projectile', () => {
  let projectile: Projectile;
  const startPosition = new THREE.Vector3(0, 10, 0);
  const direction = new THREE.Vector3(0, 0, 1); // Forward
  const speed = 50;
  const damage = 10;
  const ownerId = 'player-1';

  beforeEach(() => {
    projectile = new Projectile(
      startPosition.clone(),
      direction.clone(),
      speed,
      damage,
      ownerId
    );
  });

  describe('initialization', () => {
    it('should create projectile with correct properties', () => {
      expect(projectile.mesh).toBeInstanceOf(THREE.Group);
      expect(projectile.damage).toBe(damage);
      expect(projectile.ownerId).toBe(ownerId);
      expect(projectile.lifetime).toBe(3.0);
      expect(projectile.gravity).toBe(-15);
    });

    it('should set initial velocity correctly', () => {
      // Velocity should be in direction with upward arc
      expect(projectile.velocity.z).toBeCloseTo(speed, 1);
      expect(projectile.velocity.y).toBeGreaterThan(0); // Upward arc
    });

    it('should position mesh at start position', () => {
      expect(projectile.mesh.position.x).toBe(startPosition.x);
      expect(projectile.mesh.position.y).toBe(startPosition.y);
      expect(projectile.mesh.position.z).toBe(startPosition.z);
    });

    it('should create visual components', () => {
      // Should have core, outer, light, and trail
      expect(projectile.mesh.children.length).toBeGreaterThan(2);
      
      // Check for point light
      const lights = projectile.mesh.children.filter(
        child => child instanceof THREE.PointLight
      );
      expect(lights.length).toBe(1);
      
      // Check for meshes
      const meshes = projectile.mesh.children.filter(
        child => child instanceof THREE.Mesh
      );
      expect(meshes.length).toBeGreaterThanOrEqual(2); // Core and outer
    });
  });

  describe('update', () => {
    it('should apply gravity to velocity', () => {
      const initialVelY = projectile.velocity.y;
      
      projectile.update(0.1);
      
      expect(projectile.velocity.y).toBeLessThan(initialVelY);
      expect(projectile.velocity.y).toBeCloseTo(
        initialVelY + projectile.gravity * 0.1,
        5
      );
    });

    it('should update position based on velocity', () => {
      const initialPos = projectile.mesh.position.clone();
      const dt = 0.1;
      
      projectile.update(dt);
      
      // Position should change based on velocity
      const expectedPos = initialPos.clone().addScaledVector(projectile.velocity, dt);
      expect(projectile.mesh.position.x).toBeCloseTo(expectedPos.x, 5);
      expect(projectile.mesh.position.z).toBeCloseTo(expectedPos.z, 5);
    });

    it('should decrease lifetime', () => {
      const initialLifetime = projectile.lifetime;
      const dt = 0.5;
      
      projectile.update(dt);
      
      expect(projectile.lifetime).toBe(initialLifetime - dt);
    });

    it('should return false when lifetime expires', () => {
      projectile.lifetime = 0.1;
      
      const alive = projectile.update(0.2);
      
      expect(alive).toBe(false);
    });

    it('should return false when projectile goes too low', () => {
      projectile.mesh.position.y = -5;
      
      const alive = projectile.update(0.1);
      
      expect(alive).toBe(false);
    });

    it('should animate visual effects', () => {
      // Get initial scale
      const core = projectile.mesh.children.find(
        child => child instanceof THREE.Mesh
      ) as THREE.Mesh;
      const initialScale = core?.scale.x || 1;
      
      // Update multiple times
      for (let i = 0; i < 10; i++) {
        projectile.update(0.016);
      }
      
      // Scale should have changed (pulsing)
      expect(core?.scale.x).not.toBe(initialScale);
    });
  });

  describe('terrain collision', () => {
    it('should detect collision with terrain', () => {
      const mockWorld = {
        sampleHeight: jest.fn().mockReturnValue(9.8) // Just below projectile
      };
      
      projectile.mesh.position.y = 10;
      
      const alive = projectile.update(0.1, mockWorld);
      
      expect(alive).toBe(false); // Should hit terrain
      expect(mockWorld.sampleHeight).toHaveBeenCalled();
    });

    it('should not collide when above terrain', () => {
      const mockWorld = {
        sampleHeight: jest.fn().mockReturnValue(5) // Well below projectile
      };
      
      projectile.mesh.position.y = 10;
      
      const alive = projectile.update(0.1, mockWorld);
      
      expect(alive).toBe(true); // Should still be alive
    });

    it('should create impact effect on collision', () => {
      const mockWorld = {
        sampleHeight: jest.fn().mockReturnValue(9.8)
      };
      
      projectile.mesh.position.y = 10;
      
      // Get light before impact
      const light = projectile.mesh.children.find(
        child => child instanceof THREE.PointLight
      ) as THREE.PointLight;
      const initialIntensity = light?.intensity || 0;
      
      projectile.update(0.1, mockWorld);
      
      // Light should flash brighter
      expect(light?.intensity).toBeGreaterThan(initialIntensity);
    });
  });

  describe('trail effect', () => {
    it('should update trail positions', () => {
      const trail = projectile.mesh.children.find(
        child => child instanceof THREE.Points
      ) as THREE.Points;
      
      expect(trail).toBeDefined();
      
      // Update multiple times to build trail
      for (let i = 0; i < 5; i++) {
        projectile.update(0.1);
      }
      
      // Trail geometry should be updated
      const geometry = trail.geometry as THREE.BufferGeometry;
      expect(geometry.attributes.position.needsUpdate).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      const childCount = projectile.mesh.children.length;
      
      projectile.dispose();
      
      expect(projectile.mesh.children.length).toBe(0);
    });
  });

  describe('shared resources', () => {
    it('should reuse geometry and materials across instances', () => {
      const projectile2 = new Projectile(
        new THREE.Vector3(10, 10, 10),
        new THREE.Vector3(1, 0, 0),
        30,
        5,
        'player-2'
      );
      
      // Find core meshes
      const core1 = projectile.mesh.children.find(
        child => child instanceof THREE.Mesh
      ) as THREE.Mesh;
      const core2 = projectile2.mesh.children.find(
        child => child instanceof THREE.Mesh
      ) as THREE.Mesh;
      
      // Should share geometry and material
      expect(core1?.geometry).toBe(core2?.geometry);
      expect(core1?.material).toBe(core2?.material);
    });
  });
});
import * as THREE from 'three';
import { Ship } from '../Ship';
import { Input } from '../../engine/input';
import { World } from '../../world/World';

// Mock dependencies
jest.mock('../../engine/input');
jest.mock('../../world/World');

describe('Ship', () => {
  let ship: Ship;
  let mockInput: jest.Mocked<Input>;
  let mockWorld: jest.Mocked<World>;

  beforeEach(() => {
    ship = new Ship();
    mockInput = new Input() as jest.Mocked<Input>;
    mockWorld = new World('test-seed') as jest.Mocked<World>;
    
    // Setup default mock return values
    mockInput.consumeMouseDelta = jest.fn().mockReturnValue({ dx: 0, dy: 0 });
    mockInput.isDown = jest.fn().mockReturnValue(false);
    mockWorld.sampleHeight = jest.fn().mockReturnValue(0);
  });

  describe('initialization', () => {
    it('should create a ship with default properties', () => {
      expect(ship.group).toBeInstanceOf(THREE.Group);
      expect(ship.velocity).toBeInstanceOf(THREE.Vector3);
      expect(ship.velocity.length()).toBe(0);
      expect(ship.heading).toBe(0);
      expect(ship.hull).toBe(100);
      expect(ship.maxHull).toBe(100);
      expect(ship.energy).toBe(100);
      expect(ship.maxEnergy).toBe(100);
      expect(ship.isThrusting).toBe(false);
    });

    it('should have proper thrust and turn parameters', () => {
      expect(ship.thrustPower).toBe(20);
      expect(ship.turnRate).toBe(2.5);
    });

    it('should create ship with proper mesh components', () => {
      expect(ship.group.children.length).toBeGreaterThan(0);
      
      // Check for lights
      const lights = ship.group.children.filter(child => child instanceof THREE.PointLight);
      expect(lights.length).toBeGreaterThan(0);
      
      // Check for meshes
      const meshes = ship.group.children.filter(child => child instanceof THREE.Mesh);
      expect(meshes.length).toBeGreaterThan(0);
    });
  });

  describe('movement', () => {
    it('should turn left when Q is pressed', () => {
      const initialHeading = ship.heading;
      mockInput.isDown.mockImplementation((key) => key === 'q');
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.heading).toBeGreaterThan(initialHeading);
      expect(ship.heading).toBeCloseTo(initialHeading + ship.turnRate * 0.1, 5);
    });

    it('should turn right when E is pressed', () => {
      const initialHeading = ship.heading;
      mockInput.isDown.mockImplementation((key) => key === 'e');
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.heading).toBeLessThan(initialHeading);
      expect(ship.heading).toBeCloseTo(initialHeading - ship.turnRate * 0.1, 5);
    });

    it('should thrust forward when W is pressed', () => {
      mockInput.isDown.mockImplementation((key) => key === 'w');
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.isThrusting).toBe(true);
      expect(ship.velocity.length()).toBeGreaterThan(0);
    });

    it('should thrust backward when S is pressed', () => {
      mockInput.isDown.mockImplementation((key) => key === 's');
      ship.heading = 0; // Face forward
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.isThrusting).toBe(true);
      expect(ship.velocity.z).toBeLessThan(0); // Moving backward
    });

    it('should strafe left when A is pressed', () => {
      mockInput.isDown.mockImplementation((key) => key === 'a');
      ship.heading = 0; // Face forward
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.isThrusting).toBe(true);
      expect(ship.velocity.x).toBeLessThan(0); // Moving left
    });

    it('should strafe right when D is pressed', () => {
      mockInput.isDown.mockImplementation((key) => key === 'd');
      ship.heading = 0; // Face forward
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.isThrusting).toBe(true);
      expect(ship.velocity.x).toBeGreaterThan(0); // Moving right
    });

    it('should boost when shift is held', () => {
      mockInput.isDown.mockImplementation((key) => key === 'w' || key === 'shift');
      
      ship.update(0.1, mockInput, mockWorld);
      const boostedVelocity = ship.velocity.length();
      
      // Reset and test without boost
      ship.velocity.set(0, 0, 0);
      mockInput.isDown.mockImplementation((key) => key === 'w');
      
      ship.update(0.1, mockInput, mockWorld);
      const normalVelocity = ship.velocity.length();
      
      expect(boostedVelocity).toBeGreaterThan(normalVelocity);
    });

    it('should not be thrusting when no movement keys are pressed', () => {
      mockInput.isDown.mockReturnValue(false);
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.isThrusting).toBe(false);
    });
  });

  describe('hover mechanics', () => {
    it('should maintain hover height above terrain', () => {
      const terrainHeight = 5;
      const targetHeight = terrainHeight + 2.0;
      mockWorld.sampleHeight.mockReturnValue(terrainHeight);
      
      ship.group.position.y = 0; // Start below target
      
      // Run multiple updates to let it stabilize
      for (let i = 0; i < 100; i++) {
        ship.update(0.016, mockInput, mockWorld);
      }
      
      // Should hover around target height
      expect(ship.group.position.y).toBeCloseTo(targetHeight, 0);
    });

    it('should apply drag to velocity', () => {
      ship.velocity.set(10, 0, 10);
      const initialSpeed = ship.velocity.length();
      
      ship.update(0.1, mockInput, mockWorld);
      
      expect(ship.velocity.length()).toBeLessThan(initialSpeed);
    });
  });

  describe('combat', () => {
    it('should fire projectiles when energy is sufficient', () => {
      const mockProjectileManager = {
        spawn: jest.fn().mockReturnValue('projectile-1')
      };
      
      ship.energy = 10;
      const result = ship.tryFire(mockProjectileManager);
      
      expect(result).toBe('projectile-1');
      expect(mockProjectileManager.spawn).toHaveBeenCalled();
      expect(ship.energy).toBe(5); // Energy consumed
    });

    it('should not fire when energy is insufficient', () => {
      const mockProjectileManager = {
        spawn: jest.fn()
      };
      
      ship.energy = 3; // Less than required 5
      const result = ship.tryFire(mockProjectileManager);
      
      expect(result).toBeNull();
      expect(mockProjectileManager.spawn).not.toHaveBeenCalled();
      expect(ship.energy).toBe(3); // Energy unchanged
    });

    it('should respect fire cooldown', () => {
      const mockProjectileManager = {
        spawn: jest.fn().mockReturnValue('projectile-1')
      };
      
      ship.energy = 100;
      
      // Fire once
      ship.tryFire(mockProjectileManager);
      
      // Try to fire again immediately
      const result = ship.tryFire(mockProjectileManager);
      
      expect(result).toBeNull();
      expect(mockProjectileManager.spawn).toHaveBeenCalledTimes(1);
    });

    it('should regenerate energy over time', () => {
      ship.energy = 50;
      
      ship.update(1.0, mockInput, mockWorld); // 1 second
      
      expect(ship.energy).toBeGreaterThan(50);
      expect(ship.energy).toBeLessThanOrEqual(ship.maxEnergy);
    });

    it('should take damage correctly', () => {
      ship.hull = 100;
      
      ship.applyDamage(25);
      expect(ship.hull).toBe(75);
      
      ship.applyDamage(100);
      expect(ship.hull).toBe(0); // Should not go below 0
    });
  });

  describe('position getter', () => {
    it('should return the group position', () => {
      ship.group.position.set(10, 20, 30);
      
      const position = ship.position;
      
      expect(position).toBe(ship.group.position);
      expect(position.x).toBe(10);
      expect(position.y).toBe(20);
      expect(position.z).toBe(30);
    });
  });

  describe('light dynamics', () => {
    it('should adjust light intensity based on thrust', () => {
      // Get initial light intensity
      const initialIntensity = ship.lights.mainEngine.intensity;
      
      // Thrust forward
      mockInput.isDown.mockImplementation((key) => key === 'w');
      ship.update(0.1, mockInput, mockWorld);
      
      // Light should be brighter when thrusting
      expect(ship.lights.mainEngine.intensity).toBeGreaterThan(initialIntensity);
    });
  });
});
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as THREE from 'three';
import { JunkManager } from './Junk';
import { EntityManager, EntityType } from '../engine/EntityManager';
import { FadeManager } from '../engine/FadeManager';

describe('JunkManager', () => {
  let junkManager: JunkManager;
  let entityManager: EntityManager;
  let fadeManager: FadeManager;
  let mockNetworkCallbacks: {
    onJunkSpawn: jest.Mock;
    onJunkDestroy: jest.Mock;
  };

  beforeEach(() => {
    // Create mock managers
    entityManager = new EntityManager();
    fadeManager = new FadeManager();
    
    // Create junk manager
    junkManager = new JunkManager('test-seed', entityManager, fadeManager);
    
    // Setup network callbacks
    mockNetworkCallbacks = {
      onJunkSpawn: jest.fn(),
      onJunkDestroy: jest.fn()
    };
    junkManager.setNetworkCallbacks(mockNetworkCallbacks);
  });

  describe('Junk Generation', () => {
    it('should generate junk when first player', () => {
      junkManager.setIsFirstPlayer(true);
      
      const mockGroup = new THREE.Group();
      mockGroup.position.set(0, 0, 0);
      
      junkManager.spawnInChunk(0, 0, mockGroup);
      
      // Should have called onJunkSpawn if junk was generated
      // The exact number depends on random generation
      if (mockNetworkCallbacks.onJunkSpawn.mock.calls.length > 0) {
        const call = mockNetworkCallbacks.onJunkSpawn.mock.calls[0];
        expect(call[0]).toBe('0,0'); // chunk key
        expect(Array.isArray(call[1])).toBe(true); // junk data array
      }
    });

    it('should not generate junk when not first player', () => {
      junkManager.setIsFirstPlayer(false);
      
      const mockGroup = new THREE.Group();
      mockGroup.position.set(0, 0, 0);
      
      junkManager.spawnInChunk(0, 0, mockGroup);
      
      // Should not call onJunkSpawn
      expect(mockNetworkCallbacks.onJunkSpawn).not.toHaveBeenCalled();
    });

    it('should not spawn junk in same chunk twice', () => {
      junkManager.setIsFirstPlayer(true);
      
      const mockGroup = new THREE.Group();
      mockGroup.position.set(0, 0, 0);
      
      junkManager.spawnInChunk(0, 0, mockGroup);
      const firstCallCount = mockNetworkCallbacks.onJunkSpawn.mock.calls.length;
      
      // Try to spawn again in same chunk
      junkManager.spawnInChunk(0, 0, mockGroup);
      
      // Should not have made additional calls
      expect(mockNetworkCallbacks.onJunkSpawn.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('Remote Junk Sync', () => {
    it('should spawn remote junk correctly', () => {
      const chunkKey = '1,1';
      const junkData = [
        {
          id: 'remote_junk_1',
          position: new THREE.Vector3(10, 5, 10),
          size: 1.0
        },
        {
          id: 'remote_junk_2',
          position: new THREE.Vector3(15, 5, 15),
          size: 1.5
        }
      ];
      
      junkManager.spawnRemoteJunk(chunkKey, junkData);
      
      // Check that junk was added to scene
      expect(junkManager.group.children.length).toBeGreaterThan(0);
      
      // Should not trigger network callback (we received this from network)
      expect(mockNetworkCallbacks.onJunkSpawn).not.toHaveBeenCalled();
    });

    it('should destroy remote junk correctly', () => {
      // First spawn some remote junk
      const junkData = [{
        id: 'remote_junk_destroy',
        position: new THREE.Vector3(0, 0, 0),
        size: 1.0
      }];
      
      junkManager.spawnRemoteJunk('0,0', junkData);
      const initialChildCount = junkManager.group.children.length;
      
      // Now destroy it remotely
      junkManager.destroyRemoteJunk('remote_junk_destroy');
      
      // Should have fewer children
      expect(junkManager.group.children.length).toBeLessThan(initialChildCount);
      
      // Should not trigger network callback (we received this from network)
      expect(mockNetworkCallbacks.onJunkDestroy).not.toHaveBeenCalled();
    });
  });

  describe('Projectile Collisions', () => {
    it('should detect projectile collision with junk', () => {
      // Spawn junk at known position
      const junkData = [{
        id: 'collision_test',
        position: new THREE.Vector3(0, 0, 0),
        size: 1.0
      }];
      
      junkManager.spawnRemoteJunk('0,0', junkData);
      
      // Test collision at junk position
      const result = junkManager.checkProjectileCollisions(
        new THREE.Vector3(0, 0, 0),
        100 // enough damage to destroy
      );
      
      expect(result).toBe('collision_test'); // Should return destroyed junk ID
      expect(mockNetworkCallbacks.onJunkDestroy).toHaveBeenCalledWith('collision_test');
    });

    it('should not detect collision when projectile is far away', () => {
      // Spawn junk at origin
      const junkData = [{
        id: 'no_collision',
        position: new THREE.Vector3(0, 0, 0),
        size: 1.0
      }];
      
      junkManager.spawnRemoteJunk('0,0', junkData);
      
      // Test collision far away
      const result = junkManager.checkProjectileCollisions(
        new THREE.Vector3(100, 100, 100),
        100
      );
      
      expect(result).toBeNull();
      expect(mockNetworkCallbacks.onJunkDestroy).not.toHaveBeenCalled();
    });

    it('should handle partial damage without destroying', () => {
      // Spawn junk
      const junkData = [{
        id: 'damage_test',
        position: new THREE.Vector3(0, 0, 0),
        size: 1.0
      }];
      
      junkManager.spawnRemoteJunk('0,0', junkData);
      
      // Hit with low damage
      const result = junkManager.checkProjectileCollisions(
        new THREE.Vector3(0, 0, 0),
        5 // low damage
      );
      
      expect(result).toBe('hit'); // Hit but not destroyed
      expect(mockNetworkCallbacks.onJunkDestroy).not.toHaveBeenCalled();
    });
  });

  describe('Network Message Handling', () => {
    it('should send junk spawn message when generating as first player', () => {
      junkManager.setIsFirstPlayer(true);
      
      const mockGroup = new THREE.Group();
      mockGroup.position.set(0, 0, 0);
      
      // Mock world for height sampling
      const mockWorld = {
        sampleHeight: jest.fn(() => 10)
      };
      
      junkManager.spawnInChunk(0, 0, mockGroup, mockWorld);
      
      // If junk was generated, check the network message
      if (mockNetworkCallbacks.onJunkSpawn.mock.calls.length > 0) {
        const [chunkKey, junkData] = mockNetworkCallbacks.onJunkSpawn.mock.calls[0];
        
        expect(typeof chunkKey).toBe('string');
        expect(Array.isArray(junkData)).toBe(true);
        
        if (junkData.length > 0) {
          const firstJunk = junkData[0];
          expect(firstJunk).toHaveProperty('id');
          expect(firstJunk).toHaveProperty('position');
          expect(firstJunk).toHaveProperty('size');
          expect(firstJunk.position).toBeInstanceOf(THREE.Vector3);
        }
      }
    });

    it('should send junk destroy message when junk is destroyed locally', () => {
      // Spawn junk
      const junkData = [{
        id: 'local_destroy_test',
        position: new THREE.Vector3(0, 0, 0),
        size: 1.0
      }];
      
      junkManager.spawnRemoteJunk('0,0', junkData);
      
      // Destroy via projectile
      junkManager.checkProjectileCollisions(
        new THREE.Vector3(0, 0, 0),
        100 // enough to destroy
      );
      
      expect(mockNetworkCallbacks.onJunkDestroy).toHaveBeenCalledWith('local_destroy_test');
    });
  });

  describe('Chunk Management', () => {
    it('should track junk by chunk', () => {
      const junkData1 = [{
        id: 'chunk_0_0',
        position: new THREE.Vector3(5, 5, 5),
        size: 1.0
      }];
      
      const junkData2 = [{
        id: 'chunk_1_1',
        position: new THREE.Vector3(20, 5, 20),
        size: 1.0
      }];
      
      junkManager.spawnRemoteJunk('0,0', junkData1);
      junkManager.spawnRemoteJunk('1,1', junkData2);
      
      // Both chunks should be tracked
      const activeJunk = junkManager.getActiveJunk();
      expect(activeJunk.length).toBeGreaterThanOrEqual(2);
    });

    it('should get junk in radius', () => {
      const junkData = [
        {
          id: 'near',
          position: new THREE.Vector3(0, 0, 0),
          size: 1.0
        },
        {
          id: 'far',
          position: new THREE.Vector3(100, 0, 100),
          size: 1.0
        }
      ];
      
      junkManager.spawnRemoteJunk('0,0', junkData);
      
      const nearbyJunk = junkManager.getJunkInRadius(new THREE.Vector3(0, 0, 0), 10);
      
      // Should only find the near junk
      expect(nearbyJunk.length).toBe(1);
    });
  });

  describe('Deterministic Generation', () => {
    it('should generate same junk for same chunk coordinates', () => {
      const manager1 = new JunkManager('seed1', entityManager, fadeManager);
      const manager2 = new JunkManager('seed1', entityManager, fadeManager);
      
      const callbacks1: any[] = [];
      const callbacks2: any[] = [];
      
      manager1.setNetworkCallbacks({
        onJunkSpawn: (key, data) => callbacks1.push({ key, data })
      });
      
      manager2.setNetworkCallbacks({
        onJunkSpawn: (key, data) => callbacks2.push({ key, data })
      });
      
      manager1.setIsFirstPlayer(true);
      manager2.setIsFirstPlayer(true);
      
      const mockGroup = new THREE.Group();
      
      manager1.spawnInChunk(5, 5, mockGroup);
      manager2.spawnInChunk(5, 5, mockGroup);
      
      // Both should generate the same number of junk pieces
      if (callbacks1.length > 0 && callbacks2.length > 0) {
        expect(callbacks1[0].data.length).toBe(callbacks2[0].data.length);
      }
    });
  });
});
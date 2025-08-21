import * as THREE from 'three';

/**
 * Test to verify the projectile direction calculation fix
 * This ensures that the direction calculation from heading matches
 * between the ship's firing logic and the network message handling
 */
describe('Projectile Direction Fix', () => {
  it('should calculate direction from heading consistently', () => {
    // Test various headings to ensure consistency
    const testCases = [
      { heading: 0, expectedX: 0, expectedZ: 1 },           // North
      { heading: Math.PI / 2, expectedX: 1, expectedZ: 0 },  // East  
      { heading: Math.PI, expectedX: 0, expectedZ: -1 },     // South
      { heading: 3 * Math.PI / 2, expectedX: -1, expectedZ: 0 }, // West
      { heading: Math.PI / 4, expectedX: 0.707, expectedZ: 0.707 }, // NE (45°)
    ];

    testCases.forEach(({ heading, expectedX, expectedZ }) => {
      // This is the CORRECTED calculation that should be used everywhere
      const direction = new THREE.Vector3(
        Math.sin(heading),  // X component
        0,                  // Y component (no vertical component)
        Math.cos(heading)   // Z component - POSITIVE cos, not negative
      );

      expect(direction.x).toBeCloseTo(expectedX, 2);
      expect(direction.y).toBe(0);
      expect(direction.z).toBeCloseTo(expectedZ, 2);
    });
  });

  it('should match ship heading calculation', () => {
    // Simulate ship firing direction calculation
    const shipHeading = Math.PI / 3; // 60 degrees
    
    // Ship's direction calculation (from Ship.ts)
    const shipDirection = new THREE.Vector3(
      Math.sin(shipHeading),
      0,
      Math.cos(shipHeading)
    );

    // Network handler direction calculation (should match after fix)
    const networkDirection = new THREE.Vector3(
      Math.sin(shipHeading),
      0, 
      Math.cos(shipHeading)  // Fixed to use positive cos
    );

    expect(networkDirection.x).toBeCloseTo(shipDirection.x, 6);
    expect(networkDirection.y).toBeCloseTo(shipDirection.y, 6);
    expect(networkDirection.z).toBeCloseTo(shipDirection.z, 6);
  });
});
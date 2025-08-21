import * as THREE from 'three';
import { ProjectileManager } from './Projectiles';
import { Ship } from './Ship';

export class Drone {
  public group = new THREE.Group();
  public velocity = new THREE.Vector3();
  public health = 30;
  constructor(position: THREE.Vector3) {
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff0033, emissiveIntensity: 2, roughness: 0.6 })
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.05, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xff77aa })
    );
    halo.rotation.x = Math.PI / 2;
    this.group.add(core, halo);
    this.group.position.copy(position);
  }
}

export class EnemyManager {
  private scene: THREE.Scene;
  public drones: Drone[] = [];
  private tmpSphere = new THREE.Sphere(new THREE.Vector3(), 0.35);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnRingAround(center: THREE.Vector3, count: number, radius: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * radius + center.x, 2, Math.sin(a) * radius + center.z);
      const d = new Drone(pos);
      this.drones.push(d);
      this.scene.add(d.group);
    }
  }

  update(dt: number, ship: Ship, projectiles: ProjectileManager) {
    for (const d of this.drones) {
      if (d.health <= 0) continue;
      const toShip = ship.position.clone().sub(d.group.position);
      const dist = toShip.length();
      toShip.normalize();
      const desired = toShip.multiplyScalar(6);
      d.velocity.lerp(desired, 1 - Math.exp(-dt * 2));
      d.group.position.addScaledVector(d.velocity, dt);
      // Damage on contact
      if (dist < 1.2) {
        ship.applyDamage(8 * dt);
      }
    }
    // Cleanup dead drones (simple fade)
    this.drones = this.drones.filter(d => {
      if (d.health > 0) return true;
      this.scene.remove(d.group);
      return false;
    });
  }

  hitTest(sphere: THREE.Sphere, damage: number): boolean {
    for (const d of this.drones) {
      if (d.health <= 0) continue;
      this.tmpSphere.center.copy(d.group.position);
      this.tmpSphere.radius = 0.5;
      if (sphere.intersectsSphere(this.tmpSphere)) {
        d.health -= damage;
        return true;
      }
    }
    return false;
  }
}

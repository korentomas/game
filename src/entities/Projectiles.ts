import * as THREE from 'three';
import { World } from '../world/World';
import { EnemyManager } from './Drone';

interface Projectile {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  mesh: THREE.Mesh;
  damage: number;
}

export class ProjectileManager {
  private scene: THREE.Scene;
  private pool: Projectile[] = [];
  private sphere: THREE.Sphere = new THREE.Sphere(new THREE.Vector3(), 0.2);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < 64; i++) this.pool.push(this.createOne());
  }

  private createOne(): Projectile {
    const geom = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.layers.enable(1); // blooms if we use selective bloom later
    mesh.visible = false;
    this.scene.add(mesh);
    return { active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, mesh, damage: 10 };
  }

  spawn(pos: THREE.Vector3, dir: THREE.Vector3, speed: number) {
    const p = this.pool.find(p => !p.active) ?? this.createOne();
    p.active = true;
    p.position.copy(pos);
    p.velocity.copy(dir).multiplyScalar(speed);
    p.life = 1.2;
    p.mesh.position.copy(pos);
    p.mesh.visible = true;
  }

  update(dt: number, world: World, enemies: EnemyManager) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { this.despawn(p); continue; }
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);
      // simple collision vs enemies
      this.sphere.center.copy(p.position);
      if (enemies.hitTest(this.sphere, p.damage)) {
        this.despawn(p);
        continue;
      }
    }
  }

  private despawn(p: Projectile) {
    p.active = false;
    p.mesh.visible = false;
  }
}

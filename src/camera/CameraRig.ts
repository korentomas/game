import * as THREE from 'three';
import { Ship } from '../entities/Ship';

export class CameraRig {
  private camera: THREE.PerspectiveCamera;
  private ship: Ship;
  private offset = new THREE.Vector3(0, 12, -12);
  private target = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, ship: Ship) {
    this.camera = camera;
    this.ship = ship;
  }

  update(dt: number) {
    const forward = new THREE.Vector3(Math.sin(this.ship.heading), 0, Math.cos(this.ship.heading));
    const desired = this.ship.position.clone()
      .addScaledVector(forward, 2)
      .add(this.offset);

    this.target.lerp(desired, 1 - Math.exp(-dt * 4));

    this.camera.position.copy(this.target);
    const look = this.ship.position.clone().addScaledVector(forward, 3);
    this.camera.lookAt(look);
  }
}

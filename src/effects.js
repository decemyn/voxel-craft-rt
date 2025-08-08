import * as THREE from 'three';

export class TimeOfDay {
  constructor() {
    this.time = 8 * 60; // minutes since 0:00, start at 8:00
    this.speed = 10; // minutes per real second
  }
  update(dt) {
    this.time = (this.time + this.speed * dt) % (24 * 60);
  }
  get sunDirection() {
    const t = this.time / (24 * 60);
    const angle = (t * Math.PI * 2) - Math.PI / 2; // -90deg at 0:00 -> sunrise at ~6:00
    const y = Math.max(-0.25, Math.sin(angle));
    const x = Math.cos(angle);
    const dir = new THREE.Vector3(x, y, 0.5).normalize();
    return dir;
  }
  get ambientIntensity() {
    const t = this.time / (24 * 60);
    return 0.15 + 0.45 * Math.max(0, Math.sin((t * Math.PI * 2) - Math.PI / 2));
  }
  get sunIntensity() {
    const t = this.time / (24 * 60);
    return 0.2 + 0.8 * Math.max(0, Math.sin((t * Math.PI * 2) - Math.PI / 2));
  }
}

export function createFog(scene) {
  const fog = new THREE.FogExp2(0x87ceeb, 0.008);
  scene.fog = fog;
  return fog;
}

export class RainSystem {
  constructor(scene) {
    this.scene = scene;
    this.dropCount = 2000;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(this.dropCount * 3);
    const velocities = new Float32Array(this.dropCount);
    for (let i = 0; i < this.dropCount; i++) {
      positions[i*3+0] = (Math.random() - 0.5) * 200;
      positions[i*3+1] = Math.random() * 60 + 20;
      positions[i*3+2] = (Math.random() - 0.5) * 200;
      velocities[i] = 20 + Math.random() * 20;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    const mat = new THREE.PointsMaterial({ color: 0xaad4ff, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    this.points = new THREE.Points(geom, mat);
    scene.add(this.points);
  }
  update(dt, playerPos) {
    const pos = this.points.geometry.getAttribute('position');
    const vel = this.points.geometry.getAttribute('velocity');
    for (let i = 0; i < this.dropCount; i++) {
      let y = pos.getY(i) - vel.getX(i) * dt;
      if (y < 0) {
        // respawn above player within a square area
        pos.setX(i, playerPos.x + (Math.random() - 0.5) * 200);
        y = playerPos.y + 60 + Math.random() * 20;
        pos.setZ(i, playerPos.z + (Math.random() - 0.5) * 200);
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
}



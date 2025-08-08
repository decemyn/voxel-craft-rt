import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VoxelWorld, BLOCK } from '../src/world.js';
import { VoxelRayTracer } from '../src/rt_renderer.js';

// Mock renderer caps for enabling RT without real GL
class MockRenderer {
  constructor() {
    this.capabilities = { isWebGL2: true };
  }
  getContext() { return { readPixels: () => {} }; }
  getDrawingBufferSize(v) { v.set(4, 4); }
  render() {}
}

describe('Voxel Ray Tracer', () => {
  it('initializes and builds a 3D volume around player', () => {
    const world = new VoxelWorld(42);
    world.generateChunk(0, 0);
    const renderer = new MockRenderer();
    const rt = new VoxelRayTracer(world, renderer);
    expect(rt.enabled).toBe(true);
    rt.updateVolume(new THREE.Vector3(8, 16, 8));
    expect(rt.texture).toBeTruthy();
    // Ensure some voxels are non-empty
    const data = rt.texture.image.data;
    const nonEmpty = Array.from(data).some((v, i) => (i % 4 === 3) && v !== 0);
    expect(nonEmpty).toBe(true);
  });

  it('marks volume dirty when world changes inside volume', () => {
    const world = new VoxelWorld(1);
    world.generateChunk(0, 0);
    const renderer = new MockRenderer();
    const rt = new VoxelRayTracer(world, renderer);
    rt.updateVolume(new THREE.Vector3(0, 16, 0));
    rt.needsVolumeUpdate = false;
    const o = rt.volumeOrigin;
    world.set(o.x + 1, o.y + 1, o.z + 1, BLOCK.STONE);
    rt.onWorldChangedAround(o.x + 1, o.y + 1, o.z + 1);
    expect(rt.needsVolumeUpdate).toBe(true);
  });

  it('writes alpha=255 for filled voxel inside volume', () => {
    const world = new VoxelWorld(9);
    const renderer = new MockRenderer();
    const rt = new VoxelRayTracer(world, renderer);
    const center = new THREE.Vector3(0, 16, 0);
    rt.updateVolume(center);
    const o = rt.volumeOrigin;
    // Place a block at origin+ (2,3,4) inside volume
    const pos = { x: o.x + 2, y: o.y + 3, z: o.z + 4 };
    world.set(pos.x, pos.y, pos.z, BLOCK.STONE);
    rt.updateVolume(center);
    const size = rt.gridSize;
    const ix = 2, iy = 3, iz = 4;
    const idx = ((ix + iy * size + iz * size * size) * 4) + 3; // alpha
    expect(rt.texture.image.data[idx]).toBe(255);
  });

  it('render() returns true when enabled', () => {
    const world = new VoxelWorld(11);
    const renderer = new MockRenderer();
    const rt = new VoxelRayTracer(world, renderer);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    const used = rt.render(renderer, camera);
    expect(used).toBe(true);
  });
  
  it('updates volume when player moves far enough', () => {
    const world = new VoxelWorld(7);
    const renderer = new MockRenderer();
    const rt = new VoxelRayTracer(world, renderer);
    const c0 = new THREE.Vector3(0, 16, 0);
    rt.updateVolume(c0);
    rt.needsVolumeUpdate = false;
    const c1 = new THREE.Vector3(rt.rebuildThreshold + 1, 16, 0);
    rt.updateVolumeIfNeeded(c1);
    expect(rt.volumeOrigin.x).toBeLessThanOrEqual(Math.floor(c1.x));
  });
});



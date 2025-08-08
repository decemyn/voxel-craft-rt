import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HybridRTRenderer } from '../src/hybrid_rt.js';

class MockRenderer {
  constructor() {
    this.capabilities = { isWebGL2: true };
  }
  setRenderTarget() {}
  render() {}
  clear() {}
}

describe('HybridRTRenderer', () => {
  it('resizes and initializes render targets', () => {
    const r = new MockRenderer();
    const scene = new THREE.Scene();
    const hrt = new HybridRTRenderer(r, scene, {});
    hrt.resize(640, 360);
    expect(hrt.colorTarget).toBeTruthy();
    expect(hrt.normalTarget).toBeTruthy();
    expect(hrt.compositeMaterial).toBeTruthy();
  });
});



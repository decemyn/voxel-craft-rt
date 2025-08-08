import { describe, it, expect } from 'vitest';
import { VoxelWorld, WORLD_HEIGHT, BLOCK } from '../src/world.js';

describe('World generation', () => {
  it('generates chunks with valid heights', () => {
    const w = new VoxelWorld(123);
    w.generateChunk(0, 0);
    let hasGround = false;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        let top = -1;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const id = w.get(x, y, z);
          if (id !== BLOCK.AIR) { top = y; break; }
        }
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top).toBeLessThan(WORLD_HEIGHT);
        hasGround = hasGround || top >= 0;
      }
    }
    expect(hasGround).toBe(true);
  });
});



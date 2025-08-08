import { describe, it, expect } from 'vitest';
import { VoxelRayTracer } from '../src/rt_renderer.js';

describe('Toggle state (unit)', () => {
  it('ray tracer can be enabled by caps but effects gating is external', () => {
    const mockRenderer = { capabilities: { isWebGL2: true } };
    const rt = new VoxelRayTracer({ get: () => 0 }, mockRenderer);
    expect(rt.enabled).toBe(true);
  });
});



## Voxel Craft (Minimal Minecraft-like in Web)

A small voxel sandbox built with Three.js. Features chunked world generation, block breaking/placing, inventory and crafting, plus optional experimental real-time ray-traced effects (WebGL2), time-of-day lighting, fog, and rain.

### Features

- World gen: heightmap terrain with stone/dirt/grass and occasional trees
- Block actions: break/place, inventory hotbar (1-9), simple crafting (planks, sticks, wood/stone pickaxe)
- Movement: WASD, mouse look (click to lock), Space/Shift for up/down
- Visuals: ambient + directional sun light, point light near player, fog, rain particles
- Optional RT effects: screen-space composite that adds voxel-accelerated AO, GI-ish ambient shading, and reflections. Toggle with T (WebGL2 only)

### Controls

- Click: pointer lock
- WASD: move
- Space / Shift: up / down
- Left click: break block
- Right click: place selected block
- 1-9: select hotbar slot
- I: Inventory panel
- C: Crafting panel
- T: Toggle RT effects ON/OFF (indicator shows state)

### Getting Started

Prerequisites: Node.js 18+

Install and run:

```bash
./start.sh
```

Then open `http://127.0.0.1:5173` in your browser.

Alternatively:

```bash
npm install
npm run start
```

### Tests

Run tests:

```bash
npm test
```

Tests cover: world height generation bounds, inventory add/consume, crafting availability and execution.

### Configuration (src/config.js)

You can tweak ray-traced effect quality and performance without changing code. Edit `src/config.js`:

```js
export default {
  rt: {
    enabledOnStart: false,   // Raster is default; press T to enable effects
    gridSize: 96,            // 32–128 typical; larger = better quality, slower, more VRAM
    maxSteps: 128,           // Debug RT max steps (voxel DDA) when RT view is enabled
    aoSamples: 4,            // 1–8; higher = smoother AO, slower
    temporalBlend: 0.2,      // 0..1; higher = more denoise, slower response
    rainIntensity: 0.5,      // 0..1; puddle reflection strength
    waterReflections: true,  // enable stronger water reflections
  },
};
```

- Changes take effect on reload.
- If performance is low, try `gridSize: 64`, `aoSamples: 2`, or increase `temporalBlend`.

### Technical Details (Ray Tracing)

- Hybrid approach: the world is rasterized using standard Three.js materials. A fullscreen composite pass then adds ray-traced effects.
- Acceleration structure: a 3D voxel texture (RGB color + occupancy) around the player. DDA voxel traversal is used to cast short rays for AO and a specular/reflection ray.
- AO: hemisphere sampling (configurable samples) with exponential falloff. Accumulated temporally using an exponential moving average with clamped deltas.
- Reflections: single reflection ray. When raining, upward-facing surfaces get puddle reflections with small ripples. Water reflections are treated as stronger, planar-like reflections.
- Time-of-day: sun direction/intensity and ambient are passed into the composite for consistent shading. Fog and sky color are blended in the composite as well.
- Requirements: WebGL2 (for 3D textures and GLSL3 in composite). On unsupported GPUs, T toggle will have no effect and raster is used.

### Project Structure

- `src/world.js`: voxel storage, chunk generation, meshing, DDA raycast
- `src/main.js`: game loop, input, UI, rendering
- `src/inventory.js`: hotbar/inventory management, UI rendering
- `src/crafting.js`: simple list-based crafting
- `src/noise.js`: value-noise FBM
- `src/effects.js`: time-of-day, fog, rain
- `src/rt_renderer.js`: voxel volume builder and debug path tracer (not used by default UI)
- `src/hybrid_rt.js`: hybrid RT composite pass (AO/reflections/denoise)
- `src/config.js`: parameters for effects
- `scripts/serve.js`: static file server for dev



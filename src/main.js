import * as THREE from 'three';
import { VoxelWorld, CHUNK_SIZE, RENDER_DISTANCE, WORLD_HEIGHT, BLOCK } from './world.js';
import { Inventory, ITEM, isPlaceableBlock, renderHotbar, renderInventory } from './inventory.js';
import { renderCrafting } from './crafting.js';
import { VoxelRayTracer } from './rt_renderer.js';
import { TimeOfDay, createFog, RainSystem } from './effects.js';
import { HybridRTRenderer } from './hybrid_rt.js';
import config from './config.js';

const canvas = document.createElement('canvas');
canvas.id = 'game-canvas';
document.body.appendChild(canvas);

// Prefer WebGL2 context explicitly for ray tracing; fallback to WebGL1
let gl2 = null;
try { gl2 = canvas.getContext('webgl2', { antialias: false }); } catch (_) {}
const renderer = gl2
  ? new THREE.WebGLRenderer({ canvas, context: gl2, antialias: false })
  : new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 0);

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(0.5, 1, 0.8);
scene.add(sun);
// Point light near player for local highlights
const playerLight = new THREE.PointLight(0xfff1c1, 0.6, 18, 2.0);
scene.add(playerLight);

// World
const world = new VoxelWorld(12345);
world.scene = scene;

// Ray tracing renderer (WebGL2 only; graceful fallback)
const rayTracer = new VoxelRayTracer(world, renderer);
// Effects default from config
let effectsEnabled = !!config.rt.enabledOnStart; // controls hybrid RT composite on/off
const rtIndicator = document.getElementById('rt-indicator');
function setRTIndicator() {
  if (!rtIndicator) return;
  rtIndicator.textContent = `RT: ${effectsEnabled ? 'ON' : 'OFF'}`;
}
setRTIndicator();
// Hybrid compositing renderer
const hrt = new HybridRTRenderer(renderer, scene, world);

// Removed aggressive black-frame watchdog; rely on manual toggle

// Player state
const player = {
  pos: new THREE.Vector3(0, 30, 0),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: 12,
};

// Inventory
const inventory = new Inventory();
renderHotbar(inventory);
renderInventory(inventory);
renderCrafting(inventory);

// Mouse lock + look
let pointerLocked = false;
document.body.addEventListener('click', () => {
  if (!pointerLocked) {
    document.body.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === document.body;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  const sensitivity = 0.0025;
  player.yaw -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, player.pitch));
});

// Controls
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  const digit = e.key.charCodeAt(0) - 49; // '1' -> 0
  if (digit >= 0 && digit < inventory.hotbarSize) {
    inventory.selectedHotbar = digit;
    renderHotbar(inventory);
  }
  if (e.code === 'KeyI') toggleInventory();
  if (e.code === 'KeyC') toggleCrafting();
  if (e.code === 'KeyT') {
    // Toggle post-process RT effects
    effectsEnabled = !effectsEnabled;
    setRTIndicator();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hrt.resize(window.innerWidth, window.innerHeight);
});

// Build initial terrain
world.ensureChunksAround(0, 0);

// UI updates on inventory change
window.addEventListener('inventory-changed', () => {
  renderHotbar(inventory);
  renderInventory(inventory);
  renderCrafting(inventory);
});

// Place / break handling via voxel DDA raycast
window.addEventListener('mousedown', (e) => {
  if (!pointerLocked) return;
  const dir = getLookDirection();
  const hit = world.raycast(player.pos, dir, 8);
  if (!hit.hit) return;
  if (e.button === 0) {
    // Break block
    world.set(hit.x, hit.y, hit.z, BLOCK.AIR);
    // Drop as item into inventory (simple)
    const dropId = dropFromBlock(hit.id);
    if (dropId) {
      inventory.addItem(dropId, 1);
      window.dispatchEvent(new CustomEvent('inventory-changed'));
    }
    world.rebuildChunksAround(hit.x, hit.y, hit.z);
    rayTracer.onWorldChangedAround(hit.x, hit.y, hit.z);
  } else if (e.button === 2) {
    // Place block on adjacent position
    const placePos = adjacentPosition(hit);
    const slot = inventory.hotbar[inventory.selectedHotbar];
    if (slot && isPlaceableBlock(slot.id)) {
      world.set(placePos.x, placePos.y, placePos.z, slot.id);
      world.rebuildChunksAround(placePos.x, placePos.y, placePos.z);
      inventory.consumeFromHotbar(1);
      window.dispatchEvent(new CustomEvent('inventory-changed'));
      rayTracer.onWorldChangedAround(placePos.x, placePos.y, placePos.z);
    }
  }
});

function adjacentPosition(hit) {
  const p = { x: hit.x, y: hit.y, z: hit.z };
  switch (hit.face) {
    case 'px': return { x: p.x + 1, y: p.y, z: p.z };
    case 'nx': return { x: p.x - 1, y: p.y, z: p.z };
    case 'py': return { x: p.x, y: p.y + 1, z: p.z };
    case 'ny': return { x: p.x, y: p.y - 1, z: p.z };
    case 'pz': return { x: p.x, y: p.y, z: p.z + 1 };
    case 'nz': return { x: p.x, y: p.y, z: p.z - 1 };
  }
  return p;
}

function dropFromBlock(blockId) {
  switch (blockId) {
    case BLOCK.GRASS: return ITEM.DIRT; // simplify
    case BLOCK.DIRT: return ITEM.DIRT;
    case BLOCK.STONE: return ITEM.COBBLE;
    case BLOCK.WOOD: return ITEM.WOOD;
    case BLOCK.LEAVES: return null; // ignore
    case BLOCK.PLANKS: return ITEM.PLANKS;
    case BLOCK.COBBLE: return ITEM.COBBLE;
    default: return null;
  }
}

// Simple free-fly movement (no physics/collision to keep trivial)
let lastTime = performance.now();

// Weather, fog, time of day
const timeOfDay = new TimeOfDay();
createFog(scene);
const rain = new RainSystem(scene);

function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updateMovement(dt);
  updateCamera();
  timeOfDay.update(dt);
  // Update lighting from time of day
  const sunDir = timeOfDay.sunDirection;
  sun.position.copy(new THREE.Vector3().copy(sunDir).multiplyScalar(100));
  sun.intensity = timeOfDay.sunIntensity;
  ambient.intensity = timeOfDay.ambientIntensity;
  // Dynamic sky color based on time of day (simple gradient day/night)
  const daySky = new THREE.Color(0x87ceeb);
  const duskSky = new THREE.Color(0x334466);
  const nightSky = new THREE.Color(0x0b1020);
  const sunH = Math.max(0, sunDir.y);
  const sky = nightSky.clone().lerp(duskSky, Math.min(1, sunH * 2)).lerp(daySky, Math.max(0, (sunH - 0.5) * 2));
  scene.background = sky;
  // Move player light with player
  playerLight.position.copy(player.pos).add(new THREE.Vector3(0, 2, 0));
  // Weather
  rain.update(dt, player.pos);
  // Ensure camera matrices are current before ray tracing
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  world.ensureChunksAround(player.pos.x, player.pos.z);
  if (!effectsEnabled) {
    // Direct raster render without composite
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  } else {
    // Update ray tracing volume for hybrid effects
    rayTracer.updateVolumeIfNeeded(player.pos);
    if (rayTracer.material) {
      rayTracer.material.uniforms.uSunDir.value.copy(sunDir);
      rayTracer.material.uniforms.uAmbient.value = ambient.intensity;
      rayTracer.material.uniforms.uFogDensity.value = scene.fog ? scene.fog.density : 0.02;
      rayTracer.material.uniforms.uSkyColor.value.copy(scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0x87ceeb));
    }
    // 1) Render lit raster scene to color target
    if (!hrt.colorTarget || !hrt.normalTarget) {
      hrt.resize(window.innerWidth, window.innerHeight);
    }
    renderer.setRenderTarget(hrt.colorTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    // 2) Render normals to target
    const originalOverride = scene.overrideMaterial;
    scene.overrideMaterial = hrt.normalMaterial;
    renderer.setRenderTarget(hrt.normalTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    scene.overrideMaterial = originalOverride;
    // 3) Composite AO/reflections using voxel volume
    const fogDensity = scene.fog ? scene.fog.density : 0.02;
    const skyColor = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(0x87ceeb);
    const rainIntensity = config.rt.rainIntensity;
    hrt.renderComposite(
      camera,
      rayTracer.texture,
      rayTracer.volumeOrigin,
      rayTracer.gridSize,
      sunDir,
      skyColor,
      fogDensity,
      rainIntensity
    );
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function updateMovement(dt) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw) * -1);
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyA')) move.sub(right);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('Space')) move.add(up);
  if (keys.has('ShiftLeft')) move.sub(up);
  if (move.lengthSq() > 0) move.normalize();
  const speed = player.speed * (keys.has('ControlLeft') ? 2 : 1);
  player.pos.addScaledVector(move, speed * dt);
}

function updateCamera() {
  camera.position.copy(player.pos);
  const dir = getLookDirection();
  const target = new THREE.Vector3().copy(player.pos).addScaledVector(dir, 10);
  camera.lookAt(target);
}

function getLookDirection() {
  const cp = Math.cos(player.pitch);
  const sp = Math.sin(player.pitch);
  const cy = Math.cos(player.yaw);
  const sy = Math.sin(player.yaw);
  return new THREE.Vector3(sy * cp, -sp, -cy * cp);
}

// UI helpers
function toggleInventory() {
  const inv = document.getElementById('inventory');
  const hidden = inv.classList.toggle('hidden');
  if (!hidden) {
    renderInventory(inventory);
  }
}
function toggleCrafting() {
  const c = document.getElementById('crafting');
  const hidden = c.classList.toggle('hidden');
  if (!hidden) {
    renderCrafting(inventory);
  }
}

// Prevent context menu on right click for placing blocks
window.addEventListener('contextmenu', (e) => e.preventDefault());



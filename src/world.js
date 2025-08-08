import * as THREE from 'three';
import { ValueNoise2D } from './noise.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const RENDER_DISTANCE = 6; // chunks radius

// Block IDs
export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  PLANKS: 6,
  COBBLE: 7,
};

export const BLOCK_COLORS = {
  [BLOCK.AIR]: 0x000000,
  [BLOCK.GRASS]: 0x55aa55,
  [BLOCK.DIRT]: 0x8b5a2b,
  [BLOCK.STONE]: 0x888888,
  [BLOCK.WOOD]: 0x8a5c2e,
  [BLOCK.LEAVES]: 0x3fa73f,
  [BLOCK.PLANKS]: 0xb48a56,
  [BLOCK.COBBLE]: 0x777777,
};

export const BLOCK_NAMES = {
  [BLOCK.GRASS]: 'Grass',
  [BLOCK.DIRT]: 'Dirt',
  [BLOCK.STONE]: 'Stone',
  [BLOCK.WOOD]: 'Wood',
  [BLOCK.LEAVES]: 'Leaves',
  [BLOCK.PLANKS]: 'Planks',
  [BLOCK.COBBLE]: 'Cobblestone',
};

export function getBlockName(id) {
  return BLOCK_NAMES[id] || 'Unknown';
}

function key(x, y, z) {
  return `${x},${y},${z}`;
}

export class VoxelWorld {
  constructor(seed = 1337) {
    this.seed = seed;
    this.noise = new ValueNoise2D(seed);
    this.blocks = new Map(); // key -> id
    this.chunkMeshes = new Map(); // chunkKey -> THREE.Mesh
    this.scene = null; // set by main
  }

  get(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    return this.blocks.get(key(x, y, z)) || BLOCK.AIR;
  }

  set(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const k = key(x, y, z);
    if (id === BLOCK.AIR) {
      this.blocks.delete(k);
    } else {
      this.blocks.set(k, id);
    }
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  worldToChunk(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return [cx, cz];
  }

  generateChunk(cx, cz) {
    // Simple heightmap terrain and occasional trees
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const treeChance = 0.02;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const h = this.getHeight(wx, wz);
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (y < h - 4) this.set(wx, y, wz, BLOCK.STONE);
          else if (y < h - 1) this.set(wx, y, wz, BLOCK.DIRT);
          else if (y < h) this.set(wx, y, wz, BLOCK.GRASS);
        }
        // Trees on some grass tops
        if (Math.random() < treeChance && h > 8) {
          this.placeTree(wx, h, wz);
        }
      }
    }
  }

  getHeight(x, z) {
    const n = this.noise.fbm(x * 0.03, z * 0.03, 4, 2, 0.5);
    const m = this.noise.fbm((x + 1000) * 0.01, (z + 1000) * 0.01, 2, 2, 0.5) * 3;
    const h = Math.floor(12 + n * 10 + m);
    return Math.max(1, Math.min(WORLD_HEIGHT - 1, h));
  }

  placeTree(x, y, z) {
    const height = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < height; i++) {
      this.set(x, y + i, z, BLOCK.WOOD);
    }
    const top = y + height - 1;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 4) {
            if (this.get(x + dx, top + dy, z + dz) === BLOCK.AIR) {
              this.set(x + dx, top + dy, z + dz, BLOCK.LEAVES);
            }
          }
        }
      }
    }
  }

  ensureChunksAround(px, pz) {
    const [pcx, pcz] = this.worldToChunk(px, pz);
    const needed = [];
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const ckey = this.chunkKey(cx, cz);
        if (!this.chunkMeshes.has(ckey)) {
          this.generateChunk(cx, cz);
          const mesh = this.buildChunkMesh(cx, cz);
          this.chunkMeshes.set(ckey, mesh);
          if (this.scene) this.scene.add(mesh);
        }
      }
    }
  }

  rebuildChunksAround(x, y, z) {
    const [cx, cz] = this.worldToChunk(x, z);
    const neighbors = [
      [cx, cz], [cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]
    ];
    for (const [ncx, ncz] of neighbors) {
      this.rebuildChunk(ncx, ncz);
    }
  }

  rebuildChunk(cx, cz) {
    const ckey = this.chunkKey(cx, cz);
    const old = this.chunkMeshes.get(ckey);
    if (old && this.scene) this.scene.remove(old);
    const mesh = this.buildChunkMesh(cx, cz);
    if (mesh) {
      this.chunkMeshes.set(ckey, mesh);
      if (this.scene) this.scene.add(mesh);
    }
  }

  buildChunkMesh(cx, cz) {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const positions = [];
    const normals = [];
    const colors = [];

    const addFace = (x, y, z, nx, ny, nz, color, verts) => {
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        positions.push(x + v[0], y + v[1], z + v[2]);
        normals.push(nx, ny, nz);
        const c = new THREE.Color(color);
        colors.push(c.r, c.g, c.b);
      }
    };

    const cubeFaces = {
      px: { n: [1, 0, 0], v: [[1,0,0],[1,1,0],[1,1,1],[1,0,0],[1,1,1],[1,0,1]] },
      nx: { n: [-1, 0, 0], v: [[0,0,1],[0,1,1],[0,1,0],[0,0,1],[0,1,0],[0,0,0]] },
      py: { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,1],[1,1,0],[0,1,0]] },
      ny: { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,0],[1,0,1],[0,0,1]] },
      pz: { n: [0, 0, 1], v: [[1,0,1],[1,1,1],[0,1,1],[1,0,1],[0,1,1],[0,0,1]] },
      nz: { n: [0, 0, -1], v: [[0,0,0],[0,1,0],[1,1,0],[0,0,0],[1,1,0],[1,0,0]] },
    };

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const wx = baseX + x;
          const wy = y;
          const wz = baseZ + z;
          const id = this.get(wx, wy, wz);
          if (id === BLOCK.AIR) continue;
          const color = BLOCK_COLORS[id] || 0xffffff;
          // Check neighbors; emit only exposed faces
          if (this.get(wx + 1, wy, wz) === BLOCK.AIR) addFace(wx, wy, wz, ...cubeFaces.px.n, color, cubeFaces.px.v);
          if (this.get(wx - 1, wy, wz) === BLOCK.AIR) addFace(wx, wy, wz, ...cubeFaces.nx.n, color, cubeFaces.nx.v);
          if (this.get(wx, wy + 1, wz) === BLOCK.AIR) addFace(wx, wy, wz, ...cubeFaces.py.n, color, cubeFaces.py.v);
          if (this.get(wx, wy - 1, wz) === BLOCK.AIR) addFace(wx, wy, wz, ...cubeFaces.ny.n, color, cubeFaces.ny.v);
          if (this.get(wx, wy, wz + 1) === BLOCK.AIR) addFace(wx, wy, wz, ...cubeFaces.pz.n, color, cubeFaces.pz.v);
          if (this.get(wx, wy, wz - 1) === BLOCK.AIR) addFace(wx, wy, wz, ...cubeFaces.nz.n, color, cubeFaces.nz.v);
        }
      }
    }

    if (positions.length === 0) {
      // Empty chunk still needs a dummy node to keep map consistent
      const empty = new THREE.Object3D();
      empty.position.set(0, 0, 0);
      return empty;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = true;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    return mesh;
  }

  // Voxel DDA raycast
  raycast(origin, direction, maxDistance = 8) {
    // Based on Amanatides & Woo
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = direction.x > 0 ? 1 : (direction.x < 0 ? -1 : 0);
    const stepY = direction.y > 0 ? 1 : (direction.y < 0 ? -1 : 0);
    const stepZ = direction.z > 0 ? 1 : (direction.z < 0 ? -1 : 0);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;

    const voxelBound = (s, ds, o, d) => {
      if (ds > 0) return (Math.floor(o) + 1 - o) / d;
      if (ds < 0) return (o - Math.floor(o)) / -d;
      return Infinity;
    };

    let tMaxX = voxelBound(stepX, stepX, origin.x, direction.x);
    let tMaxY = voxelBound(stepY, stepY, origin.y, direction.y);
    let tMaxZ = voxelBound(stepZ, stepZ, origin.z, direction.z);

    let face = null;
    let dist = 0;

    for (let i = 0; i < 1024; i++) {
      const id = this.get(x, y, z);
      if (id !== BLOCK.AIR) {
        return { hit: true, x, y, z, id, face, distance: dist };
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX; dist = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 'nx' : 'px';
        } else {
          z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 'nz' : 'pz';
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY; dist = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 'ny' : 'py';
        } else {
          z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 'nz' : 'pz';
        }
      }
      if (dist > maxDistance) break;
    }
    return { hit: false };
  }
}



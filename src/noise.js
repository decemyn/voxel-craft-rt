// Lightweight 2D value-noise + FBM (seeded)

export class RNG {
  constructor(seed = 123456789) {
    this.state = seed >>> 0;
  }
  next() {
    // Xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }
}

export class ValueNoise2D {
  constructor(seed = 1337) {
    this.rng = new RNG(seed);
    this.perm = new Uint32Array(2048);
    for (let i = 0; i < this.perm.length; i++) {
      this.perm[i] = Math.floor(this.rng.next() * 0xffffffff) >>> 0;
    }
  }

  hash(x, y) {
    const p = this.perm;
    let h = p[(x & 2047)] ^ ((p[(y & 2047)] << 16) >>> 0);
    h ^= h >>> 13;
    h ^= h << 17;
    h ^= h >>> 5;
    return (h >>> 0) / 0xffffffff; // 0..1
  }

  smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  noise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const fx = x - x0;
    const fy = y - y0;
    const u = this.smoothstep(fx);
    const v = this.smoothstep(fy);

    const n00 = this.hash(x0, y0);
    const n10 = this.hash(x1, y0);
    const n01 = this.hash(x0, y1);
    const n11 = this.hash(x1, y1);

    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    const nxy = nx0 * (1 - v) + nx1 * v;
    return nxy * 2 - 1; // -1..1
  }

  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 0.5;
    let freq = 1.0;
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      freq *= lacunarity;
      amp *= gain;
    }
    return sum;
  }
}



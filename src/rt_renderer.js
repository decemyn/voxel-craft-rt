import * as THREE from 'three';
import { BLOCK_COLORS } from './world.js';

import config from './config.js';

export class VoxelRayTracer {
  constructor(world, renderer) {
    this.world = world;
    this.renderer = renderer;
    this.enabled = renderer.capabilities.isWebGL2 === true;
    this.gridSize = Math.max(16, Math.min(256, (config?.rt?.gridSize ?? 96))); // clamped
    this.volumeOrigin = new THREE.Vector3(0, 0, 0); // world-space min corner
    this.needsVolumeUpdate = true;
    this.lastCenter = new THREE.Vector3(1e9, 1e9, 1e9);
    this.rebuildThreshold = 8; // update volume when player moved this many blocks

    if (!this.enabled) return;

    const size = this.gridSize;
    const data = new Uint8Array(size * size * size * 4);
    this.texture = new THREE.Data3DTexture(data, size, size, size);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;

    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeom = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uVolume: { value: this.texture },
        uGridSize: { value: new THREE.Vector3(size, size, size) },
        uOrigin: { value: this.volumeOrigin.clone() },
        uCamPos: { value: new THREE.Vector3() },
        uInvProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
        uAmbient: { value: 0.35 },
        uMaxSteps: { value: Math.max(32, Math.min(2048, (config?.rt?.maxSteps ?? 128))) },
        uFogDensity: { value: 0.02 },
        uSkyColor: { value: new THREE.Color(0x87ceeb) },
      },
      vertexShader: `
      out vec2 vUv;
      void main(){
        vUv = (position.xy + 1.0) * 0.5;
        gl_Position = vec4(position, 1.0);
      }
      `,
      fragmentShader: `
      precision highp float;
      precision highp sampler3D;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler3D uVolume;
      uniform vec3 uGridSize;
      uniform vec3 uOrigin;
      uniform vec3 uCamPos;
      uniform mat4 uInvProjection;
      uniform mat4 uInvView;
      uniform vec3 uSunDir;
      uniform float uAmbient;
      uniform int uMaxSteps;
      uniform float uFogDensity;
      uniform vec3 uSkyColor;

      // Fetch voxel at integer coords (0..grid-1). Returns rgba with a>0 => filled
      vec4 voxelAt(ivec3 c){
        // Clamp to edges
        ivec3 cc = clamp(c, ivec3(0), ivec3(uGridSize) - ivec3(1));
        return texelFetch(uVolume, cc, 0);
      }

      bool aabbIntersect(vec3 ro, vec3 rd, vec3 mn, vec3 mx, out float t0, out float t1){
        vec3 invD = 1.0 / rd;
        vec3 tmin = (mn - ro) * invD;
        vec3 tmax = (mx - ro) * invD;
        vec3 tsmaller = min(tmin, tmax);
        vec3 tbigger = max(tmin, tmax);
        t0 = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
        t1 = min(min(tbigger.x, tbigger.y), tbigger.z);
        return t1 >= max(t0, 0.0);
      }

      // Voxel DDA traversal in volume space
      bool traceVoxel(vec3 roWorld, vec3 rdWorld, out ivec3 hitC, out vec3 hitPos, out vec3 hitN, out vec4 hitRGBA){
        vec3 mn = uOrigin;
        vec3 mx = uOrigin + uGridSize;
        float tEnter, tExit;
        if (!aabbIntersect(roWorld, rdWorld, mn, mx, tEnter, tExit)) return false;
        float t = max(tEnter, 0.0);
        vec3 p = roWorld + rdWorld * t;
        vec3 cell = floor(p - uOrigin);
        vec3 rel = p - (uOrigin + cell);
        vec3 step = sign(rdWorld);
        vec3 tDelta = abs(1.0 / rdWorld);
        vec3 tMax = vec3(
          (rdWorld.x > 0.0 ? (1.0 - rel.x) : rel.x) * tDelta.x,
          (rdWorld.y > 0.0 ? (1.0 - rel.y) : rel.y) * tDelta.y,
          (rdWorld.z > 0.0 ? (1.0 - rel.z) : rel.z) * tDelta.z
        );

        for(int i=0;i<1024;i++){
          // Check bounds
          if(any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, uGridSize))) return false;
          ivec3 ic = ivec3(cell);
          vec4 v = voxelAt(ic);
          if (v.a > 0.0) {
            hitC = ic; hitRGBA = v; hitPos = p; // current position is within the filled cell
            // Determine normal from which axis we entered next
            if (tMax.x < tMax.y && tMax.x < tMax.z) hitN = vec3(-step.x, 0.0, 0.0);
            else if (tMax.y < tMax.z) hitN = vec3(0.0, -step.y, 0.0);
            else hitN = vec3(0.0, 0.0, -step.z);
            return true;
          }
          // advance
          if (tMax.x < tMax.y) {
            if (tMax.x < tMax.z) { t += tMax.x; cell.x += step.x; tMax.x += tDelta.x; }
            else { t += tMax.z; cell.z += step.z; tMax.z += tDelta.z; }
          } else {
            if (tMax.y < tMax.z) { t += tMax.y; cell.y += step.y; tMax.y += tDelta.y; }
            else { t += tMax.z; cell.z += step.z; tMax.z += tDelta.z; }
          }
          p = roWorld + rdWorld * t;
          if (t > tExit || i > uMaxSteps) return false;
        }
        return false;
      }

      bool occluded(vec3 p, vec3 n){
        // Simple hard shadow towards sun
        vec3 ro = p + n * 0.02; // offset to avoid self-intersect
        vec3 rd = normalize(uSunDir);
        ivec3 hc; vec3 hp; vec3 hn; vec4 hr;
        return traceVoxel(ro, rd, hc, hp, hn, hr);
      }

      void main(){
        // Reconstruct ray from NDC using near/far unprojection
        vec2 ndc = vUv * 2.0 - 1.0;
        vec4 nearP = uInvProjection * vec4(ndc, -1.0, 1.0);
        vec4 farP  = uInvProjection * vec4(ndc,  1.0, 1.0);
        nearP /= nearP.w;
        farP  /= farP.w;
        vec3 dirView = normalize((farP - nearP).xyz);
        vec3 rd = normalize((uInvView * vec4(dirView, 0.0)).xyz);
        vec3 ro = uCamPos;

        ivec3 hitC; vec3 hitPos; vec3 hitN; vec4 hitRGBA;
        if (traceVoxel(ro, rd, hitC, hitPos, hitN, hitRGBA)){
          // hitRGBA is already normalized 0..1 for UnsignedByte textures
          vec3 baseColor = hitRGBA.rgb;
          float ndotl = max(0.0, dot(hitN, normalize(uSunDir)));
          float shade = uAmbient + (1.0 - float(occluded(hitPos, hitN))) * ndotl * (1.0 - uAmbient);
          vec3 col = baseColor * shade;
          // Simple fog to sky
          float fog = 1.0 - exp(-uFogDensity * length(hitPos - ro));
          vec3 sky = uSkyColor;
          col = mix(col, sky, fog*0.6);
          fragColor = vec4(col, 1.0);
        } else {
          // Sky gradient
          vec3 skyTop = vec3(0.45, 0.75, 0.95);
          vec3 skyH = vec3(0.65, 0.85, 0.98);
          float t = clamp(0.5 + 0.5*rd.y, 0.0, 1.0);
          fragColor = vec4(mix(skyH, skyTop, t), 1.0);
        }
      }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(quadGeom, this.material);
    this.quad.frustumCulled = false;
    this.fullscreenScene.add(this.quad);
  }

  updateVolumeIfNeeded(center) {
    if (!this.enabled) return;
    if (this.needsVolumeUpdate || center.distanceToSquared(this.lastCenter) > (this.rebuildThreshold * this.rebuildThreshold)) {
      this.lastCenter.copy(center);
      this.updateVolume(center);
      this.needsVolumeUpdate = false;
    }
  }

  updateVolume(center) {
    const size = this.gridSize;
    const half = Math.floor(size / 2);
    const origin = new THREE.Vector3(
      Math.floor(center.x) - half,
      Math.max(0, Math.floor(center.y) - half),
      Math.floor(center.z) - half
    );
    this.volumeOrigin.copy(origin);
    if (!this.enabled) return;
    const data = this.texture.image.data;
    const getIndex = (x, y, z) => ((x + y * size + z * size * size) * 4);
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const wx = origin.x + x;
          const wy = origin.y + y;
          const wz = origin.z + z;
          const id = this.world.get(wx, wy, wz);
          const idx = getIndex(x, y, z);
          if (id === 0) {
            data[idx+0] = 0; data[idx+1] = 0; data[idx+2] = 0; data[idx+3] = 0;
          } else {
            const color = new THREE.Color(BLOCK_COLORS[id] || 0xffffff);
            data[idx+0] = Math.floor(color.r * 255);
            data[idx+1] = Math.floor(color.g * 255);
            data[idx+2] = Math.floor(color.b * 255);
            data[idx+3] = 255;
          }
        }
      }
    }
    this.texture.needsUpdate = true;
    this.material.uniforms.uOrigin.value.copy(this.volumeOrigin);
  }

  onWorldChangedAround(x, y, z) {
    // Mark volume dirty if change is inside the current volume
    const o = this.volumeOrigin;
    const s = this.gridSize;
    if (x >= o.x && x < o.x + s && y >= o.y && y < o.y + s && z >= o.z && z < o.z + s) {
      this.needsVolumeUpdate = true;
    }
  }

  render(renderer, camera) {
    if (!this.enabled) return false;
    this.material.uniforms.uCamPos.value.copy(camera.position);
    this.material.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.uInvView.value.copy(camera.matrixWorld);
    renderer.autoClear = true;
    renderer.render(this.fullscreenScene, this.fullscreenCamera);
    return true;
  }
}



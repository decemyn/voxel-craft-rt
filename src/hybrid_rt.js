import * as THREE from 'three';

export class HybridRTRenderer {
  constructor(renderer, scene, world) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.width = 1;
    this.height = 1;

    this.colorTarget = null;
    this.normalTarget = null;
    this.normalMaterial = this.createNormalMaterial();
    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.compositeMaterial = this.createCompositeMaterial();
    const quad = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quad, this.compositeMaterial);
    this.quad.frustumCulled = false;
    this.fullscreenScene.add(this.quad);
    this.frameIndex = 0;
    // Lazy resize handled by caller; avoid window dependency for tests
  }

  resize(w, h) {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    // Color pass target (lit raster)
    this.colorTarget?.dispose?.();
    this.colorTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.colorTarget.depthTexture = new THREE.DepthTexture(this.width, this.height);
    this.colorTarget.depthTexture.type = THREE.UnsignedInt248Type;

    // Normal pass target (stores encoded normal + depth)
    this.normalTarget?.dispose?.();
    this.normalTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.normalTarget.depthTexture = new THREE.DepthTexture(this.width, this.height);
    this.normalTarget.depthTexture.type = THREE.UnsignedInt248Type;

    this.compositeMaterial.uniforms.uResolution.value.set(this.width, this.height);
  }

  createNormalMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec3 vWorldNormal;
        void main(){
          vWorldNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vWorldNormal;
        void main(){
          vec3 n = normalize(vWorldNormal) * 0.5 + 0.5;
          gl_FragColor = vec4(n, 1.0);
        }
      `,
      // Note: no glslVersion here to keep WebGL1-style gl_FragColor compatibility
    });
  }

  createCompositeMaterial() {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uColorTex: { value: null },
        uNormalTex: { value: null },
        uDepthTex: { value: null },
        uVolumeTex: { value: null }, // 3D texture from VoxelRayTracer
        uOrigin: { value: new THREE.Vector3() },
        uGridSize: { value: new THREE.Vector3(1,1,1) },
        uCamPos: { value: new THREE.Vector3() },
        uInvProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uView: { value: new THREE.Matrix4() },
        uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.2).normalize() },
        uSkyColor: { value: new THREE.Color(0x87ceeb) },
        uFogDensity: { value: 0.02 },
        uRainIntensity: { value: 0.0 },
        uFrameIndex: { value: 0 },
        uResolution: { value: new THREE.Vector2(1,1) },
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
        uniform sampler2D uColorTex;
        uniform sampler2D uNormalTex;
        uniform sampler2D uDepthTex;
        uniform sampler3D uVolumeTex;
        uniform vec3 uOrigin;
        uniform vec3 uGridSize;
        uniform vec3 uCamPos;
        uniform mat4 uInvProjection;
        uniform mat4 uInvView;
        uniform mat4 uProjection;
        uniform mat4 uView;
        uniform vec3 uSunDir;
        uniform vec3 uSkyColor;
        uniform float uFogDensity;
        uniform float uRainIntensity;
        uniform int uFrameIndex;
        uniform vec2 uResolution;

        vec3 decodeNormal(vec4 c){ return normalize(c.rgb * 2.0 - 1.0); }

        vec3 reconstructWorldPos(vec2 uv, float depth){
          // From NDC depth to world
          vec4 ndc = vec4(uv*2.0-1.0, depth*2.0-1.0, 1.0);
          vec4 view = uInvProjection * ndc; view /= view.w;
          vec4 world = uInvView * view; world /= world.w;
          return world.xyz;
        }

        vec4 voxelFetch(ivec3 c){
          ivec3 cc = clamp(c, ivec3(0), ivec3(uGridSize)-ivec3(1));
          return texelFetch(uVolumeTex, cc, 0);
        }

        bool traceVoxel(vec3 ro, vec3 rd, out vec3 hitN, out vec3 hitPos, out vec3 col){
          vec3 mn = uOrigin; vec3 mx = uOrigin + uGridSize;
          vec3 invD = 1.0 / rd;
          vec3 t0 = (mn - ro) * invD; vec3 t1 = (mx - ro) * invD;
          vec3 tsm = min(t0,t1); vec3 tbg = max(t0,t1);
          float tEnter = max(max(tsm.x, tsm.y), tsm.z);
          float tExit  = min(min(tbg.x, tbg.y), tbg.z);
          if (tExit < max(tEnter, 0.0)) return false;
          float t = max(tEnter, 0.0);
          vec3 p = ro + rd * t;
          vec3 cell = floor(p - uOrigin);
          vec3 rel = p - (uOrigin + cell);
          vec3 step = sign(rd);
          vec3 tDelta = abs(1.0/rd);
          vec3 tMax = vec3(
            (rd.x>0.0?(1.0-rel.x):rel.x)*tDelta.x,
            (rd.y>0.0?(1.0-rel.y):rel.y)*tDelta.y,
            (rd.z>0.0?(1.0-rel.z):rel.z)*tDelta.z
          );
          for(int i=0;i<256;i++){
            if(any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, uGridSize))) return false;
            ivec3 ic = ivec3(cell);
            vec4 v = voxelFetch(ic);
            if(v.a>0.0){
              // hit color from volume
              col = v.rgb;
              if(tMax.x < tMax.y && tMax.x < tMax.z) hitN = vec3(-step.x,0,0);
              else if(tMax.y < tMax.z) hitN = vec3(0,-step.y,0);
              else hitN = vec3(0,0,-step.z);
              hitPos = p;
              return true;
            }
            if(tMax.x < tMax.y){ if(tMax.x < tMax.z){ t += tMax.x; cell.x += step.x; tMax.x += tDelta.x; }
                                  else { t += tMax.z; cell.z += step.z; tMax.z += tDelta.z; } }
            else { if(tMax.y < tMax.z){ t += tMax.y; cell.y += step.y; tMax.y += tDelta.y; }
                   else { t += tMax.z; cell.z += step.z; tMax.z += tDelta.z; } }
            p = ro + rd * t;
          }
          return false;
        }

        // Hash for randomness
        float hash13(vec3 p){
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        vec3 hemisphereSample(vec3 n, vec2 xi){
          float phi = 6.2831853 * xi.x;
          float cosTheta = pow(1.0 - xi.y, 1.0/(1.0+1.0));
          float sinTheta = sqrt(1.0 - cosTheta*cosTheta);
          vec3 t1 = normalize(abs(n.z) < 0.999 ? cross(n, vec3(0,0,1)) : cross(n, vec3(0,1,0)));
          vec3 t2 = cross(n, t1);
          return normalize(t1 * (cos(phi)*sinTheta) + t2 * (sin(phi)*sinTheta) + n * cosTheta);
        }

        void main(){
          vec4 colorLit = texture(uColorTex, vUv);
          vec4 normalEnc = texture(uNormalTex, vUv);
          float depth = texture(uDepthTex, vUv).r;
          vec3 N = decodeNormal(normalEnc);
          // Handle background
          if(depth==1.0){ fragColor = colorLit; return; }
          // Reconstruct world-space
          vec3 P = reconstructWorldPos(vUv, depth);
          vec3 V = normalize(uCamPos - P);

          // Ambient occlusion via short hemisphere rays into voxel volume
          float ao = 1.0;
          int aoSamples = 4;
          float occ = 0.0;
          for(int i=0;i<4;i++){
            vec2 xi = vec2(hash13(vec3(P.xy, float(i) + float(uFrameIndex))), hash13(vec3(P.zy, float(i*7) + float(uFrameIndex))));
            vec3 dir = hemisphereSample(N, xi);
            vec3 hN, hP, hC; // dummy
            vec3 hitN, hitPos, hitCol;
            if(traceVoxel(P + N*0.02, dir, hitN, hitPos, hitCol)){
              float d = length(hitPos - P);
              occ += exp(-d*0.7);
            }
          }
          ao = clamp(1.0 - occ / float(aoSamples), 0.2, 1.0);

          // Reflections: single ray
          vec3 R = reflect(-V, N);
          // Add rain puddle bias for upward-facing surfaces
          float puddle = smoothstep(0.7, 1.0, N.y) * uRainIntensity;
          // Ripple perturbation
          float t = float(uFrameIndex) * 0.016;
          R.xz += (puddle * 0.03) * vec2(sin(20.0*(P.x+P.z+t)), cos(20.0*(P.x-P.z+t)));
          vec3 rHitN, rHitPos, rCol;
          bool rHit = traceVoxel(P + N*0.02, normalize(R), rHitN, rHitPos, rCol);
          vec3 reflection = rHit ? rCol : uSkyColor;
          float fres = pow(1.0 - max(0.0, dot(N, V)), 5.0);
          float reflStrength = mix(0.06, 0.25 + puddle*0.5, fres);

          // Composite: modulate lit color by AO and add reflection
          vec3 outCol = colorLit.rgb * ao + reflection * reflStrength;
          // Fog blend
          float fog = 1.0 - exp(-uFogDensity * length(P - uCamPos));
          outCol = mix(outCol, uSkyColor, fog*0.5);
          fragColor = vec4(outCol, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
  }

  renderComposite(camera, volumeTexture, volumeOrigin, gridSize, sunDir, skyColor, fogDensity, rainIntensity) {
    this.compositeMaterial.uniforms.uColorTex.value = this.colorTarget.texture;
    this.compositeMaterial.uniforms.uNormalTex.value = this.normalTarget.texture;
    this.compositeMaterial.uniforms.uDepthTex.value = this.normalTarget.depthTexture;
    this.compositeMaterial.uniforms.uVolumeTex.value = volumeTexture;
    this.compositeMaterial.uniforms.uOrigin.value.copy(volumeOrigin);
    this.compositeMaterial.uniforms.uGridSize.value.set(gridSize, gridSize, gridSize);
    this.compositeMaterial.uniforms.uCamPos.value.copy(camera.position);
    this.compositeMaterial.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    this.compositeMaterial.uniforms.uInvView.value.copy(camera.matrixWorld);
    this.compositeMaterial.uniforms.uProjection.value.copy(camera.projectionMatrix);
    this.compositeMaterial.uniforms.uView.value.copy(camera.matrixWorldInverse);
    this.compositeMaterial.uniforms.uSunDir.value.copy(sunDir);
    this.compositeMaterial.uniforms.uSkyColor.value.copy(skyColor);
    this.compositeMaterial.uniforms.uFogDensity.value = fogDensity;
    this.compositeMaterial.uniforms.uRainIntensity.value = rainIntensity;
    this.compositeMaterial.uniforms.uFrameIndex.value = this.frameIndex++;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);
  }
}



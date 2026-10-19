// public/js/ui/model3d_renderer.js
// Real-time WebGL2 3D SkinnedMesh + Cel-Shaded Toon + Outline Renderer for Guildrun Heroes & Monsters.
// Uses the extracted Unity 6 meshes, skeletons, bindposes, 512x512 BCn textures, and AnimationClips
// from /assets/models/manifest.json.

const F16_TABLE = (() => {
  const tbl = new Float32Array(65536);
  const u32 = new Uint32Array(1);
  const f32 = new Float32Array(u32.buffer);
  for (let i = 0; i < 65536; i++) {
    const s = (i & 0x8000) << 16;
    const e = (i >> 10) & 0x1f;
    const m = i & 0x03ff;
    if (e === 0) {
      if (m === 0) {
        u32[0] = s;
      } else {
        let mNorm = m;
        let eNorm = -14;
        while ((mNorm & 0x0400) === 0) {
          mNorm <<= 1;
          eNorm--;
        }
        mNorm &= 0x03ff;
        u32[0] = s | ((eNorm + 127) << 23) | (mNorm << 13);
      }
    } else if (e === 31) {
      u32[0] = s | 0x7f800000 | (m << 13);
    } else {
      u32[0] = s | ((e - 15 + 127) << 23) | (m << 13);
    }
    tbl[i] = f32[0];
  }
  return tbl;
})();

let manifestPromise = null;
let manifestData = null;
const modelDataCache = new Map(); // prefabName -> Promise<parsedModel>

/** Battle camera pitch (radians, looking down). Matches the ~0.66 vertical squash of the stone circle. */
export const CAMERA_PITCH = 0.72;

/**
 * Yaw making a model face a screen-space direction (dx right, dy down) on the board.
 * Unity models face +Z: yaw 0 = back to the camera (facing up the screen), PI = facing the camera.
 */
export function yawToward(dx, dy, scaleY = 0.66) {
  return Math.atan2(dx, -dy / scaleY);
}

export function loadModelManifest() {
  if (manifestData) return Promise.resolve(manifestData);
  if (!manifestPromise) {
    manifestPromise = fetch('./assets/models/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        manifestData = d;
        return d;
      })
      .catch(() => null);
  }
  return manifestPromise;
}

export function resolveUnitPrefabName(unit, manifest) {
  if (!manifest || !unit) return null;
  if (unit.prefabName && manifest.models[unit.prefabName]) return unit.prefabName;
  if (unit.heroId != null) {
    const p = manifest.heroes?.[String(unit.heroId)];
    if (p && manifest.models[p]) return p;
  }
  if (unit.enemyId != null) {
    const p = manifest.enemies?.[String(unit.enemyId)];
    if (p && manifest.models[p]) return p;
  }
  const name = String(unit.name || '');
  if (name && manifest.enemyByName?.[name]) {
    return manifest.enemyByName[name];
  }
  for (const [k, v] of Object.entries(manifest.enemyByName || {})) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return unit.team === 'enemy' ? 'Turtle' : 'Irini';
}

function loadModelData(prefabName) {
  if (modelDataCache.has(prefabName)) return modelDataCache.get(prefabName);
  const p = (async () => {
    const metaRes = await fetch(`./assets/models/${prefabName}.json`);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const binRes = await fetch(meta.bin);
    if (!binRes.ok) return null;
    const buf = await binRes.arrayBuffer();

    const numBones = meta.numBones || 1;
    const submeshes = meta.submeshes.map((sm) => {
      const vFloats = new Float32Array(buf, sm.vOffset, sm.vCount * 12);
      const bU16 = new Uint16Array(buf, sm.bOffset, sm.vCount * 4);
      const bFloats = new Float32Array(sm.vCount * 4);
      for (let i = 0; i < bU16.length; i++) bFloats[i] = bU16[i];
      const indices = new Uint16Array(buf, sm.iOffset, sm.iCount);
      return {
        vCount: sm.vCount,
        iCount: sm.iCount,
        vFloats,
        bFloats,
        indices,
        textureUrl: sm.texture,
      };
    });

    const animations = {};
    for (const [state, anim] of Object.entries(meta.animations || {})) {
      const totalFloats = anim.frames * numBones * 12;
      const u16 = new Uint16Array(buf, anim.offset, totalFloats);
      const f32 = new Float32Array(totalFloats);
      for (let i = 0; i < totalFloats; i++) {
        f32[i] = F16_TABLE[u16[i]];
      }
      animations[state] = {
        frames: anim.frames,
        duration: anim.duration || 1.0,
        loop: Boolean(anim.loop),
        data: f32,
      };
    }

    return {
      name: prefabName,
      numBones,
      height: meta.height || 1.8,
      submeshes,
      animations,
    };
  })().catch((err) => {
    console.warn('[model3d] Failed loading model', prefabName, err);
    return null;
  });
  modelDataCache.set(prefabName, p);
  return p;
}

const VS_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_norm;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec4 a_weights;
layout(location = 4) in vec4 a_bones;

uniform sampler2D u_boneTex;
uniform vec2 u_footPos;       // pixel (x, y) on 1920x1080 canvas
uniform vec2 u_viewport;      // (1920, 1080)
uniform float u_scale;        // pixels per meter
uniform float u_yaw;          // radians
uniform float u_pitch;        // radians
uniform float u_baseDepth;    // base ndc Z for unit sorting
uniform float u_outlinePass;  // 1.0 for outline pass, 0.0 for lit pass
uniform float u_outlineWidth; // pixels

out vec2 v_uv;
out vec3 v_normCam;
out vec3 v_posCam;

void fetchBone(int idx, out vec4 r0, out vec4 r1, out vec4 r2) {
  r0 = texelFetch(u_boneTex, ivec2(0, idx), 0);
  r1 = texelFetch(u_boneTex, ivec2(1, idx), 0);
  r2 = texelFetch(u_boneTex, ivec2(2, idx), 0);
}

void main() {
  int b0 = int(a_bones.x + 0.5);
  int b1 = int(a_bones.y + 0.5);
  int b2 = int(a_bones.z + 0.5);
  int b3 = int(a_bones.w + 0.5);

  vec4 r0_0, r1_0, r2_0;
  vec4 r0_1, r1_1, r2_1;
  vec4 r0_2, r1_2, r2_2;
  vec4 r0_3, r1_3, r2_3;

  fetchBone(b0, r0_0, r1_0, r2_0);
  fetchBone(b1, r0_1, r1_1, r2_1);
  fetchBone(b2, r0_2, r1_2, r2_2);
  fetchBone(b3, r0_3, r1_3, r2_3);

  vec4 row0 = r0_0 * a_weights.x + r0_1 * a_weights.y + r0_2 * a_weights.z + r0_3 * a_weights.w;
  vec4 row1 = r1_0 * a_weights.x + r1_1 * a_weights.y + r1_2 * a_weights.z + r1_3 * a_weights.w;
  vec4 row2 = r2_0 * a_weights.x + r2_1 * a_weights.y + r2_2 * a_weights.z + r2_3 * a_weights.w;

  vec4 p4 = vec4(a_pos, 1.0);
  vec3 skinnedPos = vec3(dot(row0, p4), dot(row1, p4), dot(row2, p4));
  vec3 skinnedNorm = normalize(vec3(
    dot(row0.xyz, a_norm),
    dot(row1.xyz, a_norm),
    dot(row2.xyz, a_norm)
  ) + vec3(0.0, 1e-5, 0.0));

  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float cp = cos(u_pitch);
  float sp = sin(u_pitch);

  // Rotate around Y by yaw
  vec3 pYaw = vec3(
    skinnedPos.x * cy + skinnedPos.z * sy,
    skinnedPos.y,
    -skinnedPos.x * sy + skinnedPos.z * cy
  );
  vec3 nYaw = vec3(
    skinnedNorm.x * cy + skinnedNorm.z * sy,
    skinnedNorm.y,
    -skinnedNorm.x * sy + skinnedNorm.z * cy
  );

  // Tilt by camera pitch: camera sits at -Z looking down onto the board.
  // Points further away (+Z) rise on screen; higher points (+Y) are closer to the camera.
  vec3 pCam = vec3(
    pYaw.x,
    pYaw.y * cp + pYaw.z * sp,
    -pYaw.y * sp + pYaw.z * cp
  );
  vec3 nCam = normalize(vec3(
    nYaw.x,
    nYaw.y * cp + nYaw.z * sp,
    -nYaw.y * sp + nYaw.z * cp
  ));

  vec2 px = vec2(
    u_footPos.x + pCam.x * u_scale,
    u_footPos.y - pCam.y * u_scale
  );

  if (u_outlinePass > 0.5) {
    vec2 n2 = nCam.xy;
    float nl = length(n2);
    vec2 extrudeDir = nl > 0.001 ? (n2 / nl) : vec2(0.0, -1.0);
    px += vec2(extrudeDir.x, -extrudeDir.y) * u_outlineWidth;
  }

  float ndcX = (px.x / u_viewport.x) * 2.0 - 1.0;
  float ndcY = 1.0 - (px.y / u_viewport.y) * 2.0;
  float ndcZ = clamp(u_baseDepth + pCam.z * 0.025 + u_outlinePass * 0.008, -0.98, 0.98);

  gl_Position = vec4(ndcX, ndcY, ndcZ, 1.0);
  v_uv = vec2(a_uv.x, 1.0 - a_uv.y);
  v_normCam = nCam;
  v_posCam = pCam;
}
`;

const FS_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normCam;
in vec3 v_posCam;

uniform sampler2D u_albedoTex;
uniform float u_outlinePass;
uniform vec3 u_outlineColor;
uniform vec3 u_tintColor;
uniform float u_tintStrength;
uniform float u_alpha;

out vec4 outColor;

void main() {
  vec4 texCol = texture(u_albedoTex, v_uv);
  if (texCol.a < 0.15) discard;

  if (u_outlinePass > 0.5) {
    outColor = vec4(u_outlineColor, u_alpha);
    return;
  }

  vec3 N = normalize(v_normCam);
  // Warm morning directional light from upper-left-front
  vec3 L = normalize(vec3(-0.38, 0.65, -0.66));
  float ndl = dot(N, L) * 0.5 + 0.5;

  // 2-band cel-shaded toon step matching Guildrun's Unity Toon shader
  float toon = mix(0.68, 1.10, smoothstep(0.42, 0.55, ndl));

  // Subtle rim light on edges
  float rim = pow(clamp(1.0 - abs(N.z), 0.0, 1.0), 3.0) * 0.14;

  vec3 lit = texCol.rgb * toon + vec3(rim * 0.9, rim * 0.95, rim);
  lit = mix(lit, u_tintColor, u_tintStrength);

  outColor = vec4(clamp(lit, 0.0, 1.0), u_alpha);
}
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[model3d] Shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function createModel3DRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: false,
  });
  if (!gl) {
    console.warn('[model3d] WebGL2 not available');
    return null;
  }

  const vs = compileShader(gl, gl.VERTEX_SHADER, VS_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS_SRC);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[model3d] Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }

  const locs = {
    boneTex: gl.getUniformLocation(prog, 'u_boneTex'),
    albedoTex: gl.getUniformLocation(prog, 'u_albedoTex'),
    footPos: gl.getUniformLocation(prog, 'u_footPos'),
    viewport: gl.getUniformLocation(prog, 'u_viewport'),
    scale: gl.getUniformLocation(prog, 'u_scale'),
    yaw: gl.getUniformLocation(prog, 'u_yaw'),
    pitch: gl.getUniformLocation(prog, 'u_pitch'),
    baseDepth: gl.getUniformLocation(prog, 'u_baseDepth'),
    outlinePass: gl.getUniformLocation(prog, 'u_outlinePass'),
    outlineWidth: gl.getUniformLocation(prog, 'u_outlineWidth'),
    outlineColor: gl.getUniformLocation(prog, 'u_outlineColor'),
    tintColor: gl.getUniformLocation(prog, 'u_tintColor'),
    tintStrength: gl.getUniformLocation(prog, 'u_tintStrength'),
    alpha: gl.getUniformLocation(prog, 'u_alpha'),
  };

  // Fallback 1x1 white texture
  const whiteTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, whiteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([230, 230, 230, 255]));

  const gpuModelCache = new Map(); // prefabName -> gpuModel
  const gpuTexCache = new Map();   // url -> WebGLTexture

  function getOrCreateTexture(url) {
    if (!url) return whiteTex;
    if (gpuTexCache.has(url)) return gpuTexCache.get(url);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([180, 180, 190, 255]));
    gpuTexCache.set(url, tex);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    };
    img.src = url;
    return tex;
  }

  function getOrCreateGpuModel(prefabName) {
    if (!prefabName) return null;
    if (gpuModelCache.has(prefabName)) return gpuModelCache.get(prefabName);
    gpuModelCache.set(prefabName, null); // loading sentinel
    loadModelData(prefabName).then((mData) => {
      if (!mData) return;
      const boneTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, boneTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 3, mData.numBones, 0, gl.RGBA, gl.FLOAT, null);

      const gpuSubmeshes = mData.submeshes.map((sm) => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, sm.vFloats, gl.STATIC_DRAW);

        // pos(3), norm(3), uv(2), weights(4) = 48 bytes stride
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 48, 24);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);

        const bbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bbo);
        gl.bufferData(gl.ARRAY_BUFFER, sm.bFloats, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 16, 0);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sm.indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        return {
          vao,
          iCount: sm.iCount,
          tex: getOrCreateTexture(sm.textureUrl),
        };
      });

      gpuModelCache.set(prefabName, {
        name: prefabName,
        numBones: mData.numBones,
        height: mData.height,
        boneTex,
        boneScratch: new Float32Array(mData.numBones * 12),
        submeshes: gpuSubmeshes,
        animations: mData.animations,
      });
    });
    return null;
  }

  loadModelManifest();

  function sampleAnimation(gpuModel, animState, animTime) {
    const anim = gpuModel.animations[animState] || gpuModel.animations.idle;
    const out = gpuModel.boneScratch;
    if (!anim) return out;
    const nFrames = anim.frames;
    const dur = Math.max(0.05, anim.duration);
    let normT = animTime / dur;
    if (anim.loop) {
      normT = normT - Math.floor(normT);
    } else {
      normT = Math.max(0.0, Math.min(1.0, normT));
    }
    const fFloat = normT * (nFrames - 1);
    const f0 = Math.min(nFrames - 1, Math.floor(fFloat));
    const f1 = anim.loop ? (f0 + 1) % nFrames : Math.min(nFrames - 1, f0 + 1);
    const alpha = fFloat - f0;
    const stride = gpuModel.numBones * 12;
    const base0 = f0 * stride;
    const base1 = f1 * stride;
    const src = anim.data;
    const invA = 1.0 - alpha;
    for (let i = 0; i < stride; i++) {
      out[i] = src[base0 + i] * invA + src[base1 + i] * alpha;
    }
    return out;
  }

  /**
   * Render a list of 3D units onto the WebGL2 canvas.
   * Each entry in `units`:
   *   { heroId, enemyId, name, team, footX, footY, scalePx, yaw, animState, animTime, flash, statusTint, alpha, isBoss }
   */
  function computeScalePx(u, gpuModel) {
    const modelH = gpuModel.height || 1.8;
    const targetPxH = u.targetHeightPx || (u.isBoss ? 148 : u.team === 'enemy' ? 98 : 112);
    return u.scalePx || Math.max(20, Math.min(220, targetPxH / Math.max(0.45, Math.min(4.8, modelH * 0.88))));
  }

  /** Approximate on-screen height (canvas px) of a unit's model, or 0 if not loaded. */
  function getUnitHeightPx(unit) {
    if (!manifestData) return 0;
    const gpuModel = gpuModelCache.get(resolveUnitPrefabName(unit, manifestData));
    if (!gpuModel) return 0;
    return computeScalePx(unit, gpuModel) * (gpuModel.height || 1.8) * Math.cos(CAMERA_PITCH);
  }

  function renderUnits(units) {
    const w = canvas.width || 1920;
    const h = canvas.height || 1080;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (!manifestData || !units || units.length === 0) return 0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(prog);
    gl.uniform2f(locs.viewport, w, h);
    gl.uniform1f(locs.pitch, CAMERA_PITCH);
    gl.uniform1i(locs.boneTex, 0);
    gl.uniform1i(locs.albedoTex, 1);

    let drawnCount = 0;

    for (const u of units) {
      const prefabName = resolveUnitPrefabName(u, manifestData);
      const gpuModel = getOrCreateGpuModel(prefabName);
      if (!gpuModel) continue;
      drawnCount++;

      const boneData = sampleAnimation(gpuModel, u.animState || 'idle', u.animTime || 0.0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gpuModel.boneTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 3, gpuModel.numBones, gl.RGBA, gl.FLOAT, boneData);

      // Normalize scale based on model height so all characters/monsters fit the stone circle naturally
      const scalePx = computeScalePx(u, gpuModel);

      const baseDepth = Math.max(-0.85, Math.min(0.85, 0.5 - (u.footY - h * 0.5) / (h * 1.2)));

      gl.uniform2f(locs.footPos, u.footX, u.footY);
      gl.uniform1f(locs.scale, scalePx);
      gl.uniform1f(locs.yaw, u.yaw != null ? u.yaw : (u.team === 'enemy' ? -0.55 : 2.55));
      gl.uniform1f(locs.baseDepth, baseDepth);
      gl.uniform1f(locs.alpha, u.alpha != null ? u.alpha : 1.0);

      // Determine tint (cast/hit flash or status effect)
      let tintR = 1.0, tintG = 1.0, tintB = 1.0, tintStr = 0.0;
      if (u.flash > 0.01) {
        tintR = 1.0; tintG = 0.96; tintB = 0.82;
        tintStr = Math.min(0.65, u.flash * 0.7);
      } else if (u.statusTint) {
        tintR = u.statusTint[0];
        tintG = u.statusTint[1];
        tintB = u.statusTint[2];
        tintStr = u.statusTint[3] || 0.28;
      }
      gl.uniform3f(locs.tintColor, tintR, tintG, tintB);
      gl.uniform1f(locs.tintStrength, tintStr);
      gl.uniform3f(locs.outlineColor, 0.03, 0.04, 0.06);
      gl.uniform1f(locs.outlineWidth, u.outlineWidth || 2.3);

      // Pass 1: Cel-shaded black outline pass
      gl.uniform1f(locs.outlinePass, 1.0);
      for (const sm of gpuModel.submeshes) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sm.tex);
        gl.bindVertexArray(sm.vao);
        gl.drawElements(gl.TRIANGLES, sm.iCount, gl.UNSIGNED_SHORT, 0);
      }

      // Pass 2: Cel-shaded Toon lit pass
      gl.uniform1f(locs.outlinePass, 0.0);
      for (const sm of gpuModel.submeshes) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sm.tex);
        gl.bindVertexArray(sm.vao);
        gl.drawElements(gl.TRIANGLES, sm.iCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    gl.bindVertexArray(null);
    return drawnCount;
  }

  function isUnitModelReady(unit) {
    if (!manifestData) return false;
    const prefabName = resolveUnitPrefabName(unit, manifestData);
    return Boolean(prefabName && gpuModelCache.get(prefabName));
  }

  return {
    canvas,
    gl,
    renderUnits,
    isUnitModelReady,
    getUnitHeightPx,
    /** Duration (s) of an animation clip for this unit, or `fallback` if not loaded. */
    getAnimDuration(unit, state, fallback = 1.0) {
      if (!manifestData) return fallback;
      const gpuModel = gpuModelCache.get(resolveUnitPrefabName(unit, manifestData));
      const anim = gpuModel?.animations?.[state];
      return anim ? Math.max(0.05, anim.duration) : fallback;
    },
    preloadUnit(unit) {
      if (!manifestData) {
        loadModelManifest().then((m) => {
          if (m) getOrCreateGpuModel(resolveUnitPrefabName(unit, m));
        });
      } else {
        getOrCreateGpuModel(resolveUnitPrefabName(unit, manifestData));
      }
    },
  };
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { hashString32, uvToCell } from '@engine/biosphereGrid.js';
import { composeCreatureDataUrl } from '@art/CreatureComposer.js';

const TEX_W = 1024;
const TEX_H = 512;

// ── Body classification ─────────────────────────────────────────────────────

function classifyBody(body) {
  if (!body) return 'unknown';
  if (body.type === 'planet') {
    const surf = (body.surfaceType || '').toLowerCase();
    if (surf === 'gaseous' || (body.massEarth && body.massEarth > 25)) return 'gas_giant';
    if (surf === 'icy') return 'ice_world';
    if (surf === 'molten') return 'lava_world';
    return 'rocky_planet';
  }
  if (body.type === 'star') {
    const phase = String(body.phase || '').toLowerCase();
    if (phase.includes('white_dwarf')) return 'white_dwarf';
    if (phase.includes('neutron')) return 'neutron_star';
    if (phase.includes('giant')) return 'giant_star';
    return 'star';
  }
  if (body.type === 'black_hole') return 'black_hole';
  return body.type || 'unknown';
}

function bodyDisplayKind(body) {
  const k = classifyBody(body);
  switch (k) {
    case 'gas_giant':     return 'Gas giant';
    case 'ice_world':     return 'Ice world';
    case 'lava_world':    return 'Lava world';
    case 'rocky_planet':  return 'Rocky planet';
    case 'giant_star':    return 'Giant star';
    case 'white_dwarf':   return 'White dwarf';
    case 'neutron_star':  return 'Neutron star';
    case 'star':          return 'Star';
    case 'black_hole':    return 'Black hole';
    default:              return body?.type || 'Body';
  }
}

// ── Deterministic noise helpers ─────────────────────────────────────────────

function hashedNoise(seed, bodyId, latI, lonI) {
  return hashString32(`${seed}|${bodyId}|${latI}|${lonI}`) / 0xffffffff;
}

// Smooth-ish multi-octave value noise built from the deterministic 16×32 hash grid.
// Sufficient for an indicative procedural surface; fast on a 1024×512 canvas.
function smoothNoise(seed, bodyId, u, v, octaves = 4) {
  let total = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const lat = 16 * freq;
    const lon = 32 * freq;
    const fx = u * lon;
    const fy = v * lat;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hashedNoise(seed + o * 7919, bodyId, y0 % lat, ((x0 % lon) + lon) % lon);
    const b = hashedNoise(seed + o * 7919, bodyId, y0 % lat, ((x0 + 1) % lon + lon) % lon);
    const c = hashedNoise(seed + o * 7919, bodyId, (y0 + 1) % lat, ((x0 % lon) + lon) % lon);
    const d = hashedNoise(seed + o * 7919, bodyId, (y0 + 1) % lat, ((x0 + 1) % lon + lon) % lon);
    const ix0 = a + (b - a) * sx;
    const ix1 = c + (d - c) * sx;
    total += amp * (ix0 + (ix1 - ix0) * sy);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

function speciesColor(speciesId) {
  const h = hashString32(String(speciesId)) % 360;
  return `hsla(${h}, 55%, 48%, 0.55)`;
}

// ── Texture painters per body kind ──────────────────────────────────────────

/** Paint a planet-style equirectangular surface with biosphere overlay. */
function paintPlanetTexture(ctx, body, kind) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const water = Math.max(0, Math.min(1, body.waterCoverage ?? (body.hasWater ? 0.65 : 0.08)));
  const surfaceSeed = body.surfaceSeed ?? hashString32(`surf|${body.id}`);
  const grid = body.biosphereGrid;

  const oceanShallow = [40, 110, 180];
  const oceanDeep   = [10, 30, 80];
  const land1 = [55, 110, 50];
  const land2 = [105, 95, 55];
  const desert = [185, 155, 95];
  const ice   = [225, 235, 245];
  const lava1 = [180, 50, 25];
  const lava2 = [255, 165, 30];
  const gas1  = [180, 165, 130];
  const gas2  = [220, 200, 175];
  const ice1  = [185, 220, 240];
  const ice2  = [240, 248, 255];

  const imgData = ctx.createImageData(w, h);
  const { data } = imgData;

  for (let py = 0; py < h; py++) {
    const v = py / h;
    const latAbs = Math.abs(v - 0.5) * 2;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const elev = smoothNoise(surfaceSeed, body.id, u, v, 4);
      let r = 0, g = 0, b = 0;

      if (kind === 'gas_giant') {
        const band = Math.sin(v * 18 + smoothNoise(surfaceSeed, body.id, u, v, 2) * 1.5);
        const t = (band + 1) * 0.5;
        r = gas1[0] + (gas2[0] - gas1[0]) * t;
        g = gas1[1] + (gas2[1] - gas1[1]) * t;
        b = gas1[2] + (gas2[2] - gas1[2]) * t;
        const turb = smoothNoise(surfaceSeed + 33, body.id, u, v, 3);
        if (turb > 0.7) {
          r = Math.min(255, r + 40 * (turb - 0.7) * 4);
          g = Math.min(255, g + 30 * (turb - 0.7) * 4);
        }
      } else if (kind === 'lava_world') {
        const t = elev;
        if (t > 0.55) {
          r = lava2[0]; g = lava2[1]; b = lava2[2];
        } else if (t > 0.4) {
          const f = (t - 0.4) / 0.15;
          r = lava1[0] + (lava2[0] - lava1[0]) * f;
          g = lava1[1] + (lava2[1] - lava1[1]) * f;
          b = lava1[2] + (lava2[2] - lava1[2]) * f;
        } else {
          r = 35 + t * 60;
          g = 12 + t * 18;
          b = 8;
        }
      } else if (kind === 'ice_world') {
        const t = elev;
        const fl = t > 0.55 ? 1 : 0.4 + 0.6 * t;
        r = ice1[0] * (1 - fl) + ice2[0] * fl;
        g = ice1[1] * (1 - fl) + ice2[1] * fl;
        b = ice1[2] * (1 - fl) + ice2[2] * fl;
      } else {
        // Rocky/Earth-like
        const landTh = 1 - water * 0.92;
        const isLand = elev > landTh;
        if (!isLand) {
          const depth = (landTh - elev) / Math.max(0.001, landTh);
          r = oceanShallow[0] * (1 - depth) + oceanDeep[0] * depth;
          g = oceanShallow[1] * (1 - depth) + oceanDeep[1] * depth;
          b = oceanShallow[2] * (1 - depth) + oceanDeep[2] * depth;
        } else if (latAbs > 0.85) {
          r = ice[0]; g = ice[1]; b = ice[2];
        } else {
          const elevAbove = (elev - landTh) / Math.max(0.001, 1 - landTh);
          const arid = latAbs > 0.45 && latAbs < 0.6 ? 0.55 : 0.0;
          const tropic = latAbs < 0.25 ? 0.35 : 0.0;
          const baseR = land1[0] * (1 - arid) + desert[0] * arid;
          const baseG = land1[1] * (1 - arid) + desert[1] * arid;
          const baseB = land1[2] * (1 - arid) + desert[2] * arid;
          const tipR = land2[0] * (1 - tropic) + (baseR + 30) * tropic;
          const tipG = land2[1] * (1 - tropic) + (baseG + 20) * tropic;
          const tipB = land2[2] * (1 - tropic) + baseB * tropic;
          r = baseR * (1 - elevAbove) + tipR * elevAbove;
          g = baseG * (1 - elevAbove) + tipG * elevAbove;
          b = baseB * (1 - elevAbove) + tipB * elevAbove;
        }
      }

      // Biosphere overlay (planets only, respects existing grid)
      if (grid?.cells?.length) {
        const { i } = uvToCell(u, v, grid.lat, grid.lon);
        const cell = grid.cells[i];
        if (cell?.dominantSpeciesId && cell.biomass01 > 0.08) {
          const hue = hashString32(cell.dominantSpeciesId) % 360;
          const a = Math.min(0.45, cell.biomass01 * 0.5);
          const cr = (Math.sin((hue / 360) * Math.PI * 2) * 0.5 + 0.5) * 255;
          const cg = (Math.sin((hue / 360) * Math.PI * 2 + 2.094) * 0.5 + 0.5) * 255;
          const cb = (Math.sin((hue / 360) * Math.PI * 2 + 4.188) * 0.5 + 0.5) * 255;
          r = r * (1 - a) + cr * a;
          g = g * (1 - a) + cg * a;
          b = b * (1 - a) + cb * a;
        }
        if ((cell?.civilizationInfluence01 ?? 0) > 0.12) {
          const c = cell.civilizationInfluence01 * 0.30;
          r = Math.min(255, r + 90 * c);
          g = Math.min(255, g + 70 * c);
          b = Math.min(255, b + 25 * c);
        }
      }

      const idx = (py * w + px) * 4;
      data[idx]     = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

/** Paint a star surface (granulation + sunspots). Color from temperature. */
function paintStarTexture(ctx, body, kind) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const T = body.temperature || 5500;
  // Approximate blackbody color
  const tNorm = Math.min(1, Math.max(0, (T - 2500) / (30000 - 2500)));
  // Cool red → yellow → white → blue
  let baseR, baseG, baseB;
  if (T < 4000)      { baseR = 230; baseG =  90; baseB =  40; }
  else if (T < 5500) { baseR = 255; baseG = 165; baseB =  60; }
  else if (T < 7000) { baseR = 255; baseG = 230; baseB = 170; }
  else if (T < 10000){ baseR = 230; baseG = 235; baseB = 255; }
  else               { baseR = 170; baseG = 200; baseB = 255; }

  if (kind === 'white_dwarf')  { baseR = 240; baseG = 245; baseB = 255; }
  if (kind === 'neutron_star') { baseR = 220; baseG = 240; baseB = 255; }

  const seed = body.surfaceSeed ?? hashString32(`star|${body.id}`);
  const imgData = ctx.createImageData(w, h);
  const { data } = imgData;

  const flareBoost = Math.max(0, Math.min(1, body.flareActivity ?? 0.5));
  const isCompact = kind === 'white_dwarf' || kind === 'neutron_star';

  for (let py = 0; py < h; py++) {
    const v = py / h;
    const latAbs = Math.abs(v - 0.5) * 2;
    const limb = 1 - latAbs * latAbs * 0.25;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const gran = smoothNoise(seed, body.id, u, v, 3);
      const fine = smoothNoise(seed + 13, body.id, u, v, 5);
      const granulation = 0.6 + 0.4 * (gran * 0.6 + fine * 0.4);

      // Sunspot field (cool dark patches at mid-lat)
      const spotMask = smoothNoise(seed + 99, body.id, u, v, 2);
      let spot = 0;
      if (!isCompact && spotMask > 0.78 && latAbs > 0.15 && latAbs < 0.65) {
        spot = (spotMask - 0.78) * 4 * 0.55;
      }

      let r = baseR * granulation * (1 - spot);
      let g = baseG * granulation * (1 - spot);
      let b = baseB * granulation * (1 - spot);

      // Flare-ish bright streaks
      if (!isCompact && fine > 0.85 && Math.random() < flareBoost * 0.05) {
        r = Math.min(255, r + 60);
        g = Math.min(255, g + 30);
      }

      // Gentle limb darkening
      r *= limb; g *= limb; b *= limb;

      const idx = (py * w + px) * 4;
      data[idx]     = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  // Avoid lint warning for unused tNorm in some build configs
  void tNorm;
}

/** Paint a black hole "surface" (essentially black with a faint photon-ring tint at the rim). */
function paintBlackHoleTexture(ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
}

// ── 3D sphere component (Three.js, plain) ───────────────────────────────────

function useBodyTexture(body) {
  const canvasRef = useRef(null);
  const textureRef = useRef(null);

  if (!canvasRef.current) {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    canvasRef.current = c;
  }

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !body) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const kind = classifyBody(body);
    if (body.type === 'planet') paintPlanetTexture(ctx, body, kind);
    else if (body.type === 'star') paintStarTexture(ctx, body, kind);
    else if (body.type === 'black_hole') paintBlackHoleTexture(ctx);
    else paintPlanetTexture(ctx, body, 'rocky_planet');

    if (!textureRef.current) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      textureRef.current = tex;
    }
    textureRef.current.needsUpdate = true;
  }, [body]);

  useEffect(() => () => {
    if (textureRef.current) {
      textureRef.current.dispose();
      textureRef.current = null;
    }
  }, []);

  return { canvas: canvasRef.current, texture: textureRef, repaint };
}

function BodyGlobe({ body, kind, onPick, autoRotate, repaintTick }) {
  const containerRef = useRef(null);
  const stateRef = useRef(null);
  const { canvas: texCanvas, texture: textureHandle, repaint } = useBodyTexture(body);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Initial paint (and re-paint when body, kind, or repaintTick changes)
  useEffect(() => {
    repaint();
  }, [repaint, kind, repaintTick]);

  // Set up the scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !body) return undefined;

    const width  = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.05, 50);
    camera.position.set(0, 0.3, 3.4);

    // Light setup:
    //  * Stars/black holes glow on their own (emissive-style materials), but a
    //    weak ambient still helps anti-alias the silhouette.
    //  * Planets get a key sun + soft fill, plus a subtle rim.
    const ambient   = new THREE.AmbientLight(0xffffff, 0.25);
    const keyLight  = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(3, 2, 4);
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.25);
    fillLight.position.set(-3, -1, -2);
    scene.add(ambient, keyLight, fillLight);

    // Sphere & material — material parameters are reconfigured per body in the
    // body-change effect below, so we start with a generic Lambert.
    const sphereGeom = new THREE.SphereGeometry(1, 96, 64);
    const material   = new THREE.MeshPhongMaterial({
      map: textureHandle.current,
      shininess: 6,
      specular: new THREE.Color(0x222233),
    });
    const sphere = new THREE.Mesh(sphereGeom, material);
    scene.add(sphere);

    // Optional accretion disk ring (added/removed when a black hole is selected)
    let diskMesh = null;

    // Cloud overlay for habitable planets
    let cloudMesh = null;

    // Star halo billboard (a soft sprite for stars)
    let halo = null;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.rotateSpeed    = 0.8;
    controls.zoomSpeed      = 0.6;
    controls.enablePan      = false;
    controls.minDistance    = 1.6;
    controls.maxDistance    = 7;
    controls.target.set(0, 0, 0);

    const raycaster = new THREE.Raycaster();
    const ndc       = new THREE.Vector2();

    let alive = true;
    let last  = performance.now();

    const onResize = () => {
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 360;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const onPointerDown = (ev) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width)  * 2 - 1;
      ndc.y = -((ev.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(sphere, false);
      if (hits.length > 0) {
        const hit = hits[0];
        if (hit.uv && onPickRef.current) {
          // Globe is rotated around Y by sphere.rotation.y (auto-rotate).
          // For picking against the *texture* coordinates we need the original
          // texture u, which equals (uv.x - rotationFraction) modulo 1. The uv
          // returned by Three.js already corresponds to the rotated mesh, so
          // we just consume it as-is — the texture has been rotated together
          // with the mesh, so uv.x is the right index into the texture.
          onPickRef.current({ u: hit.uv.x, v: 1 - hit.uv.y, point: hit.point });
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const animate = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (autoRotateRef.current) {
        sphere.rotation.y += dt * 0.18;
        if (cloudMesh) cloudMesh.rotation.y += dt * 0.22;
        if (diskMesh)  diskMesh.rotation.y  += dt * 0.6;
      }
      controls.update();
      renderer.render(scene, camera);
      stateRef.current.frame = requestAnimationFrame(animate);
    };

    const autoRotateRef = { current: !!autoRotate };

    stateRef.current = {
      renderer, scene, camera, sphere, material, controls,
      ambient, keyLight, fillLight, diskMesh, cloudMesh, halo,
      ro, frame: 0, autoRotateRef,
    };

    stateRef.current.frame = requestAnimationFrame(animate);

    return () => {
      alive = false;
      cancelAnimationFrame(stateRef.current?.frame);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      ro.disconnect();
      controls.dispose();
      sphereGeom.dispose();
      const finalMat = stateRef.current?.material;
      if (finalMat && typeof finalMat.dispose === 'function') {
        finalMat.dispose();
      }
      if (stateRef.current?.diskMesh) {
        stateRef.current.diskMesh.geometry?.dispose();
        stateRef.current.diskMesh.material?.map?.dispose();
        stateRef.current.diskMesh.material?.dispose();
      }
      if (stateRef.current?.cloudMesh) {
        stateRef.current.cloudMesh.geometry?.dispose();
        stateRef.current.cloudMesh.material?.dispose();
      }
      if (stateRef.current?.halo) {
        stateRef.current.halo.material?.map?.dispose();
        stateRef.current.halo.material?.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
    // We intentionally only re-create the scene when the canvas/container
    // remounts; per-body updates are handled in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push autoRotate flag through without rebuilding the scene
  useEffect(() => {
    if (stateRef.current?.autoRotateRef) {
      stateRef.current.autoRotateRef.current = !!autoRotate;
    }
  }, [autoRotate]);

  // Reconfigure material/extras when body or kind changes
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !body) return;

    // Always link the (possibly newly created) texture
    s.material.map = textureHandle.current;
    s.material.needsUpdate = true;

    // Strip any previous extras
    if (s.diskMesh) {
      s.scene.remove(s.diskMesh);
      s.diskMesh.geometry?.dispose();
      s.diskMesh.material?.dispose();
      s.diskMesh = null;
    }
    if (s.cloudMesh) {
      s.scene.remove(s.cloudMesh);
      s.cloudMesh.geometry?.dispose();
      s.cloudMesh.material?.dispose();
      s.cloudMesh = null;
    }
    if (s.halo) {
      s.scene.remove(s.halo);
      s.halo.material?.map?.dispose();
      s.halo.material?.dispose();
      s.halo = null;
    }

    if (body.type === 'star' || kind === 'white_dwarf' || kind === 'neutron_star') {
      // Stars are emissive — use a basic material so the lit side isn't dark
      s.scene.remove(s.sphere);
      s.material.dispose();
      const starMat = new THREE.MeshBasicMaterial({
        map: textureHandle.current,
      });
      s.sphere.material = starMat;
      s.material = starMat;
      s.scene.add(s.sphere);

      // Halo glow billboard
      const haloCanvas = document.createElement('canvas');
      haloCanvas.width = 256; haloCanvas.height = 256;
      const hctx = haloCanvas.getContext('2d');
      const grd = hctx.createRadialGradient(128, 128, 50, 128, 128, 128);
      const T = body.temperature || 5500;
      let cr = 255, cg = 200, cb = 130;
      if (T < 4000)      { cr = 255; cg = 130; cb =  70; }
      else if (T > 8000) { cr = 200; cg = 220; cb = 255; }
      grd.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.55)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      hctx.fillStyle = grd;
      hctx.fillRect(0, 0, 256, 256);
      const haloTex = new THREE.CanvasTexture(haloCanvas);
      haloTex.colorSpace = THREE.SRGBColorSpace;
      const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(2.6, 2.6, 1);
      s.scene.add(halo);
      s.halo = halo;
    } else if (body.type === 'black_hole') {
      // Replace material with pure black
      s.scene.remove(s.sphere);
      s.material.dispose();
      const bhMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      s.sphere.material = bhMat;
      s.material = bhMat;
      s.scene.add(s.sphere);

      // Photon-ring + accretion disk (procedural canvas texture)
      const diskCanvas = document.createElement('canvas');
      diskCanvas.width = 1024; diskCanvas.height = 256;
      const dctx = diskCanvas.getContext('2d');
      const grd = dctx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grd.addColorStop(0.4, 'rgba(255, 200, 120, 0.95)');
      grd.addColorStop(0.5, 'rgba(255, 240, 220, 1.0)');
      grd.addColorStop(0.6, 'rgba(255, 160,  80, 0.95)');
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dctx.fillStyle = grd;
      dctx.fillRect(0, 0, 1024, 256);
      // Streak / Doppler hint
      for (let i = 0; i < 4000; i++) {
        const x = Math.random() * 1024;
        const y = 64 + Math.random() * 128;
        const a = 0.05 + Math.random() * 0.18;
        dctx.fillStyle = `rgba(255, ${180 + Math.random() * 60 | 0}, ${120 + Math.random() * 80 | 0}, ${a})`;
        dctx.fillRect(x, y, 2, 1);
      }
      const diskTex = new THREE.CanvasTexture(diskCanvas);
      diskTex.colorSpace = THREE.SRGBColorSpace;
      const diskGeom = new THREE.RingGeometry(1.25, 2.4, 128, 1);
      // Rotate ring's UVs so the gradient maps nicely
      const pos = diskGeom.attributes.position;
      const uv  = diskGeom.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const r = Math.hypot(x, y);
        const t = (r - 1.25) / (2.4 - 1.25);
        const a = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2);
        uv.setXY(i, a, t);
      }
      const diskMat = new THREE.MeshBasicMaterial({
        map: diskTex,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const disk = new THREE.Mesh(diskGeom, diskMat);
      disk.rotation.x = Math.PI / 2 - 0.3;
      s.scene.add(disk);
      s.diskMesh = disk;
    } else {
      // Planet / generic — use phong with a subtle specular when there's water
      s.scene.remove(s.sphere);
      s.material.dispose();
      const water = Math.max(0, Math.min(1, body.waterCoverage ?? (body.hasWater ? 0.5 : 0.05)));
      const planetMat = new THREE.MeshPhongMaterial({
        map: textureHandle.current,
        shininess: water > 0.2 ? 22 : 4,
        specular: new THREE.Color(water > 0.2 ? 0x4477aa : 0x222233),
      });
      s.sphere.material = planetMat;
      s.material = planetMat;
      s.scene.add(s.sphere);

      // Atmosphere shell for planets with significant atmosphere
      const atmP = body.atmospherePressure ?? 0;
      if (atmP > 0.05 && body.type === 'planet') {
        const atmGeom = new THREE.SphereGeometry(1.025, 64, 48);
        const atmColor = new THREE.Color(body.atmosphereColor || '#88aaff');
        const atmMat = new THREE.MeshBasicMaterial({
          color: atmColor,
          transparent: true,
          opacity: Math.min(0.28, 0.08 + atmP * 0.08),
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const atm = new THREE.Mesh(atmGeom, atmMat);
        s.scene.add(atm);
        s.cloudMesh = atm;
      }
    }
  }, [body, kind, textureHandle]);

  // Ensure repaints push to the GPU
  useEffect(() => {
    if (stateRef.current?.material) {
      stateRef.current.material.map = textureHandle.current;
      stateRef.current.material.needsUpdate = true;
    }
  });

  // Hide the offscreen 2D canvas — it is only used as a texture source
  void texCanvas;

  return <div ref={containerRef} className="body-surface-globe" />;
}

// ── Main overlay ───────────────────────────────────────────────────────────

/**
 * Body-mode surface map: 3D spherical view of any selected body
 * (planet/star/black hole). For planets it preserves the original biosphere
 * picking (click for dominant species) and atmosphere readout.
 */
export default function BodySurfaceView({ engine, bodyId, onClose }) {
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState(null);
  const [portraitUrl, setPortraitUrl] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!bodyId || !engine) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, [bodyId, engine]);

  // Reset detail when target changes
  useEffect(() => {
    setPick(null);
    setPortraitUrl('');
  }, [bodyId]);

  const body = engine?.getBody?.(bodyId);
  const kind = useMemo(() => classifyBody(body), [body]);

  const onSpherePick = useCallback(({ u, v }) => {
    if (!body) return;
    if (body.type === 'planet' && body.biosphereGrid) {
      const { i, latIdx, lonIdx } = uvToCell(u, v, body.biosphereGrid.lat, body.biosphereGrid.lon);
      const cell = body.biosphereGrid.cells[i];
      const species = (body.evolutionTree || []).find((s) => s.id === cell?.dominantSpeciesId) || null;
      setPick({
        latIdx, lonIdx, cell, species,
        habitat: cell?.habitat,
        civInf: cell?.civilizationInfluence01,
      });
      if (species) {
        try { setPortraitUrl(composeCreatureDataUrl(species, body)); }
        catch { setPortraitUrl(''); }
      } else {
        setPortraitUrl('');
      }
    } else {
      // For non-planets, surface a coordinate readout instead of picking
      setPick({
        latIdx: Math.round((v - 0.5) * 180),
        lonIdx: Math.round((u - 0.5) * 360),
        cell: null,
        species: null,
        habitat: null,
        civInf: 0,
      });
      setPortraitUrl('');
    }
  }, [body]);

  if (!bodyId || !engine || !body) return null;

  // Atmosphere chip (planet only)
  const comp = body.atmosphereComposition || {};
  const topGas = Object.entries(comp).sort((a, b) => b[1] - a[1])[0];
  const gasLine = topGas ? `${topGas[0]} ${(topGas[1] * 100).toFixed(1)}%` : '—';

  const isPlanet = body.type === 'planet';
  const isStar = body.type === 'star';
  const isBH = body.type === 'black_hole';

  // Header chips depend on body kind
  const chips = [];
  if (isPlanet) {
    if (body.biomeArchetype) chips.push(`Biome: ${body.biomeArchetype}`);
    chips.push(`Water: ${((body.waterCoverage ?? 0) * 100).toFixed(0)}%`);
    chips.push(`Surface: ${body.surfaceType || 'rocky'}`);
    if (body.lifeStage && body.lifeStage !== 'none') chips.push(`Life: ${body.lifeStage}`);
  } else if (isStar) {
    if (body.spectralClass) chips.push(`Class: ${body.spectralClass}`);
    chips.push(`T: ${Math.round(body.temperature || 0).toLocaleString()} K`);
    if (body.phase) chips.push(`Phase: ${String(body.phase).replace(/_/g, ' ')}`);
    chips.push(`L: ${(body.luminosity ?? 0).toFixed(2)} L☉`);
  } else if (isBH) {
    chips.push(`Mass: ${(body.mass ?? 0).toFixed(2)} M☉`);
    if (body.schwarzschildRadius != null) {
      chips.push(`Rs: ${(body.schwarzschildRadius * 1.496e8).toExponential(1)} km`);
    }
    if (body.spin != null) chips.push(`Spin a*: ${body.spin.toFixed(2)}`);
  }

  return (
    <div className="body-surface-overlay">
      <div className="body-surface-card">
        <div className="body-surface-header">
          <h3 className="body-surface-title">
            {body.name}
            <span className="body-surface-kind"> · {bodyDisplayKind(body)}</span>
          </h3>
          <div className="body-surface-toolbar">
            <button
              type="button"
              className={`body-surface-mini ${autoRotate ? 'on' : ''}`}
              onClick={() => setAutoRotate((v) => !v)}
              title="Toggle auto-rotate"
            >
              {autoRotate ? '⟳' : '∥'}
            </button>
            {onClose && (
              <button
                type="button"
                className="body-surface-close"
                onClick={onClose}
                aria-label="Close surface view"
              >×</button>
            )}
          </div>
        </div>

        {isPlanet && (
          <div className="body-surface-atmo">
            <div>
              <span className="body-surface-label">Atmosphere</span>
              <strong>{(body.atmospherePressure ?? 0).toFixed(2)} atm</strong>
              <span className="body-surface-muted"> · {gasLine}</span>
            </div>
            <div
              className="body-surface-atmo-swatch"
              style={{ background: body.atmosphereColor || '#88aaff' }}
              title="Atmosphere tint"
            />
          </div>
        )}

        {chips.length > 0 && (
          <div className="body-surface-meta">
            {chips.map((c) => (
              <span key={c} className="body-surface-chip">{c}</span>
            ))}
          </div>
        )}

        {/* 3D globe — replaces the old 2D canvas */}
        <BodyGlobe
          key={body.id}
          body={body}
          kind={kind}
          autoRotate={autoRotate}
          onPick={onSpherePick}
          repaintTick={tick}
        />

        <p className="body-surface-hint">
          {isPlanet
            ? 'Drag to rotate, scroll to zoom. Click a region for the dominant species; gold tint is civilization influence.'
            : isStar
              ? 'Drag to rotate, scroll to zoom. Texture shows granulation and starspots derived from temperature.'
              : isBH
                ? 'Drag to rotate, scroll to zoom. The bright ring shows the accretion disk and photon ring.'
                : 'Drag to rotate, scroll to zoom.'}
        </p>

        {pick && (
          <div className="body-surface-detail">
            <div>
              <span className="body-surface-label">Cell</span> ({pick.latIdx}, {pick.lonIdx})
              {pick.habitat && (
                <>
                  {' '}· <span className="body-surface-label">Habitat</span> {pick.habitat}
                </>
              )}
              {(pick.civInf ?? 0) > 0.05 && (
                <>
                  {' '}· <span className="body-surface-label">Civ influence</span>{' '}
                  {((pick.civInf ?? 0) * 100).toFixed(0)}%
                </>
              )}
            </div>
            {pick.species ? (
              <div className="body-surface-species">
                {portraitUrl && (
                  <img className="body-surface-portrait" src={portraitUrl} alt="" width={160} height={200} />
                )}
                <div>
                  <strong style={{ color: speciesColor(pick.species.id) }}>{pick.species.name}</strong>
                  <div className="body-surface-muted">{pick.species.stage}</div>
                  <p className="body-surface-desc">{pick.species.description}</p>
                  {pick.species.traits && (
                    <ul className="body-surface-traits">
                      {Object.entries(pick.species.traits).map(([k, v]) => (
                        <li key={k}><span className="body-surface-label">{k}</span>: {String(v)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : isPlanet ? (
              <p className="body-surface-muted">No dominant species in this cell (ocean / barren).</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

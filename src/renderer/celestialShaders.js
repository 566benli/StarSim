/**
 * Celestial body shader library.
 *
 * Exports rich GLSL shader source used by the SceneManager to render stars and
 * planets with painterly, photorealistic surfaces and to drive smooth visual
 * transitions through stellar evolution phases.
 *
 * The art style targets:
 *   • Multi-tone color zones (rust + slate + frost) — see rocky-planet refs.
 *   • Cluster-of-boulder relief via cellular + ridged noise.
 *   • Soft directional lighting with limb darkening, rim Fresnel, and a hint of
 *     scattered ambient sky.
 *   • Star surfaces with convection granulation, magnetic spots, flares, plus
 *     phase-dependent appearance that can blend smoothly during transitions.
 */

// ── Shared GLSL utilities ───────────────────────────────────────────────────

/**
 * Simplex 3D noise + helpers.  Inlined verbatim into shaders that need it.
 * Standard Ashima implementation; safe to use with Three.js shader compilation.
 */
export const NOISE_GLSL = /* glsl */`
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x  = x_ * ns.x + ns.yyyy;
    vec4 y  = y_ * ns.x + ns.yyyy;
    vec4 h  = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // 5-octave fractional Brownian motion built from snoise.  Roughly normalized
  // to [-1, 1].  Cheap enough to call multiple times per fragment.
  float fbm(vec3 p){
    float a = 0.55;
    float f = 1.0;
    float s = 0.0;
    float n = 0.0;
    for(int i = 0; i < 5; i++){
      s += a * snoise(p * f);
      n += a;
      a *= 0.5;
      f *= 2.07;
    }
    return s / n;
  }

  // Ridged multifractal — produces sharp peaks/valleys ideal for mountain
  // ridges, planetary cracks, and gas-giant filaments.
  float ridge(vec3 p){
    return 1.0 - abs(fbm(p));
  }

  // Cheap 3D voronoi (F1) used for boulder/rock-cluster patterns.  Returns
  // squared distance to the nearest cell point in [0, ~1.2].  Lower values
  // sit at boulder centres; higher values fall in dust between rocks.
  float vnoise(vec3 p){
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    float d = 1.5;
    for(int z = -1; z <= 1; z++){
      for(int y = -1; y <= 1; y++){
        for(int x = -1; x <= 1; x++){
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 o = fract(sin(vec3(
            dot(ip + g, vec3(127.1, 311.7,  74.7)),
            dot(ip + g, vec3(269.5, 183.3, 246.1)),
            dot(ip + g, vec3(113.5, 271.9, 124.6))
          )) * 43758.5453);
          vec3 r = g + o - fp;
          d = min(d, dot(r, r));
        }
      }
    }
    return clamp(d, 0.0, 1.5);
  }

  // Domain warp: distort coordinates by low-frequency noise before sampling
  // higher-frequency detail.  Produces the organic, swirly continent-edge look
  // visible in the rocky-planet reference art.
  vec3 warp(vec3 p, float amp, float freq){
    return p + amp * vec3(
      snoise(p * freq + vec3(0.0, 1.7, 4.3)),
      snoise(p * freq + vec3(7.1, 2.3, 0.9)),
      snoise(p * freq + vec3(3.4, 5.2, 8.6))
    );
  }
`;

/**
 * Branchless palette helpers used by both planets and stars.
 */
export const PALETTE_GLSL = /* glsl */`
  // Smoothstep-driven 3-stop ramp (low → mid → high).
  vec3 ramp3(vec3 cLow, vec3 cMid, vec3 cHigh, float t){
    vec3 a = mix(cLow, cMid, smoothstep(0.0, 0.5, t));
    vec3 b = mix(a,    cHigh, smoothstep(0.5, 1.0, t));
    return b;
  }

  // Convert a hue (0..1) to an RGB triple.  Used for biosphere overlays.
  vec3 hue2rgb(float h){
    float hh = fract(h) * 6.0;
    vec3 c;
    c.r = abs(hh - 3.0) - 1.0;
    c.g = 2.0 - abs(hh - 2.0);
    c.b = 2.0 - abs(hh - 4.0);
    return clamp(c, 0.0, 1.0);
  }
`;

// ── Planet shader ───────────────────────────────────────────────────────────

/**
 * Vertex shader: applies a small fbm-based displacement to the unit sphere so
 * silhouettes pick up subtle surface detail (rocky/desert/ice).  Gas/lava
 * worlds use zero displacement to keep their atmospheres smooth.
 */
export const PLANET_VERTEX_GLSL = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  uniform float planetType;
  uniform float seed;
  uniform float displaceAmount;

  ${NOISE_GLSL}

  void main(){
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    vec3 displaced = position;
    // Apply displacement only on solid-surface worlds (rocky/earth/lava/ice
    // moons / asteroids).  Gas / hot-jupiter remain perfect spheres.
    if(displaceAmount > 0.001){
      vec3 warped = warp(position * 1.7 + seed, 0.32, 1.4);
      float n = fbm(warped * 2.4) * 0.55
              + (1.0 - vnoise(warped * 5.0)) * 0.30
              + ridge(warped * 3.2) * 0.20;
      displaced = position + normal * n * displaceAmount;
    }

    vPosition = displaced;
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/**
 * Fragment shader: dispatches per-type painting routines.
 *
 * planetType integer mapping (must match SceneManager._planetTypeIndex):
 *   0 = rocky_small / asteroid / dwarf_planet / rogue_planet
 *   1 = earth_like / super_earth / ocean_world
 *   2 = gas_giant
 *   3 = ice_giant
 *   4 = lava_world
 *   5 = hot_jupiter
 *   6 = desert_world
 *   7 = comet
 *   8 = ice / icy_world (Pluto-like)
 */
export const PLANET_FRAGMENT_GLSL = /* glsl */`
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  uniform float time;
  uniform vec3  baseColor;
  uniform vec3  secondColor;
  uniform vec3  accentColor;
  uniform float planetType;
  uniform float seed;
  uniform vec3  lightDir;
  uniform float waterCoverage;
  uniform float iceCoverage;
  uniform float roughness;       // 0..1 dust-vs-rocks balance
  uniform float weathering;      // 0..1 amount of frost / lichen overlay
  uniform sampler2D biosphereMap;
  uniform float biosphereOpacity;
  uniform float oceanGlow;       // 0..1 add specular highlight on oceans

  ${NOISE_GLSL}
  ${PALETTE_GLSL}

  // Wrap-around lambert: gives a softer terminator that picks up cool sky
  // ambient on the night side, mimicking the painterly references.
  float wrapLambert(vec3 n, vec3 l, float wrap){
    float d = dot(n, l);
    return clamp((d + wrap) / (1.0 + wrap), 0.0, 1.0);
  }

  // ── Per-type painting routines ─────────────────────────────────────────────

  // Layered "boulder field" rocky surface — matches reference rocky-planet art
  // by stacking warped cellular noise (boulder bodies) on top of broad slate
  // continents and rust dust between them.  Adds a frost/lichen weathering
  // pass tinted toward accentColor when weathering > 0.
  vec3 paintRocky(vec3 P, vec3 wn){
    vec3 W   = warp(P * 1.4, 0.45, 0.9);
    float continent = fbm(W * 1.8) * 0.5 + 0.5;          // broad slate vs. rust
    float boulders  = 1.0 - sqrt(vnoise(W * 5.0));        // boulder bodies
    boulders = smoothstep(0.20, 0.85, boulders);
    float dust      = fbm(P * 11.0 + 4.7) * 0.5 + 0.5;
    float crater    = smoothstep(0.55, 0.75, ridge(P * 6.5)) * 0.45;
    float fines     = fbm(P * 28.0 - 1.3) * 0.5 + 0.5;

    // Rust + slate + dark crevice colors
    vec3 rust  = baseColor * 1.05;
    vec3 slate = mix(secondColor, baseColor * 0.55, 0.30);
    vec3 crevice = baseColor * 0.18;

    vec3 col = mix(rust * (0.65 + dust * 0.45),
                   slate * (0.85 + fines * 0.25),
                   smoothstep(0.35, 0.65, continent));

    // Boulder relief: brighter highlight on rock crowns, darker base shadow.
    float crown   = pow(boulders, 2.0);
    float shadow  = pow(1.0 - boulders, 1.6) * (1.0 - dust * 0.4);
    col = mix(col, slate * 1.25, crown * 0.55);
    col = mix(col, crevice, shadow * 0.55);

    // Crater shadows — sharper darkening rims drawn from ridged noise
    col = mix(col, crevice, crater * 0.55);

    // Weathering: white frost / pale lichen sitting on rock crowns and along
    // cool latitudes (roughly mid-y on the unit sphere).
    if(weathering > 0.001){
      float lat = abs(vPosition.y);
      float frostMask = smoothstep(0.10, 0.75, lat) * crown;
      frostMask = max(frostMask, smoothstep(0.55, 0.95, fbm(P * 3.0)) * crown * 0.7);
      vec3 frostCol = mix(vec3(0.92, 0.94, 0.97), accentColor, 0.35);
      col = mix(col, frostCol, frostMask * weathering);
    }

    // Subtle blue-grey shadow tint in deepest crevices (matches references)
    col *= mix(vec3(0.78, 0.84, 0.92), vec3(1.0), 0.55 + boulders * 0.45);

    return col;
  }

  // Earth-like world with ocean depth grading, latitudinal biomes, polar caps,
  // wandering cloud bands and ocean specular response.
  vec3 paintEarth(vec3 P, vec3 wn, vec3 viewDir){
    vec3 W = warp(P * 1.3, 0.40, 0.85);
    float continent = fbm(W * 2.1);
    float detail    = snoise(P * 8.0) * 0.10;
    float landBias  = mix(0.42, -0.45, waterCoverage);
    float landMask  = smoothstep(landBias - 0.10, landBias + 0.10, continent + detail);

    float shelf     = smoothstep(landBias - 0.30, landBias - 0.05, continent + detail);
    vec3 deepOcean  = vec3(0.02, 0.07, 0.34);
    vec3 midOcean   = vec3(0.05, 0.18, 0.52);
    vec3 shoal      = vec3(0.18, 0.45, 0.72);
    vec3 ocean      = ramp3(deepOcean, midOcean, shoal, shelf);

    float lat   = abs(vPosition.y);
    float arid  = smoothstep(0.10, 0.55, lat) * (1.0 - smoothstep(0.65, 0.95, lat));
    float forestMask  = smoothstep(0.45, 0.10, lat) * smoothstep(0.0, 0.30, landMask);
    float savannaMask = smoothstep(0.55, 0.30, lat) * (1.0 - forestMask);
    float tundraMask  = smoothstep(0.55, 0.78, lat);

    vec3 forestCol  = mix(vec3(0.10, 0.36, 0.10), vec3(0.22, 0.50, 0.18), snoise(P * 8.0) * 0.5 + 0.5);
    vec3 savannaCol = mix(vec3(0.45, 0.42, 0.18), vec3(0.62, 0.54, 0.25), snoise(P * 6.0) * 0.5 + 0.5);
    vec3 desertCol  = mix(vec3(0.78, 0.62, 0.32), vec3(0.66, 0.48, 0.22), arid);
    vec3 tundraCol  = vec3(0.55, 0.55, 0.50);

    vec3 land = forestCol;
    land = mix(land, savannaCol, savannaMask * 0.7);
    land = mix(land, desertCol,  smoothstep(0.30, 0.62, continent + detail) * 0.55);
    land = mix(land, tundraCol,  tundraMask * 0.55);

    // Mountain ridges (ridged noise carved into land)
    float mountains = ridge(W * 4.0);
    mountains = smoothstep(0.55, 0.85, mountains) * smoothstep(0.05, 0.40, landMask);
    land = mix(land, vec3(0.62, 0.50, 0.42), mountains * 0.55);

    vec3 col = mix(ocean, land, landMask);

    // Ice caps (and equatorial snow on mountain peaks)
    float ice = smoothstep(0.62, 0.86, lat);
    ice = max(ice, mountains * smoothstep(0.20, 0.45, lat) * 0.55);
    ice = mix(ice, max(ice, smoothstep(0.50, 0.95, lat)), iceCoverage);
    col = mix(col, vec3(0.94, 0.97, 1.00), ice);

    // Two-layer cloud field, very gently animated over time
    float cloud1 = smoothstep(0.18, 0.55, snoise(P * 4.5 + time * 0.012));
    float cloud2 = smoothstep(0.22, 0.60, snoise(P * 6.5 - time * 0.008));
    float clouds = max(cloud1, cloud2 * 0.65) * (1.0 - ice * 0.7);
    col = mix(col, vec3(1.00, 0.99, 0.97), clouds * 0.42);

    // Ocean specular — bright sun glint
    if(oceanGlow > 0.001){
      float spec = pow(max(dot(reflect(-lightDir, wn), viewDir), 0.0), 60.0);
      col += vec3(0.45, 0.55, 0.75) * spec * (1.0 - landMask) * (1.0 - clouds) * oceanGlow * 0.55;
    }

    return col;
  }

  // Gas giant: latitudinal banding warped by stream turbulence.  Includes a
  // single oval storm (Great-Red-Spot stand-in) at a deterministic location.
  vec3 paintGas(vec3 P){
    float lat = vPosition.y;
    vec3 W   = warp(P * 1.2 + vec3(0.0, time * 0.03, 0.0), 0.35, 0.7);
    float band = sin(lat * 14.0 + W.x * 4.5 + W.z * 2.0) * 0.5 + 0.5;
    float turb = snoise(P * 5.0 + vec3(0.0, time * 0.02, 0.0)) * 0.18;
    float curl = fbm(P * 3.0 + time * 0.018) * 0.25;

    vec3 light = baseColor * 1.10;
    vec3 dark  = mix(secondColor, baseColor * 0.6, 0.4);
    vec3 col = mix(dark, light, clamp(band + turb + curl, 0.0, 1.0));

    // Storm vortex
    vec2 stormUv = vec2(vPosition.x, vPosition.y * 1.5);
    float stormD = length(stormUv - vec2(0.42, 0.20));
    float storm  = smoothstep(0.30, 0.10, stormD);
    float spin   = sin(atan(stormUv.y - 0.20, stormUv.x - 0.42) * 6.0
                       + storm * 12.0
                       - time * 0.6);
    vec3 stormCol = mix(accentColor * 0.85, accentColor * 1.25, spin * 0.5 + 0.5);
    col = mix(col, stormCol, storm * 0.65);

    // Fine ribbons
    col += snoise(P * 14.0 + time * 0.04) * 0.05;
    return col;
  }

  // Ice giant: smoother bands with cool blues and a wisp layer.
  vec3 paintIceGiant(vec3 P){
    float lat = vPosition.y;
    float warpN = snoise(P * 2.0 + time * 0.005) * 0.30;
    float band  = sin(lat * 7.5 + warpN * 3.0) * 0.5 + 0.5;
    float wisps = fbm(P * 6.0 + time * 0.008) * 0.30;
    vec3 col = mix(baseColor, secondColor, band * 0.45 + 0.30);
    col += accentColor * wisps * 0.18;
    // Equatorial cloud streak
    float streak = smoothstep(0.15, 0.05, abs(lat));
    col = mix(col, secondColor * 1.25, streak * 0.25);
    return col;
  }

  // Lava world: cracked basalt crust shot through with glowing magma fissures.
  vec3 paintLava(vec3 P){
    float crust    = fbm(P * 2.5);
    float cracks   = ridge(P * 4.0);
    float deep     = ridge(P * 10.0);
    float plates   = smoothstep(0.40, 0.95, crust + cracks * 0.4);
    float flow     = smoothstep(0.55, 0.85, cracks);
    float ember    = pow(1.0 - abs(snoise(P * 14.0 + time * 0.05)), 6.0) * 0.6;
    float pulse    = 0.5 + 0.5 * sin(time * 0.4 + crust * 8.0);

    vec3 basalt    = vec3(0.06, 0.04, 0.04);
    vec3 cooled    = vec3(0.18, 0.10, 0.08);
    vec3 magma     = mix(vec3(1.30, 0.45, 0.05), vec3(1.55, 0.85, 0.20), pulse);
    vec3 col = mix(basalt, cooled, plates);
    col = mix(col, magma, flow * 0.85);
    col += magma * ember * 0.55;
    col += magma * smoothstep(0.78, 1.0, deep) * 0.30;
    return col;
  }

  // Hot Jupiter: incandescent banded gas giant, tidally locked day side glow.
  vec3 paintHotJupiter(vec3 P){
    float lat = vPosition.y;
    float warpN = snoise(P * 3.0 + time * 0.04) * 1.1;
    float band  = sin(lat * 11.0 + warpN) * 0.5 + 0.5;
    vec3 cool  = vec3(0.55, 0.10, 0.04);
    vec3 mid   = vec3(0.92, 0.42, 0.10);
    vec3 hot   = vec3(1.10, 0.78, 0.25);
    vec3 col = ramp3(cool, mid, hot, band);
    float turb = snoise(P * 9.0 + time * 0.06) * 0.15;
    col += turb;
    return col;
  }

  // Desert world: dune sea + rocky outcrops + thin cirrus dust streaks.
  vec3 paintDesert(vec3 P, vec3 wn, vec3 viewDir){
    vec3 W = warp(P * 1.6, 0.35, 1.1);
    float dunes  = fbm(W * 3.5);
    float ripple = sin(dunes * 18.0 + snoise(P * 12.0) * 4.0) * 0.5 + 0.5;
    float rocks  = 1.0 - sqrt(vnoise(W * 6.0));
    rocks = smoothstep(0.15, 0.85, rocks);

    vec3 sand = mix(baseColor * 1.05, baseColor * 0.7, ripple * 0.5);
    vec3 rock = mix(secondColor, baseColor * 0.45, 0.3);
    vec3 col = mix(sand, rock, smoothstep(0.55, 0.85, rocks));

    // Polar frost
    float lat = abs(vPosition.y);
    float frost = smoothstep(0.78, 0.95, lat);
    col = mix(col, vec3(0.95, 0.92, 0.85), frost * 0.7);

    // Dust haze sweep
    float dust = smoothstep(0.30, 0.70, snoise(P * 4.0 + time * 0.04));
    col += accentColor * dust * 0.06;
    return col;
  }

  // Icy / dwarf-planet (Pluto-like): nitrogen plains, crater-pocked terrain
  vec3 paintIcy(vec3 P){
    vec3 W = warp(P * 1.8, 0.30, 1.0);
    float plains = fbm(W * 2.5) * 0.5 + 0.5;
    float craters = smoothstep(0.55, 0.78, ridge(P * 5.5)) * 0.5;
    float fines  = fbm(P * 14.0) * 0.5 + 0.5;
    vec3 ice = mix(baseColor * 1.15, vec3(0.95, 0.97, 1.0), 0.55);
    vec3 dust = mix(secondColor, baseColor * 0.7, 0.4);
    vec3 col = mix(dust, ice, smoothstep(0.40, 0.70, plains));
    col -= vec3(craters * 0.30);
    col *= 0.85 + fines * 0.25;
    return max(col, vec3(0.04));
  }

  void main(){
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 wn      = normalize(vWorldNormal);
    vec3 P       = vPosition + seed;
    vec3 color;

    if(planetType < 0.5){
      color = paintRocky(P, wn);
    } else if(planetType < 1.5){
      color = paintEarth(P, wn, viewDir);
    } else if(planetType < 2.5){
      color = paintGas(P);
    } else if(planetType < 3.5){
      color = paintIceGiant(P);
    } else if(planetType < 4.5){
      color = paintLava(P);
    } else if(planetType < 5.5){
      color = paintHotJupiter(P);
    } else if(planetType < 6.5){
      color = paintDesert(P, wn, viewDir);
    } else {
      color = paintIcy(P);
    }

    // ── Biosphere overlay (rocky/earth/desert/icy worlds) ──────────────────
    bool overlayEligible = (planetType < 1.5) || (planetType > 5.5);
    if(overlayEligible && biosphereOpacity > 0.01){
      vec4 bio = texture2D(biosphereMap, vUv);
      if(bio.a > 0.04){
        vec3 species = hue2rgb(bio.r) * 0.78;
        color = mix(color, species, bio.g * bio.a * biosphereOpacity * 0.50);
        if(bio.b > 0.05){
          vec3 civGold = vec3(1.00, 0.80, 0.22);
          color = mix(color, civGold, bio.b * biosphereOpacity * 0.40);
        }
      }
    }

    // ── Lighting ───────────────────────────────────────────────────────────
    float diffuse = wrapLambert(wn, lightDir, 0.18);
    // Cool ambient sky tint on the night side keeps shadows from going pure black
    vec3 ambient = mix(vec3(0.06, 0.08, 0.12), vec3(0.16, 0.18, 0.22), 0.5);
    color = color * (diffuse * 0.85 + 0.15) + ambient * (1.0 - diffuse) * 0.35;

    // Limb darkening (camera-space normal)
    float NdotV = max(dot(vNormal, normalize(-vPosition)), 0.0);
    float limbDark = pow(NdotV, 0.55);
    color *= 0.45 + 0.55 * limbDark;

    // Warm rim Fresnel — picks up the same warm side light as the references
    float fresnel = pow(1.0 - NdotV, 3.5);
    color += accentColor * fresnel * 0.25;

    // Lava self-emissive boost (independent of light direction)
    if(planetType > 3.5 && planetType < 4.5){
      float cracks = ridge(P * 4.0);
      float emissive = pow(smoothstep(0.55, 0.85, cracks), 1.4);
      color += vec3(0.95, 0.40, 0.10) * emissive * (1.0 - limbDark * 0.4);
    }
    // Hot Jupiter dayside glow
    if(planetType > 4.5 && planetType < 5.5){
      color += vec3(0.50, 0.18, 0.05) * (1.0 - limbDark) * 0.30;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ── Star shader ─────────────────────────────────────────────────────────────

/**
 * Vertex shader: small pulsation displacement, mild surface waves; supergiants
 * get larger irregular displacement to read as boiling mass.
 */
export const STAR_VERTEX_GLSL = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  uniform float time;
  uniform float turbulence;
  uniform float phaseValue;       // smoothly interpolated phase identifier
  uniform float phaseBlend;       // 0..1 transition progress

  ${NOISE_GLSL}

  void main(){
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    // Bigger, slower waves for supergiant; tight high-freq for white dwarf
    float lowFreq  = mix(3.0, 1.5, smoothstep(2.5, 3.5, phaseValue));
    float amp      = 0.025 + turbulence * 0.05;
    float n = fbm(position * lowFreq + time * 0.30);
    vec3 displaced = position + normal * n * amp;

    vPosition = displaced;
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

/**
 * Fragment shader: phase-aware surface painting.
 *
 * phaseValue mapping (continuous, allows smooth blending):
 *   0 = main_sequence
 *   1 = subgiant
 *   2 = red_giant
 *   3 = red_supergiant
 *   4 = white_dwarf
 *   5 = neutron_star
 *
 * phaseBlend ∈ [0, 1] controls a temporary cross-fade overlay used immediately
 * after a phase transition to soften the visual shift.
 */
export const STAR_FRAGMENT_GLSL = /* glsl */`
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  uniform float time;
  uniform vec3  starColor;
  uniform vec3  starColorHot;
  uniform float temperature;
  uniform float luminosity;
  uniform float turbulence;
  uniform float flareActivity;
  uniform float phaseValue;
  uniform float phaseBlend;

  ${NOISE_GLSL}
  ${PALETTE_GLSL}

  // Main-sequence-style granulation: bright convection cells separated by dark
  // intergranular lanes.  Larger phaseValue (giant/supergiant) shifts toward
  // bigger, slower cells.
  float granulation(vec3 P, float scale){
    float n1 = fbm(P * scale + time * 0.30) * 0.5 + 0.5;
    float n2 = fbm(P * scale * 2.2 + time * 0.50) * 0.5 + 0.5;
    float g  = pow(n1 * 0.55 + n2 * 0.45, 1.4);
    // Sharpen lanes
    return clamp(g * 1.15 - 0.05, 0.0, 1.0);
  }

  // Magnetic spots: darker patches modulated by slow large-scale noise.
  float spots(vec3 P){
    float s = snoise(P * 1.7 + time * 0.05);
    return smoothstep(0.55, 0.80, s) * 0.30;
  }

  // Solar flare bursts on hotter stars
  float flares(vec3 P){
    if(flareActivity < 0.001) return 0.0;
    float fNoise = snoise(P * 1.4 + time * 1.7);
    return smoothstep(0.72, 1.0, fNoise) * flareActivity;
  }

  // Pulsar beam stripe — a rotating bright band visible across the sphere.
  // Used only when phaseValue is near 5 (neutron star).
  float pulsarBeam(vec3 dir){
    float ang = atan(dir.x, dir.z) + time * 12.0;
    float beam = pow(max(cos(ang), 0.0), 80.0);
    float pulse = step(0.5, fract(time * 4.0 + dir.y * 0.5));
    return beam * pulse;
  }

  void main(){
    vec3 viewDir = normalize(-vPosition);
    float NdotV  = max(dot(vNormal, viewDir), 0.0);
    vec3 P = vPosition * (1.0 + smoothstep(2.5, 3.5, phaseValue) * 0.15);

    // Pick a granulation cell scale that morphs between phases (smaller cells
    // for hot stars, very large irregular cells for supergiants).
    float cellScale = mix(7.0, 3.5, smoothstep(0.0, 3.0, phaseValue));
    cellScale = mix(cellScale, 18.0, smoothstep(3.5, 4.5, phaseValue));   // WD: tight
    cellScale = mix(cellScale, 36.0, smoothstep(4.5, 5.5, phaseValue));   // NS: tighter

    float gran = granulation(P, cellScale);
    float spt  = spots(P) * (1.0 - smoothstep(3.0, 4.5, phaseValue));     // fade for WD/NS
    float flr  = flares(P)
                 * mix(1.0, 0.0, smoothstep(3.5, 4.5, phaseValue));        // none on WD/NS

    // Base surface color = blend between hot (cell crowns) and cool (lanes)
    vec3 col = mix(starColor * 0.78, starColorHot, gran * 0.55);
    col *= (1.0 - spt);

    // ── Phase-specific surface tweaks ─────────────────────────────────────
    // Red giant / supergiant: deepen toward red, add convection plumes
    float giantness = smoothstep(1.5, 3.5, phaseValue);
    if(giantness > 0.0){
      float plume = fbm(P * 1.8 + time * 0.10) * 0.5 + 0.5;
      vec3 deepRed = vec3(0.95, 0.32, 0.10);
      col = mix(col, mix(col, deepRed, plume * 0.55), giantness);
      // Massive convection cells near limb
      float cellHi = pow(gran, 0.6);
      col = mix(col, col * (0.65 + cellHi * 0.55), giantness * 0.40);
    }

    // White dwarf: very smooth bright core, faint surface variation
    float wdness = smoothstep(3.5, 4.5, phaseValue);
    if(wdness > 0.0){
      vec3 wdCool  = vec3(0.78, 0.86, 1.00);
      vec3 wdHot   = vec3(0.95, 0.97, 1.00);
      vec3 wdSurface = mix(wdCool, wdHot, gran * 0.4);
      col = mix(col, wdSurface, wdness);
    }

    // Neutron star: tight bright sphere + rotating pulsar beam
    float nsness = smoothstep(4.5, 5.5, phaseValue);
    if(nsness > 0.0){
      vec3 nsCore = mix(vec3(0.85, 0.90, 1.00), vec3(1.0), gran * 0.7);
      col = mix(col, nsCore, nsness);
      float beam = pulsarBeam(normalize(P));
      col += vec3(0.85, 0.90, 1.00) * beam * nsness;
    }

    // Flares (lit stars only)
    col += starColorHot * flr * 1.6;

    // Limb darkening
    float limbDark = pow(NdotV, mix(0.45, 0.30, giantness));
    col *= 0.55 + 0.45 * limbDark;

    // Fresnel corona tint pickup
    float fresnel = pow(1.0 - NdotV, 3.0);
    col += starColorHot * fresnel * (0.45 + giantness * 0.35);

    // Brightness modulator
    float brightness = 0.85 + 0.15 * clamp(log(luminosity + 1.0), 0.0, 6.0);
    brightness = mix(brightness, 1.20, wdness);     // WD: a little hotter
    brightness = mix(brightness, 1.40, nsness);     // NS: bright point
    col *= brightness;

    // Phase-blend overlay: brief warm flash during a transition.  Fades out
    // automatically as the SceneManager animates phaseBlend → 0.
    if(phaseBlend > 0.001){
      float ring = pow(1.0 - NdotV, 1.5);
      col += vec3(1.0, 0.82, 0.45) * ring * phaseBlend * 0.55;
      col *= 1.0 + phaseBlend * 0.20;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Atmosphere shader (used by SceneManager for the rim glow) ──────────────

export const ATMOSPHERE_VERTEX_GLSL = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main(){
    vNormal  = normalize(normalMatrix * normal);
    vViewPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * vec4(vViewPos, 1.0);
  }
`;

export const ATMOSPHERE_FRAGMENT_GLSL = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform vec3  atmoColor;
  uniform vec3  atmoSkyColor;
  uniform float opacity;
  uniform float power;          // controls falloff sharpness
  void main(){
    vec3 viewDir = normalize(-vViewPos);
    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
    float glow = pow(rim, power);
    vec3 col = mix(atmoSkyColor, atmoColor, glow);
    gl_FragColor = vec4(col, glow * opacity);
  }
`;

// ── Phase-value lookup ──────────────────────────────────────────────────────

/**
 * Continuous phase-value used by the star shader.  Lets the shader smoothly
 * interpolate appearance during transitions when the SceneManager animates
 * the value from one integer to the next.
 */
export const PHASE_VALUES = Object.freeze({
  protostar:        -0.5,
  main_sequence:     0.0,
  subgiant:          1.0,
  red_giant:         2.0,
  asymptotic_giant:  2.5,
  red_supergiant:    3.0,
  planetary_nebula:  3.5,
  white_dwarf:       4.0,
  neutron_star:      5.0,
});

/**
 * Maps a planet preset id to the integer enum used by the planet shader.
 * Centralized so SceneManager and (potentially) other renderers stay in sync.
 */
export function planetTypeIndex(subtype) {
  switch (subtype) {
    case 'rocky_small':
    case 'asteroid':
    case 'rogue_planet':
      return 0;
    case 'earth_like':
    case 'super_earth':
    case 'ocean_world':
      return 1;
    case 'gas_giant':
      return 2;
    case 'ice_giant':
      return 3;
    case 'lava_world':
      return 4;
    case 'hot_jupiter':
      return 5;
    case 'desert_world':
      return 6;
    case 'comet':
    case 'dwarf_planet':
      return 7;
    default:
      return 0;
  }
}

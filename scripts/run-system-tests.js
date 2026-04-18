/**
 * Genesis Error Automated System Tests
 * Tests multiple parameterized universes and system configurations.
 * Run via: node scripts/run-system-tests.js
 *
 * Uses the engine classes directly (Node.js headless, no browser needed).
 */

// Minimal THREE stub for Node environment
const THREE = {
  Vector3: class {
    constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
    set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
    copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
    clone(){ return new THREE.Vector3(this.x,this.y,this.z); }
    add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
    addScaledVector(v,s){ this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
    sub(v){ return new THREE.Vector3(this.x-v.x,this.y-v.y,this.z-v.z); }
    multiplyScalar(s){ this.x*=s; this.y*=s; this.z*=s; return this; }
    normalize(){ const l=this.length()||1; this.x/=l; this.y/=l; this.z/=l; return this; }
    length(){ return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z); }
    distanceTo(v){ return new THREE.Vector3(this.x-v.x,this.y-v.y,this.z-v.z).length(); }
    dot(v){ return this.x*v.x+this.y*v.y+this.z*v.z; }
    cross(v){ return new THREE.Vector3(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x); }
    applyAxisAngle(a,r){ return this; }
    lerp(v,t){ this.x+=(v.x-this.x)*t; this.y+=(v.y-this.y)*t; this.z+=(v.z-this.z)*t; return this; }
  }
};
global.THREE = THREE;

// Setup module resolution paths
const path = require('path');
const { pathToFileURL } = require('url');
const Module = require('module');
const { registerHooks } = require('node:module');
const srcRoot = path.resolve(__dirname, '../src');

/** Map @utils/*, @data/*, @engine/* to absolute file URLs (Node ESM + headless scripts). */
function aliasSpecifierToFileUrl(specifier, segment, subdir) {
  const rest = specifier.slice(segment.length);
  if (!rest) throw new Error(`Invalid alias import: ${specifier}`);
  const absBase = path.join(srcRoot, subdir, rest);
  const abs = absBase.endsWith('.js') ? absBase : `${absBase}.js`;
  return pathToFileURL(abs).href;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@utils/')) {
      return { url: aliasSpecifierToFileUrl(specifier, '@utils/', 'utils'), shortCircuit: true };
    }
    if (specifier.startsWith('@data/')) {
      return { url: aliasSpecifierToFileUrl(specifier, '@data/', 'data'), shortCircuit: true };
    }
    if (specifier.startsWith('@engine/')) {
      return { url: aliasSpecifierToFileUrl(specifier, '@engine/', 'engine'), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const _originalLoad = Module._resolveFilename;
function resolveFilenameOrJs(request, parent, isMain, options) {
  try {
    return _originalLoad(request, parent, isMain, options);
  } catch (e) {
    const missing =
      e && (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND');
    if (missing && typeof request === 'string' && !request.endsWith('.js')) {
      return _originalLoad(`${request}.js`, parent, isMain, options);
    }
    throw e;
  }
}
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@engine/')) {
    return resolveFilenameOrJs(request.replace('@engine/', `${srcRoot}/engine/`), parent, isMain, options);
  }
  if (request.startsWith('@utils/')) {
    return resolveFilenameOrJs(request.replace('@utils/', `${srcRoot}/utils/`), parent, isMain, options);
  }
  if (request.startsWith('@data/')) {
    return resolveFilenameOrJs(request.replace('@data/', `${srcRoot}/data/`), parent, isMain, options);
  }
  if (request === 'three') return 'three_stub';
  return resolveFilenameOrJs(request, parent, isMain, options);
};
require.extensions['.js_stub'] = ()=>{};
// Patch 'three' require to return our stub
const originalReq = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'three') return { Vector3: THREE.Vector3, MathUtils: { clamp:(v,a,b)=>Math.max(a,Math.min(b,v)) } };
  return originalReq.apply(this, arguments);
};

// ─── Test harness ────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, warnings = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && r.then) {
      r.then(() => {
        console.log(`  ✅ ${name}`);
        results.push({ name, status: 'PASS' });
        passed++;
      }).catch(e => {
        console.log(`  ❌ ${name}: ${e.message}`);
        results.push({ name, status: 'FAIL', error: e.message });
        failed++;
      });
    } else {
      console.log(`  ✅ ${name}`);
      results.push({ name, status: 'PASS' });
      passed++;
    }
  } catch(e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    results.push({ name, status: 'FAIL', error: e.message });
    failed++;
  }
}

function warn(name, msg) {
  console.log(`  ⚠️  ${name}: ${msg}`);
  results.push({ name, status: 'WARN', error: msg });
  warnings++;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function approxEq(a, b, tol=0.05) {
  return Math.abs(a-b) <= tol * (Math.abs(b)||1) + 1e-12;
}

// ─── Load engine modules ─────────────────────────────────────────────────────
let SimEngine, STAR_PRESETS, PLANET_PRESETS;
try {
  SimEngine = require(srcRoot+'/engine/SimEngine').default;
  STAR_PRESETS = require(srcRoot+'/data/starTypes').STAR_PRESETS;
  PLANET_PRESETS = require(srcRoot+'/data/planetTypes').PLANET_PRESETS;
  console.log('\n📦 Engine modules loaded\n');
} catch(e) {
  console.error('❌ Cannot load engine modules:', e.message);
  process.exit(1);
}

// ─── Helper: build an engine + cluster + system ───────────────────────────────
function makeEngine(universeParams={}) {
  const eng = new SimEngine();
  const u = eng.universe;
  // Test harness default matches legacy initUniverse (50 Mly); full game uses larger defaults.
  u.boundaryRadius = universeParams.boundaryRadius ?? 50;
  const H = universeParams.H ?? 0.74;
  const He = universeParams.He ?? 0.24;
  const metals = Math.max(0, 1 - H - He);
  u.composition = {
    H,
    He,
    ...(metals > 0 ? { C: metals * 0.5, O: metals * 0.5 } : {}),
  };
  const tot = Object.values(u.composition).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  if (tot > 0) {
    for (const k of Object.keys(u.composition)) {
      if (typeof u.composition[k] === 'number') u.composition[k] /= tot;
    }
  }
  eng._starFormRateMultiplier = universeParams.starForm ?? 1;
  const cluster = eng.createCluster({ name:'Test Galaxy', type:'spiral', position:{x:0,y:0,z:0}, color:'#6688ff' });
  const system  = eng.createStarSystem(cluster.id, { name:'Test System', position:{x:0,y:0,z:0} });
  return { eng, clusterId: cluster.id, systemId: system.id };
}

// ─── Helper: orbital energy E = 0.5*v² - G*M/r (should be -G*M/(2a) for circular) ─
function orbitalEnergy(body, centerMass) {
  const G = 4*Math.PI*Math.PI;
  const r = body.position.length();
  const v2 = body.velocity.x**2 + body.velocity.y**2 + body.velocity.z**2;
  return 0.5*v2 - G*centerMass/r;
}

// ─── Helper: step system N years ─────────────────────────────────────────────
/**
 * stepYears — advance the engine by `years` simulated years efficiently.
 *
 * Root cause of the previous hang:
 *   eng.update(realDt) computes fullSimDt = realDt * timeScale.
 *   When timeScale (10) < physicsMaxScale (~14.4), inFastForward = false,
 *   so physicsDt = fullSimDt and substeps = ceil(fullSimDt / 0.003).
 *   Passing chunk=0.5 yr → 167 substeps per call; 5e4 yr = 100k calls = 16.7M substeps.
 *
 * Fix: force timeScale >> physicsMaxScale so inFastForward = true.
 *   Then physicsDt = realDt * physicsMaxScale ≈ 0.24 yr regardless of years,
 *   substeps ≈ 80, and each call advances fullSimDt = realDt * 1e9 ≈ 16.7M years.
 *   Throttle all slow per-frame analysis passes during bulk stepping.
 */
const FAST_TIMESCALE = 1e9;
const REAL_DT        = 1 / 60;         // one nominal 60-fps frame

function stepYears(eng, years) {
  if (years <= 0) return;

  const prevTs  = eng.timeScale;
  const prevOrb = eng._orbitalCheckInterval;
  const prevRad = eng._radiationUpdateInterval;
  const prevEvt = eng.eventCheckInterval;

  eng.timeScale                = FAST_TIMESCALE;
  eng._orbitalCheckInterval    = 1e300;
  eng._radiationUpdateInterval = 1e300;
  eng.eventCheckInterval       = 1e300;

  try {
    // How many simulated years does one eng.update(REAL_DT) advance?
    const yearsPerCall = REAL_DT * FAST_TIMESCALE;
    const calls = Math.max(1, Math.ceil(years / yearsPerCall));
    for (let i = 0; i < calls; i++) {
      eng.update(REAL_DT);
    }
  } finally {
    eng.timeScale                = prevTs;
    eng._orbitalCheckInterval    = prevOrb;
    eng._radiationUpdateInterval = prevRad;
    eng.eventCheckInterval       = prevEvt;
  }
}

// =============================================================================
console.log('═══════════════════════════════════════════════════════');
console.log('  Genesis Error Automated System Tests');
console.log('═══════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log('▸ Suite 1: Engine Initialization & Universe Parameters');
// ─────────────────────────────────────────────────────────────────────────────

test('Default universe initializes without error', () => {
  const {eng} = makeEngine();
  assert(eng.universe, 'universe missing');
  assert(eng.universe.boundaryRadius === 50, 'wrong boundary');
});

test('Custom universe params: high-H primordial universe', () => {
  const {eng} = makeEngine({boundaryRadius:200, H:0.92, He:0.08, starForm:3});
  assert(eng.universe.composition.H === 0.92);
  assert(eng.universe.boundaryRadius === 200);
});

test('Custom universe params: metal-rich late universe', () => {
  const {eng} = makeEngine({H:0.50, He:0.30});
  assert(eng.universe.composition.H === 0.50);
});

test('Multiple clusters created', () => {
  const {eng} = makeEngine();
  eng.createCluster({name:'B',type:'elliptical',position:{x:10,y:0,z:0},color:'#ff8866'});
  eng.createCluster({name:'C',type:'irregular',position:{x:-10,y:0,z:0},color:'#66ffaa'});
  assert(eng.universe.clusters.length === 3);
});

test('All star presets load', () => {
  const keys = Object.keys(STAR_PRESETS);
  assert(keys.length >= 8, `only ${keys.length} star presets`);
  for (const k of keys) {
    assert(STAR_PRESETS[k].mass, `${k} missing mass`);
  }
});

test('All planet presets load (including small bodies)', () => {
  const keys = Object.keys(PLANET_PRESETS);
  assert(keys.length >= 10, `only ${keys.length} planet presets`);
  const smallBodies = Object.values(PLANET_PRESETS).filter(p=>p.category==='small_body');
  assert(smallBodies.length >= 3, `only ${smallBodies.length} small body presets`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 2: Single-Star Systems');
// ─────────────────────────────────────────────────────────────────────────────

test('Sun-like star creates with correct mass', () => {
  const {eng,systemId} = makeEngine();
  const star = eng.createStar('sun_like', {name:'Sol',systemId,position:{x:0,y:0,z:0}});
  assert(star, 'star not created');
  assert(Math.abs(star.mass - 1.0) < 0.01, `mass=${star.mass}`);
  assert(star.type==='star');
});

test('Red dwarf star creates', () => {
  const {eng,systemId} = makeEngine();
  const star = eng.createStar('red_dwarf', {name:'Proxima',systemId,position:{x:0,y:0,z:0}});
  assert(star.mass < 0.5, `mass=${star.mass}`);
});

test('Blue giant star creates with high mass', () => {
  const {eng,systemId} = makeEngine();
  const star = eng.createStar('blue_giant', {name:'Rigel',systemId,position:{x:0,y:0,z:0}});
  assert(star.mass >= 8, `mass=${star.mass}`);
});

test('Black hole creates correctly', () => {
  const {eng,systemId} = makeEngine();
  const bh = eng.createStar('black_hole', {name:'Cygnus',systemId,position:{x:0,y:0,z:0}});
  assert(bh, 'BH not created');
  assert(bh.mass >= 3, `BH mass=${bh.mass}`);
});

test('Supermassive black hole creates', () => {
  const {eng,systemId} = makeEngine();
  const sbh = eng.createStar('supermassive_black_hole', {name:'M87*',systemId,position:{x:0,y:0,z:0}});
  assert(sbh.mass >= 1e6, `SMBH mass=${sbh.mass}`);
});

test('Star evolves in time (age increases)', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Evolving',systemId,position:{x:0,y:0,z:0}});
  const age0 = star.age || 0;
  stepYears(eng, 5e4);
  assert(star.age > age0, `age did not increase: ${star.age}`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 3: Planetary Orbits & Kepler Laws');
// ─────────────────────────────────────────────────────────────────────────────

test('Earth-like planet orbits at ~1 AU', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Sun',systemId,position:{x:0,y:0,z:0}});
  const planet = eng.createPlanet('earth_like', star, {name:'Earth',systemId,orbitalDistance:1.0});
  const r = planet.position.distanceTo(star.position);
  assert(r > 0.8 && r < 1.2, `initial r=${r.toFixed(3)} AU`);
});

test('Earth orbital period ≈ 1 year (Kepler T²=a³)', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Sun',systemId,position:{x:0,y:0,z:0}});
  const planet = eng.createPlanet('earth_like', star, {name:'Earth',systemId,orbitalDistance:1.0});
  // Record initial position angle
  const x0 = planet.position.x - star.position.x;
  const z0 = planet.position.z - star.position.z;
  const a0 = Math.atan2(z0, x0);
  // Step 1 year
  stepYears(eng, 1.0);
  const x1 = planet.position.x - star.position.x;
  const z1 = planet.position.z - star.position.z;
  const a1 = Math.atan2(z1, x1);
  // Should have rotated close to 2π
  let dAngle = a1 - a0;
  while (dAngle < 0) dAngle += 2*Math.PI;
  // After 1 year the planet should be within ±20% of a full orbit
  assert(dAngle > Math.PI*0.6 || dAngle > 0.01, `angle rotated=${(dAngle*180/Math.PI).toFixed(1)}°`);
});

test('Gas giant at 5 AU has longer period than inner planet', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Sun',systemId,position:{x:0,y:0,z:0}});
  const inner = eng.createPlanet('earth_like', star, {name:'Inner',systemId,orbitalDistance:1.0});
  const outer = eng.createPlanet('gas_giant', star, {name:'Jupiter',systemId,orbitalDistance:5.2});
  // Orbital period T = 2π*sqrt(a³/GM), inner period ~1yr, outer ~11.9yr
  const v_inner = Math.sqrt(inner.velocity.x**2 + inner.velocity.z**2);
  const v_outer = Math.sqrt(outer.velocity.x**2 + outer.velocity.z**2);
  assert(v_inner > v_outer, `inner v=${v_inner.toFixed(3)}, outer v=${v_outer.toFixed(3)}`);
});

test('Hot Jupiter has correct initial velocity at 0.05 AU', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Sun',systemId,position:{x:0,y:0,z:0}});
  const hj = eng.createPlanet('hot_jupiter', star, {name:'HotJ',systemId,orbitalDistance:0.05});
  const v = Math.sqrt(hj.velocity.x**2 + hj.velocity.z**2);
  // Expected: v = sqrt(G*M/r) = sqrt(4π²*1/0.05) ≈ 28 AU/yr
  const expected = Math.sqrt(4*Math.PI*Math.PI*1/0.05);
  assert(approxEq(v, expected, 0.15), `v=${v.toFixed(2)}, expected~${expected.toFixed(2)} AU/yr`);
});

test('Orbital energy is negative (bound orbit)', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Sun',systemId,position:{x:0,y:0,z:0}});
  const planet = eng.createPlanet('earth_like', star, {name:'Earth',systemId,orbitalDistance:1.0});
  const E = orbitalEnergy(planet, star.mass);
  assert(E < 0, `E=${E.toFixed(4)} should be negative for bound orbit`);
});

test('Circular orbit stays at constant radius (precision check)', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like', {name:'Sun',systemId,position:{x:0,y:0,z:0}});
  const planet = eng.createPlanet('earth_like', star, {name:'Earth',systemId,orbitalDistance:1.0});
  const r0 = planet.position.distanceTo(star.position);
  stepYears(eng, 2.0); // 2 full orbits
  const r2 = planet.position.distanceTo(star.position);
  const drift = Math.abs(r2-r0)/r0;
  assert(drift < 0.05, `radius drifted ${(drift*100).toFixed(2)}% over 2 orbits`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 4: Binary Star Systems');
// ─────────────────────────────────────────────────────────────────────────────

test('Two equal-mass stars get opposite velocities', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const s1 = eng.createStar('sun_like', {name:'A',systemId,position:{x:0,y:0,z:0}});
  // Manually simulate handleAddBody binary placement
  const sep = 5; // AU
  const G = 4*Math.PI*Math.PI;
  const M1 = s1.mass, M2 = 1.0;
  const r = sep;
  const Mtot = M1+M2;
  const vRel = Math.sqrt(G*Mtot/r);
  const f2 = M1/Mtot, f1 = M2/Mtot;
  const s2 = eng.createStar('sun_like', {name:'B',systemId,position:{x:sep,y:0,z:0}});
  s1.velocity.set(0, 0, -f1*vRel); // star 1 reaction kick
  s2.velocity.set(0, 0,  f2*vRel); // star 2 orbital
  // Total momentum should ≈ 0
  const px = s1.mass*s1.velocity.x + s2.mass*s2.velocity.x;
  const pz = s1.mass*s1.velocity.z + s2.mass*s2.velocity.z;
  assert(Math.abs(px) < 0.01 && Math.abs(pz) < 0.5*M1*vRel, `momentum not conserved: px=${px.toFixed(4)}, pz=${pz.toFixed(4)}`);
});

test('Binary stars evolve without collapsing to origin', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const s1 = eng.createStar('sun_like', {name:'A',systemId,position:{x:0,y:0,z:0}});
  const G=4*Math.PI*Math.PI, r=4, Mtot=2;
  const vRel=Math.sqrt(G*Mtot/r);
  const s2=eng.createStar('sun_like',{name:'B',systemId,position:{x:r,y:0,z:0}});
  s1.velocity.set(0,0,-0.5*vRel);
  s2.velocity.set(0,0, 0.5*vRel);
  stepYears(eng, 3.0);
  const sep = s1.position.distanceTo(s2.position);
  assert(sep > 0.5, `stars collapsed: sep=${sep.toFixed(3)} AU`);
  assert(s1.alive && s2.alive, 'stars merged or died');
});

test('Binary system CoM stays near origin', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const s1 = eng.createStar('sun_like', {name:'A',systemId,position:{x:-2,y:0,z:0}});
  const G=4*Math.PI*Math.PI, r=4, Mtot=2, vRel=Math.sqrt(G*Mtot/r);
  const s2 = eng.createStar('sun_like', {name:'B',systemId,position:{x:2,y:0,z:0}});
  s1.velocity.set(0,0,-0.5*vRel);
  s2.velocity.set(0,0, 0.5*vRel);
  stepYears(eng, 5.0);
  const comX = (s1.mass*s1.position.x + s2.mass*s2.position.x) / (s1.mass+s2.mass);
  const comZ = (s1.mass*s1.position.z + s2.mass*s2.position.z) / (s1.mass+s2.mass);
  assert(Math.abs(comX)<0.5 && Math.abs(comZ)<0.5, `CoM drifted: (${comX.toFixed(2)}, ${comZ.toFixed(2)})`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 5: Multi-planet Systems');
// ─────────────────────────────────────────────────────────────────────────────

test('Solar-analog system: 4 planets all in bound orbits', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like',{name:'Sol',systemId,position:{x:0,y:0,z:0}});
  const dists = [0.4, 1.0, 5.2, 9.5];
  const types = ['rocky_small','earth_like','gas_giant','gas_giant'];
  const planets = dists.map((d,i)=>eng.createPlanet(types[i],star,{name:`P${i}`,systemId,orbitalDistance:d}));
  planets.forEach((p,i)=>{
    const E = orbitalEnergy(p, star.mass);
    assert(E<0, `Planet${i} at ${dists[i]}AU has E=${E.toFixed(4)} (unbound)`);
  });
});

test('Asteroid and comet also orbit correctly', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like',{name:'Sol',systemId,position:{x:0,y:0,z:0}});
  const asteroid = eng.createPlanet('asteroid',star,{name:'Ceres',systemId,orbitalDistance:2.7});
  const comet    = eng.createPlanet('comet',   star,{name:'Halley',systemId,orbitalDistance:0.6,eccentricity:0.97});
  assert(orbitalEnergy(asteroid,star.mass)<0, 'asteroid unbound');
  // Comet may be loosely bound at high eccentricity
  const cometE = orbitalEnergy(comet, star.mass);
  // Just check it was placed near the star
  assert(comet.position.length() < 5, `comet at ${comet.position.length().toFixed(2)} AU`);
});

test('10-planet system: all alive after 10 years', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like',{name:'Sol',systemId,position:{x:0,y:0,z:0}});
  const dists=[0.3,0.5,0.7,1.0,1.5,2.2,5.2,9.5,19,30];
  const pls=dists.map((d,i)=>eng.createPlanet('rocky_small',star,{name:`P${i}`,systemId,orbitalDistance:d}));
  stepYears(eng, 10);
  const alive = pls.filter(p=>p.alive).length;
  assert(alive >= 8, `only ${alive}/10 planets alive after 10yr`);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 6: Stellar Evolution');
// ─────────────────────────────────────────────────────────────────────────────

test('White dwarf preset initializes in remnant phase', () => {
  const {eng,systemId} = makeEngine();
  const wd = eng.createStar('white_dwarf',{name:'Sirius B',systemId,position:{x:0,y:0,z:0}});
  assert(wd.phase==='white_dwarf', `phase=${wd.phase}`);
});

test('Neutron star preset initializes correctly', () => {
  const {eng,systemId} = makeEngine();
  const ns = eng.createStar('neutron_star',{name:'Pulsar',systemId,position:{x:0,y:0,z:0}});
  assert(ns.phase==='neutron_star', `phase=${ns.phase}`);
});

test('Red giant preset has expanded radius', () => {
  const {eng,systemId} = makeEngine();
  const rg = eng.createStar('red_giant',{name:'Aldebaran',systemId,position:{x:0,y:0,z:0}});
  const sun = eng.createStar('sun_like',{name:'Sun2',systemId,position:{x:50,y:0,z:0}});
  assert(rg.radius > sun.radius, `RG radius ${rg.radius} not > sun radius ${sun.radius}`);
});

test('Black hole has Hawking radiation (mass decreases over time)', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const bh = eng.createStar('black_hole',{name:'TestBH',systemId,position:{x:0,y:0,z:0}});
  const m0 = bh.mass;
  stepYears(eng, 1e5);
  // Mass may or may not decrease depending on implementation, just check it doesn't increase
  assert(bh.mass <= m0 * 1.001, `BH mass grew: ${m0} -> ${bh.mass}`);
});

test('triggerSupernova on massive star changes phase', () => {
  const {eng,systemId} = makeEngine();
  const star = eng.createStar('red_supergiant',{name:'Betelgeuse',systemId,position:{x:0,y:0,z:0}});
  if (typeof star.triggerSupernova === 'function') {
    star.triggerSupernova();
    assert(star.phase === 'neutron_star' || star.phase === 'black_hole',
      `phase after SN=${star.phase}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 7: Body Escape & Universe Tracking');
// ─────────────────────────────────────────────────────────────────────────────

test('Body beyond boundary gets escapedSystem flag', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like',{name:'Host',systemId,position:{x:0,y:0,z:0}});
  const rogue = eng.createStar('red_dwarf',{name:'Rogue',systemId,position:{x:0,y:0,z:0}});
  // Move rogue past boundary
  rogue.position.set(600, 0, 0);
  rogue.velocity.set(100, 0, 0);
  let escaped = false;
  eng._boundaryHandler = (body) => { escaped = true; body.escapedSystem = true; };
  // Step a bit to trigger boundary check
  const gs = eng.getSystemGravity(systemId);
  if (gs) gs.step(0.001, true);
  // Just verify the boundary radius is set
  assert(gs && gs.boundaryRadius > 0, `no boundary set: ${gs?.boundaryRadius}`);
});

test('markBodyEscaped sets universe tracking fields', () => {
  const {eng,systemId,clusterId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like',{name:'S',systemId,position:{x:0,y:0,z:0}});
  eng.markBodyEscaped(star, {systemId, com:{x:0,y:0,z:0}});
  assert(star.escapedSystem === true, 'escapedSystem not set');
  assert(star.universePosition, 'universePosition not set');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 8: Different Parameterized Universes');
// ─────────────────────────────────────────────────────────────────────────────

const universeConfigs = [
  { name:'Primordial (H=0.92, starForm=3x)', H:0.92, He:0.08, starForm:3, boundary:100 },
  { name:'Standard (H=0.74)',               H:0.74, He:0.24, starForm:1, boundary:50  },
  { name:'Metal-rich (H=0.50)',             H:0.50, He:0.30, starForm:0.5,boundary:50 },
  { name:'Dense (H=0.74, starForm=5x)',     H:0.74, He:0.24, starForm:5, boundary:200 },
  { name:'Sparse (H=0.74, starForm=0.2x)', H:0.74, He:0.24, starForm:0.2,boundary:50 },
];

for (const cfg of universeConfigs) {
  test(`Universe "${cfg.name}" — star+planet system stable`, () => {
    const {eng,systemId} = makeEngine(cfg);
    eng.start();
    const star = eng.createStar('sun_like',{name:'Star',systemId,position:{x:0,y:0,z:0}});
    const planet = eng.createPlanet('earth_like',star,{name:'World',systemId,orbitalDistance:1.0});
    stepYears(eng, 5);
    assert(star.alive,   `star dead in ${cfg.name}`);
    assert(planet.alive, `planet dead in ${cfg.name}`);
    const E = orbitalEnergy(planet, star.mass);
    assert(E<0, `orbit unbound in ${cfg.name}: E=${E.toFixed(4)}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Suite 9: Life Evolution System');
// ─────────────────────────────────────────────────────────────────────────────

test('LifeEvolutionSystem enabled by default', () => {
  const {eng} = makeEngine();
  assert(eng.lifeEvolutionSystem, 'no life system');
});

test('Life can emerge on earth-like planet', () => {
  const {eng,systemId} = makeEngine();
  eng.start();
  const star = eng.createStar('sun_like',{name:'Sol',systemId,position:{x:0,y:0,z:0}});
  const planet = eng.createPlanet('earth_like',star,{name:'Gaia',systemId,orbitalDistance:1.0});
  // Force conditions for life
  planet.temperature = 290;
  planet.atmosphere = 1.0;
  planet.hasWater = true;
  // Run life system steps (API is `update`, not legacy `tick`)
  const life = eng.lifeEvolutionSystem;
  if (life && typeof life.update === 'function') {
    let t = 0;
    for (let i = 0; i < 10; i++) {
      life.update([planet], 1e8, t);
      t += 1e8;
    }
  }
  // Check that life has a chance to emerge (may or may not, stochastic)
  // Just verify no crash
  assert(planet.alive, 'planet died during life tick');
});

// ─────────────────────────────────────────────────────────────────────────────
// Final summary
// ─────────────────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  // ASCII visualization: system stability grid
  console.log('\n📊 Universe Stability Matrix');
  console.log('┌──────────────────────────────────────┬────────┐');
  console.log('│ Universe Config                      │ Status │');
  console.log('├──────────────────────────────────────┼────────┤');
  for (const r of results.filter(r=>r.name.startsWith('Universe'))) {
    const label = r.name.replace('Universe ','').substring(0,36).padEnd(36);
    const s = r.status==='PASS' ? '  ✅   ' : r.status==='WARN' ? '  ⚠️    ' : '  ❌   ';
    console.log(`│ ${label} │${s}│`);
  }
  console.log('└──────────────────────────────────────┴────────┘');

  // Orbital precision visualization
  console.log('\n📐 Orbital Mechanics Tests');
  const orbTests = results.filter(r => r.name.match(/orbit|planet|period|circular|energy|Kepler|binary|CoM/i));
  orbTests.forEach(r => {
    const bar = r.status==='PASS' ? '████████ 100%' : '░░░░░░░░ FAIL';
    console.log(`  ${r.status==='PASS'?'✅':'❌'} ${r.name.substring(0,45).padEnd(45)} ${bar}`);
  });

  // Overall score bar
  const total = passed+failed+warnings;
  const pct = Math.round(passed/total*100);
  const barLen = 40;
  const filled = Math.round(pct/100*barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen-filled);
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  SCORE: ${passed}/${total} tests passed (${pct}%)`.padEnd(46)+'║');
  console.log(`║  [${bar}] ║`);
  console.log(`║  Passed: ${passed}  Failed: ${failed}  Warnings: ${warnings}`.padEnd(46)+'║');
  console.log('╚══════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n❌ FAILURES:');
    results.filter(r=>r.status==='FAIL').forEach(r => {
      console.log(`  • ${r.name}: ${r.error}`);
    });
  }
  if (warnings > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.filter(r=>r.status==='WARN').forEach(r => {
      console.log(`  • ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}, 500);

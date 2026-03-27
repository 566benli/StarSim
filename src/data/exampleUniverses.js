/**
 * Example universes for new players after the welcome tour.
 * Each `seed` mutates a fresh engine (caller should engine.reset() first if needed).
 */
import * as THREE from 'three';

const G_SIM = 4 * Math.PI * Math.PI;

/**
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedSolFamily(engine) {
  const cluster = engine.createCluster({
    name: 'Orion Spur',
    type: 'spiral',
    position: { x: 0, y: 0, z: 0 },
  });
  const system = engine.createStarSystem(cluster.id, {
    name: 'Sol Family',
    position: { x: 0, y: 0, z: 0 },
  });
  const sun = engine.createStar('sun_like', {
    name: 'Sun',
    systemId: system.id,
    position: { x: 0, y: 0, z: 0 },
  });
  engine.createPlanet('earth_like', sun, {
    name: 'Earth',
    systemId: system.id,
    orbitalDistance: 1,
  });
  engine.createPlanet('gas_giant', sun, {
    name: 'Jupiter-analog',
    systemId: system.id,
    orbitalDistance: 5.2,
  });
  const gs = engine.getSystemGravity(system.id);
  if (gs) gs.computeAccelerations(gs.getAliveBodies());
  return { clusterId: cluster.id, systemId: system.id };
}

/**
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedBinaryDwarfs(engine) {
  const cluster = engine.createCluster({
    name: 'Binary Nursery',
    type: 'spiral',
    position: { x: 0, y: 0, z: 0 },
  });
  const system = engine.createStarSystem(cluster.id, {
    name: 'Aurora–Borealis',
    position: { x: 0, y: 0, z: 0 },
  });
  const m = 0.35;
  const a = 3.5;
  const s1 = engine.createStar('red_dwarf', {
    name: 'Aurora',
    systemId: system.id,
    mass: m,
    position: new THREE.Vector3(-a, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
  });
  const s2 = engine.createStar('red_dwarf', {
    name: 'Borealis',
    systemId: system.id,
    mass: m,
    position: new THREE.Vector3(a, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
  });
  const sep = 2 * a;
  const vRel = Math.sqrt(G_SIM * (2 * m) / sep);
  const vEach = 0.5 * vRel;
  s1.velocity.set(0, 0, -vEach);
  s2.velocity.set(0, 0, vEach);
  const gs = engine.getSystemGravity(system.id);
  if (gs) gs.computeAccelerations(gs.getAliveBodies());
  return { clusterId: cluster.id, systemId: system.id };
}

/**
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedHotJupiter(engine) {
  const cluster = engine.createCluster({
    name: 'Exo Lab',
    type: 'spiral',
    position: { x: 0, y: 0, z: 0 },
  });
  const system = engine.createStarSystem(cluster.id, {
    name: 'Hot Jupiter System',
    position: { x: 0, y: 0, z: 0 },
  });
  const sun = engine.createStar('sun_like', {
    name: 'Host Star',
    systemId: system.id,
    position: { x: 0, y: 0, z: 0 },
  });
  engine.createPlanet('hot_jupiter', sun, {
    name: 'Pegasi b',
    systemId: system.id,
    orbitalDistance: 0.08,
  });
  const gs = engine.getSystemGravity(system.id);
  if (gs) gs.computeAccelerations(gs.getAliveBodies());
  return { clusterId: cluster.id, systemId: system.id };
}

/**
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedLifeGarden(engine) {
  const cluster = engine.createCluster({
    name: 'Kepler Reach',
    type: 'spiral',
    position: { x: 0, y: 0, z: 0 },
  });
  const system = engine.createStarSystem(cluster.id, {
    name: 'Garden System',
    position: { x: 0, y: 0, z: 0 },
  });
  const star = engine.createStar('sun_like', {
    name: 'Lumina',
    systemId: system.id,
    position: { x: 0, y: 0, z: 0 },
  });
  engine.createPlanet('earth_like', star, {
    name: 'Verdance',
    systemId: system.id,
    orbitalDistance: 1.05,
    atmosphere: 1.2,
  });
  engine.createPlanet('super_earth', star, {
    name: 'Aurelia',
    systemId: system.id,
    orbitalDistance: 1.55,
    atmosphere: 16,
    hasWater: false,
  });
  engine.createPlanet('rocky_small', star, {
    name: 'Cinderis',
    systemId: system.id,
    orbitalDistance: 0.65,
    atmosphere: 3.5,
    hasWater: false,
  });
  engine.setLifePreset('gameplay');
  engine.setTimeScale(5e5);
  const gs = engine.getSystemGravity(system.id);
  if (gs) gs.computeAccelerations(gs.getAliveBodies());
  return { clusterId: cluster.id, systemId: system.id };
}

/**
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedCrowdedSystem(engine) {
  const cluster = engine.createCluster({
    name: 'Trappist Analog',
    type: 'spiral',
    position: { x: 0, y: 0, z: 0 },
  });
  const system = engine.createStarSystem(cluster.id, {
    name: 'Compact System',
    position: { x: 0, y: 0, z: 0 },
  });
  const star = engine.createStar('red_dwarf', {
    name: 'Emberglow',
    systemId: system.id,
    mass: 0.09,
    position: { x: 0, y: 0, z: 0 },
  });
  const names = ['Primus', 'Secundus', 'Tertius', 'Quartus', 'Quintus'];
  const distances = [0.015, 0.022, 0.031, 0.04, 0.052];
  for (let i = 0; i < 5; i++) {
    engine.createPlanet('rocky_small', star, {
      name: names[i],
      systemId: system.id,
      orbitalDistance: distances[i],
      atmosphere: 0.5 + Math.random() * 4,
    });
  }
  const gs = engine.getSystemGravity(system.id);
  if (gs) gs.computeAccelerations(gs.getAliveBodies());
  return { clusterId: cluster.id, systemId: system.id };
}

/**
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedGiantMoons(engine) {
  const cluster = engine.createCluster({
    name: 'Jovian Lab',
    type: 'spiral',
    position: { x: 0, y: 0, z: 0 },
  });
  const system = engine.createStarSystem(cluster.id, {
    name: 'Titan System',
    position: { x: 0, y: 0, z: 0 },
  });
  const star = engine.createStar('sun_like', {
    name: 'Helios',
    systemId: system.id,
    position: { x: 0, y: 0, z: 0 },
  });
  engine.createPlanet('gas_giant', star, {
    name: 'Kronos',
    systemId: system.id,
    orbitalDistance: 5.0,
  });
  engine.createPlanet('earth_like', star, {
    name: 'Gaia',
    systemId: system.id,
    orbitalDistance: 1.0,
  });
  engine.createPlanet('ice_giant', star, {
    name: 'Boreas',
    systemId: system.id,
    orbitalDistance: 12,
  });
  const gs = engine.getSystemGravity(system.id);
  if (gs) gs.computeAccelerations(gs.getAliveBodies());
  return { clusterId: cluster.id, systemId: system.id };
}

export const EXAMPLE_UNIVERSES = [
  {
    id: 'sol_family',
    title: 'Sol Family',
    blurb: 'Sun, Earth-like world, and a gas giant — good for learning orbits and the info panel.',
    icon: '\u2600\uFE0F',
    tag: 'classic',
    seed: seedSolFamily,
  },
  {
    id: 'binary_dwarfs',
    title: 'Binary Red Dwarfs',
    blurb: 'Two stars in orbit — watch mutual N-body motion in system view.',
    icon: '\u2728',
    tag: 'dynamics',
    seed: seedBinaryDwarfs,
  },
  {
    id: 'hot_jupiter',
    title: 'Hot Jupiter',
    blurb: 'A star with a close-in giant planet — try time controls and camera views.',
    icon: '\uD83C\uDF0B',
    tag: 'exoplanet',
    seed: seedHotJupiter,
  },
  {
    id: 'life_garden',
    title: 'Life Garden',
    blurb: 'Three diverse worlds in the habitable zone — watch life emerge and evolve over millions of years.',
    icon: '\uD83E\uDDEC',
    tag: 'life',
    seed: seedLifeGarden,
  },
  {
    id: 'crowded_system',
    title: 'Compact System',
    blurb: 'Five rocky worlds packed around a red dwarf — inspired by TRAPPIST-1.',
    icon: '\uD83D\uDD34',
    tag: 'exoplanet',
    seed: seedCrowdedSystem,
  },
  {
    id: 'giant_moons',
    title: 'Gas Giant & Worlds',
    blurb: 'A full system with an Earth analog, a gas giant, and an ice giant — varied orbits.',
    icon: '\uD83E\uDE90',
    tag: 'classic',
    seed: seedGiantMoons,
  },
];

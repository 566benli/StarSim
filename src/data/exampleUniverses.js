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

export const EXAMPLE_UNIVERSES = [
  {
    id: 'sol_family',
    title: 'Sol family',
    blurb: 'Sun, Earth-like world, and a gas giant — good for learning orbits and the info panel.',
    seed: seedSolFamily,
  },
  {
    id: 'binary_dwarfs',
    title: 'Binary red dwarfs',
    blurb: 'Two stars in orbit — watch mutual N-body motion in system view.',
    seed: seedBinaryDwarfs,
  },
  {
    id: 'hot_jupiter',
    title: 'Hot Jupiter',
    blurb: 'A star with a close-in giant planet — try time controls and camera views.',
    seed: seedHotJupiter,
  },
];

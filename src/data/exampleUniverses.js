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

/**
 * Art Showcase: every polished body and stellar phase laid out in one cluster.
 *
 * Layout (within the Polished Bodies Gallery cluster):
 *   • Star Phase Hall   — six single-star systems (red dwarf … red supergiant)
 *   • Planet Zoo        — one sun_like with all 11 planet subtypes orbiting it
 *   • Compact Remnants  — white dwarf, neutron star, black hole (own systems)
 *   • Small Bodies      — sun_like host with asteroid, comet, dwarf planet
 *   • VFX Lab           — a red supergiant + red giant pre-loaded near the end
 *                          of their phase so a single fast-forward triggers
 *                          the warm phase-blend flash and the supernova VFX.
 *
 * @param {import('../engine/SimEngine').default} engine
 */
export function seedArtShowcase(engine) {
  const cluster = engine.createCluster({
    name: 'Polished Bodies Gallery',
    type: 'irregular',
    position: { x: 0, y: 0, z: 0 },
    color: '#ffaa66',
    size: 60,
  });

  // ── Wing 1: Star Phase Hall ──────────────────────────────────────────────
  const phaseHall = [
    { presetId: 'red_dwarf',      name: 'Hall: Red Dwarf',      pos: { x: -3.0, y: 0, z: -2.0 } },
    { presetId: 'orange_dwarf',   name: 'Hall: Orange Dwarf',   pos: { x: -1.5, y: 0, z: -3.0 } },
    { presetId: 'sun_like',       name: 'Hall: Sun-like',       pos: { x:  1.5, y: 0, z: -3.0 } },
    { presetId: 'blue_giant',     name: 'Hall: Blue Giant',     pos: { x:  3.0, y: 0, z: -2.0 } },
    { presetId: 'red_giant',      name: 'Hall: Red Giant',      pos: { x:  3.0, y: 0, z:  2.0 } },
    { presetId: 'red_supergiant', name: 'Hall: Red Supergiant', pos: { x:  1.5, y: 0, z:  3.0 } },
  ];
  for (const cfg of phaseHall) {
    const sys = engine.createStarSystem(cluster.id, {
      name: cfg.name,
      position: cfg.pos,
    });
    engine.createStar(cfg.presetId, {
      name: cfg.name.replace('Hall: ', ''),
      systemId: sys.id,
      position: { x: 0, y: 0, z: 0 },
    });
  }

  // ── Wing 2: Planet Zoo (one sun, every planet subtype) ───────────────────
  const zooSys = engine.createStarSystem(cluster.id, {
    name: 'Planet Zoo',
    position: { x: 0, y: 0, z: 0 },
  });
  const zooStar = engine.createStar('sun_like', {
    name: 'Spotlight',
    systemId: zooSys.id,
    position: { x: 0, y: 0, z: 0 },
  });
  // Order chosen so increasing AU naturally separates bodies on the camera frame
  const zooEntries = [
    ['hot_jupiter',  { name: 'Pegasus',  orbitalDistance: 0.10 }],
    ['lava_world',   { name: 'Pyra',     orbitalDistance: 0.20 }],
    ['rocky_small',  { name: 'Boulder',  orbitalDistance: 0.45 }],
    ['desert_world', { name: 'Dune',     orbitalDistance: 0.70 }],
    ['earth_like',   { name: 'Verdant',  orbitalDistance: 1.00, hasWater: true, atmosphere: 1.0 }],
    ['super_earth',  { name: 'Atlas',    orbitalDistance: 1.55, hasWater: true, atmosphere: 3.0 }],
    ['ocean_world',  { name: 'Pelagia',  orbitalDistance: 2.20, hasWater: true, atmosphere: 1.5 }],
    ['gas_giant',    { name: 'Tempest',  orbitalDistance: 4.50 }],
    ['ice_giant',    { name: 'Glacius',  orbitalDistance: 8.00 }],
    ['dwarf_planet', { name: 'Pebble',   orbitalDistance: 13.0 }],
    // rogue_planet preset shares the type-0 paint routine but uses its own
    // dark blue-grey palette; placed on a wide orbit just for the gallery.
    ['rogue_planet', { name: 'Wanderer', orbitalDistance: 22.0 }],
  ];
  for (const [presetId, overrides] of zooEntries) {
    engine.createPlanet(presetId, zooStar, {
      systemId: zooSys.id,
      ...overrides,
    });
  }

  // ── Wing 3: Compact Remnants Wing ────────────────────────────────────────
  const remnants = [
    { presetId: 'white_dwarf',  name: 'Wing: White Dwarf',  pos: { x: -4.0, y: 0, z: 2.0 } },
    { presetId: 'neutron_star', name: 'Wing: Neutron Star', pos: { x: -4.0, y: 0, z: 4.0 } },
    { presetId: 'black_hole',   name: 'Wing: Black Hole',   pos: { x: -4.0, y: 0, z: 6.0 } },
  ];
  for (const cfg of remnants) {
    const sys = engine.createStarSystem(cluster.id, {
      name: cfg.name,
      position: cfg.pos,
    });
    engine.createStar(cfg.presetId, {
      name: cfg.name.replace('Wing: ', ''),
      systemId: sys.id,
      position: { x: 0, y: 0, z: 0 },
    });
  }

  // ── Wing 4: Small Bodies Wing ────────────────────────────────────────────
  const sbSys = engine.createStarSystem(cluster.id, {
    name: 'Small Bodies',
    position: { x: 4.0, y: 0, z: 5.0 },
  });
  const sbStar = engine.createStar('sun_like', {
    name: 'Sample Sun',
    systemId: sbSys.id,
    position: { x: 0, y: 0, z: 0 },
  });
  engine.createPlanet('asteroid',     sbStar, { systemId: sbSys.id, name: 'Asteroid',      orbitalDistance: 1.5 });
  engine.createPlanet('comet',        sbStar, { systemId: sbSys.id, name: 'Comet',         orbitalDistance: 2.5, eccentricity: 0.85 });
  engine.createPlanet('dwarf_planet', sbStar, { systemId: sbSys.id, name: 'Dwarf Planet',  orbitalDistance: 4.0 });

  // ── Wing 5: VFX Lab ──────────────────────────────────────────────────────
  // Both stars are pre-aged near the end of their current phase so a single
  // fast-forward press triggers the smooth warm-flash transition and (for
  // the supergiant) the full supernova VFX.
  const sgSys = engine.createStarSystem(cluster.id, {
    name: 'VFX: Supernova-Ready',
    position: { x: 0, y: 0, z: 6.0 },
  });
  engine.createStar('red_supergiant', {
    name: 'Imminent Supergiant',
    systemId: sgSys.id,
    position: { x: 0, y: 0, z: 0 },
    evolutionProgress: 0.92,
  });

  const rgSys = engine.createStarSystem(cluster.id, {
    name: 'VFX: White-Dwarf Collapse',
    position: { x: 0, y: 0, z: 8.0 },
  });
  engine.createStar('red_giant', {
    name: 'Imminent Red Giant',
    systemId: rgSys.id,
    position: { x: 0, y: 0, z: 0 },
    evolutionProgress: 0.95,
  });

  // Compute initial accelerations for every newly-created system so the
  // bodies have a stable kinematic state from frame 0.
  for (const sys of engine.universe.systems) {
    const gs = engine.getSystemGravity(sys.id);
    if (gs) gs.computeAccelerations(gs.getAliveBodies());
  }

  return { clusterId: cluster.id, systemId: zooSys.id };
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
  {
    id: 'art_showcase',
    title: 'Art Showcase',
    blurb: 'Every polished body and stellar phase in one place — the gallery for the new shader pass.',
    icon: '\uD83C\uDFA8',
    tag: 'art',
    seed: seedArtShowcase,
  },
];

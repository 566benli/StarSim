/**
 * SimEngine - The master simulation controller
 * Multi-scale architecture:
 *   Universe (Mly) → Clusters (kly) → Star Systems (AU)
 *
 * N-body gravity (AU): each StarSystem has a GravitySystem with full mutual Newtonian
 * forces between all bodies in that system (softened, Velocity Verlet).
 *
 * Between systems: bodies in different star systems do not feel each other in AU physics —
 * separations at galaxy scale would be negligible vs in-system dynamics. Cluster motion uses
 * Universe.updateClusterPhysics (Mly). UI may show cross-system distances as reference only.
 */
import GravitySystem from './GravitySystem';
import Universe from './Universe';
import Cluster from './Cluster';
import StarSystem from './StarSystem';
import Star from './Star';
import Planet from './Planet';
import BlackHole from './BlackHole';
import RadiationSystem from './RadiationSystem';
import CatastropheSystem from './CatastropheSystem';
import OrbitalAnalysisSystem from './OrbitalAnalysisSystem';
import LifeEvolutionSystem from './LifeEvolutionSystem';
import { getApplicableEvents } from '@data/events';
import { STAR_PRESETS } from '@data/starTypes';
import { PLANET_PRESETS } from '@data/planetTypes';
import { getDefaultComposition } from '@data/elements';
import { ARENA_RADIUS_AU, MLY_TO_AU, SIM_TIME_SCALE, UNIVERSE_RADIUS_MLY, VIEW_LEVEL } from '@utils/constants';

export const SIM_STATE = {
  SETUP: 'setup',
  RUNNING: 'running',
  PAUSED: 'paused',
  EXPLORER: 'explorer',
};

export default class SimEngine {
  constructor() {
    this.gravitySystems = new Map(); // systemId -> GravitySystem
    this.universe = new Universe();

    this.simulationTime = 0;
    this.timeScale = 10;
    this.paused = true;
    this.state = SIM_STATE.SETUP;

    this.pendingEvents = [];
    this.eventHistory = [];
    this.eventCheckInterval = 1.0;
    this.lastEventCheck = 0;

    this.onEvent      = null;
    this.onPhaseChange = null;
    this.onBodyDestroyed = null;
    this.onBodyCreated   = null;
    /** Called with VFX event payloads for Three.js animation hooks */
    this.onVfxEvent   = null;

    this.stepsPerFrame = 20;      // more sub-steps → tighter Verlet integration
    this.maxDtPerStep  = 0.003;  // max 1.1 day/step for precise inner-planet orbits
    this.maxStepsPerFrame = 80;
    this.typicalFrameTime = 1 / 60;
    this.lastFrameTime = 0;
    this.fps = 60;

    this.fastForward = false;

    // VFX event queue (consumed by SceneManager each frame)
    this.pendingVfxEvents = [];

    // ── New physics subsystems ─────────────────────────────────────────────
    this.radiationSystem    = new RadiationSystem();
    this.catastropheSystem  = new CatastropheSystem();
    this.orbitalAnalysis    = new OrbitalAnalysisSystem();
    this.lifeEvolutionSystem = new LifeEvolutionSystem();

    // How often (in sim years) to run orbital analysis (expensive for many bodies)
    this._orbitalCheckInterval   = 1.0;
    this._lastOrbitalCheck       = 0;
    this._radiationUpdateInterval = 0.1;
    this._lastRadiationUpdate    = 0;
    this._lifeUpdateInterval     = 10;
    this._lastLifeUpdate         = 0;
    this._escapeVisualScaleMly = 10;
    this._escapeVisualVelocityMly = 2.5;
  }

  /** Get or create a GravitySystem for a given system id */
  getOrCreateGS(systemId) {
    if (!systemId) return null;
    if (!this.gravitySystems.has(systemId)) {
      const gs = new GravitySystem();
      gs.onBoundaryExceeded = this._boundaryHandler || null;
      this.gravitySystems.set(systemId, gs);
    }
    return this.gravitySystems.get(systemId);
  }

  /** Enable/disable collision debug logging across all GravitySystems */
  setCollisionDebug(enabled) {
    for (const gs of this.gravitySystems.values()) {
      if (gs.collisionSystem) gs.collisionSystem.debugMode = enabled;
    }
  }

  /** Consume and return all pending VFX events (called by SceneManager each frame) */
  consumeVfxEvents() {
    const events = [...this.pendingVfxEvents];
    this.pendingVfxEvents = [];
    return events;
  }

  getMaxPhysicsTimeScale() {
    let maxN = 0;
    for (const gs of this.gravitySystems.values()) {
      maxN = Math.max(maxN, gs.getAliveBodies().length);
    }
    // Degrade more gently: keep at least 16 steps even with many bodies
    const stepsBudget = Math.max(16, this.maxStepsPerFrame - Math.max(0, maxN - 6) * 2);
    return (stepsBudget * this.maxDtPerStep) / this.typicalFrameTime;
  }

  getMaxTimeScale() {
    return 1e9;
  }

  getLifeTuning() {
    return this.lifeEvolutionSystem.getTuningState();
  }

  setLifePreset(preset) {
    this.lifeEvolutionSystem.setPreset(preset);
    return this.getLifeTuning();
  }

  updateLifeTuning(updates = {}) {
    this.lifeEvolutionSystem.updateTuning(updates);
    return this.getLifeTuning();
  }

  resetLifeTuning(preset) {
    this.lifeEvolutionSystem.resetToPreset(preset);
    return this.getLifeTuning();
  }

  // === Universe Management ===

  createCluster(config = {}) {
    const cluster = new Cluster({
      name: config.name || `Galaxy ${this.universe.clusters.length + 1}`,
      type: config.type || 'spiral',
      position: config.position,
      velocity: config.velocity,
      angularVelocity: config.angularVelocity || (0.0005 + Math.random() * 0.001),
      color: config.color || `hsl(${Math.random() * 360}, 60%, 60%)`,
      size: config.size || (30 + Math.random() * 50),
    });
    this.universe.addCluster(cluster);
    return cluster;
  }

  createStarSystem(clusterId, config = {}) {
    const system = new StarSystem({
      name: config.name || `System ${this.universe.systems.length + 1}`,
      clusterId,
      position: config.position,
      velocity: config.velocity,
    });
    this.universe.addSystem(system);

    const cluster = this.universe.getCluster(clusterId);
    if (cluster) cluster.addSystem(system);

    this.getOrCreateGS(system.id);
    return system;
  }

  getClusterWorldPosition(clusterId) {
    const cluster = clusterId ? this.universe.getCluster(clusterId) : null;
    return cluster?.position?.clone?.() || { x: 0, y: 0, z: 0 };
  }

  getSystemWorldPosition(systemId) {
    const system = systemId ? this.universe.getSystem(systemId) : null;
    if (!system) return { x: 0, y: 0, z: 0 };
    const clusterPos = this.getClusterWorldPosition(system.clusterId);
    return {
      x: clusterPos.x + system.position.x,
      y: clusterPos.y + system.position.y,
      z: clusterPos.z + system.position.z,
    };
  }

  getBodyUniversePosition(body) {
    if (!body) return { x: 0, y: 0, z: 0 };
    if (body.escapedSystem) {
      return {
        x: body.universePosition.x,
        y: body.universePosition.y,
        z: body.universePosition.z,
      };
    }

    const systemPos = this.getSystemWorldPosition(body.systemId);
    return {
      x: systemPos.x + (body.position.x / MLY_TO_AU),
      y: systemPos.y + (body.position.y / MLY_TO_AU),
      z: systemPos.z + (body.position.z / MLY_TO_AU),
    };
  }

  markBodyEscaped(body, { systemId, com } = {}) {
    if (!body?.alive || body.escapedSystem) return;

    const system = systemId ? this.universe.getSystem(systemId) : null;
    const clusterId = system?.clusterId || null;
    const systemPos = this.getSystemWorldPosition(systemId);

    const dx = body.position.x - (com?.x ?? 0);
    const dy = body.position.y - (com?.y ?? 0);
    const dz = body.position.z - (com?.z ?? 0);
    const dist = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const boundaryRatio = Math.max(1, dist / ARENA_RADIUS_AU);
    const markerOffset = Math.min(24, this._escapeVisualScaleMly * boundaryRatio);
    const speedRatio = Math.min(1.5, body.velocity.length() / 40);

    body.escapedSystem = true;
    body.escapeOriginSystemId = systemId || null;
    body.escapeOriginClusterId = clusterId;
    body.universePosition.set(
      systemPos.x + nx * markerOffset,
      systemPos.y + ny * markerOffset * 0.25,
      systemPos.z + nz * markerOffset,
    );
    body.universeVelocity.set(
      nx * this._escapeVisualVelocityMly * speedRatio,
      ny * this._escapeVisualVelocityMly * speedRatio * 0.2,
      nz * this._escapeVisualVelocityMly * speedRatio,
    );
    body.logEvent({
      type: 'escaped_system',
      message: `${body.name} escaped ${system?.name || 'its system'} and is now tracked in universe space.`,
    });
  }

  updateEscapedBodies(dtYears) {
    if (dtYears <= 0) return;
    const dtMly = dtYears / 1e6;
    const bodies = this.getBodies();
    for (const body of bodies) {
      if (!body.alive || !body.escapedSystem) continue;
      body.universePosition.addScaledVector(body.universeVelocity, dtMly);
    }
  }

  /**
   * Create a star from a preset with custom parameters.
   * Body is added to its system's independent GravitySystem.
   */
  createStar(presetId, overrides = {}) {
    const preset = STAR_PRESETS[presetId];
    if (!preset) throw new Error(`Unknown star preset: ${presetId}`);

    const config = {
      name: overrides.name || preset.name,
      subtype: presetId,
      mass: overrides.mass ?? preset.mass.default,
      radius: overrides.radius ?? preset.radius.default,
      temperature: overrides.temperature ?? preset.temperature.default,
      luminosity: overrides.luminosity ?? preset.luminosity.default,
      description: preset.description,
      funFact: preset.funFact,
      ...overrides,
    };

    let body;
    if (presetId === 'black_hole' || presetId === 'supermassive_black_hole') {
      body = new BlackHole(config);
    } else {
      body = new Star(config);
      if (preset.category === 'evolved') {
        if (presetId === 'red_giant') body.phase = 'red_giant';
        if (presetId === 'red_supergiant') body.phase = 'red_supergiant';
      } else if (preset.category === 'remnant') {
        if (presetId === 'white_dwarf') body.phase = 'white_dwarf';
        if (presetId === 'neutron_star') body.phase = 'neutron_star';
      }
    }

    body.composition = overrides.composition
      ? { ...overrides.composition }
      : getDefaultComposition(body.type, body.subtype, body.phase);

    if (overrides.systemId) {
      const system = this.universe.getSystem(overrides.systemId);
      if (system) system.addBody(body);
      const gs = this.getOrCreateGS(overrides.systemId);
      if (gs) gs.addBody(body);
    }

    if (this.onBodyCreated) this.onBodyCreated(body);
    return body;
  }

  /**
   * Create a planet from a preset with custom parameters.
   * Body is added to its parent star's system GravitySystem.
   */
  createPlanet(presetId, parentStar, overrides = {}) {
    const preset = PLANET_PRESETS[presetId];
    if (!preset) throw new Error(`Unknown planet preset: ${presetId}`);

    const massEarth = overrides.massEarth ?? overrides.mass ?? preset.mass.default;
    const radiusEarth = overrides.radiusEarth ?? overrides.radius ?? preset.radius.default;

    const { mass: _m, radius: _r, ...restOverrides } = overrides;
    const config = {
      name: overrides.name || preset.name,
      subtype: presetId,
      mass: massEarth * 3e-6,
      massEarth,
      radius: radiusEarth * 0.009,
      radiusEarth,
      temperature: overrides.temperature ?? preset.temperature.default,
      atmosphere: overrides.atmosphere ?? preset.atmosphere.default,
      orbitalDistance: overrides.orbitalDistance ?? preset.orbitalDistance.default,
      eccentricity: overrides.eccentricity ?? preset.eccentricity?.default ?? preset.eccentricity ?? 0,
      hasRings: overrides.hasRings ?? preset.hasRings,
      moons: overrides.moons ?? preset.moons,
      hasWater: overrides.hasWater ?? preset.hasWater,
      color: overrides.color ?? preset.color,
      bandColors: preset.bandColors,
      surfaceType: preset.category === 'giant' ? 'gaseous' : 'rocky',
      parentBody: parentStar,
      description: preset.description,
      funFact: preset.funFact,
      ...restOverrides,
    };

    const planet = new Planet(config);
    planet.composition = overrides.composition
      ? { ...overrides.composition }
      : getDefaultComposition('planet', presetId, null);

    const center = overrides.orbitalCenter || (parentStar ? parentStar.position : null);
    const centerMass = overrides.orbitalMass ?? (parentStar ? parentStar.mass : 0);
    const centerVel = parentStar ? parentStar.velocity : { x: 0, y: 0, z: 0 };

    if (center && centerMass > 0 && planet.orbitalDistance > 0) {
      const a = planet.orbitalDistance;
      const e = Math.max(0, Math.min(0.99, planet.eccentricity ?? 0));
      const incl = planet.inclination || 0;

      const systemId = parentStar?.systemId || overrides.systemId;
      const gs = systemId ? this.getOrCreateGS(systemId) : null;
      const sysAliveBodies = gs ? gs.getAliveBodies() : [];
      const siblings = sysAliveBodies.filter(
        (b) => b !== planet && b.parentBody === parentStar &&
          Math.abs((b.orbitalDistance || 0) - a) < 0.01 * a
      );
      const n = siblings.length;
      const angle = n === 0
        ? Math.random() * Math.PI * 2
        : (siblings[0].trueAnomaly ?? siblings[0].orbitalAngle ?? 0) + (2 * Math.PI * n) / (n + 1);

      const r = e < 1e-6
        ? a
        : (a * (1 - e * e)) / (1 + e * Math.cos(angle));
      const cx = center.x ?? center;
      const cy = center.y ?? 0;
      const cz = center.z ?? 0;
      planet.position.set(
        cx + r * Math.cos(angle),
        cy + r * Math.sin(angle) * Math.sin(incl),
        cz + r * Math.sin(angle) * Math.cos(incl)
      );

      const G_sim = 4 * Math.PI * Math.PI;
      const p = a * (1 - e * e);
      const f = p > 1e-12 ? Math.sqrt(G_sim * centerMass / p) : Math.sqrt(G_sim * centerMass / a);
      planet.velocity.set(
        (centerVel.x ?? 0) - f * Math.sin(angle),
        (centerVel.y ?? 0) + f * (e + Math.cos(angle)) * Math.sin(incl),
        (centerVel.z ?? 0) + f * (e + Math.cos(angle)) * Math.cos(incl)
      );

      planet.trueAnomaly = angle;
    }

    const targetSystemId = parentStar?.systemId || overrides.systemId;
    if (targetSystemId) {
      const system = this.universe.getSystem(targetSystemId);
      if (system) system.addBody(planet);
      const gs = this.getOrCreateGS(targetSystemId);
      if (gs) gs.addBody(planet);
    }

    if (parentStar) parentStar.children.push(planet);
    if (this.onBodyCreated) this.onBodyCreated(planet);
    return planet;
  }

  start() {
    this.state = SIM_STATE.RUNNING;
    this.paused = false;
    this.lastFrameTime = performance.now();
    for (const gs of this.gravitySystems.values()) {
      const bodies = gs.getAliveBodies();
      gs.computeAccelerations(bodies);
    }
  }

  pause() {
    this.paused = true;
    this.state = SIM_STATE.PAUSED;
  }

  resume() {
    this.paused = false;
    this.state = SIM_STATE.RUNNING;
    this.lastFrameTime = performance.now();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  enterExplorerMode(targetBody) {
    this.pause();
    this.state = SIM_STATE.EXPLORER;
    this.explorerTarget = targetBody;
    return targetBody;
  }

  exitExplorerMode() {
    this.state = SIM_STATE.PAUSED;
    this.explorerTarget = null;
  }

  setTimeScale(scale) {
    const max = this.getMaxTimeScale();
    this.timeScale = Math.max(0, Math.min(scale, max));
    this.fastForward = this.timeScale > this.getMaxPhysicsTimeScale();
  }

  /**
   * Main update loop.
   * Universe-level: cluster orbits at Mly scale.
   * System-level: independent N-body per system at AU scale.
   */
  update(realDeltaTime) {
    if (this.paused || this.state === SIM_STATE.SETUP) return;

    const fullSimDt = realDeltaTime * this.timeScale;
    const physicsMaxScale = this.getMaxPhysicsTimeScale();
    const inFastForward = this.timeScale > physicsMaxScale;
    this.fastForward = inFastForward;

    // Universe-level cluster physics (Mly scale, very slow)
    const clusterDt = fullSimDt / 1e6;
    this.universe.updateClusterPhysics(clusterDt);
    this.universe.age += fullSimDt;

    // System-level N-body physics (AU scale) — each system independently
    const physicsDt = inFastForward
      ? realDeltaTime * physicsMaxScale
      : fullSimDt;

    const nominalSubDt = physicsDt / this.stepsPerFrame;
    const cappedSubDt = Math.min(nominalSubDt, this.maxDtPerStep);
    const steps = Math.max(1, Math.ceil(physicsDt / cappedSubDt));
    const subDt = physicsDt / steps;

    for (const gs of this.gravitySystems.values()) {
      if (inFastForward) {
        for (let i = 0; i < steps; i++) {
          gs.step(subDt, true);
          this._consumeGsPending(gs, fullSimDt);
        }
        const maxEvolveDt = 1e5;
        const evolveSteps = Math.min(
          Math.max(1, Math.ceil(fullSimDt / maxEvolveDt)),
          1000
        );
        const evolveDt = fullSimDt / evolveSteps;
        const bodies = gs.getAliveBodies();
        for (const body of bodies) {
          for (let i = 0; i < evolveSteps; i++) {
            body.age += evolveDt;
            if (body.evolve) body.evolve(evolveDt);
            body.evolveComposition(evolveDt);
          }
        }
      } else {
        for (let i = 0; i < steps; i++) {
          gs.step(subDt, false);
          this._consumeGsPending(gs, subDt);
        }
        const bodies = gs.getAliveBodies();
        for (const body of bodies) {
          body.evolveComposition(fullSimDt);
        }
      }
    }

    // ── Radiation system (throttled) ────────────────────────────────────────
    if (this.simulationTime - this._lastRadiationUpdate >= this._radiationUpdateInterval) {
      for (const gs of this.gravitySystems.values()) {
        this.radiationSystem.update(gs.getAliveBodies(), fullSimDt);
      }
      this._lastRadiationUpdate = this.simulationTime;
    }

    // ── Orbital stability analysis (throttled) ──────────────────────────────
    if (this.simulationTime - this._lastOrbitalCheck >= this._orbitalCheckInterval) {
      for (const gs of this.gravitySystems.values()) {
        this.orbitalAnalysis.analyzeAll(gs.getAliveBodies());
      }
      this._lastOrbitalCheck = this.simulationTime;
    }

    const nextSimulationTime = this.simulationTime + fullSimDt;
    if (nextSimulationTime - this._lastLifeUpdate >= this._lifeUpdateInterval) {
      const lifeDt = nextSimulationTime - this._lastLifeUpdate;
      for (const gs of this.gravitySystems.values()) {
        this.lifeEvolutionSystem.update(gs.getAliveBodies(), lifeDt, nextSimulationTime);
      }
      this._lastLifeUpdate = nextSimulationTime;
    }

    this.simulationTime = nextSimulationTime;
    const lifeEvents = this.lifeEvolutionSystem.consumePendingEvents();
    for (const event of lifeEvents) {
      this.eventHistory.push(event);
      this.pendingEvents.push(event);
      if (this.onEvent) this.onEvent(event);
    }

    this.checkPhaseChanges();

    if (this.simulationTime - this.lastEventCheck >= this.eventCheckInterval) {
      this.checkRandomEvents(this.simulationTime - this.lastEventCheck);
      this.lastEventCheck = this.simulationTime;
    }

    // Universe-level composition and stats
    this.updateEscapedBodies(fullSimDt);
    const aliveBodies = this.getBodies();
    this.universe.evolveComposition(fullSimDt, aliveBodies);
    this.universe.updateStats(aliveBodies);

    // Primordial formation: gas -> star/cluster over time
    if (this.universe.canFormFromGas()) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (this.universe.boundaryRadius * 0.25) * (0.5 + Math.random() * 0.5);
      const G_UNIV = 4.5e-6;
      const primTotalMass = this.universe.clusters.filter(c => c.alive).length * 100 + 100;
      const primVCirc = Math.sqrt(G_UNIV * primTotalMass / Math.max(dist, 1));
      const ptx = -Math.sin(angle);
      const ptz = Math.cos(angle);
      const cluster = this.createCluster({
        name: `Galaxy ${this.universe.clusters.length + 1}`,
        type: Math.random() > 0.5 ? 'spiral' : 'elliptical',
        position: { x: dist * Math.cos(angle), y: 0, z: dist * Math.sin(angle) },
        velocity: { x: ptx * primVCirc, y: 0, z: ptz * primVCirc },
      });
      const system = this.createStarSystem(cluster.id, {
        name: `${cluster.name} Primary`,
        position: { x: 0, y: 0, z: 0 },
      });
      this.createStar('sun_like', {
        name: 'Newborn Star',
        systemId: system.id,
      });
      this.universe.markFormed();
    }

    // Cluster star formation: clusters create new stars as gas cools
    this._updateClusterStarFormation(fullSimDt);

    // Planet formation: young stars can spawn protoplanetary disks → planets
    this._updatePlanetFormation(fullSimDt);

    // Rogue body formation: occasional star/planet formation outside clusters
    this._updateRogueFormation(fullSimDt);

    const now = performance.now();
    this.fps = 1000 / (now - this.lastFrameTime);
    this.lastFrameTime = now;

    return aliveBodies;
  }

  /**
   * Clusters form new stars as gas cools over time.
   * Each cluster can spawn a new system + star every ~500 Myr if it has enough gas.
   */
  _updateClusterStarFormation(dtYears) {
    const formInterval = 5e8;
    for (const cluster of this.universe.clusters) {
      if (!cluster.alive) continue;
      if (!cluster._lastStarFormTime) cluster._lastStarFormTime = 0;
      const elapsed = this.simulationTime - cluster._lastStarFormTime;
      if (elapsed < formInterval) continue;

      const systemCount = cluster.systemIds.length;
      if (systemCount >= 8) continue;

      const h = this.universe.composition.H || 0;
      const he = this.universe.composition.He || 0;
      if (h + he < 0.4) continue;

      const baseChance = 0.3 + systemCount * 0.05;
      const chance = baseChance * (this._starFormRateMultiplier || 1);
      if (Math.random() > chance) { cluster._lastStarFormTime = this.simulationTime; continue; }

      const presets = ['sun_like', 'red_dwarf', 'blue_giant', 'orange_dwarf'];
      const presetId = presets[Math.floor(Math.random() * presets.length)];
      const sysName = `${cluster.name} System ${systemCount + 1}`;
      const system = this.createStarSystem(cluster.id, { name: sysName, position: { x: 0, y: 0, z: 0 } });
      const star = this.createStar(presetId, { name: `${sysName} Star`, systemId: system.id });
      cluster._lastStarFormTime = this.simulationTime;

      const event = {
        id: `starform_${Date.now()}_${Math.random()}`,
        name: 'Star Formation',
        category: 'evolution',
        targetBody: star,
        time: this.simulationTime,
        notification: {
          title: 'New Star Born',
          body: `A new star (${star.name}) has formed from cooling gas in ${cluster.name}!`,
          color: '#ffcc66',
        },
      };
      this.eventHistory.push(event);
      this.pendingEvents.push(event);
      if (this.onEvent) this.onEvent(event);
    }
  }

  /**
   * Young main-sequence stars can form planets from their protoplanetary disk.
   * Stars younger than 100 Myr with fewer than 5 planets have a chance to spawn planets.
   */
  _updatePlanetFormation(dtYears) {
    const formInterval = 2e7;
    if (!this._lastPlanetFormCheck) this._lastPlanetFormCheck = 0;
    if (this.simulationTime - this._lastPlanetFormCheck < formInterval) return;
    this._lastPlanetFormCheck = this.simulationTime;

    const bodies = this.getBodies();
    const stars = bodies.filter(b => b.alive && b.type === 'star' && b.phase === 'main_sequence');

    for (const star of stars) {
      if (star.age > 1e8) continue;
      if (star._planetFormDone) continue;

      const children = bodies.filter(b => b.alive && b.type === 'planet' && b.parentBody === star);
      if (children.length >= 5) { star._planetFormDone = true; continue; }

      if (Math.random() > 0.15 * (this._planetFormRateMultiplier || 1)) continue;

      const presets = ['earth_like', 'super_earth', 'hot_jupiter', 'ice_giant', 'desert_world', 'ocean_world'];
      const presetId = presets[Math.floor(Math.random() * presets.length)];
      const preset = PLANET_PRESETS[presetId];
      if (!preset) continue;

      const minDist = 0.3 + children.length * 0.5;
      const maxDist = Math.max(minDist + 2, 8 + children.length * 3);
      const dist = minDist + Math.random() * (maxDist - minDist);
      const name = `${star.name} ${String.fromCharCode(98 + children.length)}`;

      const planet = this.createPlanet(presetId, star, {
        name,
        systemId: star.systemId,
        orbitalDistance: dist,
      });

      const event = {
        id: `planetform_${Date.now()}_${Math.random()}`,
        name: 'Planet Formation',
        category: 'evolution',
        targetBody: planet,
        time: this.simulationTime,
        notification: {
          title: 'New Planet Formed',
          body: `${name} has coalesced from the protoplanetary disk around ${star.name}!`,
          color: '#66bbff',
        },
      };
      this.eventHistory.push(event);
      this.pendingEvents.push(event);
      if (this.onEvent) this.onEvent(event);
    }
  }

  /**
   * Rogue star/planet formation in intergalactic space.
   * Occasionally, gas clouds outside clusters collapse into lone stars.
   */
  _updateRogueFormation(dtYears) {
    const interval = 1e9;
    if (!this._lastRogueFormCheck) this._lastRogueFormCheck = 0;
    if (this.simulationTime - this._lastRogueFormCheck < interval) return;
    this._lastRogueFormCheck = this.simulationTime;

    const h = this.universe.composition.H || 0;
    if (h < 0.3) return;
    if (Math.random() > 0.2 * (this._starFormRateMultiplier || 1)) return;

    const boundary = this.universe.boundaryRadius || 50;
    const angle = Math.random() * Math.PI * 2;
    // Keep rogue clusters well inside boundary (max 45%) so they never hit the edge
    const dist = boundary * (0.1 + Math.random() * 0.35);
    // Tangential circular-orbit velocity to keep rogue clusters in stable orbit
    const G_UNIV = 4.5e-6;
    const totalMass = this.universe.clusters.filter(c => c.alive).length * 100 + 100;
    const vCirc = Math.sqrt(G_UNIV * totalMass / Math.max(dist, 1));
    const tx = -Math.sin(angle);
    const tz = Math.cos(angle);

    const rogueCluster = this.createCluster({
      name: `Rogue Cloud ${this.universe.clusters.length + 1}`,
      type: 'irregular',
      position: { x: dist * Math.cos(angle), y: 0, z: dist * Math.sin(angle) },
      velocity: { x: tx * vCirc, y: 0, z: tz * vCirc },
      color: '#888899',
    });
    const rogueSys = this.createStarSystem(rogueCluster.id, {
      name: `${rogueCluster.name} System`,
      position: { x: 0, y: 0, z: 0 },
    });
    const presets = ['red_dwarf', 'sun_like', 'orange_dwarf'];
    const presetId = presets[Math.floor(Math.random() * presets.length)];
    const star = this.createStar(presetId, {
      name: `Rogue Star ${Math.floor(Math.random() * 1000)}`,
      systemId: rogueSys.id,
    });

    const event = {
      id: `rogueform_${Date.now()}_${Math.random()}`,
      name: 'Rogue Star Formation',
      category: 'evolution',
      targetBody: star,
      time: this.simulationTime,
      notification: {
        title: 'Rogue Star Formed',
        body: `${star.name} condensed from intergalactic gas far from any galaxy!`,
        color: '#aaccff',
      },
    };
    this.eventHistory.push(event);
    this.pendingEvents.push(event);
    if (this.onEvent) this.onEvent(event);
  }

  checkPhaseChanges() {
    const bodies = this.getBodies();
    for (const body of bodies) {
      if (body._lastPhaseChange) {
        const change = body._lastPhaseChange;
        body._lastPhaseChange = null;

        body.composition = getDefaultComposition(body.type, body.subtype, change.newPhase);

        const phaseNames = {
          'main_sequence':  'Main Sequence',
          'subgiant':       'Subgiant',
          'red_giant':      'Red Giant',
          'red_supergiant': 'Red Supergiant',
          'white_dwarf':    'White Dwarf',
          'neutron_star':   'Neutron Star',
          'black_hole':     'Black Hole',
        };

        const newPhaseName = phaseNames[change.newPhase] || change.newPhase;
        const oldPhaseName = phaseNames[change.oldPhase] || change.oldPhase;

        const event = {
          id: `phase_${Date.now()}_${Math.random()}`,
          name: 'Stellar Evolution',
          category: 'evolution',
          targetBody: body,
          time: this.simulationTime,
          notification: {
            title: 'Stellar Evolution!',
            body: `${body.name} has evolved from ${oldPhaseName} to ${newPhaseName}!`,
            severity: change.newPhase === 'black_hole'    ? 'catastrophic'
              : change.newPhase === 'neutron_star'        ? 'critical'
              : change.newPhase === 'white_dwarf'         ? 'major'
              : 'notable',
          },
          effects: {},
        };

        this.eventHistory.push(event);
        this.pendingEvents.push(event);
        if (this.onEvent) this.onEvent(event);
        if (this.onPhaseChange) this.onPhaseChange(body, change.newPhase);
      }

      // ── Process supernova / explosion payloads ─────────────────────────────
      if (body._pendingExplosion) {
        const expl = body._pendingExplosion;
        body._pendingExplosion = null;

        // VFX event for SceneManager
        const vfxEvent = {
          type: 'supernova_explosion',
          sourceId: body.id,
          sourceName: body.name,
          ...expl,
          timestamp: Date.now(),
        };
        this.pendingVfxEvents.push(vfxEvent);
        if (this.onVfxEvent) this.onVfxEvent(vfxEvent);

        // Emit game event notification
        const gameEvent = {
          id: `supernova_${Date.now()}_${Math.random()}`,
          name: 'Supernova!',
          category: 'catastrophe',
          targetBody: body,
          time: this.simulationTime,
          notification: {
            title: 'SUPERNOVA!',
            body: `${body.name} exploded as a supernova! Remnant: ${expl.remnantType}`,
            severity: 'catastrophic',
          },
          effects: { radiationBurst: true, shockwave: true },
        };
        this.eventHistory.push(gameEvent);
        this.pendingEvents.push(gameEvent);
        if (this.onEvent) this.onEvent(gameEvent);

        // Propagate catastrophe to nearby bodies in the same system
        const gs = body.systemId ? this.gravitySystems.get(body.systemId) : null;
        if (gs) {
          this.catastropheSystem.propagateSupernova(
            body, gs.getAliveBodies(), expl.ejectaMass, expl.energy
          );
          // Apply radiation burst via RadiationSystem
          this.radiationSystem.applyRadiationBurst(
            gs.getAliveBodies(), expl.position, expl.radiationBurst
          );
        }
      }
    }
  }

  /**
   * Consume pending spawns and VFX/catastrophe events from a GravitySystem
   * after each sub-step.  Called inside the update loop.
   */
  _consumeGsPending(gs, dt) {
    // ── Spawn new bodies created by collision resolution ───────────────────
    if (gs.pendingSpawns.length > 0) {
      for (const nb of gs.pendingSpawns) {
        gs.addBody(nb);
        if (nb.systemId) {
          const sys = this.universe.getSystem(nb.systemId);
          if (sys) sys.addBody(nb);
        }
        if (this.onBodyCreated) this.onBodyCreated(nb);
      }
      gs.pendingSpawns = [];
    }

    // ── Collect VFX events from collision system ───────────────────────────
    if (gs.collisionSystem && gs.collisionSystem.pendingVfxEvents.length > 0) {
      for (const vfx of gs.collisionSystem.pendingVfxEvents) {
        this.pendingVfxEvents.push(vfx);
        if (this.onVfxEvent) this.onVfxEvent(vfx);
      }
      gs.collisionSystem.pendingVfxEvents = [];
    }

    // ── Process catastrophe events from collision system ───────────────────
    if (gs.collisionSystem && gs.collisionSystem.pendingCatastrophes.length > 0) {
      const aliveBodies = gs.getAliveBodies();
      for (const cat of gs.collisionSystem.pendingCatastrophes) {
        this.catastropheSystem.process(cat, aliveBodies, dt);

        // Radiation burst component
        if (cat.radiationBurst > 0 && cat.position) {
          this.radiationSystem.applyRadiationBurst(
            aliveBodies, cat.position, cat.radiationBurst
          );
        }

        // Forward shockwave as a VFX event
        this.pendingVfxEvents.push({
          type: 'shockwave',
          ...cat,
          timestamp: Date.now(),
        });
        if (this.onVfxEvent) this.onVfxEvent({ type: 'shockwave', ...cat });

        // Also emit as a game event
        const gameEvent = {
          id: `catastrophe_${Date.now()}_${Math.random()}`,
          name: 'Catastrophic Event',
          category: 'catastrophe',
          time: this.simulationTime,
          notification: {
            title: 'Catastrophic Event!',
            body: `A ${cat.type} event was detected in the system!`,
            severity: 'catastrophic',
          },
          effects: {},
        };
        this.pendingEvents.push(gameEvent);
        if (this.onEvent) this.onEvent(gameEvent);
      }
      gs.collisionSystem.pendingCatastrophes = [];
    }
  }

  checkRandomEvents(dt) {
    const bodies = this.getBodies();
    if (bodies.length === 0) return;

    const now = performance.now();
    if (now - (this._lastEventRealTime || 0) < 3000) return;

    const effectiveDt = Math.min(dt, 10);
    let eventTriggered = false;

    const systemBody = bodies[0];
    const systemEvents = getApplicableEvents(systemBody, { bodies }, effectiveDt);
    for (const event of systemEvents) {
      if (event.category === 'system' && !eventTriggered) {
        this.triggerEvent(event, systemBody);
        eventTriggered = true;
        this._lastEventRealTime = now;
        break;
      }
    }

    if (!eventTriggered) {
      for (const body of bodies) {
        const events = getApplicableEvents(body, { bodies }, effectiveDt);
        for (const event of events) {
          if (event.category !== 'system') {
            this.triggerEvent(event, body);
            eventTriggered = true;
            this._lastEventRealTime = now;
            break;
          }
        }
        if (eventTriggered) break;
      }
    }
  }

  triggerEvent(eventDef, body) {
    const event = {
      ...eventDef,
      targetBody: body,
      time: this.simulationTime,
      id: `event_${Date.now()}_${Math.random()}`,
    };

    if (eventDef.effects.luminosityMultiplier) {
      body.luminosity *= eventDef.effects.luminosityMultiplier;
    }
    if (eventDef.effects.temperatureChange) {
      body.temperature += eventDef.effects.temperatureChange;
    }
    if (eventDef.effects.atmosphereChange && body.atmospherePressure !== undefined) {
      body.atmospherePressure += eventDef.effects.atmosphereChange;
    }
    if (eventDef.effects.massLoss) {
      body.mass -= eventDef.effects.massLoss;
    }

    body.logEvent({
      type: eventDef.id,
      message: eventDef.notification.body.replace(
        /\{(\w+)\}/g,
        (_, key) => body.name
      ),
    });

    this.eventHistory.push(event);
    this.pendingEvents.push(event);
    if (this.onEvent) this.onEvent(event);
    return event;
  }

  consumePendingEvents() {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  /** All alive bodies across every system */
  getBodies() {
    const all = [];
    for (const gs of this.gravitySystems.values()) {
      for (const b of gs.getAliveBodies()) all.push(b);
    }
    return all;
  }

  /** Find a body by id across all systems */
  getBody(id) {
    for (const gs of this.gravitySystems.values()) {
      const found = gs.bodies.find(b => b.id === id);
      if (found) return found;
    }
    return null;
  }

  /** Bodies in a specific star system */
  getSystemBodies(systemId) {
    const gs = this.gravitySystems.get(systemId);
    return gs ? gs.getAliveBodies() : [];
  }

  /** Get the GravitySystem for a specific star system */
  getSystemGravity(systemId) {
    return this.gravitySystems.get(systemId) || null;
  }

  getStats() {
    const bodies = this.getBodies();
    let totalEnergy = 0;
    let totalMass = 0;
    for (const gs of this.gravitySystems.values()) {
      totalEnergy += gs.totalEnergy().total;
      totalMass += gs.centerOfMass().totalMass;
    }

    const unstableOrbits = bodies.filter(b => !b.orbitStable && b.type === 'planet').length;
    const livingWorlds = bodies.filter((b) => b.type === 'planet' && b.hasLife).length;
    const complexWorlds = bodies.filter(
      (b) => b.type === 'planet' && (b.lifeStage === 'complex' || b.lifeStage === 'intelligent')
    ).length;
    const intelligentWorlds = bodies.filter(
      (b) => b.type === 'planet' && b.lifeStage === 'intelligent'
    ).length;

    return {
      bodyCount: bodies.length,
      stars: bodies.filter(b => b.type === 'star').length,
      planets: bodies.filter(b => b.type === 'planet').length,
      blackHoles: bodies.filter(b => b.type === 'black_hole').length,
      simulationTime: this.simulationTime,
      timeScale: this.timeScale,
      totalEnergy,
      centerOfMass: { x: 0, y: 0, z: 0 },
      totalMass,
      fps: this.fps,
      state: this.state,
      clusters: this.universe.stats.clusterCount,
      systems: this.universe.stats.systemCount,
      unstableOrbits,
      livingWorlds,
      complexWorlds,
      intelligentWorlds,
      fastForward: this.fastForward,
    };
  }

  getUniverseStats() {
    const bodies = this.getBodies();
    this.universe.updateStats(bodies);
    const livingWorlds = bodies.filter((b) => b.type === 'planet' && b.hasLife).length;
    const complexWorlds = bodies.filter(
      (b) => b.type === 'planet' && (b.lifeStage === 'complex' || b.lifeStage === 'intelligent')
    ).length;
    const intelligentWorlds = bodies.filter(
      (b) => b.type === 'planet' && b.lifeStage === 'intelligent'
    ).length;

    return {
      ...this.universe.stats,
      age: this.universe.age,
      boundaryRadius: this.universe.boundaryRadius,
      totalMass: this.universe.totalMass,
      livingWorlds,
      complexWorlds,
      intelligentWorlds,
      composition: this.universe.composition,
      clusters: this.universe.clusters.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        systemCount: c.systemIds.length,
        alive: c.alive,
        position: { x: c.position.x, y: c.position.y, z: c.position.z },
      })),
      rogueBodies: bodies
        .filter((b) => b.alive && b.escapedSystem)
        .map((b) => ({
          id: b.id,
          name: b.name,
          type: b.type,
          systemId: b.systemId,
          universePosition: this.getBodyUniversePosition(b),
        })),
    };
  }

  toJSON() {
    const events = this.eventHistory.slice(-50).map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      time: e.time,
      notification: e.notification,
      effects: e.effects,
      targetBody: e.targetBody ? { id: e.targetBody.id, name: e.targetBody.name } : null,
    }));

    const systems = {};
    for (const [sysId, gs] of this.gravitySystems) {
      systems[sysId] = gs.toJSON();
    }

    return {
      gravitySystems: systems,
      universe: this.universe.toJSON(),
      simulationTime: this.simulationTime,
      timeScale: this.timeScale,
      state: this.state,
      eventHistory: events,
    };
  }

  fromJSON(data) {
    if (!data) return;

    this.gravitySystems.clear();

    if (data.gravitySystems && typeof data.gravitySystems === 'object' && !data.gravitySystems.bodies) {
      // New format: per-system gravity systems (Map-like object)
      for (const [sysId, gsData] of Object.entries(data.gravitySystems)) {
        const gs = new GravitySystem();
        gs.fromJSON(gsData);
        gs.onBoundaryExceeded = this._boundaryHandler || null;
        this.gravitySystems.set(sysId, gs);
      }
    } else {
      // Legacy format: single gravitySystem — distribute bodies to their systems
      const legacyData = data.gravitySystem || data.gravitySystems;
      if (legacyData?.bodies) {
        const gs = new GravitySystem();
        gs.fromJSON(legacyData);
        for (const body of gs.bodies) {
          const sid = body.systemId || '_default';
          const targetGS = this.getOrCreateGS(sid);
          targetGS.addBody(body);
        }
      }
    }

    if (data.universe) {
      this.universe = Universe.fromJSON(data.universe);
    }

    // Ensure every known system has a GravitySystem
    for (const sys of this.universe.systems) {
      this.getOrCreateGS(sys.id);
    }

    // Ensure all restored GravitySystems have pendingSpawns initialised
    for (const gs of this.gravitySystems.values()) {
      if (!gs.pendingSpawns) gs.pendingSpawns = [];
    }

    if (data.simulationTime != null) this.simulationTime = data.simulationTime;
    if (data.timeScale != null) this.setTimeScale(data.timeScale);
    if (data.state != null) this.state = data.state;
    if (data.eventHistory?.length) this.eventHistory = data.eventHistory;
    this.paused = true;
  }

  reset() {
    this.gravitySystems.clear();
    this.universe = new Universe();
    this.simulationTime = 0;
    this.timeScale = 1;
    this.paused = true;
    this.state = SIM_STATE.SETUP;
    this.pendingEvents = [];
    this.eventHistory = [];
    this.lastEventCheck = 0;
    this._lastLifeUpdate = 0;
  }
}

/**
 * SimEngine - The master simulation controller
 * Multi-scale architecture:
 *   Universe (Mly) → Clusters (kly) → Star Systems (AU)
 * Each StarSystem has its own GravitySystem with independent N-body physics.
 * Bodies within a system interact gravitationally; bodies in different systems do not.
 */
import GravitySystem from './GravitySystem';
import Universe from './Universe';
import Cluster from './Cluster';
import StarSystem from './StarSystem';
import Star from './Star';
import Planet from './Planet';
import BlackHole from './BlackHole';
import { getApplicableEvents } from '@data/events';
import { STAR_PRESETS } from '@data/starTypes';
import { PLANET_PRESETS } from '@data/planetTypes';
import { getDefaultComposition } from '@data/elements';
import { SIM_TIME_SCALE, UNIVERSE_RADIUS_MLY, VIEW_LEVEL } from '@utils/constants';

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

    this.onEvent = null;
    this.onPhaseChange = null;
    this.onBodyDestroyed = null;
    this.onBodyCreated = null;

    this.stepsPerFrame = 8;
    this.maxDtPerStep = 0.02;
    this.maxStepsPerFrame = 48;
    this.typicalFrameTime = 1 / 60;
    this.lastFrameTime = 0;
    this.fps = 60;

    this.fastForward = false;
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

  getMaxPhysicsTimeScale() {
    let maxN = 0;
    for (const gs of this.gravitySystems.values()) {
      maxN = Math.max(maxN, gs.getAliveBodies().length);
    }
    const stepsBudget = Math.max(8, this.maxStepsPerFrame - Math.max(0, maxN - 4) * 4);
    return (stepsBudget * this.maxDtPerStep) / this.typicalFrameTime;
  }

  getMaxTimeScale() {
    return 1e9;
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
        }
        const bodies = gs.getAliveBodies();
        for (const body of bodies) {
          body.evolveComposition(fullSimDt);
        }
      }
    }

    this.simulationTime += fullSimDt;
    this.checkPhaseChanges();

    if (this.simulationTime - this.lastEventCheck >= this.eventCheckInterval) {
      this.checkRandomEvents(this.simulationTime - this.lastEventCheck);
      this.lastEventCheck = this.simulationTime;
    }

    // Universe-level composition and stats
    const aliveBodies = this.getBodies();
    this.universe.evolveComposition(fullSimDt, aliveBodies);
    this.universe.updateStats(aliveBodies);

    // Primordial formation: gas -> star/cluster over time
    if (this.universe.canFormFromGas()) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (this.universe.boundaryRadius * 0.3) * (0.5 + Math.random() * 0.5);
      const cluster = this.createCluster({
        name: `Galaxy ${this.universe.clusters.length + 1}`,
        type: Math.random() > 0.5 ? 'spiral' : 'elliptical',
        position: { x: dist * Math.cos(angle), y: 0, z: dist * Math.sin(angle) },
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

    const now = performance.now();
    this.fps = 1000 / (now - this.lastFrameTime);
    this.lastFrameTime = now;

    return aliveBodies;
  }

  checkPhaseChanges() {
    const bodies = this.getBodies();
    for (const body of bodies) {
      if (body._lastPhaseChange) {
        const change = body._lastPhaseChange;
        body._lastPhaseChange = null;

        body.composition = getDefaultComposition(body.type, body.subtype, change.newPhase);

        const phaseNames = {
          'main_sequence': 'Main Sequence',
          'subgiant': 'Subgiant',
          'red_giant': 'Red Giant',
          'red_supergiant': 'Red Supergiant',
          'white_dwarf': 'White Dwarf',
          'neutron_star': 'Neutron Star',
          'black_hole': 'Black Hole',
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
            severity: change.newPhase === 'black_hole' ? 'catastrophic'
              : change.newPhase === 'neutron_star' ? 'critical'
              : change.newPhase === 'white_dwarf' ? 'major'
              : 'notable',
          },
          effects: {},
        };

        this.eventHistory.push(event);
        this.pendingEvents.push(event);
        if (this.onEvent) this.onEvent(event);
        if (this.onPhaseChange) this.onPhaseChange(body, change.newPhase);
      }
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
    };
  }

  getUniverseStats() {
    this.universe.updateStats(this.getBodies());
    return {
      ...this.universe.stats,
      age: this.universe.age,
      boundaryRadius: this.universe.boundaryRadius,
      totalMass: this.universe.totalMass,
      composition: this.universe.composition,
      clusters: this.universe.clusters.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        systemCount: c.systemIds.length,
        alive: c.alive,
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
  }
}

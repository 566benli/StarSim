/**
 * CelestialBody - Base class for all objects in the simulation
 * Stars, planets, black holes, and other objects all extend this.
 */
import * as THREE from 'three';
import { generateId } from '@utils/helpers';
import { getDefaultComposition, evolveFusion } from '@data/elements';

export default class CelestialBody {
  constructor(config = {}) {
    // Identity
    this.id = config.id || generateId();
    this.name = config.name || 'Unknown Body';
    this.type = config.type || 'unknown'; // 'star', 'planet', 'black_hole', 'asteroid', etc.
    this.subtype = config.subtype || '';   // e.g. 'red_dwarf', 'gas_giant', etc.

    // Physical properties (in simulation units)
    this.mass = config.mass || 1.0;           // Solar masses
    this.radius = config.radius || 1.0;       // Solar radii
    this.temperature = config.temperature || 5778; // Kelvin
    this.luminosity = config.luminosity || 1.0;    // Solar luminosities
    this.age = config.age || 0;               // Years since formation
    this.metallicity = config.metallicity || 0.02; // Z (solar ~0.02)

    // Dynamics (in simulation units: AU, AU/sim_time)
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    if (config.position) this.position.copy(config.position);
    if (config.velocity) this.velocity.copy(config.velocity);

    // Rotation
    this.rotation = new THREE.Euler(
      config.axialTilt || 0,
      0,
      0
    );
    this.rotationSpeed = config.rotationSpeed || 0.01; // radians per sim time
    this.rotationAngle = 0;

    // Orbit reference (if orbiting something)
    this.parentBody = config.parentBody || null;
    this.orbitalDistance = config.orbitalDistance || 0;
    this.eccentricity = config.eccentricity || 0;
    this.inclination = config.inclination || 0;
    this.orbitalAngle = config.orbitalAngle || Math.random() * Math.PI * 2;

    // State
    this.alive = true;
    this.selected = false;
    this.phase = config.phase || 'main_sequence';

    // Trail (orbit visualization) — recent path fades out over time
    this.trail = [];
    this.maxTrailLength = 300;

    // Children (moons, etc.)
    this.children = [];

    // Metadata for UI
    this.description = config.description || '';
    this.funFact = config.funFact || '';
    this.showLabel = config.showLabel !== false; // Show name in 3D view (default true)

    // Event log
    this.eventLog = [];

    // Universe hierarchy
    this.systemId = config.systemId || null;

    // Chemical composition (mass fractions keyed by element symbol)
    this.composition = config.composition || getDefaultComposition(this.type, this.subtype, this.phase);

    // Core temperature (for fusion calculations); surface temp is this.temperature
    this.coreTemperature = config.coreTemperature || this._estimateCoreTemp();

    // ── Extended physics properties (Layer 1 upgrade) ─────────────────────────

    // Radiation received (normalised solar-constant units, updated by RadiationSystem)
    this.radiationFlux = 0;
    this.uvFlux        = 0;
    this.xrayFlux      = 0;

    // Biological / civilisation consequence hook (Layer 3)
    this.aberranceProbability = config.aberranceProbability || 0; // 0–1

    // Structural damage from shockwaves / impacts (0 = pristine, 1 = destroyed)
    this.surfaceDamage = config.surfaceDamage || 0;

    // How readily this body is perturbed by shockwaves
    this.shockwaveVulnerability = config.shockwaveVulnerability ?? 1.0;

    // How well the atmosphere is retained under radiation pressure
    this.atmosphereRetentionFactor = config.atmosphereRetentionFactor ?? 1.0;

    // Spin angular momentum (used for collision angular-momentum bookkeeping)
    this.spinAngularMomentum = config.spinAngularMomentum || 0;

    // Orbital stability flags (written by OrbitalAnalysisSystem)
    this.orbitStable          = true;
    this.orbitalEnergy        = null;
    this.eccentricityTracked  = null;
    this._orbitWarned         = false;
    this._ejectionWarned      = false;

    // Temporary luminosity boost after merger/explosion (decays each evolve step)
    // { factor: Number > 1, decayRate: (1/yr) }
    this._luminosityBoost = null;

    // Pending explosion payload (read by SimEngine.checkPhaseChanges)
    this._pendingExplosion = null;
  }

  _estimateCoreTemp() {
    if (this.type === 'star') {
      return this.temperature * (this.mass > 8 ? 300 : this.mass > 1 ? 200 : 150);
    }
    return this.temperature * 2;
  }

  /**
   * Get all displayable properties for the info panel
   */
  getProperties() {
    return {
      name: this.name,
      type: this.type,
      subtype: this.subtype,
      phase: this.phase,
      mass: { value: this.mass, unit: 'M☉' },
      radius: { value: this.radius, unit: 'R☉' },
      temperature: { value: this.temperature, unit: 'K' },
      luminosity: { value: this.luminosity, unit: 'L☉' },
      age: { value: this.age, unit: 'years' },
      position: {
        x: this.position.x.toFixed(4),
        y: this.position.y.toFixed(4),
        z: this.position.z.toFixed(4),
        unit: 'AU',
      },
      velocity: {
        x: this.velocity.x.toFixed(4),
        y: this.velocity.y.toFixed(4),
        z: this.velocity.z.toFixed(4),
        magnitude: this.velocity.length().toFixed(4),
        unit: 'AU/yr',
      },
      composition: this.composition,
      coreTemperature: { value: this.coreTemperature, unit: 'K' },
      // Extended physics
      radiationFlux: { value: this.radiationFlux, unit: 'S☉' },
      uvFlux:        { value: this.uvFlux,        unit: 'S☉' },
      xrayFlux:      { value: this.xrayFlux,      unit: 'S☉' },
      aberranceProbability: this.aberranceProbability,
      surfaceDamage: this.surfaceDamage,
      orbitStable: this.orbitStable,
    };
  }

  /**
   * Evolve the chemical composition based on core temperature and time step.
   * @param {number} dtYears - time step in years
   */
  evolveComposition(dtYears) {
    if (!this.composition || dtYears <= 0) return;
    const dtMyr = dtYears / 1e6;
    if (dtMyr < 1e-12) return;
    this.composition = evolveFusion(this.composition, this.coreTemperature, dtMyr);
  }

  /**
   * Update the body for one time step
   * @param {number} dt - time step in simulation units
   */
  update(dt) {
    if (!this.alive) return;

    // Update position based on velocity
    this.position.addScaledVector(this.velocity, dt);

    // Update velocity based on acceleration
    this.velocity.addScaledVector(this.acceleration, dt);

    // Update rotation
    this.rotationAngle += this.rotationSpeed * dt;

    // Update age
    this.age += dt;

    // Update trail
    this.trail.push(this.position.clone());
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    // Reset acceleration (will be recalculated by gravity system)
    this.acceleration.set(0, 0, 0);
  }

  /**
   * Apply and decay the temporary luminosity boost granted after mergers / flares.
   * Called from subclass evolve() hooks or GravitySystem after the step.
   * @param {number} dt years
   */
  tickLuminosityBoost(dt) {
    if (!this._luminosityBoost) return;
    const b = this._luminosityBoost;
    // Exponential decay back toward factor = 1
    b.factor = 1.0 + (b.factor - 1.0) * Math.exp(-b.decayRate * dt);
    if (b.factor < 1.001) {
      this._luminosityBoost = null;
    }
  }

  /**
   * Apply a force to this body
   * @param {THREE.Vector3} force - Force vector
   */
  applyForce(force) {
    // a = F / m
    this.acceleration.addScaledVector(force, 1.0 / this.mass);
  }

  /**
   * Calculate distance to another body
   */
  distanceTo(other) {
    return this.position.distanceTo(other.position);
  }

  /**
   * Log an event that happened to this body
   */
  logEvent(event) {
    this.eventLog.push({
      ...event,
      timestamp: this.age,
      date: Date.now(),
    });
    // Keep last 100 events
    if (this.eventLog.length > 100) this.eventLog.shift();
  }

  /**
   * Destroy this body (e.g., consumed by black hole, supernova remnant)
   */
  destroy() {
    this.alive = false;
    this.logEvent({ type: 'destroyed', message: `${this.name} has been destroyed.` });
  }

  /**
   * Serialize to JSON for saving
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      subtype: this.subtype,
      mass: this.mass,
      radius: this.radius,
      temperature: this.temperature,
      luminosity: this.luminosity,
      age: this.age,
      metallicity: this.metallicity,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
      orbitalDistance: this.orbitalDistance,
      eccentricity: this.eccentricity,
      inclination: this.inclination,
      phase: this.phase,
      alive: this.alive,
      description: this.description,
      showLabel: this.showLabel,
      systemId: this.systemId,
      composition: this.composition ? { ...this.composition } : null,
      coreTemperature: this.coreTemperature,
      // Extended physics
      aberranceProbability: this.aberranceProbability,
      surfaceDamage: this.surfaceDamage,
      shockwaveVulnerability: this.shockwaveVulnerability,
      atmosphereRetentionFactor: this.atmosphereRetentionFactor,
      spinAngularMomentum: this.spinAngularMomentum,
      orbitStable: this.orbitStable,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data) {
    const pos = data.position || {};
    const vel = data.velocity || {};
    const body = new CelestialBody({
      ...data,
      position: new THREE.Vector3(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0),
      velocity: new THREE.Vector3(vel.x ?? 0, vel.y ?? 0, vel.z ?? 0),
    });
    return body;
  }
}

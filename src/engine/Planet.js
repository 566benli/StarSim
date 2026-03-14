/**
 * Planet - A celestial body orbiting a star
 * Handles orbital mechanics, atmosphere, surface conditions, and habitability
 */
import * as THREE from 'three';
import CelestialBody from './CelestialBody';
import { EARTH_MASS, EARTH_RADIUS, SOLAR_MASS } from '@utils/constants';

export default class Planet extends CelestialBody {
  constructor(config = {}) {
    super({
      ...config,
      type: 'planet',
    });

    // Planet-specific properties
    this.massEarth = config.massEarth || this.mass * (SOLAR_MASS / EARTH_MASS);
    this.radiusEarth = config.radiusEarth || 1.0;
    this.surfaceGravity = this.calculateSurfaceGravity();

    // Atmosphere
    this.atmospherePressure = config.atmosphere || 1.0; // atm
    this.atmosphereComposition = config.atmosphereComposition || {
      N2: 0.78, O2: 0.21, Ar: 0.009, CO2: 0.0004,
    };
    this.hasAtmosphere = this.atmospherePressure > 0.001;
    this.atmosphereColor = config.atmosphereColor || '#88aaff';

    // Surface
    this.surfaceType = config.surfaceType || 'rocky'; // rocky, gaseous, icy, molten
    this.albedo = config.albedo || 0.3;
    this.hasWater = config.hasWater || false;
    this.waterCoverage = config.waterCoverage || 0; // 0 to 1
    this.hasLife = false;

    // Rings
    this.hasRings = config.hasRings || false;
    this.ringInnerRadius = config.ringInnerRadius || this.radiusEarth * 1.5;
    this.ringOuterRadius = config.ringOuterRadius || this.radiusEarth * 3.0;
    this.ringColor = config.ringColor || '#ccaa88';

    // Moons
    this.moonCount = config.moons || 0;

    // Orbit (relative to parent)
    this.orbitalDistance = config.orbitalDistance || 1.0; // AU
    this.eccentricity = config.eccentricity || 0.02;
    this.orbitalPeriod = 0; // Calculated from parent mass and distance
    this.trueAnomaly = Math.random() * Math.PI * 2;

    // Climate
    this.equilibriumTemperature = this.temperature;
    this.greenhouseEffect = config.greenhouseEffect || 1.0; // multiplier
    this.magneticField = config.magneticField || 1.0; // Earth = 1

    // Visual
    this.color = config.color || '#4488cc';
    this.bandColors = config.bandColors || null; // For gas giants
  }

  /**
   * Calculate surface gravity in Earth g's
   */
  calculateSurfaceGravity() {
    if (this.radiusEarth === 0) return 0;
    return this.massEarth / (this.radiusEarth * this.radiusEarth);
  }

  /**
   * Calculate equilibrium temperature from stellar luminosity
   */
  calculateEquilibriumTemp(starLuminosity) {
    if (this.orbitalDistance <= 0) return 2.7; // cosmic background
    // T_eq = 278 * (L/L_sun)^0.25 * (1/d_AU)^0.5 * (1 - albedo)^0.25
    const T = 278 * Math.pow(starLuminosity, 0.25)
      * Math.pow(1 / this.orbitalDistance, 0.5)
      * Math.pow(1 - this.albedo, 0.25);
    return T * this.greenhouseEffect;
  }

  static fromJSON(data) {
    const pos = data.position || {};
    const vel = data.velocity || {};
    return new Planet({
      ...data,
      position: { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 },
      velocity: { x: vel.x || 0, y: vel.y || 0, z: vel.z || 0 },
    });
  }

  /**
   * Check if the planet is in the habitable zone
   */
  isHabitable(starLuminosity) {
    const T = this.calculateEquilibriumTemp(starLuminosity);
    return T > 200 && T < 350 && this.hasAtmosphere && this.magneticField > 0.1;
  }

  /**
   * Update the planet for one time step
   * NOTE: Position/velocity are handled by GravitySystem (N-body).
   * This method handles planet-specific updates only.
   */
  update(dt) {
    // Don't call super.update() - GravitySystem handles position/velocity
    if (!this.alive) return;

    // Recalculate temperature from parent star if available
    if (this.parentBody && this.parentBody.alive) {
      const dist = this.position.distanceTo(this.parentBody.position);
      if (dist > 0) {
        this.orbitalDistance = dist; // Track actual distance
        this.temperature = this.calculateEquilibriumTemp(this.parentBody.luminosity);
      }
    }

    // Update atmosphere (slow evolution)
    this.updateAtmosphere(dt);

    // Check for habitability / life
    this.updateHabitability(dt);
  }

  /**
   * Called by GravitySystem after Verlet integration
   * Handles non-positional evolution
   */
  evolve(dt) {
    this.update(dt);
  }

  /**
   * Kepler orbit update
   */
  updateOrbit(dt) {
    if (!this.parentBody || this.orbitalDistance <= 0) return;

    const parentMass = this.parentBody.mass;
    // Orbital period in sim time: T = 2π √(a³/M)   [sim units, G=1]
    this.orbitalPeriod = 2 * Math.PI * Math.sqrt(
      Math.pow(this.orbitalDistance, 3) / parentMass
    );

    // Advance true anomaly (simplified circular for now)
    const angularVelocity = 2 * Math.PI / this.orbitalPeriod;
    this.trueAnomaly += angularVelocity * dt;

    // Calculate position relative to parent (elliptical orbit in orbital plane)
    const e = this.eccentricity;
    const r = this.orbitalDistance * (1 - e * e) / (1 + e * Math.cos(this.trueAnomaly));

    const cosI = Math.cos(this.inclination);
    const sinI = Math.sin(this.inclination);
    const cosA = Math.cos(this.trueAnomaly);
    const sinA = Math.sin(this.trueAnomaly);

    this.position.set(
      this.parentBody.position.x + r * cosA,
      this.parentBody.position.y + r * sinA * sinI,
      this.parentBody.position.z + r * sinA * cosI
    );

    // Velocity (tangential for roughly circular)
    const vMag = Math.sqrt(parentMass / r);
    this.velocity.set(
      this.parentBody.velocity.x - vMag * sinA,
      this.parentBody.velocity.y + vMag * cosA * sinI,
      this.parentBody.velocity.z + vMag * cosA * cosI
    );

    // Update temperature based on star
    this.temperature = this.calculateEquilibriumTemp(this.parentBody.luminosity);
    this.equilibriumTemperature = this.temperature;
  }

  /**
   * Atmospheric evolution (very simplified)
   */
  updateAtmosphere(dt) {
    // Atmospheric escape for small/hot planets
    if (this.temperature > 1000 && this.massEarth < 2) {
      this.atmospherePressure *= Math.exp(-dt * 1e-10);
    }

    // Runaway greenhouse (dt-stable exponential growth, capped at 3×)
    if (this.temperature > 400 && this.hasWater && this.atmospherePressure > 0.5) {
      const rate = 1e-4; // per year
      this.greenhouseEffect = Math.min(this.greenhouseEffect * Math.exp(rate * dt), 3.0);
    }

    this.hasAtmosphere = this.atmospherePressure > 0.001;
  }

  /**
   * Check and update habitability conditions
   */
  updateHabitability(dt) {
    const T = this.temperature;
    const habitable = T > 200 && T < 350
      && this.hasAtmosphere
      && this.atmospherePressure > 0.1
      && this.magneticField > 0.1;

    // Very simplified abiogenesis probability (Poisson process, stable at any dt)
    if (habitable && this.hasWater && !this.hasLife) {
      const rate = 1e-12; // per year
      if (Math.random() < 1 - Math.exp(-rate * dt)) {
        this.hasLife = true;
        this.logEvent({
          type: 'life',
          message: `Life has emerged on ${this.name}!`,
          severity: 'historic',
        });
      }
    }

    // Life extinction
    if (this.hasLife && !habitable) {
      this.hasLife = false;
      this.logEvent({
        type: 'extinction',
        message: `Life on ${this.name} has gone extinct!`,
        severity: 'major',
      });
    }
  }

  /**
   * Get detailed properties for the info panel
   */
  getProperties() {
    const base = super.getProperties();
    return {
      ...base,
      massEarth: { value: this.massEarth, unit: 'M⊕' },
      radiusEarth: { value: this.radiusEarth, unit: 'R⊕' },
      surfaceGravity: { value: this.surfaceGravity, unit: 'g' },
      surfaceType: this.surfaceType,
      atmosphere: {
        pressure: { value: this.atmospherePressure, unit: 'atm' },
        composition: this.atmosphereComposition,
      },
      temperature: { value: this.temperature, unit: 'K' },
      albedo: this.albedo,
      hasWater: this.hasWater,
      hasLife: this.hasLife,
      habitableZone: this.parentBody
        ? (this.isHabitable(this.parentBody.luminosity) ? 'Yes ✓' : 'No ✗')
        : 'N/A',
      orbitalDistance: { value: this.orbitalDistance, unit: 'AU' },
      orbitalPeriod: { value: this.orbitalPeriod, unit: 'sim time' },
      eccentricity: this.eccentricity,
      moons: this.moonCount,
      hasRings: this.hasRings,
      magneticField: { value: this.magneticField, unit: 'Earth = 1' },
    };
  }
}

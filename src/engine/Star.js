/**
 * Star - A luminous celestial body powered by nuclear fusion
 * Handles stellar evolution, spectral classification, and lifecycle
 */
import CelestialBody from './CelestialBody';
import { EVOLUTION_PHASES } from '@data/starTypes';
import {
  mainSequenceLuminosity,
  mainSequenceTemperature,
  mainSequenceRadius,
  mainSequenceLifetime,
} from '@utils/math';

export default class Star extends CelestialBody {
  constructor(config = {}) {
    super({
      ...config,
      type: 'star',
    });

    // Stellar specific properties
    this.initialMass = this.mass;  // Track original mass (mass loss over time)
    this.coreMass = config.coreMass || this.mass * 0.1;
    this.coreTemperature = config.coreTemperature || this.estimateCoreTemp();
    this.spectralClass = this.calculateSpectralClass();
    this.phase = config.phase || EVOLUTION_PHASES.MAIN_SEQUENCE;

    // Evolution tracking
    this.mainSequenceLifetime = mainSequenceLifetime(this.initialMass);
    this.evolutionProgress = config.evolutionProgress || 0; // 0 to 1 within current phase
    this.fusionElement = 'hydrogen'; // What's currently fusing

    // Activity
    this.flareActivity = config.flareActivity || 0.5; // 0 to 1
    this.magneticFieldStrength = config.magneticFieldStrength || 1.0;
    this.windStrength = config.windStrength || 1.0;
    this.massLossRate = 0; // solar masses per year

    // If initial values not specified, calculate from mass
    if (!config.luminosity) {
      this.luminosity = mainSequenceLuminosity(this.mass);
    }
    if (!config.temperature) {
      this.temperature = mainSequenceTemperature(this.mass);
    }
    if (!config.radius) {
      this.radius = mainSequenceRadius(this.mass);
    }

    this.spectralClass = this.calculateSpectralClass();
  }

  /**
   * Estimate core temperature from mass
   */
  estimateCoreTemp() {
    // Rough approximation: T_core ~ 15 million K * (M/M_sun)
    return 1.5e7 * this.mass;
  }

  /**
   * Calculate spectral classification from surface temperature
   */
  calculateSpectralClass() {
    const T = this.temperature;
    if (T >= 30000) return 'O';
    if (T >= 10000) return 'B';
    if (T >= 7500) return 'A';
    if (T >= 6000) return 'F';
    if (T >= 5200) return 'G';
    if (T >= 3700) return 'K';
    return 'M';
  }

  /**
   * Get habitable zone boundaries (in AU)
   */
  getHabitableZone() {
    const inner = Math.sqrt(this.luminosity / 1.1);  // ~1.1 solar flux
    const outer = Math.sqrt(this.luminosity / 0.53); // ~0.53 solar flux
    return { inner, outer };
  }

  /**
   * Update star for one time step, including evolution
   * NOTE: Position/velocity are handled by GravitySystem.
   * This is called via evolve() from GravitySystem.step()
   */
  update(dt) {
    // Don't call super.update() - GravitySystem handles position/velocity
    if (!this.alive) return;

    this.evolve(dt);
    this.spectralClass = this.calculateSpectralClass();
  }

  /**
   * Handle stellar evolution based on mass and age
   * All phase durations and target properties are physically motivated.
   * Uses progress-based interpolation for numerical stability at any dt.
   */
  evolve(dt) {
    const ageRatio = this.age / this.mainSequenceLifetime;

    switch (this.phase) {
      case EVOLUTION_PHASES.MAIN_SEQUENCE:
        this.evolveMainSequence(dt, ageRatio);
        break;
      case EVOLUTION_PHASES.SUBGIANT:
        this.evolveSubgiant(dt);
        break;
      case EVOLUTION_PHASES.RED_GIANT:
        this.evolveRedGiant(dt);
        break;
      case EVOLUTION_PHASES.RED_SUPERGIANT:
        this.evolveRedSupergiant(dt);
        break;
      case EVOLUTION_PHASES.WHITE_DWARF:
        this.evolveWhiteDwarf(dt);
        break;
      case EVOLUTION_PHASES.NEUTRON_STAR:
        this.evolveNeutronStar(dt);
        break;
      default:
        break;
    }

    // Apply mass loss (use exponential decay for stability at large dt)
    if (this.massLossRate > 0) {
      const fractionalRate = this.massLossRate / this.mass;
      this.mass *= Math.exp(-fractionalRate * dt);
      if (this.mass < 0.01) this.mass = 0.01;
    }

    // Apply and decay temporary luminosity boost (merger flash, etc.)
    this.tickLuminosityBoost(dt);

    // Always update spectral class (critical: this was missing before)
    this.spectralClass = this.calculateSpectralClass();
  }

  /**
   * Main sequence evolution
   * Physically: star gradually brightens and swells as core H → He
   * Sun brightens ~30% over 10 Gyr, radius grows ~10%
   */
  evolveMainSequence(dt, ageRatio) {
    if (ageRatio >= 1.0) {
      // Leave main sequence
      this.logEvent({
        type: 'phase_change',
        message: `${this.name} is leaving the main sequence!`,
      });

      if (this.initialMass < 0.5) {
        // Very low mass stars become helium white dwarfs directly
        this.transitionTo(EVOLUTION_PHASES.WHITE_DWARF);
      } else if (this.initialMass < 8) {
        this.transitionTo(EVOLUTION_PHASES.SUBGIANT);
      } else {
        // Massive stars go to supergiant
        this.transitionTo(EVOLUTION_PHASES.RED_SUPERGIANT);
      }
      return;
    }

    // Gradual brightening on main sequence
    const factor = 1 + 0.3 * ageRatio;
    this.luminosity = mainSequenceLuminosity(this.initialMass) * factor;
    this.radius = mainSequenceRadius(this.initialMass) * (1 + 0.1 * ageRatio);
    this.temperature = mainSequenceTemperature(this.initialMass)
      * Math.pow(factor / Math.pow(1 + 0.1 * ageRatio, 2), 0.25);

    // Small mass loss via stellar wind
    this.massLossRate = 1e-14 * Math.pow(this.luminosity, 1.5);
    this.fusionElement = 'hydrogen';
  }

  /**
   * Subgiant phase - shell hydrogen burning, core contracting
   * Duration: ~5% of main sequence lifetime
   * Star expands to ~5x, cools to ~4800K, luminosity rises to ~10x
   */
  evolveSubgiant(dt) {
    const phaseDuration = this.mainSequenceLifetime * 0.05;
    this.evolutionProgress = Math.min(this.evolutionProgress + dt / phaseDuration, 1.0);
    const t = this.evolutionProgress; // 0 → 1 through phase

    // Smooth interpolation using ease function
    const ease = t * t * (3 - 2 * t); // smoothstep

    // Target properties at end of subgiant phase
    const msRadius = mainSequenceRadius(this.initialMass);
    const msTemp = mainSequenceTemperature(this.initialMass);
    const msLum = mainSequenceLuminosity(this.initialMass);

    this.radius = msRadius * (1.1 + ease * 3.9);       // 1.1 → 5 R_ms
    this.temperature = msTemp * (1.0 - ease * 0.2);      // → 80% of MS temp
    this.luminosity = msLum * (1.3 + ease * 8.7);        // 1.3 → 10 L_ms
    this.fusionElement = 'hydrogen (shell)';
    this.massLossRate = 1e-11 * this.luminosity;

    if (this.evolutionProgress >= 1.0) {
      this.transitionTo(EVOLUTION_PHASES.RED_GIANT);
    }
  }

  /**
   * Red giant phase - helium core flash, deep convective envelope
   * Duration: ~10% of main sequence lifetime
   * Star expands to ~100-200 R☉ (for 1 M☉), cools to ~3500K
   * Luminosity reaches ~1000-3000 L☉
   */
  evolveRedGiant(dt) {
    const phaseDuration = this.mainSequenceLifetime * 0.1;
    this.evolutionProgress = Math.min(this.evolutionProgress + dt / phaseDuration, 1.0);
    const t = this.evolutionProgress;
    const ease = t * t * (3 - 2 * t);

    // Physical target properties for red giant tip
    // Radius scales roughly as M^0.5 * 150 (in solar radii)
    const targetRadius = Math.max(50, this.initialMass * 100);
    const targetTemp = 3500;                // Cool red surface
    const targetLum = Math.pow(targetRadius, 2) * Math.pow(targetTemp / 5778, 4);

    // Starting from subgiant end-state
    const startRadius = mainSequenceRadius(this.initialMass) * 5;
    const startTemp = mainSequenceTemperature(this.initialMass) * 0.8;
    const startLum = mainSequenceLuminosity(this.initialMass) * 10;

    this.radius = startRadius + (targetRadius - startRadius) * ease;
    this.temperature = startTemp + (targetTemp - startTemp) * ease;
    this.luminosity = startLum + (targetLum - startLum) * ease;
    this.fusionElement = t < 0.5 ? 'helium (flash)' : 'helium';
    this.massLossRate = 1e-8 * Math.pow(this.luminosity / 1000, 1.5);

    if (this.evolutionProgress >= 1.0) {
      if (this.initialMass < 8) {
        this.logEvent({
          type: 'phase_change',
          message: `${this.name} is shedding its outer layers as a planetary nebula!`,
        });
        this.transitionTo(EVOLUTION_PHASES.WHITE_DWARF);
      }
    }
  }

  /**
   * Red supergiant phase (massive stars, M > 8 M☉)
   * Duration: ~1% of main sequence lifetime (very short!)
   * Star expands to 500-1500 R☉, cools to ~3200K
   * Fuses progressively heavier elements until iron core collapse
   */
  evolveRedSupergiant(dt) {
    const phaseDuration = this.mainSequenceLifetime * 0.01;
    this.evolutionProgress = Math.min(this.evolutionProgress + dt / phaseDuration, 1.0);
    const t = this.evolutionProgress;
    const ease = t * t * (3 - 2 * t);

    // Target properties: massive red supergiant
    const targetRadius = 200 + this.initialMass * 50; // 600-2200 for 8-40 M☉
    const targetTemp = 3200;
    const targetLum = Math.pow(targetRadius, 2) * Math.pow(targetTemp / 5778, 4);

    const startRadius = mainSequenceRadius(this.initialMass) * 2;
    const startTemp = mainSequenceTemperature(this.initialMass) * 0.7;
    const startLum = mainSequenceLuminosity(this.initialMass) * 3;

    this.radius = startRadius + (targetRadius - startRadius) * ease;
    this.temperature = startTemp + (targetTemp - startTemp) * ease;
    this.luminosity = startLum + (targetLum - startLum) * ease;
    this.massLossRate = 1e-5;

    // Progressive fusion elements (onion shell model)
    if (t < 0.3) this.fusionElement = 'carbon';
    else if (t < 0.5) this.fusionElement = 'neon';
    else if (t < 0.7) this.fusionElement = 'oxygen';
    else this.fusionElement = 'silicon → iron';

    if (this.evolutionProgress >= 1.0) {
      this.triggerSupernova();
    }
  }

  /**
   * White dwarf cooling (Mestel cooling law)
   * Temperature drops as t^(-2/5) approximately
   * No nuclear fusion, just thermal cooling of degenerate carbon/oxygen core
   */
  evolveWhiteDwarf(dt) {
    // Exponential cooling with timescale ~1 billion years
    this.temperature *= Math.exp(-dt / 1e9);
    this.temperature = Math.max(this.temperature, 3);  // CMB floor
    this.luminosity = Math.pow(this.radius, 2) * Math.pow(this.temperature / 5778, 4);
    this.massLossRate = 0;
    this.fusionElement = 'none (degenerate matter)';
  }

  /**
   * Neutron star evolution
   * Rapid cooling via neutrino emission, magnetic braking spins it down
   */
  evolveNeutronStar(dt) {
    this.temperature *= Math.exp(-dt / 1e6); // Faster cooling than WD
    this.temperature = Math.max(this.temperature, 3);
    this.rotationSpeed *= Math.exp(-dt / 1e7); // Spin down
    this.luminosity = Math.pow(this.radius, 2) * Math.pow(this.temperature / 5778, 4);
    this.fusionElement = 'none (neutron degeneracy)';
  }

  /**
   * Transition to a new evolutionary phase
   */
  transitionTo(newPhase) {
    const oldPhase = this.phase;
    this.phase = newPhase;
    this.evolutionProgress = 0;
    this.massLossRate = 0; // Reset: each phase sets its own rate

    // Store transition for external detection
    this._lastPhaseChange = {
      oldPhase,
      newPhase,
      time: this.age,
    };

    this.logEvent({
      type: 'phase_change',
      message: `${this.name} transitioned from ${oldPhase} to ${newPhase}`,
      oldPhase,
      newPhase,
    });

    // Set initial properties for new phase
    switch (newPhase) {
      case EVOLUTION_PHASES.SUBGIANT:
        this.fusionElement = 'hydrogen (shell)';
        break;

      case EVOLUTION_PHASES.RED_GIANT:
        this.fusionElement = 'helium';
        break;

      case EVOLUTION_PHASES.RED_SUPERGIANT:
        this.fusionElement = 'carbon';
        break;

      case EVOLUTION_PHASES.WHITE_DWARF:
        this.mass = Math.min(this.mass * 0.55, 1.4);
        this.radius = 0.01;
        this.temperature = 100000;
        this.luminosity = Math.pow(this.radius, 2) * Math.pow(this.temperature / 5778, 4);
        this.fusionElement = 'none (degenerate C/O)';
        this.coreTemperature = 1e7;
        break;

      case EVOLUTION_PHASES.NEUTRON_STAR:
        this.mass = Math.min(Math.max(this.mass * 0.15, 1.1), 2.5);
        this.radius = 0.000015;
        this.temperature = 600000;
        this.luminosity = Math.pow(this.radius, 2) * Math.pow(this.temperature / 5778, 4);
        this.rotationSpeed = 100;
        this.fusionElement = 'none (neutron degeneracy)';
        this.magneticFieldStrength = 1e8;
        break;

      case EVOLUTION_PHASES.BLACK_HOLE:
        this.type = 'black_hole';
        this.radius = 0;
        this.temperature = 0;
        this.luminosity = 0;
        this.fusionElement = 'singularity';
        break;
    }
  }

  /**
   * Trigger a supernova explosion.
   * Sets _pendingExplosion so SimEngine can propagate catastrophe effects
   * and generate VFX events after this step completes.
   */
  triggerSupernova() {
    const progenitorMass = this.mass;
    const ejectaMass     = progenitorMass * 0.7;
    const remnantCoreMass = progenitorMass * 0.3;

    this.logEvent({
      type: 'supernova',
      message: `${this.name} has gone SUPERNOVA! (${progenitorMass.toFixed(2)} M☉ progenitor)`,
      severity: 'catastrophic',
    });

    // Transition the star to its compact remnant
    if (remnantCoreMass < 3) {
      this.transitionTo(EVOLUTION_PHASES.NEUTRON_STAR);
    } else {
      this.transitionTo(EVOLUTION_PHASES.BLACK_HOLE);
    }

    // Store explosion payload — SimEngine reads and processes this each frame
    this._pendingExplosion = {
      type: 'supernova',
      sourceId: this.id,
      progenitorMass,
      ejectaMass,
      // Kinetic energy of ejecta in sim units (M☉·(AU/yr)²)
      // ~10⁴⁴ J ≈ 6.3 M☉·(AU/yr)² — we store a gameplay-scaled version
      energy: progenitorMass * 6.3,
      position: this.position.clone(),
      remnantType: this.phase,
      shockwaveRadius: 80 + progenitorMass * 5,
      // Normalised radiation burst (higher → more damage to planets)
      radiationBurst: progenitorMass * 5000,
      duration: 8.0,
    };

    return this._pendingExplosion;
  }

  /**
   * Apply and decay temporary luminosity boost (e.g. after stellar merger flash).
   * Stores the pre-boost base luminosity and restores it on expiry.
   * @param {number} dt years
   */
  tickLuminosityBoost(dt) {
    if (!this._luminosityBoost) return;
    const b = this._luminosityBoost;

    // First call: snapshot base luminosity
    if (b.baseLuminosity === undefined) {
      b.baseLuminosity = this.luminosity / b.factor;
    }

    // Decay factor
    b.factor = 1.0 + (b.factor - 1.0) * Math.exp(-b.decayRate * dt);

    if (b.factor < 1.001) {
      // Restore base luminosity and remove boost
      this.luminosity     = b.baseLuminosity;
      this._luminosityBoost = null;
    } else {
      // Apply boosted luminosity from base
      this.luminosity = b.baseLuminosity * b.factor;
    }
  }

  /**
   * Get detailed properties for info panel
   */
  getProperties() {
    const base = super.getProperties();
    return {
      ...base,
      spectralClass: this.spectralClass,
      coreTemperature: { value: this.coreTemperature, unit: 'K' },
      fusionElement: this.fusionElement,
      mainSequenceLifetime: { value: this.mainSequenceLifetime, unit: 'years' },
      evolutionProgress: (this.evolutionProgress * 100).toFixed(1) + '%',
      habitableZone: this.getHabitableZone(),
      flareActivity: this.flareActivity,
      massLossRate: { value: this.massLossRate, unit: 'M☉/yr' },
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      initialMass: this.initialMass,
      coreTemperature: this.coreTemperature,
      spectralClass: this.spectralClass,
      evolutionProgress: this.evolutionProgress,
      fusionElement: this.fusionElement,
      flareActivity: this.flareActivity,
    };
  }

  static fromJSON(data) {
    const pos = data.position || {};
    const vel = data.velocity || {};
    return new Star({
      ...data,
      position: { x: pos.x ?? 0, y: pos.y ?? 0, z: pos.z ?? 0 },
      velocity: { x: vel.x ?? 0, y: vel.y ?? 0, z: vel.z ?? 0 },
    });
  }
}

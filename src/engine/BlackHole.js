/**
 * BlackHole - Singularity with event horizon and accretion physics
 * Handles gravitational lensing parameters, accretion disk, Hawking radiation
 */
import CelestialBody from './CelestialBody.js';
import { schwarzschildRadius } from '@utils/math';

export default class BlackHole extends CelestialBody {
  constructor(config = {}) {
    super({
      ...config,
      type: 'black_hole',
      temperature: 0,
      luminosity: 0,
    });

    // Black hole specific properties
    this.spin = config.spin || 0.5;                // Kerr parameter a* (0 to ~0.998)
    this.accretionRate = config.accretionRate || 0; // M☉ per year
    this.charge = 0;                                // Reissner-Nordström (usually 0)

    // Derived properties
    this.schwarzschildRadius = schwarzschildRadius(this.mass);
    this.eventHorizonRadius = this.calculateEventHorizon();
    this.innerMostStableOrbit = this.calculateISCO();
    this.photonSphereRadius = 1.5 * this.schwarzschildRadius;

    // Accretion disk
    this.accretionDisk = {
      innerRadius: this.innerMostStableOrbit,
      outerRadius: this.schwarzschildRadius * 50,
      temperature: this.calculateDiskTemperature(),
      luminosity: this.calculateAccretionLuminosity(),
    };

    // Hawking radiation (negligible for stellar mass, but fun to track)
    this.hawkingTemperature = this.calculateHawkingTemp();
    this.evaporationTime = this.calculateEvaporationTime();

    // Jets (if accreting and spinning)
    this.hasJets = this.spin > 0.3 && this.accretionRate > 0;
    this.jetPower = this.calculateJetPower();

    // Visual parameters
    this.lensStrength = this.mass; // Gravitational lensing strength
  }

  /**
   * Calculate event horizon radius (Kerr metric)
   * r+ = r_s/2 * (1 + sqrt(1 - a*²))
   */
  calculateEventHorizon() {
    const rs = this.schwarzschildRadius;
    return (rs / 2) * (1 + Math.sqrt(1 - this.spin * this.spin));
  }

  /**
   * Innermost Stable Circular Orbit (ISCO)
   * For Schwarzschild (a*=0): 3 r_s
   * For extreme Kerr (a*=1, prograde): r_s/2
   */
  calculateISCO() {
    const rs = this.schwarzschildRadius;
    // Simplified interpolation
    return rs * (3 - 2.5 * this.spin);
  }

  /**
   * Accretion disk peak temperature
   */
  calculateDiskTemperature() {
    if (this.accretionRate <= 0) return 0;
    // T ~ 10^7 K * (M_dot / M_sun/yr)^0.25 * (M / M_sun)^-0.25
    return 1e7 * Math.pow(this.accretionRate, 0.25) * Math.pow(this.mass, -0.25);
  }

  /**
   * Accretion luminosity (L = η Mdot c²)
   */
  calculateAccretionLuminosity() {
    // Efficiency η depends on spin (0.06 for Schwarzschild, up to 0.42 for Kerr)
    const eta = 0.06 + 0.36 * this.spin;
    // In solar luminosities: L = eta * Mdot * c² / L_sun
    const c2 = 9e16;            // m²/s²
    const Msun = 1.989e30;      // kg
    const Lsun = 3.828e26;      // W
    return eta * this.accretionRate * Msun * c2 / (Lsun * 3.154e7); // per year → per second
  }

  /**
   * Hawking temperature
   * T_H = ℏc³ / (8πGMk_B) ≈ 6.17e-8 / M_sun K
   */
  calculateHawkingTemp() {
    return 6.17e-8 / this.mass;
  }

  /**
   * Evaporation time via Hawking radiation (years)
   * t_ev ≈ 5120 π G² M³ / (ℏ c⁴)
   */
  calculateEvaporationTime() {
    // In years: ~ 2.1e67 * (M / M_sun)³ years
    return 2.1e67 * Math.pow(this.mass, 3);
  }

  /**
   * Jet power (Blandford-Znajek mechanism)
   */
  calculateJetPower() {
    if (!this.hasJets) return 0;
    // Simplified: P_jet ~ spin² * Mdot * c²
    return this.spin * this.spin * this.accretionRate * 1e45; // Watts (order of magnitude)
  }

  /**
   * Check if a body at given distance is within the tidal disruption radius
   */
  tidalDisruptionRadius(bodyRadius, bodyMass) {
    // r_t ≈ R_body * (M_bh / M_body)^(1/3)
    return bodyRadius * Math.pow(this.mass / bodyMass, 1 / 3);
  }

  /**
   * Called by GravitySystem after Verlet integration.
   * Handles BH-specific evolution (accretion, derived properties).
   * Position/velocity/age/rotation/trail are already handled by GravitySystem.
   */
  evolve(dt) {
    if (!this.alive) return;

    // Accrete mass
    if (this.accretionRate > 0) {
      this.mass += this.accretionRate * dt;
    }

    // Update derived properties
    this.schwarzschildRadius = schwarzschildRadius(this.mass);
    this.eventHorizonRadius = this.calculateEventHorizon();
    this.innerMostStableOrbit = this.calculateISCO();
    this.photonSphereRadius = 1.5 * this.schwarzschildRadius;

    // Update accretion disk
    this.accretionDisk.innerRadius = this.innerMostStableOrbit;
    this.accretionDisk.outerRadius = this.schwarzschildRadius * 50;
    this.accretionDisk.temperature = this.calculateDiskTemperature();
    this.accretionDisk.luminosity = this.calculateAccretionLuminosity();

    // Update jets
    this.hasJets = this.spin > 0.3 && this.accretionRate > 0;
    this.jetPower = this.calculateJetPower();

    // Luminosity comes from accretion disk
    this.luminosity = this.accretionDisk.luminosity;

    // Hawking radiation: mass loss dM/dt = -ℏc⁴/(15360πG²M²)
    // In solar units: dM/dt ≈ -5.34e-67 / M² (M☉/yr)
    // For primordial BHs (M << 1 M☉), this is significant
    this.hawkingTemperature = this.calculateHawkingTemp();
    const hawkingLossRate = 5.34e-67 / (this.mass * this.mass);
    const netLoss = hawkingLossRate * dt;
    if (netLoss > 0 && netLoss < this.mass) {
      this.mass -= netLoss;
      this.hawkingLuminosity = hawkingLossRate;
      if (this.mass < 1e-10) {
        this.logEvent({
          type: 'hawking_evaporation',
          message: `${this.name} has completely evaporated via Hawking radiation!`,
          severity: 'catastrophic',
        });
        this._pendingExplosion = {
          type: 'hawking_burst',
          sourceId: this.id,
          progenitorMass: this.mass,
          ejectaMass: this.mass,
          energy: this.mass * 20,
          position: this.position.clone(),
          remnantType: 'none',
          shockwaveRadius: 10,
          radiationBurst: this.mass * 1e6,
          duration: 0.5,
        };
        this.alive = false;
      }
    } else {
      this.hawkingLuminosity = hawkingLossRate;
    }
    this.evaporationTime = this.calculateEvaporationTime();
  }

  /**
   * Get detailed properties for info panel
   */
  getProperties() {
    const base = super.getProperties();
    return {
      ...base,
      schwarzschildRadius: { value: this.schwarzschildRadius, unit: 'AU' },
      eventHorizon: { value: this.eventHorizonRadius, unit: 'AU' },
      spin: { value: this.spin, unit: 'a*' },
      ISCO: { value: this.innerMostStableOrbit, unit: 'AU' },
      photonSphere: { value: this.photonSphereRadius, unit: 'AU' },
      accretionRate: { value: this.accretionRate, unit: 'M☉/yr' },
      accretionDisk: {
        temperature: { value: this.accretionDisk.temperature, unit: 'K' },
        luminosity: { value: this.accretionDisk.luminosity, unit: 'L☉' },
      },
      hawkingTemperature: { value: this.hawkingTemperature, unit: 'K' },
      hawkingLuminosity: { value: this.hawkingLuminosity || 0, unit: 'M☉/yr' },
      evaporationTime: { value: this.evaporationTime, unit: 'years' },
      hasJets: this.hasJets,
      jetPower: this.hasJets ? { value: this.jetPower, unit: 'W' } : 'N/A',
    };
  }

  static fromJSON(data) {
    const pos = data.position || {};
    const vel = data.velocity || {};
    return new BlackHole({
      ...data,
      position: { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 },
      velocity: { x: vel.x || 0, y: vel.y || 0, z: vel.z || 0 },
    });
  }
}

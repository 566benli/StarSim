/**
 * Universe - Top-level container for the entire simulation.
 * Contains clusters, star systems, and tracks global state.
 * Universe coordinates are in Mly (million lightyears).
 * A circular boundary destroys objects that reach the edge.
 */
import * as THREE from 'three';
import Cluster from './Cluster.js';
import StarSystem from './StarSystem.js';
import { PRIMORDIAL_COMPOSITION } from '@data/elements';
import { UNIVERSE_RADIUS_MLY } from '@utils/constants';
import { generateId } from '@utils/helpers';

export default class Universe {
  constructor(config = {}) {
    this.clusters = [];
    this.systems = [];
    this.nebulas = [];

    this._initialBoundaryRadius = config.boundaryRadius || UNIVERSE_RADIUS_MLY;
    this.boundaryRadius = this._initialBoundaryRadius;
    this.age = 0;

    this.composition = { ...PRIMORDIAL_COMPOSITION };
    this.totalMass = 0;

    // ── Cosmological parameters ──────────────────────────────────────────────
    // Omega (Ω): matter density relative to critical density.
    //   < 1 → open (expands forever)   = 1 → flat   > 1 → closed (Big Crunch)
    this.omega = config.omega ?? 1.0;
    // Normalised Hubble parameter (Gyr⁻¹).  0.07 ≈ H₀ ≈ 70 km/s/Mpc converted.
    this.hubbleParam = config.hubbleParam ?? 0.07;
    // Scale factor a(t).  a = 1 at the start of the simulation.
    this.scaleFactor = config.scaleFactor ?? 1.0;
    // Cosmic background temperature (K).  Starts ~2.7 K (present-day CMB) unless
    // the user starts in an earlier epoch via a higher initialTemperature.
    this._initialTemperature = config.cosmicTemperature ?? 2.7;
    this.cosmicTemperature = this._initialTemperature;
    // Phase derived from temperature (updated each step by updateCosmology).
    // 'plasma' → 'recombination' → 'stellarEra' → 'metalRich'
    this.nucleosynthesisPhase = config.nucleosynthesisPhase ?? 'stellarEra';
    // Set to true by updateCosmology when a closed universe re-collapses.
    this._bigCrunch = false;
    // Previous dadt sign — used to detect turnaround in closed universes.
    this._prevDadt = 1;

    this.stats = {
      clusterCount: 0,
      systemCount: 0,
      starCount: 0,
      planetCount: 0,
      blackHoleCount: 0,
      totalBodies: 0,
    };
  }

  addCluster(cluster) {
    this.clusters.push(cluster);
    return cluster;
  }

  removeCluster(id) {
    this.clusters = this.clusters.filter(c => c.id !== id);
  }

  getCluster(id) {
    return this.clusters.find(c => c.id === id);
  }

  addSystem(system) {
    this.systems.push(system);
    return system;
  }

  removeSystem(id) {
    this.systems = this.systems.filter(s => s.id !== id);
  }

  getSystem(id) {
    return this.systems.find(s => s.id === id);
  }

  getSystemsForCluster(clusterId) {
    return this.systems.filter(s => s.clusterId === clusterId);
  }

  // ── Nebula management ───────────────────────────────────────────────────────

  addNebula(config = {}) {
    const nebula = {
      id: config.id || generateId(),
      name: config.name || `Nebula ${this.nebulas.length + 1}`,
      type: config.type || 'emission',          // emission | reflection | dark | planetary
      position: config.position ? { ...config.position } : { x: 0, y: 0, z: 0 },
      velocity: config.velocity ? { ...config.velocity } : { x: 0, y: 0, z: 0 },
      radius: config.radius ?? (3 + Math.random() * 8),  // Mly
      gasMass: config.gasMass ?? 1.0,           // 0–1, depletes as stars form
      birthRate: config.birthRate ?? 0.3,       // stars per Gyr
      birthCooldown: config.birthCooldown ?? 5e8, // years between births
      lastStarBirthTime: config.lastStarBirthTime ?? 0,
      color: config.color || '#cc88ff',
      alive: true,
    };
    this.nebulas.push(nebula);
    return nebula;
  }

  removeNebula(id) {
    this.nebulas = this.nebulas.filter(n => n.id !== id);
  }

  /** Drift nebulas slowly and let them age */
  updateNebulas(dtYears) {
    const dtMly = dtYears / 1e6;
    for (const neb of this.nebulas) {
      if (!neb.alive) continue;
      neb.position.x += neb.velocity.x * dtMly;
      neb.position.y += neb.velocity.y * dtMly;
      neb.position.z += neb.velocity.z * dtMly;
      // Boundary check: remove exhausted or out-of-bounds nebulas
      const dist = Math.sqrt(neb.position.x ** 2 + neb.position.y ** 2 + neb.position.z ** 2);
      if (dist > this.boundaryRadius || neb.gasMass <= 0) {
        neb.alive = false;
      }
    }
    this.nebulas = this.nebulas.filter(n => n.alive);
  }

  // ── Cosmological model ───────────────────────────────────────────────────────

  /**
   * Advance the cosmological scale factor by dtYears.
   * Uses a simplified Friedmann equation (matter-dominated):
   *   da/dt = H₀ · sqrt( Ω/a + (1 − Ω) )
   *
   * Effects:
   *  - boundaryRadius scales with a(t)
   *  - cosmicTemperature ∝ 1/a
   *  - nucleosynthesisPhase updated from T
   *  - _bigCrunch flag set when Ω > 1 and universe re-collapses
   */
  updateCosmology(dtYears) {
    const dtGyr = dtYears / 1e9;
    if (dtGyr <= 0) return;

    const a = this.scaleFactor;
    const inner = this.omega / a + (1 - this.omega);
    const dadt = this.hubbleParam * Math.sqrt(Math.max(0, inner));
    const newA = Math.max(0.01, a + dadt * dtGyr);

    this.scaleFactor = newA;
    this.boundaryRadius = this._initialBoundaryRadius * newA;
    // Temperature falls as universe expands (T ∝ 1/a)
    this.cosmicTemperature = this._initialTemperature / newA;

    // Nucleosynthesis phase from temperature
    const T = this.cosmicTemperature;
    if (T > 3000)          this.nucleosynthesisPhase = 'plasma';
    else if (T > 300)      this.nucleosynthesisPhase = 'recombination';
    else if (T > 10)       this.nucleosynthesisPhase = 'stellarEra';
    else                   this.nucleosynthesisPhase = 'metalRich';

    // Detect turnaround → Big Crunch for closed universes
    if (this.omega > 1 && dadt <= 0 && this._prevDadt > 0) {
      // Universe has started contracting
    }
    if (this.omega > 1 && newA <= 0.05 && dadt <= 0) {
      this._bigCrunch = true;
    }
    this._prevDadt = dadt;
  }

  /**
   * Star-formation multiplier based on cosmological phase.
   *  plasma       → 0 (too hot, no stars possible)
   *  recombination→ 0.1–0.5 (first stars possible, ramping up)
   *  stellarEra   → 1.0 (full rate)
   *  metalRich    → 1.5 (enhanced by metals)
   */
  formationRateMultiplier() {
    switch (this.nucleosynthesisPhase) {
      case 'plasma':        return 0;
      case 'recombination': return 0.3;
      case 'stellarEra':    return 1.0;
      case 'metalRich':     return 1.5;
      default:              return 1.0;
    }
  }

  /**
   * Update universe-level physics: clusters orbit each other
   * Uses simple gravitational attraction between cluster centers of mass.
   * G_universe is scaled for Mly / solar-mass / Gyr units.
   */
  updateClusterPhysics(dt) {
    const n = this.clusters.length;
    if (n < 2) return;

    const G_univ = 4.5e-6; // tuned constant for Mly-scale, makes clusters orbit slowly
    const softening = 0.5; // Mly softening

    for (let i = 0; i < n; i++) {
      const ci = this.clusters[i];
      if (!ci.alive) continue;

      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const cj = this.clusters[j];
        if (!cj.alive) continue;

        const dx = cj.position.x - ci.position.x;
        const dy = cj.position.y - ci.position.y;
        const dz = cj.position.z - ci.position.z;
        const distSq = dx * dx + dy * dy + dz * dz + softening * softening;
        const dist = Math.sqrt(distSq);
        const force = G_univ * cj.totalMass / (distSq * dist);

        ax += dx * force;
        ay += dy * force;
        az += dz * force;
      }

      ci.velocity.x += ax * dt;
      ci.velocity.y += ay * dt;
      ci.velocity.z += az * dt;
    }

    for (const cluster of this.clusters) {
      if (!cluster.alive) continue;
      cluster.position.addScaledVector(cluster.velocity, dt);
      cluster.rotationAngle += cluster.angularVelocity * dt;

      // Boundary check — bounce back elastically so clusters NEVER disappear
      const dist = cluster.position.length();
      if (dist > 0 && dist > this.boundaryRadius * 0.92) {
        // Inward unit normal
        const nx = cluster.position.x / dist;
        const ny = cluster.position.y / dist;
        const nz = cluster.position.z / dist;
        // Reflect outward radial velocity component
        const vr = cluster.velocity.x * nx + cluster.velocity.y * ny + cluster.velocity.z * nz;
        if (vr > 0) {
          // Damped elastic reflection (coefficient 0.6) so it doesn't just bounce forever
          cluster.velocity.x -= 1.6 * vr * nx;
          cluster.velocity.y -= 1.6 * vr * ny;
          cluster.velocity.z -= 1.6 * vr * nz;
        }
        // Clamp position strictly inside boundary
        if (dist > this.boundaryRadius) {
          const scale = this.boundaryRadius * 0.9 / dist;
          cluster.position.x *= scale;
          cluster.position.y *= scale;
          cluster.position.z *= scale;
        }
      }
    }
  }

  /**
   * Evolve the universe's primordial composition over time.
   * As stars form and die, elements heavier than H/He accumulate.
   * dt is in simulation years.
   */
  evolveComposition(dt, allBodies) {
    if (dt <= 0) return;
    const dtMyr = dt / 1e6;
    if (dtMyr < 1e-12) return;

    const aliveBodies = allBodies.filter(b => b.alive);
    const starCount = aliveBodies.filter(b => b.type === 'star').length;

    if (starCount > 0) {
      const enrichRate = Math.min(starCount * 0.0002 * dtMyr, 0.01);
      const elements = ['C', 'N', 'O', 'Ne', 'Si', 'Fe', 'Mg', 'S'];
      let totalAdded = 0;
      for (const el of elements) {
        const add = enrichRate * (0.5 + Math.random() * 0.5) / elements.length;
        this.composition[el] = (this.composition[el] || 0) + add;
        totalAdded += add;
      }
      if (this.composition.H > 0.1) {
        this.composition.H = Math.max(0.1, (this.composition.H || 0.75) - totalAdded * 0.8);
      }
      if (this.composition.He > 0.05) {
        this.composition.He = Math.max(0.05, (this.composition.He || 0.25) - totalAdded * 0.2);
      }
    }

    const total = Object.values(this.composition).reduce((s, v) => s + v, 0);
    if (total > 0 && Math.abs(total - 1) > 1e-6) {
      for (const k of Object.keys(this.composition)) {
        this.composition[k] /= total;
      }
    }
  }

  /**
   * Check if conditions allow forming a new star/cluster from primordial gas.
   * Returns true when universe is old enough and has sufficient H/He.
   * SimEngine calls this and creates structure.
   */
  canFormFromGas() {
    // Cosmological phase gate: no formation during plasma era
    if (this.nucleosynthesisPhase === 'plasma') return false;
    const h = this.composition.H || 0;
    const he = this.composition.He || 0;
    const totalPrimordial = h + he;
    if (totalPrimordial < 0.5) return false;
    const ageGyr = this.age / 1e9;
    const formationInterval = 2; // Form every ~2 Gyr when conditions met
    const lastForm = this._lastFormAge || 0;
    if (ageGyr - lastForm < formationInterval) return false;
    if (this.clusters.filter(c => c.alive).length >= 20) return false;
    return true;
  }

  /** Mark that formation occurred (call after SimEngine creates structure) */
  markFormed() {
    this._lastFormAge = this.age / 1e9;
  }

  /**
   * Update global statistics
   */
  updateStats(allBodies) {
    const alive = allBodies.filter(b => b.alive);
    this.stats.totalBodies = alive.length;
    this.stats.starCount = alive.filter(b => b.type === 'star').length;
    this.stats.planetCount = alive.filter(b => b.type === 'planet').length;
    this.stats.blackHoleCount = alive.filter(b => b.type === 'black_hole').length;
    this.stats.clusterCount = this.clusters.filter(c => c.alive).length;
    this.stats.systemCount = this.systems.filter(s => s.alive).length;
    this.totalMass = alive.reduce((sum, b) => sum + b.mass, 0);
  }

  toJSON() {
    return {
      clusters: this.clusters.map(c => c.toJSON()),
      systems: this.systems.map(s => s.toJSON()),
      nebulas: this.nebulas.map(n => ({ ...n })),
      boundaryRadius: this._initialBoundaryRadius,
      age: this.age,
      composition: { ...this.composition },
      omega: this.omega,
      hubbleParam: this.hubbleParam,
      scaleFactor: this.scaleFactor,
      cosmicTemperature: this.cosmicTemperature,
      nucleosynthesisPhase: this.nucleosynthesisPhase,
    };
  }

  static fromJSON(data) {
    const u = new Universe({
      boundaryRadius: data.boundaryRadius,
      omega: data.omega,
      hubbleParam: data.hubbleParam,
      scaleFactor: data.scaleFactor,
      cosmicTemperature: data.cosmicTemperature,
      nucleosynthesisPhase: data.nucleosynthesisPhase,
    });
    u.age = data.age || 0;
    u.composition = data.composition || { ...PRIMORDIAL_COMPOSITION };
    if (data.clusters) {
      u.clusters = data.clusters.map(c => Cluster.fromJSON(c));
    }
    if (data.systems) {
      u.systems = data.systems.map(s => StarSystem.fromJSON(s));
    }
    if (data.nebulas) {
      u.nebulas = data.nebulas.map(n => ({ ...n }));
    }
    return u;
  }
}

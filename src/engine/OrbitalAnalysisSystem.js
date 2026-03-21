/**
 * OrbitalAnalysisSystem - Per-body orbital stability and capture analysis
 *
 * For each body, identifies its dominant gravitational influence, computes
 * classical orbital elements (semi-major axis, eccentricity, specific orbital
 * energy), and flags orbits that have become unbound or highly eccentric after
 * major collisions / explosions.
 *
 * Also provides a two-body capture check useful for detecting potential
 * binary formation or slingshot trajectories.
 *
 * Units: AU, M☉, years  →  G = 4π² AU³ yr⁻² M☉⁻¹
 */

import * as THREE from 'three';

const G_SIM = 4 * Math.PI * Math.PI;

export default class OrbitalAnalysisSystem {
  constructor() {
    this.enabled = true;
  }

  /**
   * Analyse the orbit of a single body relative to the most massive/close
   * body in the system.
   *
   * @param {CelestialBody}   body
   * @param {CelestialBody[]} allBodies  All alive bodies (including this one)
   * @returns {OrbitalState|null}
   */
  analyzeBody(body, allBodies) {
    if (!this.enabled) return null;

    // Find the body that exerts the strongest gravitational pull
    let maxPull      = 0;
    let dominant     = null;

    for (const other of allBodies) {
      if (other === body || !other.alive) continue;
      const distSq = body.position.distanceToSquared(other.position);
      if (distSq < 1e-20) continue;
      const pull = G_SIM * other.mass / distSq;
      if (pull > maxPull) { maxPull = pull; dominant = other; }
    }

    if (!dominant) return null;

    const relPos = body.position.clone().sub(dominant.position);
    const relVel = body.velocity.clone().sub(dominant.velocity);
    const r      = relPos.length();
    const v2     = relVel.lengthSq();
    const mu     = G_SIM * (dominant.mass + body.mass);

    // Specific orbital energy (negative → bound)
    const specificEnergy = 0.5 * v2 - mu / r;

    // Semi-major axis (Kepler)
    const sma = specificEnergy < 0 ? -mu / (2 * specificEnergy) : Infinity;

    // Specific angular momentum vector
    const h    = relPos.clone().cross(relVel);
    const hMag = h.length();

    // Eccentricity
    let eccentricity = Infinity;
    if (hMag > 0 && sma > 0 && sma < 1e12) {
      eccentricity = Math.sqrt(Math.max(0, 1 - (hMag * hMag) / (mu * sma)));
    }

    const bound          = specificEnergy < 0;
    const stable         = bound && eccentricity < 1.0 && sma < 1e6;
    const highlyEccentric = eccentricity > 0.9 && eccentricity < 1.5;
    const ejected        = !bound;

    // Hill sphere of dominant body (rough estimate)
    const hillRadius = (dominant.orbitalDistance && dominant.orbitalDistance > 0)
      ? dominant.orbitalDistance * Math.pow(body.mass / (3 * dominant.mass), 1 / 3)
      : Infinity;

    // Write results onto body for easy access
    body.orbitStable    = stable;
    body.orbitalEnergy  = specificEnergy;
    body.eccentricityTracked = eccentricity;

    if (!stable && !ejected && !body._orbitWarned) {
      body._orbitWarned = true;
      body.logEvent({
        type: 'orbit_unstable',
        message: `${body.name}'s orbit has become unstable! (e=${eccentricity.toFixed(2)}, E=${specificEnergy.toFixed(3)})`,
        severity: 'major',
      });
    }
    if (ejected && !body._ejectionWarned) {
      body._ejectionWarned = true;
      body.logEvent({
        type: 'orbit_ejected',
        message: `${body.name} has been ejected from orbit! (hyperbolic trajectory)`,
        severity: 'critical',
      });
    }

    return {
      dominantBodyId: dominant.id,
      semiMajorAxis: sma,
      eccentricity,
      specificEnergy,
      angularMomentum: hMag,
      bound, stable, highlyEccentric, ejected,
      hillRadius,
    };
  }

  /**
   * Analyse all bodies in the system and return per-body orbital states.
   * @param {CelestialBody[]} bodies
   * @returns {Map<string, OrbitalState>}
   */
  analyzeAll(bodies) {
    const results = new Map();
    for (const body of bodies) {
      if (!body.alive) continue;
      const state = this.analyzeBody(body, bodies);
      if (state) results.set(body.id, state);
    }
    return results;
  }

  /**
   * Check whether two bodies could form a gravitationally bound pair.
   * @returns {{ canCapture, specificEnergy, relativeVelocity, escapeVelocity }}
   */
  checkCapture(body1, body2) {
    const relPos = body1.position.clone().sub(body2.position);
    const relVel = body1.velocity.clone().sub(body2.velocity);
    const r      = relPos.length();
    const v2     = relVel.lengthSq();
    const mu     = G_SIM * (body1.mass + body2.mass);

    const specificEnergy = 0.5 * v2 - mu / r;
    return {
      canCapture:       specificEnergy < 0,
      specificEnergy,
      relativeVelocity: Math.sqrt(v2),
      escapeVelocity:   Math.sqrt(2 * mu / r),
    };
  }
}

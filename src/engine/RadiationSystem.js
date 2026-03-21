/**
 * RadiationSystem - Per-body radiation flux computation and biological consequence
 *
 * Computes the total, UV, and X-ray flux received by every planet from every
 * emitting source in the system, then drives:
 *   - aberranceProbability (biological mutation / Layer-3 hook)
 *   - atmospheric loss rate from UV
 *   - temperature modifiers from extreme irradiation
 *
 * Flux units are normalised to "solar constant at 1 AU" for a 1 L☉ star.
 * So a planet at 1 AU from a 1 L☉ star receives flux = 1.0.
 */

import { EVOLUTION_PHASES } from '@data/starTypes';

export default class RadiationSystem {
  constructor() {
    this.enabled = true;
  }

  /**
   * Update radiation exposure for all bodies each simulation step.
   * @param {CelestialBody[]} bodies  All alive bodies in the system
   * @param {number}          dt      Timestep in years
   */
  update(bodies, dt) {
    if (!this.enabled) return;

    // Build emitter list once
    const emitters = bodies.filter(b => b.alive && this._isEmitter(b));

    for (const target of bodies) {
      if (!target.alive) continue;
      if (target.type !== 'planet') continue;

      let totalFlux = 0;
      let uvFlux    = 0;
      let xrayFlux  = 0;

      for (const src of emitters) {
        if (src === target) continue;
        const dist = src.position.distanceTo(target.position);
        if (dist < 1e-8) continue;

        const f = this._getFlux(src, dist);
        totalFlux += f.total;
        uvFlux    += f.uv;
        xrayFlux  += f.xray;
      }

      // Store on body for info-panel / AI access
      target.radiationFlux = totalFlux;
      target.uvFlux        = uvFlux;
      target.xrayFlux      = xrayFlux;

      // Biological aberrance: excess UV/X-ray over a comfortable threshold
      if (target.aberranceProbability !== undefined) {
        const normalFlux = 1.0; // 1 solar constant at 1 AU
        const excessHard = Math.max(0, xrayFlux - normalFlux * 0.001)
                         + Math.max(0, uvFlux   - normalFlux * 0.1);
        const dAberrance = excessHard * dt * 5e-9;
        target.aberranceProbability = Math.min(1.0,
          target.aberranceProbability + dAberrance
        );
      }

      // Atmospheric escape driven by UV
      if (target.atmospherePressure !== undefined && uvFlux > 5) {
        const escapeFactor = (uvFlux - 5) * 1e-11 * dt;
        target.atmospherePressure = Math.max(0, target.atmospherePressure - escapeFactor);
      }

      // Extreme irradiation: surface temperature boost
      if (totalFlux > 50 && target.temperature !== undefined) {
        const radTemp = 278 * Math.pow(totalFlux, 0.25); // naive equilibrium boost
        target.temperature = Math.max(target.temperature, radTemp * 0.5);
      }
    }
  }

  /**
   * Compute the radiation flux at a given distance from a source body.
   * Returns { total, uv, xray } all in normalised solar-constant units.
   */
  _getFlux(src, distAU) {
    let lum  = src.luminosity || 0;
    let temp = src.temperature || 0;

    // Black holes: use accretion disk luminosity
    if (src.type === 'black_hole') {
      lum  = src.accretionDisk?.luminosity || 0;
      temp = src.accretionDisk?.temperature || 0;
    }

    if (lum <= 0) return { total: 0, uv: 0, xray: 0 };

    // 1 L☉ at 1 AU → flux = 1
    const total = lum / (distAU * distAU);

    // UV fraction: hot stars and compact objects emit proportionally more UV
    const uvFraction =
      temp > 20000 ? 0.15 :
      temp > 10000 ? 0.06 :
      temp > 6000  ? 0.015 :
                     0.003;

    // X-ray fraction: high-energy sources (neutron stars, BH accretion disks, O-type stars)
    const phase = src.phase || '';
    const xrayFraction =
      src.type === 'black_hole'                   ? 0.25 :
      (phase === EVOLUTION_PHASES.NEUTRON_STAR || phase === 'neutron_star') ? 0.4 :
      temp > 30000                                 ? 0.02 :
      temp > 15000                                 ? 0.005 :
                                                     0;

    return { total, uv: total * uvFraction, xray: total * xrayFraction };
  }

  _isEmitter(body) {
    return body.luminosity > 0 || body.type === 'black_hole';
  }

  /**
   * Apply a one-shot radiation burst to all planets (e.g. from a supernova or BH accretion).
   * Called by SimEngine after processing catastrophe events.
   *
   * @param {CelestialBody[]} bodies
   * @param {THREE.Vector3}   sourcePos
   * @param {number}          intensity  "normalised" radiation intensity at 1 AU
   */
  applyRadiationBurst(bodies, sourcePos, intensity) {
    for (const body of bodies) {
      if (!body.alive || body.type !== 'planet') continue;
      const dist = body.position.distanceTo(sourcePos);
      if (dist < 0.01) continue;

      const flux = intensity / (dist * dist);

      // Aberrance spike
      if (body.aberranceProbability !== undefined) {
        body.aberranceProbability = Math.min(1.0, body.aberranceProbability + flux * 0.0005);
      }

      // Atmosphere stripping
      if (body.atmospherePressure !== undefined && flux > 50) {
        body.atmospherePressure = Math.max(0, body.atmospherePressure - flux * 0.0002);
      }

      // Biosphere extinction above lethal threshold
      if (body.hasLife && flux > 1e5) {
        body.hasLife = false;
        body.logEvent({
          type: 'biosphere_extinction',
          message: `${body.name}'s biosphere was sterilised by intense radiation burst! (flux=${flux.toFixed(0)})`,
          severity: 'catastrophic',
        });
      } else if (flux > 200) {
        body.logEvent({
          type: 'radiation_exposure',
          message: `${body.name} hit by intense radiation burst (flux=${flux.toFixed(0)}).`,
          severity: flux > 1000 ? 'critical' : 'major',
        });
      }
    }
  }
}

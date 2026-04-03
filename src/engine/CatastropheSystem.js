/**
 * CatastropheSystem - Shockwave and explosion propagation to nearby bodies
 *
 * Processes catastrophe events emitted by CollisionSystem and Star supernova
 * and applies their physical consequences to other bodies in the system:
 *
 *   - Orbital perturbation impulse (shockwave momentum)
 *   - Temperature spike from heat pulse
 *   - Atmospheric stripping from radiation
 *   - Biosphere damage / extinction
 *   - Surface damage accumulation
 *   - Orbital unbinding for very close bodies
 *
 * All effects use distance-squared falloff from the source position.
 */

export default class CatastropheSystem {
  constructor() {
    this.enabled = true;
  }

  /**
   * Process a single catastrophe event against all alive bodies in the system.
   *
   * @param {Object} event
   *   { type, sourceId, position, energy, shockwaveRadius, radiationBurst, ejectaMass }
   * @param {CelestialBody[]} bodies
   * @param {number}          dt  timestep (years) — used only for rate effects
   */
  process(event, bodies, dt) {
    if (!this.enabled) return;

    const { sourceId, position, energy, shockwaveRadius, radiationBurst } = event;
    if (!position) return;

    const effectiveRadius = shockwaveRadius || 100;

    for (const body of bodies) {
      if (!body.alive) continue;
      if (body.id === sourceId) continue;

      const dist = body.position.distanceTo(position);
      if (dist < 1e-6) continue;

      // Normalised falloff: 1 at source, 0 at effectiveRadius
      const rawFall   = Math.max(0, 1 - dist / effectiveRadius);
      const falloffSq = rawFall * rawFall;  // quadratic falloff

      // ── Orbital perturbation (shockwave impulse) ───────────────────────────
      if (falloffSq > 0.001 && energy > 0) {
        const impulseDir = body.position.clone().sub(position).normalize();
        // Energy-based impulse: (E * falloff) / (m * dist²) capped to prevent runaways
        const impulseMag = Math.min(
          (energy * falloffSq) / Math.max(body.mass * dist * dist, 0.01),
          5.0   // AU/yr per event — hard cap
        );
        body.velocity.addScaledVector(impulseDir, impulseMag);

        if (impulseMag > 0.1) {
          body.logEvent({
            type: 'shockwave_impulse',
            message: `${body.name} struck by shockwave at ${dist.toFixed(1)} AU — orbital perturbation Δv=${impulseMag.toFixed(3)} AU/yr`,
            severity: impulseMag > 1.0 ? 'critical' : impulseMag > 0.3 ? 'major' : 'notable',
          });
        }
      }

      // ── Planets receive additional damage ──────────────────────────────────
      if (body.type === 'planet') {
        // Radiation damage
        if (radiationBurst > 0 && dist > 0) {
          const radFlux = radiationBurst / (dist * dist);

          // Temperature spike
          if (body.temperature !== undefined && radFlux > 1) {
            body.temperature = Math.min(
              body.temperature + radFlux * 0.005,
              8000
            );
          }

          // Atmosphere stripping
          if (body.atmospherePressure !== undefined && radFlux > 10) {
            const stripFrac = Math.min(0.9, radFlux * 1e-5);
            body.atmospherePressure = Math.max(0, body.atmospherePressure * (1 - stripFrac));
          }

          // Biosphere extinction above lethal threshold
          if (body.hasLife && radFlux > 1e4) {
            body.hasLife = false;
            body.logEvent({
              type: 'biosphere_extinction',
              message: `${body.name}'s biosphere was annihilated by the explosion! (dist=${dist.toFixed(1)} AU)`,
              severity: 'catastrophic',
            });
          } else if (body.aberranceProbability !== undefined && radFlux > 50) {
            body.aberranceProbability = Math.min(1.0,
              body.aberranceProbability + radFlux * 1e-5
            );
          }
        }

        // Surface damage from shockwave
        if (body.surfaceDamage !== undefined && falloffSq > 0.01) {
          body.surfaceDamage = Math.min(1.0, body.surfaceDamage + falloffSq * 0.5);
        }

        // Very close planets completely destroyed by shockwave
        if (dist < effectiveRadius * 0.05 && body.mass < 0.001) {
          body.destroy();
          body.logEvent({
            type: 'destroyed_by_shockwave',
            message: `${body.name} was obliterated by the shockwave!`,
            severity: 'catastrophic',
          });
        }
      }
    }
  }

  /**
   * Convenience: propagate a supernova explosion from a source body.
   * The Star calls this indirectly via SimEngine after triggerSupernova().
   *
   * @param {CelestialBody}   source  - the exploding star
   * @param {CelestialBody[]} bodies  - all alive bodies in the system
   * @param {number}          ejectaMass (M☉)
   * @param {number}          energy     (simulation units M☉·(AU/yr)² — use ~1e46 for a supernova)
   */
  propagateSupernova(source, bodies, ejectaMass, energy) {
    const shockRadius = 80 + (source.initialMass || source.mass) * 5;
    this.process(
      {
        type: 'supernova_shockwave',
        sourceId: source.id,
        position: source.position.clone(),
        energy,
        shockwaveRadius: shockRadius,
        radiationBurst: energy * 0.01,
        ejectaMass,
      },
      bodies,
      0
    );

    // Enrich nearby bodies with heavy elements from supernova ejecta
    for (const body of bodies) {
      if (!body.alive || body.id === source.id) continue;
      if (!body.composition) continue;
      const dist = body.position.distanceTo(source.position);
      if (dist > shockRadius || dist < 1e-6) continue;

      const enrichFactor = Math.max(0, 1 - dist / shockRadius) * 0.02 * ejectaMass;
      const ejectaElements = { C: 0.15, O: 0.20, Si: 0.10, Fe: 0.25, Mg: 0.08, S: 0.06, Ne: 0.05, Ni: 0.03 };
      let totalAdded = 0;
      for (const [el, frac] of Object.entries(ejectaElements)) {
        const add = enrichFactor * frac;
        body.composition[el] = (body.composition[el] || 0) + add;
        totalAdded += add;
      }
      if (totalAdded > 0 && body.composition.H > 0.1) {
        body.composition.H = Math.max(0.05, (body.composition.H || 0) - totalAdded * 0.7);
      }
      if (totalAdded > 0.001) {
        body.logEvent({
          type: 'supernova_enrichment',
          message: `${body.name} enriched with heavy elements from ${source.name}'s supernova ejecta`,
        });
      }
    }
  }
}

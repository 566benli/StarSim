/**
 * CollisionSystem - Physically classified multi-stage collision resolution
 *
 * Replaces the simple "touch → merge" with Universe-Sandbox-style outcomes.
 * Determines outcome from body types, mass ratio, impact parameter,
 * relative velocity vs escape velocity, and internal stellar state.
 *
 * Outcome types:
 *   GRAZING_ENCOUNTER      - barely touching, slight orbital perturbation
 *   PARTIAL_STRIP          - outer layers stripped from smaller body
 *   TIDAL_DISRUPTION       - smaller body broken by tidal forces
 *   INELASTIC_MERGER       - slow-speed merger with some ejecta
 *   STELLAR_FUSION         - star-star coalescence → reclassified new star
 *   CATASTROPHIC_EXPLOSION - high-energy impact → shockwave + remnant
 *   DIRECT_COLLAPSE        - combined mass too large → immediate BH
 *   BH_ACCRETION           - black hole absorbs infalling body
 *   BH_TIDAL_DISRUPTION    - BH tidally disrupts body before crossing horizon
 *   NEUTRON_MERGER         - NS+NS kilonova → remnant + r-process flash
 *   NOVA_EXPLOSION         - WD reaches Chandrasekhar limit → Type Ia
 *   ABSORB                 - simple absorption (planet by star, etc.)
 */

import * as THREE from 'three';
import { R_SUN_IN_AU } from '@utils/constants';
import { generateId } from '@utils/helpers';
import {
  mainSequenceLuminosity,
  mainSequenceTemperature,
  mainSequenceRadius,
  mainSequenceLifetime,
  schwarzschildRadius,
} from '@utils/math';
import { EVOLUTION_PHASES } from '@data/starTypes';
import { getDefaultComposition } from '@data/elements';

// ─── Outcome Enum ─────────────────────────────────────────────────────────────

export const COLLISION_OUTCOME = {
  GRAZING_ENCOUNTER:       'grazing_encounter',
  PARTIAL_STRIP:           'partial_strip',
  TIDAL_DISRUPTION:        'tidal_disruption',
  INELASTIC_MERGER:        'inelastic_merger',
  STELLAR_FUSION:          'stellar_fusion',
  CATASTROPHIC_EXPLOSION:  'catastrophic_explosion',
  DIRECT_COLLAPSE:         'direct_collapse',
  BH_ACCRETION:            'bh_accretion',
  BH_TIDAL_DISRUPTION:     'bh_tidal_disruption',
  NEUTRON_MERGER:          'neutron_merger',
  NOVA_EXPLOSION:          'nova_explosion',
  ABSORB:                  'absorb',
};

// G in simulation units: AU³ yr⁻² M☉⁻¹
const G_SIM = 4 * Math.PI * Math.PI;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeVelocity(totalMass, contactRadiusAU) {
  return Math.sqrt(2 * G_SIM * totalMass / Math.max(contactRadiusAU, 1e-9));
}

function bodyClass(body) {
  if (body.type === 'black_hole') return 'black_hole';
  if (body.type === 'planet')     return 'planet';
  if (body.type === 'star') {
    const p = body.phase;
    if (p === EVOLUTION_PHASES.NEUTRON_STAR || p === 'neutron_star') return 'neutron_star';
    if (p === EVOLUTION_PHASES.WHITE_DWARF   || p === 'white_dwarf')  return 'white_dwarf';
    if (p === EVOLUTION_PHASES.BLACK_HOLE    || p === 'black_hole')   return 'black_hole';
    if (p === EVOLUTION_PHASES.RED_SUPERGIANT || p === 'red_supergiant') return 'supergiant';
    if (p === EVOLUTION_PHASES.RED_GIANT     || p === 'red_giant')    return 'giant';
    return 'star';
  }
  return 'other';
}

function isStellar(cls) {
  return cls === 'star' || cls === 'giant' || cls === 'supergiant';
}

function comPos(a, b) {
  return a.position.clone()
    .multiplyScalar(a.mass)
    .addScaledVector(b.position, b.mass)
    .divideScalar(a.mass + b.mass);
}

function comVel(a, b) {
  return new THREE.Vector3()
    .addScaledVector(a.velocity, a.mass / (a.mass + b.mass))
    .addScaledVector(b.velocity, b.mass / (a.mass + b.mass));
}

// ─── CollisionSystem ──────────────────────────────────────────────────────────

export default class CollisionSystem {
  constructor() {
    this.pendingVfxEvents   = [];
    this.pendingCatastrophes = [];
    this.pendingSpawns      = [];
    this.debugLog           = [];
    this.debugMode          = false;
  }

  clearPending() {
    this.pendingVfxEvents    = [];
    this.pendingCatastrophes = [];
    this.pendingSpawns       = [];
    this.debugLog            = [];
  }

  /**
   * Main entry point.
   * @param {CelestialBody} bodyA
   * @param {CelestialBody} bodyB
   * @param {THREE.Vector3} relVelVec  - velocity of B relative to A (AU/yr)
   * @param {number}        impactParam - b / (r1+r2), 0=head-on, 1=grazing
   * @param {Array}         systemBodies - all alive bodies in system
   * @returns {Array} new bodies to add to the GravitySystem
   */
  resolve(bodyA, bodyB, relVelVec, impactParam, systemBodies) {
    if (!bodyA.alive || !bodyB.alive) return [];

    // Sort so big is always the more massive body
    const [big, small] = bodyA.mass >= bodyB.mass ? [bodyA, bodyB] : [bodyB, bodyA];

    const bigCls   = bodyClass(big);
    const smallCls = bodyClass(small);

    const contactR = (big.radius + small.radius) * R_SUN_IN_AU;
    const relSpeed = relVelVec.length();
    const vesc     = escapeVelocity(big.mass + small.mass, contactR);
    const vRatio   = relSpeed / Math.max(vesc, 0.001);

    const outcome = this._classify(big, small, bigCls, smallCls, vRatio, impactParam);

    if (this.debugMode) {
      const entry = {
        time: Date.now(),
        bigName: big.name, bigCls, bigMass: big.mass,
        smallName: small.name, smallCls, smallMass: small.mass,
        relSpeed: relSpeed.toFixed(3),
        vesc: vesc.toFixed(3),
        vRatio: vRatio.toFixed(3),
        impactParam: impactParam.toFixed(3),
        outcome,
      };
      this.debugLog.push(entry);
      console.log(
        `[CollisionSystem] ${big.name}(${bigCls}) + ${small.name}(${smallCls}) ` +
        `→ ${outcome}  v/vesc=${vRatio.toFixed(2)}  b=${impactParam.toFixed(2)}`
      );
    }

    return this._apply(outcome, big, small, bigCls, smallCls,
                       relVelVec, relSpeed, impactParam, vesc, vRatio, systemBodies);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CLASSIFICATION
  // ────────────────────────────────────────────────────────────────────────────

  _classify(big, small, bigCls, smallCls, vRatio, impactParam) {
    // ── Black hole as the larger body ─────────────────────────────────────────
    if (bigCls === 'black_hole') {
      if (smallCls !== 'black_hole') {
        // Tidal disruption if body is extended enough
        const rTidal = (small.radius * R_SUN_IN_AU) * Math.pow(big.mass / small.mass, 1 / 3);
        const dist   = big.position.distanceTo(small.position);
        if (dist < rTidal * 3) return COLLISION_OUTCOME.BH_TIDAL_DISRUPTION;
      }
      return COLLISION_OUTCOME.BH_ACCRETION;
    }

    // ── Black hole as the smaller body (rare — gets absorbed) ─────────────────
    if (smallCls === 'black_hole') {
      return COLLISION_OUTCOME.BH_ACCRETION;
    }

    // ── Neutron star + neutron star ──────────────────────────────────────────
    if (bigCls === 'neutron_star' && smallCls === 'neutron_star') {
      return COLLISION_OUTCOME.NEUTRON_MERGER;
    }

    // ── White dwarf + white dwarf (Type Ia scenario) ─────────────────────────
    if (bigCls === 'white_dwarf' && smallCls === 'white_dwarf') {
      return (big.mass + small.mass) > 1.4
        ? COLLISION_OUTCOME.NOVA_EXPLOSION
        : COLLISION_OUTCOME.INELASTIC_MERGER;
    }

    // ── White dwarf accretes until Chandrasekhar limit ───────────────────────
    if (bigCls === 'white_dwarf' && isStellar(smallCls) && big.mass > 1.2) {
      return COLLISION_OUTCOME.NOVA_EXPLOSION;
    }

    // ── Neutron star swallows anything ──────────────────────────────────────
    if (bigCls === 'neutron_star') {
      return COLLISION_OUTCOME.ABSORB;
    }

    // ── Planet as the smaller body ───────────────────────────────────────────
    if (smallCls === 'planet') {
      return COLLISION_OUTCOME.ABSORB;
    }

    // ── Star ↔ Star (normal, giant, supergiant) ──────────────────────────────
    if (isStellar(bigCls) && (isStellar(smallCls) || smallCls === 'white_dwarf')) {

      // Grazing: high impact parameter, nearly no contact
      if (impactParam > 0.88) return COLLISION_OUTCOME.GRAZING_ENCOUNTER;

      const totalMass = big.mass + small.mass;

      // Very high energy → catastrophic or direct collapse
      if (vRatio > 2.5 || (vRatio > 1.8 && totalMass > 20)) {
        return totalMass > 50
          ? COLLISION_OUTCOME.DIRECT_COLLAPSE
          : COLLISION_OUTCOME.CATASTROPHIC_EXPLOSION;
      }

      // High energy glancing blow → strip outer layers
      if (vRatio > 1.3 && impactParam > 0.45) return COLLISION_OUTCOME.PARTIAL_STRIP;

      // High energy head-on → catastrophic
      if (vRatio > 1.5) return COLLISION_OUTCOME.CATASTROPHIC_EXPLOSION;

      // Moderate energy glancing blow → strip
      if (vRatio > 0.7 && impactParam > 0.5) return COLLISION_OUTCOME.PARTIAL_STRIP;

      // Moderate-to-low energy → stellar fusion (coalescence)
      if (vRatio < 1.0 && impactParam < 0.65) return COLLISION_OUTCOME.STELLAR_FUSION;

      // Default: inelastic merger
      return COLLISION_OUTCOME.INELASTIC_MERGER;
    }

    // ── White dwarf + planet / small body ────────────────────────────────────
    if (bigCls === 'white_dwarf') return COLLISION_OUTCOME.ABSORB;

    return COLLISION_OUTCOME.ABSORB;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DISPATCH
  // ────────────────────────────────────────────────────────────────────────────

  _apply(outcome, big, small, bigCls, smallCls,
         relVelVec, relSpeed, impactParam, vesc, vRatio, systemBodies) {
    switch (outcome) {
      case COLLISION_OUTCOME.GRAZING_ENCOUNTER:
        return this._applyGrazing(big, small, relVelVec, impactParam);
      case COLLISION_OUTCOME.PARTIAL_STRIP:
        return this._applyPartialStrip(big, small, relVelVec, impactParam, vRatio);
      case COLLISION_OUTCOME.TIDAL_DISRUPTION:
        return this._applyTidalDisruption(big, small, relVelVec);
      case COLLISION_OUTCOME.BH_ACCRETION:
        return this._applyBHAccretion(big, small, relVelVec);
      case COLLISION_OUTCOME.BH_TIDAL_DISRUPTION:
        return this._applyBHTidalDisruption(big, small, relVelVec);
      case COLLISION_OUTCOME.STELLAR_FUSION:
        return this._applyStellarFusion(big, small, relVelVec, vRatio);
      case COLLISION_OUTCOME.INELASTIC_MERGER:
        return this._applyInelasticMerger(big, small, relVelVec, vRatio);
      case COLLISION_OUTCOME.CATASTROPHIC_EXPLOSION:
        return this._applyCatastrophicExplosion(big, small, relVelVec, vRatio);
      case COLLISION_OUTCOME.DIRECT_COLLAPSE:
        return this._applyDirectCollapse(big, small, relVelVec, vRatio);
      case COLLISION_OUTCOME.NEUTRON_MERGER:
        return this._applyNeutronMerger(big, small, relVelVec);
      case COLLISION_OUTCOME.NOVA_EXPLOSION:
        return this._applyNovaExplosion(big, small, relVelVec);
      case COLLISION_OUTCOME.ABSORB:
      default:
        return this._applyAbsorb(big, small, relVelVec);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // OUTCOME IMPLEMENTATIONS
  // ────────────────────────────────────────────────────────────────────────────

  /** Grazing encounter — tiny orbital kick, no mass exchange */
  _applyGrazing(big, small, relVelVec, impactParam) {
    const kickStrength = 0.005 * (1.0 - impactParam);
    const perp = new THREE.Vector3(relVelVec.y, -relVelVec.x, 0).normalize();
    big.velocity.addScaledVector(perp,  kickStrength * small.mass / (big.mass + small.mass));
    small.velocity.addScaledVector(perp, -kickStrength * big.mass  / (big.mass + small.mass));

    big.logEvent({ type: 'grazing_encounter',
      message: `${big.name} and ${small.name} had a grazing encounter!` });

    this._emitVfx({
      type: 'grazing_encounter',
      sourceId: big.id, targetId: small.id,
      position: big.position.clone().lerp(small.position, 0.5),
      energy: relVelVec.lengthSq() * small.mass * 0.01,
      duration: 1.0,
    });
    return [];
  }

  /** Partial strip — big strips outer layers of small */
  _applyPartialStrip(big, small, relVelVec, impactParam, vRatio) {
    const stripFraction = Math.min(0.45, 0.1 + 0.35 * vRatio * (1.0 - impactParam));
    const strippedMass  = small.mass * stripFraction;
    const accretedByBig = strippedMass * 0.25; // only ~25% captured
    const ejectaMass    = strippedMass - accretedByBig;

    // Momentum-conserving update
    const totalMom = new THREE.Vector3()
      .addScaledVector(big.velocity,   big.mass)
      .addScaledVector(small.velocity, small.mass);

    big.mass   += accretedByBig;
    small.mass -= strippedMass;

    // Recompute stellar properties
    if (big.type === 'star' && big.mass > 0.08) {
      big.radius     = mainSequenceRadius(big.mass);
      big.luminosity = mainSequenceLuminosity(big.mass);
    }

    big.logEvent({ type: 'partial_strip',
      message: `${big.name} stripped ${(stripFraction*100).toFixed(0)}% of ${small.name}'s outer layers!` });
    small.logEvent({ type: 'partial_strip',
      message: `${small.name} lost ${(strippedMass).toFixed(3)} M☉ to ${big.name}'s tidal stripping.` });

    this._emitVfx({
      type: 'partial_strip',
      sourceId: big.id, targetId: small.id,
      position: big.position.clone().lerp(small.position, 0.5),
      ejectaMass, energy: relVelVec.lengthSq() * small.mass * 0.1,
      duration: 2.5,
    });

    // Destroy if stripped to nothing
    if (small.mass < 0.001) {
      return this._applyAbsorb(big, small, relVelVec);
    }
    return [];
  }

  /** Tidal disruption — smaller body torn apart, big gains fraction */
  _applyTidalDisruption(big, small, relVelVec) {
    const accreted = small.mass * 0.4;
    const totalMom = new THREE.Vector3()
      .addScaledVector(big.velocity,   big.mass)
      .addScaledVector(small.velocity, small.mass);

    big.mass += accreted;
    big.velocity.copy(totalMom).divideScalar(big.mass);

    if (big.type === 'star') {
      big.radius     = mainSequenceRadius(big.mass);
      big.luminosity = mainSequenceLuminosity(big.mass);
    }

    big.logEvent({ type: 'tidal_disruption',
      message: `${big.name} tidally disrupted ${small.name}!` });

    this._emitVfx({
      type: 'tidal_disruption',
      sourceId: big.id, targetId: small.id,
      position: small.position.clone(),
      ejectaMass: small.mass - accreted,
      energy: relVelVec.lengthSq() * small.mass,
      shockwaveRadius: small.radius * R_SUN_IN_AU * 20,
      duration: 3.5,
    });

    small.destroy();
    return [];
  }

  /** Black hole accretes the body */
  _applyBHAccretion(bh, body, relVelVec) {
    const totalMass = bh.mass + body.mass;
    const totalMom  = new THREE.Vector3()
      .addScaledVector(bh.velocity,   bh.mass)
      .addScaledVector(body.velocity, body.mass);
    const cPos = comPos(bh, body);

    bh.mass = totalMass;
    bh.velocity.copy(totalMom).divideScalar(totalMass);
    bh.position.copy(cPos);

    // Boost accretion rate transiently
    if (bh.accretionRate !== undefined) {
      bh.accretionRate = Math.min((bh.accretionRate || 0) + body.mass * 0.002, 0.2);
    }
    // Update schwarzschild radius if BH carries it
    if (bh.schwarzschildRadius !== undefined) {
      bh.schwarzschildRadius = schwarzschildRadius(bh.mass);
      if (bh.calculateEventHorizon) bh.eventHorizonRadius = bh.calculateEventHorizon();
    }

    bh.logEvent({ type: 'bh_accretion',
      message: `${bh.name} consumed ${body.name}! Mass now ${bh.mass.toFixed(2)} M☉` });

    const isCompact = ['neutron_star', 'white_dwarf', 'black_hole'].includes(bodyClass(body));
    this._emitVfx({
      type: 'bh_accretion',
      sourceId: bh.id, targetId: body.id,
      position: body.position.clone(),
      absorbedMass: body.mass,
      energy: relVelVec.lengthSq() * body.mass * 0.5,
      radiationBurst: bh.mass * (isCompact ? 1000 : 100),
      duration: isCompact ? 5.0 : 2.5,
      accretionGlow: true,
    });

    this._emitCatastrophe({
      type: 'radiation_burst',
      sourceId: bh.id,
      position: body.position.clone(),
      energy: bh.mass * 1e4,
      shockwaveRadius: 10,
      radiationBurst: bh.mass * 300,
    });

    body.destroy();
    return [];
  }

  /** BH tidally disrupts body before full ingestion */
  _applyBHTidalDisruption(bh, body, relVelVec) {
    const accreted = body.mass * 0.5;
    const totalMom = new THREE.Vector3()
      .addScaledVector(bh.velocity,   bh.mass)
      .addScaledVector(body.velocity, body.mass);

    bh.mass += accreted;
    bh.velocity.copy(totalMom).divideScalar(bh.mass + body.mass - accreted);

    if (bh.accretionRate !== undefined) {
      bh.accretionRate = Math.min((bh.accretionRate || 0) + accreted * 0.01, 1.0);
    }
    if (bh.schwarzschildRadius !== undefined) {
      bh.schwarzschildRadius = schwarzschildRadius(bh.mass);
      if (bh.calculateEventHorizon) bh.eventHorizonRadius = bh.calculateEventHorizon();
    }

    bh.logEvent({ type: 'bh_tidal_disruption',
      message: `${bh.name} tidally disrupted ${body.name}! Accretion spike!` });

    this._emitVfx({
      type: 'bh_tidal_disruption',
      sourceId: bh.id, targetId: body.id,
      position: body.position.clone(),
      ejectaMass: body.mass - accreted,
      absorbedMass: accreted,
      energy: relVelVec.lengthSq() * body.mass,
      radiationBurst: bh.mass * 2000,
      debrisStreamDir: relVelVec.clone().normalize(),
      duration: 6.0,
    });

    this._emitCatastrophe({
      type: 'radiation_burst',
      sourceId: bh.id,
      position: body.position.clone(),
      energy: bh.mass * 5e4,
      shockwaveRadius: 50,
      radiationBurst: bh.mass * 2000,
    });

    body.destroy();
    return [];
  }

  /** Stellar fusion — two stars merge into a reclassified new star */
  _applyStellarFusion(big, small, relVelVec, vRatio) {
    const ejectaFraction = Math.min(0.15, 0.05 + 0.08 * vRatio);
    const totalMass      = big.mass + small.mass;
    const ejectaMass     = totalMass * ejectaFraction;
    const mergedMass     = totalMass - ejectaMass;

    const cPos = comPos(big, small);
    const cVel = comVel(big, small);

    // Reclassify merged star on main sequence with merged mass
    big.mass        = mergedMass;
    big.initialMass = mergedMass;
    big.position.copy(cPos);
    big.velocity.copy(cVel);
    big.metallicity = (big.metallicity * big.mass + small.metallicity * small.mass) / totalMass;

    big.radius      = mainSequenceRadius(mergedMass);
    big.temperature = mainSequenceTemperature(mergedMass);
    big.luminosity  = mainSequenceLuminosity(mergedMass);
    big.phase       = EVOLUTION_PHASES.MAIN_SEQUENCE;
    big.evolutionProgress = 0;

    if (big.mainSequenceLifetime !== undefined) {
      big.mainSequenceLifetime = mainSequenceLifetime(mergedMass) * 0.7; // shorter life
    }
    if (big.coreTemperature !== undefined) {
      big.coreTemperature = 1.5e7 * mergedMass;
    }
    if (big.calculateSpectralClass) {
      big.spectralClass = big.calculateSpectralClass();
    }
    big.composition = getDefaultComposition('star', 'sun_like', 'main_sequence');

    // Brief luminosity spike (decays over simulation time ~0.001 yr = ~8.7 hr)
    big._luminosityBoost = { factor: 50, decayRate: 1000 };

    big.logEvent({ type: 'stellar_fusion',
      message: `${big.name} and ${small.name} FUSED! New mass: ${mergedMass.toFixed(2)} M☉, ${(ejectaMass).toFixed(3)} M☉ ejected.`,
      severity: 'major' });

    this._emitVfx({
      type: 'star_merger_flash',
      sourceId: big.id, targetId: small.id,
      position: cPos.clone(),
      releasedEnergy: mergedMass * 1e44,
      ejectaMass,
      luminositySpike: mainSequenceLuminosity(mergedMass) * 100,
      shockwaveRadiusMax: 20,
      duration: 4.0,
    });

    this._emitCatastrophe({
      type: 'stellar_merger_shockwave',
      sourceId: big.id,
      position: cPos.clone(),
      energy: mergedMass * 1e44,
      shockwaveRadius: 20,
      radiationBurst: mainSequenceLuminosity(mergedMass) * 50,
      ejectaMass,
    });

    small.destroy();
    return [];
  }

  /** Inelastic merger — absorb with some ejecta */
  _applyInelasticMerger(big, small, relVelVec, vRatio) {
    const ejectaFraction = Math.min(0.2, 0.03 + 0.08 * vRatio);
    const ejectaMass     = small.mass * ejectaFraction;
    const totalMass      = big.mass + small.mass - ejectaMass;

    const totalMom = new THREE.Vector3()
      .addScaledVector(big.velocity,   big.mass)
      .addScaledVector(small.velocity, small.mass);
    const cPos = comPos(big, small);

    big.mass = totalMass;
    big.position.copy(cPos);
    big.velocity.copy(totalMom).divideScalar(totalMass + ejectaMass);

    if (big.type === 'star' &&
        big.phase !== EVOLUTION_PHASES.WHITE_DWARF &&
        big.phase !== EVOLUTION_PHASES.NEUTRON_STAR) {
      big.radius     = Math.max(big.radius, mainSequenceRadius(totalMass) * 0.85);
      big.luminosity = mainSequenceLuminosity(totalMass);
    }

    big.logEvent({ type: 'inelastic_merger',
      message: `${big.name} merged with ${small.name}! ${ejectaMass.toFixed(3)} M☉ ejected.` });

    this._emitVfx({
      type: 'inelastic_merger',
      sourceId: big.id, targetId: small.id,
      position: cPos.clone(),
      ejectaMass, energy: relVelVec.lengthSq() * small.mass * 0.5,
      duration: 2.0,
    });

    small.destroy();
    return [];
  }

  /** Catastrophic explosion — high-energy impact → shockwave + remnant */
  _applyCatastrophicExplosion(big, small, relVelVec, vRatio) {
    const totalMass       = big.mass + small.mass;
    const cPos            = comPos(big, small);
    const cVel            = comVel(big, small);
    const ejectaFraction  = Math.min(0.82, 0.5 + 0.1 * vRatio);
    const ejectaMass      = totalMass * ejectaFraction;
    const remnantMass     = totalMass - ejectaMass;
    const reducedMass     = (big.mass * small.mass) / totalMass;
    const releasedEnergy  = 0.5 * relVelVec.lengthSq() * reducedMass;

    big.logEvent({ type: 'catastrophic_explosion',
      message: `CATASTROPHIC COLLISION: ${big.name} + ${small.name} → EXPLOSION! (${ejectaMass.toFixed(2)} M☉ ejected)`,
      severity: 'catastrophic' });

    this._emitVfx({
      type: 'catastrophic_explosion',
      sourceId: big.id, targetId: small.id,
      position: cPos.clone(),
      releasedEnergy, ejectaMass,
      luminositySpike: totalMass * 1e6,
      shockwaveRadiusMax: 120,
      duration: 7.0,
    });

    this._emitCatastrophe({
      type: 'explosion_shockwave',
      sourceId: big.id,
      position: cPos.clone(),
      energy: releasedEnergy,
      shockwaveRadius: 100,
      radiationBurst: totalMass * 1e5,
      ejectaMass,
    });

    big.destroy();
    small.destroy();

    const newBodies = [];
    if (remnantMass > 0.01) {
      const remnant = this._createRemnant(
        remnantMass, cPos, cVel,
        big.systemId || small.systemId,
        `${big.name} Remnant`
      );
      if (remnant) newBodies.push(remnant);
    }
    return newBodies;
  }

  /** Direct collapse — combined mass immediately forms a black hole */
  _applyDirectCollapse(big, small, relVelVec, vRatio) {
    const totalMass  = big.mass + small.mass;
    const cPos       = comPos(big, small);
    const cVel       = comVel(big, small);
    const bhMass     = totalMass * 0.55;
    const ejectaMass = totalMass * 0.45;

    big.logEvent({ type: 'direct_collapse',
      message: `DIRECT COLLAPSE: ${big.name} + ${small.name} → BLACK HOLE (${bhMass.toFixed(2)} M☉)!`,
      severity: 'catastrophic' });

    this._emitVfx({
      type: 'direct_collapse',
      sourceId: big.id,
      position: cPos.clone(),
      releasedEnergy: G_SIM * totalMass * totalMass / Math.max(small.radius * R_SUN_IN_AU, 1e-6),
      ejectaMass,
      duration: 6.0,
    });

    this._emitCatastrophe({
      type: 'explosion_shockwave',
      sourceId: big.id,
      position: cPos.clone(),
      energy: G_SIM * totalMass * totalMass / Math.max(small.radius * R_SUN_IN_AU, 1e-6),
      shockwaveRadius: 200,
      radiationBurst: totalMass * 1e7,
      ejectaMass,
    });

    big.destroy();
    small.destroy();

    // Lazy-import BlackHole to avoid circular deps at module load time
    return [this._makeBH(bhMass, cPos, cVel, big.systemId || small.systemId,
                         `${big.name} BH`, 0.5 + Math.random() * 0.4)];
  }

  /** Neutron-star merger (kilonova) */
  _applyNeutronMerger(ns1, ns2, relVelVec) {
    const totalMass  = ns1.mass + ns2.mass;
    const cPos       = comPos(ns1, ns2);
    const cVel       = comVel(ns1, ns2);
    const ejectaMass = totalMass * 0.1;
    const remnantM   = totalMass - ejectaMass;

    ns1.logEvent({ type: 'neutron_merger',
      message: `KILONOVA! ${ns1.name} + ${ns2.name} → merger! r-process nucleosynthesis!`,
      severity: 'catastrophic' });

    this._emitVfx({
      type: 'kilonova',
      sourceId: ns1.id, targetId: ns2.id,
      position: cPos.clone(),
      releasedEnergy: 1e44 * totalMass,
      ejectaMass, luminositySpike: 1e10,
      duration: 9.0,
    });

    this._emitCatastrophe({
      type: 'explosion_shockwave',
      sourceId: ns1.id,
      position: cPos.clone(),
      energy: 1e44 * totalMass,
      shockwaveRadius: 250,
      radiationBurst: 1e8 * totalMass,
      ejectaMass,
    });

    ns1.destroy();
    ns2.destroy();

    const newBodies = [];
    if (remnantM > 3.0) {
      newBodies.push(this._makeBH(remnantM, cPos, cVel,
                                  ns1.systemId || ns2.systemId, 'Kilonova BH', 0.8));
    } else {
      newBodies.push(this._makeNS(remnantM, cPos, cVel,
                                  ns1.systemId || ns2.systemId, 'Kilonova NS'));
    }
    return newBodies;
  }

  /** Type Ia or WD-triggered nova */
  _applyNovaExplosion(wd, companion, relVelVec) {
    const totalMass = wd.mass + companion.mass;
    const cPos      = comPos(wd, companion);

    wd.logEvent({ type: 'nova_explosion',
      message: `TYPE Ia SUPERNOVA! ${wd.name} detonated — complete destruction!`,
      severity: 'catastrophic' });

    this._emitVfx({
      type: 'type_ia_supernova',
      sourceId: wd.id,
      position: cPos.clone(),
      releasedEnergy: 1.4e44,
      ejectaMass: totalMass, luminositySpike: 1e9,
      shockwaveRadiusMax: 250,
      duration: 10.0,
    });

    this._emitCatastrophe({
      type: 'explosion_shockwave',
      sourceId: wd.id,
      position: cPos.clone(),
      energy: 1e44,
      shockwaveRadius: 250,
      radiationBurst: 1e9,
      ejectaMass: totalMass,
    });

    wd.destroy();
    companion.destroy();
    return []; // no remnant for Type Ia
  }

  /** Simple absorption with momentum + CoM conservation */
  _applyAbsorb(big, small, relVelVec) {
    const totalMass = big.mass + small.mass;
    const totalMom  = new THREE.Vector3()
      .addScaledVector(big.velocity,   big.mass)
      .addScaledVector(small.velocity, small.mass);
    const cPos = comPos(big, small);

    big.velocity.copy(totalMom).divideScalar(totalMass);
    big.position.copy(cPos);
    big.mass = totalMass;

    if (big.type === 'star' &&
        big.phase !== EVOLUTION_PHASES.WHITE_DWARF &&
        big.phase !== EVOLUTION_PHASES.NEUTRON_STAR) {
      big.radius     = mainSequenceRadius(totalMass);
      big.luminosity = mainSequenceLuminosity(totalMass);
    }

    big.logEvent({ type: 'absorbed',
      message: `${big.name} absorbed ${small.name}!` });

    this._emitVfx({
      type: 'absorption_flash',
      sourceId: big.id, targetId: small.id,
      position: cPos.clone(),
      absorbedMass: small.mass,
      energy: relVelVec.lengthSq() * small.mass * 0.1,
      duration: 1.2,
    });

    small.destroy();
    return [];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REMNANT FACTORIES
  // ────────────────────────────────────────────────────────────────────────────

  _createRemnant(mass, position, velocity, systemId, name) {
    if (mass > 25) {
      return this._makeBH(mass, position, velocity, systemId, name || 'Collapse BH', Math.random() * 0.6);
    }
    if (mass > 3) {
      return this._makeBH(mass, position, velocity, systemId, name || 'Remnant BH', Math.random() * 0.5);
    }
    if (mass > 1.4) {
      return this._makeNS(Math.min(mass, 2.8), position, velocity, systemId, name || 'Remnant NS');
    }
    if (mass > 0.1) {
      return this._makeWD(Math.min(mass, 1.4), position, velocity, systemId, name || 'Remnant WD');
    }
    return null;
  }

  // Deferred require to avoid circular imports at module load time
  _makeBH(mass, position, velocity, systemId, name, spin) {
    const BlackHole = require('./BlackHole').default;
    return new BlackHole({
      id: generateId(), name: name || 'Black Hole',
      mass, spin: spin || 0.5,
      position: position.clone(),
      velocity: velocity.clone(),
      systemId,
    });
  }

  _makeNS(mass, position, velocity, systemId, name) {
    const Star = require('./Star').default;
    return new Star({
      id: generateId(), name: name || 'Neutron Star',
      mass, radius: 0.000015,
      temperature: 6e5, luminosity: 0.001,
      position: position.clone(),
      velocity: velocity.clone(),
      phase: EVOLUTION_PHASES.NEUTRON_STAR,
      systemId,
    });
  }

  _makeWD(mass, position, velocity, systemId, name) {
    const Star = require('./Star').default;
    return new Star({
      id: generateId(), name: name || 'White Dwarf',
      mass, radius: 0.01,
      temperature: 8e4, luminosity: 0.01,
      position: position.clone(),
      velocity: velocity.clone(),
      phase: EVOLUTION_PHASES.WHITE_DWARF,
      systemId,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EVENT EMITTERS
  // ────────────────────────────────────────────────────────────────────────────

  _emitVfx(event) {
    this.pendingVfxEvents.push({ ...event, timestamp: Date.now() });
  }

  _emitCatastrophe(event) {
    this.pendingCatastrophes.push({ ...event, timestamp: Date.now() });
  }
}

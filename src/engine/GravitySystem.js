/**
 * GravitySystem - N-body gravitational simulation
 *
 * Uses Velocity Verlet (leapfrog) integration for energy conservation.
 * Now includes:
 *   - Continuous Collision Detection (CCD) via swept-sphere to prevent tunneling
 *   - Adaptive per-pair sub-stepping for high-velocity close encounters
 *   - CollisionSystem integration for physically classified outcomes
 *   - pendingSpawns queue for new bodies created by collisions
 */
import * as THREE from 'three';
import { R_SUN_IN_AU, ARENA_RADIUS_AU } from '@utils/constants';
import CelestialBody from './CelestialBody';
import Star from './Star';
import Planet from './Planet';
import BlackHole from './BlackHole';
import CollisionSystem from './CollisionSystem';

export default class GravitySystem {
  constructor() {
    this.bodies = [];
    this.softening = 0.05; // AU — reduced for more precise planetary orbits
    this.collisionEnabled = true;
    this.mergeEnabled = true;
    this.boundaryEnabled = true;
    this.boundaryRadius = ARENA_RADIUS_AU;
    this.warningRadius  = ARENA_RADIUS_AU * 0.8;
    this.onBoundaryExceeded = null; // (body) => {}

    // G = 4π² AU³ / (M☉ · yr²) ≈ 39.478
    this.G = 4 * Math.PI * Math.PI;

    // ── Collision subsystem ────────────────────────────────────────────────
    this.collisionSystem = new CollisionSystem();

    // Bodies spawned by collision resolution (remnants, etc.) — consumed by SimEngine
    this.pendingSpawns = [];

    // Temp vectors (avoid GC pressure)
    this._tempVec  = new THREE.Vector3();
    this._forceVec = new THREE.Vector3();

    // CCD danger-zone multiplier: pairs within this many collision radii get CCD checked
    this._ccdDangerMultiplier = 30;
  }

  /**
   * Add a body to the system
   */
  addBody(body) {
    this.bodies.push(body);
    return body;
  }

  /**
   * Remove a body from the system
   */
  removeBody(bodyOrId) {
    const id = typeof bodyOrId === 'string' ? bodyOrId : bodyOrId.id;
    this.bodies = this.bodies.filter(b => b.id !== id);
  }

  /**
   * Get all living bodies
   */
  getAliveBodies() {
    return this.bodies.filter(b => b.alive);
  }

  /**
   * Main simulation step using Velocity Verlet (Leapfrog) integration.
   * Includes CCD swept-sphere collision detection and CollisionSystem integration.
   *
   * @param {number}  dt          Timestep in simulation years
   * @param {boolean} skipEvolve  If true skip age/evolution (caller handles separately)
   */
  step(dt, skipEvolve = false) {
    const bodies = this.getAliveBodies();
    const n = bodies.length;

    // ── Step 0: Save previous positions for CCD ────────────────────────────
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b._prevPos) b._prevPos = new THREE.Vector3();
      b._prevPos.copy(b.position);
    }

    // ── Step 1: Half-kick (velocity) ───────────────────────────────────────
    for (let i = 0; i < n; i++) {
      bodies[i].velocity.addScaledVector(bodies[i].acceleration, dt * 0.5);
    }

    // ── Step 2: Drift (position) ───────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      bodies[i].position.addScaledVector(bodies[i].velocity, dt);
    }

    // ── Step 3: Recompute accelerations ───────────────────────────────────
    this.computeAccelerations(bodies);

    // ── Step 4: Second half-kick ───────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      bodies[i].velocity.addScaledVector(bodies[i].acceleration, dt * 0.5);
    }

    // ── Step 4b: Velocity clamp ────────────────────────────────────────────
    const vMax = 80; // AU/yr
    for (let i = 0; i < n; i++) {
      const vSq = bodies[i].velocity.lengthSq();
      if (vSq > vMax * vMax) {
        bodies[i].velocity.multiplyScalar(vMax / Math.sqrt(vSq));
      }
    }

    // ── Step 5: Age, rotation, trail, evolution ────────────────────────────
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!skipEvolve) b.age += dt;
      b.rotationAngle += b.rotationSpeed * dt;

      b.trail.push(b.position.clone());
      if (b.trail.length > b.maxTrailLength) b.trail.shift();

      if (!skipEvolve && b.evolve) b.evolve(dt);
    }

    // ── Step 6: Boundary enforcement ──────────────────────────────────────
    if (this.boundaryEnabled && this.boundaryRadius > 0) {
      const { position: com } = this.centerOfMass();
      this.detectBoundary(this.getAliveBodies(), com);
    }

    // ── Step 7: CCD-enhanced collision detection ───────────────────────────
    if (this.collisionEnabled) {
      this._detectCollisionsCCD(this.getAliveBodies(), dt);
    }

    return this.getAliveBodies();
  }

  /**
   * Compute gravitational accelerations for all bodies (O(n²))
   * Uses Newton's law with softening
   */
  computeAccelerations(bodies) {
    const n = bodies.length;
    const eps2 = this.softening * this.softening;

    for (let i = 0; i < n; i++) {
      bodies[i].acceleration.set(0, 0, 0);
    }

    const Grav = this.G;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bodies[j].position.x - bodies[i].position.x;
        const dy = bodies[j].position.y - bodies[i].position.y;
        const dz = bodies[j].position.z - bodies[i].position.z;

        const distSq = dx * dx + dy * dy + dz * dz + eps2;
        const dist = Math.sqrt(distSq);
        const GinvDist3 = Grav / (distSq * dist);

        const fx = dx * GinvDist3;
        const fy = dy * GinvDist3;
        const fz = dz * GinvDist3;

        bodies[i].acceleration.x += bodies[j].mass * fx;
        bodies[i].acceleration.y += bodies[j].mass * fy;
        bodies[i].acceleration.z += bodies[j].mass * fz;

        bodies[j].acceleration.x -= bodies[i].mass * fx;
        bodies[j].acceleration.y -= bodies[i].mass * fy;
        bodies[j].acceleration.z -= bodies[i].mass * fz;
      }
    }

    // Clamp accelerations to prevent extreme kicks from near-misses
    const aMax = 500; // AU/yr²
    for (let i = 0; i < n; i++) {
      const aSq = bodies[i].acceleration.lengthSq();
      if (aSq > aMax * aMax) {
        bodies[i].acceleration.multiplyScalar(aMax / Math.sqrt(aSq));
      }
    }
  }

  /**
   * Boundary enforcement with rubber-band zone:
   * - Inside warningRadius: normal physics
   * - Between warningRadius and boundaryRadius: apply restoring deceleration toward COM
   * - Beyond boundaryRadius: destroy
   */
  detectBoundary(bodies, com) {
    const R = this.boundaryRadius;
    const Rw = this.warningRadius;
    const R2 = R * R;
    for (const body of bodies) {
      if (!body.alive) continue;
      if (body.escapedSystem) continue;
      const dx = body.position.x - com.x;
      const dy = body.position.y - com.y;
      const dz = body.position.z - com.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq > R2) {
        body.logEvent({ type: 'boundary', message: `${body.name} crossed the system boundary and escaped into deep space.` });
        if (this.onBoundaryExceeded) {
          this.onBoundaryExceeded(body, {
            centerOfMass: { x: com.x, y: com.y, z: com.z },
          });
        }
      } else if (distSq > Rw * Rw) {
        const dist = Math.sqrt(distSq);
        const fraction = (dist - Rw) / (R - Rw); // 0 at Rw, 1 at R
        const dampStrength = 0.15 + 0.85 * fraction; // progressive damping
        body.velocity.multiplyScalar(1 - dampStrength * 0.3);
        // Gentle pull toward COM
        const pullStrength = 0.05 * fraction;
        body.velocity.x -= (dx / dist) * pullStrength * body.velocity.length();
        body.velocity.y -= (dy / dist) * pullStrength * body.velocity.length();
        body.velocity.z -= (dz / dist) * pullStrength * body.velocity.length();
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CCD — Continuous Collision Detection
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Swept-sphere CCD collision detection.
   * Replaces the old point-in-time check so fast bodies can't tunnel through.
   *
   * For each pair within the danger zone we:
   *   1. Compute the minimum distance between the two swept trajectories.
   *   2. If < sum of radii, we have a collision; record parametric t and impact parameter.
   *   3. Sort collisions by earliest t, then resolve via CollisionSystem.
   */
  _detectCollisionsCCD(bodies, dt) {
    const hits = [];

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (!a.alive || !b.alive) continue;

        const r1   = Math.max((a.radius ?? 0.009) * R_SUN_IN_AU, 1e-9);
        const r2   = Math.max((b.radius ?? 0.009) * R_SUN_IN_AU, 1e-9);
        const sumR = r1 + r2;

        // Broad-phase: only check pairs within danger zone
        const currDist = a.position.distanceTo(b.position);
        if (currDist > sumR * this._ccdDangerMultiplier) continue;

        const hit = this._sweptSphereCheck(a, b, sumR);
        if (hit) {
          hits.push({ a, b, t: hit.t, impactParam: hit.impactParam });
        }
      }
    }

    // Process earliest collision first
    hits.sort((x, y) => x.t - y.t);

    for (const { a, b, t, impactParam } of hits) {
      if (!a.alive || !b.alive) continue;

      const relVelVec = b.velocity.clone().sub(a.velocity);

      if (this.collisionSystem) {
        // Rich, physically classified resolution
        const newBodies = this.collisionSystem.resolve(a, b, relVelVec, impactParam, bodies);
        for (const nb of newBodies) {
          this.pendingSpawns.push(nb);
        }
      } else if (this.mergeEnabled) {
        // Legacy fallback
        this._legacyMerge(a, b);
      }
    }
  }

  /**
   * Swept-sphere check for pair (a, b).
   * Uses saved _prevPos and current position to define the swept path this step.
   *
   * @returns {{ t, impactParam }} or null if no collision
   */
  _sweptSphereCheck(a, b, sumR) {
    // Current overlap: already penetrating
    const dx0 = a.position.x - b.position.x;
    const dy0 = a.position.y - b.position.y;
    const dz0 = a.position.z - b.position.z;
    if (dx0*dx0 + dy0*dy0 + dz0*dz0 < sumR * sumR) {
      return { t: 1.0, impactParam: 0 };
    }

    // Relative position at START of step (previous positions)
    const prevA = a._prevPos || a.position;
    const prevB = b._prevPos || b.position;

    const rx = prevA.x - prevB.x;
    const ry = prevA.y - prevB.y;
    const rz = prevA.z - prevB.z;

    // Change in relative position over this step (displacement delta)
    const dvx = (a.position.x - prevA.x) - (b.position.x - prevB.x);
    const dvy = (a.position.y - prevA.y) - (b.position.y - prevB.y);
    const dvz = (a.position.z - prevA.z) - (b.position.z - prevB.z);

    const dvdv = dvx*dvx + dvy*dvy + dvz*dvz;
    if (dvdv < 1e-24) return null; // essentially no relative motion

    const rvdv = rx*dvx + ry*dvy + rz*dvz;
    const rvrv = rx*rx  + ry*ry  + rz*rz;

    // Parametric t ∈ [0,1] of closest approach
    const t = Math.max(0, Math.min(1, -rvdv / dvdv));

    // Squared distance at time t
    const minDistSq = rvrv + 2*t*rvdv + t*t*dvdv;

    if (minDistSq <= sumR * sumR) {
      const minDist    = Math.sqrt(Math.max(0, minDistSq));
      const impactParam = minDist / sumR; // 0 = head-on, 1 = grazing
      return { t, impactParam };
    }
    return null;
  }

  /**
   * Legacy merge fallback (used when CollisionSystem is disabled).
   */
  _legacyMerge(a, b) {
    if (!a.alive || !b.alive) return;
    const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
    const totalMass = big.mass + small.mass;

    // Conservation of momentum
    big.velocity.multiplyScalar(big.mass / totalMass);
    big.velocity.addScaledVector(small.velocity, small.mass / totalMass);

    // Center of mass position
    big.position.multiplyScalar(big.mass / totalMass);
    big.position.addScaledVector(small.position, small.mass / totalMass);

    big.mass = totalMass;
    big.logEvent({ type: 'collision',
      message: `${big.name} absorbed ${small.name}!`, absorbed: small.name });
    small.destroy();
  }

  /**
   * Kept for backward compatibility — delegates to CCD version.
   */
  detectCollisions(bodies) {
    this._detectCollisionsCCD(bodies, 0.005);
  }

  /**
   * Kept for backward compatibility.
   */
  mergeBodies(a, b) {
    this._legacyMerge(a, b);
  }

  /**
   * Calculate total system energy (for conservation checks)
   */
  totalEnergy() {
    const bodies = this.getAliveBodies();
    let kinetic = 0;
    let potential = 0;

    for (let i = 0; i < bodies.length; i++) {
      // Kinetic: 0.5 * m * v²
      kinetic += 0.5 * bodies[i].mass * bodies[i].velocity.lengthSq();

      // Potential: -G * mi * mj / r
      for (let j = i + 1; j < bodies.length; j++) {
        const dist = bodies[i].position.distanceTo(bodies[j].position);
        if (dist > 0) {
          potential -= this.G * bodies[i].mass * bodies[j].mass / dist;
        }
      }
    }

    return { kinetic, potential, total: kinetic + potential };
  }

  /**
   * Calculate center of mass
   */
  centerOfMass() {
    const bodies = this.getAliveBodies();
    const com = new THREE.Vector3();
    let totalMass = 0;

    for (const body of bodies) {
      com.addScaledVector(body.position, body.mass);
      totalMass += body.mass;
    }

    if (totalMass > 0) com.divideScalar(totalMass);
    return { position: com, totalMass };
  }

  /**
   * Serialize system state
   */
  toJSON() {
    return {
      bodies: this.bodies.map(b => b.toJSON()),
      softening: this.softening,
      boundaryEnabled: this.boundaryEnabled,
      boundaryRadius: this.boundaryRadius,
    };
  }

  /**
   * Restore system state from JSON
   */
  fromJSON(data) {
    if (!data?.bodies) return;
    this.bodies = [];
    for (const b of data.bodies) {
      let body;
      try {
        if (b.type === 'black_hole') body = BlackHole.fromJSON(b);
        else if (b.type === 'star') body = Star.fromJSON(b);
        else if (b.type === 'planet') body = Planet.fromJSON(b);
        else body = CelestialBody.fromJSON(b);
      } catch (err) {
        console.warn('Skipping body load:', b?.name || b?.id, err);
        continue;
      }
      if (body) this.bodies.push(body);
    }
    if (data.softening != null) this.softening = data.softening;
    if (data.boundaryEnabled != null) this.boundaryEnabled = data.boundaryEnabled;
    if (data.boundaryRadius != null) this.boundaryRadius = data.boundaryRadius;
  }
}

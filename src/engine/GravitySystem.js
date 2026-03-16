/**
 * GravitySystem - N-body gravitational simulation
 * Uses Velocity Verlet integration for better energy conservation
 * Includes collision detection and merge logic
 */
import * as THREE from 'three';
import { R_SUN_IN_AU, ARENA_RADIUS_AU } from '@utils/constants';
import CelestialBody from './CelestialBody';
import Star from './Star';
import Planet from './Planet';
import BlackHole from './BlackHole';

export default class GravitySystem {
  constructor() {
    this.bodies = [];
    this.softening = 0.15; // Softening parameter to prevent singularities (AU)
    this.collisionEnabled = true;
    this.mergeEnabled = true;
    this.boundaryEnabled = true;
    this.boundaryRadius = ARENA_RADIUS_AU;
    this.warningRadius = ARENA_RADIUS_AU * 0.8; // Rubber-band zone starts here
    this.onBoundaryExceeded = null; // (body) => {}

    // Gravitational constant in simulation units: AU, Solar masses, Years
    // G = 4π² AU³ / (M☉ · yr²) ≈ 39.478
    // This ensures Kepler's third law: T² = (4π²/GM) a³ → T=1 yr for a=1 AU, M=1 M☉
    this.G = 4 * Math.PI * Math.PI; // ~39.478

    // Temp vectors for calculations (avoid GC pressure)
    this._tempVec = new THREE.Vector3();
    this._forceVec = new THREE.Vector3();
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
   * Main simulation step using Velocity Verlet (Leapfrog) integration
   * More accurate and energy-conserving than Euler
   * @param {number} dt - Timestep in simulation years
   * @param {boolean} skipEvolve - If true, skip age/evolution updates (caller handles them at a different rate)
   */
  step(dt, skipEvolve = false) {
    const bodies = this.getAliveBodies();
    const n = bodies.length;

    // Step 1: Half-step velocity update (kick)
    for (let i = 0; i < n; i++) {
      bodies[i].velocity.addScaledVector(bodies[i].acceleration, dt * 0.5);
    }

    // Step 2: Full-step position update (drift)
    for (let i = 0; i < n; i++) {
      bodies[i].position.addScaledVector(bodies[i].velocity, dt);
    }

    // Step 3: Compute new accelerations
    this.computeAccelerations(bodies);

    // Step 4: Second half-step velocity update (kick)
    for (let i = 0; i < n; i++) {
      bodies[i].velocity.addScaledVector(bodies[i].acceleration, dt * 0.5);
    }

    // Step 4b: Clamp extreme velocities to prevent numerical explosions
    const vMax = 80; // AU/yr — reasonable for stellar orbits
    for (let i = 0; i < n; i++) {
      const vSq = bodies[i].velocity.lengthSq();
      if (vSq > vMax * vMax) {
        bodies[i].velocity.multiplyScalar(vMax / Math.sqrt(vSq));
      }
    }

    // Step 5: Update other body properties (age, rotation, trail, etc.)
    for (let i = 0; i < n; i++) {
      if (!skipEvolve) {
        bodies[i].age += dt;
      }
      bodies[i].rotationAngle += bodies[i].rotationSpeed * dt;

      // Update trail
      bodies[i].trail.push(bodies[i].position.clone());
      if (bodies[i].trail.length > bodies[i].maxTrailLength) {
        bodies[i].trail.shift();
      }

      if (!skipEvolve && bodies[i].evolve) bodies[i].evolve(dt);
    }

    // Step 6: Boundary check (bodies beyond arena radius are destroyed)
    if (this.boundaryEnabled && this.boundaryRadius > 0) {
      const { position: com } = this.centerOfMass();
      this.detectBoundary(bodies, com);
    }

    // Step 7: Collision detection
    if (this.collisionEnabled) {
      this.detectCollisions(this.getAliveBodies());
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
      const dx = body.position.x - com.x;
      const dy = body.position.y - com.y;
      const dz = body.position.z - com.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq > R2) {
        body.logEvent({ type: 'boundary', message: `${body.name} crossed the simulation boundary and was destroyed.` });
        body.destroy();
        if (this.onBoundaryExceeded) this.onBoundaryExceeded(body);
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

  /**
   * Detect and handle collisions between bodies
   */
  detectCollisions(bodies) {
    const collisions = [];

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dist = bodies[i].position.distanceTo(bodies[j].position);
        // Use physical radius in AU; fallback to ~Earth-size if missing
        const r1 = (bodies[i].radius ?? 0.009) * R_SUN_IN_AU;
        const r2 = (bodies[j].radius ?? 0.009) * R_SUN_IN_AU;
        const collisionDist = r1 + r2;

        if (dist < collisionDist) {
          collisions.push([i, j, dist]);
        }
      }
    }

    // Process collisions (skip if either body already dead from prior merge)
    for (const [i, j] of collisions) {
      if (!bodies[i].alive || !bodies[j].alive) continue;
      if (this.mergeEnabled) {
        this.mergeBodies(bodies[i], bodies[j]);
      }
    }
  }

  /**
   * Merge two bodies (the more massive absorbs the less massive)
   */
  mergeBodies(a, b) {
    if (!a.alive || !b.alive) return;
    const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];

    // Conservation of momentum
    const totalMass = big.mass + small.mass;
    big.velocity.multiplyScalar(big.mass / totalMass);
    big.velocity.addScaledVector(small.velocity, small.mass / totalMass);

    // Center of mass
    big.position.multiplyScalar(big.mass / totalMass);
    big.position.addScaledVector(small.position, small.mass / totalMass);

    // Increase mass
    big.mass = totalMass;

    // Log the event
    big.logEvent({
      type: 'collision',
      message: `${big.name} absorbed ${small.name}!`,
      absorbed: small.name,
    });

    // Destroy the smaller body
    small.destroy();
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

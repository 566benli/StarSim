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
    this.softening = 0.05; // Softening parameter to prevent singularities
    this.collisionEnabled = true;
    this.mergeEnabled = true;
    this.boundaryEnabled = true;
    this.boundaryRadius = ARENA_RADIUS_AU;
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
    const vMax = 200; // AU/yr (~95 km/s) - reasonable escape velocity ceiling
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

    // Reset accelerations
    for (let i = 0; i < n; i++) {
      bodies[i].acceleration.set(0, 0, 0);
    }

    // Compute pairwise forces (Newton's third law optimization)
    // a_i = G * Σ m_j * (r_j - r_i) / |r_j - r_i|³
    const Grav = this.G;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bodies[j].position.x - bodies[i].position.x;
        const dy = bodies[j].position.y - bodies[i].position.y;
        const dz = bodies[j].position.z - bodies[i].position.z;

        const distSq = dx * dx + dy * dy + dz * dz + eps2;
        const dist = Math.sqrt(distSq);
        const GinvDist3 = Grav / (distSq * dist);

        // Force magnitude components (with G included)
        const fx = dx * GinvDist3;
        const fy = dy * GinvDist3;
        const fz = dz * GinvDist3;

        // Apply to both bodies (Newton's third law)
        bodies[i].acceleration.x += bodies[j].mass * fx;
        bodies[i].acceleration.y += bodies[j].mass * fy;
        bodies[i].acceleration.z += bodies[j].mass * fz;

        bodies[j].acceleration.x -= bodies[i].mass * fx;
        bodies[j].acceleration.y -= bodies[i].mass * fy;
        bodies[j].acceleration.z -= bodies[i].mass * fz;
      }
    }
  }

  /**
   * Destroy bodies that exceed the arena boundary (infinite energy wall)
   */
  detectBoundary(bodies, com) {
    const R2 = this.boundaryRadius * this.boundaryRadius;
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

# StarSim Physics Module – Core Overview

## 1. GravitySystem (`src/engine/GravitySystem.js`)

### Units
- **Distance**: AU
- **Mass**: Solar masses (M☉)
- **Time**: years
- **G** = 4π² ≈ 39.478 → Kepler III: T = 1 yr for a = 1 AU, M = 1 M☉

### Velocity Verlet Integration (step)
```
1. Kick (half): v += a * dt/2
2. Drift:      x += v * dt
3. Compute new accelerations
4. Kick (half): v += a * dt/2
5. Update age, rotation, trail; call body.evolve(dt)
6. Collision detection
```

### Gravitational Acceleration
- Newton pairwise with softening ε² = 0.01²
- a_i = G Σ m_j (r_j - r_i) / (|r_ji|³ + ε²)^(3/2)
- Uses Newton III (single pass O(n²))

### Collisions
- Merge when distance < 2 × (renderRadius)
- Conservation of momentum and COM
- Smaller body destroyed

---

## 2. SimEngine (`src/engine/SimEngine.js`)

### Update Loop
- `simDt = realDeltaTime × timeScale`
- Sub-steps capped at `maxDtPerStep = 0.02` yr (~1 week)
- `stepsPerFrame = 8` for orbit accuracy

### Planet Creation (Circular Orbit)
- v = √(G×M/r) in AU/yr
- Position: r(cos θ, sin θ sin i, sin θ cos i) relative to parent
- Velocity: tangent to orbit in parent frame

---

## 3. Body Classes (Position/Velocity)

| Class      | Position/Velocity | Notes                               |
|-----------|-------------------|-------------------------------------|
| **Planet**| GravitySystem     | Does not call super.update()        |
| **Star**  | GravitySystem     | Does not call super.update()        |
| **BlackHole** | GravitySystem | No evolve(); motion from Verlet     |

- CelestialBody.update() uses Euler; Star/Planet skip it.
- GravitySystem.step() is the single source of motion.
- Planet.updateOrbit() exists but is never called (N-body used instead).

---

## 4. Status: OK ✓

All components are consistent and suitable for the simulation.

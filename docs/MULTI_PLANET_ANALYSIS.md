# Multi-Planet Orbital Simulation: Analysis & Improvements

## Overview

This document analyzes what enables or hinders proper multi-planet orbital simulation in Genesis Error, compares with reference implementations, and documents the changes made.

---

## 1. Physics Implementation (Current)

### Strengths

- **Velocity Verlet integration**: Symplectic, energy-conserving; better than Euler used in many tutorials
- **G = 4π²** in (AU, M☉, years): Correct for Kepler's third law
- **Pairwise N-body gravity**: All bodies attract all others; no approximations
- **Softening ε² = 0.01²**: Prevents singularities at small separations

### Comparison with CSS-Tricks Gravity Simulator

| Aspect | CSS-Tricks | Genesis Error |
|--------|------------|---------|
| Integrator | Euler (position → accel → velocity) | Velocity Verlet |
| G value | ~39.5 (AU, M☉, years) | 4π² ≈ 39.478 ✓ |
| Softening | dist³ + ε³ style | dist² + ε² ✓ |
| Initial velocity | Circular v = √(GM/r) | Same ✓ |

Our implementation is **physically correct** and in fact more accurate than the tutorial.

---

## 2. Identified Issues & Fixes

### Issue 1: Random orbital angles → Overlap risk

**Problem**: When adding multiple planets at the same orbital distance (e.g., two at 1 AU), each gets a random angle. They can overlap or start very close, triggering instant merger.

**Fix**: Spread sibling planets evenly around the orbit. When adding planet N (with same parent and similar orbital distance as existing siblings), place it at angle = 2π × n / (n+1) relative to the first sibling.

### Issue 2: Eccentricity ignored

**Problem**: Planet presets define `eccentricity` (e.g., Earth 0.017, gas giant 0.05), but we always use circular orbit velocity v = √(GM/r). Eccentric orbits are not supported.

**Fix**: Use vis-viva equation: v = √(GM × (2/r − 1/a)) where a = semi-major axis (orbitalDistance). Place body at true anomaly θ with r = a(1−e²)/(1+e cos θ).

### Issue 3: Collision threshold too large

**Problem**: Collision uses `renderRadius || 0.01` (AU). 0.01 AU ≈ 1.5 Mkm—planets merge when far apart. Physical radii are ~10⁻⁵ AU.

**Fix**: Use physical radius in AU: `radius × (R☉/AU) ≈ radius × 0.00465`.

### Issue 4: Multi-body central mass (minor)

**Problem**: Initial velocity assumes only the parent star. For accurate multi-planet systems, the effective central mass could include inner siblings. Impact is small (M_star >> M_planets) but can be improved.

**Fix**: (Optional) Use M_eff = M_parent + Σ(masses of bodies closer to parent). Deferred as low priority.

---

## 3. Reference: Realistic Ephemeris

For production-quality multi-planet systems, reference data from **NASA JPL HORIZONS** provides exact positions and velocities. Our approach (analytical circular/eccentric init) is appropriate for interactive sandbox creation; for "real solar system" mode, one could later add ephemeris loading.

---

## 4. Changes Implemented

1. **SimEngine.createPlanet**: Orbital spreading for siblings at same distance; eccentricity support via vis-viva
2. **GravitySystem.detectCollisions**: Use physical radius in AU for collision threshold
3. **Constants**: Added R_SUN_IN_AU for radius-to-distance conversion
4. **Planet mass/radius units**: UI passes `mass` in Earth masses; ensure `massEarth`/`radiusEarth` are used correctly so `...overrides` does not overwrite with wrong units
5. **In-app self-check** (App.jsx): After 120 frames with planets, verifies positions changed; logs warning if orbits not evolving

## 5. Manual Verification

1. Run `dist-electron\GenesisError.exe` (or `GenesisError.exe` from project root)
2. Add 1 star (e.g. Sun-like), add 2–3 planets (e.g. Earth-like, Gas Giant)
3. Click **Launch Simulation**
4. Confirm planets orbit the star (trails and motion visible)
5. Optional: run with `--debug` to open DevTools; self-check logs `FAILED` only if orbits do not evolve

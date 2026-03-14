# Simulation Boundary: Evaluation of Two Approaches

## Option A: Closed Surface with Periodic Boundaries

**Idea**: The universe wraps around (e.g. 3-torus topology). When a body or the camera goes past the edge, it reemerges on the opposite side.

| Criterion | Assessment |
|-----------|------------|
| **User Experience** | Mixed. Nothing is ever "lost" – you can always orbit around and find objects. However, wrap-around can be disorienting: two stars may appear close when they're actually far apart on opposite sides. The "finite universe" feel is conceptually appealing. |
| **Adjustability** | Good. Box size is tunable. Could offer torus (1D wrap), 3-torus (3D wrap), etc. |
| **Numerical Stability** | **Problematic**. Gravity is long-range (1/r²). True periodic gravity requires **Ewald summation** or similar – each body feels force from infinite periodic images. Simpler "minimum image" (wrap positions, use shortest distance) works for short-range forces but for gravity: (1) Small boxes cause spurious "ghost" attractions across the wrap; (2) Energy conservation can drift; (3) Edge effects when clusters form near boundaries. |
| **Resource** | Higher. Every force computation needs minimum-image distance: `dx -= L * round(dx/L)` for each component. O(N²) with extra ops per pair. More complex code paths. |

**Verdict**: Conceptually elegant but gravity + periodicity is numerically fraught. Requires careful tuning; small systems risk artifacts.

---

## Option B: Bounded Arena with Destructive Boundary

**Idea**: The simulation has a fixed spherical boundary. Anything exceeding it is destroyed (infinite energy wall). Combined with camera bounds so the view can't drift to infinity.

| Criterion | Assessment |
|-----------|------------|
| **User Experience** | Clear rule: "don't go too far." With a large default boundary (e.g. 100 AU), normal play rarely hits it. Camera bounds prevent the user from "getting lost" – the view stays anchored near the system so you can always find stars. |
| **Adjustability** | Excellent. One parameter: arena radius. Easy to expose in settings. Default can be generous (Neptune ≈ 30 AU; 100 AU covers most use cases). |
| **Numerical Stability** | **Very stable**. No force modifications. Simple distance check per body per step: if `\|r - COM\| > R`, destroy. O(N), trivial. No edge artifacts. |
| **Resource** | Minimal. One distance check per body per step. Negligible overhead. |

**Verdict**: Simple, robust, and achieves the user's goals when combined with camera bounds.

---

## Recommendation: **Option B (Destructive Boundary) + Camera Bounds**

### Why Option B Wins

1. **"User won't jump out of canvas"** → Implement **camera bounds**: clamp the orbit target and max zoom so the view stays near the system. User can always navigate back to stars.

2. **Numerical robustness** → Destructive boundary has zero impact on gravity math. Periodic boundaries require non-trivial modifications with stability risks.

3. **Adjustability** → Single `arenaRadius` parameter. Easy to add a slider in settings.

4. **Resource** → Destructive boundary adds O(N) per step. Periodic would add overhead to every force pair.

### Implementation Plan

- **Physics**: Sphere of radius `arenaRadius` (default 100 AU) centered on system COM. Bodies beyond it are destroyed; event emitted.
- **Camera**: Clamp `controls.target` to stay within `arenaRadius` of COM. Clamp `controls.maxDistance` to `arenaRadius * 1.2` so zoom-out is bounded.
- **Constants**: Add `ARENA_RADIUS_AU = 100` (configurable).

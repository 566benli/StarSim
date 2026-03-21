# StarSim UI performance notes

## Why not Unity for UI?

StarSim ships as **Electron + React + Three.js (WebGL)**. The 3D view is already GPU-accelerated. Dropping in the Unity runtime for overlays would add a second heavy runtime, complicate the build, and duplicate input/rendering paths without a clear win for 2D panels.

Patterns that give **Unity-like responsiveness** in this stack:

1. **Keep React off the hot path** — simulation and `requestAnimationFrame` live in `App.jsx` + `SceneManager`; avoid `setState` every frame except throttled HUD stats (FPS, sim time).
2. **`React.memo` on modal/slow-changing trees** — e.g. save dialog, large static panels, so opening palettes does not re-render the whole app.
3. **`useCallback` / stable props** — handlers passed deep into children should be memoized so memoized children do not invalidate every parent render.
4. **CSS containment** — `contain: layout style` on fixed panels can reduce layout thrash when many DOM nodes update (use sparingly; test in target browsers).
5. **Virtualize long lists** — if event logs or slot lists grow large, consider `react-window` or similar (not required for 10 save slots).
6. **Three.js** — batch updates in `SceneManager`; avoid creating/disposing geometry every frame; reuse buffers (trails already do this).

Future option: a **single full-screen canvas UI** (e.g. custom WebGL/HTML canvas HUD) for maximum control—only worth it if React profiling shows panel updates as a bottleneck.

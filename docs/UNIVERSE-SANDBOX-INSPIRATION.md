# Universe Sandbox–style inspiration (StarSim)

StarSim is an **independent** project. We **do not** fetch, copy, or redistribute code or assets from *Universe Sandbox* or any commercial simulator.

For **design and UX goals** only, we use the same broad ideas many astronomy sandboxes share:

| Idea | How StarSim approaches it |
|------|---------------------------|
| Clear orbit sense | **Trails** behind moving stars/planets (longer history in system view; focused bodies in body view) |
| Click-to-inspect | **Raycast** on body meshes → **Info panel** with properties and **Focus** |
| Scale hierarchy | **Universe / System / Body** views + minimap |
| Time control | Play/pause, presets, slider / warp |

If we add features “like” another product, we implement them here from first principles (Three.js, N-body engine, shaders).

To replace onboarding **illustrations** with real **screenshots** of your build: export PNGs, put them under `assets/onboarding/`, and point `WelcomeFlow.jsx` `ONB(...)` (or `image` fields) at those files.

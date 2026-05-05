# Celestial Bodies — Art Reference

This document describes how every star and planet is drawn after the latest
shader pass, and how the smooth phase-transition / supernova effects work.
The canonical visual reference is the in-app **Art Showcase** preset
(welcome screen → "Art Showcase"); this doc explains *what* each look is
trying to convey and *where* in the code the pixels come from.

> **How to view live:** load *Art Showcase* from the home screen. The cluster
> contains five wings — Star Phase Hall, Planet Zoo, Compact Remnants, Small
> Bodies, VFX Lab. Click into each system from the cluster minimap; the VFX
> Lab is pre-aged so a quick fast-forward triggers the warm phase-blend flash
> and the supernova VFX without waiting for natural evolution.

All shader source lives in [`src/renderer/celestialShaders.js`](../src/renderer/celestialShaders.js)
and the meshes / VFX are assembled in [`src/renderer/SceneManager.js`](../src/renderer/SceneManager.js).
Planet preset palettes come from [`src/data/planetTypes.js`](../src/data/planetTypes.js)
and star presets from [`src/data/starTypes.js`](../src/data/starTypes.js).

---

## 1. Planet paint routines

Every planet uses the same vertex displacement + fragment dispatch pipeline
([`PLANET_VERTEX_GLSL`](../src/renderer/celestialShaders.js), `PLANET_FRAGMENT_GLSL`).
The `planetType` uniform — set from [`planetTypeIndex`](../src/renderer/celestialShaders.js)
in `celestialShaders.js` — selects which painting routine runs:

| Index | Routine          | Subtypes that map to it                        |
|------:|------------------|------------------------------------------------|
| 0     | `paintRocky`     | `rocky_small`, `asteroid`, `rogue_planet`      |
| 1     | `paintEarth`     | `earth_like`, `super_earth`, `ocean_world`     |
| 2     | `paintGas`       | `gas_giant`                                    |
| 3     | `paintIceGiant`  | `ice_giant`                                    |
| 4     | `paintLava`      | `lava_world`                                   |
| 5     | `paintHotJupiter`| `hot_jupiter`                                  |
| 6     | `paintDesert`    | `desert_world`                                 |
| 7     | `paintIcy`       | `comet`, `dwarf_planet`                        |

Per-subtype palette (base / second / accent) is chosen in
[`SceneManager._planetPalette`](../src/renderer/SceneManager.js). Solid surfaces
(types 0, 1, 4, 6, 7) get vertex displacement; gas worlds stay perfectly
spherical.

### 1.1 `paintRocky` — boulders on dusty crust

Layered cellular noise builds boulder bodies on top of warped slate-vs-rust
continents, with crater rims drawn from ridged noise and a frost / lichen
weathering pass tinted toward `accentColor`. Deepest crevices get a cool
blue-grey shadow tint to match the painterly rocky-planet references.

Palette swatches (rocky_small):
<span style="display:inline-block;width:14px;height:14px;background:#c4a882;border:1px solid #888"></span> `#c4a882` base &nbsp;
<span style="display:inline-block;width:14px;height:14px;background:#3c4046;border:1px solid #888"></span> `#3c4046` slate &nbsp;
<span style="display:inline-block;width:14px;height:14px;background:#f3eee5;border:1px solid #888"></span> `#f3eee5` frost

### 1.2 `paintEarth` — shelf-graded oceans, biome bands, drifting clouds

Continents are warped fbm above a `landBias` controlled by `waterCoverage`.
A separate `shelf` mask grades shallow turquoise → deep navy. Latitudinal
biomes (boreal / temperate / desert / equatorial) sit on land, polar caps grow
with `iceCoverage`, and two cloud layers (broad bands + cumulus rosettes)
drift with `time`. `oceanGlow` adds a Fresnel-tinted specular highlight on
water that picks up the warm `accentColor`. The biosphere DataTexture
overlays `paintEarth` so life makes the planet *visibly* greener.

### 1.3 `paintGas` — banded jovian with storm vortices

Horizontal cloud bands (`bandColors[0..2]`) are mixed by latitude, with
warped fbm injecting turbulence between bands and a domain-warped Voronoi
storm vortex sitting near the equator that rotates with `time`.

### 1.4 `paintIceGiant` — pale teal with thin equatorial veins

Soft latitude-banded teal/blue base, fine `snoise` haze breaks up the body,
faint equatorial cloud veins drawn from warped fbm — much subtler than the
gas-giant routine to convey the smooth Uranus/Neptune look.

### 1.5 `paintLava` — magma fissures on basalt crust

Ridged + warped fbm forms a black basalt skin pierced by glowing magma
fissures (mixed toward `accentColor`). A faint scrolling heat-shimmer adds
self-emission so lava worlds glow even on the night side.

### 1.6 `paintHotJupiter` — molten cloud bands

Banded structure like `paintGas` but pushed toward red/orange with a strong
`accentColor` highlight on the dayside; surface is animated faster (`time *
0.4`) to read as a turbulent inferno rather than a placid jovian.

### 1.7 `paintDesert` — dust dunes + rust outcrops

Warped fbm dune fields are coloured with the rust-tinted `secondColor`,
boulder/outcrop highlights from low-frequency Voronoi, and a thin scattering
haze layer adds a warm dust tint near the limb (Fresnel ramp on `viewDir`).

### 1.8 `paintIcy` — Pluto / comet / dwarf planet

Pale ice base with subtle blue tholin stripes drawn from warped fbm, dark
crater pockmarks from ridged noise, and a slight pearly sheen on the day
side. Used for `comet` and `dwarf_planet`. Cometary tail / coma is *not*
shaded here — that would need a separate sprite system.

---

## 2. Stellar phases

A single star shader (`STAR_VERTEX_GLSL`, `STAR_FRAGMENT_GLSL`) handles every
phase. The continuous `phaseValue` uniform morphs the surface treatment so
two stars one phase apart blend smoothly during a transition.

### 2.1 `phaseValue` mapping

| Phase              | `phaseValue` |
|--------------------|-------------:|
| `protostar`        | -0.5         |
| `main_sequence`    |  0.0         |
| `subgiant`         |  1.0         |
| `red_giant`        |  2.0         |
| `asymptotic_giant` |  2.5         |
| `red_supergiant`   |  3.0         |
| `planetary_nebula` |  3.5         |
| `white_dwarf`      |  4.0         |
| `neutron_star`     |  5.0         |

Defined in [`PHASE_VALUES`](../src/renderer/celestialShaders.js); resolved per
body by [`SceneManager._phaseToValue`](../src/renderer/SceneManager.js).
SceneManager *interpolates* this value over real seconds so the surface
morphs between phases instead of snapping.

### 2.2 Surface treatment per phase

* **Protostar / main sequence** — bright tight granulation cells (cell scale
  ~7), sun spots, occasional flare flickers. Limb darkening with a soft
  Fresnel corona tint.
* **Subgiant / red giant / supergiant** — `giantness = smoothstep(1.5, 3.5,
  phaseValue)` deepens the surface toward red, layered convection plumes
  (`fbm(P * 1.8 + time * 0.1)`) and large limb-side cells emerge. Surface
  inflates by up to +15% via `vPosition` scaling.
* **White dwarf** (`phaseValue ≈ 4`) — surface flips to a smooth blue-white
  body with very tight granulation (cell scale ~18); spots and flares fade
  to zero. Brightness ×1.20.
* **Neutron star** (`phaseValue ≈ 5`) — tight bluish-white core (cell scale
  ~36), plus a rotating pulsar beam (`pulsarBeam`) added in pulses driven by
  `time * 4.0`.
* **Planetary nebula** (`phaseValue = 3.5`) — handled visually through the
  outer haze shell rather than the photosphere; the photosphere itself is
  already deep red because it sits in the giantness ramp.

### 2.3 Common lighting

All phases share limb darkening `pow(NdotV, mix(0.45, 0.30, giantness))` and
a Fresnel rim that picks up `starColorHot` strengthened on giants. Net
brightness is `0.85 + 0.15·log(luminosity+1)`, biased up for compact
remnants.

---

## 3. Compact remnants

Black holes do **not** use the star fragment shader. They get their own mesh
in [`SceneManager.createBlackHoleMesh`](../src/renderer/SceneManager.js):
event-horizon disk + lensing halo + accretion ring sprite. White dwarfs and
neutron stars *do* use the star shader (with high `phaseValue`) because
their surfaces are fundamentally just very hot, very small photospheres.

When a body's underlying mesh type needs to change (e.g. star → black hole
on supernova), `updateBodyVisual` detects the drift via `userData.bodyType`
and calls [`_rebuildBodyMesh`](../src/renderer/SceneManager.js), which
disposes the old group and creates a fresh one of the correct type.

---

## 4. Small bodies

`asteroid` and `rogue_planet` reuse `paintRocky` (type 0); `comet` and
`dwarf_planet` reuse `paintIcy` (type 7). They differ from full-size rocky
or icy worlds only in their preset palette and (for asteroids/comets)
their tiny radius. The "Small Bodies" wing of the showcase puts an asteroid,
comet, and dwarf planet around a single sun_like host so all three icy/rocky
small-body looks can be compared with consistent lighting.

---

## 5. Transitions and VFX

Phase changes go through two layered effects so the shift reads cleanly even
during fast-forward.

### 5.1 Smooth phase-blend overlay (every transition)

When `SimEngine.onPhaseChange` fires, `App.jsx` forwards it to
[`SceneManager.handlePhaseChange`](../src/renderer/SceneManager.js), which
sets `userData.phaseBlendTimeLeft = 4.0` on the body's mesh group. Each
frame, `updateBodyVisual` ramps the `phaseBlend` uniform from 1 → 0 over 4
seconds. Inside `STAR_FRAGMENT_GLSL` this overlays a warm Fresnel-rimmed
flash:

```glsl
if(phaseBlend > 0.001){
  float ring = pow(1.0 - NdotV, 1.5);
  col += vec3(1.0, 0.82, 0.45) * ring * phaseBlend * 0.55;
  col *= 1.0 + phaseBlend * 0.20;
}
```

In parallel, `phaseValue` is interpolated from the *old* phase value to the
*new* phase value over a short window so the surface treatment morphs
smoothly (granulation cell size shifts, giantness ramps, the pulsar beam
fades in for neutron stars, etc.).

### 5.2 Collapse flash — `_spawnTransitionFlash`

For collapse phases (`white_dwarf`, `neutron_star`, `black_hole`)
`handlePhaseChange` additionally spawns a short-lived expanding additive
sphere via [`_spawnTransitionFlash`](../src/renderer/SceneManager.js).
Colour depends on the destination phase: blue-white for neutron stars,
warm amber for black holes / white dwarfs. The mesh fades and inflates over
2.4 s, then auto-disposes.

### 5.3 Supernova — `_spawnSupernova`

Supernovae are emitted as a `supernova_explosion` VFX event from
[`SimEngine`](../src/engine/SimEngine.js) → forwarded to
[`SceneManager.handleVfxEvent`](../src/renderer/SceneManager.js) →
[`_spawnSupernova`](../src/renderer/SceneManager.js). Three additive meshes
animate in `_updateVfx`:

1. **Core flash** — bright cream sphere, scales 0.05 → ~3 over the first
   ~0.6 s and then fades out.
2. **Shockwave shell** — orange BackSide sphere, expands much wider
   (~12× over a few seconds) and fades.
3. **Nebula remnant** — soft violet sphere, slow gentle inflate, lingers
   the longest before fading to zero.

All three live in the `_activeVfx` queue and are stepped from
[`SceneManager.render`](../src/renderer/SceneManager.js) → `_updateVfx`. The
queue auto-disposes geometries and materials when each effect completes.

---

## 6. How to view (Art Showcase preset)

1. Launch Genesis Error (web or `dist-electron/GenesisError.exe`).
2. From the welcome screen, pick the **Art Showcase** preset (palette icon).
3. The cluster minimap shows five wings:
   * **Star Phase Hall** — six single-star systems for each main phase.
   * **Planet Zoo** — one sun_like surrounded by all 11 planet subtypes.
   * **Compact Remnants Wing** — white dwarf, neutron star, black hole.
   * **Small Bodies Wing** — sun_like host with asteroid, comet, dwarf planet.
   * **VFX Lab** — a red supergiant + red giant pre-loaded near end of
     phase. Fast-forward (or use the in-panel demo button) to see the
     phase-blend flash and the full supernova VFX without waiting.
4. Click any system to drop into its scene; press `F` (Fit) to frame it.

Out of scope for this doc: comet tails, accretion-disk shaders for black
holes (handled separately in `createBlackHoleMesh`), and screenshot capture
— the in-app showcase is the canonical visual source.

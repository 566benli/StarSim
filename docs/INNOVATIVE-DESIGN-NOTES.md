# StarSim — Innovative Design Notes: Five-Layer Simulation Architecture

> Saved from project vision session. These notes define the long-term roadmap and key
> design directions for StarSim's development, organized into five progressive layers.

---

## Overview

StarSim aspires to be a scientifically rigorous yet accessible universe sandbox —
something between a game and a true astrophysical simulator. The architecture is
organized into five ascending layers of complexity, each building on the previous.

---

## Layer 1: Stellar and Orbital Physics ⭐ (Current Focus)

The physical foundation of everything.

### Key Directions

- **N-body gravity** with Velocity Verlet integration (already working)
- **Continuous collision detection (CCD)** via swept-sphere to prevent tunneling
- **Adaptive sub-stepping** for high-velocity close-encounter scenarios
- **Multi-stage collision resolution** (replacing simple merge):
  - Grazing encounter → orbital perturbation
  - Partial mass stripping → outer layers lost
  - Tidal disruption → smaller body disrupted
  - Inelastic merger → some ejecta mass
  - Stellar fusion / coalescence → new star with recomputed properties
  - Catastrophic explosion → shockwave + remnant + ejecta
  - Direct collapse → immediate black hole formation
  - BH accretion / tidal disruption → accretion glow + VFX
- **Conservation laws enforced**: mass (minus ejecta), linear momentum, angular momentum, energy bookkeeping
- **Stellar evolution physics** already working (main-seq → giant → supernova → remnant)
- **Simulation-driven events** not random: supernova spawns actual remnant, ejects mass, radiates
- **Radiation model**: each star emits UV/X-ray/total flux as gameplay variable
- **Orbital stability analysis**: detect ejected/bound/captured bodies via specific orbital energy
- **Special compact object logic**: WD+WD = Type Ia nova, NS+NS = kilonova, BH absorption
- **VFX payloads**: all major events generate animation-driving data structs

### Key Files (after refactor)
- `src/engine/CollisionSystem.js` — multi-stage collision outcomes
- `src/engine/RadiationSystem.js` — radiation flux + aberrance computation
- `src/engine/CatastropheSystem.js` — shockwave/explosion propagation to nearby bodies
- `src/engine/OrbitalAnalysisSystem.js` — orbital stability + capture logic
- `src/engine/GravitySystem.js` — now uses CCD + CollisionSystem
- `src/engine/Star.js` — enhanced supernova with VFX payloads
- `src/engine/SimEngine.js` — orchestrates all subsystems

---

## Layer 2: Planetary System 🌍

How planetary systems form, survive, and evolve in response to stellar events.

### Key Directions

- Planetary formation from debris disk (accretion, competing planetesimals)
- Moon formation from giant impacts
- Roche limit calculations → ring formation vs. tidal disruption
- Resonance chains (like Trappist-1) and Laplace resonance
- Planet migration (type I/II) based on disk interactions
- Atmospheric chemistry and escape (Jeans escape, photodissociation)
- Habitability scoring: temperature, pressure, magnetic field, star UV environment
- Planetary geology (plate tectonics timer, volcanism activity)
- Water delivery (icy body impacts → ocean worlds)
- Snowline position as function of stellar luminosity
- Radiation damage from Layer 1 driving atmospheric loss and biosphere damage

---

## Layer 3: Life Evolution 🧬

Emergence and evolution of life as a simulation-driven process.

### Key Directions

- Abiogenesis probability: function of surface chemistry, temperature, liquid water, radiation flux
- Simple → complex life transitions (Cambrian-style explosions)
- Mass extinction events driven by Layer 1-2 physics (supernova radiation, impact events)
- Adaptation rate vs. environmental change rate
- Evolutionary trees (branching lineages tracked as game data)
- Intelligence emergence as probabilistic milestone
- Aberrance probability: radiation-induced mutation driving accelerated evolution or extinction
- Panspermia: life transfer between planets via impact ejecta
- Ocean worlds (subsurface oceans) as hidden life candidates
- Extremophile niches (volcanic vents, ice-covered oceans)

---

## Layer 4: Civilization Dynamics 🏙️

The emergence and development of technological civilizations.

### Key Directions

- Technology level progression (Kardashev scale: K0 → K1 → K2 → K3)
- Population dynamics: birth rate, death rate, resource limits
- Resource extraction: mining asteroids, stellar energy collection
- Interplanetary colonization
- War, cooperation, trade between civilizations on different planets
- Cultural differentiation based on environmental pressures
- Religious/political emergence as emergent phenomena
- Technological disasters: nuclear war, grey goo, climate collapse
- SETI/METI: civilizations broadcasting signals, others detecting
- First contact scenarios
- Dyson sphere construction progress meter

---

## Layer 5: Space Civilization 🚀

Civilizations that have mastered interstellar travel and can reshape stellar systems.

### Key Directions

- Interstellar travel: generation ships, laser sail, warp-like drives (gameplay scale)
- Stellar engineering: star lifting, binary star stabilization
- Megastructures: Dyson spheres, Shkadov thrusters, ring worlds
- Intergalactic colonization wave (speed of spread as physics)
- The Fermi Paradox as an emergent simulation outcome
- Great Filters: which layer is the bottleneck?
- Galactic empire formation and collapse
- Von Neumann probe swarms
- Omega Point / post-physical civilizations

---

## Design Principles

1. **Physics-first**: all events must be driven by simulation, not random text generators
2. **Each layer emerges from the previous**: life emerges from planetary conditions, civilizations from life
3. **Player agency at every layer**: intervene at any scale
4. **Universe Sandbox spirit**: beautiful, awe-inspiring, scientifically grounded
5. **Modular architecture**: each layer is a subsystem that can be toggled, extended, or replaced

---

## Implementation Priority (Near-term)

The **Layer 1** refactor is the immediate priority, specifically:

1. Prevent tunneling → CCD + swept-sphere collision detection
2. Multi-stage collision outcomes (not just merge)
3. Simulation-driven supernova (remnant spawning, shockwave, VFX)
4. Radiation model → aberrance probability hook for Layer 3
5. VFX payloads → animation-driving events for Three.js scene

---

*Last updated: 2026-03-19 — StarSim physics upgrade session*

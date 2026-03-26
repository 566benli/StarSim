# StarSim Life Evolution Implementation Plan

## Purpose

This document turns the Life Evolution concept into a practical implementation plan for StarSim.

The goal is to add life evolution in a way that is:

- physics-driven rather than purely random
- compatible with the current simulation architecture
- easy to balance for gameplay
- incremental, so each milestone can ship and be tested
- extensible toward future civilization systems

## Current Baseline

StarSim already contains the first hooks needed for life simulation:

- `Planet.js` has habitability checks, abiogenesis probability, and life extinction
- `RadiationSystem.js` computes radiation flux, UV, X-ray, and aberrance probability
- `CatastropheSystem.js` can damage biospheres via catastrophic events
- `SimEngine.js` already orchestrates layered simulation subsystems
- `InfoPanel.jsx` already exposes basic life-related fields such as `hasLife`

This means Life Evolution should be implemented as a proper subsystem, not as scattered extra logic inside `Planet.js`.

## Core Recommendation

Do not expand the current `hasLife` boolean into a larger pile of booleans.

Instead, add a dedicated `LifeEvolutionSystem` that simulates:

1. environmental suitability
2. abiogenesis
3. biosphere growth
4. adaptation and mutation pressure
5. stage progression
6. extinction and recovery
7. optional intelligence emergence

This system should be configurable from one central balance file so gameplay tuning is easy.

## Design Principles

### 1. Physics-first

Life should emerge from planetary and stellar conditions already produced by the simulation:

- temperature
- water presence
- atmosphere
- radiation
- magnetic field
- impacts and catastrophe damage
- long-term environmental stability

### 2. Continuous over binary

Avoid only threshold-based logic like "habitable or not" and "life or no life".

Prefer continuous values such as:

- `habitabilityScore`
- `biosphereHealth`
- `adaptationLevel`
- `mutationPressure`
- `extinctionPressure`
- `environmentalStability`

This makes the system feel more natural and much easier to tune.

### 3. Tunability is mandatory

All life-evolution numbers should live in one balancing file, not in hard-coded literals spread across engine files.

This is especially important for gameplay because the user should be able to rebalance:

- how quickly life emerges
- how resilient life is
- how strong catastrophes are
- how much radiation helps or harms evolution
- how often intelligence appears

### 4. Layered implementation

Ship the feature in stages:

1. biosphere foundation
2. stage-based evolution
3. intelligence emergence hook
4. optional future civilization systems

## Main Gaps In The Current Code

### `Planet.js` is too simple

Current planet life logic is limited to:

- one abiogenesis probability
- one `hasLife` boolean
- one extinction rule

That is not enough for meaningful evolution gameplay.

### Balance values are scattered

Life-related behavior is currently controlled by hard-coded numeric literals in:

- `src/engine/Planet.js`
- `src/engine/RadiationSystem.js`
- `src/engine/CatastropheSystem.js`

This will become hard to maintain if Life Evolution grows.

### Persistence is not deep enough yet

Rich biosphere state must survive save/load cycles.

If new life fields are added, serialization and deserialization need to be updated immediately so testing is reliable.

## Proposed Architecture

## New Files

### `src/engine/LifeEvolutionSystem.js`

Responsible for all biosphere and evolution logic.

Suggested responsibilities:

- calculate derived habitability scores
- advance prebiotic chemistry
- perform abiogenesis checks
- update biosphere health
- simulate mutation and adaptation pressure
- progress life stages
- apply extinction and recovery
- trigger life-related events
- expose debug data to UI and AI systems

### `src/data/lifeEvolutionConfig.js`

Central balancing data for the entire feature.

This file should contain:

- thresholds
- progression rates
- extinction rates
- mutation multipliers
- intelligence probabilities
- preset packs for balancing

### Optional later file: `src/data/lifeStageDefinitions.js`

Useful if life stages grow more complex.

Can define each stage's:

- requirements
- progression target
- display name
- icon
- gameplay effects

## Existing Files To Extend

### `src/engine/Planet.js`

Add persistent biosphere state and derived life metrics.

Recommended new fields:

- `lifeStage`
- `biosphereHealth`
- `habitabilityScore`
- `environmentalStability`
- `adaptationLevel`
- `mutationPressure`
- `extinctionPressure`
- `prebioticChemistry`
- `biodiversity`
- `oxygenation`
- `intelligencePotential`
- `intelligenceEmergence`
- `lifeOrigin`
- `lastLifeStageChangeTime`
- `biosphereHistory`

Keep `hasLife` as a derived compatibility field for older UI and game logic.

### `src/engine/SimEngine.js`

Instantiate and run the new `LifeEvolutionSystem`.

Recommended order inside update loop:

1. gravity and body evolution
2. radiation update
3. catastrophe propagation
4. life evolution update
5. event generation / UI publication

Life should react to already-updated physical conditions from the current tick.

### `src/engine/RadiationSystem.js`

Keep existing radiation output, but explicitly treat it as life-system input.

Recommended additions:

- expose safe-band radiation scoring
- distinguish beneficial mutation pressure from lethal exposure
- provide a normalized life-impact metric instead of only raw flux values

### `src/engine/CatastropheSystem.js`

Connect catastrophic outcomes to biosphere state instead of only toggling `hasLife`.

Examples:

- partial biosphere collapse
- mass extinction
- long-term atmosphere damage
- recovery debt after catastrophe

### `src/ui/components/InfoPanel.jsx`

Add a dedicated Life section for planets.

Suggested fields to display:

- life stage
- habitability score
- biosphere health
- environmental stability
- mutation pressure
- extinction pressure
- biodiversity
- intelligence potential
- life origin

### `src/ai/prompts.js` and `src/ai/AIAgent.js`

Teach the AI assistant to understand life-stage state and explain it clearly.

The AI should be able to answer:

- why life emerged
- why it collapsed
- whether a planet is trending toward complex life
- which parameters the player can tune

## Recommended Life Model

## Planet State Model

Use a staged model rather than a single boolean:

- `none`
- `prebiotic`
- `microbial`
- `complex`
- `intelligent`

Optional later additions:

- `subsurface`
- `synthetic`
- `post-biological`

## Core Derived Scores

### `habitabilityScore`

Weighted score derived from:

- temperature suitability
- atmosphere retention
- liquid water potential
- radiation environment
- magnetic shielding
- surface damage

### `environmentalStability`

Measures whether conditions remain good over long periods, not just the current instant.

This is important because life should not flourish on a planet that swings violently between states.

### `biosphereHealth`

Represents how robust and abundant life currently is.

This supports:

- partial collapse
- slow recovery
- near-extinction states
- stronger progression gating

### `mutationPressure`

Driven by:

- UV/X-ray radiation
- catastrophes
- extreme environments

Should not always be bad. Moderate mutation pressure can accelerate adaptation and stage progression. Excessive pressure should increase extinction risk.

### `extinctionPressure`

Driven by:

- harsh climate changes
- radiation bursts
- catastrophic impacts
- atmosphere collapse
- rapid stellar changes

## Stage Progression Model

### Stage 0: `none`

No meaningful prebiotic chemistry.

### Stage 1: `prebiotic`

Conditions support organic chemistry but not living cells yet.

Progress mainly depends on:

- water
- chemistry
- stable energy input
- enough time

### Stage 2: `microbial`

Simple life exists and can persist under a wide range of conditions.

Microbial life should be the most resilient stage.

### Stage 3: `complex`

Requires long-term stability, stronger biosphere health, and moderate mutation/adaptation balance.

This is where major extinction and recovery loops become interesting.

### Stage 4: `intelligent`

Should be rare and treated as a milestone hook for future civilization systems rather than a full civilization sim in the first implementation.

## Required Tunability Strategy

## Central Config Structure

Suggested file structure for `src/data/lifeEvolutionConfig.js`:

```js
export const LIFE_CONFIG = {
  preset: 'gameplay',
  global: {
    enabled: true,
    lifeRateMultiplier: 1.0,
    adaptationRateMultiplier: 1.0,
    catastropheSeverityMultiplier: 1.0,
    intelligenceRateMultiplier: 1.0,
  },
  emergence: {
    abiogenesisBaseRate: 1e-12,
    waterWeight: 1.5,
    chemistryWeight: 1.0,
    stabilityWeight: 1.2,
  },
  habitability: {
    idealTemp: 288,
    minTemp: 180,
    maxTemp: 380,
    radiationSweetSpot: 1.0,
    lethalRadiationThreshold: 1000,
  },
  progression: {
    prebioticToMicrobial: 0.25,
    microbialToComplex: 0.60,
    complexToIntelligent: 0.90,
  },
  adaptation: {
    recoveryRate: 0.01,
    mutationBenefitChance: 0.6,
    mutationCollapseChance: 0.15,
  },
  extinction: {
    instabilityPenalty: 0.02,
    atmosphereLossPenalty: 0.03,
    catastropheShockPenalty: 0.2,
  },
};
```

The exact numbers can be tuned later, but the structure should exist from the beginning.

## Preset Packs

Add at least three presets:

- `realistic`
- `gameplay`
- `chaotic`

Purpose of each preset:

- `realistic`: slower emergence, rarer intelligence, less arcade-like progression
- `gameplay`: faster visible outcomes for normal play sessions
- `chaotic`: high mutation, high extinction, dramatic histories

## Top-Level Balance Knobs

Expose a few simple multipliers so balancing is fast without rewriting formulas:

- `lifeRateMultiplier`
- `adaptationRateMultiplier`
- `extinctionRateMultiplier`
- `radiationImpactMultiplier`
- `catastropheSeverityMultiplier`
- `intelligenceRateMultiplier`

These should be easy to expose in a future debug or settings panel.

## Subsystem Behavior

## `LifeEvolutionSystem` update flow

Each update should follow a stable sequence:

1. gather all alive planets
2. derive environmental metrics from current planet state
3. update long-term stability trackers
4. update prebiotic chemistry progress
5. evaluate abiogenesis
6. update biosphere health
7. apply mutation and adaptation
8. evaluate stage progression
9. apply collapse or extinction
10. emit events and cache UI-facing debug values

## Continuous Scoring Instead Of Hard Thresholds

Examples:

- temperature should contribute a smooth score, not a single yes/no cutoff
- radiation should have a beneficial middle band and a lethal upper band
- atmospheric pressure should degrade survivability gradually
- stability should depend on recent trends, not only current values

This makes planets feel distinct and makes balancing significantly easier.

## Event Integration

Life-related events should be simulation-driven and sparse.

Recommended event types:

- prebiotic chemistry established
- life emerged
- oxygenation event
- complex life transition
- mass extinction
- biosphere collapse
- recovery era
- intelligence emerged

These can reuse the existing event-notification pipeline.

## Save/Load Requirements

Before shipping the feature, update planet persistence to include all new life state.

Required work:

- extend `Planet` serialization
- restore life-stage fields in `Planet.fromJSON`
- ensure `SimEngine` save/load round trips preserve biosphere state

Without this, balancing and debugging will be unreliable.

## UI Plan

## Info Panel

Add a new Life section when the selected body is a planet.

Recommended contents:

- current life stage
- compact status badge
- habitability score
- biosphere health
- environmental stability
- mutation pressure
- extinction pressure
- biodiversity
- intelligence potential
- origin note

## Debug / Tuning Panel

Strongly recommended for gameplay balancing.

This can be a simple internal panel at first with:

- preset selector
- top-level multipliers
- on/off toggles for life simulation
- optional logs for why a planet advanced or regressed

This will save significant time during balancing.

## AI Integration Plan

Extend AI context so the assistant can describe life development accurately.

Recommended additions to AI context:

- number of living planets
- each planet's life stage
- strongest habitability candidates
- ongoing extinction pressures
- recent life evolution events

This will make the AI feel much more aware of the simulation.

## Phased Implementation Roadmap

## Phase 1: Biosphere Foundation

Goal: replace boolean life with a proper planet biosphere state.

Tasks:

- create `src/data/lifeEvolutionConfig.js`
- add new biosphere fields to `Planet.js`
- create `src/engine/LifeEvolutionSystem.js`
- integrate system into `SimEngine.js`
- compute `habitabilityScore`, `biosphereHealth`, and `environmentalStability`
- keep `hasLife` as a derived compatibility field
- add persistence for new life fields

Deliverable:

- planets can move between `none`, `prebiotic`, and `microbial`
- results survive save/load

## Phase 2: Evolution Progression

Goal: make life histories interesting and visible.

Tasks:

- add `complex` life stage
- add mutation pressure and adaptation
- connect radiation and catastrophes more deeply to biosphere changes
- add stage transition events
- add recovery after extinction
- expose new fields in `InfoPanel.jsx`

Deliverable:

- planets develop distinct biosphere histories rather than only flipping on/off

## Phase 3: Intelligence Hook

Goal: establish a bridge to future civilization gameplay.

Tasks:

- add `intelligent` milestone logic
- track `intelligencePotential`
- emit milestone events
- expose intelligence-related state to UI and AI

Deliverable:

- rare intelligent-life emergence, but not yet full civilization simulation

## Phase 4: Optional Advanced Features

Only after the core loop feels good.

Possible additions:

- panspermia between planets
- subsurface ocean biospheres
- extremophile niche bonuses
- lightweight lineage summaries
- full phylogenetic tree visualization

## Risk Management

### Risk: Too random

If life feels arbitrary, the system will not match StarSim's physics-first identity.

Mitigation:

- tie emergence and extinction to derived planetary metrics
- log why transitions happened

### Risk: Too slow to be fun

If realistic rates are used everywhere, players may never see life evolve.

Mitigation:

- use balancing presets
- keep `gameplay` as the default preset

### Risk: Too hard to balance

If numbers live in multiple files, tuning will become frustrating.

Mitigation:

- centralize all tuning in one config file
- expose top-level multipliers

### Risk: Save/load incompatibility

If biosphere state is not serialized well, testing will give misleading results.

Mitigation:

- implement persistence in the earliest milestone

## Recommended First Milestone

The best next implementation target is:

1. add `lifeEvolutionConfig.js`
2. add `LifeEvolutionSystem.js`
3. upgrade `Planet.js` to store biosphere state
4. integrate the subsystem into `SimEngine.js`
5. add a Life section to `InfoPanel.jsx`

This is the smallest version that creates a real framework rather than another temporary patch.

## Summary

The Life Evolution concept is a strong fit for StarSim, but it should be implemented as a dedicated, tunable subsystem rather than as extra if-statements inside planet logic.

The key decision is:

- model life as staged, persistent, and score-driven
- centralize every gameplay balance value in a dedicated config file
- keep intelligence as a milestone hook for future civilization systems

If implemented this way, Life Evolution can become one of StarSim's defining systems while remaining practical to tune and extend.

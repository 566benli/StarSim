/**
 * techTree.js — Technology tree for civilizations
 *
 * Inspired by Kardashev scale (I/II/III) and WorldBox tech progression.
 * Each tech has a category, tier, prerequisites, icon and gameplay effects.
 *
 * Tier mapping → Kardashev / civ stage:
 *   Tier 1-2  → Pre-industrial / Industrial   (Kardashev approaching I)
 *   Tier 3    → Atomic / Space age             (Kardashev I)
 *   Tier 4    → Interplanetary / Stellar       (Kardashev II)
 *   Tier 5    → Galactic / Transcendent        (Kardashev III)
 */

export const TECH_CATEGORIES = {
  energy:    { id: 'energy',    label: 'Energy',    icon: '⚡' },
  computing: { id: 'computing', label: 'Computing', icon: '💻' },
  transport: { id: 'transport', label: 'Transport', icon: '🚀' },
  materials: { id: 'materials', label: 'Materials', icon: '⚙️' },
  weapons:   { id: 'weapons',   label: 'Weapons',   icon: '⚔️' },
  biology:   { id: 'biology',   label: 'Biology',   icon: '🧬' },
};

export const KARDASHEV_LEVELS = {
  0: { label: 'Pre-Civilization',  description: 'Intelligent life exists but no organized civilization yet.',        color: '#888888' },
  1: { label: 'Type I',           description: 'Mastery of planetary energy. Nuclear power, early space flight.',   color: '#44aaff' },
  2: { label: 'Type II',          description: 'Mastery of stellar energy. Dyson spheres, interstellar travel.',   color: '#ffaa00' },
  3: { label: 'Type III',         description: 'Mastery of galactic energy. FTL, wormholes, star-scale weapons.',  color: '#ff44cc' },
};

export const CIV_STAGES = {
  tribal:        { label: 'Tribal',          icon: '🏕️',  kardashev: 0, techTier: 0, description: 'Small bands, stone tools, oral tradition.' },
  ancient:       { label: 'Ancient',         icon: '🏛️',  kardashev: 0, techTier: 1, description: 'City-states, written language, early agriculture.' },
  industrial:    { label: 'Industrial',      icon: '🏭',  kardashev: 0, techTier: 2, description: 'Steam engines, mass production, global communication.' },
  atomic:        { label: 'Atomic Age',      icon: '☢️',  kardashev: 1, techTier: 3, description: 'Nuclear power, space rockets, early computers.' },
  space:         { label: 'Space Age',       icon: '🛰️',  kardashev: 1, techTier: 3, description: 'Orbital stations, planetary colonization, AI.' },
  interplanetary:{ label: 'Interplanetary',  icon: '🌍',  kardashev: 1, techTier: 4, description: 'Empire across multiple worlds in a star system.' },
  stellar:       { label: 'Stellar Empire',  icon: '⭐',  kardashev: 2, techTier: 4, description: 'Dyson spheres, star-lifting, interstellar probes.' },
  interstellar:  { label: 'Interstellar',    icon: '🌌',  kardashev: 2, techTier: 4, description: 'FTL-capable empire spanning multiple star systems.' },
  galactic:      { label: 'Galactic',        icon: '🌀',  kardashev: 3, techTier: 5, description: 'Dominion over entire galaxies, wormhole networks.' },
  transcendent:  { label: 'Transcendent',    icon: '✨',  kardashev: 3, techTier: 5, description: 'Post-physical existence, universe-scale engineering.' },
};

/** All technologies. Each has: id, category, tier, requires[], label, icon, description, effects{} */
export const TECH_TREE = [
  // ─── ENERGY ──────────────────────────────────────────────────────────────
  {
    id: 'fire',         category: 'energy', tier: 1, requires: [],
    label: 'Fire Mastery',   icon: '🔥',
    description: 'Controlled use of combustion for warmth, cooking, and light.',
    effects: { unlockCivStage: 'ancient', techPointRate: 0.02 },
  },
  {
    id: 'steam_power',  category: 'energy', tier: 2, requires: ['fire'],
    label: 'Steam Power',    icon: '🏭',
    description: 'Thermodynamic engines drive industry and transportation.',
    effects: { unlockCivStage: 'industrial', techPointRate: 0.05, populationGrowth: 0.1 },
  },
  {
    id: 'nuclear_energy', category: 'energy', tier: 3, requires: ['steam_power', 'electronics'],
    label: 'Nuclear Energy', icon: '☢️',
    description: 'Fission reactors provide enormous energy density.',
    effects: { unlockCivStage: 'atomic', kardashevProgress: 0.3, techPointRate: 0.15 },
  },
  {
    id: 'fusion_power',  category: 'energy', tier: 4, requires: ['nuclear_energy', 'exotic_matter_lite'],
    label: 'Fusion Power',   icon: '💥',
    description: 'Controlled hydrogen fusion — the power of a star in a bottle.',
    effects: { kardashevProgress: 0.5, techPointRate: 0.3, unlockMegastructure: 'fusion_reactor' },
  },
  {
    id: 'dyson_sphere',  category: 'energy', tier: 5, requires: ['fusion_power', 'stellar_engineering'],
    label: 'Dyson Sphere',   icon: '🌐',
    description: 'A megastructure enclosing a star, harvesting virtually all its energy output.',
    effects: { kardashevLevel: 2, unlockMegastructure: 'dyson_sphere', techPointRate: 1.0, unlockCivStage: 'stellar' },
  },

  // ─── COMPUTING ───────────────────────────────────────────────────────────
  {
    id: 'mathematics',   category: 'computing', tier: 1, requires: [],
    label: 'Mathematics',    icon: '📐',
    description: 'Abstract reasoning, numerical systems, and geometric principles.',
    effects: { techPointRate: 0.01 },
  },
  {
    id: 'electronics',   category: 'computing', tier: 2, requires: ['mathematics'],
    label: 'Electronics',    icon: '⚡',
    description: 'Transistors and integrated circuits enable complex computation.',
    effects: { techPointRate: 0.08, unlockCivStage: 'industrial' },
  },
  {
    id: 'artificial_intelligence', category: 'computing', tier: 3, requires: ['electronics', 'quantum_materials'],
    label: 'Artificial Intelligence', icon: '🤖',
    description: 'Machine learning systems surpass biological intelligence in specific domains.',
    effects: { techPointRate: 0.2, kardashevProgress: 0.2, populationGrowth: 0.05 },
  },
  {
    id: 'quantum_computing', category: 'computing', tier: 4, requires: ['artificial_intelligence', 'exotic_matter_lite'],
    label: 'Quantum Computing', icon: '💻',
    description: 'Quantum superposition enables exponential computational speed-up.',
    effects: { techPointRate: 0.4, unlockMegastructure: 'matrioshka_brain' },
  },
  {
    id: 'mind_upload',   category: 'computing', tier: 5, requires: ['quantum_computing', 'cybernetics'],
    label: 'Mind Upload',    icon: '🧠',
    description: 'Conscious experience transferred to substrate-independent digital form.',
    effects: { unlockCivStage: 'transcendent', kardashevLevel: 3, techPointRate: 2.0 },
  },

  // ─── TRANSPORT ───────────────────────────────────────────────────────────
  {
    id: 'seafaring',     category: 'transport', tier: 1, requires: [],
    label: 'Seafaring',      icon: '⛵',
    description: 'Ocean-going vessels allow global exploration and trade.',
    effects: { techPointRate: 0.01 },
  },
  {
    id: 'rocketry',      category: 'transport', tier: 3, requires: ['seafaring', 'nuclear_energy'],
    label: 'Rocketry',       icon: '🚀',
    description: 'Chemical rockets break the gravity well and reach orbit.',
    effects: { unlockCivStage: 'space', unlockColonization: 'planetary', kardashevProgress: 0.15 },
  },
  {
    id: 'interplanetary_travel', category: 'transport', tier: 4, requires: ['rocketry', 'fusion_power'],
    label: 'Interplanetary Drive', icon: '🛸',
    description: 'Fusion-powered ships enable colonization of neighboring planets.',
    effects: { unlockCivStage: 'interplanetary', unlockColonization: 'system', kardashevLevel: 1 },
  },
  {
    id: 'ftl_drive',     category: 'transport', tier: 5, requires: ['interplanetary_travel', 'wormhole_tech'],
    label: 'FTL Drive',      icon: '🌌',
    description: 'Faster-than-light travel makes interstellar empire possible.',
    effects: { unlockCivStage: 'interstellar', unlockColonization: 'interstellar', kardashevLevel: 2 },
  },

  // ─── MATERIALS ───────────────────────────────────────────────────────────
  {
    id: 'metallurgy',    category: 'materials', tier: 1, requires: [],
    label: 'Metallurgy',     icon: '⚒️',
    description: 'Smelting and forging metals for tools, weapons, and construction.',
    effects: { techPointRate: 0.01 },
  },
  {
    id: 'quantum_materials', category: 'materials', tier: 3, requires: ['metallurgy', 'electronics'],
    label: 'Quantum Materials', icon: '🔬',
    description: 'Room-temperature superconductors and topological insulators.',
    effects: { techPointRate: 0.1 },
  },
  {
    id: 'exotic_matter_lite', category: 'materials', tier: 4, requires: ['quantum_materials', 'fusion_power'],
    label: 'Exotic Matter',  icon: '💫',
    description: 'Matter with negative energy density enables warp fields and wormhole throats.',
    effects: { techPointRate: 0.2, unlockMegastructure: 'ringworld_segment' },
  },
  {
    id: 'stellar_engineering', category: 'materials', tier: 4, requires: ['exotic_matter_lite'],
    label: 'Stellar Engineering', icon: '⭐',
    description: 'Techniques to directly manipulate stellar structure and output.',
    effects: { unlockMegastructure: 'stellar_engine', kardashevProgress: 0.4 },
  },
  {
    id: 'wormhole_tech', category: 'materials', tier: 5, requires: ['exotic_matter_lite', 'quantum_computing'],
    label: 'Wormhole Engineering', icon: '🕳️',
    description: 'Stable traversable wormholes connect distant points in spacetime.',
    effects: { unlockCivStage: 'galactic', unlockMegastructure: 'wormhole_gate', kardashevLevel: 3 },
  },

  // ─── WEAPONS ─────────────────────────────────────────────────────────────
  {
    id: 'conventional_weapons', category: 'weapons', tier: 1, requires: ['metallurgy'],
    label: 'Conventional Arms',  icon: '⚔️',
    description: 'Projectile and kinetic weapons for planetary warfare.',
    effects: { militaryStrength: 0.1 },
  },
  {
    id: 'nuclear_weapons', category: 'weapons', tier: 3, requires: ['nuclear_energy', 'conventional_weapons'],
    label: 'Nuclear Weapons', icon: '☢️',
    description: 'Fission and fusion bombs capable of devastating planetary surfaces.',
    effects: { militaryStrength: 0.5, canDestroyPlanet: false },
  },
  {
    id: 'antimatter_weapons', category: 'weapons', tier: 4, requires: ['nuclear_weapons', 'fusion_power'],
    label: 'Antimatter Weapons', icon: '💥',
    description: 'Antimatter annihilation weaponized for capital-ship armaments.',
    effects: { militaryStrength: 0.8, unlockFleetType: 'capital_ship' },
  },
  {
    id: 'stellar_weapons', category: 'weapons', tier: 5, requires: ['antimatter_weapons', 'stellar_engineering'],
    label: 'Stellar Weapons', icon: '💀',
    description: 'Star-scale weapons: nova triggers, stellar collapse devices, particle beams.',
    effects: { militaryStrength: 1.0, canDestroyPlanet: true, canDestroyStar: true },
  },

  // ─── BIOLOGY ─────────────────────────────────────────────────────────────
  {
    id: 'medicine',      category: 'biology', tier: 1, requires: [],
    label: 'Medicine',       icon: '💊',
    description: 'Germ theory, surgery, and pharmacology extend lifespans.',
    effects: { populationGrowth: 0.15, techPointRate: 0.02 },
  },
  {
    id: 'genetics',      category: 'biology', tier: 3, requires: ['medicine', 'electronics'],
    label: 'Genetics',       icon: '🧬',
    description: 'Gene sequencing and CRISPR-class editing reshape biology itself.',
    effects: { populationGrowth: 0.2, techPointRate: 0.1, terraformingBonus: 0.3 },
  },
  {
    id: 'cybernetics',   category: 'biology', tier: 4, requires: ['genetics', 'artificial_intelligence'],
    label: 'Cybernetics',    icon: '🦾',
    description: 'Neural interfaces and bio-mechanical augmentation transcend biology.',
    effects: { populationGrowth: 0.1, techPointRate: 0.25, militaryStrength: 0.3 },
  },
  {
    id: 'terraforming',  category: 'biology', tier: 4, requires: ['genetics', 'rocketry'],
    label: 'Terraforming',   icon: '🌱',
    description: 'Planetary-scale biological and atmospheric engineering.',
    effects: { unlockColonization: 'hostile', terraformingBonus: 0.6 },
  },
];

/** Index by id for fast lookup */
export const TECH_BY_ID = Object.fromEntries(TECH_TREE.map(t => [t.id, t]));

/** Get all techs available to unlock given currently unlocked set */
export function getAvailableTechs(unlockedIds) {
  const unlocked = new Set(unlockedIds);
  return TECH_TREE.filter(t =>
    !unlocked.has(t.id) &&
    t.requires.every(req => unlocked.has(req))
  );
}

/** Compute total tech point rate bonus from unlocked techs */
export function computeTechRate(unlockedIds) {
  const unlocked = new Set(unlockedIds);
  let base = 0.005;
  for (const id of unlockedIds) {
    const t = TECH_BY_ID[id];
    if (t?.effects?.techPointRate) base += t.effects.techPointRate;
  }
  void unlocked;
  return base;
}

/** Calculate Kardashev level from unlocked techs */
export function computeKardashevLevel(unlockedIds) {
  let level = 0;
  for (const id of unlockedIds) {
    const t = TECH_BY_ID[id];
    if (t?.effects?.kardashevLevel != null) {
      level = Math.max(level, t.effects.kardashevLevel);
    }
  }
  return level;
}

/** Check if colonization of given scope is unlocked */
export function canColonize(unlockedIds, scope) {
  // scope: 'planetary' | 'system' | 'interstellar' | 'hostile'
  const order = ['planetary', 'hostile', 'system', 'interstellar'];
  const targetIdx = order.indexOf(scope);
  for (const id of unlockedIds) {
    const t = TECH_BY_ID[id];
    if (t?.effects?.unlockColonization) {
      const idx = order.indexOf(t.effects.unlockColonization);
      if (idx >= targetIdx) return true;
    }
  }
  return false;
}

/** All megastructure types */
export const MEGASTRUCTURES = {
  fusion_reactor:    { id: 'fusion_reactor',    label: 'Fusion Reactor',     icon: '💥', description: 'Planetary-scale controlled fusion provides near-unlimited energy.' },
  dyson_sphere:      { id: 'dyson_sphere',       label: 'Dyson Sphere',       icon: '🌐', description: 'Complete shell around the parent star, harvesting all its output.' },
  ringworld_segment: { id: 'ringworld_segment',  label: 'Ringworld Segment',  icon: '💍', description: 'A vast habitat ring orbiting the star with Earth-like gravity.' },
  matrioshka_brain:  { id: 'matrioshka_brain',   label: "Matrioshka Brain",   icon: '🧠', description: 'Nested Dyson shells housing planet-scale computing substrates.' },
  stellar_engine:    { id: 'stellar_engine',     label: 'Stellar Engine',     icon: '⭐', description: 'Shkadov thruster: uses star thrust to navigate the galaxy.' },
  wormhole_gate:     { id: 'wormhole_gate',      label: 'Wormhole Gate',      icon: '🕳️', description: 'Stable traversable wormhole connecting to a distant system.' },
};

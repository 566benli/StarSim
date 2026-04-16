/**
 * Star type definitions and presets
 * All values in solar units unless otherwise noted
 */

export const STELLAR_CLASSES = {
  O: { label: 'O-type (Blue Supergiant)', color: '#9bb0ff', tempRange: [30000, 50000] },
  B: { label: 'B-type (Blue-White)', color: '#aabfff', tempRange: [10000, 30000] },
  A: { label: 'A-type (White)', color: '#cad7ff', tempRange: [7500, 10000] },
  F: { label: 'F-type (Yellow-White)', color: '#f8f7ff', tempRange: [6000, 7500] },
  G: { label: 'G-type (Yellow - Sun-like)', color: '#fff4ea', tempRange: [5200, 6000] },
  K: { label: 'K-type (Orange)', color: '#ffd2a1', tempRange: [3700, 5200] },
  M: { label: 'M-type (Red Dwarf)', color: '#ffcc6f', tempRange: [2400, 3700] },
};

export const STAR_PRESETS = {
  // === Main Sequence Stars ===
  red_dwarf: {
    id: 'red_dwarf',
    name: 'Red Dwarf',
    category: 'main_sequence',
    description: 'Small, cool, and incredibly long-lived. The most common stars in the universe.',
    icon: '🔴',
    mass: { default: 0.3, min: 0.08, max: 0.6, unit: 'M☉' },
    radius: { default: 0.35, min: 0.1, max: 0.6, unit: 'R☉' },
    temperature: { default: 3200, min: 2400, max: 3700, unit: 'K' },
    luminosity: { default: 0.01, min: 0.0001, max: 0.08, unit: 'L☉' },
    age: { default: 0, min: 0, max: 100, unit: 'Gyr' },
    funFact: 'Red dwarfs can burn for trillions of years — far longer than the current age of the universe!',
  },

  sun_like: {
    id: 'sun_like',
    name: 'Sun-like Star',
    category: 'main_sequence',
    description: 'A yellow dwarf like our Sun. Stable, warm, and perfect for habitable zones.',
    icon: '☀️',
    mass: { default: 1.0, min: 0.8, max: 1.2, unit: 'M☉' },
    radius: { default: 1.0, min: 0.85, max: 1.2, unit: 'R☉' },
    temperature: { default: 5778, min: 5200, max: 6200, unit: 'K' },
    luminosity: { default: 1.0, min: 0.6, max: 1.6, unit: 'L☉' },
    age: { default: 0, min: 0, max: 12, unit: 'Gyr' },
    funFact: 'Our Sun is about 4.6 billion years old and is roughly halfway through its main sequence life.',
  },

  blue_giant: {
    id: 'blue_giant',
    name: 'Blue Giant',
    category: 'main_sequence',
    description: 'Massive, hot, and luminous. Burns bright but lives fast.',
    icon: '🔵',
    mass: { default: 10, min: 3, max: 30, unit: 'M☉' },
    radius: { default: 5, min: 2, max: 15, unit: 'R☉' },
    temperature: { default: 25000, min: 10000, max: 45000, unit: 'K' },
    luminosity: { default: 10000, min: 100, max: 200000, unit: 'L☉' },
    age: { default: 0, min: 0, max: 0.05, unit: 'Gyr' },
    funFact: 'Blue giants can be 100,000 times brighter than the Sun but live only a few million years.',
  },

  orange_dwarf: {
    id: 'orange_dwarf',
    name: 'Orange Dwarf',
    category: 'main_sequence',
    description: 'A K-type star — cooler than the Sun but longer-lived. Great for stable habitable zones.',
    icon: '🟠',
    mass: { default: 0.7, min: 0.5, max: 0.9, unit: 'M☉' },
    radius: { default: 0.7, min: 0.5, max: 0.9, unit: 'R☉' },
    temperature: { default: 4500, min: 3700, max: 5200, unit: 'K' },
    luminosity: { default: 0.2, min: 0.05, max: 0.6, unit: 'L☉' },
    age: { default: 0, min: 0, max: 30, unit: 'Gyr' },
    funFact: 'Orange dwarfs may be the best hosts for life — stable for 20–70 billion years!',
  },

  // === Evolved Stars ===
  red_giant: {
    id: 'red_giant',
    name: 'Red Giant',
    category: 'evolved',
    description: 'A dying star that has expanded enormously. Its outer layers are cool and diffuse.',
    icon: '🟠',
    mass: { default: 1.5, min: 0.5, max: 8, unit: 'M☉' },
    radius: { default: 50, min: 10, max: 200, unit: 'R☉' },
    temperature: { default: 3500, min: 2500, max: 5000, unit: 'K' },
    luminosity: { default: 500, min: 50, max: 5000, unit: 'L☉' },
    age: { default: 10, min: 5, max: 15, unit: 'Gyr' },
    funFact: 'When our Sun becomes a red giant, it will engulf Mercury, Venus, and possibly Earth!',
  },

  red_supergiant: {
    id: 'red_supergiant',
    name: 'Red Supergiant',
    category: 'evolved',
    description: 'Among the largest stars known. Betelgeuse is a famous example.',
    icon: '🟤',
    mass: { default: 15, min: 8, max: 40, unit: 'M☉' },
    radius: { default: 800, min: 200, max: 1500, unit: 'R☉' },
    temperature: { default: 3500, min: 3000, max: 4500, unit: 'K' },
    luminosity: { default: 50000, min: 5000, max: 300000, unit: 'L☉' },
    age: { default: 0.01, min: 0.005, max: 0.05, unit: 'Gyr' },
    funFact: 'If Betelgeuse replaced the Sun, its surface would extend beyond the orbit of Jupiter!',
  },

  // === Compact Remnants ===
  white_dwarf: {
    id: 'white_dwarf',
    name: 'White Dwarf',
    category: 'remnant',
    description: 'The dense core left behind after a sun-like star dies. Earth-sized but incredibly dense.',
    icon: '⚪',
    mass: { default: 0.6, min: 0.2, max: 1.4, unit: 'M☉' },
    radius: { default: 0.01, min: 0.005, max: 0.02, unit: 'R☉' },
    temperature: { default: 20000, min: 4000, max: 100000, unit: 'K' },
    luminosity: { default: 0.001, min: 0.0001, max: 0.1, unit: 'L☉' },
    age: { default: 0, min: 0, max: 10, unit: 'Gyr' },
    funFact: 'A teaspoon of white dwarf material weighs about 5.5 tons!',
  },

  neutron_star: {
    id: 'neutron_star',
    name: 'Neutron Star',
    category: 'remnant',
    description: 'Incredibly dense remnant of a supernova. A city-sized object with more mass than the Sun.',
    icon: '💫',
    mass: { default: 1.5, min: 1.1, max: 2.5, unit: 'M☉' },
    radius: { default: 0.000015, min: 0.00001, max: 0.00003, unit: 'R☉' },
    temperature: { default: 600000, min: 100000, max: 1000000, unit: 'K' },
    luminosity: { default: 0.001, min: 0.0001, max: 0.01, unit: 'L☉' },
    age: { default: 0, min: 0, max: 1, unit: 'Gyr' },
    funFact: 'Neutron stars can spin up to 716 times per second!',
  },

  black_hole: {
    id: 'black_hole',
    name: 'Black Hole',
    category: 'remnant',
    description: 'A region of spacetime where gravity is so strong that nothing can escape, not even light.',
    icon: '⚫',
    mass: { default: 10, min: 3, max: 100, unit: 'M☉' },
    radius: { default: 0, min: 0, max: 0, unit: 'R☉', computed: true },
    temperature: { default: 0, min: 0, max: 0, unit: 'K', note: 'Hawking radiation only' },
    luminosity: { default: 0, min: 0, max: 0, unit: 'L☉', note: 'Accretion disk only' },
    accretionRate: { default: 0.01, min: 0, max: 1, unit: 'M☉/yr' },
    spin: { default: 0.5, min: 0, max: 0.998, unit: 'a*' },
    funFact: 'Cygnus X-1 was the first widely accepted black hole — a stellar-mass giant about 21 solar masses, discovered in 1964!',
  },

  supermassive_black_hole: {
    id: 'supermassive_black_hole',
    name: 'Supermassive Black Hole',
    category: 'remnant',
    description: 'The monstrous black holes at the centers of galaxies. Millions to billions of solar masses.',
    icon: '🕳️',
    mass: { default: 4e6, min: 1e5, max: 1e10, unit: 'M☉' },
    radius: { default: 0, min: 0, max: 0, unit: 'R☉', computed: true },
    temperature: { default: 0, min: 0, max: 0, unit: 'K' },
    luminosity: { default: 0, min: 0, max: 0, unit: 'L☉' },
    accretionRate: { default: 0.1, min: 0, max: 10, unit: 'M☉/yr' },
    spin: { default: 0.7, min: 0, max: 0.998, unit: 'a*' },
    funFact: 'The supermassive black hole at the center of M87 has a mass of 6.5 billion Suns!',
  },
};

export const STAR_CATEGORIES = [
  {
    id: 'main_sequence',
    label: 'Main Sequence Stars',
    description: 'Stars in the prime of their lives, fusing hydrogen in their cores.',
    color: '#4a9eff',
  },
  {
    id: 'evolved',
    label: 'Evolved Stars',
    description: 'Stars in later stages of life — giants and supergiants.',
    color: '#ff6b35',
  },
  {
    id: 'remnant',
    label: 'Stellar Remnants',
    description: 'The exotic endpoints of stellar evolution.',
    color: '#b44aff',
  },
];

/**
 * Stellar evolution phases
 */
export const EVOLUTION_PHASES = {
  PROTOSTAR: 'protostar',
  MAIN_SEQUENCE: 'main_sequence',
  SUBGIANT: 'subgiant',
  RED_GIANT: 'red_giant',
  HORIZONTAL_BRANCH: 'horizontal_branch',
  ASYMPTOTIC_GIANT: 'asymptotic_giant',
  PLANETARY_NEBULA: 'planetary_nebula',
  WHITE_DWARF: 'white_dwarf',
  RED_SUPERGIANT: 'red_supergiant',
  SUPERNOVA: 'supernova',
  NEUTRON_STAR: 'neutron_star',
  BLACK_HOLE: 'black_hole',
};

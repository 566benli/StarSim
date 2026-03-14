/**
 * Chemical elements, their properties, and fusion rules.
 * Used for both universe-level primordial chemistry and per-body composition.
 */

export const ELEMENTS = {
  H:  { symbol: 'H',  name: 'Hydrogen',  Z: 1,  mass: 1.008,  color: '#88ccff', abundance: 0.735 },
  He: { symbol: 'He', name: 'Helium',    Z: 2,  mass: 4.003,  color: '#ffffaa', abundance: 0.249 },
  Li: { symbol: 'Li', name: 'Lithium',   Z: 3,  mass: 6.941,  color: '#cc88ff', abundance: 1e-9 },
  C:  { symbol: 'C',  name: 'Carbon',    Z: 6,  mass: 12.011, color: '#444444', abundance: 2.4e-3 },
  N:  { symbol: 'N',  name: 'Nitrogen',  Z: 7,  mass: 14.007, color: '#3355ff', abundance: 7e-4 },
  O:  { symbol: 'O',  name: 'Oxygen',    Z: 8,  mass: 15.999, color: '#ff4444', abundance: 6.6e-3 },
  Ne: { symbol: 'Ne', name: 'Neon',      Z: 10, mass: 20.180, color: '#ff8844', abundance: 1.3e-3 },
  Mg: { symbol: 'Mg', name: 'Magnesium', Z: 12, mass: 24.305, color: '#66cc66', abundance: 5.1e-4 },
  Si: { symbol: 'Si', name: 'Silicon',   Z: 14, mass: 28.086, color: '#aaaacc', abundance: 6.5e-4 },
  S:  { symbol: 'S',  name: 'Sulfur',    Z: 16, mass: 32.065, color: '#cccc44', abundance: 4.4e-4 },
  Fe: { symbol: 'Fe', name: 'Iron',      Z: 26, mass: 55.845, color: '#cc8844', abundance: 1.1e-3 },
  Ni: { symbol: 'Ni', name: 'Nickel',    Z: 28, mass: 58.693, color: '#bbbbbb', abundance: 5e-5 },
  U:  { symbol: 'U',  name: 'Uranium',   Z: 92, mass: 238.03, color: '#44cc44', abundance: 1e-8 },
};

/**
 * Fusion chain rules.
 * Each rule: { inputs, output, tempRequired (K), probability per Myr }
 * These are simplified — real nucleosynthesis is far more complex.
 */
export const FUSION_RULES = [
  { inputs: ['H', 'H'],   output: 'He', tempRequired: 1e7,  ratePerMyr: 0.02,  name: 'pp-chain' },
  { inputs: ['He', 'He'], output: 'C',  tempRequired: 1e8,  ratePerMyr: 0.005, name: 'Triple-alpha' },
  { inputs: ['C', 'He'],  output: 'O',  tempRequired: 5e8,  ratePerMyr: 0.003, name: 'Carbon burning' },
  { inputs: ['O', 'O'],   output: 'Si', tempRequired: 1.5e9, ratePerMyr: 0.002, name: 'Oxygen burning' },
  { inputs: ['Si', 'Si'], output: 'Fe', tempRequired: 3e9,  ratePerMyr: 0.001, name: 'Silicon burning' },
  { inputs: ['C', 'C'],   output: 'Ne', tempRequired: 6e8,  ratePerMyr: 0.002, name: 'Carbon-Carbon' },
  { inputs: ['O', 'He'],  output: 'Ne', tempRequired: 2e8,  ratePerMyr: 0.003, name: 'Alpha capture' },
  { inputs: ['Ne', 'He'], output: 'Mg', tempRequired: 1.2e9, ratePerMyr: 0.002, name: 'Neon burning' },
  { inputs: ['Mg', 'He'], output: 'Si', tempRequired: 1.5e9, ratePerMyr: 0.001, name: 'Mg alpha capture' },
];

/**
 * Primordial composition (Big Bang nucleosynthesis result)
 */
export const PRIMORDIAL_COMPOSITION = {
  H: 0.75,
  He: 0.25,
};

/**
 * Default stellar compositions by type
 */
export const STELLAR_COMPOSITIONS = {
  main_sequence: { H: 0.70, He: 0.28, C: 0.003, N: 0.001, O: 0.008, Fe: 0.002, Si: 0.001, Mg: 0.001 },
  red_giant:     { H: 0.30, He: 0.55, C: 0.06, N: 0.02, O: 0.04, Fe: 0.005, Si: 0.003, Ne: 0.01 },
  red_supergiant:{ H: 0.10, He: 0.40, C: 0.12, N: 0.03, O: 0.15, Si: 0.08, Fe: 0.06, Ne: 0.03, Mg: 0.02 },
  white_dwarf:   { C: 0.50, O: 0.45, Ne: 0.03, He: 0.02 },
  neutron_star:  { Fe: 0.85, Ni: 0.10, Si: 0.05 },
};

/**
 * Default planetary compositions by type
 */
export const PLANETARY_COMPOSITIONS = {
  rocky_small:  { Fe: 0.32, O: 0.30, Si: 0.15, Mg: 0.14, S: 0.03, Ni: 0.02, C: 0.02, H: 0.01 },
  earth_like:   { Fe: 0.32, O: 0.30, Si: 0.15, Mg: 0.14, S: 0.03, Ni: 0.02, C: 0.02, H: 0.01, N: 0.01 },
  super_earth:  { Fe: 0.30, O: 0.28, Si: 0.18, Mg: 0.12, S: 0.04, Ni: 0.03, C: 0.03, H: 0.02 },
  gas_giant:    { H: 0.73, He: 0.25, C: 0.005, N: 0.002, O: 0.005, Ne: 0.002, S: 0.001 },
  ice_giant:    { H: 0.15, He: 0.10, O: 0.30, C: 0.20, N: 0.15, S: 0.05, Si: 0.03, Fe: 0.02 },
  hot_jupiter:  { H: 0.71, He: 0.27, C: 0.005, O: 0.005, N: 0.002, S: 0.001 },
  lava_world:   { Fe: 0.35, Si: 0.25, O: 0.20, Mg: 0.10, S: 0.05, Ni: 0.03, C: 0.02 },
  rogue_planet: { Fe: 0.30, O: 0.28, Si: 0.20, Mg: 0.12, C: 0.05, H: 0.03, N: 0.02 },
};

/**
 * Get composition for a body based on its type/subtype/phase
 */
export function getDefaultComposition(type, subtype, phase) {
  if (type === 'star' || type === 'black_hole') {
    return { ...(STELLAR_COMPOSITIONS[phase] || STELLAR_COMPOSITIONS.main_sequence) };
  }
  if (type === 'planet') {
    return { ...(PLANETARY_COMPOSITIONS[subtype] || PLANETARY_COMPOSITIONS.earth_like) };
  }
  return { ...PRIMORDIAL_COMPOSITION };
}

/**
 * Apply fusion rules to a composition for a given dt (in Myr) and core temperature
 */
export function evolveFusion(composition, coreTemp, dtMyr) {
  const updated = { ...composition };
  for (const rule of FUSION_RULES) {
    if (coreTemp < rule.tempRequired) continue;

    const [a, b] = rule.inputs;
    const amtA = updated[a] || 0;
    const amtB = updated[b] || 0;
    if (amtA <= 0 || amtB <= 0) continue;

    const tempFactor = Math.min(coreTemp / rule.tempRequired, 5);
    const reacted = Math.min(amtA, amtB) * rule.ratePerMyr * dtMyr * tempFactor;
    if (reacted < 1e-12) continue;

    updated[a] = Math.max(0, amtA - reacted);
    if (a === b) {
      updated[a] = Math.max(0, updated[a] - reacted);
    } else {
      updated[b] = Math.max(0, amtB - reacted);
    }
    updated[rule.output] = (updated[rule.output] || 0) + reacted;
  }
  return updated;
}

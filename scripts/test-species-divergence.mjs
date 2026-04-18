// Quick divergence + determinism test for SpeciesGenerator
import { generateSpecies } from '../src/engine/SpeciesGenerator.js';

const env = {
  temp: 290, pressure: 1, tempNorm: 0.5, pressureNorm: 0.5, radiationNorm: 0.1,
  habitabilityScore: 0.8, chemistryPotential: 0.7,
  temperatureSuitability: 0.9, pressureSuitability: 0.8, radiationSuitability: 0.9,
};

const planetA = {
  id: 'pA', name: 'Elara', type: 'planet',
  temperature: 290, atmospherePressure: 1.0,
  atmosphereComposition: { N2: 0.78, O2: 0.21, Ar: 0.01 },
  biosphereFitness: 0.6,
  biosphereSeed: 1111111,
  biomeArchetype: 'continental',
  evolutionTree: [],
};
const planetB = {
  id: 'pB', name: 'Kova', type: 'planet',
  temperature: 290, atmospherePressure: 1.0,
  atmosphereComposition: { N2: 0.78, O2: 0.21, Ar: 0.01 },
  biosphereFitness: 0.6,
  biosphereSeed: 9999888,
  biomeArchetype: 'oceanic',
  evolutionTree: [],
};

const spA = [], spB = [];
for (let i = 0; i < 6; i++) {
  const sp = generateSpecies({ env, body: planetA, stage: 'complex', parentId: null, simulationTime: 1e9, mutationGeneration: i });
  spA.push(sp.name);
  planetA.evolutionTree.push(sp);
}
for (let i = 0; i < 6; i++) {
  const sp = generateSpecies({ env, body: planetB, stage: 'complex', parentId: null, simulationTime: 1e9, mutationGeneration: i });
  spB.push(sp.name);
  planetB.evolutionTree.push(sp);
}

console.log('Planet A (continental) species:', spA.join(', '));
console.log('Planet B (oceanic)     species:', spB.join(', '));

const overlap = spA.filter(n => spB.includes(n)).length;
console.log(`Name overlap: ${overlap}/6`);

const sp1 = generateSpecies({ env, body: planetA, stage: 'complex', parentId: null, simulationTime: 1e9, mutationGeneration: 0 });
const sp2 = generateSpecies({ env, body: planetA, stage: 'complex', parentId: null, simulationTime: 1e9, mutationGeneration: 0 });

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.log('  [FAIL]', msg); failures++; }
  else        { console.log('  [OK]  ', msg); }
}

assert(sp1.name === sp2.name, 'generateSpecies deterministic (name)');
assert(sp1.traits.bodyType === sp2.traits.bodyType, 'generateSpecies deterministic (bodyType)');
assert(overlap < 3, `Low name overlap between same-preset planets (${overlap}/6)`);

// Different environments must yield different biome archetypes for same-preset worlds
// (not guaranteed at name level, but different seeds must produce different first species)
const nameA0 = spA[0], nameB0 = spB[0];
assert(nameA0 !== nameB0, 'First species name differs across same-preset planets with different seeds');

if (failures > 0) {
  console.log(`\n[RESULT] ${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\n[PASS] SpeciesGenerator divergence + determinism tests passed.');
}

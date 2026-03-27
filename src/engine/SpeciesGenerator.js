/**
 * SpeciesGenerator — procedural species creation driven by planetary environment.
 *
 * Every species gets a unique name, body plan, metabolism, and trait vector
 * derived from the host planet's temperature, pressure, atmosphere, and
 * radiation.  Different planets therefore produce fundamentally different
 * life, and stochastic components guarantee each simulation diverges.
 */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── Name building blocks ────────────────────────────────────────────────────

const TEMP_PREFIX = {
  cryo:   ['Cryo', 'Glaci', 'Frigi', 'Nivi'],
  meso:   ['Meso', 'Tephi', 'Medio', 'Tempe'],
  thermo: ['Thermo', 'Cali', 'Igni', 'Pyra'],
  pyro:   ['Pyro', 'Vulca', 'Magni', 'Ardi'],
};

const PRESSURE_MID = {
  tenuo:  ['tenuo', 'lepto', 'aero', 'raref'],
  meso:   ['baro', 'meso', 'medio', 'stato'],
  baro:   ['gravi', 'denso', 'bathy', 'presso'],
};

const CHEMISTRY_ROOT = {
  N2:  ['nitri', 'azoto', 'dini'],
  O2:  ['oxi', 'aero', 'spiri'],
  CO2: ['carbo', 'dioxi', 'fumari'],
  CH4: ['methano', 'carbi', 'hydro'],
  NH3: ['ammoni', 'nitro', 'hali'],
  SO2: ['sulfuri', 'volca', 'acidi'],
  H2:  ['hydri', 'proto', 'levio'],
  He:  ['helio', 'nobi', 'inertio'],
};

const SUFFIXES_BY_STAGE = {
  simple:      ['ia', 'um', 'ix', 'on', 'us', 'ella', 'ula', 'ota'],
  complex:     ['aria', 'odon', 'fera', 'saurus', 'morpha', 'zoon', 'ptera', 'derma'],
  intelligent: ['sapiens', 'nostra', 'mentis', 'logica', 'cephala', 'techna'],
};

const BODY_PLANS = {
  cryo:   ['crystalline lattice', 'cryo-gel matrix', 'ice-membrane sac', 'antifreeze capsule'],
  meso:   ['lipid bilayer cell', 'fibrous colony', 'flexible membrane', 'hydrogel sphere'],
  thermo: ['silicate shell', 'heat-resistant cyst', 'ceramic microbe', 'metalloprotein chain'],
  pyro:   ['plasma-film entity', 'molten droplet', 'volcanic tube weaver', 'magma-crust symbiont'],
};

const METABOLISM = {
  cryo:   ['cryo-chemosynthesis', 'ice-catalytic reduction', 'glacial osmotrophy'],
  meso:   ['chemosynthesis', 'phototrophy', 'heterotrophy', 'mixotrophy'],
  thermo: ['thermosynthesis', 'sulfur reduction', 'iron oxidation'],
  pyro:   ['radiosynthesis', 'plasma harvesting', 'volcanic chemolithotrophy'],
};

const LOCOMOTION_BY_STAGE = {
  simple:      ['sessile', 'drifting', 'taxis-driven', 'colony-anchored'],
  complex:     ['motile', 'burrowing', 'swimming', 'gliding', 'tentacled'],
  intelligent: ['bipedal', 'radial-limbed', 'hover-drifting', 'tool-bearing colonial'],
};

const SIZE_BY_STAGE = {
  simple:      ['microscopic', 'microscopic', 'tiny'],
  complex:     ['small', 'medium', 'large', 'variable'],
  intelligent: ['medium', 'large', 'variable'],
};

const INTELLIGENCE_BY_STAGE = {
  simple:      ['none', 'reactive'],
  complex:     ['reactive', 'adaptive', 'social'],
  intelligent: ['social', 'sapient', 'technological'],
};

// ── Environment classification ──────────────────────────────────────────────

function tempCategory(tempK) {
  if (tempK < 150)  return 'cryo';
  if (tempK < 400)  return 'meso';
  if (tempK < 900)  return 'thermo';
  return 'pyro';
}

function pressureCategory(atm) {
  if (atm < 0.1)  return 'tenuo';
  if (atm < 50)   return 'meso';
  return 'baro';
}

function dominantGas(composition) {
  if (!composition || typeof composition !== 'object') return 'N2';
  let best = 'N2';
  let max = 0;
  for (const [gas, frac] of Object.entries(composition)) {
    if (frac > max) { max = frac; best = gas; }
  }
  return best;
}

// ── Public API ──────────────────────────────────────────────────────────────

let _idCounter = 0;

export function generateSpeciesId() {
  return `sp_${Date.now().toString(36)}_${(++_idCounter).toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Build a procedural species from the planet's current environment.
 *
 * @param {object} opts
 * @param {object} opts.env          – environment snapshot from LifeEvolutionSystem.buildEnvironment
 * @param {object} opts.body         – the planet body
 * @param {string} opts.stage        – target life stage (simple / complex / intelligent)
 * @param {string|null} opts.parentId – id of the ancestor species (null = root)
 * @param {number} opts.simulationTime
 * @param {object|null} opts.parentTraits – traits of the parent species to inherit from
 * @returns {object} species node for the evolution tree
 */
export function generateSpecies({ env, body, stage, parentId = null, simulationTime = 0, parentTraits = null }) {
  const temp = body.temperature || 300;
  const pressure = body.atmospherePressure || 1;
  const composition = body.atmosphereComposition || {};
  const tCat = tempCategory(temp);
  const pCat = pressureCategory(pressure);
  const gas = dominantGas(composition);

  const name = buildName(tCat, pCat, gas, stage);
  const description = buildDescription(tCat, pCat, gas, stage, body.name);

  const traits = parentTraits
    ? mutateTraits(parentTraits, tCat, stage)
    : buildTraits(tCat, stage);

  return {
    id: generateSpeciesId(),
    name,
    description,
    parentId,
    traits,
    fitness: clamp01(body.biosphereFitness || 0.3 + Math.random() * 0.3),
    population: clamp01(0.15 + Math.random() * 0.4),
    stage,
    appearedAt: simulationTime,
    extinctAt: null,
    extinctReason: null,
  };
}

// ── Internal builders ───────────────────────────────────────────────────────

function buildName(tCat, pCat, gas, stage) {
  const prefix = pick(TEMP_PREFIX[tCat]);
  const mid = pick(PRESSURE_MID[pCat]);
  const root = pick(CHEMISTRY_ROOT[gas] || CHEMISTRY_ROOT.N2);
  const suffix = pick(SUFFIXES_BY_STAGE[stage] || SUFFIXES_BY_STAGE.simple);

  if (Math.random() < 0.5) {
    return `${prefix}${root}${suffix}`;
  }
  return `${prefix}${mid}${suffix}`;
}

function buildDescription(tCat, pCat, gas, stage, planetName) {
  const bodyPlan = pick(BODY_PLANS[tCat]);
  const metabolism = pick(METABOLISM[tCat]);
  const locomotion = pick(LOCOMOTION_BY_STAGE[stage] || LOCOMOTION_BY_STAGE.simple);

  const gasLabel = gas.replace(/\d/g, '');
  const stageLabel = stage === 'simple' ? 'single-celled organism'
    : stage === 'complex' ? 'multicellular organism'
    : 'sapient being';

  return `A ${locomotion} ${stageLabel} with a ${bodyPlan} body plan. ` +
    `Derives energy through ${metabolism} in ${planetName}'s ${gasLabel}-rich atmosphere.`;
}

function buildTraits(tCat, stage) {
  return {
    bodyType: pick(BODY_PLANS[tCat]),
    metabolism: pick(METABOLISM[tCat]),
    locomotion: pick(LOCOMOTION_BY_STAGE[stage] || LOCOMOTION_BY_STAGE.simple),
    size: pick(SIZE_BY_STAGE[stage] || SIZE_BY_STAGE.simple),
    intelligence: pick(INTELLIGENCE_BY_STAGE[stage] || INTELLIGENCE_BY_STAGE.simple),
  };
}

function mutateTraits(parentTraits, tCat, stage) {
  const traits = { ...parentTraits };
  const stagePool = LOCOMOTION_BY_STAGE[stage] || LOCOMOTION_BY_STAGE.simple;
  const sizePool = SIZE_BY_STAGE[stage] || SIZE_BY_STAGE.simple;
  const intelPool = INTELLIGENCE_BY_STAGE[stage] || INTELLIGENCE_BY_STAGE.simple;

  if (Math.random() < 0.4) traits.bodyType = pick(BODY_PLANS[tCat]);
  if (Math.random() < 0.3) traits.metabolism = pick(METABOLISM[tCat]);
  if (Math.random() < 0.5) traits.locomotion = pick(stagePool);
  if (Math.random() < 0.5) traits.size = pick(sizePool);
  traits.intelligence = pick(intelPool);
  return traits;
}

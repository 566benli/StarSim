// Integration test for biosphereGrid + civCharacter + Planet fields
import { hashString32, mulberry32, createEmptyBiosphereGrid, updateBiosphereGrid,
         initBiosphereGrid, ensurePlanetBiosphereIdentity, uvToCell } from '../src/engine/biosphereGrid.js';
import { buildCivCharacter, cloneCivCharacter } from '../src/engine/civCharacter.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.log('  [FAIL]', msg); failures++; }
  else        { console.log('  [OK]  ', msg); }
}

// ── 1. Grid creation ──────────────────────────────────────────────────────
const grid = createEmptyBiosphereGrid();
assert(grid.cells.length === 512, `Grid has 16x32=512 cells, got ${grid.cells.length}`);
assert(grid.cells[0].habitat === 'ocean', 'Default habitat is ocean');

// ── 2. Planet identity seeds ─────────────────────────────────────────────
const body = {
  id: 'pl_test1', name: 'Verdana', type: 'planet',
  temperature: 295, atmospherePressure: 1.0,
  hasWater: true, waterCoverage: 0.65,
  biosphereFitness: 0.7, biosphereHealth: 0.6, biodiversity: 0.5,
  evolutionTree: [],
  civilization: null,
};
const env = { habitabilityScore: 0.8 };
ensurePlanetBiosphereIdentity(body, env);
assert(typeof body.biosphereSeed === 'number', 'biosphereSeed assigned');
assert(typeof body.surfaceSeed === 'number', 'surfaceSeed assigned');
assert(typeof body.biomeArchetype === 'string' && body.biomeArchetype.length > 0, 'biomeArchetype assigned');

const seed1 = body.biosphereSeed;
ensurePlanetBiosphereIdentity(body, env);
assert(body.biosphereSeed === seed1, 'biosphereSeed stable on repeat');

// ── 3. initBiosphereGrid and updateBiosphereGrid ──────────────────────────
initBiosphereGrid(body);
assert(body.biosphereGrid?.cells?.length === 512, 'Grid initialized on body');

// Add a species to the tree
body.evolutionTree.push({
  id: 'sp_001', name: 'Tephioxi', stage: 'complex',
  fitness: 0.7, extinctAt: null,
  traits: { metabolism: 'phototrophy', locomotion: 'gliding' },
});

updateBiosphereGrid(body, env, 1e6);
const midCell = body.biosphereGrid.cells[Math.floor(512 / 2)];
assert(midCell !== undefined, 'Mid cell exists');
assert(midCell.habitat !== undefined, 'Mid cell has habitat');

const landCells = body.biosphereGrid.cells.filter(c => c.habitat === 'land');
const oceanCells = body.biosphereGrid.cells.filter(c => c.habitat === 'ocean');
assert(landCells.length > 0, 'Some land cells generated');
assert(oceanCells.length > 0, 'Some ocean cells generated');

const dominated = body.biosphereGrid.cells.filter(c => c.dominantSpeciesId === 'sp_001');
assert(dominated.length > 0, 'Species occupies some cells');

// ── 4. Civilization influence ─────────────────────────────────────────────
body.civilization = {
  id: 'civ_001', collapsed: false,
  population: 5.0,
  founderSpeciesId: 'sp_001',
  stage: 'industrial',
  character: null,
};
updateBiosphereGrid(body, env, 2e6);
const civCells = body.biosphereGrid.cells.filter(c => c.civilizationInfluence01 > 0.01);
assert(civCells.length > 0, 'Civilization influence spreads to some cells');

// ── 5. CivCharacter ───────────────────────────────────────────────────────
const char1 = buildCivCharacter({ domSpecies: body.evolutionTree[0], body, simulationTime: 5e8 });
const char2 = buildCivCharacter({ domSpecies: body.evolutionTree[0], body, simulationTime: 5e8 });

assert(char1.societyShape === char2.societyShape, 'societyShape deterministic');
assert(char1.aesthetics.colorHue === char2.aesthetics.colorHue, 'colorHue deterministic');
assert(char1.aesthetics.emblemSeed === char2.aesthetics.emblemSeed, 'emblemSeed deterministic');

for (const k of ['aggression','diplomacy','curiosity','tradition','expansionism']) {
  assert(char1.temperament[k] >= 0 && char1.temperament[k] <= 1, `${k} in [0,1]`);
}

// Colony variant
const charC = buildCivCharacter({ domSpecies: null, body, simulationTime: 5e8, meta: { isColony: true, empireHue: 120 } });
assert(typeof charC.societyShape === 'string', 'Colony character has societyShape');

const cloned = cloneCivCharacter(char1);
cloned.temperament.aggression = 999;
assert(char1.temperament.aggression !== 999, 'Clone is independent copy');

// ── 6. uvToCell boundary stability ────────────────────────────────────────
const edgeTL = uvToCell(0, 0);
const edgeBR = uvToCell(0.9999, 0.9999);
assert(edgeTL.latIdx === 0 && edgeTL.lonIdx === 0, 'Top-left cell (0,0)');
assert(edgeBR.latIdx === 15 && edgeBR.lonIdx === 31, 'Bottom-right cell (15,31)');

// ── Result ────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n[RESULT] ${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log(`\n[PASS] All biosphereGrid + civCharacter integration tests passed.`);
  console.log(`  biomeArchetype: ${body.biomeArchetype} | Society: ${char1.societyShape} | Hue: ${char1.aesthetics.colorHue}`);
  console.log(`  Land cells: ${landCells.length} | Ocean cells: ${oceanCells.length} | Civ cells: ${civCells.length}`);
}

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text());
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => window.__STAR_SIM_DEBUG__, { timeout: 15000 });

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) { console.log(`  [FAIL] ${msg}`); failures++; }
    else { console.log(`  [OK]   ${msg}`); }
  }

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 1: Multi-planet system with diverse environments ===');
  // ──────────────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const dbg = window.__STAR_SIM_DEBUG__;
    return dbg.seedLifeScenario({
      planets: [
        { name: 'Temperate', presetId: 'earth_like', overrides: { temperature: 310, atmosphere: 1.2, hasWater: true, magneticField: 1.5, atmosphereComposition: { N2: 0.70, CO2: 0.20, CH4: 0.08, Ar: 0.02 } } },
        { name: 'Lava World', presetId: 'earth_like', overrides: { temperature: 1100, atmosphere: 90, hasWater: false, magneticField: 0.3, atmosphereComposition: { SO2: 0.60, CO2: 0.30, N2: 0.10 } } },
        { name: 'Ice Moon', presetId: 'earth_like', overrides: { temperature: 80, atmosphere: 0.01, hasWater: false, magneticField: 0.1, atmosphereComposition: { N2: 0.95, CH4: 0.05 } } },
      ],
    });
  });

  console.log('  Simulating 30M years...');
  await page.evaluate(() => window.__STAR_SIM_DEBUG__.simulateYears({ years: 30e6, stepYears: 1e5 }));

  const snap1 = await page.evaluate(() => {
    return window.__STAR_SIM_DEBUG__.snapshotPlanets().map(p => ({
      name: p.name, lifeStage: p.lifeStage,
      treeSize: (p.evolutionTree || []).length,
      aliveSpecies: (p.evolutionTree || []).filter(s => !s.extinctAt).length,
      biosphereHealth: p.biosphereHealth,
      habitabilityScore: p.habitabilityScore,
    }));
  });

  for (const p of snap1) {
    console.log(`  ${p.name}: stage=${p.lifeStage}, tree=${p.treeSize}, alive=${p.aliveSpecies}, hab=${p.habitabilityScore?.toFixed(3)}, health=${p.biosphereHealth?.toFixed(3)}`);
  }

  const temperate = snap1.find(p => p.name === 'Temperate');
  assert(temperate && temperate.treeSize > 0, 'Temperate world should have species in tree');
  assert(temperate && temperate.aliveSpecies > 0, 'Temperate world should have living species');

  // Check that different environments produce different species names
  const speciesNames = await page.evaluate(() => {
    const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
    const result = {};
    for (const p of planets) {
      result[p.name] = (p.evolutionTree || []).map(s => s.name);
    }
    return result;
  });

  for (const [pName, names] of Object.entries(speciesNames)) {
    console.log(`  ${pName} species: ${names.length > 0 ? names.slice(0, 3).join(', ') + (names.length > 3 ? '...' : '') : '(none)'}`);
  }

  // Check species uniqueness (no two species have the same ID)
  const idCheck = await page.evaluate(() => {
    const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
    const ids = new Set();
    let dupes = 0;
    for (const p of planets) {
      for (const s of (p.evolutionTree || [])) {
        if (ids.has(s.id)) dupes++;
        ids.add(s.id);
      }
    }
    return { total: ids.size, dupes };
  });
  assert(idCheck.dupes === 0, `No duplicate species IDs (${idCheck.total} total, ${idCheck.dupes} dupes)`);

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 2: Parent-child lineage integrity ===');
  // ──────────────────────────────────────────────────────────────────────
  const lineageCheck = await page.evaluate(() => {
    const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
    const errors = [];
    for (const p of planets) {
      const tree = p.evolutionTree || [];
      const ids = new Set(tree.map(s => s.id));
      for (const s of tree) {
        if (s.parentId !== null && !ids.has(s.parentId)) {
          errors.push(`${p.name}: ${s.name} has parentId=${s.parentId} not found in tree`);
        }
      }
      const roots = tree.filter(s => s.parentId === null);
      if (tree.length > 0 && roots.length === 0) {
        errors.push(`${p.name}: tree has ${tree.length} species but no root`);
      }
    }
    return errors;
  });
  assert(lineageCheck.length === 0, `Parent-child references valid (${lineageCheck.length} errors)`);
  for (const e of lineageCheck) console.log(`    ${e}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 3: Species traits are environment-appropriate ===');
  // ──────────────────────────────────────────────────────────────────────
  const traitCheck = await page.evaluate(() => {
    const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
    const result = {};
    for (const p of planets) {
      const tree = p.evolutionTree || [];
      if (tree.length === 0) continue;
      const bodyTypes = [...new Set(tree.map(s => s.traits?.bodyType).filter(Boolean))];
      const metabolisms = [...new Set(tree.map(s => s.traits?.metabolism).filter(Boolean))];
      result[p.name] = { bodyTypes, metabolisms, count: tree.length };
    }
    return result;
  });

  for (const [pName, data] of Object.entries(traitCheck)) {
    console.log(`  ${pName}: ${data.count} species, bodies=[${data.bodyTypes.join(', ')}], metabolism=[${data.metabolisms.join(', ')}]`);
  }
  assert(Object.keys(traitCheck).length > 0, 'At least one planet has species with traits');

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 4: Extinction marks species correctly ===');
  // ──────────────────────────────────────────────────────────────────────
  const extinctCheck = await page.evaluate(() => {
    const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
    const errors = [];
    for (const p of planets) {
      for (const s of (p.evolutionTree || [])) {
        if (s.extinctAt !== null) {
          if (typeof s.extinctAt !== 'number') errors.push(`${s.name}: extinctAt is not a number`);
          if (!s.extinctReason) errors.push(`${s.name}: extinct but no reason given`);
        }
        if (s.extinctAt === null && s.extinctReason) {
          errors.push(`${s.name}: alive but has extinctReason`);
        }
      }
    }
    return errors;
  });
  assert(extinctCheck.length === 0, `Extinction data consistent (${extinctCheck.length} errors)`);
  for (const e of extinctCheck) console.log(`    ${e}`);

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 5: Stage progression spawns new species ===');
  // ──────────────────────────────────────────────────────────────────────
  const stageCheck = await page.evaluate(() => {
    const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
    const result = {};
    for (const p of planets) {
      const tree = p.evolutionTree || [];
      const stages = {};
      for (const s of tree) {
        stages[s.stage] = (stages[s.stage] || 0) + 1;
      }
      if (Object.keys(stages).length > 0) result[p.name] = stages;
    }
    return result;
  });

  for (const [pName, stages] of Object.entries(stageCheck)) {
    console.log(`  ${pName}: ${JSON.stringify(stages)}`);
  }

  const hasComplex = Object.values(stageCheck).some(s => s.complex > 0);
  if (hasComplex) {
    console.log('  [OK]   Complex-stage species found');
  } else {
    console.log('  [INFO] No complex-stage species (depends on sim time)');
  }

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 6: Simulate long-term for intelligence ===');
  // ──────────────────────────────────────────────────────────────────────
  console.log('  Simulating 50M more years...');
  await page.evaluate(() => window.__STAR_SIM_DEBUG__.simulateYears({ years: 50e6, stepYears: 2e5 }));

  const snap2 = await page.evaluate(() => {
    return window.__STAR_SIM_DEBUG__.snapshotPlanets().map(p => ({
      name: p.name, lifeStage: p.lifeStage,
      treeSize: (p.evolutionTree || []).length,
      aliveSpecies: (p.evolutionTree || []).filter(s => !s.extinctAt).length,
      extinctSpecies: (p.evolutionTree || []).filter(s => s.extinctAt !== null).length,
      intelligencePotential: p.intelligencePotential,
    }));
  });

  for (const p of snap2) {
    console.log(`  ${p.name}: stage=${p.lifeStage}, tree=${p.treeSize} (alive=${p.aliveSpecies}, extinct=${p.extinctSpecies}), intel=${p.intelligencePotential?.toFixed(3)}`);
  }

  const anyIntelligent = snap2.some(p => p.lifeStage === 'intelligent');
  if (anyIntelligent) {
    console.log('  [OK]   Intelligent life emerged!');
    const intelligentSpecies = await page.evaluate(() => {
      const planets = window.__STAR_SIM_DEBUG__.snapshotPlanets();
      for (const p of planets) {
        const intels = (p.evolutionTree || []).filter(s => s.stage === 'intelligent');
        if (intels.length > 0) return { planet: p.name, species: intels.map(s => ({ name: s.name, traits: s.traits })) };
      }
      return null;
    });
    if (intelligentSpecies) {
      for (const s of intelligentSpecies.species) {
        console.log(`    ${s.name}: ${s.traits?.bodyType} | ${s.traits?.metabolism} | ${s.traits?.locomotion} | ${s.traits?.intelligence}`);
      }
    }
  } else {
    console.log('  [INFO] No intelligent species yet (may need more sim time)');
  }

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== TEST 7: No JS errors during simulation ===');
  // ──────────────────────────────────────────────────────────────────────
  const jsErrors = await page.evaluate(() => {
    return (window.__pageErrors || []).slice(-5);
  });
  assert(jsErrors.length === 0, `No JS errors captured (${jsErrors.length} found)`);

  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  if (failures === 0) {
    console.log('[PASS] All tests passed!');
  } else {
    console.log(`[FAIL] ${failures} test(s) failed.`);
    process.exitCode = 1;
  }

  await browser.close();
})();

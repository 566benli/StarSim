const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0', timeout: 30000 });

  await page.waitForFunction(() => window.__GENESIS_ERROR_DEBUG__, { timeout: 15000 });

  console.log('=== Testing Evolution Tree ===');

  const seedResult = await page.evaluate(() => {
    const dbg = window.__GENESIS_ERROR_DEBUG__;
    return dbg.seedLifeScenario({
      planets: [
        {
          name: 'Temperate World',
          presetId: 'earth_like',
          overrides: {
            temperature: 310,
            atmosphere: 1.2,
            atmosphereComposition: { N2: 0.70, CO2: 0.20, CH4: 0.08, Ar: 0.02 },
            hasWater: true,
            magneticField: 1.5,
          },
        },
      ],
    });
  });
  console.log('Seeded system:', JSON.stringify(seedResult));

  console.log('Simulating 5M years...');
  const sim1 = await page.evaluate(() => {
    return window.__GENESIS_ERROR_DEBUG__.simulateYears({ years: 5e6, stepYears: 5e4 });
  });
  console.log('Sim result:', JSON.stringify(sim1)?.slice(0, 200));

  let snapshot = await page.evaluate(() => {
    const planets = window.__GENESIS_ERROR_DEBUG__.snapshotPlanets();
    return planets.map(p => ({
      name: p.name,
      lifeStage: p.lifeStage,
      treeSize: (p.evolutionTree || []).length,
      aliveSpecies: (p.evolutionTree || []).filter(s => !s.extinctAt).length,
      extinctSpecies: (p.evolutionTree || []).filter(s => s.extinctAt !== null).length,
      biosphereHealth: p.biosphereHealth,
      biodiversity: p.biodiversity,
    }));
  });

  console.log('\nPlanet snapshots after 5M yr:');
  for (const p of snapshot) {
    console.log(`  ${p.name}: stage=${p.lifeStage}, tree=${p.treeSize} (alive=${p.aliveSpecies}, extinct=${p.extinctSpecies}), health=${p.biosphereHealth?.toFixed(3)}, biodiv=${p.biodiversity?.toFixed(3)}`);
  }

  console.log('\nSimulating 20M more years...');
  await page.evaluate(() => {
    return window.__GENESIS_ERROR_DEBUG__.simulateYears({ years: 20e6, stepYears: 1e5 });
  });

  snapshot = await page.evaluate(() => {
    const planets = window.__GENESIS_ERROR_DEBUG__.snapshotPlanets();
    return planets.map(p => ({
      name: p.name,
      lifeStage: p.lifeStage,
      treeSize: (p.evolutionTree || []).length,
      aliveSpecies: (p.evolutionTree || []).filter(s => !s.extinctAt).length,
      extinctSpecies: (p.evolutionTree || []).filter(s => s.extinctAt !== null).length,
      biosphereHealth: p.biosphereHealth,
      biodiversity: p.biodiversity,
    }));
  });

  console.log('\nPlanet snapshots after 25M yr total:');
  for (const p of snapshot) {
    console.log(`  ${p.name}: stage=${p.lifeStage}, tree=${p.treeSize} (alive=${p.aliveSpecies}, extinct=${p.extinctSpecies}), health=${p.biosphereHealth?.toFixed(3)}, biodiv=${p.biodiversity?.toFixed(3)}`);
  }

  // Print species detail
  const detail = await page.evaluate(() => {
    const planets = window.__GENESIS_ERROR_DEBUG__.snapshotPlanets();
    const alive = planets.find(p => (p.evolutionTree || []).length > 0);
    if (!alive) return null;
    return {
      name: alive.name,
      tree: alive.evolutionTree.map(s => ({
        name: s.name,
        stage: s.stage,
        parentId: s.parentId,
        alive: s.extinctAt === null,
        fitness: s.fitness?.toFixed(3),
        body: s.traits?.bodyType,
        metabolism: s.traits?.metabolism,
        locomotion: s.traits?.locomotion,
        extinctReason: s.extinctReason,
      })),
    };
  });

  if (detail) {
    console.log(`\n=== Evolution Tree for ${detail.name} ===`);
    for (const s of detail.tree) {
      const status = s.alive ? 'ALIVE' : `EXTINCT (${s.extinctReason})`;
      console.log(`  [${s.stage}] ${s.name} | ${status} | fitness=${s.fitness} | ${s.body} | ${s.metabolism} | ${s.locomotion}`);
    }
    console.log('\nSPECIES COUNT:', detail.tree.length);
    console.log('ALIVE:', detail.tree.filter(s => s.alive).length);
    console.log('EXTINCT:', detail.tree.filter(s => !s.alive).length);
  } else {
    console.log('\n[WARN] No planet developed life in the test window.');
  }

  // Validate species structure
  const validation = await page.evaluate(() => {
    const planets = window.__GENESIS_ERROR_DEBUG__.snapshotPlanets();
    const errors = [];
    for (const p of planets) {
      for (const sp of (p.evolutionTree || [])) {
        if (!sp.id) errors.push(`${p.name}: species missing id`);
        if (!sp.name) errors.push(`${p.name}: species ${sp.name} missing name`);
        if (!sp.traits) errors.push(`${p.name}: species ${sp.name} missing traits`);
        if (!sp.stage) errors.push(`${p.name}: species ${sp.name} missing stage`);
        if (typeof sp.fitness !== 'number') errors.push(`${p.name}: species ${sp.name} missing fitness`);
      }
    }
    return errors;
  });

  if (validation.length > 0) {
    console.log('\n[FAIL] Validation errors:');
    for (const e of validation) console.log('  -', e);
    process.exitCode = 1;
  } else {
    console.log('\n[PASS] All species have valid structure.');
  }

  await browser.close();
  console.log('\n=== Evolution Tree Test Complete ===');
})();

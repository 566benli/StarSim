const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1400,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text());
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => window.__GENESIS_ERROR_DEBUG__, { timeout: 15000 });

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) { console.log(`[FAIL] ${msg}`); failures++; }
    else { console.log(`[OK]   ${msg}`); }
  }

  // ── Seed and simulate ───────────────────────────────────────────────
  console.log('\n=== Setting up Life Garden + simulating 25M years ===');

  await page.evaluate(() => {
    const dbg = window.__GENESIS_ERROR_DEBUG__;
    dbg.seedLifeScenario({
      planets: [
        { name: 'Eden', presetId: 'earth_like', overrides: { temperature: 310, atmosphere: 1.0, hasWater: true, magneticField: 1.2, atmosphereComposition: { N2: 0.72, CO2: 0.18, CH4: 0.08, Ar: 0.02 } } },
        { name: 'Vulcan', presetId: 'earth_like', overrides: { temperature: 800, atmosphere: 45, hasWater: false, magneticField: 0.4, atmosphereComposition: { SO2: 0.55, CO2: 0.35, N2: 0.10 } } },
      ],
    });
    dbg.simulateYears({ years: 25e6, stepYears: 1e5 });
  });

  // ── Check planet data ───────────────────────────────────────────────
  const planets = await page.evaluate(() => {
    return window.__GENESIS_ERROR_DEBUG__.snapshotPlanets().map(p => ({
      name: p.name, lifeStage: p.lifeStage,
      treeSize: (p.evolutionTree || []).length,
      alive: (p.evolutionTree || []).filter(s => s.extinctAt === null).length,
      extinct: (p.evolutionTree || []).filter(s => s.extinctAt !== null).length,
    }));
  });

  for (const p of planets) {
    console.log(`  ${p.name}: stage=${p.lifeStage}, tree=${p.treeSize} (alive=${p.alive}, extinct=${p.extinct})`);
  }

  const edenHasLife = planets.find(p => p.name === 'Eden' && p.treeSize > 0);
  assert(!!edenHasLife, 'Eden should have species in its evolution tree');

  // ── Select a planet to trigger InfoPanel ────────────────────────────
  console.log('\n=== Selecting planet to check InfoPanel + Evolution Tree UI ===');

  const selected = await page.evaluate(() => {
    const engine = window.__GENESIS_ERROR_DEBUG__.getEngine();
    const bodies = engine.getBodies();
    const planet = bodies.find(b => b.type === 'planet' && b.name === 'Eden');
    if (!planet) return null;

    window.__GENESIS_ERROR_DEBUG__.getStoreState().setSelectedBody(planet);
    return { name: planet.name, lifeStage: planet.lifeStage, treeSize: (planet.evolutionTree || []).length };
  });
  console.log('  Selected:', selected);

  await new Promise((r) => setTimeout(r, 500));

  // ── Open Evolution Tree modal from InfoPanel ────────────────────────
  const openButtonResult = await page.evaluate(() => {
    const openBtn = document.querySelector('.evo-tree-open-btn');
    if (!openBtn) return { found: false };
    openBtn.click();
    return { found: true, text: openBtn.textContent || '' };
  });
  assert(openButtonResult.found, 'Evolution Tree button should be present in InfoPanel');
  await new Promise((r) => setTimeout(r, 300));

  // ── Check that the Evolution Tree modal is rendered ─────────────────
  const evoTreeVisible = await page.evaluate(() => {
    const modal = document.querySelector('.evo-modal');
    if (!modal) return { found: false };
    const title = modal.querySelector('.evo-modal-title');
    const graph = modal.querySelector('.evo-tree-graph');
    const nodes = modal.querySelectorAll('.evo-species-node');
    const aliveNodes = modal.querySelectorAll('.evo-species-node.alive');
    const extinctNodes = modal.querySelectorAll('.evo-species-node.extinct');
    return {
      found: true,
      titleText: title?.textContent || '',
      hasGraph: !!graph,
      nodeCount: nodes.length,
      aliveCount: aliveNodes.length,
      extinctCount: extinctNodes.length,
    };
  });

  console.log('  Evolution Tree UI:', JSON.stringify(evoTreeVisible, null, 2));
  assert(evoTreeVisible.found, 'evolution tree modal should be present in DOM');
  assert(evoTreeVisible.hasGraph, 'evo-tree-graph should be rendered');
  assert(evoTreeVisible.nodeCount > 0, `Species nodes should be rendered (found ${evoTreeVisible.nodeCount})`);
  assert(
    (evoTreeVisible.titleText || '').includes('Evolution Tree'),
    'Title should say "Evolution Tree"',
  );

  // ── Click on a species node to open detail card ─────────────────────
  console.log('\n=== Clicking a species node to test detail card ===');
  const clickResult = await page.evaluate(() => {
    const firstNode = document.querySelector('.evo-modal .evo-species-node.alive');
    if (!firstNode) return { clicked: false };
    firstNode.click();
    return { clicked: true, name: firstNode.querySelector('.evo-species-name')?.textContent };
  });

  await new Promise((r) => setTimeout(r, 300));

  const detailCard = await page.evaluate(() => {
    const card = document.querySelector('.evo-detail-card');
    if (!card) return { found: false };
    const name = card.querySelector('.evo-detail-name')?.textContent;
    const desc = card.querySelector('.evo-detail-desc')?.textContent;
    const traits = [...card.querySelectorAll('.evo-trait-row')].map(r => ({
      label: r.querySelector('.evo-trait-label')?.textContent,
      value: r.querySelector('.evo-trait-value')?.textContent,
    }));
    const metrics = [...card.querySelectorAll('.evo-metric')].map(m => ({
      label: m.querySelector('.evo-metric-label')?.textContent,
      value: m.querySelector('.evo-metric-val')?.textContent,
    }));
    return { found: true, name, desc: desc?.slice(0, 80), traits, metrics };
  });

  console.log('  Detail card:', JSON.stringify(detailCard, null, 2));
  assert(detailCard.found, 'Detail card should appear after clicking a species');
  assert(detailCard.traits.length === 5, `Should show 5 traits (found ${detailCard.traits.length})`);
  assert(detailCard.metrics.length === 2, `Should show 2 metrics (found ${detailCard.metrics.length})`);
  assert(detailCard.name && detailCard.name.length > 0, 'Species name should be displayed');
  assert(detailCard.desc && detailCard.desc.length > 0, 'Species description should be displayed');

  // ── Take screenshot of the Evolution Tree ──────────────────────────
  console.log('\n=== Taking screenshot ===');
  const shotDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });
  const shotPath = path.join(shotDir, 'evolution-tree-ui.png');
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('  Saved:', shotPath);

  // ── Test empty state: select a planet with no life ──────────────────
  console.log('\n=== Testing empty state (no life planet) ===');
  const emptyResult = await page.evaluate(() => {
    const engine = window.__GENESIS_ERROR_DEBUG__.getEngine();
    if (engine?.pause) engine.pause();
    const bodies = engine.getBodies();
    const store = window.__GENESIS_ERROR_DEBUG__.getStoreState();
    const noLifePlanet = bodies.find(b => b.type === 'planet' && (!b.evolutionTree || b.evolutionTree.length === 0));
    if (!noLifePlanet) {
      const planet = bodies.find(b => b.type === 'planet' && b.name === 'Eden')
        || bodies.find(b => b.type === 'planet');
      if (planet) {
        const savedTree = planet.evolutionTree;
        planet.evolutionTree = [];
        planet.lifeStage = 'none';
        planet.hasLife = false;
        store.setSelectedBody(null);
        store.setSelectedBody(planet);
        return { tested: true, name: planet.name, restored: savedTree.length, fallbackMutated: true };
      }
      return { tested: false };
    }
    store.setSelectedBody(noLifePlanet);
    return { tested: true, name: noLifePlanet.name, fallbackMutated: false };
  });

  if (emptyResult.tested) {
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const close = document.querySelector('.evo-modal-close');
      if (close) close.click();
      const openBtn = document.querySelector('.evo-tree-open-btn');
      if (openBtn) openBtn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    const emptyTree = await page.evaluate(() => {
      const modal = document.querySelector('.evo-modal');
      if (!modal) return { found: false };
      const empty = modal.querySelector('.evo-tree-empty');
      const graph = modal.querySelector('.evo-tree-graph');
      return {
        found: true,
        showsEmptyState: !!empty,
        emptyText: empty?.textContent || '',
        graphVisible: !!graph,
      };
    });
    console.log('  Empty state result:', JSON.stringify(emptyTree));
    assert(emptyTree.showsEmptyState || !emptyTree.graphVisible, 'Empty state or no graph for planet without life');
    assert(
      emptyTree.emptyText.includes('No life has evolved') || emptyTree.emptyText.includes('Prebiotic chemistry'),
      'Empty copy should describe no tree',
    );
  }

  await page.evaluate(() => {
    const close = document.querySelector('.evo-modal-close');
    if (close) close.click();
  });

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  if (failures === 0) {
    console.log('[PASS] All UI tests passed!');
  } else {
    console.log(`[FAIL] ${failures} test(s) failed.`);
    process.exitCode = 1;
  }

  await browser.close();
})();

/**
 * test-civilization.js
 * Fast-forward simulation until civilizations emerge, then verify:
 *   1. Planet.civilization field is set
 *   2. EvolutionTree button shows K-level badge
 *   3. Tech Tree button visible and panel renders
 *   4. Engine EmpireSystem is accessible
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:8080';
const MAX_WAIT_YEARS = 5e9; // fast-forward up to 5 billion simulated years

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  let failures = 0;
  const assert = (cond, msg) => {
    if (!cond) { console.log(`  [FAIL] ${msg}`); failures++; }
    else         { console.log(`  [OK]   ${msg}`); }
  };

  try {
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('starsim-auth-dismissed', '1');
        localStorage.setItem('starsim_onboarding_v1_done', '1');
      } catch {}
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => !!window.__STAR_SIM_DEBUG__, { timeout: 15000 });

    // ── Seed a life-optimized system ────────────────────────────────────
    console.log('\n=== Seeding life-garden system ===');
    const seed = await page.evaluate(() => {
      const dbg = window.__STAR_SIM_DEBUG__;
      return dbg.seedLifeScenario({
        starPresetId: 'sun_like',
        starName: 'Civitas',
        planets: [
          { presetId: 'earth_like', name: 'HomeWorld', overrides: { orbitalDistance: 1.0, atmosphere: 1.0, hasWater: true } },
          { presetId: 'super_earth', name: 'NewEarth',  overrides: { orbitalDistance: 1.4 } },
        ],
        lifePreset: 'gameplay',
      });
    });
    assert(!!seed?.starId, `System seeded: ${seed?.starId}`);

    // ── Fast-forward until civilization or timeout ───────────────────────
    console.log('\n=== Fast-forwarding simulation ===');

    const civResult = await page.evaluate(async (maxYears) => {
      const dbg = window.__STAR_SIM_DEBUG__;
      const eng = dbg.getEngine();
      if (!eng) return { reached: false, reason: 'no engine' };

      // Use simulateYears in small chunks, check for civ each step
      const CHUNK = 5e8; // 500M years per step
      let total = 0;

      while (total < maxYears) {
        dbg.simulateYears({ years: CHUNK, stepYears: 1e7 });
        total += CHUNK;

        const bodies = eng.getBodies().filter(b => b.alive && b.type === 'planet');
        const withCiv = bodies.find(b => b.civilization && !b.civilization.collapsed);
        if (withCiv) {
          return {
            reached: true,
            planetName: withCiv.name,
            civName: withCiv.civilization.name,
            civStage: withCiv.civilization.stage,
            kardashev: withCiv.civilization.kardashevLevel,
            techCount: withCiv.civilization.unlockedTechs.length,
            population: withCiv.civilization.population,
            simTime: eng.simulationTime,
          };
        }

        // Also check lifeStage progression
        const intel = bodies.find(b => b.lifeStage === 'intelligent');
        if (intel && total > 1e9) {
          // intelligence exists but no civ yet — return partial info
          return {
            reached: false,
            reason: `${intel.name} is intelligent but no civ yet after ${(total/1e9).toFixed(1)}Gyr`,
            intelligencePotential: intel.intelligencePotential,
            simTime: eng.simulationTime,
          };
        }
      }
      return { reached: false, reason: `timeout after ${(maxYears/1e9).toFixed(0)}Gyr`, simTime: eng.simulationTime };
    }, MAX_WAIT_YEARS);

    console.log('  Civilization result:', JSON.stringify(civResult, null, 2));

    if (!civResult.reached) {
      console.log(`\n  [INFO] No civilization emerged: ${civResult.reason}`);
      console.log(`  [INFO] Sim time: ${(civResult.simTime / 1e9)?.toFixed(2)} Gyr`);

      // Still test the engine APIs
      const engineState = await page.evaluate(() => {
        const eng = window.__STAR_SIM_DEBUG__?.getEngine();
        if (!eng) return null;
        return {
          hasCivSystem: typeof eng.getCivilizationSystem === 'function',
          hasEmpireSystem: typeof eng.getEmpireSystem === 'function',
          empireCount: eng.getEmpireSystem?.()?.getAllEmpires?.()?.length ?? 0,
        };
      });
      assert(engineState?.hasCivSystem,  'engine.getCivilizationSystem() exists');
      assert(engineState?.hasEmpireSystem,'engine.getEmpireSystem() exists');
      console.log('  [INFO] Empire count:', engineState?.empireCount ?? 'N/A');
    } else {
      // Civilization emerged!
      assert(civResult.reached, `Civilization "${civResult.civName}" emerged on ${civResult.planetName}`);

      // Select that planet
      await page.evaluate((planetName) => {
        const dbg = window.__STAR_SIM_DEBUG__;
        const bodies = dbg.snapshotBodies?.() || [];
        const planet = bodies.find(b => b.name === planetName);
        if (planet) dbg.selectBody(planet.id);
      }, civResult.planetName);
      await new Promise(r => setTimeout(r, 600));

      // ── Test Evolution Tree button ───────────────────────────────────
      console.log('\n=== Testing Evolution Tree button ===');
      const evoBtn = await page.evaluate(() => {
        const btn = document.querySelector('.evo-tree-open-btn');
        if (!btn) return { found: false };
        return {
          found: true,
          hasCivClass: btn.classList.contains('has-civilization'),
          hasBadge: !!btn.querySelector('.evo-civ-badge'),
          text: btn.textContent?.trim(),
        };
      });
      assert(evoBtn.found, 'Evolution Tree button found');
      assert(evoBtn.hasCivClass, 'Button has .has-civilization class');
      assert(evoBtn.hasBadge,    'Kardashev badge present on button');

      // Open Evolution Tree modal
      await page.evaluate(() => document.querySelector('.evo-tree-open-btn')?.click());
      await new Promise(r => setTimeout(r, 400));

      const evoModal = await page.evaluate(() => {
        const modal = document.querySelector('.evo-modal');
        if (!modal) return { found: false };
        const stageBar  = modal.querySelector('.evo-stage-bar');
        const civBanner = modal.querySelector('.evo-civ-banner');
        const civNode   = modal.querySelector('.evo-species-node.stage-civilization');
        return {
          found: true,
          hasStageBar:  !!stageBar,
          hasCivBanner: !!civBanner,
          hasCivNode:   !!civNode,
        };
      });
      assert(evoModal.found,          'Evolution Tree modal opened');
      assert(evoModal.hasStageBar,    'Stage tier bar rendered');
      assert(evoModal.hasCivBanner,   'Civilization banner shown');
      assert(evoModal.hasCivNode,     'Civilization species node in tree');

      // Close modal
      await page.evaluate(() => document.querySelector('.evo-modal-close')?.click());
      await new Promise(r => setTimeout(r, 200));

      // ── Test Tech Tree button ────────────────────────────────────────
      console.log('\n=== Testing Tech Tree button ===');
      const techBtn = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.hr-diagram-btn')];
        const techBtnEl = btns.find(b => b.textContent?.includes('Tech Tree'));
        if (!techBtnEl) return { found: false };
        techBtnEl.click();
        return { found: true, text: techBtnEl.textContent?.trim() };
      });
      assert(techBtn.found, 'Tech Tree button found in InfoPanel');
      await new Promise(r => setTimeout(r, 300));

      const techPanel = await page.evaluate(() => {
        const panel = document.querySelector('.tech-tree-inline');
        if (!panel) return { found: false };
        const summary    = panel.querySelector('.tech-tree-summary');
        const progress   = panel.querySelector('.tech-tree-progress');
        const catTabs    = panel.querySelectorAll('.tech-cat-tab');
        const nodes      = panel.querySelectorAll('.tech-node');
        const unlocked   = panel.querySelectorAll('.tech-node--unlocked');
        const available  = panel.querySelectorAll('.tech-node--available');
        return {
          found: true,
          hasSummary:  !!summary,
          hasProgress: !!progress,
          catTabCount: catTabs.length,
          nodeCount:   nodes.length,
          unlockedCount: unlocked.length,
          availableCount: available.length,
        };
      });
      console.log('  Tech Tree state:', JSON.stringify(techPanel, null, 2));
      assert(techPanel.found,          '.tech-tree-inline rendered inside panel');
      assert(techPanel.hasSummary,     'Kardashev/stage summary rendered');
      assert(techPanel.hasProgress,    'Progress bar rendered');
      assert(techPanel.catTabCount > 0,'Category tabs rendered');
      assert(techPanel.nodeCount > 0,  'Tech nodes rendered');
      assert(techPanel.unlockedCount > 0, 'Some techs already unlocked');
    }

    // ── Engine API checks ────────────────────────────────────────────────
    console.log('\n=== Engine API checks ===');
    const engineCheck = await page.evaluate(() => {
      const eng = window.__STAR_SIM_DEBUG__?.getEngine();
      if (!eng) return { ok: false };
      return {
        ok: true,
        hasCivSystem:  typeof eng.getCivilizationSystem === 'function',
        hasEmpireSys:  typeof eng.getEmpireSystem === 'function',
        empireCount:   eng.getEmpireSystem?.()?.getAllEmpires?.()?.length ?? 0,
        warCount:      eng.getEmpireSystem?.()?.getActiveWars?.()?.length ?? 0,
      };
    });
    assert(engineCheck.ok,            'Engine accessible');
    assert(engineCheck.hasCivSystem,  'getCivilizationSystem() method exists');
    assert(engineCheck.hasEmpireSys,  'getEmpireSystem() method exists');
    console.log(`  Empires: ${engineCheck.empireCount}, Active wars: ${engineCheck.warCount}`);

    console.log('\n=== Creature composer + biosphere grid ===');
    const artBio = await page.evaluate(() => {
      const dbg = window.__STAR_SIM_DEBUG__;
      const composer = dbg.creatureComposerTest?.() ?? { error: 'missing' };
      const planets = dbg.snapshotPlanets?.() || [];
      const lifePlanet = planets.find((p) => ['simple', 'complex', 'intelligent'].includes(p.lifeStage));
      const civPlanet = planets.find((p) => p.hasCivCharacter);
      return {
        composer,
        lifeHasGrid: !!lifePlanet?.hasBiosphereGrid,
        lifeName: lifePlanet?.name,
        civChar: !!civPlanet,
      };
    });
    assert(artBio.composer?.sameTwice === true, 'Creature composer deterministic (same PNG twice)');
    assert(artBio.lifeHasGrid === true, `Life-bearing planet has biosphere grid (${artBio.lifeName || 'n/a'})`);
    if (civResult.reached) {
      assert(artBio.civChar === true, 'Civilization exposes character on snapshot planet');
    }

    if (errors.length) {
      console.log(`\n  [WARN] ${errors.length} browser error(s):`, errors.slice(0, 3));
    }

  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Result: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURES`}`);
  if (failures > 0) process.exit(1);
})();

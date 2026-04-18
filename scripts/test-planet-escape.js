/**
 * test-planet-escape.js
 *
 * Verifies the rogue-planet pipeline:
 *   1. markBodyEscaped() registers body in _escapedBodies
 *   2. engine.getBody(id) finds it even after removeBody()
 *   3. engine.getAllBodies() includes it
 *   4. updateEscapedBodies() advances universePosition
 *   5. GravitySystem has NO rubber-band (detectBoundary uses raw escape, no damping)
 *   6. InfoPanel opens when a rogue body is selected
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:8080';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('[PAGE ERR]', e.message));

  let failures = 0;
  const ok   = msg => console.log(`  [OK]   ${msg}`);
  const fail = msg => { console.log(`  [FAIL] ${msg}`); failures++; };
  const assert = (cond, msg) => (cond ? ok : fail)(msg);

  try {
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('genesiserror-auth-dismissed', '1');
        localStorage.setItem('genesiserror_onboarding_v1_done', '1');
      } catch {}
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => !!window.__GENESIS_ERROR_DEBUG__, { timeout: 15000 });

    // ── Seed a basic system ──────────────────────────────────────────────────
    console.log('\n=== Seeding test system ===');
    const seed = await page.evaluate(() => {
      return window.__GENESIS_ERROR_DEBUG__.seedLifeScenario({
        starPresetId: 'sun_like',
        starName: 'TestStar',
        planets: [
          { presetId: 'gas_giant', name: 'Wanderer', overrides: { orbitalDistance: 20 } },
          { presetId: 'earth_like', name: 'HomeWorld' },
        ],
      });
    });
    assert(!!seed?.starId, `System seeded: ${seed?.starId}`);

    // ── Test 1: detectBoundary has no rubber-band ────────────────────────────
    console.log('\n=== Test 1: No rubber-band damping zone ===');

    const noDampingCheck = await page.evaluate(() => {
      // Read the GravitySystem source to verify no damping code exists
      const eng = window.__GENESIS_ERROR_DEBUG__.getEngine();
      const gs = [...eng.gravitySystems.values()][0];
      if (!gs) return { error: 'no GravitySystem' };

      // Verify detectBoundary signature via toString — should NOT contain 'dampStrength' or 'multiplyScalar'
      const src = gs.detectBoundary.toString();
      return {
        hasDampStrength: src.includes('dampStrength'),
        hasVelocityDamping: src.includes('multiplyScalar'),
        hasPullStrength: src.includes('pullStrength'),
        hasHardBoundaryOnly: src.includes('onBoundaryExceeded') && !src.includes('dampStrength'),
      };
    });

    assert(!noDampingCheck.error, 'GravitySystem accessible');
    assert(!noDampingCheck.hasDampStrength, 'No dampStrength variable (rubber-band removed)');
    assert(!noDampingCheck.hasVelocityDamping, 'No velocity.multiplyScalar in detectBoundary');
    assert(!noDampingCheck.hasPullStrength, 'No pull-toward-COM in detectBoundary');
    assert(noDampingCheck.hasHardBoundaryOnly, 'Hard boundary fires onBoundaryExceeded directly');

    // ── Test 2: markBodyEscaped + _escapedBodies tracking ───────────────────
    console.log('\n=== Test 2: Escape tracking ===');

    const escapedResult = await page.evaluate(() => {
      const eng = window.__GENESIS_ERROR_DEBUG__.getEngine();
      const planet = eng.getBodies().find(b => b.name === 'Wanderer');
      if (!planet) return { error: 'Wanderer not found' };

      const id = planet.id;
      const gs = eng.gravitySystems.get(planet.systemId);

      // Simulate what App._boundaryHandler does
      eng.markBodyEscaped(planet, {
        systemId: planet.systemId,
        com: { x: 0, y: 0, z: 0 },
      });
      if (gs) gs.removeBody(planet);

      // Verify
      const inGetBodies   = !!eng.getBodies().find(b => b.id === id);
      const inEscaped     = !!eng._escapedBodies.find(b => b.id === id);
      const foundByGetBody = !!eng.getBody(id);
      const inGetAll      = !!eng.getAllBodies().find(b => b.id === id);

      return {
        id,
        escapedFlag: planet.escapedSystem,
        inGetBodies,
        inEscaped,
        foundByGetBody,
        inGetAll,
        uvMag: Math.sqrt(
          planet.universeVelocity.x ** 2 +
          planet.universeVelocity.y ** 2 +
          planet.universeVelocity.z ** 2
        ),
      };
    });

    console.log('  escapedResult:', JSON.stringify(escapedResult, null, 2));
    assert(!escapedResult.error, 'Wanderer planet found');
    assert(escapedResult.escapedFlag === true, 'escapedSystem flag set to true');
    assert(!escapedResult.inGetBodies, 'Removed from getBodies() (GravitySystem)');
    assert(escapedResult.inEscaped, 'Present in engine._escapedBodies');
    assert(escapedResult.foundByGetBody, 'engine.getBody(id) still finds it');
    assert(escapedResult.inGetAll, 'engine.getAllBodies() includes it');
    assert(escapedResult.uvMag > 0, `Non-zero universeVelocity (${escapedResult.uvMag?.toFixed(4)} Mly/Myr)`);

    // ── Test 3: updateEscapedBodies moves rogue planets ─────────────────────
    console.log('\n=== Test 3: Rogue body drifts in universe space ===');

    const driftResult = await page.evaluate(() => {
      const eng = window.__GENESIS_ERROR_DEBUG__.getEngine();
      const rogue = eng._escapedBodies.find(b => b.alive);
      if (!rogue) return { error: 'no rogue body' };

      const p0x = rogue.universePosition.x;
      const p0y = rogue.universePosition.y;
      const p0z = rogue.universePosition.z;

      // Run updateEscapedBodies directly with 1e6 years (1 Myr)
      eng.updateEscapedBodies(1e6);

      const moved = (
        Math.abs(rogue.universePosition.x - p0x) +
        Math.abs(rogue.universePosition.y - p0y) +
        Math.abs(rogue.universePosition.z - p0z)
      ) > 1e-12;

      return {
        moved,
        before: { x: p0x, y: p0y, z: p0z },
        after: {
          x: rogue.universePosition.x,
          y: rogue.universePosition.y,
          z: rogue.universePosition.z,
        },
      };
    });

    assert(!driftResult.error, 'Rogue body found for drift test');
    assert(driftResult.moved, 'universePosition changed after updateEscapedBodies()');
    if (driftResult.before) {
      const d = Math.abs(driftResult.after.x - driftResult.before.x);
      ok(`  Position delta x: ${d.toFixed(6)} Mly`);
    }

    // ── Test 4: getAllBodies counts are consistent ────────────────────────────
    console.log('\n=== Test 4: getBodies / getAllBodies counts ===');

    const countResult = await page.evaluate(() => {
      const eng = window.__GENESIS_ERROR_DEBUG__.getEngine();
      const bound   = eng.getBodies().length;
      const escaped = eng._escapedBodies.filter(b => b.alive).length;
      const all     = eng.getAllBodies().length;
      return { bound, escaped, all, ok: all === bound + escaped };
    });

    console.log(`  getBodies: ${countResult.bound}, _escapedBodies: ${countResult.escaped}, getAllBodies: ${countResult.all}`);
    assert(countResult.ok, `getAllBodies() = ${countResult.bound} + ${countResult.escaped} = ${countResult.all}`);

    // ── Test 5: InfoPanel opens for rogue body ───────────────────────────────
    console.log('\n=== Test 5: InfoPanel for escaped rogue body ===');

    await page.evaluate(() => {
      const eng = window.__GENESIS_ERROR_DEBUG__.getEngine();
      const rogue = eng._escapedBodies.find(b => b.alive);
      if (rogue) window.__GENESIS_ERROR_DEBUG__.selectBody(rogue.id);
    });
    await new Promise(r => setTimeout(r, 600));

    const panelResult = await page.evaluate(() => {
      const panel = document.querySelector('.info-panel');
      if (!panel) return { exists: false };
      const style = getComputedStyle(panel);
      return {
        exists: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        content: panel.textContent?.slice(0, 80),
      };
    });

    assert(panelResult.exists, 'InfoPanel element in DOM');
    assert(panelResult.visible, 'InfoPanel visible after selecting rogue body');
    ok(`  Panel preview: "${panelResult.content?.trim()}"`);

  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Result: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURES`}`);
  if (failures > 0) process.exit(1);
})();

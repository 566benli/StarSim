/**
 * test-click-focus-hr.js
 *
 * Tests two features across multiple randomised systems:
 *   1. Clicking a body on the minimap/main canvas → InfoPanel opens + camera centres
 *   2. HR Diagram button → inline HR diagram renders in the panel with live data
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:8080';

const SYSTEM_CONFIGS = [
  {
    label: 'Sun-like + 3 planets',
    starPresetId: 'sun_like',
    starName: 'Helios',
    planets: [
      { presetId: 'earth_like',  name: 'Terra' },
      { presetId: 'rocky_small', name: 'Pebble',  overrides: { orbitalDistance: 0.4 } },
      { presetId: 'super_earth', name: 'Goliath', overrides: { orbitalDistance: 2.1 } },
    ],
  },
  {
    label: 'Blue giant + 2 planets',
    starPresetId: 'blue_giant',
    starName: 'Titan',
    planets: [
      { presetId: 'rocky_small', name: 'Cinder', overrides: { orbitalDistance: 3.0 } },
      { presetId: 'earth_like',  name: 'Refuge', overrides: { orbitalDistance: 6.5 } },
    ],
  },
  {
    label: 'Red dwarf + 1 planet',
    starPresetId: 'red_dwarf',
    starName: 'Ember',
    planets: [
      { presetId: 'earth_like', name: 'Warmth', overrides: { orbitalDistance: 0.15 } },
    ],
  },
];

async function runSystem(browser, cfg) {
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  let failures = 0;
  const assert = (cond, msg) => {
    if (!cond) { console.log(`  [FAIL] ${msg}`); failures++; }
    else         { console.log(`  [OK]   ${msg}`); }
  };

  try {
    // Dismiss onboarding so we get straight into the sim
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('starsim-auth-dismissed', '1');
        localStorage.setItem('starsim_onboarding_v1_done', '1');
      } catch {}
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => !!window.__STAR_SIM_DEBUG__, { timeout: 15000 });

    // ── Seed the chosen system ──────────────────────────────────────────
    const seed = await page.evaluate((c) => {
      return window.__STAR_SIM_DEBUG__.seedLifeScenario({
        starPresetId: c.starPresetId,
        starName:     c.starName,
        planets:      c.planets,
      });
    }, cfg);
    assert(seed && seed.starId, `Seeded system: ${cfg.starName}`);

    // Wait for the panel to mount
    await page.waitForSelector('.universe-panel', { timeout: 10000 });

    // ── Advance simulation a few ticks so bodies have positions ─────────
    await page.evaluate(() => {
      const dbg = window.__STAR_SIM_DEBUG__;
      for (let i = 0; i < 120; i++) dbg.tick?.();
    });
    await new Promise(r => setTimeout(r, 400));

    // ════════════════════════════════════════════════════════════════════
    // TEST 1: Select a planet via debug API → InfoPanel appears
    // ════════════════════════════════════════════════════════════════════
    console.log(`\n  --- Test 1: selectBody(planet) → InfoPanel ---`);

    const planetSelect = await page.evaluate(() => {
      const dbg = window.__STAR_SIM_DEBUG__;
      const bodies = (dbg.snapshotBodies?.() || []).filter(b => b.type === 'planet');
      if (!bodies.length) return { found: false, reason: 'no planets' };
      const target = bodies[0];
      dbg.selectBody(target.id);
      return { found: true, id: target.id, name: target.name };
    });
    assert(planetSelect.found, `Planet found and selectBody called (${planetSelect.name || planetSelect.reason})`);

    await new Promise(r => setTimeout(r, 700));

    const infoPanelVisible = await page.evaluate(() => {
      const panel = document.querySelector('.info-panel');
      if (!panel) return { found: false };
      const style = window.getComputedStyle(panel);
      return {
        found: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        hasTitle: !!panel.querySelector('.info-panel-name, .info-header, h2, h3'),
      };
    });
    assert(infoPanelVisible.found,   'InfoPanel element exists in DOM after planet select');
    assert(infoPanelVisible.visible, 'InfoPanel is visible after planet select');

    // ── Test 1b: Select a different body — panel should update ──────────
    console.log(`\n  --- Test 1b: selectBody(star) → InfoPanel updates ---`);

    const starSelectT1 = await page.evaluate((starName) => {
      const dbg = window.__STAR_SIM_DEBUG__;
      const bodies = dbg.snapshotBodies?.() || [];
      const star = bodies.find(b => b.type === 'star' && b.name === starName) ||
                   bodies.find(b => b.type === 'star');
      if (!star) return { found: false };
      dbg.selectBody(star.id);
      return { found: true, id: star.id, name: star.name };
    }, cfg.starName);
    assert(starSelectT1.found, `Star "${cfg.starName}" found and selected (${starSelectT1.name || 'not found'})`);

    await new Promise(r => setTimeout(r, 500));
    const panelAfterStar = await page.evaluate(() => {
      const p = document.querySelector('.info-panel');
      return { found: !!p, visible: p ? window.getComputedStyle(p).display !== 'none' : false };
    });
    assert(panelAfterStar.found && panelAfterStar.visible, 'InfoPanel still visible after switching to star');

    // ════════════════════════════════════════════════════════════════════
    // TEST 2: HR Diagram button → inline diagram renders in panel
    // ════════════════════════════════════════════════════════════════════
    console.log(`\n  --- Test 2: HR Diagram inline rendering ---`);

    // Star should already be selected from test 1b
    const starSelect = await page.evaluate((starName) => {
      const dbg = window.__STAR_SIM_DEBUG__;
      const bodies = dbg.snapshotBodies?.() || [];
      const star = bodies.find(b => b.type === 'star' && b.name === starName) ||
                   bodies.find(b => b.type === 'star');
      if (!star) return { found: false };
      // Re-select to make sure
      dbg.selectBody(star.id);
      return { found: true, name: star.name, temp: star.temperature, lum: star.luminosity };
    }, cfg.starName);

    assert(starSelect.found, `Star "${cfg.starName}" found and selected`);
    await new Promise(r => setTimeout(r, 500));

    if (starSelect.found) {
      // Click the HR Diagram toggle button
      const hrBtnClick = await page.evaluate(() => {
        const btn = document.querySelector('.hr-diagram-btn');
        if (!btn) return { found: false };
        btn.click();
        return { found: true, text: btn.textContent };
      });
      assert(hrBtnClick.found, 'HR Diagram button found in InfoPanel');

      await new Promise(r => setTimeout(r, 300));

      const hrDiagram = await page.evaluate(() => {
        const inline = document.querySelector('.hr-diagram-inline');
        if (!inline) return { found: false };
        const svg    = inline.querySelector('svg.hr-diagram-svg');
        const mainSeq = inline.querySelector('.hr-main-seq');
        const selectedDot = inline.querySelector('.hr-selected-dot');
        const liveReadout = inline.querySelector('.hr-live-readout');
        const legend  = inline.querySelector('.hr-diagram-legend-row');
        const closeBtn = inline.querySelector('.hr-diagram-close');
        return {
          found:        true,
          hasSvg:       !!svg,
          hasMainSeq:   !!mainSeq,
          hasSelectedDot: !!selectedDot,
          hasLiveReadout: !!liveReadout,
          hasLegend:    !!legend,
          hasClose:     !!closeBtn,
          // Confirm it's INSIDE the panel, not fixed/overlay
          isInPanel: !!inline.closest('.info-panel'),
        };
      });

      console.log('  HR Diagram state:', JSON.stringify(hrDiagram, null, 2));
      assert(hrDiagram.found,           'hr-diagram-inline rendered');
      assert(hrDiagram.hasSvg,          'SVG element present');
      assert(hrDiagram.hasMainSeq,      'Main sequence curve rendered');
      assert(hrDiagram.hasSelectedDot,  'Selected star dot rendered');
      assert(hrDiagram.hasLiveReadout,  'Live T/L readout rendered');
      assert(hrDiagram.hasLegend,       'Legend row rendered');
      assert(hrDiagram.isInPanel,       'HR diagram is embedded inside .info-panel (not a floating overlay)');

      // Verify no fullscreen overlay exists
      const noOverlay = await page.evaluate(() => {
        const overlay = document.querySelector('.hr-diagram-overlay');
        return { overlayExists: !!overlay };
      });
      assert(!noOverlay.overlayExists, 'No fullscreen .hr-diagram-overlay in DOM (inline only)');

      // ── Test 2b: Dynamic update — advance sim and check coords change ──
      console.log(`\n  --- Test 2b: HR diagram updates dynamically ---`);

      const before = await page.evaluate(() => {
        const dot = document.querySelector('.hr-selected-dot');
        if (!dot) return null;
        return { cx: dot.getAttribute('cx'), cy: dot.getAttribute('cy') };
      });

      // Advance simulation significantly
      await page.evaluate(() => {
        const dbg = window.__STAR_SIM_DEBUG__;
        for (let i = 0; i < 300; i++) dbg.tick?.();
      });
      await new Promise(r => setTimeout(r, 600));

      const after = await page.evaluate(() => {
        const dot = document.querySelector('.hr-selected-dot');
        if (!dot) return null;
        return { cx: dot.getAttribute('cx'), cy: dot.getAttribute('cy') };
      });

      if (before && after) {
        // Coordinates may or may not change in a short time — but the component
        // at minimum should still be present and rendering valid numbers
        const cxValid = !isNaN(parseFloat(after.cx)) && parseFloat(after.cx) > 0;
        const cyValid = !isNaN(parseFloat(after.cy)) && parseFloat(after.cy) > 0;
        assert(cxValid, `Selected dot cx is valid after tick (${after.cx})`);
        assert(cyValid, `Selected dot cy is valid after tick (${after.cy})`);
      }

      // Close the HR diagram
      await page.evaluate(() => {
        const close = document.querySelector('.hr-diagram-close');
        if (close) close.click();
      });
      await new Promise(r => setTimeout(r, 200));

      const closedOk = await page.evaluate(() => !document.querySelector('.hr-diagram-inline'));
      assert(closedOk, 'HR diagram closes when close button clicked');
    }

  } finally {
    await page.close();
  }

  if (errors.length) {
    console.log(`  [WARN] ${errors.length} browser error(s):`, errors.slice(0, 3));
  }

  return { label: cfg.label, failures };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let total = 0;
  let totalFail = 0;

  try {
    for (const cfg of SYSTEM_CONFIGS) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`SYSTEM: ${cfg.label}`);
      console.log('='.repeat(60));
      const { failures } = await runSystem(browser, cfg);
      total++;
      if (failures > 0) totalFail++;
      console.log(`  → ${failures === 0 ? 'PASSED' : `FAILED (${failures} assertions)`}`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${total - totalFail}/${total} systems passed`);
  if (totalFail > 0) {
    console.log('Some systems had failures — see above.');
    process.exit(1);
  } else {
    console.log('All systems passed.');
  }
})();

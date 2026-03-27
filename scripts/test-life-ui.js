const puppeteer = require('puppeteer');

const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:8080';

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  try {
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('starsim-auth-dismissed', '1');
        localStorage.setItem('starsim_onboarding_v1_done', '1');
      } catch {}
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!window.__STAR_SIM_DEBUG__, { timeout: 15000 });
    console.log('[OK] Debug API available');

    const seedResult = await page.evaluate(() => {
      return window.__STAR_SIM_DEBUG__.seedLifeScenario({
        starPresetId: 'sun_like',
        starName: 'Sol Alpha',
        planets: [
          { presetId: 'earth_like', name: 'Terra Nova' },
          { presetId: 'rocky_small', name: 'Arid Prime', overrides: { orbitalDistance: 0.7, atmosphere: 4, hasWater: false } },
          { presetId: 'super_earth', name: 'Gaia Magna', overrides: { orbitalDistance: 1.4, atmosphere: 18 } },
        ],
      });
    });
    console.log('[OK] Seeded system:', JSON.stringify(seedResult));

    await page.waitForSelector('.universe-panel', { timeout: 10000 });
    console.log('[OK] Universe panel visible');

    const lifeTabFound = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.up-tab'));
      const lifeTab = tabs.find((t) => t.textContent.includes('Life'));
      if (!lifeTab) return false;
      lifeTab.click();
      return true;
    });
    if (!lifeTabFound) throw new Error('Life tab not found');
    console.log('[OK] Life tab clicked');

    await new Promise((r) => setTimeout(r, 300));

    const uiState = await page.evaluate(() => {
      const presetSelect = document.getElementById('life-preset-select');
      const enableToggle = document.querySelector('.up-life-toggle input[type="checkbox"]');
      const sliders = Array.from(document.querySelectorAll('.up-life-range'));
      const miniStats = Array.from(document.querySelectorAll('.up-life-mini strong'));
      const resetBtn = document.querySelector('.up-life-btn');
      return {
        presetSelectExists: !!presetSelect,
        presetValue: presetSelect?.value,
        presetOptions: presetSelect ? Array.from(presetSelect.options).map((o) => o.value) : [],
        enableToggleExists: !!enableToggle,
        enableChecked: enableToggle?.checked,
        sliderCount: sliders.length,
        sliderKeys: sliders.map((s) => s.getAttribute('data-life-key')),
        sliderValues: sliders.map((s) => s.value),
        miniStatCount: miniStats.length,
        miniStatValues: miniStats.map((s) => s.textContent),
        resetBtnExists: !!resetBtn,
        resetBtnText: resetBtn?.textContent,
      };
    });
    console.log('[OK] Life tab UI state:', JSON.stringify(uiState, null, 2));

    if (!uiState.presetSelectExists) throw new Error('Preset selector missing');
    if (uiState.presetOptions.length !== 3) throw new Error(`Expected 3 presets, got ${uiState.presetOptions.length}`);
    if (uiState.sliderCount !== 5) throw new Error(`Expected 5 sliders, got ${uiState.sliderCount}`);
    if (uiState.miniStatCount !== 4) throw new Error(`Expected 4 mini-stats, got ${uiState.miniStatCount}`);
    if (!uiState.enableToggleExists) throw new Error('Enable toggle missing');
    if (!uiState.resetBtnExists) throw new Error('Reset button missing');
    console.log('[OK] All UI elements verified');

    // --- Test preset change ---
    await page.select('#life-preset-select', 'chaotic');
    await new Promise((r) => setTimeout(r, 200));
    const chaoticState = await page.evaluate(() => {
      const sliders = Array.from(document.querySelectorAll('.up-life-range'));
      return {
        preset: document.getElementById('life-preset-select')?.value,
        sliderValues: Object.fromEntries(sliders.map((s) => [s.getAttribute('data-life-key'), Number(s.value)])),
      };
    });
    if (chaoticState.preset !== 'chaotic') throw new Error('Preset did not switch to chaotic');
    if (chaoticState.sliderValues.lifeRateMultiplier !== 1.5) throw new Error('Chaotic lifeRate should be 1.5');
    console.log('[OK] Chaotic preset applied:', JSON.stringify(chaoticState));

    // --- Simulate years and check life ---
    const sim10M = await page.evaluate(() => {
      window.__STAR_SIM_DEBUG__.simulateYears({ years: 1e7, stepYears: 5e4 });
      return window.__STAR_SIM_DEBUG__.snapshotPlanets();
    });
    console.log('[OK] After 10M years:');
    for (const p of sim10M) {
      console.log(`     ${p.name}: stage=${p.lifeStage}, hab=${p.habitabilityScore.toFixed(3)}, health=${p.biosphereHealth.toFixed(3)}`);
    }

    const sim30M = await page.evaluate(() => {
      window.__STAR_SIM_DEBUG__.simulateYears({ years: 2e7, stepYears: 1e5 });
      return window.__STAR_SIM_DEBUG__.snapshotPlanets();
    });
    console.log('[OK] After 30M years total:');
    for (const p of sim30M) {
      console.log(`     ${p.name}: stage=${p.lifeStage}, hab=${p.habitabilityScore.toFixed(3)}, health=${p.biosphereHealth.toFixed(3)}, bio=${p.biodiversity.toFixed(3)}`);
    }

    const livingPlanets = sim30M.filter((p) => p.hasLife);
    if (livingPlanets.length === 0) throw new Error('Expected at least one planet with life after 30M years with chaotic preset');
    console.log(`[OK] ${livingPlanets.length} planet(s) developed life`);

    // --- Slider adjust test ---
    await page.$eval('input[data-life-key="intelligenceRateMultiplier"]', (input) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter.call(input, '15');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 100));
    const afterSlider = await page.evaluate(() => window.__STAR_SIM_DEBUG__.getEngine().getLifeTuning());
    if (afterSlider.intelligenceRateMultiplier !== 15) throw new Error(`Slider set to 15 but got ${afterSlider.intelligenceRateMultiplier}`);
    console.log('[OK] Slider adjustment applied (intelligence=15)');

    // --- Reset test ---
    await page.evaluate(() => {
      const resetBtn = document.querySelector('.up-life-btn');
      if (resetBtn) resetBtn.click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const afterReset = await page.evaluate(() => window.__STAR_SIM_DEBUG__.getEngine().getLifeTuning());
    if (afterReset.intelligenceRateMultiplier !== 1.2) throw new Error(`After reset expected 1.2 but got ${afterReset.intelligenceRateMultiplier}`);
    console.log('[OK] Reset preset works (intelligence back to 1.2)');

    // --- Toggle test ---
    await page.evaluate(() => {
      const toggle = document.querySelector('.up-life-toggle input[type="checkbox"]');
      if (toggle && toggle.checked) toggle.click();
    });
    await new Promise((r) => setTimeout(r, 100));
    const disabledState = await page.evaluate(() => window.__STAR_SIM_DEBUG__.getEngine().getLifeTuning());
    if (disabledState.enabled !== false) throw new Error('Expected enabled=false after toggle off');
    console.log('[OK] Disable toggle works (enabled=false)');

    await page.evaluate(() => {
      const toggle = document.querySelector('.up-life-toggle input[type="checkbox"]');
      if (toggle && !toggle.checked) toggle.click();
    });
    await new Promise((r) => setTimeout(r, 100));
    const reenabledState = await page.evaluate(() => window.__STAR_SIM_DEBUG__.getEngine().getLifeTuning());
    if (reenabledState.enabled !== true) throw new Error('Expected enabled=true after toggle on');
    console.log('[OK] Re-enable toggle works (enabled=true)');

    // --- Change to realistic preset ---
    await page.select('#life-preset-select', 'realistic');
    await new Promise((r) => setTimeout(r, 200));
    const realisticState = await page.evaluate(() => window.__STAR_SIM_DEBUG__.getEngine().getLifeTuning());
    if (realisticState.lifeRateMultiplier !== 0.35) throw new Error(`Realistic lifeRate should be 0.35, got ${realisticState.lifeRateMultiplier}`);
    console.log('[OK] Realistic preset applied (lifeRate=0.35)');

    console.log('\n=== ALL UI TESTS PASSED ===');
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`TEST FAILED: ${error.message}`);
  process.exitCode = 1;
});

const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:8080';
const SHOTS_DIR = path.join(__dirname, '..', 'screenshots');

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function setRangeValue(page, selector, value) {
  await page.$eval(selector, (input, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    setter.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function run() {
  const fs = require('fs');
  if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(25000);

  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('starsim-auth-dismissed', '1');
      localStorage.setItem('starsim_onboarding_v1_done', '1');
    } catch {}
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__STAR_SIM_DEBUG__, { timeout: 15000 });

  // ── Screenshot 1: Seed a system and show overview ──
  await page.evaluate(() => {
    window.__STAR_SIM_DEBUG__.seedLifeScenario({
      starPresetId: 'sun_like',
      starName: 'Sol Alpha',
      lifePreset: 'chaotic',
      lifeTuning: { lifeRateMultiplier: 8, intelligenceRateMultiplier: 10 },
      planets: [
        { presetId: 'earth_like', name: 'Terra Nova' },
        { presetId: 'rocky_small', name: 'Arid Prime', overrides: { orbitalDistance: 0.7, atmosphere: 4, hasWater: false } },
        { presetId: 'super_earth', name: 'Gaia Magna', overrides: { orbitalDistance: 1.4, atmosphere: 18 } },
      ],
    });
  });
  await wait(500);

  // Click Universe Overview tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.up-tab'));
    const overviewTab = tabs.find((t) => t.textContent.includes('Overview'));
    if (overviewTab) overviewTab.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '01-universe-overview-fresh.png'), fullPage: false });
  console.log('Shot 1: Fresh universe overview');

  // ── Screenshot 2: Life tab with Gameplay preset (default) ──
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.up-tab'));
    const lifeTab = tabs.find((t) => t.textContent.includes('Life'));
    if (lifeTab) lifeTab.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '02-life-tab-controls.png'), fullPage: false });
  console.log('Shot 2: Life tab controls');

  // ── Screenshot 3: Switch to Chaotic preset ──
  await page.select('#life-preset-select', 'chaotic');
  await wait(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, '03-life-tab-chaotic-preset.png'), fullPage: false });
  console.log('Shot 3: Chaotic preset');

  // ── Screenshot 4: Crank up sliders ──
  await setRangeValue(page, 'input[data-life-key="lifeRateMultiplier"]', 12);
  await setRangeValue(page, 'input[data-life-key="adaptationRateMultiplier"]', 6);
  await setRangeValue(page, 'input[data-life-key="extinctionRateMultiplier"]', 0.3);
  await setRangeValue(page, 'input[data-life-key="intelligenceRateMultiplier"]', 18);
  await wait(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, '04-life-sliders-custom.png'), fullPage: false });
  console.log('Shot 4: Custom slider values');

  // ── Screenshot 5: Simulate 15M years – life should emerge ──
  await page.evaluate(() => {
    window.__STAR_SIM_DEBUG__.simulateYears({ years: 1.5e7, stepYears: 5e4 });
  });
  await wait(200);

  // Switch to Overview to show living worlds count
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.up-tab'));
    const overviewTab = tabs.find((t) => t.textContent.includes('Overview'));
    if (overviewTab) overviewTab.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '05-universe-overview-life-emerged.png'), fullPage: false });
  console.log('Shot 5: Universe overview with living worlds');

  // ── Screenshot 6: Simulate more to get complex/intelligent life ──
  await page.evaluate(() => {
    window.__STAR_SIM_DEBUG__.simulateYears({ years: 2.5e7, stepYears: 1e5 });
  });
  await wait(200);
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.up-tab'));
    const overviewTab = tabs.find((t) => t.textContent.includes('Overview'));
    if (overviewTab) overviewTab.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '06-universe-overview-complex-life.png'), fullPage: false });
  console.log('Shot 6: Universe overview with complex/intelligent life');

  // ── Screenshot 7: Click on a planet to show InfoPanel life section ──
  // Click on Terra Nova in the Bodies tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.up-tab'));
    const bodiesTab = tabs.find((t) => t.textContent.includes('Bodies'));
    if (bodiesTab) bodiesTab.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '07-bodies-tab-life-stages.png'), fullPage: false });
  console.log('Shot 7: Bodies tab showing life stages');

  // Click on a planet body card to select it
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.up-body-card'));
    const planetCard = cards.find((c) => c.textContent.includes('Terra Nova'));
    if (planetCard) planetCard.click();
  });
  await wait(500);

  // Now the InfoPanel should be visible on the right
  await page.screenshot({ path: path.join(SHOTS_DIR, '08-infopanel-life-evolution.png'), fullPage: false });
  console.log('Shot 8: InfoPanel with Life & Evolution section');

  // ── Screenshot 9: Scroll the InfoPanel to show Life & Evolution section ──
  await page.evaluate(() => {
    const infoPanel = document.querySelector('.info-panel');
    if (infoPanel) infoPanel.scrollTop = infoPanel.scrollHeight;
  });
  await wait(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '09-infopanel-life-detail.png'), fullPage: false });
  console.log('Shot 9: InfoPanel scrolled to Life & Evolution detail');

  // ── Screenshot 10: Realistic preset ──
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.up-tab'));
    const lifeTab = tabs.find((t) => t.textContent.includes('Life'));
    if (lifeTab) lifeTab.click();
  });
  await wait(200);
  await page.select('#life-preset-select', 'realistic');
  await wait(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, '10-life-tab-realistic-preset.png'), fullPage: false });
  console.log('Shot 10: Realistic preset');

  // ── Screenshot 11: Life disabled ──
  await page.evaluate(() => {
    const toggle = document.querySelector('.up-life-toggle input[type="checkbox"]');
    if (toggle && toggle.checked) toggle.click();
  });
  await wait(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, '11-life-tab-disabled.png'), fullPage: false });
  console.log('Shot 11: Life simulation disabled');

  // Snapshot planet data for the summary
  const finalPlanets = await page.evaluate(() => window.__STAR_SIM_DEBUG__.snapshotPlanets());
  console.log('\nFinal planet states:');
  for (const p of finalPlanets) {
    console.log(`  ${p.name}: stage=${p.lifeStage}, hab=${p.habitabilityScore.toFixed(3)}, health=${p.biosphereHealth.toFixed(3)}, bio=${p.biodiversity.toFixed(3)}, complex=${p.complexityScore.toFixed(3)}, intel=${p.intelligencePotential.toFixed(3)}`);
  }

  console.log(`\nAll screenshots saved to: ${SHOTS_DIR}`);
  await browser.close();
}

run().catch((error) => {
  console.error(`Screenshot capture failed: ${error.message}`);
  process.exitCode = 1;
});

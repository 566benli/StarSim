const puppeteer = require('puppeteer');

const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:8080';

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(25000);

  try {
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('genesiserror-auth-dismissed', '1');
        localStorage.setItem('genesiserror_onboarding_v1_done', '1');
      } catch {}
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    console.log('[OK] Page loaded');

    // Check that the Example Systems section exists
    const exampleSection = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('.section-title'))
        .find((el) => el.textContent.includes('Example Systems'));
      return !!heading;
    });
    if (!exampleSection) throw new Error('Example Systems section not found on creation panel');
    console.log('[OK] Example Systems section visible');

    // Check all 6 example cards exist
    const cardCount = await page.evaluate(() => document.querySelectorAll('.example-card').length);
    if (cardCount !== 6) throw new Error(`Expected 6 example cards, got ${cardCount}`);
    console.log(`[OK] ${cardCount} example cards found`);

    // Read card titles
    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.example-card-title')).map((el) => el.textContent)
    );
    console.log('[OK] Card titles:', titles.join(', '));

    // Check tags
    const tags = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.example-card-tag')).map((el) => el.textContent)
    );
    console.log('[OK] Tags:', tags.join(', '));

    // Check the divider exists
    const divider = await page.evaluate(() => {
      const label = document.querySelector('.section-divider-label');
      return label?.textContent;
    });
    if (!divider) throw new Error('Section divider not found');
    console.log(`[OK] Divider: "${divider}"`);

    // Click the "Life Garden" example card
    const lifeCard = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.example-card'));
      const card = cards.find((c) => c.textContent.includes('Life Garden'));
      if (!card) return false;
      card.click();
      return true;
    });
    if (!lifeCard) throw new Error('Life Garden card not found or not clickable');
    console.log('[OK] Clicked Life Garden example');

    // Wait for simulation to start
    await wait(1500);

    // Verify we're in a running simulation
    const simRunning = await page.evaluate(() => {
      const debug = window.__GENESIS_ERROR_DEBUG__;
      if (!debug) return null;
      const engine = debug.getEngine();
      return {
        state: engine.state,
        bodyCount: engine.getBodies().length,
        bodies: engine.getBodies().map((b) => ({
          name: b.name,
          type: b.type,
          alive: b.alive,
        })),
      };
    });

    if (!simRunning) throw new Error('Debug API not available after launch');
    if (simRunning.state !== 'running') throw new Error(`Expected state=running, got ${simRunning.state}`);
    console.log(`[OK] Simulation running with ${simRunning.bodyCount} bodies:`);
    for (const b of simRunning.bodies) {
      console.log(`     ${b.name} (${b.type}) alive=${b.alive}`);
    }

    if (simRunning.bodyCount !== 4) throw new Error(`Expected 4 bodies (1 star + 3 planets), got ${simRunning.bodyCount}`);
    console.log('[OK] Correct body count for Life Garden');

    // Go back to setup and test another example
    await page.evaluate(() => {
      const debug = window.__GENESIS_ERROR_DEBUG__;
      const engine = debug.getEngine();
      engine.pause();
    });

    // Navigate back to setup by reloading
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await wait(500);

    // Click the "Compact System" card
    const compactCard = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.example-card'));
      const card = cards.find((c) => c.textContent.includes('Compact System'));
      if (!card) return false;
      card.click();
      return true;
    });
    if (!compactCard) throw new Error('Compact System card not found');
    console.log('[OK] Clicked Compact System example');

    await wait(1500);

    const compactState = await page.evaluate(() => {
      const debug = window.__GENESIS_ERROR_DEBUG__;
      if (!debug) return null;
      const engine = debug.getEngine();
      return {
        state: engine.state,
        bodyCount: engine.getBodies().length,
      };
    });

    if (!compactState || compactState.state !== 'running') throw new Error('Compact System did not start');
    if (compactState.bodyCount !== 6) throw new Error(`Expected 6 bodies (1 star + 5 planets), got ${compactState.bodyCount}`);
    console.log(`[OK] Compact System running with ${compactState.bodyCount} bodies`);

    console.log('\n=== ALL EXAMPLE SYSTEM TESTS PASSED ===');
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`TEST FAILED: ${error.message}`);
  process.exitCode = 1;
});

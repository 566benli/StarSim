/**
 * test-event-log.js
 * Verify the right-side Events tab keeps the latest 99 events after toasts vanish.
 */
const puppeteer = require('puppeteer');

const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:9000';
const MAX_EVENT_LOG = 99;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    defaultViewport: { width: 1600, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let failures = 0;
  const assert = (cond, msg) => {
    if (!cond) {
      console.log(`  [FAIL] ${msg}`);
      failures += 1;
    } else {
      console.log(`  [OK]   ${msg}`);
    }
  };

  try {
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('genesiserror-auth-dismissed', '1');
        localStorage.setItem('genesiserror_onboarding_v1_done', '1');
      } catch {}
    });

    await page.setCacheEnabled(false);
    await page.goto(`${BASE_URL}?eventlogtest=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForFunction(() => !!window.__GENESIS_ERROR_DEBUG__, { timeout: 20000 });

    await page.evaluate(() => {
      const dbg = window.__GENESIS_ERROR_DEBUG__;
      dbg.seedLifeScenario({
        starPresetId: 'sun_like',
        starName: 'LogStar',
        planets: [
          { presetId: 'earth_like', name: 'LogWorld', overrides: { orbitalDistance: 1.0 } },
        ],
      });

      const engine = dbg.getEngine();
      const store = dbg.getStoreState();
      for (let i = 0; i < 120; i += 1) {
        engine.emitGameEvent({
          name: `Test Event ${i + 1}`,
          category: i % 2 === 0 ? 'life' : 'system',
          notification: {
            title: `Test Event ${i + 1}`,
            body: `Recorded event number ${i + 1}`,
            severity: 'notable',
          },
        });
      }
      store.dismissEvent && store.activeEvents.slice().forEach((e) => store.dismissEvent(e.id));
      engine.paused = true;
    });

    const counts = await page.evaluate(() => {
      const dbg = window.__GENESIS_ERROR_DEBUG__;
      const engine = dbg.getEngine();
      const store = dbg.getStoreState();
      return {
        engineCount: engine.eventHistory.length,
        storeCount: store.eventHistory.length,
        firstName: engine.eventHistory[0]?.name,
        lastName: engine.eventHistory[engine.eventHistory.length - 1]?.name,
      };
    });

    assert(counts.engineCount === MAX_EVENT_LOG, `engine keeps ${MAX_EVENT_LOG} events (got ${counts.engineCount})`);
    assert(counts.storeCount === MAX_EVENT_LOG, `store keeps ${MAX_EVENT_LOG} events (got ${counts.storeCount})`);
    assert(counts.firstName === 'Test Event 22', `oldest retained event is #22 (got ${counts.firstName})`);
    assert(counts.lastName === 'Test Event 120', `newest retained event is #120 (got ${counts.lastName})`);

    const peek = await page.$('.chronicle-peek');
    assert(!!peek, 'latest-event peek appears on the right after new events');

    const btn = await page.$('.chronicle-toggle-btn');
    assert(!!btn, 'right-side Events button is present');

    const btnBox = await btn.boundingBox();
    assert(btnBox && btnBox.x > 1400, `Events button sits on the right edge (x=${btnBox?.x})`);

    await btn.click();
    await page.waitForSelector('.chronicle-panel', { timeout: 5000 });

    const panel = await page.evaluate(() => {
      const list = document.querySelector('.chronicle-list');
      const count = document.querySelector('.chronicle-count');
      const titles = [...document.querySelectorAll('.chronicle-entry-title')].map((el) => el.textContent);
      const newestTitle = document.querySelector('.chronicle-entry[data-newest="true"] .chronicle-entry-title')?.textContent || titles[0] || '';
      return {
        open: !!document.querySelector('.chronicle-panel'),
        countText: count?.textContent || '',
        entryCount: titles.length,
        firstTitle: newestTitle,
        titles,
      };
    });

    assert(panel.open, 'event panel opens on click');
    assert(panel.countText.includes(`${MAX_EVENT_LOG}/${MAX_EVENT_LOG}`), `panel shows 99/99 (got ${panel.countText})`);
    assert(panel.entryCount === MAX_EVENT_LOG, `panel lists 99 entries (got ${panel.entryCount})`);
    if (panel.firstTitle !== 'Test Event 120') {
      console.log(`  [INFO] first titles: ${JSON.stringify(panel.titles?.slice(0, 8))}`);
    }
    assert(panel.firstTitle === 'Test Event 120', `newest event is at the top (got ${panel.firstTitle})`);

    if (errors.length) {
      console.log('  [WARN] page errors:', errors.slice(0, 5));
    }
  } catch (err) {
    console.log(`  [FAIL] ${err.message}`);
    failures += 1;
  } finally {
    await browser.close();
  }

  if (failures) {
    console.log(`\nEvent log test FAILED (${failures})`);
    process.exit(1);
  }
  console.log('\nEvent log test passed');
})();

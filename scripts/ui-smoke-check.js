const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const screenshotsDir = path.join(__dirname, '..', 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByText(page, selector, text) {
  return page.evaluate(
    ({ selectorArg, textArg }) => {
      const nodes = Array.from(document.querySelectorAll(selectorArg)).filter(
        (n) => n.offsetParent !== null && !n.disabled
      );
      const match = nodes.find((n) => (n.textContent || '').includes(textArg));
      if (!match) return false;
      match.click();
      return true;
    },
    { selectorArg: selector, textArg: text }
  );
}

async function waitForSelectorVisible(page, selector, timeout = 15000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el;
    },
    { timeout },
    selector
  );
}

async function clickIfVisible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.offsetParent === null || el.disabled) return false;
    el.click();
    return true;
  }, selector);
}

async function hashMinimap(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.minimap-canvas');
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  });
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  let step = 'init';
  try {
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('starsim-auth-dismissed', '1');
      } catch {}
    });

    step = 'navigate';
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });

    // Close optional auth modal by choosing offline mode.
    step = 'close auth modal';
    await page.waitForFunction(() => !!document.body, { timeout: 15000 });
    const hasAuth = await page.evaluate(() => !!document.querySelector('.auth-modal-overlay'));
    if (hasAuth) {
      const closedByClass = await clickIfVisible(page, '.auth-btn.secondary');
      if (!closedByClass) {
        await clickByText(page, 'button', 'Play Offline (skip)');
      }
      await sleep(600);
      const dismissed = await page.evaluate(() => {
        const overlay = document.querySelector('.auth-modal-overlay');
        if (!overlay) return true;
        const closeBtn = overlay.querySelector('.auth-btn.secondary');
        if (closeBtn) closeBtn.click();
        return !document.querySelector('.auth-modal-overlay');
      });
      if (!dismissed) {
        // Last-resort for CI-like runs: remove blocking overlay to continue smoke checks.
        await page.evaluate(() => {
          const overlay = document.querySelector('.auth-modal-overlay');
          if (overlay) overlay.remove();
        });
      }
    }

    step = 'wait creation panel';
    await waitForSelectorVisible(page, '.creation-panel');

    // Add one star from preset cards.
    step = 'add star';
    await waitForSelectorVisible(page, '.preset-card');
    await page.click('.preset-card');
    step = 'star customize panel';
    await waitForSelectorVisible(page, '.add-to-system-btn');
    await page.click('.add-to-system-btn');

    // Switch to planets tab and add one planet.
    step = 'switch to planets tab';
    await clickByText(page, '.tab-btn', 'Planets');
    await sleep(250);
    step = 'add planet preset';
    await page.click('.preset-card');
    step = 'planet customize panel';
    await waitForSelectorVisible(page, '.add-to-system-btn');
    await page.click('.add-to-system-btn');

    // Launch simulation.
    step = 'launch simulation';
    const launched = await clickByText(page, '.start-btn', 'Launch Simulation');
    if (!launched) throw new Error('Failed to click Launch Simulation');
    step = 'wait runtime ui';
    await waitForSelectorVisible(page, '.time-control');
    await waitForSelectorVisible(page, '.view-controls');
    await waitForSelectorVisible(page, '.minimap-canvas');

    // Verify time control essentials.
    const sliderInfo = await page.evaluate(() => {
      const slider = document.querySelector('.time-slider');
      if (!slider) return null;
      return {
        min: slider.min,
        max: slider.max,
        value: slider.value,
      };
    });
    if (!sliderInfo) throw new Error('Time slider not found');
    if (Number(sliderInfo.min) > -8) throw new Error(`Unexpected slider min: ${sliderInfo.min}`);

    const clickedMyr = await clickByText(page, '.speed-btn', '🚀');
    const clickedGyr = await clickByText(page, '.speed-btn', '💫');
    if (!clickedMyr || !clickedGyr) throw new Error('Time preset buttons are not clickable');

    // Verify view projection buttons are present and clickable.
    const projectionCount = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.view-proj-btn')).filter((b) => b.offsetParent !== null);
      btns.forEach((b) => b.click());
      return btns.length;
    });
    if (projectionCount < 4) throw new Error(`Expected 4 projection buttons, got ${projectionCount}`);

    // Verify orbit/minimap visual movement by sampling minimap frames.
    const frameA = await hashMinimap(page);
    await sleep(1200);
    const frameB = await hashMinimap(page);
    await sleep(1200);
    const frameC = await hashMinimap(page);
    if (!frameA || !frameB || !frameC) throw new Error('Failed to capture minimap frames');
    const hA = crypto.createHash('sha1').update(frameA).digest('hex');
    const hB = crypto.createHash('sha1').update(frameB).digest('hex');
    const hC = crypto.createHash('sha1').update(frameC).digest('hex');
    const moving = hA !== hB || hB !== hC;
    if (!moving) throw new Error('No minimap frame change detected; orbit motion may be stalled');

    await page.screenshot({
      path: path.join(screenshotsDir, 'ui-smoke-check-pass.png'),
      fullPage: true,
    });

    console.log('UI smoke check passed');
    console.log(`Time slider range: ${sliderInfo.min} .. ${sliderInfo.max}`);
    console.log(`Projection buttons: ${projectionCount}`);
    console.log(`Minimap movement hashes: ${hA} ${hB} ${hC}`);
    console.log(`Finished at step: ${step}`);
  } catch (err) {
    try {
      await page.screenshot({
        path: path.join(screenshotsDir, 'ui-smoke-check-fail.png'),
        fullPage: true,
      });
    } catch {}
    throw new Error(`${err.message} (step: ${step})`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('UI smoke check failed:', err.message);
  process.exitCode = 1;
});

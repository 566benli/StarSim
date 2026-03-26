const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const shotsDir = path.join(__dirname, '..', 'test-screenshots');
if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

const ONBOARDING_DONE_KEY = 'starsim_onboarding_v1_done';
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

async function waitVisible(page, selector, timeout = 20000) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    },
    { timeout },
    selector
  );
}

async function minimapSummary(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.minimap-canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let brightCount = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const lum = r + g + b;
        if (a > 80 && lum > 210) {
          brightCount += 1;
          sumX += x;
          sumY += y;
        }
      }
    }
    return {
      brightCount,
      centroidX: brightCount ? sumX / brightCount : null,
      centroidY: brightCount ? sumY / brightCount : null,
    };
  });
}

async function dragToCanvas(page, sourceSelector, targetX, targetY) {
  const ok = await page.evaluate(
    ({ sourceSel, x, y }) => {
      const source = document.querySelector(sourceSel);
      const target = document.querySelector('.canvas-container');
      if (!source || !target) return false;

      const sourceRect = source.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      const dragStart = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        clientX: sourceRect.left + sourceRect.width / 2,
        clientY: sourceRect.top + sourceRect.height / 2,
        dataTransfer,
      });
      source.dispatchEvent(dragStart);

      const dragOver = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer,
      });
      target.dispatchEvent(dragOver);

      const drop = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer,
      });
      target.dispatchEvent(drop);
      return true;
    },
    { sourceSel: sourceSelector, x: targetX, y: targetY }
  );

  if (!ok) {
    throw new Error(`Could not drag ${sourceSelector} to canvas`);
  }
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1720, height: 980 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(25000);

  try {
    await page.evaluateOnNewDocument((key) => {
      try {
        localStorage.setItem('starsim-auth-dismissed', '1');
        localStorage.setItem(key, '1');
      } catch {}
    }, ONBOARDING_DONE_KEY);

    await page.goto(process.env.STARSIM_URL || 'http://127.0.0.1:8080', { waitUntil: 'networkidle0' });
    await waitVisible(page, '.creation-panel');

    await page.click('.preset-card');
    await waitVisible(page, '.add-to-system-btn');
    await page.click('.add-to-system-btn');
    const launched = await clickByText(page, '.start-btn', 'Launch Simulation');
    if (!launched) throw new Error('Could not launch initial system');

    await waitVisible(page, '.minimap-canvas');
    await waitVisible(page, '.view-nav-bar');
    await page.screenshot({ path: path.join(shotsDir, 'feature-regression-start.png'), fullPage: true });

    const toUniverse = await clickByText(page, '.view-nav-btn', 'Universe');
    if (!toUniverse) throw new Error('Could not switch to universe view');
    await sleep(1200);

    const canvas = await page.$('.canvas-container');
    const canvasBox = await canvas.boundingBox();
    const emptyPoint = {
      x: canvasBox.x + canvasBox.width * 0.8,
      y: canvasBox.y + canvasBox.height * 0.32,
    };
    await page.mouse.click(emptyPoint.x, emptyPoint.y);
    await waitVisible(page, '.universe-coordinate-panel');
    await page.screenshot({ path: path.join(shotsDir, 'feature-regression-coordinate-popup.png'), fullPage: true });

    const goHere = await clickByText(page, '.ucp-btn', 'Go Here');
    if (!goHere) throw new Error('Could not activate Go Here');
    await page.waitForFunction(() => !document.querySelector('.universe-coordinate-panel'), { timeout: 10000 });
    await sleep(1200);

    const systemActive = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.view-nav-btn'))
        .some((btn) => btn.classList.contains('active') && btn.textContent.includes('System'));
    });
    if (!systemActive) throw new Error('Did not return to system view after Go Here');

    const emptyMinimap = await minimapSummary(page);
    if (!emptyMinimap) throw new Error('Minimap not available in new system');

    await waitVisible(page, '.object-palette');
    const starPaletteSelector = '.palette-items .palette-item';
    await dragToCanvas(page, starPaletteSelector, canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.56);
    await sleep(1800);
    const starMinimap = await minimapSummary(page);
    if (!starMinimap || starMinimap.brightCount <= emptyMinimap.brightCount) {
      throw new Error('Star drag-add did not produce a visible centered system signature');
    }

    const toPlanets = await clickByText(page, '.palette-tab', 'Planets');
    if (!toPlanets) throw new Error('Could not switch Object Palette to planets');
    await sleep(250);
    await dragToCanvas(page, starPaletteSelector, canvasBox.x + canvasBox.width * 0.62, canvasBox.y + canvasBox.height * 0.52);
    await sleep(1800);
    const planetMinimap = await minimapSummary(page);
    if (!planetMinimap || planetMinimap.brightCount < starMinimap.brightCount) {
      throw new Error('Planet drag-add did not expand the visible system footprint');
    }

    await page.mouse.move(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.5);
    await page.mouse.wheel({ deltaY: 2200 });
    await sleep(1000);
    await page.mouse.wheel({ deltaY: 2200 });
    await sleep(1000);
    await page.screenshot({ path: path.join(shotsDir, 'feature-regression-zoomed-out.png'), fullPage: true });

    const backUniverse = await clickByText(page, '.view-nav-btn', 'Universe');
    if (!backUniverse) throw new Error('Could not navigate back to universe');
    await sleep(1200);
    const backSystem = await clickByText(page, '.view-nav-btn', 'System');
    if (!backSystem) throw new Error('Could not navigate back to system');
    await sleep(1200);

    console.log(JSON.stringify({
      ok: true,
      emptyMinimap,
      starMinimap,
      planetMinimap,
      screenshots: [
        path.join(shotsDir, 'feature-regression-start.png'),
        path.join(shotsDir, 'feature-regression-coordinate-popup.png'),
        path.join(shotsDir, 'feature-regression-zoomed-out.png'),
      ],
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(`UI regression failed: ${err.message}`);
  process.exitCode = 1;
});

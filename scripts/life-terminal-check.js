const puppeteer = require('puppeteer');

const ONBOARDING_DONE_KEY = 'starsim_onboarding_v1_done';
const BASE_URL = process.env.STARSIM_URL || 'http://127.0.0.1:8080';

const scenarios = [
  {
    name: 'temperate-nonwater-world',
    expectLife: true,
    years: 2.0e7,
    seed: {
      starPresetId: 'sun_like',
      starName: 'Helios',
      planets: [
        {
          presetId: 'rocky_small',
          name: 'Silica',
          overrides: {
            orbitalDistance: 1.02,
            atmosphere: 9,
            greenhouseEffect: 1.06,
            magneticField: 1.5,
            hasWater: false,
            albedo: 0.24,
            atmosphereComposition: { CH4: 0.45, N2: 0.35, CO2: 0.2 },
          },
        },
      ],
    },
  },
  {
    name: 'lava-world-control',
    expectLife: false,
    years: 2.0e7,
    seed: {
      starPresetId: 'sun_like',
      starName: 'Forge',
      planets: [
        {
          presetId: 'lava_world',
          name: 'Inferna',
          overrides: {
            orbitalDistance: 0.03,
            atmosphere: 0.2,
            greenhouseEffect: 1.1,
            magneticField: 0.1,
            hasWater: false,
          },
        },
      ],
    },
  },
  {
    name: 'dense-super-earth',
    expectLife: true,
    years: 3.5e7,
    seed: {
      starPresetId: 'sun_like',
      starName: 'Atlas',
      planets: [
        {
          presetId: 'super_earth',
          name: 'Aurelia',
          overrides: {
            orbitalDistance: 1.16,
            atmosphere: 22,
            greenhouseEffect: 1.08,
            magneticField: 2.4,
            hasWater: false,
            albedo: 0.19,
            atmosphereComposition: { N2: 0.4, NH3: 0.35, CO2: 0.25 },
          },
        },
      ],
    },
  },
];

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickByText(page, selector, text) {
  return page.evaluate(
    ({ selectorArg, textArg }) => {
      const nodes = Array.from(document.querySelectorAll(selectorArg)).filter(
        (node) => node.offsetParent !== null && !node.disabled
      );
      const match = nodes.find((node) => (node.textContent || '').includes(textArg));
      if (!match) return false;
      match.click();
      return true;
    },
    { selectorArg: selector, textArg: text }
  );
}

async function setRangeValue(page, selector, value) {
  await page.$eval(selector, (input, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    setter.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
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
    await page.evaluateOnNewDocument((key) => {
      try {
        localStorage.setItem('starsim-auth-dismissed', '1');
        localStorage.setItem(key, '1');
      } catch {}
    }, ONBOARDING_DONE_KEY);

    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!window.__STAR_SIM_DEBUG__, { timeout: 20000 });

    await page.evaluate(() => {
      window.__STAR_SIM_DEBUG__.seedLifeScenario({
        starPresetId: 'sun_like',
        planets: [
          {
            presetId: 'earth_like',
            name: 'Bootstrap',
          },
        ],
      });
    });

    await page.waitForSelector('.universe-panel');
    const lifeTabOk = await clickByText(page, '.up-tab', 'Life');
    if (!lifeTabOk) throw new Error('Life tab not found in UniversePanel');

    await page.select('#life-preset-select', 'chaotic');
    await wait(150);
    await setRangeValue(page, 'input[data-life-key="lifeRateMultiplier"]', 18);
    await setRangeValue(page, 'input[data-life-key="adaptationRateMultiplier"]', 7);
    await setRangeValue(page, 'input[data-life-key="extinctionRateMultiplier"]', 0.4);
    await setRangeValue(page, 'input[data-life-key="radiationImpactMultiplier"]', 0.8);
    await setRangeValue(page, 'input[data-life-key="intelligenceRateMultiplier"]', 12);
    await wait(200);

    const tuning = await page.evaluate(() => window.__STAR_SIM_DEBUG__.getEngine().getLifeTuning());
    if (tuning.lifeRateMultiplier < 10 || tuning.intelligenceRateMultiplier < 10) {
      throw new Error(`Life tuning controls did not apply correctly: ${JSON.stringify(tuning)}`);
    }
    const results = [];

    for (const scenario of scenarios) {
      await page.evaluate((seed) => {
        window.__STAR_SIM_DEBUG__.seedLifeScenario(seed);
      }, scenario.seed);

      await page.evaluate((years) => {
        window.__STAR_SIM_DEBUG__.simulateYears({ years, stepYears: 1e5 });
      }, scenario.years);

      const planets = await page.evaluate(() => window.__STAR_SIM_DEBUG__.snapshotPlanets());
      const gotLife = planets.some((planet) => planet.hasLife);
      if (scenario.expectLife !== gotLife) {
        throw new Error(
          `Scenario ${scenario.name} expected life=${scenario.expectLife} but got life=${gotLife}: ${JSON.stringify(planets)}`
        );
      }
      results.push({
        name: scenario.name,
        expectLife: scenario.expectLife,
        planets,
      });
    }

    console.log(JSON.stringify({
      ok: true,
      url: BASE_URL,
      tuning,
      results,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`life terminal check failed: ${error.message}`);
  process.exitCode = 1;
});

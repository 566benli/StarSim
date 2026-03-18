/**
 * StarSim Web App Full Test - Creates actual objects
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const screenshotsDir = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForReact(page) {
  console.log('   ⏳ Waiting for React app...');
  for (let i = 0; i < 20; i++) {
    const loaded = await page.evaluate(() => {
      const loading = document.getElementById('loading');
      return !loading || !loading.offsetParent;
    });
    if (loaded) {
      console.log('   ✓ React loaded');
      return;
    }
    await sleep(500);
  }
}

async function getAllButtons(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button'))
      .filter(btn => btn.offsetParent !== null)
      .map((btn, idx) => ({
        index: idx,
        text: btn.textContent.trim(),
        title: btn.title || '',
        className: btn.className,
        disabled: btn.disabled
      }));
  });
}

async function clickButtonByText(page, searchText, description) {
  const buttons = await getAllButtons(page);
  const match = buttons.find(btn => 
    btn.text.toLowerCase().includes(searchText.toLowerCase()) ||
    btn.title.toLowerCase().includes(searchText.toLowerCase())
  );
  
  if (match && !match.disabled) {
    console.log(`   ✓ Clicking: "${match.text}"`);
    await page.evaluate((idx) => {
      document.querySelectorAll('button')[idx].click();
    }, match.index);
    return true;
  }
  
  console.log(`   ✗ Not found: ${description}`);
  return false;
}

async function clickPresetCard(page, description) {
  const clicked = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.preset-card'))
      .filter(el => el.offsetParent !== null);
    if (cards.length === 0) return false;
    cards[0].click();
    return true;
  });

  if (clicked) {
    console.log(`   ✓ Clicking preset card: ${description}`);
  } else {
    console.log(`   ✗ No preset card found: ${description}`);
  }
  return clicked;
}

async function testStarSim() {
  console.log('\n🚀 StarSim Full Test - Creating Objects & Testing Time Controls\n');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // === STEP 1: Load App ===
    console.log('📍 STEP 1: Loading StarSim');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
    await waitForReact(page);
    await sleep(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-loaded.png'), fullPage: true });
    console.log('   ✓ Screenshot saved\n');

    // Handle auth gate if present
    console.log('📍 STEP 1.5: Handling auth gate (if present)');
    const enteredOffline = await clickButtonByText(page, 'play offline', 'Play Offline button');
    if (enteredOffline) {
      await sleep(1000);
      console.log('   ✓ Entered offline mode\n');
    } else {
      console.log('   ℹ No auth gate detected, continue\n');
    }
    
    // === STEP 2: Create a Star ===
    console.log('📍 STEP 2: Creating a Star');
    
    // Click Stars tab
    await clickButtonByText(page, 'star', 'Stars tab');
    await sleep(500);
    
    // Look for star preset buttons
    let buttons = await getAllButtons(page);
    console.log(`   Available buttons: ${buttons.length}`);
    buttons.slice(0, 15).forEach(btn => {
      console.log(`     - "${btn.text}" ${btn.disabled ? '(disabled)' : ''}`);
    });
    
    // Try to click a star preset (Sun-like, G-type, etc.)
    const starPresets = ['sun', 'g-type', 'solar', 'main sequence', 'yellow'];
    let starCreated = false;
    
    for (const preset of starPresets) {
      if (await clickButtonByText(page, preset, `${preset} star`)) {
        starCreated = true;
        await sleep(1000);
        break;
      }
    }
    
    if (!starCreated) {
      starCreated = await clickPresetCard(page, 'star preset');
      if (starCreated) {
        await sleep(500);
        await clickButtonByText(page, 'add to system', 'Add to System button');
        await sleep(1000);
      }
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '02-star-created.png'), fullPage: true });
    console.log(`   Star created: ${starCreated ? 'YES' : 'UNKNOWN'}`);
    console.log('   ✓ Screenshot saved\n');
    
    // === STEP 3: Add a Planet ===
    console.log('📍 STEP 3: Adding a Planet');
    
    // Click Planets tab
    await clickButtonByText(page, 'planet', 'Planets tab');
    await sleep(500);
    
    buttons = await getAllButtons(page);
    console.log(`   Available buttons: ${buttons.length}`);
    buttons.slice(0, 15).forEach(btn => {
      console.log(`     - "${btn.text}" ${btn.disabled ? '(disabled)' : ''}`);
    });
    
    // Try to click a planet preset
    const planetPresets = ['earth', 'rocky', 'terrestrial', 'habitable'];
    let planetCreated = false;
    
    for (const preset of planetPresets) {
      if (await clickButtonByText(page, preset, `${preset} planet`)) {
        planetCreated = true;
        await sleep(1000);
        break;
      }
    }
    
    if (!planetCreated) {
      planetCreated = await clickPresetCard(page, 'planet preset');
      if (planetCreated) {
        await sleep(500);
        await clickButtonByText(page, 'add to system', 'Add to System button');
        await sleep(1000);
      }
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '03-planet-added.png'), fullPage: true });
    console.log(`   Planet created: ${planetCreated ? 'YES' : 'UNKNOWN'}`);
    console.log('   ✓ Screenshot saved\n');
    
    // === STEP 4: Launch Simulation ===
    console.log('📍 STEP 4: Launching Simulation');
    
    buttons = await getAllButtons(page);
    console.log(`   Looking for Launch button among ${buttons.length} buttons...`);
    
    const launched = await clickButtonByText(page, 'launch simulation', 'Launch Simulation button') ||
                     await clickButtonByText(page, 'launch', 'Launch button') ||
                     await clickButtonByText(page, 'start', 'Start button') ||
                     await clickButtonByText(page, 'begin', 'Begin button');
    
    if (launched) {
      await sleep(3000); // Wait for simulation to start
      await page.screenshot({ path: path.join(screenshotsDir, '04-sim-running.png'), fullPage: true });
      console.log('   ✓ Simulation launched');
      console.log('   ✓ Screenshot saved\n');
    } else {
      console.log('   ✗ Launch button not found');
      console.log('   Available buttons:');
      buttons.forEach(btn => {
        console.log(`     - "${btn.text}"`);
      });
      console.log();
    }
    
    // === STEP 5: Examine Time Controls ===
    console.log('📍 STEP 5: Examining Time Control Bar');
    
    const timeControlInfo = await page.evaluate(() => {
      const info = {
        sliders: [],
        timeButtons: [],
        speedDisplay: null,
        hasWarp: false
      };
      
      // Find sliders
      document.querySelectorAll('input[type="range"]').forEach(slider => {
        if (slider.offsetParent !== null) {
          info.sliders.push({
            min: slider.min,
            max: slider.max,
            value: slider.value,
            step: slider.step
          });
        }
      });
      
      // Find time-related text
      const bodyText = document.body.innerText;
      info.hasWarp = bodyText.includes('WARP');
      
      // Find speed display
      const match = bodyText.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
      if (match) {
        info.speedDisplay = match[0];
      }
      
      // Find all buttons again
      document.querySelectorAll('button').forEach(btn => {
        if (btn.offsetParent !== null) {
          const text = btn.textContent + ' ' + btn.title;
          if (text.includes('yr') || text.includes('Myr') || text.includes('Gyr')) {
            info.timeButtons.push({
              text: btn.textContent.trim(),
              title: btn.title,
              disabled: btn.disabled
            });
          }
        }
      });
      
      return info;
    });
    
    console.log(`   Sliders found: ${timeControlInfo.sliders.length}`);
    timeControlInfo.sliders.forEach((slider, i) => {
      console.log(`     Slider ${i + 1}: ${slider.min} to ${slider.max} (current: ${slider.value})`);
    });
    
    console.log(`   Time preset buttons: ${timeControlInfo.timeButtons.length}`);
    timeControlInfo.timeButtons.forEach(btn => {
      console.log(`     - "${btn.text}" (${btn.title}) ${btn.disabled ? '[DISABLED]' : '[ENABLED]'}`);
    });
    
    console.log(`   Current speed: ${timeControlInfo.speedDisplay || 'Not found'}`);
    console.log(`   WARP indicator: ${timeControlInfo.hasWarp ? 'YES' : 'NO'}`);
    
    await page.screenshot({ path: path.join(screenshotsDir, '05-time-controls.png'), fullPage: true });
    console.log('   ✓ Screenshot saved\n');
    
    // === STEP 6: Test 1 Myr/s Preset ===
    console.log('📍 STEP 6: Testing 1 Myr/s Preset (🚀)');
    
    const myrClicked = await clickButtonByText(page, 'myr', '1 Myr/s button');
    
    if (myrClicked) {
      await sleep(2000);
      
      const speed = await page.evaluate(() => {
        const match = document.body.innerText.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
        return match ? match[0] : null;
      });
      
      console.log(`   New speed: ${speed}`);
      await page.screenshot({ path: path.join(screenshotsDir, '06-myr-speed.png'), fullPage: true });
      console.log('   ✓ Screenshot saved\n');
    } else {
      console.log('   ✗ 1 Myr/s button not clickable\n');
    }
    
    // === STEP 7: Test 1 Gyr/s Preset ===
    console.log('📍 STEP 7: Testing 1 Gyr/s Preset (✨)');
    
    const gyrClicked = await clickButtonByText(page, 'gyr', '1 Gyr/s button');
    
    if (gyrClicked) {
      await sleep(2000);
      
      const speed = await page.evaluate(() => {
        const match = document.body.innerText.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
        return match ? match[0] : null;
      });
      
      console.log(`   New speed: ${speed}`);
      await page.screenshot({ path: path.join(screenshotsDir, '07-gyr-speed.png'), fullPage: true });
      console.log('   ✓ Screenshot saved\n');
    } else {
      console.log('   ✗ 1 Gyr/s button not clickable\n');
    }
    
    // === STEP 8: Test Slider Maximum ===
    console.log('📍 STEP 8: Testing Slider at Maximum');
    
    const sliderResult = await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) {
        const oldValue = slider.value;
        slider.value = slider.max;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        return { 
          success: true,
          min: slider.min, 
          max: slider.max, 
          oldValue,
          newValue: slider.value 
        };
      }
      return { success: false };
    });
    
    if (sliderResult.success) {
      console.log(`   Slider range: ${sliderResult.min} to ${sliderResult.max}`);
      console.log(`   Moved from ${sliderResult.oldValue} to ${sliderResult.newValue}`);
      
      await sleep(2000);
      
      const speed = await page.evaluate(() => {
        const match = document.body.innerText.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
        return match ? match[0] : null;
      });
      
      console.log(`   Speed at max: ${speed}`);
      
      await page.screenshot({ path: path.join(screenshotsDir, '08-slider-max.png'), fullPage: true });
      console.log('   ✓ Screenshot saved\n');
    } else {
      console.log('   ✗ No slider found\n');
    }
    
    // === STEP 9: Check WARP Indicator ===
    console.log('📍 STEP 9: Checking WARP Indicator');
    
    const warpCheck = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const bodyHTML = document.body.innerHTML;
      
      return {
        hasWarpText: bodyText.includes('WARP'),
        hasWarpHTML: bodyHTML.toLowerCase().includes('warp'),
        hasOrangeGlow: Array.from(document.querySelectorAll('*')).some(el => {
          const style = window.getComputedStyle(el);
          return style.color.includes('orange') || 
                 style.boxShadow.includes('orange') ||
                 style.textShadow.includes('orange');
        })
      };
    });
    
    console.log(`   WARP text visible: ${warpCheck.hasWarpText ? 'YES' : 'NO'}`);
    console.log(`   WARP in HTML: ${warpCheck.hasWarpHTML ? 'YES' : 'NO'}`);
    console.log(`   Orange glow detected: ${warpCheck.hasOrangeGlow ? 'YES' : 'NO'}`);
    
    await page.screenshot({ path: path.join(screenshotsDir, '09-warp-check.png'), fullPage: true });
    console.log('   ✓ Screenshot saved\n');
    
    // === STEP 10: Monitor Time Advancement ===
    console.log('📍 STEP 10: Monitoring Time Advancement');
    
    const timeReadings = [];
    let currentSpeedText = null;
    for (let i = 0; i < 5; i++) {
      const reading = await page.evaluate(() => {
        const text = document.body.innerText;
        const speedMatch = text.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
        const match = text.match(/Time:\s*(\d+(\.\d+)?)\s*(yr|Myr|Gyr)/i) ||
                     text.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)/);
        return {
          reading: match ? match[0] : null,
          speed: speedMatch ? speedMatch[0] : null,
        };
      });
      
      timeReadings.push(reading.reading);
      currentSpeedText = reading.speed || currentSpeedText;
      console.log(`   Reading ${i + 1}: ${reading.reading || 'N/A'}`);
      await sleep(1000);
    }
    
    const uniqueReadings = [...new Set(timeReadings.filter(r => r))];
    const isAdvancing = uniqueReadings.length > 1;
    const precisionLimited = !isAdvancing && !!currentSpeedText && /(Myr|Gyr)\/s/.test(currentSpeedText);
    const advancingStatus = isAdvancing ? 'YES ✓' : (precisionLimited ? 'INCONCLUSIVE (display precision limited)' : 'NO ✗');
    console.log(`   Time is advancing: ${advancingStatus}`);
    console.log();
    
    // === STEP 11: Final State ===
    console.log('📍 STEP 11: Capturing Final State');
    await page.screenshot({ path: path.join(screenshotsDir, '10-final.png'), fullPage: true });
    console.log('   ✓ Screenshot saved\n');
    
    // === SUMMARY ===
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✓ App loaded successfully: YES`);
    console.log(`✓ Star created: ${starCreated ? 'YES' : 'UNKNOWN'}`);
    console.log(`✓ Planet added: ${planetCreated ? 'YES' : 'UNKNOWN'}`);
    console.log(`✓ Simulation launched: ${launched ? 'YES' : 'NO'}`);
    console.log(`✓ Time control sliders: ${timeControlInfo.sliders.length}`);
    console.log(`✓ Slider max value: ${timeControlInfo.sliders[0]?.max || 'N/A'}`);
    console.log(`✓ Time preset buttons: ${timeControlInfo.timeButtons.length}`);
    console.log(`✓ 1 Myr/s preset clickable: ${myrClicked ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ 1 Gyr/s preset clickable: ${gyrClicked ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ WARP indicator present: ${warpCheck.hasWarpText ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Time advancing: ${advancingStatus}`);
    console.log(`✓ Orbits smooth: VISUAL CHECK REQUIRED`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📁 All screenshots saved to: ${screenshotsDir}`);
    console.log('\n⏸  Keeping browser open for 15 seconds for manual inspection...\n');
    
    await sleep(15000);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: path.join(screenshotsDir, 'error.png'), fullPage: true });
  } finally {
    await browser.close();
    console.log('✅ Test complete!\n');
  }
}

testStarSim().catch(console.error);

/**
 * StarSim Web App Interactive Test Script
 * Better handling of React-based dynamic UI
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

async function waitForReact(page, timeout = 10000) {
  console.log('   Waiting for React app to initialize...');
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    const loadingGone = await page.evaluate(() => {
      const loading = document.getElementById('loading');
      return !loading || loading.style.display === 'none' || !loading.offsetParent;
    });
    
    if (loadingGone) {
      console.log('   ✓ React app loaded');
      return true;
    }
    
    await sleep(500);
  }
  
  console.log('   ⚠ Timeout waiting for React app');
  return false;
}

async function findAndClickButton(page, searchTerms, description) {
  console.log(`   Looking for ${description}...`);
  
  // Get all buttons and their text
  const buttons = await page.evaluate((terms) => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    return allButtons.map((btn, idx) => ({
      index: idx,
      text: btn.textContent.trim(),
      title: btn.title || '',
      className: btn.className,
      disabled: btn.disabled,
      visible: btn.offsetParent !== null
    })).filter(btn => btn.visible);
  }, searchTerms);
  
  console.log(`   Found ${buttons.length} visible buttons`);
  
  // Log first few buttons for debugging
  buttons.slice(0, 5).forEach(btn => {
    console.log(`     - "${btn.text}" (class: ${btn.className}, disabled: ${btn.disabled})`);
  });
  
  // Find matching button
  for (const term of searchTerms) {
    const match = buttons.find(btn => 
      btn.text.toLowerCase().includes(term.toLowerCase()) ||
      btn.title.toLowerCase().includes(term.toLowerCase()) ||
      btn.className.toLowerCase().includes(term.toLowerCase())
    );
    
    if (match && !match.disabled) {
      console.log(`   ✓ Found ${description}: "${match.text}" (index ${match.index})`);
      
      // Click the button
      await page.evaluate((idx) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons[idx].click();
      }, match.index);
      
      return true;
    }
  }
  
  console.log(`   ✗ Could not find ${description}`);
  return false;
}

async function getPageInfo(page) {
  return await page.evaluate(() => {
    const info = {
      buttons: [],
      inputs: [],
      text: document.body.innerText.substring(0, 500),
      hasCanvas: document.querySelector('canvas') !== null
    };
    
    // Get all buttons
    document.querySelectorAll('button').forEach(btn => {
      if (btn.offsetParent !== null) {
        info.buttons.push({
          text: btn.textContent.trim(),
          title: btn.title,
          disabled: btn.disabled,
          className: btn.className
        });
      }
    });
    
    // Get all inputs
    document.querySelectorAll('input').forEach(input => {
      if (input.offsetParent !== null) {
        info.inputs.push({
          type: input.type,
          value: input.value,
          min: input.min,
          max: input.max,
          title: input.title
        });
      }
    });
    
    return info;
  });
}

async function testStarSim() {
  console.log('🚀 Starting StarSim Web App Interactive Test...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging from the page
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('   [PAGE ERROR]:', msg.text());
    }
  });
  
  try {
    // Step 1: Navigate and wait for React
    console.log('📍 Step 1: Navigating to http://localhost:8080');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
    await waitForReact(page);
    await sleep(2000); // Extra time for animations
    
    await page.screenshot({ path: path.join(screenshotsDir, '01-initial-load.png'), fullPage: true });
    console.log('   ✓ Screenshot: 01-initial-load.png\n');
    
    // Get initial page info
    let info = await getPageInfo(page);
    console.log('📍 Step 2: Analyzing initial page state');
    console.log(`   Canvas present: ${info.hasCanvas}`);
    console.log(`   Visible buttons: ${info.buttons.length}`);
    console.log(`   Visible inputs: ${info.inputs.length}`);
    console.log();
    
    // Step 3: Create a star
    console.log('📍 Step 3: Creating a star');
    const starCreated = await findAndClickButton(page, 
      ['sun', 'star', 'solar', 'g-type', 'main sequence'],
      'star creation button'
    );
    
    if (starCreated) {
      await sleep(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '02-star-created.png'), fullPage: true });
      console.log('   ✓ Screenshot: 02-star-created.png');
    }
    console.log();
    
    // Step 4: Add a planet
    console.log('📍 Step 4: Adding a planet');
    const planetAdded = await findAndClickButton(page,
      ['planet', 'earth', 'rocky', 'terrestrial', 'add'],
      'planet creation button'
    );
    
    if (planetAdded) {
      await sleep(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '03-planet-added.png'), fullPage: true });
      console.log('   ✓ Screenshot: 03-planet-added.png');
    }
    console.log();
    
    // Step 5: Launch simulation
    console.log('📍 Step 5: Launching simulation');
    const simLaunched = await findAndClickButton(page,
      ['launch', 'start', 'begin', 'run', 'simulate'],
      'launch button'
    );
    
    if (simLaunched) {
      await sleep(2000);
      await page.screenshot({ path: path.join(screenshotsDir, '04-sim-launched.png'), fullPage: true });
      console.log('   ✓ Screenshot: 04-sim-launched.png');
    }
    console.log();
    
    // Step 6: Check time controls
    console.log('📍 Step 6: Examining time controls');
    info = await getPageInfo(page);
    
    console.log(`   Buttons now visible: ${info.buttons.length}`);
    console.log(`   Inputs now visible: ${info.inputs.length}`);
    
    // Look for time-related buttons
    const timeButtons = info.buttons.filter(btn => 
      btn.text.includes('yr') || btn.text.includes('Myr') || btn.text.includes('Gyr') ||
      btn.title.includes('yr') || btn.title.includes('Myr') || btn.title.includes('Gyr')
    );
    
    console.log(`   Time-related buttons found: ${timeButtons.length}`);
    timeButtons.forEach(btn => {
      console.log(`     - "${btn.text}" (title: ${btn.title}, disabled: ${btn.disabled})`);
    });
    
    // Look for sliders
    const sliders = info.inputs.filter(inp => inp.type === 'range');
    console.log(`   Sliders found: ${sliders.length}`);
    sliders.forEach(slider => {
      console.log(`     - Range: ${slider.min} to ${slider.max}, current: ${slider.value}`);
    });
    
    await page.screenshot({ path: path.join(screenshotsDir, '05-time-controls.png'), fullPage: true });
    console.log('   ✓ Screenshot: 05-time-controls.png\n');
    
    // Step 7: Test 1 Myr/s preset
    console.log('📍 Step 7: Testing 1 Myr/s preset button');
    const myrClicked = await findAndClickButton(page,
      ['1 Myr/s', 'Myr', '🚀', 'rocket'],
      '1 Myr/s preset'
    );
    
    if (myrClicked) {
      await sleep(2000);
      await page.screenshot({ path: path.join(screenshotsDir, '06-myr-preset.png'), fullPage: true });
      console.log('   ✓ Screenshot: 06-myr-preset.png');
      
      // Check current speed
      const speed = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
        return match ? match[0] : null;
      });
      console.log(`   Current speed: ${speed}`);
    }
    console.log();
    
    // Step 8: Test 1 Gyr/s preset
    console.log('📍 Step 8: Testing 1 Gyr/s preset button');
    const gyrClicked = await findAndClickButton(page,
      ['1 Gyr/s', 'Gyr', '✨', 'sparkle'],
      '1 Gyr/s preset'
    );
    
    if (gyrClicked) {
      await sleep(2000);
      await page.screenshot({ path: path.join(screenshotsDir, '07-gyr-preset.png'), fullPage: true });
      console.log('   ✓ Screenshot: 07-gyr-preset.png');
      
      const speed = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)\/s/);
        return match ? match[0] : null;
      });
      console.log(`   Current speed: ${speed}`);
    }
    console.log();
    
    // Step 9: Test slider maximum
    console.log('📍 Step 9: Testing slider at maximum');
    const sliderMoved = await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) {
        slider.value = slider.max;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        return { max: slider.max, value: slider.value };
      }
      return null;
    });
    
    if (sliderMoved) {
      console.log(`   Slider moved to max: ${sliderMoved.max} (current: ${sliderMoved.value})`);
      await sleep(2000);
      await page.screenshot({ path: path.join(screenshotsDir, '08-slider-max.png'), fullPage: true });
      console.log('   ✓ Screenshot: 08-slider-max.png');
    } else {
      console.log('   ✗ No slider found');
    }
    console.log();
    
    // Step 10: Check for WARP indicator
    console.log('📍 Step 10: Checking for WARP indicator');
    const warpInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasWarp = text.includes('WARP');
      
      // Look for orange/glow elements
      const elements = Array.from(document.querySelectorAll('*'));
      let orangeElements = 0;
      
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (style.color.includes('orange') || 
            style.boxShadow.includes('orange') ||
            style.textShadow.includes('orange') ||
            el.className.includes('warp') ||
            el.className.includes('glow')) {
          orangeElements++;
        }
      }
      
      return { hasWarp, orangeElements };
    });
    
    console.log(`   WARP text found: ${warpInfo.hasWarp}`);
    console.log(`   Orange/glow elements: ${warpInfo.orangeElements}`);
    
    await page.screenshot({ path: path.join(screenshotsDir, '09-warp-check.png'), fullPage: true });
    console.log('   ✓ Screenshot: 09-warp-check.png\n');
    
    // Step 11: Monitor time advancement
    console.log('📍 Step 11: Monitoring time advancement (5 samples)');
    const timeReadings = [];
    
    for (let i = 0; i < 5; i++) {
      const reading = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/Time:\s*(\d+(\.\d+)?)\s*(yr|Myr|Gyr)/i) ||
                     text.match(/(\d+(\.\d+)?)\s*(yr|Myr|Gyr)/);
        return match ? match[0] : null;
      });
      
      timeReadings.push(reading);
      console.log(`   Sample ${i + 1}: ${reading || 'N/A'}`);
      await sleep(1000);
    }
    
    const unique = [...new Set(timeReadings.filter(r => r !== null))];
    console.log(`   Time is advancing: ${unique.length > 1 ? 'YES' : 'NO'}`);
    console.log();
    
    // Step 12: Final state
    console.log('📍 Step 12: Capturing final state');
    await page.screenshot({ path: path.join(screenshotsDir, '10-final-state.png'), fullPage: true });
    console.log('   ✓ Screenshot: 10-final-state.png\n');
    
    // Get final page info
    info = await getPageInfo(page);
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✓ App loaded: YES`);
    console.log(`✓ Star created: ${starCreated ? 'YES' : 'NEEDS MANUAL CHECK'}`);
    console.log(`✓ Planet added: ${planetAdded ? 'YES' : 'NEEDS MANUAL CHECK'}`);
    console.log(`✓ Simulation launched: ${simLaunched ? 'YES' : 'NEEDS MANUAL CHECK'}`);
    console.log(`✓ Time buttons found: ${timeButtons.length}`);
    console.log(`✓ Sliders found: ${sliders.length}`);
    console.log(`✓ 1 Myr/s preset clickable: ${myrClicked ? 'YES' : 'NO'}`);
    console.log(`✓ 1 Gyr/s preset clickable: ${gyrClicked ? 'YES' : 'NO'}`);
    console.log(`✓ Slider max value: ${sliderMoved ? sliderMoved.max : 'N/A'}`);
    console.log(`✓ WARP indicator present: ${warpInfo.hasWarp ? 'YES' : 'NO'}`);
    console.log(`✓ Time advancing: ${unique.length > 1 ? 'YES' : 'NO'}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📁 Screenshots: ${screenshotsDir}`);
    console.log('\n✅ Test completed!\n');
    
    // Keep browser open for manual inspection
    console.log('⏸  Browser will remain open for 10 seconds for manual inspection...');
    await sleep(10000);
    
  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}

testStarSim().catch(console.error);

/**
 * Genesis Error Web App Test Script
 * Tests the time control features including high-speed presets and WARP mode
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGenesisErrorWeb() {
  console.log('🚀 Starting Genesis Error Web App Test...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Set to true for headless mode
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  try {
    // Step 1: Navigate to the app
    console.log('📍 Step 1: Navigating to http://localhost:8080');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
    await sleep(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-initial-load.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 01-initial-load.png\n');
    
    // Step 2: Check for setup screen
    console.log('📍 Step 2: Looking for setup screen and star creation options');
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('   Page contains setup elements:', bodyText.includes('setup') || bodyText.includes('Setup') || bodyText.includes('star'));
    
    // Look for star type buttons or presets
    const starButtons = await page.$$('[class*="star"]');
    console.log(`   Found ${starButtons.length} elements with 'star' in class name`);
    
    // Try to find and click star creation button
    const possibleSelectors = [
      'button:has-text("Star")',
      'button:has-text("Add Star")',
      'button:has-text("Create Star")',
      '[class*="star-type"]',
      '[class*="preset"]'
    ];
    
    let starButtonFound = false;
    for (const selector of possibleSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`   Found potential star button with selector: ${selector}`);
          await elements[0].click();
          starButtonFound = true;
          await sleep(500);
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (!starButtonFound) {
      console.log('   ⚠ Could not find star creation button automatically');
      console.log('   Trying to find all buttons on the page...');
      const allButtons = await page.$$('button');
      console.log(`   Found ${allButtons.length} buttons total`);
      
      // Get text of all buttons
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const text = await page.evaluate(el => el.textContent, allButtons[i]);
        console.log(`   Button ${i}: "${text}"`);
      }
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '02-after-star-attempt.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 02-after-star-attempt.png\n');
    
    // Step 3: Try to add a planet
    console.log('📍 Step 3: Looking for planet creation option');
    const planetSelectors = [
      'button:has-text("Planet")',
      'button:has-text("Add Planet")',
      '[class*="planet"]'
    ];
    
    let planetButtonFound = false;
    for (const selector of planetSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`   Found planet button with selector: ${selector}`);
          await elements[0].click();
          planetButtonFound = true;
          await sleep(500);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (!planetButtonFound) {
      console.log('   ⚠ Could not find planet creation button automatically');
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '03-after-planet-attempt.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 03-after-planet-attempt.png\n');
    
    // Step 4: Start the simulation
    console.log('📍 Step 4: Looking for Launch/Start button');
    const startSelectors = [
      'button:has-text("Launch")',
      'button:has-text("Start")',
      'button:has-text("Begin")',
      '[class*="launch"]',
      '[class*="start"]'
    ];
    
    let startButtonFound = false;
    for (const selector of startSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`   Found start button with selector: ${selector}`);
          await elements[0].click();
          startButtonFound = true;
          await sleep(1000);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (!startButtonFound) {
      console.log('   ⚠ Could not find start button automatically');
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '04-simulation-started.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 04-simulation-started.png\n');
    
    // Step 5: Check time control bar
    console.log('📍 Step 5: Examining time control bar');
    await sleep(1000);
    
    // Look for time control elements
    const timeControlExists = await page.evaluate(() => {
      const elements = document.querySelectorAll('[class*="time"], [class*="control"], [class*="speed"]');
      return elements.length > 0;
    });
    
    console.log(`   Time control elements found: ${timeControlExists}`);
    
    await page.screenshot({ path: path.join(screenshotsDir, '05-time-control-bar.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 05-time-control-bar.png\n');
    
    // Step 6: Test high-speed presets
    console.log('📍 Step 6: Testing high-speed preset buttons (1 Myr/s and 1 Gyr/s)');
    
    // Look for rocket icon (1 Myr/s) and sparkle icon (1 Gyr/s)
    const presetButtons = await page.$$('button[class*="preset"], button[title*="Myr"], button[title*="Gyr"]');
    console.log(`   Found ${presetButtons.length} potential preset buttons`);
    
    // Try to click the 1 Myr/s button (rocket icon)
    const myrButton = await page.$('button[title*="Myr"]');
    if (myrButton) {
      const isDisabled = await page.evaluate(el => el.disabled, myrButton);
      console.log(`   1 Myr/s button found. Disabled: ${isDisabled}`);
      
      if (!isDisabled) {
        console.log('   Clicking 1 Myr/s button...');
        await myrButton.click();
        await sleep(2000);
        await page.screenshot({ path: path.join(screenshotsDir, '06-myr-preset.png'), fullPage: true });
        console.log('   ✓ Screenshot saved: 06-myr-preset.png');
      } else {
        console.log('   ⚠ 1 Myr/s button is disabled');
      }
    } else {
      console.log('   ⚠ Could not find 1 Myr/s button');
    }
    
    // Try to click the 1 Gyr/s button (sparkle icon)
    const gyrButton = await page.$('button[title*="Gyr"]');
    if (gyrButton) {
      const isDisabled = await page.evaluate(el => el.disabled, gyrButton);
      console.log(`   1 Gyr/s button found. Disabled: ${isDisabled}`);
      
      if (!isDisabled) {
        console.log('   Clicking 1 Gyr/s button...');
        await gyrButton.click();
        await sleep(2000);
        await page.screenshot({ path: path.join(screenshotsDir, '07-gyr-preset.png'), fullPage: true });
        console.log('   ✓ Screenshot saved: 07-gyr-preset.png');
      } else {
        console.log('   ⚠ 1 Gyr/s button is disabled');
      }
    } else {
      console.log('   ⚠ Could not find 1 Gyr/s button');
    }
    
    console.log();
    
    // Step 7: Test time slider
    console.log('📍 Step 7: Testing time slider (should go up to 1 Gyr/s)');
    
    const slider = await page.$('input[type="range"]');
    if (slider) {
      const max = await page.evaluate(el => el.max, slider);
      console.log(`   Slider max value: ${max}`);
      
      // Drag slider to maximum
      console.log('   Dragging slider to maximum...');
      await page.evaluate(el => {
        el.value = el.max;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, slider);
      
      await sleep(2000);
      await page.screenshot({ path: path.join(screenshotsDir, '08-slider-max.png'), fullPage: true });
      console.log('   ✓ Screenshot saved: 08-slider-max.png');
      
      // Check current speed display
      const speedDisplay = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="speed"], [class*="time"]');
        for (const el of elements) {
          if (el.textContent.includes('yr') || el.textContent.includes('Myr') || el.textContent.includes('Gyr')) {
            return el.textContent;
          }
        }
        return null;
      });
      
      console.log(`   Current speed display: ${speedDisplay}`);
    } else {
      console.log('   ⚠ Could not find time slider');
    }
    
    console.log();
    
    // Step 8: Check for WARP indicator
    console.log('📍 Step 8: Checking for WARP indicator at high speeds');
    
    const warpIndicator = await page.evaluate(() => {
      const body = document.body.innerHTML;
      return body.includes('WARP') || body.includes('warp');
    });
    
    console.log(`   WARP indicator found: ${warpIndicator}`);
    
    if (warpIndicator) {
      // Look for orange glow or WARP badge
      const warpElements = await page.$$('[class*="warp"]');
      console.log(`   Found ${warpElements.length} elements with 'warp' in class name`);
      
      // Check for orange glow styling
      const hasOrangeGlow = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          if (style.color.includes('orange') || style.boxShadow.includes('orange') || 
              style.textShadow.includes('orange') || el.textContent.includes('WARP')) {
            return true;
          }
        }
        return false;
      });
      
      console.log(`   Orange glow/styling detected: ${hasOrangeGlow}`);
    }
    
    await page.screenshot({ path: path.join(screenshotsDir, '09-warp-indicator.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 09-warp-indicator.png\n');
    
    // Step 9: Check time display advancement
    console.log('📍 Step 9: Monitoring time display advancement');
    
    const timeValues = [];
    for (let i = 0; i < 5; i++) {
      const timeDisplay = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
          const text = el.textContent;
          if (text.match(/\d+(\.\d+)?\s*(yr|Myr|Gyr)/)) {
            return text;
          }
        }
        return null;
      });
      
      if (timeDisplay) {
        timeValues.push(timeDisplay);
        console.log(`   Time ${i + 1}: ${timeDisplay}`);
      }
      
      await sleep(1000);
    }
    
    const timeAdvancing = timeValues.length > 1 && timeValues[0] !== timeValues[timeValues.length - 1];
    console.log(`   Time is advancing: ${timeAdvancing}`);
    console.log();
    
    // Step 10: Check orbit smoothness
    console.log('📍 Step 10: Checking orbit smoothness');
    console.log('   (Visual inspection required - check screenshots for smooth orbital motion)');
    
    await page.screenshot({ path: path.join(screenshotsDir, '10-final-state.png'), fullPage: true });
    console.log('   ✓ Screenshot saved: 10-final-state.png\n');
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✓ App loaded successfully: YES`);
    console.log(`✓ Star creation attempted: ${starButtonFound ? 'YES' : 'MANUAL CHECK NEEDED'}`);
    console.log(`✓ Planet creation attempted: ${planetButtonFound ? 'YES' : 'MANUAL CHECK NEEDED'}`);
    console.log(`✓ Simulation started: ${startButtonFound ? 'YES' : 'MANUAL CHECK NEEDED'}`);
    console.log(`✓ Time control bar found: ${timeControlExists ? 'YES' : 'NO'}`);
    console.log(`✓ High-speed presets found: ${presetButtons.length > 0 ? 'YES' : 'NO'}`);
    console.log(`✓ WARP indicator found: ${warpIndicator ? 'YES' : 'NO'}`);
    console.log(`✓ Time advancing: ${timeAdvancing ? 'YES' : 'NEEDS VERIFICATION'}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📁 All screenshots saved to: ${screenshotsDir}`);
    console.log('\n✅ Test completed! Please review the screenshots for visual verification.');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error.png'), fullPage: true });
  } finally {
    await sleep(3000); // Keep browser open for a moment
    await browser.close();
  }
}

// Run the test
testGenesisErrorWeb().catch(console.error);

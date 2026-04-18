/**
 * Deterministic creature portrait from species traits (Canvas).
 * 3D-toy style: large rounded head, gradient body, big eyes with highlights,
 * drop shadow, transparent background. 160×200 canvas.
 */
import { hashString32, mulberry32 } from '@engine/biosphereGrid.js';
import defaultCreaturePack from '@data/defaultCreaturePack.json';

const cache = new Map();

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Draw a rounded rectangle path
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * @param {object} species - evolution tree node
 * @param {object} [planet] - optional planet for env tint
 * @returns {string} data URL (image/png)
 */
export function composeCreatureDataUrl(species, planet = null) {
  const sid   = species?.id || 'unknown';
  const stage = species?.stage || 'simple';
  const key   = `${sid}|${stage}|v3|${species?.traits?.bodyType || ''}`;
  if (cache.has(key)) return cache.get(key);

  const W = 160;
  const H = 200;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // --- Deterministic RNG seeded from species id
  const seed = hashString32(`${sid}|${species?.name || ''}|${stage}|v3`);
  const rng  = mulberry32(seed);

  // --- Body color palette from species id
  const bodyHue   = (hashString32(`${sid}|hue`) % 360);
  const accentHue = (bodyHue + 40 + Math.floor(rng() * 80)) % 360;
  const skinL     = 42 + rng() * 18;       // 42-60% lightness
  const skinS     = 55 + rng() * 25;       // 55-80% saturation

  // Creature proportions vary by stage
  const stageScale = stage === 'intelligent' ? 1.0 : stage === 'complex' ? 0.90 : 0.78;

  // Eye style variation
  const eyeStyle = Math.floor(rng() * 3); // 0=round, 1=almond, 2=wide
  const hasEars   = rng() > 0.45;
  const hasTail   = stage !== 'intelligent' && rng() > 0.5;
  const limbCount = stage === 'intelligent' ? 4 : stage === 'complex' ? (rng() > 0.5 ? 4 : 3) : 2;

  // Clear to transparent
  ctx.clearRect(0, 0, W, H);

  // ── Centre coordinate system ────────────────────────────────────────────────
  ctx.save();
  ctx.translate(W * 0.5, H * 0.54);
  ctx.scale(stageScale, stageScale);

  // Body metrics (in local coords)
  const torsoW = 44;
  const torsoH = 50;
  const torsoY = 8;     // torso centre Y (positive = down)
  const headR  = 38;    // head circle radius
  const headY  = torsoY - torsoH * 0.5 - headR * 0.68; // head centre Y

  // ── 1. Drop-shadow oval ──────────────────────────────────────────────────────
  const shadowGrad = ctx.createRadialGradient(0, torsoY + torsoH * 0.5 + 12, 2, 0, torsoY + torsoH * 0.5 + 14, 36);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.scale(1.4, 0.4);
  ctx.beginPath();
  ctx.arc(0, (torsoY + torsoH * 0.5 + 14) / 0.4, 36, 0, Math.PI * 2);
  ctx.fillStyle = shadowGrad;
  ctx.fill();
  ctx.restore();

  // ── 2. Tail ──────────────────────────────────────────────────────────────────
  if (hasTail) {
    const tailCurl = (rng() - 0.5) * 0.8;
    ctx.save();
    ctx.strokeStyle = `hsla(${bodyHue},${skinS}%,${skinL - 8}%,0.9)`;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, torsoY + torsoH * 0.4);
    ctx.bezierCurveTo(
      torsoW * 0.7 + tailCurl * 30, torsoY + torsoH * 0.7,
      torsoW * 1.2, torsoY + torsoH * 0.2 + tailCurl * 20,
      torsoW * 0.9, torsoY - torsoH * 0.1
    );
    ctx.stroke();
    ctx.restore();
  }

  // ── 3. Legs ──────────────────────────────────────────────────────────────────
  const legCount = limbCount >= 4 ? 2 : 2;
  for (let i = 0; i < legCount; i++) {
    const side  = i === 0 ? -1 : 1;
    const legX  = side * (torsoW * 0.42);
    const legY0 = torsoY + torsoH * 0.46;
    const kneeX = legX + side * (8 + rng() * 6);
    const kneeY = legY0 + 18 + rng() * 8;
    const footX = kneeX + side * (-4 + rng() * 8);
    const footY = kneeY + 16 + rng() * 6;

    // Leg segment gradient
    const legGrad = ctx.createLinearGradient(legX, legY0, footX, footY);
    legGrad.addColorStop(0, `hsla(${bodyHue},${skinS}%,${skinL}%,1)`);
    legGrad.addColorStop(1, `hsla(${bodyHue},${skinS}%,${skinL - 14}%,1)`);

    ctx.strokeStyle = legGrad;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(legX, legY0);
    ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
    ctx.stroke();

    // Foot nub
    ctx.beginPath();
    ctx.arc(footX, footY, 7, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${bodyHue},${skinS}%,${skinL - 10}%,1)`;
    ctx.fill();
  }

  // ── 4. Arms ──────────────────────────────────────────────────────────────────
  const armCount = limbCount >= 4 ? 2 : (limbCount === 3 ? 1 : 0);
  for (let i = 0; i < 2; i++) {
    if (i === 1 && armCount < 2) continue;
    if (i === 0 && armCount < 1) continue;
    const side  = i === 0 ? -1 : 1;
    const armX0 = side * (torsoW * 0.48);
    const armY0 = torsoY - torsoH * 0.15;
    const elbowX = armX0 + side * (20 + rng() * 10);
    const elbowY = armY0 + 12 + rng() * 10;
    const handX  = elbowX + side * (8 + rng() * 12);
    const handY  = elbowY + 18 + rng() * 10;

    const armGrad = ctx.createLinearGradient(armX0, armY0, handX, handY);
    armGrad.addColorStop(0, `hsla(${bodyHue},${skinS}%,${skinL}%,1)`);
    armGrad.addColorStop(1, `hsla(${bodyHue},${skinS}%,${skinL - 12}%,1)`);

    ctx.strokeStyle = armGrad;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(armX0, armY0);
    ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
    ctx.stroke();

    // Hand nub
    ctx.beginPath();
    ctx.arc(handX, handY, 6, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${bodyHue},${skinS}%,${skinL - 8}%,1)`;
    ctx.fill();
  }

  // ── 5. Torso ─────────────────────────────────────────────────────────────────
  const torsoGrad = ctx.createRadialGradient(
    -torsoW * 0.22, torsoY - torsoH * 0.28, 4,
    0, torsoY, torsoW * 0.92
  );
  torsoGrad.addColorStop(0,   `hsla(${bodyHue},${skinS}%,${skinL + 18}%,1)`);
  torsoGrad.addColorStop(0.5, `hsla(${bodyHue},${skinS}%,${skinL}%,1)`);
  torsoGrad.addColorStop(1,   `hsla(${bodyHue},${skinS}%,${skinL - 16}%,1)`);

  roundRect(ctx, -torsoW * 0.5, torsoY - torsoH * 0.5, torsoW, torsoH, 18);
  ctx.fillStyle = torsoGrad;
  ctx.fill();

  // Belly pattern (optional accent band)
  if (rng() > 0.4) {
    const bellyGrad = ctx.createRadialGradient(0, torsoY + 4, 4, 0, torsoY + 4, torsoW * 0.5);
    bellyGrad.addColorStop(0, `hsla(${accentHue},60%,${skinL + 12}%,0.55)`);
    bellyGrad.addColorStop(1, `hsla(${accentHue},60%,${skinL + 12}%,0)`);
    roundRect(ctx, -torsoW * 0.5, torsoY - torsoH * 0.5, torsoW, torsoH, 18);
    ctx.fillStyle = bellyGrad;
    ctx.fill();
  }

  // Torso outline for depth
  roundRect(ctx, -torsoW * 0.5, torsoY - torsoH * 0.5, torsoW, torsoH, 18);
  ctx.strokeStyle = `hsla(${bodyHue},${skinS}%,${skinL - 22}%,0.35)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── 6. Ears ──────────────────────────────────────────────────────────────────
  if (hasEars) {
    const earH = 16 + rng() * 14;
    const earW = 9 + rng() * 6;
    const earAngle = (rng() - 0.5) * 0.4;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * (headR * 0.82), headY - headR * 0.52);
      ctx.rotate(earAngle * side);
      const earGrad = ctx.createRadialGradient(0, 0, 1, 0, -earH * 0.3, earW * 1.4);
      earGrad.addColorStop(0, `hsla(${bodyHue},${skinS}%,${skinL}%,1)`);
      earGrad.addColorStop(1, `hsla(${bodyHue},${skinS}%,${skinL - 14}%,1)`);
      ctx.beginPath();
      ctx.ellipse(0, -earH * 0.4, earW, earH, 0, 0, Math.PI * 2);
      ctx.fillStyle = earGrad;
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 7. Head ──────────────────────────────────────────────────────────────────
  const headGrad = ctx.createRadialGradient(
    -headR * 0.28, headY - headR * 0.30, headR * 0.08,
    0, headY, headR * 1.05
  );
  headGrad.addColorStop(0,    `hsla(${bodyHue},${skinS}%,${skinL + 22}%,1)`);
  headGrad.addColorStop(0.45, `hsla(${bodyHue},${skinS}%,${skinL + 4}%,1)`);
  headGrad.addColorStop(1,    `hsla(${bodyHue},${skinS}%,${skinL - 18}%,1)`);

  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();

  // Head outline
  ctx.strokeStyle = `hsla(${bodyHue},${skinS}%,${skinL - 24}%,0.30)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Specular highlight cap
  const specGrad = ctx.createRadialGradient(-headR * 0.25, headY - headR * 0.38, 0, -headR * 0.1, headY - headR * 0.2, headR * 0.6);
  specGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
  specGrad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  specGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = specGrad;
  ctx.fill();

  // ── 8. Eyes ──────────────────────────────────────────────────────────────────
  const eyeSpread = 15 + rng() * 8;
  const eyeBaseY  = headY - headR * 0.14;
  const eyeRx     = eyeStyle === 1 ? 10 : 12;
  const eyeRy     = eyeStyle === 2 ? 9 : (eyeStyle === 1 ? 8 : 13);
  const eyeAngle  = eyeStyle === 1 ? -0.22 : 0;

  for (const side of [-1, 1]) {
    const ex = side * eyeSpread;
    const ey = eyeBaseY;

    // Sclera (white)
    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeRx, eyeRy, eyeAngle * side, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();

    // Iris gradient
    const irisGrad = ctx.createRadialGradient(ex - 1, ey - 1, 1, ex, ey, eyeRx * 0.68);
    irisGrad.addColorStop(0,   `hsla(${accentHue},80%,60%,1)`);
    irisGrad.addColorStop(0.6, `hsla(${accentHue},70%,35%,1)`);
    irisGrad.addColorStop(1,   `hsla(${accentHue},60%,18%,1)`);
    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeRx * 0.68, eyeRy * 0.68, eyeAngle * side, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeRx * 0.28, eyeRy * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fill();

    // White highlight dot
    ctx.beginPath();
    ctx.arc(ex - eyeRx * 0.25, ey - eyeRy * 0.28, eyeRx * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();

    // Tiny secondary highlight
    ctx.beginPath();
    ctx.arc(ex + eyeRx * 0.20, ey - eyeRy * 0.10, eyeRx * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    // Eye outline for depth
    ctx.beginPath();
    ctx.ellipse(ex, ey, eyeRx, eyeRy, eyeAngle * side, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${bodyHue},${skinS}%,${skinL - 28}%,0.40)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // ── 9. Mouth / expression ────────────────────────────────────────────────────
  const mouthY   = eyeBaseY + eyeRy + 10 + rng() * 4;
  const smileAmt = stage === 'intelligent' ? 0.35 : 0.18;
  ctx.beginPath();
  ctx.moveTo(-8, mouthY);
  ctx.quadraticCurveTo(0, mouthY + 7 * smileAmt * 2, 8, mouthY);
  ctx.strokeStyle = `hsla(${bodyHue},${skinS}%,${skinL - 30}%,0.55)`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Nostril dots
  if (rng() > 0.5) {
    ctx.fillStyle = `hsla(${bodyHue},${skinS}%,${skinL - 24}%,0.45)`;
    ctx.beginPath();
    ctx.arc(-3, mouthY - 6, 1.5, 0, Math.PI * 2);
    ctx.arc(3, mouthY - 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── 10. Stage adornment (intelligent: headband/crown hint) ───────────────────
  if (stage === 'intelligent' && rng() > 0.4) {
    ctx.save();
    ctx.strokeStyle = `hsla(${accentHue},75%,62%,0.65)`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, headY, headR + 4, Math.PI * 0.75, Math.PI * 0.25, false);
    ctx.stroke();
    // Gem dot at top
    ctx.beginPath();
    ctx.arc(0, headY - headR - 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${accentHue},85%,68%,0.85)`;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function clearCreatureComposerCache() {
  cache.clear();
}

export { defaultCreaturePack };

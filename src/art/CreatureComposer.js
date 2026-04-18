/**
 * Deterministic creature portrait from species traits (Canvas).
 * Optional image packs: pass manifest with variants[]; when empty, procedural fallback.
 */
import { hashString32, mulberry32 } from '@engine/biosphereGrid.js';
import defaultCreaturePack from '@data/defaultCreaturePack.json';

const cache = new Map();

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * @param {object} species - evolution tree node
 * @param {object} [planet] - optional planet for env tint
 * @returns {string} data URL (image/png)
 */
export function composeCreatureDataUrl(species, planet = null) {
  const sid = species?.id || 'unknown';
  const stage = species?.stage || 'simple';
  const key = `${sid}|${stage}|${defaultCreaturePack?.id || 'default'}|${species?.traits?.bodyType || ''}`;
  if (cache.has(key)) return cache.get(key);

  const w = 128;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const seed = hashString32(`${sid}|${species?.name || ''}|${stage}`);
  const rng = mulberry32(seed);

  const tempHue = planet?.temperature
    ? clamp01((planet.temperature - 200) / 400) * 80 + 160
    : 200 + rng() * 60;

  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, w, h);

  const bodyHue = (hashString32(`${sid}|body`) % 360);
  const accentHue = (bodyHue + 40 + Math.floor(rng() * 40)) % 360;

  ctx.save();
  ctx.translate(w / 2, h * 0.55);

  const scale = stage === 'intelligent' ? 1.05 : stage === 'complex' ? 0.95 : 0.75;
  ctx.scale(scale, scale);

  ctx.fillStyle = `hsla(${bodyHue}, 45%, 38%, 0.95)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 42, 58, 0, 0, Math.PI * 2);
  ctx.fill();

  const limbN = stage === 'intelligent' ? 4 : stage === 'complex' ? 3 : 2;
  for (let i = 0; i < limbN; i++) {
    const ang = (i / limbN) * Math.PI * 2 + rng() * 0.2;
    const len = 28 + rng() * 18;
    ctx.strokeStyle = `hsla(${bodyHue}, 50%, 32%, 0.9)`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 12, Math.sin(ang) * 8);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len + 20);
    ctx.stroke();
  }

  ctx.fillStyle = `hsla(${accentHue}, 55%, 45%, 0.85)`;
  const eyeY = -12;
  const eyeSpread = stage === 'intelligent' ? 22 : 18;
  ctx.beginPath();
  ctx.ellipse(-eyeSpread * 0.5, eyeY, 8, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeSpread * 0.5, eyeY, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(-eyeSpread * 0.5, eyeY + 2, 3, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(eyeSpread * 0.5, eyeY + 2, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (stage === 'intelligent') {
    ctx.strokeStyle = `hsla(${tempHue}, 30%, 60%, 0.5)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -35, 18 + rng() * 6, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 0, w, h * 0.08);

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function clearCreatureComposerCache() {
  cache.clear();
}

export { defaultCreaturePack };

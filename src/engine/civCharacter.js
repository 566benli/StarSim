/**
 * WorldBox-style civilization identity derived from founder species and planet context.
 */
import { hashString32, mulberry32 } from './biosphereGrid.js';

const SOCIETY_SHAPES = [
  'hive', 'clan', 'republic', 'theocracy', 'corporate',
  'meritocracy', 'federation', 'council', 'monarchy',
];

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function pickSociety(rng, weights) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return SOCIETY_SHAPES[0];
  let t = rng() * total;
  for (let i = 0; i < SOCIETY_SHAPES.length; i++) {
    t -= weights[i] ?? 0.1;
    if (t <= 0) return SOCIETY_SHAPES[i];
  }
  return SOCIETY_SHAPES[SOCIETY_SHAPES.length - 1];
}

/**
 * @param {object} opts
 * @param {object|null} opts.domSpecies - evolution tree species node or null (colony)
 * @param {object} opts.body - planet
 * @param {number} opts.simulationTime
 * @param {{ isColony?: boolean, empireHue?: number }} [opts.meta]
 */
export function buildCivCharacter({ domSpecies, body, simulationTime, meta = {} }) {
  const seed = hashString32(
    `${body.biosphereSeed ?? body.id}|${domSpecies?.id ?? 'nosp'}|${Math.floor(simulationTime)}|civ`
  );
  const rng = mulberry32(seed);

  const profile = body.speciesProfile || {};
  const adapt = profile.adaptability ?? 0.5;
  const resil = profile.resilience ?? 0.5;
  const traits = domSpecies?.traits || {};

  let aggression = 0.25 + rng() * 0.45;
  let diplomacy = 0.25 + rng() * 0.45;
  let curiosity = 0.25 + rng() * 0.45;
  let tradition = 0.25 + rng() * 0.45;
  let expansionism = 0.2 + rng() * 0.5;

  curiosity += (adapt - 0.5) * 0.35;
  tradition -= (adapt - 0.5) * 0.25;
  const intel = String(traits.intelligence || '');
  const loco = String(traits.locomotion || '');
  const metaB = String(traits.metabolism || '');
  diplomacy += (intel.includes('sapient') || intel.includes('technological') ? 0.12 : 0);
  aggression += (loco.includes('burrowing') ? 0.06 : 0);
  expansionism += (metaB.includes('heterotrophy') ? 0.08 : 0);
  diplomacy += resil * 0.1;
  aggression += (1 - resil) * 0.06;

  if (meta.isColony) {
    expansionism = clamp01(expansionism * 1.15);
    tradition = clamp01(tradition * 0.85);
    curiosity = clamp01(curiosity * 1.1);
  }

  aggression = clamp01(aggression);
  diplomacy = clamp01(diplomacy);
  curiosity = clamp01(curiosity);
  tradition = clamp01(tradition);
  expansionism = clamp01(expansionism);

  const weights = SOCIETY_SHAPES.map((_, i) => 0.08 + rng() * 0.15);
  if (adapt > 0.62) weights[SOCIETY_SHAPES.indexOf('meritocracy')] += 0.25;
  if (tradition > 0.55) weights[SOCIETY_SHAPES.indexOf('theocracy')] += 0.2;
  if (curiosity > 0.55) weights[SOCIETY_SHAPES.indexOf('republic')] += 0.2;
  if (aggression > 0.55) weights[SOCIETY_SHAPES.indexOf('monarchy')] += 0.18;
  if (meta.isColony) weights[SOCIETY_SHAPES.indexOf('corporate')] += 0.22;

  const societyShape = pickSociety(rng, weights);
  const emblemSeed = hashString32(`${seed}|emblem`);
  const architectureId = hashString32(`${seed}|arch`) % 12;
  const colorHue = meta.isColony && meta.empireHue != null
    ? Math.round(meta.empireHue)
    : Math.floor((hashString32(`${seed}|hue`) % 360));

  return {
    temperament: {
      aggression,
      diplomacy,
      curiosity,
      tradition,
      expansionism,
    },
    societyShape,
    aesthetics: {
      colorHue,
      emblemSeed,
      architectureId,
    },
  };
}

export function cloneCivCharacter(ch) {
  if (!ch) return null;
  return {
    temperament: { ...ch.temperament },
    societyShape: ch.societyShape,
    aesthetics: { ...ch.aesthetics },
  };
}

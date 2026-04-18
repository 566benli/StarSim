/**
 * Low-resolution planetary biosphere grid for life occupation and body-mode picking.
 */

export const BIOSPHERE_LAT = 16;
export const BIOSPHERE_LON = 32;

export function hashString32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function mul() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEmptyBiosphereGrid() {
  const cells = [];
  const n = BIOSPHERE_LAT * BIOSPHERE_LON;
  for (let i = 0; i < n; i++) {
    cells.push({
      habitat: 'ocean',
      dominantSpeciesId: null,
      biomass01: 0,
      civilizationInfluence01: 0,
    });
  }
  return { lat: BIOSPHERE_LAT, lon: BIOSPHERE_LON, cells };
}

export function cloneBiosphereGrid(grid) {
  if (!grid || !Array.isArray(grid.cells)) return null;
  return {
    lat: grid.lat,
    lon: grid.lon,
    cells: grid.cells.map((c) => ({ ...c })),
  };
}

export function cellIndex(latIdx, lonIdx, lon) {
  return latIdx * lon + lonIdx;
}

/** u,v in 0..1 equirectangular (u = longitude, v = latitude from south pole) */
export function uvToCell(u, v, lat = BIOSPHERE_LAT, lon = BIOSPHERE_LON) {
  const lonIdx = Math.min(lon - 1, Math.max(0, Math.floor(u * lon)));
  const latIdx = Math.min(lat - 1, Math.max(0, Math.floor(v * lat)));
  return { latIdx, lonIdx, i: latIdx * lon + lonIdx };
}

function cellLandNoise(surfaceSeed, bodyId, latI, lonI) {
  const t = hashString32(`${surfaceSeed}|${bodyId}|${latI}|${lonI}`) / 0xffffffff;
  return t;
}

function speciesCellAffinity(speciesId, latI, lonI, biosphereSeed) {
  return hashString32(`${biosphereSeed}|sp|${speciesId}|${latI}|${lonI}`) / 0xffffffff;
}

/**
 * Ensure planet has numeric seeds and biome archetype label.
 */
export function ensurePlanetBiosphereIdentity(body, env) {
  if (!body || body.type !== 'planet') return;
  if (body.biosphereSeed == null) {
    body.biosphereSeed = hashString32(`bio|${body.id}|${body.name || 'p'}`);
  }
  if (body.surfaceSeed == null) {
    body.surfaceSeed = hashString32(`surf|${body.id}|${body.name || 'p'}`);
  }
  if (!body.biomeArchetype) {
    const w = body.waterCoverage ?? (body.hasWater ? 0.55 : 0.05);
    const temp = body.temperature ?? 280;
    const h = hashString32(`${body.biosphereSeed}|arch`);
    const r = (h % 1000) / 1000;
    if (w > 0.75 && r < 0.45) body.biomeArchetype = 'oceanic';
    else if (w < 0.15 && temp > 310 && r < 0.5) body.biomeArchetype = 'desert_arid';
    else if (temp < 240 && r < 0.35) body.biomeArchetype = 'polar_dominant';
    else if (r < 0.25) body.biomeArchetype = 'equatorial_band';
    else if (r < 0.55) body.biomeArchetype = 'continental';
    else body.biomeArchetype = 'mixed';
  }
}

export function initBiosphereGrid(body) {
  if (!body || body.type !== 'planet') return;
  ensurePlanetBiosphereIdentity(body, null);
  body.biosphereGrid = createEmptyBiosphereGrid();
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Single-step update: land/ocean mask from waterCoverage, habitats, dominant species, civ influence.
 */
export function updateBiosphereGrid(body, env, dtYears) {
  if (!body?.biosphereGrid?.cells?.length) return;
  const grid = body.biosphereGrid;
  const { lat, lon, cells } = grid;
  const aliveSpecies = (body.evolutionTree || []).filter((s) => s.extinctAt === null);
  const water = clamp01(body.waterCoverage ?? (body.hasWater ? 0.6 : 0.08));
  const landThreshold = 1 - water * 0.92;
  const step = clamp01(0.04 * Math.min(1, (dtYears || 0) / 5e4 + 0.02));

  const civ = body.civilization && !body.civilization.collapsed ? body.civilization : null;
  const civPop = civ ? Math.min(1, Math.log10((civ.population || 0.001) * 1e6 + 1) / 7) : 0;

  for (let latI = 0; latI < lat; latI++) {
    const latFrac = (latI + 0.5) / lat;
    const absLat = Math.abs(latFrac - 0.5) * 2;
    for (let lonI = 0; lonI < lon; lonI++) {
      const idx = cellIndex(latI, lonI, lon);
      const c = cells[idx];
      const n = cellLandNoise(body.surfaceSeed, body.id, latI, lonI);
      const isLand = n > landThreshold;
      let habitat = 'ocean';
      if (isLand) {
        if (absLat > 0.82) habitat = 'ice';
        else if (absLat > 0.55 && n < landThreshold + 0.08) habitat = 'coast';
        else habitat = 'land';
      } else if (absLat > 0.88) habitat = 'ice';

      let domId = null;
      let biomassTarget = 0;
      if (aliveSpecies.length > 0) {
        let best = -1;
        for (const s of aliveSpecies) {
          const aff = speciesCellAffinity(s.id, latI, lonI, body.biosphereSeed);
          let habitatBonus = 1;
          if (s.stage === 'intelligent' && (habitat === 'land' || habitat === 'coast')) habitatBonus += 0.25;
          if (s.stage === 'simple' && habitat === 'ocean') habitatBonus += 0.15;
          const score = (s.fitness || 0.3) * (0.35 + 0.65 * aff) * habitatBonus;
          if (score > best) {
            best = score;
            domId = s.id;
          }
        }
        biomassTarget = clamp01(0.2 + best * 0.75);
      }

      c.habitat = habitat;
      c.dominantSpeciesId = domId;
      c.biomass01 = clamp01(c.biomass01 + (biomassTarget - c.biomass01) * step);

      let civTarget = 0;
      if (civ && (habitat === 'land' || habitat === 'coast')) {
        const coastal = habitat === 'coast' ? 1.15 : 1;
        const eq = 1 - absLat * 0.4;
        civTarget = clamp01(civPop * 0.85 * coastal * eq * (0.4 + 0.6 * speciesCellAffinity(String(civ.id || body.id), latI, lonI, body.surfaceSeed)));
      }
      c.civilizationInfluence01 = clamp01(
        c.civilizationInfluence01 + (civTarget - c.civilizationInfluence01) * step
      );
    }
  }
}

export function clearBiosphereGrid(body) {
  if (!body) return;
  body.biosphereGrid = null;
}

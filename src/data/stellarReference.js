/**
 * Stellar reference data for HR diagram and physics validation
 * Sources: Hurley+2000 (SSE), Mamajek table, empirical mass-L-T relations
 * We keep our own physics in math.js/Star.js; this augments visualization & docs.
 */

const log10 = Math.log10;

/**
 * Main sequence reference (M/Msun -> log L, log T)
 * Hurley+2000 / SSE-style fits; matches Mamajek empirical table for solar neighborhood
 */
export const MAIN_SEQUENCE_REF = [
  { m: 0.1, logL: -1.54, logT: 3.46 },
  { m: 0.2, logL: -1.26, logT: 3.50 },
  { m: 0.4, logL: -0.72, logT: 3.55 },
  { m: 0.6, logL: -0.38, logT: 3.61 },
  { m: 0.8, logL: -0.12, logT: 3.67 },
  { m: 1.0, logL: 0.00, logT: 3.76 },
  { m: 1.2, logL: 0.12, logT: 3.81 },
  { m: 1.5, logL: 0.28, logT: 3.87 },
  { m: 2.0, logL: 0.55, logT: 3.95 },
  { m: 3.0, logL: 0.98, logT: 4.04 },
  { m: 5.0, logL: 1.62, logT: 4.16 },
  { m: 8.0, logL: 2.32, logT: 4.28 },
  { m: 12, logL: 2.94, logT: 4.38 },
  { m: 20, logL: 3.64, logT: 4.48 },
  { m: 40, logL: 4.42, logT: 4.58 },
];

/**
 * Red giant branch (log L vs log T) - schematic track for 1 Msun
 */
export const RED_GIANT_BRANCH = [
  { logT: 3.76, logL: 0.0 },
  { logT: 3.72, logL: 0.5 },
  { logT: 3.65, logL: 1.5 },
  { logT: 3.55, logL: 2.5 },
  { logT: 3.50, logL: 3.2 },
];

/**
 * White dwarf cooling sequence (log L vs log T) - schematic
 */
export const WHITE_DWARF_COOLING = [
  { logT: 4.8, logL: -1.5 },
  { logT: 4.6, logL: -2.0 },
  { logT: 4.4, logL: -2.5 },
  { logT: 4.0, logL: -3.2 },
  { logT: 3.7, logL: -4.0 },
];

/**
 * Interpolate main sequence at given mass
 */
export function mainSeqAtMass(m) {
  const pts = MAIN_SEQUENCE_REF;
  if (m <= pts[0].m) return pts[0];
  if (m >= pts[pts.length - 1].m) return pts[pts.length - 1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (m >= pts[i].m && m <= pts[i + 1].m) {
      const t = (log10(m) - log10(pts[i].m)) / (log10(pts[i + 1].m) - log10(pts[i].m));
      return {
        logL: pts[i].logL + t * (pts[i + 1].logL - pts[i].logL),
        logT: pts[i].logT + t * (pts[i + 1].logT - pts[i].logT),
      };
    }
  }
  return pts[0];
}

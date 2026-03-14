/**
 * Physical constants used throughout the simulation.
 * All values in SI units unless noted otherwise.
 * We use scaled units internally for numerical stability.
 */

// === Fundamental Constants ===
export const G = 6.674e-11;              // Gravitational constant (m³ kg⁻¹ s⁻²)
export const C = 2.998e8;               // Speed of light (m/s)
export const STEFAN_BOLTZMANN = 5.670e-8; // Stefan-Boltzmann constant (W m⁻² K⁻⁴)
export const BOLTZMANN = 1.381e-23;      // Boltzmann constant (J/K)
export const PLANCK = 6.626e-34;         // Planck constant (J·s)

// === Solar Units (our simulation base units) ===
export const SOLAR_MASS = 1.989e30;      // kg
export const SOLAR_RADIUS = 6.957e8;     // m
export const SOLAR_LUMINOSITY = 3.828e26; // W
export const SOLAR_TEMPERATURE = 5778;    // K (effective surface temp)

// === Other Astronomical Units ===
export const AU = 1.496e11;              // Astronomical Unit (m)
export const LIGHT_YEAR = 9.461e15;      // Light year (m)
export const PARSEC = 3.086e16;          // Parsec (m)
export const EARTH_MASS = 5.972e24;      // kg
export const EARTH_RADIUS = 6.371e6;     // m
export const JUPITER_MASS = 1.898e27;    // kg
export const JUPITER_RADIUS = 6.991e7;   // m

// === Simulation Scale ===
// 1 simulation unit = 1 AU for distances
// 1 simulation mass unit = 1 Solar mass
// 1 simulation time unit is chosen so G=1 in sim units
export const SIM_DISTANCE_SCALE = AU;
/** Solar radius in AU: 1 R☉ ≈ 0.00465 AU (for collision/physics in sim units) */
export const R_SUN_IN_AU = SOLAR_RADIUS / AU;
export const SIM_MASS_SCALE = SOLAR_MASS;
export const SIM_TIME_SCALE = Math.sqrt(AU * AU * AU / (G * SOLAR_MASS)); // ~58.1 days

// === Simulation Boundary ===
/** Arena radius (AU) - bodies beyond this from COM are destroyed within a single system. */
export const ARENA_RADIUS_AU = 500;

// === Universe Scale Constants ===
/** Universe boundary radius in millions of lightyears */
export const UNIVERSE_RADIUS_MLY = 500;
/** Conversion: 1 Mly in AU (approximate) */
export const MLY_TO_AU = 6.324e10;
/** Conversion: 1 kly in AU */
export const KLY_TO_AU = 6.324e7;
/** Lightyear in AU */
export const LY_TO_AU = 63241.077;

// === View Levels ===
export const VIEW_LEVEL = {
  UNIVERSE: 'universe',
  SYSTEM: 'system',
  BODY: 'body',
};

// === Rendering Constants ===
export const STAR_RENDER_SCALE = 0.05;    // Visual scale for stars (AU)
export const PLANET_RENDER_SCALE = 0.01;  // Visual scale for planets
export const MIN_RENDER_SIZE = 0.003;     // Minimum visible size
export const MAX_RENDER_SIZE = 0.5;       // Maximum render size
export const BLOOM_INTENSITY = 1.5;
export const CAMERA_NEAR = 0.001;
export const CAMERA_FAR = 10000;

// === Time Steps ===
export const TIME_STEPS = {
  PAUSED: 0,
  REAL_TIME: 1,
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
  MONTH: 2.628e6,
  YEAR: 3.154e7,
  CENTURY: 3.154e9,
  MILLION_YEARS: 3.154e13,
  BILLION_YEARS: 3.154e16,
};

// === Stellar Evolution Timescales (years) ===
export const EVOLUTION = {
  MAIN_SEQUENCE_SUN: 1e10,        // 10 billion years for sun-like
  RED_GIANT_DURATION: 1e9,         // ~1 billion years
  WHITE_DWARF_COOLING: 1e10,       // Very long cooling
  SUPERNOVA_DURATION: 0.01,        // Weeks in years
  NEUTRON_STAR_SPINDOWN: 1e7,      // Millions of years
};

// === Temperature Color Mapping (approximate blackbody) ===
export const TEMP_COLORS = {
  2000:  { r: 1.0, g: 0.35, b: 0.1 },   // Deep red
  3000:  { r: 1.0, g: 0.5, b: 0.2 },    // Orange-red
  4000:  { r: 1.0, g: 0.65, b: 0.35 },   // Orange
  5000:  { r: 1.0, g: 0.8, b: 0.6 },    // Yellow-white
  5778:  { r: 1.0, g: 0.9, b: 0.8 },    // Sun-like
  7000:  { r: 0.9, g: 0.9, b: 1.0 },    // White
  10000: { r: 0.7, g: 0.8, b: 1.0 },    // Blue-white
  20000: { r: 0.6, g: 0.7, b: 1.0 },    // Blue
  40000: { r: 0.5, g: 0.6, b: 1.0 },    // Deep blue
};

/**
 * Math utilities for the simulation
 */
import * as THREE from 'three';

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Smooth step interpolation
 */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Map value from one range to another
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Calculate gravitational force magnitude between two masses
 * F = G * m1 * m2 / r^2
 * In simulation units where G=1
 */
export function gravitationalForce(m1, m2, distance) {
  if (distance < 1e-10) return 0;
  return (m1 * m2) / (distance * distance);
}

// G = 4π² in simulation units (AU, M☉, years)
const G_SIM = 4 * Math.PI * Math.PI;

/**
 * Calculate orbital velocity for a circular orbit
 * v = sqrt(G * M / r), in sim units (AU, M☉, years) → AU/year
 * Earth at 1 AU from 1 M☉: v = 2π AU/yr ≈ 6.283 AU/yr ≈ 29.8 km/s ✓
 */
export function orbitalVelocity(centralMass, radius) {
  return Math.sqrt(G_SIM * centralMass / radius);
}

/**
 * Calculate orbital period
 * T = 2π * sqrt(r³ / (G*M)), in sim units → years
 * Earth at 1 AU from 1 M☉: T = 1 year ✓
 */
export function orbitalPeriod(centralMass, radius) {
  return 2 * Math.PI * Math.sqrt(radius * radius * radius / (G_SIM * centralMass));
}

/**
 * Calculate escape velocity
 * v_esc = sqrt(2*G*M/r), in sim units → AU/year
 */
export function escapeVelocity(mass, radius) {
  return Math.sqrt(2 * G_SIM * mass / radius);
}

/**
 * Schwarzschild radius for a black hole
 * r_s = 2GM/c², returns in simulation distance units
 */
export function schwarzschildRadius(massSolar) {
  const G_SI = 6.674e-11;
  const C_SI = 2.998e8;
  const M_SI = massSolar * 1.989e30;
  const r_m = 2 * G_SI * M_SI / (C_SI * C_SI);
  return r_m / 1.496e11; // convert to AU
}

/**
 * Main sequence luminosity from mass (approximate)
 * L ≈ M^3.5 for main sequence (in solar units)
 * Our physics: simplified power laws for real-time sim.
 * HR diagram & validation use stellarReference.js (Hurley+2000/SSE-style).
 */
export function mainSequenceLuminosity(massSolar) {
  if (massSolar < 0.43) return 0.23 * Math.pow(massSolar, 2.3);
  if (massSolar < 2) return Math.pow(massSolar, 4);
  if (massSolar < 55) return 1.4 * Math.pow(massSolar, 3.5);
  return 32000 * massSolar; // very massive stars
}

/**
 * Main sequence temperature from mass (approximate)
 * Using Stefan-Boltzmann: L = 4π R² σ T⁴
 */
export function mainSequenceTemperature(massSolar) {
  const L = mainSequenceLuminosity(massSolar);
  const R = mainSequenceRadius(massSolar);
  // T = T_sun * (L / R²)^0.25
  return 5778 * Math.pow(L / (R * R), 0.25);
}

/**
 * Main sequence radius from mass (approximate, in solar radii)
 */
export function mainSequenceRadius(massSolar) {
  if (massSolar < 1) return Math.pow(massSolar, 0.8);
  return Math.pow(massSolar, 0.57);
}

/**
 * Main sequence lifetime (in years)
 * t ≈ t_sun * M / L
 */
export function mainSequenceLifetime(massSolar) {
  const L = mainSequenceLuminosity(massSolar);
  return 1e10 * massSolar / L;
}

/**
 * Temperature to RGB color (blackbody approximation)
 * Based on Tanner Helland's algorithm
 */
export function temperatureToColor(kelvin) {
  const temp = clamp(kelvin, 1000, 50000) / 100;
  let r, g, b;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    r = clamp(r, 0, 255);
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  g = clamp(g, 0, 255);

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    b = clamp(b, 0, 255);
  }

  return new THREE.Color(r / 255, g / 255, b / 255);
}

/**
 * Generate a random value with gaussian distribution
 */
export function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

/**
 * Generate random point on a sphere
 */
export function randomOnSphere(radius = 1) {
  const theta = Math.random() * 2 * Math.PI;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  );
}

/**
 * Format large numbers to human-readable strings
 */
export function formatNumber(value, decimals = 2) {
  if (Math.abs(value) < 1e-3) return value.toExponential(decimals);
  if (Math.abs(value) < 1e3) return value.toFixed(decimals);
  if (Math.abs(value) < 1e6) return (value / 1e3).toFixed(decimals) + 'K';
  if (Math.abs(value) < 1e9) return (value / 1e6).toFixed(decimals) + 'M';
  if (Math.abs(value) < 1e12) return (value / 1e9).toFixed(decimals) + 'B';
  return value.toExponential(decimals);
}

/**
 * Format time duration in years to human-readable string
 */
export function formatTime(years) {
  if (years < 1e-6) return (years * 3.154e7).toFixed(1) + ' seconds';
  if (years < 1 / 365.25) return (years * 365.25).toFixed(1) + ' days';
  if (years < 1) return (years * 12).toFixed(1) + ' months';
  if (years < 1e3) return years.toFixed(1) + ' years';
  if (years < 1e6) return (years / 1e3).toFixed(2) + ' thousand years';
  if (years < 1e9) return (years / 1e6).toFixed(2) + ' million years';
  return (years / 1e9).toFixed(2) + ' billion years';
}

/**
 * General utility helpers
 */

let idCounter = 0;

/**
 * Generate a unique ID
 */
export function generateId() {
  return `body_${Date.now()}_${idCounter++}`;
}

/**
 * Deep clone an object (simple JSON-safe objects)
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function
 */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Pick a random item from an array
 */
export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Random float between min and max
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

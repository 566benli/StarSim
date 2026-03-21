/**
 * Neighbor queries for UI (N-body context within a star system).
 * Full gravity is computed per GravitySystem; different systems do not interact in AU physics.
 */

/**
 * @param {*} body  CelestialBody
 * @param {Array} allBodies
 * @param {number} maxN
 */
export function getClosestNeighbors(body, allBodies, maxN = 6) {
  if (!body || !allBodies?.length) return [];

  const alive = allBodies.filter((b) => b.alive && b.id !== body.id);
  const scored = alive.map((b) => ({
    body: b,
    distanceAU: body.position.distanceTo(b.position),
    sameSystem: b.systemId === body.systemId,
  }));

  scored.sort((a, b) => a.distanceAU - b.distanceAU);
  const top = scored.slice(0, maxN);

  return top.map(({ body: b, distanceAU, sameSystem }) => ({
    id: b.id,
    name: b.name || b.subtype || 'Body',
    distanceAU,
    sameSystem,
  }));
}

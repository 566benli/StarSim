/**
 * StarSystem - A gravitationally bound group of stars and planets.
 * Positioned within a Cluster at universe scale.
 */
import * as THREE from 'three';
import { generateId } from '@utils/helpers';

export default class StarSystem {
  constructor(config = {}) {
    this.id = config.id || generateId();
    this.name = config.name || 'Star System';
    this.clusterId = config.clusterId || null;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    if (config.position) this.position.copy(config.position);
    if (config.velocity) this.velocity.copy(config.velocity);

    this.bodyIds = config.bodyIds || [];
    this.alive = true;
  }

  get totalMass() {
    return this._cachedMass || 1;
  }

  updateCachedMass(bodies) {
    this._cachedMass = 0;
    for (const id of this.bodyIds) {
      const b = bodies.find(x => x.id === id);
      if (b && b.alive) this._cachedMass += b.mass;
    }
  }

  addBody(body) {
    if (!this.bodyIds.includes(body.id)) {
      this.bodyIds.push(body.id);
      body.systemId = this.id;
    }
  }

  removeBody(bodyId) {
    this.bodyIds = this.bodyIds.filter(id => id !== bodyId);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      clusterId: this.clusterId,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
      bodyIds: [...this.bodyIds],
      alive: this.alive,
    };
  }

  static fromJSON(data) {
    const sys = new StarSystem({
      ...data,
      position: new THREE.Vector3(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0),
      velocity: new THREE.Vector3(data.velocity?.x || 0, data.velocity?.y || 0, data.velocity?.z || 0),
    });
    return sys;
  }
}

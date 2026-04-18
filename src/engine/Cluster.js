/**
 * Cluster - A galaxy or star cluster containing multiple star systems.
 * Clusters orbit each other slowly at universe scale.
 * Distances within a cluster are in kly (kilo-lightyears).
 */
import * as THREE from 'three';
import { generateId } from '@utils/helpers';

export default class Cluster {
  constructor(config = {}) {
    this.id = config.id || generateId();
    this.name = config.name || 'Galaxy Cluster';
    this.type = config.type || 'spiral'; // spiral, elliptical, irregular

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.angularVelocity = config.angularVelocity || 0.001;
    this.rotationAngle = config.rotationAngle || 0;

    if (config.position) this.position.copy(config.position);
    if (config.velocity) this.velocity.copy(config.velocity);

    this.systemIds = config.systemIds || [];
    this.color = config.color || '#6688ff';
    this.size = config.size || 50; // visual size in kly
    this.alive = true;
    // True when this cluster was spawned as an intergalactic rogue formation
    // (not a full galaxy). Renderer uses this to draw a small point marker
    // instead of a full nebula blob.
    this.isRogueFormation = config.isRogueFormation || false;
  }

  get totalMass() {
    return this._cachedMass || 100;
  }

  updateCachedMass(systems, bodies) {
    this._cachedMass = 0;
    for (const sId of this.systemIds) {
      const sys = systems.find(s => s.id === sId);
      if (sys && sys.alive) {
        sys.updateCachedMass(bodies);
        this._cachedMass += sys.totalMass;
      }
    }
  }

  addSystem(system) {
    if (!this.systemIds.includes(system.id)) {
      this.systemIds.push(system.id);
      system.clusterId = this.id;
    }
  }

  removeSystem(systemId) {
    this.systemIds = this.systemIds.filter(id => id !== systemId);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
      angularVelocity: this.angularVelocity,
      rotationAngle: this.rotationAngle,
      systemIds: [...this.systemIds],
      color: this.color,
      size: this.size,
      alive: this.alive,
    };
  }

  static fromJSON(data) {
    const c = new Cluster({
      ...data,
      position: new THREE.Vector3(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0),
      velocity: new THREE.Vector3(data.velocity?.x || 0, data.velocity?.y || 0, data.velocity?.z || 0),
    });
    return c;
  }
}

/**
 * EmpireSystem — interstellar empires, colonization, wars, and megastructures.
 *
 * Empire lifecycle:
 *   1. Founded when a civilization reaches Kardashev-I
 *   2. Expands: colonizes planets in the same system (K-I), then other systems (K-II+)
 *   3. Wars: empires in contact may declare war; fleets move and conquer
 *   4. Collapse: can happen through military defeat or internal collapse
 */
import { canColonize, TECH_BY_ID } from '@data/techTree.js';

const EMPIRE_COLORS = [
  '#ff4444', '#44aaff', '#44ff88', '#ffaa00', '#cc44ff',
  '#ff8844', '#44ffee', '#ffff44', '#ff44aa', '#88ff44',
];

let _empireIdCounter = 0;
let _colorIdx = 0;
let _fleetIdCounter = 0;

function newEmpireId() { return `emp_${Date.now().toString(36)}_${(++_empireIdCounter).toString(36)}`; }
function newFleetId()  { return `flt_${Date.now().toString(36)}_${(++_fleetIdCounter).toString(36)}`; }
function nextColor()   { return EMPIRE_COLORS[(_colorIdx++) % EMPIRE_COLORS.length]; }

const WAR_STATE = { PEACE: 'peace', WAR: 'war', TRUCE: 'truce' };

export default class EmpireSystem {
  constructor() {
    this.empires   = new Map();   // id → empire
    this.fleets    = [];          // all active fleets
    this.pendingEvents = [];
  }

  reset() {
    this.empires.clear();
    this.fleets = [];
    this.pendingEvents = [];
    _empireIdCounter = 0;
    _colorIdx = 0;
    _fleetIdCounter = 0;
  }

  consumePendingEvents() {
    const evts = [...this.pendingEvents];
    this.pendingEvents = [];
    return evts;
  }

  // ── Empire founding ───────────────────────────────────────────────────────

  foundEmpire(body, civ, simulationTime) {
    const empire = {
      id: newEmpireId(),
      name: civ.name,
      color: nextColor(),
      founderBodyId: body.id,
      capitalBodyId: body.id,
      ownedBodyIds: new Set([body.id]),
      systemIds:    new Set(body.systemId ? [body.systemId] : []),
      kardashevLevel: civ.kardashevLevel,
      techs: [...civ.unlockedTechs],
      fleetIds: [],
      wars:  new Map(),       // empireId → WAR_STATE
      population: civ.population,
      militaryStrength: 0.1,
      age: 0,
      active: true,
      foundedAt: simulationTime,
    };
    this.empires.set(empire.id, empire);

    this._queueEvent(body, simulationTime, {
      name: 'Empire Founded',
      title: `Empire: ${empire.name}`,
      body: `${empire.name} has declared itself a sovereign empire, headquartered on ${body.name}.`,
      severity: 'major',
    });

    return empire;
  }

  // ── Per-empire update (called from CivilizationSystem) ────────────────────

  updateEmpire(empireId, body, civ, dtYears, simulationTime, civSystem) {
    const empire = this.empires.get(empireId);
    if (!empire || !empire.active) return;

    empire.age += dtYears;
    empire.kardashevLevel = civ.kardashevLevel;
    empire.techs = [...civ.unlockedTechs];
    empire.population = civ.population;

    // Update military strength from weapon techs
    empire.militaryStrength = this._calcMilitary(civ.unlockedTechs);

    // Try to expand
    this._tryExpansion(empire, body, civ, dtYears, simulationTime, civSystem);

    // Move fleets
    this._updateFleets(empire, dtYears, simulationTime);

    // War logic
    this._updateWars(empire, dtYears, simulationTime);
  }

  // ── Expansion ─────────────────────────────────────────────────────────────

  _tryExpansion(empire, capitalBody, civ, dtYears, simulationTime, civSystem) {
    const canPlanetary    = canColonize(civ.unlockedTechs, 'planetary');
    const canSystem       = canColonize(civ.unlockedTechs, 'system');
    const canInterstellar = canColonize(civ.unlockedTechs, 'interstellar');

    // We need the engine to enumerate bodies. CivilizationSystem's caller provides
    // `_allBodies` when calling us — fall back gracefully.
    const allBodies = civSystem._allBodies || [];

    for (const target of allBodies) {
      if (!target.alive || target.type !== 'planet') continue;
      if (empire.ownedBodyIds.has(target.id)) continue;
      if (target.civilization?.empireId && target.civilization.empireId !== empire.id) continue; // skip enemy

      const sameSystem = target.systemId && target.systemId === capitalBody.systemId;
      const eligible = canInterstellar || (canSystem && sameSystem) || (canPlanetary && sameSystem);
      if (!eligible) continue;

      // Colonization probability per 1000 years
      const prob = 1 - Math.exp(-dtYears / 5000 * (0.1 + empire.militaryStrength * 0.3));
      if (Math.random() >= prob) continue;

      this._colonize(empire, target, simulationTime, civSystem);
      break; // one expansion per tick
    }
  }

  _colonize(empire, target, simulationTime, civSystem) {
    empire.ownedBodyIds.add(target.id);
    if (target.systemId) empire.systemIds.add(target.systemId);

    // If target has a civ, absorb or displace it
    if (target.civilization && !target.civilization.collapsed) {
      if (target.civilization.empireId) {
        // Already owned by another empire → trigger war rather than instant colonize
        this._declareWar(empire, target.civilization.empireId, simulationTime, civSystem);
        empire.ownedBodyIds.delete(target.id);
        return;
      }
      target.civilization.empireId = empire.id;
    } else if (!target.civilization) {
      // Establish a colony civilization on the planet
      target.civilization = {
        id: `civ_col_${Date.now().toString(36)}`,
        name: `${empire.name} Colony`,
        stage: 'space',
        kardashevLevel: Math.max(0, empire.kardashevLevel - 1),
        techPoints: 100,
        unlockedTechs: empire.techs.slice(0, Math.min(5, empire.techs.length)),
        population: 0.001,
        megastructures: [],
        fleets: [],
        empireId: empire.id,
        discoveredAt: simulationTime,
        collapsed: false,
        collapseReason: null,
        founderSpeciesName: 'Colony',
      };
    }

    this._queueEvent(target, simulationTime, {
      name: 'Colony Founded',
      title: `${empire.name} Colonizes ${target.name}`,
      body: `A colonization fleet from ${empire.name} has established a presence on ${target.name}.`,
      severity: 'notable',
    });
  }

  // ── Fleets ────────────────────────────────────────────────────────────────

  launchFleet(empire, fromBody, toBody, type, simulationTime) {
    const fleet = {
      id: newFleetId(),
      empireId: empire.id,
      fromBodyId: fromBody.id,
      toBodyId: toBody.id,
      type,              // 'colonizer' | 'warfleet' | 'explorer'
      progress: 0,       // 0..1
      launchedAt: simulationTime,
      eta: simulationTime + 500, // 500 sim-years travel
    };
    this.fleets.push(fleet);
    empire.fleetIds.push(fleet.id);
    return fleet;
  }

  _updateFleets(empire, dtYears, simulationTime) {
    const arrived = [];
    for (let i = this.fleets.length - 1; i >= 0; i--) {
      const f = this.fleets[i];
      if (f.empireId !== empire.id) continue;
      f.progress += dtYears / Math.max(f.eta - f.launchedAt, 1);
      if (f.progress >= 1) {
        arrived.push(f);
        this.fleets.splice(i, 1);
        empire.fleetIds = empire.fleetIds.filter(id => id !== f.id);
      }
    }
    // Process arrivals (no-op for now; expansion handled in _tryExpansion)
    void arrived;
    void simulationTime;
  }

  // ── War ────────────────────────────────────────────────────────────────────

  _declareWar(attacker, defenderEmpireId, simulationTime, civSystem) {
    if (attacker.wars.get(defenderEmpireId) === WAR_STATE.WAR) return;
    attacker.wars.set(defenderEmpireId, WAR_STATE.WAR);
    const defender = this.empires.get(defenderEmpireId);
    if (defender) defender.wars.set(attacker.id, WAR_STATE.WAR);

    this._queueEvent(null, simulationTime, {
      name: 'War Declared',
      title: `War: ${attacker.name} vs ${defender?.name ?? '?'}`,
      body: `${attacker.name} has declared war on ${defender?.name ?? 'an unknown empire'}.`,
      severity: 'major',
    });
  }

  _updateWars(empire, dtYears, simulationTime) {
    for (const [defId, state] of empire.wars.entries()) {
      if (state !== WAR_STATE.WAR) continue;
      const defender = this.empires.get(defId);
      if (!defender) continue;

      // Simple: war outcome determined by military strength difference
      const prob = 1 - Math.exp(-dtYears / 10000);
      if (Math.random() >= prob) continue;

      if (empire.militaryStrength > defender.militaryStrength * 1.5) {
        // Attacker wins a battle — take one planet
        const captured = [...defender.ownedBodyIds][0];
        if (captured) {
          defender.ownedBodyIds.delete(captured);
          empire.ownedBodyIds.add(captured);
        }
      } else if (defender.militaryStrength > empire.militaryStrength * 1.5) {
        // Defender counter-attacks
        const captured = [...empire.ownedBodyIds].find(id => id !== empire.capitalBodyId);
        if (captured) {
          empire.ownedBodyIds.delete(captured);
          defender.ownedBodyIds.add(captured);
        }
      } else {
        // Stalemate → truce after a while
        const truceProp = 1 - Math.exp(-dtYears / 50000);
        if (Math.random() < truceProp) {
          empire.wars.set(defId, WAR_STATE.TRUCE);
          defender.wars.set(empire.id, WAR_STATE.TRUCE);
        }
      }
    }
  }

  // ── Military ──────────────────────────────────────────────────────────────

  _calcMilitary(unlockedTechs) {
    let m = 0.05;
    for (const id of unlockedTechs) {
      const t = TECH_BY_ID[id];
      if (t?.effects?.militaryStrength) m += t.effects.militaryStrength;
    }
    return Math.min(m, 1.0);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toJSON() {
    return {
      empires: [...this.empires.values()].map(e => ({
        ...e,
        ownedBodyIds: [...e.ownedBodyIds],
        systemIds:    [...e.systemIds],
        wars: [...e.wars.entries()],
        fleetIds: [...e.fleetIds],
      })),
      fleets: [...this.fleets],
    };
  }

  fromJSON(data) {
    this.empires.clear();
    this.fleets = data.fleets || [];
    for (const e of (data.empires || [])) {
      this.empires.set(e.id, {
        ...e,
        ownedBodyIds: new Set(e.ownedBodyIds),
        systemIds:    new Set(e.systemIds),
        wars: new Map(e.wars),
      });
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getEmpireForBody(bodyId) {
    for (const empire of this.empires.values()) {
      if (empire.ownedBodyIds.has(bodyId)) return empire;
    }
    return null;
  }

  getAllEmpires() {
    return [...this.empires.values()].filter(e => e.active);
  }

  getActiveWars() {
    const wars = [];
    for (const empire of this.empires.values()) {
      for (const [defId, state] of empire.wars.entries()) {
        if (state === WAR_STATE.WAR && empire.id < defId) {
          wars.push({ attacker: empire, defender: this.empires.get(defId) });
        }
      }
    }
    return wars;
  }

  // ── Event queue ───────────────────────────────────────────────────────────

  _queueEvent(body, simulationTime, notification) {
    this.pendingEvents.push({
      id: `emp_${Date.now()}_${Math.random()}`,
      name: notification.name,
      category: 'empire',
      targetBody: body,
      time: simulationTime,
      notification: {
        title: notification.title,
        body: notification.body,
        severity: notification.severity || 'notable',
      },
      effects: {},
    });
  }
}

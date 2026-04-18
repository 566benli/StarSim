/**
 * CivilizationSystem — emerges from intelligent life, accumulates tech,
 * progresses through Kardashev levels, and spawns empires.
 *
 * Inspired by WorldBox (kingdom emergence) and Cell: Singularity (tech trees).
 * Called from SimEngine alongside LifeEvolutionSystem.
 */
import {
  TECH_TREE, TECH_BY_ID, CIV_STAGES, getAvailableTechs, computeTechRate,
  computeKardashevLevel,
} from '@data/techTree.js';
import { buildCivCharacter } from './civCharacter.js';

// Intelligence threshold at which a civilization first emerges (0–1 scale).
// Must be <= lifeEvolutionConfig.stages.intelligentThreshold (currently 0.62)
// so a freshly-intelligent planet can immediately spark a civ.
export const CIV_EMERGENCE_THRESHOLD = 0.60;

// Tech point cost to unlock a tech at given tier
const TIER_COST = { 1: 50, 2: 150, 3: 500, 4: 2000, 5: 10000 };

// How many sim-years between civilization updates
export const CIV_UPDATE_INTERVAL = 50;

let _civIdCounter = 0;
function newCivId() {
  return `civ_${Date.now().toString(36)}_${(++_civIdCounter).toString(36)}`;
}

export default class CivilizationSystem {
  constructor() {
    this.pendingEvents = [];
  }

  consumePendingEvents() {
    const evts = [...this.pendingEvents];
    this.pendingEvents = [];
    return evts;
  }

  /**
   * Called by SimEngine; `bodies` is the alive body list for one GravitySystem.
   */
  update(bodies, dtYears, simulationTime, empireSystem) {
    if (dtYears <= 0) return;

    for (const body of bodies) {
      if (!body?.alive || body.type !== 'planet') continue;
      this._updatePlanet(body, dtYears, simulationTime, empireSystem);
    }
  }

  // ── Per-planet logic ──────────────────────────────────────────────────────

  _updatePlanet(body, dtYears, simulationTime, empireSystem) {
    // ── Emergence check ──────────────────────────────────────────────────
    if (!body.civilization) {
      if (
        body.lifeStage === 'intelligent' &&
        (body.intelligencePotential ?? 0) >= CIV_EMERGENCE_THRESHOLD &&
        (body.biosphereHealth ?? 0) > 0.5
      ) {
        this._spawnCivilization(body, simulationTime, empireSystem);
      }
      return;
    }

    const civ = body.civilization;

    // ── Skip dead civilizations ───────────────────────────────────────────
    if (civ.collapsed) return;

    // ── Collapse check (cataclysm / life wipe) ────────────────────────────
    if (body.lifeStage === 'none' || body.lifeStage === 'prebiotic') {
      this._collapseCivilization(body, simulationTime, 'Extinction event');
      return;
    }

    // ── At-risk warning — biosphere deteriorating under an active civilization ─
    if (!civ._atRiskWarnEmitted && (body.biosphereHealth ?? 1) < 0.18) {
      civ._atRiskWarnEmitted = true;
      this._queueEvent(body, simulationTime, {
        name: 'Civilization at Risk',
        title: '⚠️ Civilization Under Threat',
        body: `${civ.name} on ${body.name} faces extinction — the biosphere is collapsing. Intervention needed.`,
        severity: 'warning',
      });
    }

    // ── Tech point accumulation ───────────────────────────────────────────
    const baseRate = computeTechRate(civ.unlockedTechs);
    const popBonus = 1 + Math.log10(Math.max(civ.population, 0.001) + 1) * 0.3;
    const healthBonus = (body.biosphereHealth ?? 0.5);
    civ.techPoints += baseRate * popBonus * healthBonus * dtYears;

    // ── Auto-unlock available techs ───────────────────────────────────────
    this._tryUnlockTech(body, civ, simulationTime);

    // ── Population growth ─────────────────────────────────────────────────
    this._updatePopulation(body, civ, dtYears);

    // ── Stage progression ─────────────────────────────────────────────────
    this._updateCivStage(body, civ, simulationTime);

    // ── Kardashev level ───────────────────────────────────────────────────
    const newLevel = computeKardashevLevel(civ.unlockedTechs);
    if (newLevel > civ.kardashevLevel) {
      civ.kardashevLevel = newLevel;
      this._queueEvent(body, simulationTime, {
        name: 'Kardashev Ascension',
        title: `🌟 Kardashev Type ${newLevel} Achieved`,
        body: `${civ.name} on ${body.name} has ascended to a Kardashev Type ${newLevel} civilization — harnessing the energy of ${newLevel === 1 ? 'their entire planet' : newLevel === 2 ? 'their star' : 'their galaxy'}.`,
        severity: newLevel >= 2 ? 'critical' : 'major',
      });
    }

    // ── Empire interaction ────────────────────────────────────────────────
    if (empireSystem && civ.kardashevLevel >= 1 && !civ.empireId) {
      // Found a new empire at K-I
      const empire = empireSystem.foundEmpire(body, civ, simulationTime);
      civ.empireId = empire.id;
    }

    if (empireSystem && civ.empireId) {
      empireSystem.updateEmpire(civ.empireId, body, civ, dtYears, simulationTime, this);
    }
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────

  _spawnCivilization(body, simulationTime, empireSystem) {
    const domSpecies = (body.evolutionTree || [])
      .filter(s => s.extinctAt === null && s.stage === 'intelligent')
      .sort((a, b) => (b.fitness || 0) - (a.fitness || 0))[0];

    const speciesName = domSpecies?.name || body.name + 'ians';
    const civName = this._generateCivName(speciesName, body.name);

    body.civilization = {
      id: newCivId(),
      name: civName,
      founderSpeciesId: domSpecies?.id ?? null,
      founderSpeciesName: speciesName,
      character: buildCivCharacter({ domSpecies, body, simulationTime }),
      stage: 'tribal',
      kardashevLevel: 0,
      techPoints: 10,
      unlockedTechs: [],
      population: 0.001,         // billions
      megastructures: [],
      fleets: [],
      empireId: null,
      discoveredAt: simulationTime,
      collapsed: false,
      collapseReason: null,
      // auto-unlock tier-1 starter techs
      _autoUnlockStarters: true,
    };

    // Auto-unlock very first tier-1 techs for free
    for (const t of TECH_TREE.filter(t => t.tier === 1 && t.requires.length === 0)) {
      body.civilization.unlockedTechs.push(t.id);
    }
    body.civilization._autoUnlockStarters = false;

    this._queueEvent(body, simulationTime, {
      name: 'Civilization Emerges',
      title: '🏛️ First Civilization',
      body: `The ${speciesName} on ${body.name} have formed their first civilization: ${civName}. The age of intelligence begins.`,
      severity: 'historic',
    });

    if (empireSystem) {
      // Don't found an empire yet — wait for K-I
    }
  }

  _collapseCivilization(body, simulationTime, reason) {
    if (!body.civilization) return;
    body.civilization.collapsed = true;
    body.civilization.collapseReason = reason;
    this._queueEvent(body, simulationTime, {
      name: 'Civilization Collapse',
      title: 'Civilization Collapsed',
      body: `${body.civilization.name} on ${body.name} collapsed: ${reason}.`,
      severity: 'catastrophic',
    });
  }

  // ── Tech unlocking ────────────────────────────────────────────────────────

  _tryUnlockTech(body, civ, simulationTime) {
    const available = getAvailableTechs(civ.unlockedTechs);
    for (const tech of available) {
      const cost = TIER_COST[tech.tier] ?? 500;
      if (civ.techPoints >= cost) {
        civ.techPoints -= cost;
        civ.unlockedTechs.push(tech.id);

        // Apply immediate effects
        if (tech.effects.unlockMegastructure) {
          if (!civ.megastructures.includes(tech.effects.unlockMegastructure)) {
            civ.megastructures.push(tech.effects.unlockMegastructure);
          }
        }

        this._queueEvent(body, simulationTime, {
          name: 'Tech Unlocked',
          title: `${tech.label} Discovered`,
          body: `${civ.name} on ${body.name} has unlocked ${tech.label}.`,
          severity: tech.tier >= 4 ? 'major' : 'notable',
        });

        break; // unlock one per tick to avoid spam
      }
    }
  }

  // ── Population ────────────────────────────────────────────────────────────

  _updatePopulation(body, civ, dtYears) {
    let growthRate = 0.02; // 2%/year base
    // Bonuses from biology/medicine techs
    for (const id of civ.unlockedTechs) {
      const t = TECH_BY_ID[id];
      if (t?.effects?.populationGrowth) growthRate += t.effects.populationGrowth;
    }
    growthRate *= (body.biosphereHealth ?? 0.5);
    // Logistic cap scales with Kardashev level
    const cap = [10, 100, 1000, 1e6][civ.kardashevLevel] ?? 10;
    const logisticFactor = 1 - civ.population / cap;
    civ.population = Math.max(
      0.0001,
      civ.population + civ.population * growthRate * logisticFactor * dtYears * 0.001
    );
  }

  // ── Civ stage progression ─────────────────────────────────────────────────

  _updateCivStage(body, civ, simulationTime) {
    const stageOrder = [
      'tribal', 'ancient', 'industrial', 'atomic', 'space',
      'interplanetary', 'stellar', 'interstellar', 'galactic', 'transcendent',
    ];

    // Determine target stage from unlocked tech effects
    let targetStage = civ.stage;
    for (const id of civ.unlockedTechs) {
      const t = TECH_BY_ID[id];
      if (t?.effects?.unlockCivStage) {
        const newIdx = stageOrder.indexOf(t.effects.unlockCivStage);
        const curIdx = stageOrder.indexOf(targetStage);
        if (newIdx > curIdx) targetStage = t.effects.unlockCivStage;
      }
    }

    if (targetStage !== civ.stage) {
      const prev = civ.stage;
      civ.stage = targetStage;
      this._queueEvent(body, simulationTime, {
        name: 'Civilization Advance',
        title: `${CIV_STAGES[targetStage]?.label ?? targetStage} Era`,
        body: `${civ.name} on ${body.name} advances from ${prev} to ${targetStage} civilization.`,
        severity: 'notable',
      });
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _generateCivName(speciesName, planetName) {
    const prefixes = ['The', 'United', 'Grand', 'Holy', 'Democratic', 'Republic of', 'Empire of'];
    const forms = [
      `${speciesName} Collective`,
      `${speciesName} Union`,
      `${planetName} Confederacy`,
      `The ${speciesName} Dominion`,
      `${planetName} Alliance`,
      `${speciesName} Republic`,
    ];
    return forms[Math.floor(Math.random() * forms.length)];
  }

  _queueEvent(body, simulationTime, notification) {
    this.pendingEvents.push({
      id: `civ_${Date.now()}_${Math.random()}`,
      name: notification.name,
      category: 'civilization',
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

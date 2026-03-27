import { DEFAULT_LIFE_PRESET, getLifeConfig } from '@data/lifeEvolutionConfig';

const LIFE_STAGES = {
  NONE: 'none',
  PREBIOTIC: 'prebiotic',
  SIMPLE: 'simple',
  COMPLEX: 'complex',
  INTELLIGENT: 'intelligent',
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const mix = (from, to, amount) => from + (to - from) * amount;

const stepFromYears = (dtYears, timescaleYears) => {
  if (dtYears <= 0 || timescaleYears <= 0) return 0;
  return 1 - Math.exp(-dtYears / timescaleYears);
};

const gaussianScore = (value, center, spread) => {
  if (spread <= 0) return 0;
  const delta = (value - center) / spread;
  return Math.exp(-(delta * delta) * 0.5);
};

const log10Safe = (value) => Math.log10(Math.max(value, 1e-6));

const randomCentered = () => (Math.random() * 2) - 1;

export default class LifeEvolutionSystem {
  constructor({ preset = DEFAULT_LIFE_PRESET } = {}) {
    this.preset = preset;
    this.config = getLifeConfig(preset);
    this.pendingEvents = [];
  }

  setPreset(preset) {
    this.preset = preset;
    this.config = getLifeConfig(preset);
  }

  resetToPreset(preset = this.preset) {
    this.setPreset(preset);
  }

  updateTuning(updates = {}) {
    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && this.config[key]) {
        this.config[key] = {
          ...this.config[key],
          ...value,
        };
      } else {
        this.config[key] = value;
      }
    }
  }

  getTuningState() {
    const cfg = this.config;
    return {
      preset: this.preset,
      enabled: cfg.enabled,
      lifeRateMultiplier: cfg.lifeRateMultiplier,
      adaptationRateMultiplier: cfg.adaptationRateMultiplier,
      extinctionRateMultiplier: cfg.extinctionRateMultiplier,
      radiationImpactMultiplier: cfg.radiationImpactMultiplier,
      intelligenceRateMultiplier: cfg.intelligenceRateMultiplier,
      abiogenesisBaseRate: cfg.emergence.abiogenesisBaseRate,
      mutationScale: cfg.evolution.mutationScale,
      candidateCount: cfg.evolution.candidateCount,
      lethalRadiationFlux: cfg.environment.lethalRadiationFlux,
      simpleThreshold: cfg.stages.simpleThreshold,
      complexThreshold: cfg.stages.complexThreshold,
      intelligentThreshold: cfg.stages.intelligentThreshold,
    };
  }

  update(bodies, dtYears, simulationTime = 0) {
    if (!this.config.enabled || dtYears <= 0) return;

    for (const body of bodies) {
      if (!body?.alive || body.type !== 'planet') continue;
      this.updatePlanet(body, dtYears, simulationTime);
    }
  }

  consumePendingEvents() {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  updatePlanet(body, dtYears, simulationTime) {
    const env = this.buildEnvironment(body);
    this.updateStability(body, env, dtYears);
    this.updatePrebioticChemistry(body, env, dtYears);

    if (body.lifeStage === LIFE_STAGES.NONE || body.lifeStage === LIFE_STAGES.PREBIOTIC) {
      this.tryAbiogenesis(body, env, dtYears, simulationTime);
      body.hasLife = false;
      return;
    }

    this.runNaturalSelection(body, env, dtYears);
    this.updateBiosphere(body, env, dtYears);
    this.updateStageProgression(body, dtYears, simulationTime);
    this.applyExtinction(body, env, simulationTime);
  }

  buildEnvironment(body) {
    const cfg = this.config;
    const temp = Math.max(body.temperature || 0, 1);
    const pressure = Math.max(body.atmospherePressure || 0, 0.0001);
    const radiationFlux = Math.max(body.radiationFlux || 0, 0);
    const magneticShielding = clamp01((body.magneticField || 0) / 2.5);
    const surfaceIntegrity = clamp01(1 - (body.surfaceDamage || 0));

    const tempNorm = clamp01(
      (temp - cfg.environment.minTemperature)
      / Math.max(1, cfg.environment.maxTemperature - cfg.environment.minTemperature)
    );
    const pressureNorm = clamp01(
      (log10Safe(pressure) - log10Safe(cfg.environment.minimumPressureAtm))
      / Math.max(0.01, log10Safe(5e3) - log10Safe(cfg.environment.minimumPressureAtm))
    );
    const radiationNorm = clamp01(
      log10Safe(radiationFlux + 1) / log10Safe(cfg.environment.lethalRadiationFlux + 1)
    );

    const withinTempBounds = temp >= cfg.environment.minTemperature && temp <= cfg.environment.maxTemperature;
    const withinPressureBounds = pressure >= cfg.environment.minimumPressureAtm;
    const belowLethalRadiation = radiationFlux <= cfg.environment.lethalRadiationFlux;

    const temperatureSuitability = withinTempBounds ? gaussianScore(
      log10Safe(temp),
      log10Safe(cfg.environment.optimalTemperature),
      cfg.environment.temperatureSpread
    ) : 0;
    const pressureSuitability = withinPressureBounds ? gaussianScore(
      log10Safe(pressure),
      log10Safe(cfg.environment.pressureMidpointAtm),
      cfg.environment.pressureLogSpread
    ) : 0;
    const radiationSuitability = belowLethalRadiation ? gaussianScore(
      log10Safe(radiationFlux + 0.1),
      log10Safe(cfg.environment.idealRadiationFlux + 0.1),
      cfg.environment.radiationSpread
    ) : 0;

    const chemistryPotential = clamp01(
      0.45
      + (body.hasWater ? 0.08 : 0)
      + magneticShielding * 0.12
      + surfaceIntegrity * 0.15
      - Math.max(0, radiationFlux - cfg.environment.lethalRadiationFlux) * 0.0008
    );

    const weightedSuitability = clamp01(
      (temperatureSuitability * 0.34)
      + (pressureSuitability * 0.28)
      + (radiationSuitability * 0.24)
      + (chemistryPotential * 0.14)
    );
    const essentialSuitability = Math.sqrt(
      Math.max(0, temperatureSuitability) * Math.max(0, pressureSuitability)
    );
    const habitabilityScore = clamp01(
      weightedSuitability * essentialSuitability * (belowLethalRadiation ? 1 : 0)
    );

    body.habitabilityScore = habitabilityScore;

    return {
      temp,
      pressure,
      radiationFlux,
      magneticShielding,
      surfaceIntegrity,
      chemistryPotential,
      temperatureSuitability,
      pressureSuitability,
      radiationSuitability,
      habitabilityScore,
      tempNorm,
      pressureNorm,
      radiationNorm,
    };
  }

  updateStability(body, env, dtYears) {
    const cfg = this.config;
    const prev = body.environmentProfile || {
      tempNorm: env.tempNorm,
      pressureNorm: env.pressureNorm,
      radiationNorm: env.radiationNorm,
    };

    const volatility = (
      Math.abs(env.tempNorm - prev.tempNorm)
      + Math.abs(env.pressureNorm - prev.pressureNorm)
      + Math.abs(env.radiationNorm - prev.radiationNorm)
    ) / 3;

    const stabilityTarget = clamp01(1 - (volatility / Math.max(0.01, cfg.stabilityVolatilityScale)));
    const recoveryStep = stepFromYears(dtYears, 2e4 / cfg.stabilityRecoveryRate);
    body.environmentalStability = clamp01(mix(
      body.environmentalStability ?? 0.5,
      stabilityTarget,
      Math.max(recoveryStep, 0.05)
    ));
    body.environmentProfile = {
      tempNorm: env.tempNorm,
      pressureNorm: env.pressureNorm,
      radiationNorm: env.radiationNorm,
    };
  }

  updatePrebioticChemistry(body, env, dtYears) {
    const cfg = this.config;
    const gainStep = stepFromYears(dtYears, 1e5);
    const decayStep = stepFromYears(dtYears, 1.6e5);
    const suitability = env.habitabilityScore * env.chemistryPotential;
    const gain = suitability * body.environmentalStability * cfg.emergence.prebioticGainRate * gainStep;
    const decay = cfg.prebioticDecayRate * decayStep * Math.max(0.15, 1 - suitability);

    body.prebioticChemistry = clamp01((body.prebioticChemistry || 0) + gain - decay);

    if (body.lifeStage === LIFE_STAGES.NONE && body.prebioticChemistry > 0.08) {
      body.lifeStage = LIFE_STAGES.PREBIOTIC;
    }

    if (body.lifeStage === LIFE_STAGES.PREBIOTIC && body.prebioticChemistry < 0.02) {
      body.lifeStage = LIFE_STAGES.NONE;
    }
  }

  tryAbiogenesis(body, env, dtYears, simulationTime) {
    const cfg = this.config;
    const viability = env.habitabilityScore * env.chemistryPotential * body.environmentalStability;
    if (viability < cfg.emergence.minimumSuitability) return;
    if ((body.prebioticChemistry || 0) < cfg.emergence.chemistryThreshold) return;

    const rate = cfg.emergence.abiogenesisBaseRate
      * cfg.lifeRateMultiplier
      * (0.5 + body.prebioticChemistry)
      * (0.65 + viability);

    if (Math.random() >= 1 - Math.exp(-rate * dtYears)) return;

    body.lifeStage = LIFE_STAGES.SIMPLE;
    body.lifeOrigin = body.lifeOrigin || 'Native chemistry';
    body.lastLifeStageChangeTime = simulationTime;
    body.hasLife = true;
    body.biosphereHealth = Math.max(body.biosphereHealth || 0, 0.22);
    body.biodiversity = Math.max(body.biodiversity || 0, 0.08);
    body.complexityScore = Math.max(body.complexityScore || 0, 0.12);
    body.intelligencePotential = body.intelligencePotential || 0;
    body.speciesProfile = this.seedSpeciesProfile(env);
    body.lifeSignature = `adaptive-${Math.random().toString(36).slice(2, 7)}`;

    body.logEvent({
      type: 'abiogenesis',
      message: `A native biosphere emerged on ${body.name}, shaped by local temperature, pressure, and radiation.`,
      severity: 'historic',
    });

    this.queueLifeEvent(body, simulationTime, {
      name: 'Life Emerges',
      title: 'Life Emerges',
      body: `${body.name} developed a native biosphere adapted to its own environment.`,
      severity: 'historic',
    });
  }

  seedSpeciesProfile(env) {
    return {
      temperaturePreference: clamp01(env.tempNorm + randomCentered() * 0.08),
      pressurePreference: clamp01(env.pressureNorm + randomCentered() * 0.08),
      radiationTolerance: clamp01(env.radiationNorm + 0.15 + randomCentered() * 0.08),
      resilience: clamp01(0.45 + Math.random() * 0.25),
      adaptability: clamp01(0.4 + Math.random() * 0.35),
      efficiency: clamp01(0.35 + Math.random() * 0.35),
    };
  }

  runNaturalSelection(body, env, dtYears) {
    const cfg = this.config;
    if (!body.speciesProfile) {
      body.speciesProfile = this.seedSpeciesProfile(env);
    }

    const current = body.speciesProfile;
    const currentFitness = this.computeFitness(current, body, env);
    const mutationPressure = this.computeMutationPressure(body, env);

    let bestProfile = current;
    let bestFitness = currentFitness;
    for (let i = 0; i < cfg.evolution.candidateCount; i++) {
      const candidate = this.mutateProfile(current, mutationPressure);
      const candidateFitness = this.computeFitness(candidate, body, env);
      if (candidateFitness > bestFitness) {
        bestProfile = candidate;
        bestFitness = candidateFitness;
      }
    }

    const selectionStep = stepFromYears(
      dtYears,
      6e4 / Math.max(0.25, cfg.adaptationRateMultiplier * (current.adaptability + 0.2))
    );

    body.speciesProfile = {
      temperaturePreference: mix(current.temperaturePreference, bestProfile.temperaturePreference, selectionStep),
      pressurePreference: mix(current.pressurePreference, bestProfile.pressurePreference, selectionStep),
      radiationTolerance: mix(current.radiationTolerance, bestProfile.radiationTolerance, selectionStep),
      resilience: mix(current.resilience, bestProfile.resilience, selectionStep),
      adaptability: mix(current.adaptability, bestProfile.adaptability, selectionStep),
      efficiency: mix(current.efficiency, bestProfile.efficiency, selectionStep),
    };

    body.mutationPressure = mutationPressure;
    body.biosphereFitness = bestFitness;
  }

  computeMutationPressure(body, env) {
    const cfg = this.config;
    const radiationStress = clamp01(env.radiationFlux / Math.max(1, cfg.environment.lethalRadiationFlux));
    const aberrance = clamp01(body.aberranceProbability || 0);
    return clamp01(
      ((radiationStress * 0.55) + (aberrance * 0.35) + ((body.surfaceDamage || 0) * 0.15))
      * cfg.radiationImpactMultiplier
    );
  }

  mutateProfile(profile, mutationPressure) {
    const cfg = this.config;
    const scale = cfg.evolution.mutationScale * (0.45 + mutationPressure);
    return {
      temperaturePreference: clamp01(profile.temperaturePreference + randomCentered() * scale),
      pressurePreference: clamp01(profile.pressurePreference + randomCentered() * scale),
      radiationTolerance: clamp01(profile.radiationTolerance + randomCentered() * scale),
      resilience: clamp01(profile.resilience + randomCentered() * scale * 0.6),
      adaptability: clamp01(profile.adaptability + randomCentered() * scale * 0.7),
      efficiency: clamp01(profile.efficiency + randomCentered() * scale * 0.6),
    };
  }

  computeFitness(profile, body, env) {
    const thermalFit = 1 - Math.abs(profile.temperaturePreference - env.tempNorm);
    const pressureFit = 1 - Math.abs(profile.pressurePreference - env.pressureNorm);
    const radiationFit = 1 - Math.max(0, env.radiationNorm - profile.radiationTolerance);
    const resilienceBonus = profile.resilience * body.environmentalStability;
    const efficiencyBonus = profile.efficiency * env.chemistryPotential;

    return clamp01(
      (thermalFit * 0.26)
      + (pressureFit * 0.22)
      + (radiationFit * 0.22)
      + (resilienceBonus * 0.16)
      + (efficiencyBonus * 0.14)
    );
  }

  updateBiosphere(body, env, dtYears) {
    const cfg = this.config;
    const mutationBenefit = clamp01(body.mutationPressure * 0.45);
    const mutationOverload = clamp01((body.mutationPressure - 0.55) / 0.45);
    body.extinctionPressure = clamp01(
      (
        ((1 - env.habitabilityScore) * 0.45)
        + ((1 - body.environmentalStability) * 0.25)
        + (mutationOverload * 0.2)
        + ((body.surfaceDamage || 0) * 0.2)
      ) * cfg.extinctionRateMultiplier
    );

    const healthTarget = clamp01(
      (body.biosphereFitness * 0.55)
      + (env.habitabilityScore * 0.2)
      + (body.environmentalStability * 0.2)
      + (mutationBenefit * 0.12)
      - (body.extinctionPressure * 0.5)
    );

    const healthStep = stepFromYears(dtYears, 5e4 / cfg.biosphere.growthRate);
    body.biosphereHealth = clamp01(mix(body.biosphereHealth || 0, healthTarget, Math.max(healthStep, 0.05)));

    const biodiversityTarget = clamp01(
      (body.biosphereHealth * 0.55)
      + (body.biosphereFitness * 0.3)
      + (body.mutationPressure * 0.18)
      - (body.extinctionPressure * 0.25)
    );
    const biodiversityStep = stepFromYears(dtYears, 8e4);
    body.biodiversity = clamp01(mix(body.biodiversity || 0, biodiversityTarget, biodiversityStep));

    const complexityTarget = clamp01(
      (body.biosphereHealth * 0.35)
      + (body.biodiversity * 0.3)
      + (body.biosphereFitness * 0.25)
      + (body.environmentalStability * 0.15)
      - (body.extinctionPressure * 0.2)
    );
    const complexityStep = stepFromYears(dtYears, 1.8e5 / cfg.evolution.complexityGrowth);
    body.complexityScore = clamp01(mix(body.complexityScore || 0, complexityTarget, complexityStep));

    if (body.lifeStage === LIFE_STAGES.COMPLEX || body.lifeStage === LIFE_STAGES.INTELLIGENT) {
      const intelligenceTarget = clamp01(
        (body.complexityScore * 0.45)
        + (body.biodiversity * 0.2)
        + (body.environmentalStability * 0.2)
        + (body.biosphereFitness * 0.15)
      );
      const intelligenceStep = stepFromYears(
        dtYears,
        6e5 / Math.max(0.1, cfg.evolution.intelligenceGrowth * cfg.intelligenceRateMultiplier)
      );
      body.intelligencePotential = clamp01(mix(
        body.intelligencePotential || 0,
        intelligenceTarget,
        intelligenceStep
      ));
    } else {
      body.intelligencePotential = clamp01((body.intelligencePotential || 0) * (1 - stepFromYears(dtYears, 3e5)));
    }

    body.hasLife = true;
  }

  updateStageProgression(body, dtYears, simulationTime) {
    if (body.lifeStage === LIFE_STAGES.SIMPLE
      && body.complexityScore >= this.config.stages.complexThreshold
      && body.biosphereHealth > 0.5
      && body.environmentalStability > 0.45) {
      this.transitionLifeStage(body, LIFE_STAGES.COMPLEX, simulationTime, {
        title: 'Complex Life',
        body: `${body.name} evolved complex ecosystems through long-term natural selection.`,
      });
    }

    if (body.lifeStage === LIFE_STAGES.COMPLEX
      && body.intelligencePotential >= this.config.stages.intelligentThreshold
      && body.biosphereHealth > 0.72
      && body.environmentalStability > 0.55) {
      this.transitionLifeStage(body, LIFE_STAGES.INTELLIGENT, simulationTime, {
        title: 'Intelligence Emerges',
        body: `${body.name} produced an intelligent species shaped by local selection pressures.`,
      });
    }

    if (body.lifeStage === LIFE_STAGES.COMPLEX && body.complexityScore < 0.35 && body.biosphereHealth < 0.35) {
      body.lifeStage = LIFE_STAGES.SIMPLE;
    }

    const prebioticReversion = body.lifeStage !== LIFE_STAGES.NONE && body.biosphereHealth < 0.08;
    if (prebioticReversion) {
      this.transitionLifeStage(body, LIFE_STAGES.PREBIOTIC, simulationTime, {
        title: 'Biosphere Collapse',
        body: `${body.name}'s biosphere collapsed, leaving only prebiotic chemistry behind.`,
        severity: 'major',
      });
      body.hasLife = false;
      body.biodiversity *= 0.2;
      body.complexityScore *= 0.25;
      body.intelligencePotential *= 0.1;
    }

    // Suppress lint noise for future stage-timed balancing.
    void dtYears;
  }

  applyExtinction(body, env, simulationTime) {
    if (env.radiationFlux > this.config.environment.lethalRadiationFlux * 3 || body.extinctionPressure > 0.98) {
      this.transitionLifeStage(body, LIFE_STAGES.NONE, simulationTime, {
        title: 'Mass Extinction',
        body: `${body.name}'s biosphere was eliminated by overwhelming environmental pressure.`,
        severity: 'catastrophic',
      });
      body.hasLife = false;
      body.lifeOrigin = body.lifeOrigin || 'Former native chemistry';
      body.biosphereHealth = 0;
      body.biodiversity = 0;
      body.complexityScore = 0;
      body.intelligencePotential = 0;
      body.speciesProfile = null;
      body.prebioticChemistry = Math.min(body.prebioticChemistry || 0, 0.2);
    }
  }

  transitionLifeStage(body, nextStage, simulationTime, notification) {
    if (body.lifeStage === nextStage) return;
    const previousStage = body.lifeStage;
    body.lifeStage = nextStage;
    body.lastLifeStageChangeTime = simulationTime;
    body.hasLife = ['simple', 'complex', 'intelligent'].includes(nextStage);

    body.logEvent({
      type: 'life_stage',
      message: `${body.name} transitioned from ${previousStage} to ${nextStage}.`,
      severity: notification.severity || 'notable',
    });

    this.queueLifeEvent(body, simulationTime, {
      name: 'Life Evolution',
      title: notification.title,
      body: notification.body,
      severity: notification.severity || 'notable',
    });
  }

  queueLifeEvent(body, simulationTime, notification) {
    this.pendingEvents.push({
      id: `life_${Date.now()}_${Math.random()}`,
      name: notification.name,
      category: 'life',
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

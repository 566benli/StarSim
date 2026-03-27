const BASE_CONFIG = {
  enabled: true,
  lifeRateMultiplier: 1,
  adaptationRateMultiplier: 1,
  extinctionRateMultiplier: 1,
  radiationImpactMultiplier: 1,
  intelligenceRateMultiplier: 1,
  prebioticDecayRate: 0.015,
  stabilityRecoveryRate: 0.025,
  stabilityVolatilityScale: 0.18,
  emergence: {
    abiogenesisBaseRate: 2e-7,
    prebioticGainRate: 0.03,
    minimumSuitability: 0.22,
    chemistryThreshold: 0.45,
  },
  environment: {
    minTemperature: 40,
    maxTemperature: 1400,
    optimalTemperature: 320,
    temperatureSpread: 0.42,
    pressureMidpointAtm: 3,
    pressureLogSpread: 2.4,
    minimumPressureAtm: 0.005,
    idealRadiationFlux: 1.2,
    radiationSpread: 1.35,
    lethalRadiationFlux: 180,
  },
  biosphere: {
    growthRate: 0.03,
    decayRate: 0.04,
    recoveryRate: 0.025,
    resilienceFloor: 0.12,
  },
  evolution: {
    mutationBaseRate: 0.012,
    candidateCount: 4,
    mutationScale: 0.12,
    biodiversityGrowth: 0.02,
    biodiversityDecay: 0.015,
    complexityGrowth: 0.018,
    intelligenceGrowth: 0.004,
  },
  stages: {
    simpleThreshold: 0.18,
    complexThreshold: 0.55,
    intelligentThreshold: 0.9,
  },
};

export const LIFE_CONFIG_PRESETS = {
  realistic: {
    ...BASE_CONFIG,
    lifeRateMultiplier: 0.35,
    adaptationRateMultiplier: 0.7,
    intelligenceRateMultiplier: 0.35,
    emergence: {
      ...BASE_CONFIG.emergence,
      abiogenesisBaseRate: 5e-8,
      prebioticGainRate: 0.018,
      chemistryThreshold: 0.55,
    },
    biosphere: {
      ...BASE_CONFIG.biosphere,
      growthRate: 0.02,
      decayRate: 0.05,
    },
  },
  gameplay: {
    ...BASE_CONFIG,
  },
  chaotic: {
    ...BASE_CONFIG,
    lifeRateMultiplier: 1.5,
    adaptationRateMultiplier: 1.25,
    extinctionRateMultiplier: 1.4,
    radiationImpactMultiplier: 1.5,
    intelligenceRateMultiplier: 1.2,
    emergence: {
      ...BASE_CONFIG.emergence,
      abiogenesisBaseRate: 4e-7,
      prebioticGainRate: 0.05,
      minimumSuitability: 0.18,
    },
    evolution: {
      ...BASE_CONFIG.evolution,
      mutationBaseRate: 0.02,
      mutationScale: 0.18,
    },
  },
};

export const DEFAULT_LIFE_PRESET = 'gameplay';

export function cloneLifeConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

export function getLifeConfig(preset = DEFAULT_LIFE_PRESET) {
  return cloneLifeConfig(LIFE_CONFIG_PRESETS[preset] || LIFE_CONFIG_PRESETS[DEFAULT_LIFE_PRESET]);
}

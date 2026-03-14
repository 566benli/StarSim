/**
 * Random cosmic events that can occur during simulation
 * Each event has a probability, conditions, effects, and visual/audio cues
 */

export const RANDOM_EVENTS = {
  // === Stellar Events ===
  solar_flare: {
    id: 'solar_flare',
    name: 'Solar Flare',
    category: 'stellar',
    severity: 'minor',
    probability: 0.005,  // per simulation year for a sun-like star (reduced)
    description: 'A massive burst of radiation erupts from the star\'s surface!',
    conditions: (body) => body.type === 'star' && body.phase === 'main_sequence',
    effects: {
      luminosityMultiplier: 1.1,
      particleBurst: true,
      duration: 0.001, // years
    },
    visualEffect: 'flare',
    soundEffect: 'solar_flare.wav',
    notification: {
      title: '☀️ Solar Flare Detected!',
      body: 'A powerful burst of energy erupts from {star_name}!',
      color: '#ffaa00',
    },
  },

  coronal_mass_ejection: {
    id: 'coronal_mass_ejection',
    name: 'Coronal Mass Ejection',
    category: 'stellar',
    severity: 'moderate',
    probability: 0.002,
    description: 'A massive cloud of magnetized plasma blasts into space!',
    conditions: (body) => body.type === 'star',
    effects: {
      massLoss: 1e-15, // solar masses
      particleBurst: true,
      affectsNearbyPlanets: true,
      duration: 0.0001,
    },
    visualEffect: 'cme',
    notification: {
      title: '💨 Coronal Mass Ejection!',
      body: '{star_name} hurls a massive cloud of plasma into space!',
      color: '#ff6600',
    },
  },

  supernova: {
    id: 'supernova',
    name: 'Supernova Explosion',
    category: 'stellar',
    severity: 'catastrophic',
    probability: 0, // triggered by evolution, not random
    description: 'The star explodes in a cataclysmic supernova!',
    conditions: (body) => body.type === 'star' && body.mass > 8 && body.phase === 'red_supergiant',
    effects: {
      destroyStar: true,
      createRemnant: true, // neutron star or black hole
      shockwave: true,
      luminosityMultiplier: 1e9,
      duration: 0.01,
    },
    visualEffect: 'supernova',
    notification: {
      title: '💥 SUPERNOVA!',
      body: '{star_name} has gone supernova! An incredible explosion lights up the cosmos!',
      color: '#ff0044',
    },
  },

  nova: {
    id: 'nova',
    name: 'Nova Eruption',
    category: 'stellar',
    severity: 'major',
    probability: 0.001,
    description: 'Accreted material on a white dwarf ignites in a thermonuclear explosion!',
    conditions: (body) => body.type === 'star' && body.phase === 'white_dwarf',
    effects: {
      luminosityMultiplier: 1e5,
      massLoss: 1e-5,
      duration: 0.01,
    },
    visualEffect: 'nova',
    notification: {
      title: '✨ Nova!',
      body: 'A nova eruption brightens {star_name} by 100,000 times!',
      color: '#ffee00',
    },
  },

  // === Planetary Events ===
  asteroid_impact: {
    id: 'asteroid_impact',
    name: 'Asteroid Impact',
    category: 'planetary',
    severity: 'moderate',
    probability: 0.0005,
    description: 'A rogue asteroid slams into the planet!',
    conditions: (body) => body.type === 'planet',
    effects: {
      temperatureChange: 50,
      atmosphereChange: -0.1,
      craterSize: 'random',
      duration: 0.001,
    },
    visualEffect: 'impact',
    notification: {
      title: '☄️ Asteroid Impact!',
      body: 'A large asteroid has struck {planet_name}!',
      color: '#ff8800',
    },
  },

  volcanic_eruption: {
    id: 'volcanic_eruption',
    name: 'Massive Volcanic Eruption',
    category: 'planetary',
    severity: 'moderate',
    probability: 0.001,
    description: 'A supervolcano erupts, changing the atmosphere and climate!',
    conditions: (body) => body.type === 'planet' && body.subtype !== 'gas_giant',
    effects: {
      temperatureChange: 5,
      atmosphereChange: 0.05,
      duration: 0.01,
    },
    visualEffect: 'volcano',
    notification: {
      title: '🌋 Volcanic Eruption!',
      body: 'A massive volcanic eruption reshapes {planet_name}!',
      color: '#ff4400',
    },
  },

  atmosphere_loss: {
    id: 'atmosphere_loss',
    name: 'Atmospheric Stripping',
    category: 'planetary',
    severity: 'major',
    probability: 0.005,
    description: 'Stellar wind strips away part of the atmosphere!',
    conditions: (body) => body.type === 'planet' && body.atmospherePressure > 0.1,
    effects: {
      atmosphereChange: -0.2,
      duration: 1,
    },
    visualEffect: 'atmosphere_strip',
    notification: {
      title: '💨 Atmosphere Stripping!',
      body: 'Powerful stellar winds are stripping {planet_name}\'s atmosphere!',
      color: '#8888ff',
    },
  },

  // === System Events ===
  rogue_object: {
    id: 'rogue_object',
    name: 'Rogue Object Encounter',
    category: 'system',
    severity: 'variable',
    probability: 0.0003,
    description: 'A rogue object enters the system from interstellar space!',
    conditions: () => true,
    effects: {
      spawnObject: true,
      gravitationalPerturbation: true,
      duration: 10,
    },
    visualEffect: 'rogue_entry',
    notification: {
      title: '🌠 Rogue Object Detected!',
      body: 'An interstellar visitor is passing through the system!',
      color: '#00ccff',
    },
  },

  gravitational_wave: {
    id: 'gravitational_wave',
    name: 'Gravitational Wave',
    category: 'system',
    severity: 'minor',
    probability: 0.0002,
    description: 'A distant cosmic event sends gravitational ripples through spacetime!',
    conditions: () => true,
    effects: {
      visualDistortion: true,
      orbitalPerturbation: 0.001,
      duration: 0.0001,
    },
    visualEffect: 'gw_ripple',
    notification: {
      title: '🌊 Gravitational Wave!',
      body: 'Ripples in spacetime pass through the system from a distant cosmic event!',
      color: '#9966ff',
    },
  },

  orbital_resonance: {
    id: 'orbital_resonance',
    name: 'Orbital Resonance Lock',
    category: 'system',
    severity: 'minor',
    probability: 0.01,
    description: 'Two bodies have locked into an orbital resonance!',
    conditions: (body, system) => system && system.bodies.length > 2,
    effects: {
      stabilizeOrbits: true,
      duration: Infinity,
    },
    visualEffect: 'resonance_lines',
    notification: {
      title: '🔗 Orbital Resonance!',
      body: 'Bodies have locked into a gravitational dance!',
      color: '#66ffaa',
    },
  },

  tidal_disruption: {
    id: 'tidal_disruption',
    name: 'Tidal Disruption Event',
    category: 'system',
    severity: 'catastrophic',
    probability: 0.0001,
    description: 'A body is torn apart by tidal forces!',
    conditions: (body) => body.type === 'black_hole',
    effects: {
      destroyNearbyBody: true,
      accretionIncrease: 10,
      luminosityBurst: 1e6,
      duration: 1,
    },
    visualEffect: 'tidal_disruption',
    notification: {
      title: '💀 Tidal Disruption!',
      body: 'A celestial body is being torn apart by immense tidal forces!',
      color: '#ff0000',
    },
  },
};

/**
 * Get applicable events for a body/system state
 */
export function getApplicableEvents(body, system, dt) {
  return Object.values(RANDOM_EVENTS).filter(event => {
    if (event.probability === 0) return false;
    if (!event.conditions(body, system)) return false;
    // Probability check scaled by time step
    return Math.random() < event.probability * dt;
  });
}

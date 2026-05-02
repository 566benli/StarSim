/**
 * CreationPanel - The pre-game setup screen
 * Allows users to choose star/planet types and customize parameters
 * Beautiful, friendly, card-based interface
 */
import React, { useState, useEffect } from 'react';
import { STAR_PRESETS, STAR_CATEGORIES } from '@data/starTypes';
import { PLANET_PRESETS, PLANET_CATEGORIES } from '@data/planetTypes';
import { EXAMPLE_UNIVERSES } from '@data/exampleUniverses';
import { useStore } from '../store';
import ParameterSlider from './ParameterSlider';
import './CreationPanel.css';

const TAG_LABELS = {
  classic: 'Classic',
  dynamics: 'Dynamics',
  exoplanet: 'Exoplanet',
  life: 'Life',
};

const DEFAULT_UNIVERSE_PARAMS = {
  boundaryRadius: 50,
  initialClusters: 1,
  gasH: 0.75,
  gasHe: 0.25,
  starFormRate: 1.0,
  planetFormRate: 1.0,
  lifeEnabled: true,
  lifeDifficulty: 1.0,
  // Cosmology
  omega: 1.0,
  hubbleConstant: 0.07,
  initialTemperature: 2.7,
  initialNebulas: 2,
  initialRogueStars: 0,
};

const COSMOLOGY_PRESETS = [
  {
    id: 'open',
    label: 'Open Universe',
    desc: 'Ω = 0.3 · Expands forever, sparse, many rogue formations',
    omega: 0.3, hubbleConstant: 0.09, initialTemperature: 2.7, initialNebulas: 4,
  },
  {
    id: 'flat',
    label: 'Flat Universe',
    desc: 'Ω = 1.0 · Balanced expansion, default behaviour',
    omega: 1.0, hubbleConstant: 0.07, initialTemperature: 2.7, initialNebulas: 2,
  },
  {
    id: 'closed',
    label: 'Closed Universe',
    desc: 'Ω = 1.5 · Ends in a Big Crunch, dense, rapid enrichment',
    omega: 1.5, hubbleConstant: 0.06, initialTemperature: 2.7, initialNebulas: 1,
  },
];

const CreationPanel = ({ onStartSimulation, onLoadSimulation, onLoadFromSlot, onSaveSimulation, onDeleteSlot, onReplayWelcome, onLaunchExample }) => {
  const {
    creationStep, setCreationStep,
    creationTarget, setCreationTarget,
    creationParams, updateCreationParam,
    createdBodies, addCreatedBody, removeCreatedBody,
    resetCreation,
  } = useStore();

  const [activeTab, setActiveTab] = useState('stars');
  const [customName, setCustomName] = useState('');
  const [saveSlots, setSaveSlots] = useState({});
  const [universeParams, setUniverseParams] = useState({ ...DEFAULT_UNIVERSE_PARAMS });
  const [showUniverseParams, setShowUniverseParams] = useState(false);
  const [creationPhase, setCreationPhase] = useState('main'); // 'main' | 'universe_setup' | 'object_select'

  // Helper functions
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Simulation time is in years (not seconds)
  const formatSimTime = (years) => {
    if (years >= 1e9) return `${(years / 1e9).toFixed(1)} Byr`;
    if (years >= 1e6) return `${(years / 1e6).toFixed(1)} Myr`;
    if (years >= 1e3) return `${(years / 1e3).toFixed(1)} kyr`;
    if (years >= 1) return `${years.toFixed(1)} yr`;
    return `${years.toFixed(2)} yr`;
  };

  // Load save slots on component mount (works for both Electron and web via getSaveSlots)
  useEffect(() => {
    const loadSaveSlots = async () => {
      try {
        const getSlots = window.electronAPI?.getSaveSlots ?? (async () => {
          const { getSaveSlots } = await import('@services/saveService');
          return getSaveSlots();
        });
        const slots = await getSlots();
        setSaveSlots(slots || {});
      } catch (error) {
        console.error('Failed to load save slots:', error);
      }
    };
    loadSaveSlots();
  }, []);

  const allPresets = activeTab === 'stars' ? STAR_PRESETS : PLANET_PRESETS;
  const categories = activeTab === 'stars' ? STAR_CATEGORIES : PLANET_CATEGORIES;

  /**
   * Select a preset to customize
   */
  const selectPreset = (presetId) => {
    if (createdBodies.length >= 1) return;
    const preset = allPresets[presetId];
    const bodyType = activeTab === 'stars' ? 'star' : 'planet';
    setCreationTarget({ ...preset, presetId, bodyType });
    setCreationStep('customize');
    setCustomName(preset.name);
  };

  /**
   * Add the customized body to the creation queue
   * Exactly one object (star, planet, etc.) — then launch; more bodies come from the in-game palette.
   */
  const addToSystem = () => {
    if (createdBodies.length >= 1) return;
    addCreatedBody({
      ...creationTarget,
      name: customName || creationTarget.name,
      params: { ...creationParams },
    });
    resetCreation();
  };

  /**
   * Load a simulation from a specific slot
   */
  const refreshSlots = async () => {
    try {
      const getSlots = window.electronAPI?.getSaveSlots ?? (async () => {
        const { getSaveSlots } = await import('@services/saveService');
        return getSaveSlots();
      });
      const slots = await getSlots();
      setSaveSlots(slots || {});
    } catch (error) {
      console.error('Failed to refresh save slots:', error);
    }
  };

  const loadFromSlot = async (slotId) => {
    const loader = onLoadFromSlot || onLoadSimulation;
    if (!loader) return;

    try {
      const result = await loader(slotId);
      if (result) {
        await refreshSlots();
      }
    } catch (error) {
      console.error('Failed to load from slot:', error);
    }
  };

  const deleteFromSlot = async (slotId) => {
    if (!onDeleteSlot) return;
    if (!confirm(`Delete save slot ${slotId}? This cannot be undone.`)) return;
    try {
      await onDeleteSlot(slotId);
      await refreshSlots();
    } catch (error) {
      console.error('Failed to delete slot:', error);
    }
  };

  /**
   * Randomize all parameters
   */
  const randomize = () => {
    if (!creationTarget) return;
    const preset = creationTarget;
    const params = {};

    // Randomize each tunable parameter
    if (preset.mass) {
      params.mass = preset.mass.min + Math.random() * (preset.mass.max - preset.mass.min);
    }
    if (preset.radius && !preset.radius.computed) {
      params.radius = preset.radius.min + Math.random() * (preset.radius.max - preset.radius.min);
    }
    if (preset.temperature) {
      params.temperature = preset.temperature.min + Math.random() * (preset.temperature.max - preset.temperature.min);
    }
    if (preset.orbitalDistance) {
      params.orbitalDistance = preset.orbitalDistance.min + Math.random() * (preset.orbitalDistance.max - preset.orbitalDistance.min);
    }

    Object.entries(params).forEach(([key, value]) => {
      updateCreationParam(key, value);
    });
  };

  /**
   * Start the simulation with all created bodies
   */
  const startSim = () => {
    if (createdBodies.length !== 1) return;
    onStartSimulation(createdBodies, universeParams);
  };

  // === Universe Setup Phase (Step 1 of 2) ===
  if (creationStep === 'choose_type' && creationPhase === 'universe_setup') {
    return (
      <div className="creation-panel">
        <div className="creation-header">
          <h1 className="creation-title">
            <span className="title-star">✦</span> Universe Setup
          </h1>
          <p className="creation-subtitle">Step 1 of 2: Configure Your Universe</p>
          <p className="creation-hint">
            Set the fundamental parameters of your universe. These affect how galaxies form,
            how quickly stars and planets emerge, and whether life can evolve.
          </p>
        </div>

        <div className="universe-params-grid" style={{ margin: '0 0 16px' }}>
          <div className="uparam-row">
            <label>Universe Radius (Mly)</label>
            <input type="range" min="10" max="200" step="10"
              value={universeParams.boundaryRadius}
              onChange={(e) => setUniverseParams(p => ({ ...p, boundaryRadius: +e.target.value }))} />
            <span className="uparam-val">{universeParams.boundaryRadius}</span>
          </div>
          <div className="uparam-row">
            <label>Initial Galaxies</label>
            <input type="range" min="1" max="5" step="1"
              value={universeParams.initialClusters}
              onChange={(e) => setUniverseParams(p => ({ ...p, initialClusters: +e.target.value }))} />
            <span className="uparam-val">{universeParams.initialClusters}</span>
          </div>
          <div className="uparam-row">
            <label>Hydrogen Abundance</label>
            <input type="range" min="0.5" max="0.9" step="0.01"
              value={universeParams.gasH}
              onChange={(e) => setUniverseParams(p => ({ ...p, gasH: +e.target.value, gasHe: Math.max(0.05, 1 - (+e.target.value)) }))} />
            <span className="uparam-val">{(universeParams.gasH * 100).toFixed(0)}%</span>
          </div>
          <div className="uparam-row">
            <label>Star Formation Rate</label>
            <input type="range" min="0" max="3" step="0.1"
              value={universeParams.starFormRate}
              onChange={(e) => setUniverseParams(p => ({ ...p, starFormRate: +e.target.value }))} />
            <span className="uparam-val">{universeParams.starFormRate.toFixed(1)}x</span>
          </div>
          <div className="uparam-row">
            <label>Planet Formation Rate</label>
            <input type="range" min="0" max="3" step="0.1"
              value={universeParams.planetFormRate}
              onChange={(e) => setUniverseParams(p => ({ ...p, planetFormRate: +e.target.value }))} />
            <span className="uparam-val">{universeParams.planetFormRate.toFixed(1)}x</span>
          </div>
          <div className="uparam-row">
            <label>Life Evolution</label>
            <input type="checkbox" checked={universeParams.lifeEnabled}
              onChange={(e) => setUniverseParams(p => ({ ...p, lifeEnabled: e.target.checked }))} />
            <span className="uparam-val">{universeParams.lifeEnabled ? 'On' : 'Off'}</span>
          </div>
          <div className="uparam-row">
            <label>Life Difficulty</label>
            <input type="range" min="0.1" max="3" step="0.1"
              value={universeParams.lifeDifficulty}
              onChange={(e) => setUniverseParams(p => ({ ...p, lifeDifficulty: +e.target.value }))} />
            <span className="uparam-val">{universeParams.lifeDifficulty.toFixed(1)}x</span>
          </div>
          {/* ── Cosmology section ──────────────────────────────────────── */}
          <div className="uparam-section-title">Cosmology</div>
          <div className="uparam-presets">
            {COSMOLOGY_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                title={p.desc}
                className={`uparam-preset-btn${universeParams.omega === p.omega ? ' active' : ''}`}
                onClick={() => setUniverseParams(prev => ({
                  ...prev,
                  omega: p.omega,
                  hubbleConstant: p.hubbleConstant,
                  initialTemperature: p.initialTemperature,
                  initialNebulas: p.initialNebulas,
                }))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="uparam-row">
            <label>Density Parameter (Ω)</label>
            <input type="range" min="0.05" max="2.5" step="0.05"
              value={universeParams.omega}
              onChange={(e) => setUniverseParams(p => ({ ...p, omega: +e.target.value }))} />
            <span className="uparam-val">{universeParams.omega.toFixed(2)}{universeParams.omega < 1 ? ' (Open)' : universeParams.omega > 1 ? ' (Closed)' : ' (Flat)'}</span>
          </div>
          <div className="uparam-row">
            <label>Expansion Rate (H₀)</label>
            <input type="range" min="0.01" max="0.20" step="0.005"
              value={universeParams.hubbleConstant}
              onChange={(e) => setUniverseParams(p => ({ ...p, hubbleConstant: +e.target.value }))} />
            <span className="uparam-val">{universeParams.hubbleConstant.toFixed(3)} Gyr⁻¹</span>
          </div>
          <div className="uparam-row">
            <label>Initial Temperature (K)</label>
            <input type="range" min="2.7" max="5000" step="10"
              value={universeParams.initialTemperature}
              onChange={(e) => setUniverseParams(p => ({ ...p, initialTemperature: +e.target.value }))} />
            <span className="uparam-val">{universeParams.initialTemperature < 100 ? universeParams.initialTemperature.toFixed(1) : Math.round(universeParams.initialTemperature)} K{universeParams.initialTemperature > 3000 ? ' (Plasma)' : universeParams.initialTemperature > 300 ? ' (Recombination)' : ''}</span>
          </div>

          {/* ── Nebula & seeding section ───────────────────────────────── */}
          <div className="uparam-section-title">Initial Seeding</div>
          <div className="uparam-row">
            <label>Initial Nebulas</label>
            <input type="range" min="0" max="8" step="1"
              value={universeParams.initialNebulas}
              onChange={(e) => setUniverseParams(p => ({ ...p, initialNebulas: +e.target.value }))} />
            <span className="uparam-val">{universeParams.initialNebulas}</span>
          </div>
          <div className="uparam-row">
            <label>Rogue Stars at Start</label>
            <input type="range" min="0" max="10" step="1"
              value={universeParams.initialRogueStars}
              onChange={(e) => setUniverseParams(p => ({ ...p, initialRogueStars: +e.target.value }))} />
            <span className="uparam-val">{universeParams.initialRogueStars}</span>
          </div>

          <button
            type="button"
            className="uparam-reset"
            onClick={() => setUniverseParams({ ...DEFAULT_UNIVERSE_PARAMS })}
          >
            Reset to Defaults
          </button>
        </div>

        <div className="creation-step-buttons">
          <button type="button" className="step-back-btn" onClick={() => setCreationPhase('main')}>
            ← Back
          </button>
          <button type="button" className="step-next-btn" onClick={() => setCreationPhase('object_select')}>
            Next: Choose Starting Object →
          </button>
        </div>
      </div>
    );
  }

  // === Object Selection Phase (Step 2 of 2) ===
  if (creationStep === 'choose_type' && creationPhase === 'object_select') {
    return (
      <div className="creation-panel">
        <div className="creation-header">
          <h1 className="creation-title">
            <span className="title-star">✦</span> Select Starting Object
          </h1>
          <p className="creation-subtitle">Step 2 of 2: Place Your First Object</p>
          <p className="creation-hint">
            Choose a star, planet, or other object to place in your universe. If you pick a planet,
            a primary star is created for it to orbit. After launch, use the <strong>Objects</strong> bar
            to add more bodies.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="tab-switcher">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'stars' ? 'active' : ''}`}
            onClick={() => setActiveTab('stars')}
          >
            ⭐ Stars &amp; Remnants
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'planets' ? 'active' : ''}`}
            onClick={() => setActiveTab('planets')}
          >
            🌍 Planets
          </button>
        </div>

        {categories.map((cat) => (
          <div key={cat.id} className="category-section">
            <h3 className="category-title" style={{ color: cat.color }}>
              {cat.label}
            </h3>
            <p className="category-desc">{cat.description}</p>
            <div className="preset-grid">
              {Object.values(allPresets)
                .filter(p => p.category === cat.id)
                .map(preset => (
                  <button
                    type="button"
                    key={preset.id}
                    className={`preset-card ${createdBodies.length >= 1 ? 'disabled' : ''}`}
                    onClick={() => selectPreset(preset.id)}
                    disabled={createdBodies.length >= 1}
                  >
                    <div className="preset-card-icon">{preset.icon || '⭐'}</div>
                    <div className="preset-card-info">
                      <span className="preset-card-name">{preset.name}</span>
                      <span className="preset-card-desc">{preset.description}</span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        ))}

        {/* Created Bodies Queue — shows after user picks + customizes an object */}
        {createdBodies.length > 0 && (
          <div className="creation-queue">
            <h3>Your starting object</h3>
            <div className="queue-list">
              {createdBodies.map((body, i) => (
                <div key={i} className="queue-item">
                  <span className="queue-icon">{body.icon}</span>
                  <span className="queue-name">{body.name}</span>
                  <button className="queue-remove" onClick={() => removeCreatedBody(i)}>✕</button>
                </div>
              ))}
            </div>
            <button
              className="start-btn"
              onClick={startSim}
              disabled={createdBodies.length !== 1}
            >
              🚀 Launch Simulation
            </button>
          </div>
        )}

        <div className="creation-step-buttons">
          <button type="button" className="step-back-btn" onClick={() => setCreationPhase('universe_setup')}>
            ← Back to Universe Setup
          </button>
        </div>
      </div>
    );
  }

  // === Render: Main Menu ===
  if (creationStep === 'choose_type') {
    return (
      <div className="creation-panel">
        <div className="creation-header">
          <h1 className="creation-title">
            <span className="title-star">✦</span> Genesis Error
          </h1>
          <p className="creation-subtitle">Build Your Universe</p>
          <p className="creation-hint">
            Create a brand new universe with custom parameters, or jump into a pre-built example system.
            You can also load a previously saved universe.
          </p>
          {onReplayWelcome && (
            <p className="creation-hint-actions">
              <button type="button" className="replay-welcome-btn" onClick={onReplayWelcome}>
                Replay welcome tour
              </button>
            </p>
          )}
        </div>

        {/* Create New Universe — 2-step flow */}
        <div className="new-universe-section">
          <button
            type="button"
            className="new-universe-btn"
            onClick={() => setCreationPhase('universe_setup')}
          >
            🌌 Create New Universe
            <span className="new-universe-hint">Configure parameters → choose your starting object</span>
          </button>
        </div>

        {/* Saved Universes Section */}
        <div className="saved-universes-section">
          <h3 className="section-title">🌌 Saved Universes</h3>
          <div className="saved-slots-grid">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(slotId => {
              const slot = saveSlots[slotId] || { exists: false };
              return (
                <div key={slotId} className={`saved-slot-card ${slot.exists ? 'occupied' : 'empty'}`}>
                  <div className="slot-header">
                    <span className="slot-number">Slot {slotId}</span>
                    {slot.exists && (
                      <div className="slot-actions-row">
                        <button
                          type="button"
                          className="slot-load-btn"
                          onClick={() => loadFromSlot(slotId)}
                          title="Load this universe"
                        >
                          🚀 Load
                        </button>
                        {onDeleteSlot && (
                          <button
                            type="button"
                            className="slot-delete-btn"
                            onClick={() => deleteFromSlot(slotId)}
                            title="Delete this save permanently"
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {slot.exists ? (
                    <div className="slot-info">
                      <div className="slot-detail">
                        <span className="label">Bodies:</span>
                        <span className="value">{slot.bodyCount || 0}</span>
                      </div>
                      <div className="slot-detail">
                        <span className="label">Time:</span>
                        <span className="value">{formatSimTime(slot.simTime || 0)}</span>
                      </div>
                      <div className="slot-detail">
                        <span className="label">Saved:</span>
                        <span className="value">{formatDate(slot.savedAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="slot-empty">
                      <span>No Universe Saved</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Save/Load Section */}
        <div className="save-load-section">
          <button
            className="save-load-btn save-btn"
            onClick={() => onSaveSimulation?.()}
            title="Save Current Setup"
            style={{ background: 'linear-gradient(135deg, rgba(68, 255, 136, 0.3), rgba(68, 136, 255, 0.3))', borderColor: 'var(--accent-green)' }}
          >
            💾 Save Universe
          </button>
          <button
            className="save-load-btn load-btn"
            onClick={onLoadSimulation}
            title="Load Saved Simulation"
          >
            📁 Load Saved Universe
          </button>
          <div className="section-spacer"></div>
        </div>

        {/* Example Systems */}
        {onLaunchExample && (
          <div className="example-systems-section">
            <h3 className="section-title">🚀 Example Systems</h3>
            <p className="example-systems-hint">
              Jump straight into a pre-built planetary system. Each one is fully editable after launch.
            </p>
            <div className="example-grid">
              {EXAMPLE_UNIVERSES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="example-card"
                  onClick={() => onLaunchExample(ex.seed)}
                >
                  <span className="example-card-icon">{ex.icon}</span>
                  <div className="example-card-body">
                    <span className="example-card-title">{ex.title}</span>
                    <span className="example-card-blurb">{ex.blurb}</span>
                  </div>
                  {ex.tag && (
                    <span className={`example-card-tag tag-${ex.tag}`}>
                      {TAG_LABELS[ex.tag] || ex.tag}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Created Bodies Queue (from step 2 flow) */}
        {createdBodies.length > 0 && (
          <div className="creation-queue">
            <h3>Your first object (launch when ready)</h3>
            <div className="queue-list">
              {createdBodies.map((body, i) => (
                <div key={i} className="queue-item">
                  <span className="queue-icon">{body.icon}</span>
                  <span className="queue-name">{body.name}</span>
                  <button className="queue-remove" onClick={() => removeCreatedBody(i)}>✕</button>
                </div>
              ))}
            </div>
            <button
              className="start-btn"
              onClick={startSim}
              disabled={createdBodies.length !== 1}
            >
              🚀 Launch Simulation
            </button>
          </div>
        )}
      </div>
    );
  }

  // === Render: Customization ===
  if (creationStep === 'customize' && creationTarget) {
    const preset = creationTarget;
    const handleBackFromCustomize = () => {
      resetCreation();
    };
    return (
      <div className="creation-panel customize-panel">
        <button className="back-btn" onClick={handleBackFromCustomize}>← Back</button>

        <div className="customize-header">
          <div className="customize-icon">{preset.icon}</div>
          <div>
            <input
              className="name-input"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Name your creation..."
            />
            <p className="customize-desc">{preset.description}</p>
          </div>
        </div>

        <div className="customize-fact">{preset.funFact}</div>

        <div className="parameter-section">
          <h3>Tune Parameters</h3>
          <button className="randomize-btn" onClick={randomize}>🎲 Randomize</button>

          {/* Mass */}
          {preset.mass && (
            <ParameterSlider
              label="Mass"
              unit={preset.mass.unit}
              min={preset.mass.min}
              max={preset.mass.max}
              value={creationParams.mass ?? preset.mass.default}
              onChange={(v) => updateCreationParam('mass', v)}
              description="How massive this body is"
              logarithmic={preset.mass.max / preset.mass.min > 100}
            />
          )}

          {/* Radius */}
          {preset.radius && !preset.radius.computed && (
            <ParameterSlider
              label="Radius"
              unit={preset.radius.unit}
              min={preset.radius.min}
              max={preset.radius.max}
              value={creationParams.radius ?? preset.radius.default}
              onChange={(v) => updateCreationParam('radius', v)}
              description="Physical size"
              logarithmic={preset.radius.max / preset.radius.min > 100}
            />
          )}

          {/* Temperature */}
          {preset.temperature && preset.temperature.max > 0 && (
            <ParameterSlider
              label="Temperature"
              unit={preset.temperature.unit}
              min={preset.temperature.min}
              max={preset.temperature.max}
              value={creationParams.temperature ?? preset.temperature.default}
              onChange={(v) => updateCreationParam('temperature', v)}
              description="Surface temperature"
            />
          )}

          {/* Luminosity */}
          {preset.luminosity && preset.luminosity.max > 0 && (
            <ParameterSlider
              label="Luminosity"
              unit={preset.luminosity.unit}
              min={preset.luminosity.min}
              max={preset.luminosity.max}
              value={creationParams.luminosity ?? preset.luminosity.default}
              onChange={(v) => updateCreationParam('luminosity', v)}
              description="Brightness relative to the Sun"
              logarithmic
            />
          )}

          {/* Orbital Distance (planets) */}
          {preset.orbitalDistance && preset.orbitalDistance.max > 0 && (
            <ParameterSlider
              label="Orbital Distance"
              unit={preset.orbitalDistance.unit}
              min={preset.orbitalDistance.min}
              max={preset.orbitalDistance.max}
              value={creationParams.orbitalDistance ?? preset.orbitalDistance.default}
              onChange={(v) => updateCreationParam('orbitalDistance', v)}
              description="Distance from parent star"
              logarithmic={preset.orbitalDistance.max / preset.orbitalDistance.min > 20}
            />
          )}

          {/* Eccentricity */}
          {preset.eccentricity !== undefined && typeof preset.eccentricity === 'object' && (
            <ParameterSlider
              label="Eccentricity"
              unit=""
              min={preset.eccentricity.min}
              max={preset.eccentricity.max}
              value={creationParams.eccentricity ?? preset.eccentricity.default}
              onChange={(v) => updateCreationParam('eccentricity', v)}
              description="How elliptical the orbit is (0 = circular)"
            />
          )}

          {/* Atmosphere (planets) */}
          {preset.atmosphere && (
            <ParameterSlider
              label="Atmosphere"
              unit={preset.atmosphere.unit}
              min={preset.atmosphere.min}
              max={preset.atmosphere.max}
              value={creationParams.atmosphere ?? preset.atmosphere.default}
              onChange={(v) => updateCreationParam('atmosphere', v)}
              description="Atmospheric pressure"
              logarithmic={preset.atmosphere.max / preset.atmosphere.min > 100}
            />
          )}

          {/* Spin (black holes) */}
          {preset.spin && (
            <ParameterSlider
              label="Spin"
              unit={preset.spin.unit}
              min={preset.spin.min}
              max={preset.spin.max}
              value={creationParams.spin ?? preset.spin.default}
              onChange={(v) => updateCreationParam('spin', v)}
              description="Rotation parameter (0 = not spinning)"
            />
          )}

          {/* Accretion Rate (black holes) */}
          {preset.accretionRate && (
            <ParameterSlider
              label="Accretion Rate"
              unit={preset.accretionRate.unit}
              min={preset.accretionRate.min}
              max={preset.accretionRate.max}
              value={creationParams.accretionRate ?? preset.accretionRate.default}
              onChange={(v) => updateCreationParam('accretionRate', v)}
              description="How fast it's consuming matter"
            />
          )}
        </div>

        <button
          className="add-to-system-btn"
          onClick={addToSystem}
          disabled={createdBodies.length >= 1}
        >
          ✨ Add to system (first object only)
        </button>
        {createdBodies.length >= 1 && (
          <p className="creation-hint small">Remove it above to pick another, or launch and use the top palette for more.</p>
        )}
      </div>
    );
  }

  return null;
};

export default CreationPanel;

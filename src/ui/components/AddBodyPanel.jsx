/**
 * AddBodyPanel - Compact floating panel to add new celestial bodies mid-simulation
 * Users can choose a preset, name it, adjust key parameters, and drop it in
 */
import React, { useState, useCallback } from 'react';
import { STAR_PRESETS, STAR_CATEGORIES } from '@data/starTypes';
import { PLANET_PRESETS, PLANET_CATEGORIES } from '@data/planetTypes';
import './AddBodyPanel.css';

const QUICK_PRESETS = {
  stars: [
    { id: 'red_dwarf', icon: '🔴', label: 'Red Dwarf' },
    { id: 'sun_like', icon: '☀️', label: 'Sun-like' },
    { id: 'blue_giant', icon: '🔵', label: 'Blue Giant' },
    { id: 'red_giant', icon: '🟠', label: 'Red Giant' },
    { id: 'white_dwarf', icon: '⚪', label: 'White Dwarf' },
    { id: 'neutron_star', icon: '💫', label: 'Neutron Star' },
    { id: 'black_hole', icon: '⚫', label: 'Black Hole' },
  ],
  planets: [
    { id: 'rocky_small', icon: '🪨', label: 'Rocky' },
    { id: 'earth_like', icon: '🌍', label: 'Earth-like' },
    { id: 'super_earth', icon: '🌐', label: 'Super-Earth' },
    { id: 'gas_giant', icon: '🟤', label: 'Gas Giant' },
    { id: 'ice_giant', icon: '🧊', label: 'Ice Giant' },
    { id: 'hot_jupiter', icon: '🔥', label: 'Hot Jupiter' },
    { id: 'lava_world', icon: '🌋', label: 'Lava World' },
  ],
};

const AddBodyPanel = ({ onAddBody, onClose, getBodies }) => {
  const [tab, setTab] = useState('stars');         // 'stars' or 'planets'
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [name, setName] = useState('');
  const [distance, setDistance] = useState(5);       // AU from center
  const [orbitalDist, setOrbitalDist] = useState(1); // for planets
  const [referenceId, setReferenceId] = useState('com'); // 'com' or star id

  const handleSelectPreset = useCallback((preset) => {
    setSelectedPreset(preset);
    // Pre-fill name with the default + a random suffix
    const presetData = tab === 'stars'
      ? STAR_PRESETS[preset.id]
      : PLANET_PRESETS[preset.id];
    const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
    setName(presetData ? `${presetData.name} ${suffix}` : `${preset.label} ${suffix}`);
  }, [tab]);

  const handleAdd = useCallback(() => {
    if (!selectedPreset) return;

    const bodyType = tab === 'stars' ? 'star' : 'planet';
    const presetData = tab === 'stars'
      ? STAR_PRESETS[selectedPreset.id]
      : PLANET_PRESETS[selectedPreset.id];

    const config = {
      bodyType,
      presetId: selectedPreset.id,
      name: name || presetData?.name || selectedPreset.label,
      distance: bodyType === 'star' ? distance : undefined,
      orbitalDistance: bodyType === 'planet' ? orbitalDist : undefined,
      referenceId: referenceId === 'com' ? null : referenceId,
    };

    onAddBody(config);

    // Reset for next add (keep panel open for rapid creation)
    setSelectedPreset(null);
    setName('');
  }, [selectedPreset, name, distance, orbitalDist, referenceId, tab, onAddBody]);

  const presets = QUICK_PRESETS[tab];
  const stars = (getBodies?.() ?? []).filter(b => b.alive && b.type === 'star');

  return (
    <div className="add-body-panel">
      <div className="add-panel-header">
        <h3 className="add-panel-title">Add Celestial Body</h3>
        <button className="add-panel-close" onClick={onClose}>✕</button>
      </div>

      {/* Tab selector */}
      <div className="add-tab-bar">
        <button
          className={`add-tab ${tab === 'stars' ? 'active' : ''}`}
          onClick={() => { setTab('stars'); setSelectedPreset(null); }}
        >
          ⭐ Stars
        </button>
        <button
          className={`add-tab ${tab === 'planets' ? 'active' : ''}`}
          onClick={() => { setTab('planets'); setSelectedPreset(null); }}
        >
          🌍 Planets
        </button>
      </div>

      {/* Quick preset grid */}
      <div className="add-preset-grid">
        {presets.map((p) => (
          <button
            key={p.id}
            className={`add-preset-btn ${selectedPreset?.id === p.id ? 'selected' : ''}`}
            onClick={() => handleSelectPreset(p)}
          >
            <span className="preset-icon">{p.icon}</span>
            <span className="preset-name">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Configuration area (visible when preset selected) */}
      {selectedPreset && (
        <div className="add-config">
          {/* Name input */}
          <div className="add-field">
            <label className="add-label">Name</label>
            <input
              className="add-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this body..."
              autoFocus
            />
          </div>

          {/* Distance slider for stars */}
          {tab === 'stars' && (
            <>
              <div className="add-field">
                <label className="add-label">Distance from</label>
                <select
                  className="add-select"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                >
                  <option value="com">Center of mass</option>
                  {stars.map((s) => (
                    <option key={s.id} value={s.id}>⭐ {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="add-field">
                <label className="add-label">
                  Distance: <span className="add-value">{distance.toFixed(1)} AU</span>
                </label>
                <input
                  className="add-slider"
                  type="range"
                  min="0"
                  max="50"
                  step="0.5"
                  value={distance}
                  onChange={(e) => setDistance(parseFloat(e.target.value))}
                />
              </div>
            </>
          )}

          {/* Orbital distance for planets */}
          {tab === 'planets' && (
            <>
              <div className="add-field">
                <label className="add-label">Orbit around</label>
                <select
                  className="add-select"
                  value={stars.some(s => s.id === referenceId) ? referenceId : (stars[0]?.id ?? 'com')}
                  onChange={(e) => setReferenceId(e.target.value)}
                >
                  {stars.map((s) => (
                    <option key={s.id} value={s.id}>⭐ {s.name}</option>
                  ))}
                </select>
              </div>
              <div className="add-field">
                <label className="add-label">
                  Orbital Distance: <span className="add-value">{orbitalDist.toFixed(1)} AU</span>
                </label>
                <input
                  className="add-slider"
                  type="range"
                  min="0.1"
                  max="30"
                  step="0.1"
                  value={orbitalDist}
                  onChange={(e) => setOrbitalDist(parseFloat(e.target.value))}
                />
              </div>
            </>
          )}

          {/* Add button */}
          <button
            className="add-confirm-btn"
            onClick={handleAdd}
            disabled={tab === 'planets' && stars.length === 0}
          >
            ✨ Drop into Simulation
          </button>
        </div>
      )}

      <div className="add-hint">
        Tip: Choose which star to orbit or place distance from. N-body gravity handles multi-star influence.
      </div>
    </div>
  );
};

export default AddBodyPanel;

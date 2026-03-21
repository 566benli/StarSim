/**
 * ObjectPalette - Universe Sandbox-style top panel for dragging objects into the simulation.
 * Users select a type, customize parameters, then drop it into the universe.
 */
import React, { useState, useCallback, useRef } from 'react';
import { useStore } from '../store';
import { STAR_PRESETS } from '@data/starTypes';
import { PLANET_PRESETS } from '@data/planetTypes';
import { ELEMENTS, getDefaultComposition, STELLAR_COMPOSITIONS, PLANETARY_COMPOSITIONS } from '@data/elements';
import './ObjectPalette.css';

const STAR_ICONS = {
  red_dwarf: { icon: '\u2B50', color: '#ff6644' },
  sun_like: { icon: '\u2600', color: '#ffcc44' },
  blue_giant: { icon: '\u2B50', color: '#4488ff' },
  red_giant: { icon: '\uD83D\uDD34', color: '#ff4400' },
  red_supergiant: { icon: '\uD83D\uDFE4', color: '#cc2200' },
  white_dwarf: { icon: '\u26AA', color: '#ccddff' },
  neutron_star: { icon: '\uD83D\uDCAB', color: '#bb88ff' },
  black_hole: { icon: '\u26AB', color: '#444' },
  supermassive_black_hole: { icon: '\u26AB', color: '#222' },
};

const PLANET_ICONS = {
  rocky_small: { icon: '\uD83C\uDF11', color: '#888' },
  earth_like: { icon: '\uD83C\uDF0D', color: '#4488cc' },
  super_earth: { icon: '\uD83C\uDF0E', color: '#44aa88' },
  gas_giant: { icon: '\uD83E\uDE90', color: '#cc8844' },
  ice_giant: { icon: '\u2744', color: '#66aadd' },
  hot_jupiter: { icon: '\uD83D\uDD25', color: '#ff6622' },
  lava_world: { icon: '\uD83C\uDF0B', color: '#ff4400' },
  rogue_planet: { icon: '\uD83C\uDF11', color: '#556' },
};

const ObjectPalette = ({ onDragStart, onAddBody, viewLevel }) => {
  const [tab, setTab] = useState('stars');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [editParams, setEditParams] = useState({});
  const [editComposition, setEditComposition] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const draggingRef = useRef(false);
  const { setDraggingObject } = useStore();

  const handlePresetClick = useCallback((presetId, type) => {
    if (selectedPreset === presetId) {
      setSelectedPreset(null);
      setEditParams({});
      setEditComposition(null);
      return;
    }
    setSelectedPreset(presetId);
    const preset = type === 'star' ? STAR_PRESETS[presetId] : PLANET_PRESETS[presetId];
    setEditParams({
      name: preset.name,
      mass: preset.mass.default,
      radius: preset.radius?.default,
      temperature: preset.temperature?.default,
    });
    const phaseMap = { red_giant: 'red_giant', red_supergiant: 'red_supergiant', white_dwarf: 'white_dwarf', neutron_star: 'neutron_star', black_hole: 'black_hole', supermassive_black_hole: 'black_hole' };
    const defComp = type === 'star'
      ? { ...getDefaultComposition('star', presetId, phaseMap[presetId] || 'main_sequence') }
      : { ...(PLANETARY_COMPOSITIONS[presetId] || PLANETARY_COMPOSITIONS.earth_like) };
    setEditComposition(defComp);
  }, [selectedPreset]);

  const handleDragStartInternal = useCallback((e, presetId, type) => {
    draggingRef.current = true;
    const preset = type === 'star' ? STAR_PRESETS[presetId] : PLANET_PRESETS[presetId];
    const params = { ...editParams };
    if (editComposition) params.composition = { ...editComposition };
    const dragData = {
      presetId,
      bodyType: type,
      name: editParams.name || preset.name,
      params,
    };
    setDraggingObject(dragData);
    if (onDragStart) onDragStart(dragData);

    // Set drag image
    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
  }, [editParams, editComposition, setDraggingObject, onDragStart]);

  const handleQuickAdd = useCallback((presetId, type) => {
    const preset = type === 'star' ? STAR_PRESETS[presetId] : PLANET_PRESETS[presetId];
    if (onAddBody) {
      const params = selectedPreset === presetId ? { ...editParams } : {};
      if (editComposition) params.composition = { ...editComposition };
      onAddBody({
        presetId,
        bodyType: type,
        name: selectedPreset === presetId ? (editParams.name || preset.name) : preset.name,
        params,
      });
    }
  }, [onAddBody, selectedPreset, editParams, editComposition]);

  const updateParam = useCallback((key, value) => {
    setEditParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const randomizePaletteParams = useCallback(() => {
    if (!selectedPreset) return;
    const preset = tab === 'stars' ? STAR_PRESETS[selectedPreset] : PLANET_PRESETS[selectedPreset];
    if (!preset) return;
    setEditParams((prev) => {
      const next = { ...prev, name: prev.name || preset.name };
      if (preset.mass) {
        next.mass = preset.mass.min + Math.random() * (preset.mass.max - preset.mass.min);
      }
      if (preset.temperature) {
        next.temperature = preset.temperature.min + Math.random() * (preset.temperature.max - preset.temperature.min);
      }
      if (preset.radius && !preset.radius.computed) {
        next.radius = preset.radius.min + Math.random() * (preset.radius.max - preset.radius.min);
      }
      if (preset.luminosity) {
        next.luminosity = preset.luminosity.min + Math.random() * (preset.luminosity.max - preset.luminosity.min);
      }
      if (tab === 'planets' && preset.orbitalDistance) {
        next.orbitalDistance = preset.orbitalDistance.min
          + Math.random() * (preset.orbitalDistance.max - preset.orbitalDistance.min);
      }
      return next;
    });
  }, [selectedPreset, tab]);

  const updateComposition = useCallback((element, value) => {
    setEditComposition(prev => {
      const next = { ...(prev || {}) };
      const v = Math.max(0, Math.min(1, parseFloat(value) || 0));
      if (v <= 0) delete next[element];
      else next[element] = v;
      const total = Object.values(next).reduce((s, x) => s + x, 0);
      if (total > 0 && Math.abs(total - 1) > 1e-6) {
        for (const k of Object.keys(next)) next[k] /= total;
      }
      return next;
    });
  }, []);

  if (!expanded) {
    return (
      <div className="object-palette collapsed" onClick={() => setExpanded(true)}>
        <span className="palette-expand-icon">+</span>
        <span>Objects</span>
      </div>
    );
  }

  const starPresets = Object.entries(STAR_PRESETS);
  const planetPresets = Object.entries(PLANET_PRESETS);
  const currentPreset = selectedPreset
    ? (tab === 'stars' ? STAR_PRESETS[selectedPreset] : PLANET_PRESETS[selectedPreset])
    : null;

  return (
    <div className="object-palette">
      <div className="palette-header">
        <div className="palette-tabs">
          <button
            className={`palette-tab ${tab === 'stars' ? 'active' : ''}`}
            onClick={() => { setTab('stars'); setSelectedPreset(null); }}
          >
            Stars
          </button>
          <button
            className={`palette-tab ${tab === 'planets' ? 'active' : ''}`}
            onClick={() => { setTab('planets'); setSelectedPreset(null); }}
          >
            Planets
          </button>
        </div>
        <button className="palette-collapse" onClick={() => setExpanded(false)} title="Collapse">
          _
        </button>
      </div>

      <div className="palette-items">
        {tab === 'stars' && starPresets.map(([id, preset]) => {
          const info = STAR_ICONS[id] || { icon: '\u2B50', color: '#ccc' };
          const isSelected = selectedPreset === id;
          return (
            <div
              key={id}
              className={`palette-item ${isSelected ? 'selected' : ''}`}
              draggable
              onDragStart={(e) => handleDragStartInternal(e, id, 'star')}
              onClick={() => handlePresetClick(id, 'star')}
              onDoubleClick={() => handleQuickAdd(id, 'star')}
              title={`${preset.name} - Drag to place, double-click to add\n${preset.description || ''}`}
            >
              <span className="palette-item-icon" style={{ color: info.color }}>
                {info.icon}
              </span>
              <span className="palette-item-name">{preset.name}</span>
              <span className="palette-item-mass">{preset.mass.default} M\u2609</span>
            </div>
          );
        })}

        {tab === 'planets' && planetPresets.map(([id, preset]) => {
          const info = PLANET_ICONS[id] || { icon: '\uD83C\uDF0D', color: '#888' };
          const isSelected = selectedPreset === id;
          return (
            <div
              key={id}
              className={`palette-item ${isSelected ? 'selected' : ''}`}
              draggable
              onDragStart={(e) => handleDragStartInternal(e, id, 'planet')}
              onClick={() => handlePresetClick(id, 'planet')}
              onDoubleClick={() => handleQuickAdd(id, 'planet')}
              title={`${preset.name} - Drag to place, double-click to add\n${preset.description || ''}`}
            >
              <span className="palette-item-icon" style={{ color: info.color }}>
                {info.icon}
              </span>
              <span className="palette-item-name">{preset.name}</span>
              <span className="palette-item-mass">
                {preset.mass.default} M{'\u2295'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Parameter Editor */}
      {selectedPreset && currentPreset && (
        <div className="palette-editor">
          <div className="editor-title-row">
            <h4 className="editor-title">Customize: {editParams.name || currentPreset.name}</h4>
            <button
              type="button"
              className="palette-randomize-btn"
              onClick={randomizePaletteParams}
              title="Randomize mass, temperature, and (for planets) orbital distance within preset ranges"
            >
              🎲 Randomize
            </button>
          </div>

          <div className="editor-field">
            <label>Name</label>
            <input
              type="text"
              value={editParams.name || ''}
              onChange={(e) => updateParam('name', e.target.value)}
            />
          </div>

          <div className="editor-field">
            <label>Mass ({tab === 'stars' ? 'M\u2609' : 'M\u2295'})</label>
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={editParams.mass ?? currentPreset.mass.default}
              onChange={(e) => updateParam('mass', parseFloat(e.target.value) || 0.1)}
            />
            <input
              type="range"
              min={currentPreset.mass.min}
              max={currentPreset.mass.max}
              step={(currentPreset.mass.max - currentPreset.mass.min) / 100}
              value={editParams.mass ?? currentPreset.mass.default}
              onChange={(e) => updateParam('mass', parseFloat(e.target.value))}
            />
          </div>

          {currentPreset.temperature && (
            <div className="editor-field">
              <label>Temperature (K)</label>
              <input
                type="number"
                step="100"
                min="100"
                value={editParams.temperature ?? currentPreset.temperature.default}
                onChange={(e) => updateParam('temperature', parseInt(e.target.value) || 3000)}
              />
            </div>
          )}

          {tab === 'planets' && currentPreset.orbitalDistance && (
            <div className="editor-field">
              <label>Orbital Distance (AU)</label>
              <input
                type="number"
                step="0.1"
                min="0.01"
                value={editParams.orbitalDistance ?? currentPreset.orbitalDistance.default}
                onChange={(e) => updateParam('orbitalDistance', parseFloat(e.target.value) || 1)}
              />
            </div>
          )}

          {/* Editable composition (Universe Sandbox style) */}
          <div className="editor-composition">
            <label>Element Composition (%) — adjust before placing</label>
            <div className="composition-bar">
              {Object.entries(editComposition || {}).map(([el, frac]) => (
                <div
                  key={el}
                  className="composition-segment"
                  style={{
                    width: `${Math.max(frac * 100, 2)}%`,
                    background: ELEMENTS[el]?.color || '#666',
                  }}
                  title={`${el}: ${(frac * 100).toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="composition-sliders">
              {Object.keys(ELEMENTS).slice(0, 10).map(el => (
                <div key={el} className="composition-row">
                  <span className="comp-dot" style={{ background: ELEMENTS[el]?.color || '#666' }} />
                  <span className="comp-symbol">{el}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={((editComposition?.[el] || 0) * 100).toFixed(1)}
                    onChange={(e) => updateComposition(el, parseFloat(e.target.value) / 100)}
                  />
                  <span className="comp-pct">%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="editor-actions">
            <button
              className="editor-btn primary"
              onClick={() => handleQuickAdd(selectedPreset, tab === 'stars' ? 'star' : 'planet')}
            >
              + Place in Simulation
            </button>
          </div>
        </div>
      )}

      <div className="palette-hint">
        Drag an object into the simulation or double-click to place
      </div>
    </div>
  );
};

export default ObjectPalette;

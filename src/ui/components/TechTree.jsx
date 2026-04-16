/**
 * TechTree — Inline technology tree panel shown for planets with a civilization.
 * Collapsible from InfoPanel, shows all 6 tech categories with unlocked/available/locked state.
 */
import React, { useState, useMemo } from 'react';
import { TECH_TREE, TECH_CATEGORIES, TECH_BY_ID, KARDASHEV_LEVELS, CIV_STAGES, getAvailableTechs } from '@data/techTree.js';
import './TechTree.css';

const TIER_LABEL = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

function TechNode({ tech, state, onClick }) {
  // state: 'unlocked' | 'available' | 'locked'
  return (
    <button
      className={`tech-node tech-node--${state}`}
      onClick={() => onClick && onClick(tech)}
      title={tech.description}
      disabled={state === 'locked'}
    >
      <span className="tech-node-icon">{tech.icon}</span>
      <span className="tech-node-label">{tech.label}</span>
      <span className="tech-node-tier">T{TIER_LABEL[tech.tier]}</span>
      {state === 'unlocked' && <span className="tech-node-check">✓</span>}
    </button>
  );
}

function CategoryColumn({ catId, techs, unlockedSet, availableSet, onSelectTech }) {
  const cat = TECH_CATEGORIES[catId];
  const catTechs = techs.filter(t => t.category === catId).sort((a, b) => a.tier - b.tier);
  return (
    <div className="tech-category">
      <div className="tech-category-header">
        <span>{cat.icon}</span>
        <span>{cat.label}</span>
      </div>
      <div className="tech-category-nodes">
        {catTechs.map(tech => (
          <TechNode
            key={tech.id}
            tech={tech}
            state={unlockedSet.has(tech.id) ? 'unlocked' : availableSet.has(tech.id) ? 'available' : 'locked'}
            onClick={onSelectTech}
          />
        ))}
      </div>
    </div>
  );
}

export default function TechTree({ civilization, onClose }) {
  const [selectedTech, setSelectedTech] = useState(null);
  const [filterCat, setFilterCat] = useState(null);

  const unlockedSet = useMemo(
    () => new Set(civilization?.unlockedTechs ?? []),
    [civilization]
  );

  const availableTechs = useMemo(
    () => getAvailableTechs(civilization?.unlockedTechs ?? []),
    [civilization]
  );
  const availableSet = useMemo(() => new Set(availableTechs.map(t => t.id)), [availableTechs]);

  const civ = civilization;
  if (!civ) return null;

  const kLevel = civ.kardashevLevel ?? 0;
  const kInfo  = KARDASHEV_LEVELS[kLevel];
  const stageInfo = CIV_STAGES[civ.stage] ?? {};

  const displayCats = filterCat ? [filterCat] : Object.keys(TECH_CATEGORIES);

  return (
    <div className="tech-tree-inline">
      {/* Header */}
      <div className="tech-tree-header">
        <span className="tech-tree-title">🔬 Technology Tree</span>
        <span className="tech-tree-civ-name">{civ.name}</span>
        {onClose && <button className="tech-tree-close" onClick={onClose}>✕</button>}
      </div>

      {/* Kardashev + stage summary */}
      <div className="tech-tree-summary">
        <div className="tech-tree-kardashev" style={{ borderColor: kInfo.color, color: kInfo.color }}>
          <span className="tech-kd-label">Kardashev</span>
          <span className="tech-kd-value">Type {kLevel}</span>
          <span className="tech-kd-desc">{kInfo.label}</span>
        </div>
        <div className="tech-tree-stage-info">
          <span className="tech-stage-icon">{stageInfo.icon}</span>
          <span className="tech-stage-label">{stageInfo.label}</span>
        </div>
        <div className="tech-tree-pts">
          <span className="tech-pts-label">Tech Pts</span>
          <span className="tech-pts-value">{Math.round(civ.techPoints ?? 0).toLocaleString()}</span>
        </div>
        <div className="tech-tree-pop">
          <span className="tech-pop-label">Population</span>
          <span className="tech-pop-value">{civ.population < 1
            ? `${(civ.population * 1000).toFixed(0)}M`
            : `${civ.population.toFixed(1)}B`}</span>
        </div>
      </div>

      {/* Unlocked / Available counts */}
      <div className="tech-tree-progress">
        <span className="tech-progress-unlocked">{unlockedSet.size} unlocked</span>
        <div className="tech-progress-bar">
          <div className="tech-progress-fill"
            style={{ width: `${(unlockedSet.size / TECH_TREE.length) * 100}%`,
                     background: kInfo.color }} />
        </div>
        <span className="tech-progress-total">/ {TECH_TREE.length}</span>
      </div>

      {/* Category filter tabs */}
      <div className="tech-cat-tabs">
        <button
          className={`tech-cat-tab ${!filterCat ? 'active' : ''}`}
          onClick={() => setFilterCat(null)}
        >All</button>
        {Object.values(TECH_CATEGORIES).map(cat => (
          <button
            key={cat.id}
            className={`tech-cat-tab ${filterCat === cat.id ? 'active' : ''}`}
            onClick={() => setFilterCat(filterCat === cat.id ? null : cat.id)}
          >
            {cat.icon}
          </button>
        ))}
      </div>

      {/* Tech columns */}
      <div className="tech-tree-grid">
        {displayCats.map(catId => (
          <CategoryColumn
            key={catId}
            catId={catId}
            techs={TECH_TREE}
            unlockedSet={unlockedSet}
            availableSet={availableSet}
            onSelectTech={setSelectedTech}
          />
        ))}
      </div>

      {/* Tech detail panel */}
      {selectedTech && (
        <div className="tech-detail-panel">
          <div className="tech-detail-header">
            <span>{selectedTech.icon}</span>
            <span className="tech-detail-name">{selectedTech.label}</span>
            <span className={`tech-detail-status ${
              unlockedSet.has(selectedTech.id) ? 'status-unlocked' :
              availableSet.has(selectedTech.id) ? 'status-available' : 'status-locked'
            }`}>
              {unlockedSet.has(selectedTech.id) ? '✓ Unlocked' :
               availableSet.has(selectedTech.id) ? '⏳ Available' : '🔒 Locked'}
            </span>
            <button className="tech-detail-close" onClick={() => setSelectedTech(null)}>✕</button>
          </div>
          <p className="tech-detail-desc">{selectedTech.description}</p>
          {selectedTech.requires.length > 0 && (
            <div className="tech-detail-requires">
              Requires: {selectedTech.requires.map(id => TECH_BY_ID[id]?.label ?? id).join(', ')}
            </div>
          )}
          {Object.keys(selectedTech.effects).length > 0 && (
            <div className="tech-detail-effects">
              {Object.entries(selectedTech.effects).map(([k, v]) => (
                <span key={k} className="tech-effect-chip">
                  {k.replace(/([A-Z])/g, ' $1')}: {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Megastructures */}
      {(civ.megastructures ?? []).length > 0 && (
        <div className="tech-megastructures">
          <div className="tech-mega-title">🏗️ Megastructures</div>
          <div className="tech-mega-list">
            {civ.megastructures.map(ms => (
              <span key={ms} className="tech-mega-chip">{ms.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

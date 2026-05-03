/**
 * UniversePanel - WorldBox-style information panel showing universe statistics.
 * Shows cluster counts, star counts, composition, and universe-level info.
 */
import React, { useState, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { ELEMENTS } from '@data/elements';
import { formatNumber, formatTime } from '@utils/math';
import { VIEW_LEVEL } from '@utils/constants';
import './UniversePanel.css';

const PANEL_STORAGE_KEY = 'genesiserror-universepanel-position';

const UniversePanel = ({
  universeStats,
  engine,
  lifeTuning,
  onNavigateToCluster,
  onNavigateToSystem,
  onNavigateToUniverse,
  onNavigateToBody,
  onSetLifePreset,
  onUpdateLifeTuning,
  onResetLifeTuning,
}) => {
  const { viewLevel, focusedClusterId, focusedSystemId } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Draggable
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState(() => {
    try {
      const s = localStorage.getItem(PANEL_STORAGE_KEY);
      if (s) { const p = JSON.parse(s); if (typeof p.x === 'number') return p; }
    } catch (_) {}
    return { x: 10, y: 80 };
  });
  const posRef = useRef(pos);
  posRef.current = pos;

  const handleDragStart = useCallback((e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const handleDragMove = useCallback((e) => {
    if (!dragging.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
    const y = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y));
    setPos({ x, y });
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (dragging.current) {
      dragging.current = false;
      try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(posRef.current)); } catch (_) {}
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    }
  }, []);

  if (collapsed) {
    return (
      <div
        className="universe-panel collapsed"
        style={{ left: pos.x, top: pos.y }}
        onClick={() => setCollapsed(false)}
      >
        <span className="up-icon">&#x1F30C;</span> Universe
      </div>
    );
  }

  const stats = universeStats || {};
  const composition = stats.composition || {};
  const formatCoords = (coords) => {
    if (!coords) return '0.00, 0.00, 0.00 Mly';
    return `${(coords.x || 0).toFixed(2)}, ${(coords.y || 0).toFixed(2)}, ${(coords.z || 0).toFixed(2)} Mly`;
  };

  // Breadcrumb navigation
  const renderBreadcrumbs = () => {
    const crumbs = [];
    crumbs.push(
      <span
        key="universe"
        className={`breadcrumb ${viewLevel === VIEW_LEVEL.UNIVERSE ? 'active' : 'clickable'}`}
        onClick={() => viewLevel !== VIEW_LEVEL.UNIVERSE && onNavigateToUniverse?.()}
      >
        Universe
      </span>
    );

    if (viewLevel !== VIEW_LEVEL.UNIVERSE && focusedClusterId) {
      const cluster = stats.clusters?.find(c => c.id === focusedClusterId);
      crumbs.push(<span key="sep1" className="breadcrumb-sep">/</span>);
      crumbs.push(
        <span
          key="cluster"
          className={`breadcrumb ${viewLevel === VIEW_LEVEL.SYSTEM ? 'active' : 'clickable'}`}
          onClick={() => onNavigateToCluster?.(focusedClusterId)}
        >
          {cluster?.name || 'Cluster'}
        </span>
      );
    }

    if (viewLevel === VIEW_LEVEL.BODY && focusedSystemId) {
      crumbs.push(<span key="sep2" className="breadcrumb-sep">/</span>);
      crumbs.push(
        <span key="system" className="breadcrumb active">System</span>
      );
    }

    return <div className="breadcrumbs">{crumbs}</div>;
  };

  return (
    <div className="universe-panel" style={{ left: pos.x, top: pos.y }}>
      <div
        className="up-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div className="up-drag-grip">&#x2807;</div>
        <span className="up-title">&#x1F30C; Universe</span>
        <button className="up-collapse" onClick={() => setCollapsed(true)}>_</button>
      </div>

      {renderBreadcrumbs()}

      <div className="up-tabs">
        <button
          className={`up-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`up-tab ${activeTab === 'clusters' ? 'active' : ''}`}
          onClick={() => setActiveTab('clusters')}
        >
          Clusters
        </button>
        <button
          className={`up-tab ${activeTab === 'bodies' ? 'active' : ''}`}
          onClick={() => setActiveTab('bodies')}
        >
          Bodies
        </button>
        <button
          className={`up-tab ${activeTab === 'composition' ? 'active' : ''}`}
          onClick={() => setActiveTab('composition')}
        >
          Elements
        </button>
        <button
          className={`up-tab ${activeTab === 'life' ? 'active' : ''}`}
          onClick={() => setActiveTab('life')}
        >
          Life
        </button>
        <button
          className={`up-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="up-content">
        {activeTab === 'overview' && (
          <div className="up-overview">
            <div className="up-stat-grid">
              <div className="up-stat">
                <span className="up-stat-icon">&#x1F30C;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.clusterCount || 0}</span>
                  <span className="up-stat-label">Clusters</span>
                </div>
              </div>
              <div className="up-stat">
                <span className="up-stat-icon">&#x2B50;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.starCount || 0}</span>
                  <span className="up-stat-label">Stars</span>
                </div>
              </div>
              <div className="up-stat">
                <span className="up-stat-icon">&#x1F30D;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.planetCount || 0}</span>
                  <span className="up-stat-label">Planets</span>
                </div>
              </div>
              <div className="up-stat">
                <span className="up-stat-icon">&#x26AB;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.blackHoleCount || 0}</span>
                  <span className="up-stat-label">Black Holes</span>
                </div>
              </div>
              <div className="up-stat">
                <span className="up-stat-icon">&#x1F9EC;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.livingWorlds || 0}</span>
                  <span className="up-stat-label">Living Worlds</span>
                </div>
              </div>
              <div className="up-stat">
                <span className="up-stat-icon">&#x1F98E;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.complexWorlds || 0}</span>
                  <span className="up-stat-label">Complex Biospheres</span>
                </div>
              </div>
              <div className="up-stat">
                <span className="up-stat-icon">&#x1F9E0;</span>
                <div className="up-stat-info">
                  <span className="up-stat-value">{stats.intelligentWorlds || 0}</span>
                  <span className="up-stat-label">Intelligent Worlds</span>
                </div>
              </div>
            </div>

            <div className="up-detail-rows">
              <div className="up-row">
                <span className="up-key">Star Systems</span>
                <span className="up-val">{stats.systemCount || 0}</span>
              </div>
              <div className="up-row">
                <span className="up-key">Total Bodies</span>
                <span className="up-val">{stats.totalBodies || 0}</span>
              </div>
              <div className="up-row">
                <span className="up-key">Total Mass</span>
                <span className="up-val">{formatNumber(stats.totalMass || 0)} M&#x2609;</span>
              </div>
              <div className="up-row">
                <span className="up-key">Universe Age</span>
                <span className="up-val">{formatTime(stats.age || 0)}</span>
              </div>
              <div className="up-row">
                <span className="up-key">Boundary Radius</span>
                <span className="up-val">{stats.boundaryRadius ? stats.boundaryRadius.toFixed(1) : 50} Mly</span>
              </div>
              {/* Cosmology readout (always shown; defaults apply for legacy saves / example starts) */}
              <div className="up-row up-cosmo-header">
                <span className="up-key up-section-label">Cosmology</span>
              </div>
              <div className="up-row">
                <span className="up-key">Scale Factor a(t)</span>
                <span className="up-val">{(stats.scaleFactor ?? 1).toFixed(3)}</span>
              </div>
              <div className="up-row">
                <span className="up-key">Cosmic Temperature</span>
                <span className="up-val">
                  {(stats.cosmicTemperature ?? 2.7) < 100
                    ? (stats.cosmicTemperature ?? 2.7).toFixed(2)
                    : Math.round(stats.cosmicTemperature ?? 2.7)} K
                </span>
              </div>
              <div className="up-row">
                <span className="up-key">Phase</span>
                <span className="up-val up-phase">{stats.nucleosynthesisPhase || 'stellarEra'}</span>
              </div>
              <div className="up-row">
                <span className="up-key">Density (Ω)</span>
                <span className="up-val">
                  {(stats.omega ?? 1).toFixed(2)}
                  {' '}
                  <span className="up-omega-fate">
                    {(stats.omega ?? 1) < 0.95 ? '(Open)' : (stats.omega ?? 1) > 1.05 ? '(Closed)' : '(Flat)'}
                  </span>
                </span>
              </div>
              <div className="up-row">
                <span className="up-key">Nebulas</span>
                <span className="up-val">{stats.nebulasCount ?? 0}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'clusters' && (
          <div className="up-clusters">
            {(stats.clusters || []).length === 0 ? (
              <div className="up-empty">No clusters yet. Add objects to create clusters.</div>
            ) : (
              (stats.clusters || []).map(cluster => (
                <div
                  key={cluster.id}
                  className={`up-cluster-card ${!cluster.alive ? 'dead' : ''}`}
                  onClick={() => cluster.alive && onNavigateToCluster?.(cluster.id)}
                >
                  <div className="up-cluster-header">
                    <span className="up-cluster-icon">&#x1F30C;</span>
                    <span className="up-cluster-name">{cluster.name}</span>
                    <span className="up-cluster-type">{cluster.type}</span>
                  </div>
                  <div className="up-cluster-info">
                    <span>{cluster.systemCount} systems</span>
                    <span>{formatCoords(cluster.position)}</span>
                    {!cluster.alive && <span className="up-dead-badge">Destroyed</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'bodies' && (
          <div className="up-bodies">
            {(() => {
              const bodies = engine?.getBodies?.() || [];
              const stars = bodies.filter(b => b.type === 'star' && b.alive);
              const planets = bodies.filter(b => b.type === 'planet' && b.alive);
              const blackHoles = bodies.filter(b => b.type === 'black_hole' && b.alive);
              const bodyTypeIcon = { star: '\u2B50', planet: '\uD83C\uDF0D', black_hole: '\u26AB' };
              const allBodies = [...blackHoles, ...stars, ...planets];

              if (allBodies.length === 0) {
                return <div className="up-empty">No bodies yet. Add objects to populate the universe.</div>;
              }

              return allBodies.map(body => (
                <div
                  key={body.id}
                  className="up-body-card"
                  onClick={() => onNavigateToBody?.(body.id)}
                  title={`Click to locate ${body.name}`}
                >
                  <span className="up-body-icon">{bodyTypeIcon[body.type] || '\u2B50'}</span>
                  <div className="up-body-info">
                    <span className="up-body-name">{body.name}</span>
                    <span className="up-body-detail">
                      {body.type === 'star' ? `${formatNumber(body.mass)} M\u2609 \u00B7 ${formatNumber(body.temperature)} K` :
                       body.type === 'planet'
                         ? `${formatNumber(body.massEarth || body.mass * 333000)} M\u2295 \u00B7 ${body.lifeStage || 'none'} life`
                         : 
                       `${formatNumber(body.mass)} M\u2609`}
                    </span>
                    <span className="up-body-detail">
                      {formatCoords(engine?.getBodyUniversePosition?.(body))}
                    </span>
                  </div>
                  <span className="up-body-locate">🔍</span>
                </div>
              ));
            })()}
          </div>
        )}

        {activeTab === 'composition' && (
          <div className="up-composition">
            <div className="up-comp-bar">
              {Object.entries(composition)
                .sort((a, b) => b[1] - a[1])
                .map(([el, frac]) => (
                  <div
                    key={el}
                    className="up-comp-segment"
                    style={{
                      width: `${Math.max(frac * 100, 1.5)}%`,
                      background: ELEMENTS[el]?.color || '#666',
                    }}
                    title={`${ELEMENTS[el]?.name || el}: ${(frac * 100).toFixed(2)}%`}
                  />
                ))}
            </div>
            <div className="up-comp-legend">
              {Object.entries(composition)
                .sort((a, b) => b[1] - a[1])
                .filter(([, frac]) => frac > 0.001)
                .map(([el, frac]) => (
                  <div key={el} className="up-comp-item">
                    <span
                      className="up-comp-dot"
                      style={{ background: ELEMENTS[el]?.color || '#666' }}
                    />
                    <span className="up-comp-name">{ELEMENTS[el]?.name || el}</span>
                    <span className="up-comp-pct">{(frac * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'life' && (
          <div className="up-life-controls">
            {!lifeTuning ? (
              <div className="up-empty">Life controls will appear once the simulation runtime is available.</div>
            ) : (
              <>
                <div className="up-life-row">
                  <label className="up-life-label" htmlFor="life-preset-select">Preset</label>
                  <select
                    id="life-preset-select"
                    className="up-life-select"
                    value={lifeTuning.preset || 'gameplay'}
                    onChange={(e) => onSetLifePreset?.(e.target.value)}
                  >
                    <option value="realistic">Realistic</option>
                    <option value="gameplay">Gameplay</option>
                    <option value="chaotic">Chaotic</option>
                  </select>
                </div>

                <label className="up-life-toggle">
                  <input
                    type="checkbox"
                    checked={!!lifeTuning.enabled}
                    onChange={(e) => onUpdateLifeTuning?.({ enabled: e.target.checked })}
                  />
                  <span>Enable life simulation</span>
                </label>

                {[
                  ['lifeRateMultiplier', 'Life Rate', 0.1, 20, 0.1],
                  ['adaptationRateMultiplier', 'Adaptation', 0.1, 10, 0.1],
                  ['extinctionRateMultiplier', 'Extinction', 0.1, 10, 0.1],
                  ['radiationImpactMultiplier', 'Radiation', 0.1, 10, 0.1],
                  ['intelligenceRateMultiplier', 'Intelligence', 0.1, 20, 0.1],
                ].map(([key, label, min, max, step]) => (
                  <div key={key} className="up-life-slider">
                    <div className="up-life-slider-head">
                      <span>{label}</span>
                      <span>{Number(lifeTuning[key]).toFixed(1)}x</span>
                    </div>
                    <input
                      className="up-life-range"
                      data-life-key={key}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={lifeTuning[key]}
                      onChange={(e) => onUpdateLifeTuning?.({ [key]: Number(e.target.value) })}
                    />
                  </div>
                ))}

                <div className="up-life-mini-grid">
                  <div className="up-life-mini">
                    <span>Abiogenesis</span>
                    <strong>{Number(lifeTuning.abiogenesisBaseRate || 0).toExponential(1)}</strong>
                  </div>
                  <div className="up-life-mini">
                    <span>Mutation Scale</span>
                    <strong>{Number(lifeTuning.mutationScale || 0).toFixed(2)}</strong>
                  </div>
                  <div className="up-life-mini">
                    <span>Candidates</span>
                    <strong>{lifeTuning.candidateCount || 0}</strong>
                  </div>
                  <div className="up-life-mini">
                    <span>Lethal Flux</span>
                    <strong>{Number(lifeTuning.lethalRadiationFlux || 0).toFixed(0)}</strong>
                  </div>
                </div>

                <div className="up-life-actions">
                  <button
                    type="button"
                    className="up-life-btn"
                    onClick={() => onResetLifeTuning?.(lifeTuning.preset || 'gameplay')}
                  >
                    Reset Preset
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="up-settings">
            {(() => {
              const eng = engine;
              if (!eng) return <div className="up-empty">Engine not available.</div>;
              const uni = eng.universe;
              const starMul = eng._starFormRateMultiplier ?? 1;
              const planetMul = eng._planetFormRateMultiplier ?? 1;
              const lifeMul = eng._lifeDifficultyMultiplier ?? 1;
              const lifeOn = eng.lifeEvolutionSystem?.enabled ?? true;
              return (
                <>
                  <div className="up-detail-rows">
                    <div className="up-row">
                      <span className="up-key">Boundary Radius</span>
                      <span className="up-val">{uni?.boundaryRadius || 50} Mly</span>
                    </div>
                    <div className="up-row">
                      <span className="up-key">Hydrogen</span>
                      <span className="up-val">{((uni?.composition?.H || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="up-row">
                      <span className="up-key">Helium</span>
                      <span className="up-val">{((uni?.composition?.He || 0) * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="up-settings-sliders">
                    <div className="up-life-slider">
                      <div className="up-life-slider-head">
                        <span>Star Formation Rate</span>
                        <span>{starMul.toFixed(1)}x</span>
                      </div>
                      <input className="up-life-range" type="range" min="0" max="3" step="0.1"
                        value={starMul}
                        onChange={(e) => { eng._starFormRateMultiplier = +e.target.value; }} />
                    </div>
                    <div className="up-life-slider">
                      <div className="up-life-slider-head">
                        <span>Planet Formation Rate</span>
                        <span>{planetMul.toFixed(1)}x</span>
                      </div>
                      <input className="up-life-range" type="range" min="0" max="3" step="0.1"
                        value={planetMul}
                        onChange={(e) => { eng._planetFormRateMultiplier = +e.target.value; }} />
                    </div>
                    <div className="up-life-slider">
                      <div className="up-life-slider-head">
                        <span>Life Difficulty</span>
                        <span>{lifeMul.toFixed(1)}x</span>
                      </div>
                      <input className="up-life-range" type="range" min="0.1" max="3" step="0.1"
                        value={lifeMul}
                        onChange={(e) => { eng._lifeDifficultyMultiplier = +e.target.value; }} />
                    </div>
                    <label className="up-life-toggle">
                      <input type="checkbox" checked={lifeOn}
                        onChange={(e) => { if (eng.lifeEvolutionSystem) eng.lifeEvolutionSystem.enabled = e.target.checked; }} />
                      <span>Life Evolution Enabled</span>
                    </label>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default UniversePanel;

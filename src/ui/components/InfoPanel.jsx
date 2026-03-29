/**
 * InfoPanel - Displays detailed information about a selected celestial body
 * Properties change dynamically based on the star's current evolutionary phase
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { formatNumber, formatTime } from '@utils/math';
import { getClosestNeighbors } from '@utils/gravityNeighbors';
import { ELEMENTS } from '@data/elements';
import HRDiagram from './HRDiagram';
import EvolutionTreeButton from './EvolutionTree';
import './InfoPanel.css';

const PANEL_STORAGE_KEY = 'starsim-infopanel-position';

/**
 * Phase-specific descriptions and science facts
 */
const PHASE_INFO = {
  main_sequence: {
    title: 'Main Sequence',
    icon: '⭐',
    description: 'Stable hydrogen fusion in the core. The longest phase of stellar life.',
    color: '#4a9eff',
  },
  subgiant: {
    title: 'Subgiant',
    icon: '🔸',
    description: 'Core hydrogen exhausted. Shell burning begins as the star expands.',
    color: '#ffc800',
  },
  red_giant: {
    title: 'Red Giant',
    icon: '🔴',
    description: 'Massive expansion with helium fusion in the core. Outer layers cool and redden.',
    color: '#ff6400',
  },
  red_supergiant: {
    title: 'Red Supergiant',
    icon: '🟤',
    description: 'A massive star fusing progressively heavier elements in an onion-shell structure.',
    color: '#ff3200',
  },
  white_dwarf: {
    title: 'White Dwarf',
    icon: '⚪',
    description: 'The exposed carbon-oxygen core left after a star sheds its outer layers. Incredibly dense.',
    color: '#c8dcff',
  },
  neutron_star: {
    title: 'Neutron Star',
    icon: '💫',
    description: 'An ultra-dense remnant from a core-collapse supernova. Mostly neutrons held up by degeneracy pressure.',
    color: '#b400ff',
  },
  black_hole: {
    title: 'Black Hole',
    icon: '⚫',
    description: 'A region where gravity is so extreme that nothing — not even light — can escape.',
    color: '#888',
  },
};

const InfoPanel = ({ onExplore, onClose, onFocusBody, getBodies }) => {
  const { selectedBody, simulationTime } = useStore();
  const [showHRDiagram, setShowHRDiagram] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [labelVisible, setLabelVisible] = useState(true);
  const nameInputRef = useRef(null);

  // Draggable panel state
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [panelPos, setPanelPos] = useState(() => {
    try {
      const s = localStorage.getItem(PANEL_STORAGE_KEY);
      if (s) { const p = JSON.parse(s); if (typeof p.x === 'number') return p; }
    } catch (_) {}
    return null; // null = use default CSS position
  });
  const panelPosRef = useRef(panelPos);
  panelPosRef.current = panelPos;

  const handleDragStart = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    dragging.current = true;
    const panel = e.currentTarget.closest('.info-panel');
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!dragging.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
    // Keep panel top at least 90px above the timeline (72px) so it can never obscure it
    const y = Math.max(0, Math.min(window.innerHeight - 72 - 90, e.clientY - dragOffset.current.y));
    setPanelPos({ x, y });
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (dragging.current) {
      dragging.current = false;
      try { localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelPosRef.current)); } catch (_) {}
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    }
  }, []);

  useEffect(() => {
    setLabelVisible(selectedBody?.showLabel !== false);
  }, [selectedBody?.id, selectedBody?.showLabel]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  if (!selectedBody) return null;

  const props = selectedBody.getProperties();
  const showLabelInSim = labelVisible;

  const handleStartRename = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setEditNameValue(selectedBody.name || '');
    setIsEditingName(true);
  };

  const handleSaveRename = () => {
    const trimmed = (editNameValue || '').trim();
    if (trimmed) selectedBody.name = trimmed;
    setIsEditingName(false);
  };

  const handleToggleLabel = () => {
    selectedBody.showLabel = !labelVisible;
    setLabelVisible(!labelVisible);
  };

  const renderValue = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? '✓ Yes' : '✗ No';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return formatNumber(val);
    if (typeof val === 'object' && val.value !== undefined) {
      return `${formatNumber(val.value)} ${val.unit || ''}`;
    }
    if (typeof val === 'object' && val.x !== undefined) {
      return `(${val.x}, ${val.y}, ${val.z}) ${val.unit || ''}`;
    }
    return JSON.stringify(val);
  };

  const Row = ({ label, value, highlight }) => (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className={`info-val ${highlight || ''}`}>{value}</span>
    </div>
  );

  const phaseInfo = PHASE_INFO[selectedBody.phase] || {};

  const neighbors = useMemo(() => {
    if (!selectedBody || !getBodies) return [];
    const all = getBodies() || [];
    return getClosestNeighbors(selectedBody, all, 8);
  }, [selectedBody, selectedBody?.id, simulationTime, getBodies]);

  const posStyle = panelPos
    ? { left: panelPos.x, top: panelPos.y, right: 'auto' }
    : {};

  return (
    <div className="info-panel" style={posStyle}>
      {/* Header (drag handle) */}
      <div
        className="info-header info-drag-handle"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div className="info-drag-grip" title="Drag to reposition">⠿</div>
        <div className="info-title-row">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              className="info-name-input"
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onBlur={handleSaveRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditingName(false);
                  setEditNameValue(selectedBody.name || '');
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              autoComplete="off"
              autoFocus
            />
          ) : (
            <h2 className="info-title" onClick={handleStartRename} onMouseDown={(e) => e.stopPropagation()} title="Click to rename">
              {props.name}
            </h2>
          )}
          {onFocusBody && (
            <button
              className="info-focus-btn"
              onClick={(e) => { e.stopPropagation(); onFocusBody(selectedBody.id); }}
              title="Switch to body-centred view"
            >
              🎯
            </button>
          )}
          <button
            className={`info-label-toggle ${labelVisible ? '' : 'hidden'}`}
            onClick={handleToggleLabel}
            title={labelVisible ? 'Hide name in simulation' : 'Show name in simulation'}
          >
            {labelVisible ? '👁' : '👁̸'}
          </button>
        </div>
        <div className="info-type">{props.type} — {props.subtype || props.phase}</div>
        <button className="info-close" onClick={onClose}>✕</button>
      </div>

      {/* Fun fact */}
      {selectedBody.funFact && (
        <div className="info-fact">
          💡 {selectedBody.funFact}
        </div>
      )}

      {/* ========== PHYSICAL PROPERTIES ========== */}
      <div className="info-section">
        <h3 className="section-title">Physical Properties</h3>
        <Row label="Mass" value={renderValue(props.mass)} />
        <Row label="Radius" value={renderValue(props.radius)} />
        <Row label="Temperature" value={renderValue(props.temperature)} />
        <Row label="Luminosity" value={renderValue(props.luminosity)} />
        <Row label="Age" value={formatTime(props.age?.value ?? selectedBody.age)} />
      </div>

      {/* ========== CLOSEST NEIGHBORS (N-body context) ========== */}
      <div className="info-section">
        <h3 className="section-title">Closest neighbors</h3>
        {neighbors.length === 0 ? (
          <p className="info-note">No other bodies in range.</p>
        ) : (
          <ul className="neighbor-list">
            {neighbors.map((n) => (
              <li key={n.id} className="neighbor-item">
                <span className="neighbor-name">{n.name}</span>
                <span className="neighbor-dist">
                  {formatNumber(n.distanceAU)} AU
                  {!n.sameSystem && <span className="neighbor-tag"> other system</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="info-note">
          <strong>Gravity model:</strong> Full mutual N-body forces are computed <em>within each star system</em> (AU scale).
          Separate galaxies use their own system physics; across millions of light-years the coupling to this system is
          negligible and is not applied to these orbits. Nearby entries from other systems are shown by straight-line
          separation only for reference.
        </p>
      </div>

      {/* ========== POSITION & ORIENTATION (Universe Sandbox-style manual placement) ========== */}
      <div className="info-section">
        <h3 className="section-title">Position & Orientation</h3>
        <div className="info-position-grid">
          <div className="info-pos-row">
            <label>X (AU)</label>
            <input
              type="number"
              step="0.1"
              value={selectedBody.position?.x?.toFixed(3) ?? '0'}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && selectedBody.position) selectedBody.position.x = v;
              }}
            />
          </div>
          <div className="info-pos-row">
            <label>Y (AU)</label>
            <input
              type="number"
              step="0.1"
              value={selectedBody.position?.y?.toFixed(3) ?? '0'}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && selectedBody.position) selectedBody.position.y = v;
              }}
            />
          </div>
          <div className="info-pos-row">
            <label>Z (AU)</label>
            <input
              type="number"
              step="0.1"
              value={selectedBody.position?.z?.toFixed(3) ?? '0'}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && selectedBody.position) selectedBody.position.z = v;
              }}
            />
          </div>
          <div className="info-pos-row">
            <label>Rotation (rad)</label>
            <input
              type="number"
              step="0.1"
              value={(selectedBody.rotationAngle ?? 0).toFixed(3)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) selectedBody.rotationAngle = v;
              }}
            />
          </div>
        </div>
        <div className="info-note" style={{ marginTop: 8, fontSize: 11 }}>
          Manually adjust position and orientation (Universe Sandbox-style). Changes apply immediately.
        </div>
      </div>

      {/* ========== STAR: PHASE-AWARE PROPERTIES ========== */}
      {selectedBody.type === 'star' && (
        <>
          {/* HR Diagram button */}
          <button
            className="hr-diagram-btn"
            onClick={() => setShowHRDiagram(true)}
            title="View star on Hertzsprung–Russell diagram"
          >
            📊 HR Diagram
          </button>

          {/* Phase badge + description card */}
          <div className="phase-card" style={{ borderColor: phaseInfo.color || '#4488ff' }}>
            <div className="phase-card-header">
              <span className={`phase-badge phase-${selectedBody.phase}`}>
                {phaseInfo.icon} {phaseInfo.title || selectedBody.phase}
              </span>
              {props.evolutionProgress && selectedBody.phase !== 'main_sequence' && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: props.evolutionProgress }} />
                  <span className="progress-text">{props.evolutionProgress}</span>
                </div>
              )}
            </div>
            <div className="phase-card-desc">{phaseInfo.description}</div>
          </div>

          {/* Main Sequence specific */}
          {selectedBody.phase === 'main_sequence' && (
            <div className="info-section">
              <h3 className="section-title">Main Sequence Properties</h3>
              <Row label="Spectral Class" value={`${props.spectralClass}-type`} />
              <Row label="Core Fusion" value={props.fusionElement || 'hydrogen'} />
              <Row label="Core Temperature" value={renderValue(props.coreTemperature)} />
              <Row label="MS Lifetime" value={formatTime(props.mainSequenceLifetime?.value)} />
              <Row
                label="Life Remaining"
                value={formatTime(Math.max(0, (props.mainSequenceLifetime?.value || 0) - selectedBody.age))}
              />
              {props.habitableZone && (
                <Row
                  label="Habitable Zone"
                  value={`${formatNumber(props.habitableZone.inner)} — ${formatNumber(props.habitableZone.outer)} AU`}
                />
              )}
              <Row label="Mass Loss Rate" value={renderValue(props.massLossRate)} />
              <Row label="Flare Activity" value={`${((selectedBody.flareActivity || 0) * 100).toFixed(0)}%`} />
            </div>
          )}

          {/* Subgiant specific */}
          {selectedBody.phase === 'subgiant' && (
            <div className="info-section">
              <h3 className="section-title">Subgiant Properties</h3>
              <Row label="Spectral Class" value={`${props.spectralClass}-type`} />
              <Row label="Core Fusion" value={props.fusionElement || 'hydrogen (shell)'} />
              <Row label="Core Temperature" value={renderValue(props.coreTemperature)} />
              <Row label="Original Mass" value={`${formatNumber(selectedBody.initialMass)} M☉`} />
              <Row label="Expansion" value={`${formatNumber(selectedBody.radius / (selectedBody.initialMass || 1))}x solar`} />
              <Row label="Mass Loss Rate" value={renderValue(props.massLossRate)} />
              <div className="info-note">
                ℹ️ The core contracts and heats up while the envelope expands. Shell hydrogen burning produces most of the luminosity.
              </div>
            </div>
          )}

          {/* Red Giant specific */}
          {selectedBody.phase === 'red_giant' && (
            <div className="info-section">
              <h3 className="section-title">Red Giant Properties</h3>
              <Row label="Spectral Class" value={`${props.spectralClass}-type`} />
              <Row label="Core Fusion" value={props.fusionElement || 'helium'} />
              <Row label="Core Temperature" value={renderValue(props.coreTemperature)} />
              <Row label="Original Mass" value={`${formatNumber(selectedBody.initialMass)} M☉`} />
              <Row
                label="Mass Lost"
                value={`${formatNumber(selectedBody.initialMass - selectedBody.mass)} M☉ (${((1 - selectedBody.mass / selectedBody.initialMass) * 100).toFixed(1)}%)`}
              />
              <Row label="Mass Loss Rate" value={renderValue(props.massLossRate)} />
              {props.habitableZone && (
                <Row
                  label="Habitable Zone"
                  value={`${formatNumber(props.habitableZone.inner)} — ${formatNumber(props.habitableZone.outer)} AU`}
                  highlight="highlight-orange"
                />
              )}
              <div className="info-note">
                ℹ️ The helium flash ignites helium fusion in the degenerate core. The star's outer envelope will eventually be shed as a planetary nebula.
              </div>
            </div>
          )}

          {/* Red Supergiant specific */}
          {selectedBody.phase === 'red_supergiant' && (
            <div className="info-section">
              <h3 className="section-title">Red Supergiant Properties</h3>
              <Row label="Spectral Class" value={`${props.spectralClass}-type`} />
              <Row label="Core Fusion" value={props.fusionElement || 'silicon → iron'} />
              <Row label="Core Temperature" value={renderValue(props.coreTemperature)} />
              <Row label="Original Mass" value={`${formatNumber(selectedBody.initialMass)} M☉`} />
              <Row label="Mass Loss Rate" value={renderValue(props.massLossRate)} />
              <div className="info-note warning">
                ⚠️ This star is fusing heavy elements in an onion-shell structure. When the iron core reaches the Chandrasekhar limit (~1.4 M☉), it will collapse and trigger a supernova!
              </div>
            </div>
          )}

          {/* White Dwarf specific */}
          {selectedBody.phase === 'white_dwarf' && (
            <div className="info-section">
              <h3 className="section-title">White Dwarf Properties</h3>
              <Row label="Composition" value="Carbon/Oxygen (degenerate)" />
              <Row label="Original Mass" value={`${formatNumber(selectedBody.initialMass)} M☉`} />
              <Row label="Remnant Mass" value={`${formatNumber(selectedBody.mass)} M☉`} />
              <Row
                label="Chandrasekhar Limit"
                value={selectedBody.mass < 1.4 ? '✓ Stable (< 1.4 M☉)' : '⚠ Near limit!'}
                highlight={selectedBody.mass >= 1.3 ? 'highlight-red' : 'highlight-green'}
              />
              <Row label="Surface Temp" value={`${formatNumber(selectedBody.temperature)} K`} />
              <Row
                label="Cooling Status"
                value={selectedBody.temperature > 10000 ? 'Hot (young WD)' : selectedBody.temperature > 4000 ? 'Warm (cooling)' : 'Cold (ancient)'}
              />
              <Row
                label="Density"
                value={`~${formatNumber(selectedBody.mass / Math.pow(selectedBody.radius, 3) * 1.41e6)} g/cm³`}
              />
              <div className="info-note">
                ℹ️ No fusion occurs. The star is supported by electron degeneracy pressure and slowly radiates its residual thermal energy. A teaspoon would weigh ~5.5 tons.
              </div>
            </div>
          )}

          {/* Neutron Star specific */}
          {selectedBody.phase === 'neutron_star' && (
            <div className="info-section">
              <h3 className="section-title">Neutron Star Properties</h3>
              <Row label="Composition" value="Neutron-degenerate matter" />
              <Row label="Original Mass" value={`${formatNumber(selectedBody.initialMass)} M☉`} />
              <Row label="Remnant Mass" value={`${formatNumber(selectedBody.mass)} M☉`} />
              <Row label="Rotation Speed" value={`${formatNumber(selectedBody.rotationSpeed)} rad/sim`} />
              <Row label="Magnetic Field" value={`${formatNumber(selectedBody.magneticFieldStrength)}x Earth`} />
              <Row
                label="Density"
                value={`~${formatNumber(selectedBody.mass / Math.pow(selectedBody.radius, 3) * 1.41e6)} g/cm³`}
              />
              <div className="info-note">
                ℹ️ Supported by neutron degeneracy pressure. A sugar-cube sized piece would weigh ~1 billion tons on Earth!
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== PLANET PROPERTIES ========== */}
      {selectedBody.type === 'planet' && (
        <>
          <div className="info-section">
            <h3 className="section-title">Planetary Properties</h3>
            {props.massEarth && <Row label="Mass" value={renderValue(props.massEarth)} />}
            {props.radiusEarth && <Row label="Radius" value={renderValue(props.radiusEarth)} />}
            {props.surfaceGravity && <Row label="Surface Gravity" value={renderValue(props.surfaceGravity)} />}
            <Row label="Surface Type" value={props.surfaceType || 'rocky'} />
            {props.atmosphere && (
              <Row label="Atmosphere" value={renderValue(props.atmosphere.pressure)} />
            )}
            <Row label="Has Water" value={renderValue(props.hasWater)} />
            <Row
              label="Has Life"
              value={renderValue(props.hasLife)}
              highlight={props.hasLife ? 'highlight-green' : ''}
            />
            <Row label="In Habitable Zone" value={props.habitableZone} />
            <Row label="Magnetic Field" value={renderValue(props.magneticField)} />
          </div>

          <div className="info-section">
            <h3 className="section-title">Life & Evolution</h3>
            <Row label="Life Stage" value={props.lifeStage || 'none'} />
            <Row label="Life Origin" value={props.lifeOrigin || 'None yet'} />
            <Row
              label="Environmental Fitness"
              value={renderValue(props.habitabilityScore)}
              highlight={props.habitabilityScore > 0.6 ? 'highlight-green' : ''}
            />
            <Row label="Stability" value={renderValue(props.environmentalStability)} />
            <Row label="Prebiotic Chemistry" value={renderValue(props.prebioticChemistry)} />
            <Row
              label="Biosphere Health"
              value={renderValue(props.biosphereHealth)}
              highlight={props.biosphereHealth > 0.55 ? 'highlight-green' : ''}
            />
            <Row label="Selection Fitness" value={renderValue(props.biosphereFitness)} />
            <Row label="Biodiversity" value={renderValue(props.biodiversity)} />
            <Row label="Complexity" value={renderValue(props.complexityScore)} />
            <Row label="Intelligence Potential" value={renderValue(props.intelligencePotential)} />
            <Row label="Mutation Pressure" value={renderValue(props.mutationPressure)} />
            <Row label="Extinction Pressure" value={renderValue(props.extinctionPressure)} />
            {props.speciesProfile && (
              <>
                <Row label="Thermal Preference" value={renderValue(props.speciesProfile.temperaturePreference)} />
                <Row label="Pressure Preference" value={renderValue(props.speciesProfile.pressurePreference)} />
                <Row label="Radiation Tolerance" value={renderValue(props.speciesProfile.radiationTolerance)} />
                <Row label="Resilience" value={renderValue(props.speciesProfile.resilience)} />
                <Row label="Adaptability" value={renderValue(props.speciesProfile.adaptability)} />
              </>
            )}
          </div>

          <div className="info-section">
            <EvolutionTreeButton
              evolutionTree={props.evolutionTree}
              lifeStage={props.lifeStage}
              planetName={props.name}
            />
          </div>
        </>
      )}

      {/* ========== BLACK HOLE PROPERTIES ========== */}
      {selectedBody.type === 'black_hole' && (
        <div className="info-section">
          <h3 className="section-title">Black Hole Properties</h3>
          {props.schwarzschildRadius && <Row label="Schwarzschild Radius" value={renderValue(props.schwarzschildRadius)} />}
          {props.spin && <Row label="Spin (Kerr parameter)" value={renderValue(props.spin)} />}
          {props.hawkingTemperature && <Row label="Hawking Temperature" value={renderValue(props.hawkingTemperature)} />}
          {props.accretionRate && <Row label="Accretion Rate" value={renderValue(props.accretionRate)} />}
        </div>
      )}

      {/* ========== DYNAMICS (Position & Velocity) - All bodies ========== */}
      <div className="info-section">
        <h3 className="section-title">Position & Velocity</h3>
        <Row label="Position" value={`(${props.position?.x}, ${props.position?.y}, ${props.position?.z}) AU`} />
        <Row label="Velocity" value={`${renderValue(props.velocity?.magnitude)} ${props.velocity?.unit || 'AU/yr'}`} />
        {props.velocity?.x != null && (
          <Row label="v (x,y,z)" value={`(${props.velocity.x}, ${props.velocity.y}, ${props.velocity.z})`} />
        )}
      </div>

      {/* ========== ORBITAL PROPERTIES (if orbiting) ========== */}
      {(props.orbitalDistance?.value > 0) && (
        <div className="info-section">
          <h3 className="section-title">Orbital Properties</h3>
          <Row label="Distance" value={renderValue(props.orbitalDistance)} />
          <Row label="Eccentricity" value={formatNumber(props.eccentricity)} />
        </div>
      )}

      {/* ========== EVENT LOG ========== */}
      {selectedBody.eventLog?.length > 0 && (
        <div className="info-section">
          <h3 className="section-title">Recent Events</h3>
          <div className="event-log">
            {selectedBody.eventLog.slice(-5).reverse().map((event, i) => (
              <div key={i} className="event-entry">
                <span className="event-type">{event.type}</span>
                <span className="event-msg">{event.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== CHEMICAL COMPOSITION ========== */}
      {selectedBody.composition && Object.keys(selectedBody.composition).length > 0 && (
        <div className="info-section">
          <h3 className="section-title">Chemical Composition</h3>
          <div className="info-composition-bar">
            {Object.entries(selectedBody.composition)
              .sort((a, b) => b[1] - a[1])
              .filter(([, frac]) => frac > 0.001)
              .map(([el, frac]) => (
                <div
                  key={el}
                  className="info-comp-segment"
                  style={{
                    width: `${Math.max(frac * 100, 2)}%`,
                    background: ELEMENTS[el]?.color || '#666',
                  }}
                  title={`${ELEMENTS[el]?.name || el}: ${(frac * 100).toFixed(2)}%`}
                />
              ))}
          </div>
          <div className="info-comp-legend">
            {Object.entries(selectedBody.composition)
              .sort((a, b) => b[1] - a[1])
              .filter(([, frac]) => frac > 0.005)
              .slice(0, 8)
              .map(([el, frac]) => (
                <div key={el} className="info-comp-item">
                  <span className="info-comp-dot" style={{ background: ELEMENTS[el]?.color || '#666' }} />
                  <span className="info-comp-name">{ELEMENTS[el]?.symbol || el}</span>
                  <span className="info-comp-pct">{(frac * 100).toFixed(1)}%</span>
                </div>
              ))}
          </div>
          {selectedBody.coreTemperature > 0 && (
            <Row label="Core Temperature" value={`${formatNumber(selectedBody.coreTemperature)} K`} />
          )}
        </div>
      )}

      {/* ========== HABITABLE ZONE (Stars only) ========== */}
      {selectedBody.type === 'star' && selectedBody.luminosity > 0 && (
        <div className="info-section">
          <h3 className="section-title">Habitable Zone</h3>
          {(() => {
            const L = selectedBody.luminosity;
            const inner = (Math.sqrt(L / 1.1) * 0.95).toFixed(2);
            const outer = (Math.sqrt(L / 0.53) * 1.37).toFixed(2);
            return (
              <>
                <Row label="Inner Edge" value={`${inner} AU`} highlight="highlight-green" />
                <Row label="Outer Edge" value={`${outer} AU`} highlight="highlight-green" />
                <div className="habitable-zone-bar">
                  <div className="hz-inner" style={{ width: `${Math.min(parseFloat(inner) * 15, 40)}%` }} />
                  <div className="hz-zone" style={{ width: `${Math.min((parseFloat(outer) - parseFloat(inner)) * 15, 50)}%` }} />
                  <div className="hz-outer" />
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Explore button */}
      <button className="explore-btn" onClick={() => onExplore(selectedBody)}>
        Enter Explorer Mode
      </button>

      {/* HR Diagram modal */}
      {showHRDiagram && selectedBody?.type === 'star' && (
        <HRDiagram
          star={selectedBody}
          allStars={getBodies?.() ?? []}
          onClose={() => setShowHRDiagram(false)}
        />
      )}
    </div>
  );
};

export default InfoPanel;

import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CIV_STAGES, KARDASHEV_LEVELS } from '@data/techTree.js';
import './EvolutionTree.css';

const STAGE_LABELS = {
  simple:       'Single-cell',
  complex:      'Multicellular',
  intelligent:  'Sapient',
  civilization: 'Civilized',
};

const STAGE_TIER_ICON = {
  simple:       '🦠',
  complex:      '🐠',
  intelligent:  '🧠',
  civilization: '🏙️',
};

const STAGE_COLORS = {
  simple:       '#44cc88',
  complex:      '#44aaff',
  intelligent:  '#cc88ff',
  civilization: '#ffaa00',
};

function seededRand(seed) {
  let h = 0xdeadbeef ^ (seed | 0);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const BODY_SHAPES = {
  'amorphous blob': (r) => `M${-r},0 Q${-r},${-r} 0,${-r} Q${r},${-r} ${r},0 Q${r},${r} 0,${r} Q${-r},${r} ${-r},0Z`,
  'fibrous colony': (r) => {
    const a = r * 0.8;
    return `M0,${-r} L${a},${-a} L${r},0 L${a},${a} L0,${r} L${-a},${a} L${-r},0 L${-a},${-a}Z`;
  },
  'crystalline lattice': (r) => `M0,${-r} L${r * 0.6},${-r * 0.3} L${r},${r * 0.3} L${r * 0.4},${r} L${-r * 0.4},${r} L${-r},${r * 0.3} L${-r * 0.6},${-r * 0.3}Z`,
  'segmented worm': (r) => `M${-r},${-r * 0.4} Q0,${-r * 0.7} ${r},${-r * 0.4} L${r},${r * 0.4} Q0,${r * 0.7} ${-r},${r * 0.4}Z`,
  'armored shell': (r) => `M0,${-r} L${r * 0.95},${-r * 0.31} L${r * 0.59},${r * 0.81} L${-r * 0.59},${r * 0.81} L${-r * 0.95},${-r * 0.31}Z`,
  'radial symmetry': (r) => {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const a2 = (Math.PI * 2 * (i + 0.5)) / 6 - Math.PI / 2;
      d += `${i === 0 ? 'M' : 'L'}${Math.cos(a1) * r},${Math.sin(a1) * r} L${Math.cos(a2) * r * 0.5},${Math.sin(a2) * r * 0.5} `;
    }
    return d + 'Z';
  },
  'bilateral body': (r) => `M0,${-r} Q${r * 0.7},${-r * 0.5} ${r * 0.6},0 Q${r * 0.7},${r * 0.5} 0,${r} Q${-r * 0.7},${r * 0.5} ${-r * 0.6},0 Q${-r * 0.7},${-r * 0.5} 0,${-r}Z`,
  // Extra shapes for SpeciesGenerator body plan names
  'cryo-gel matrix': (r) => `M0,${-r * 0.9} Q${r * 1.1},${-r * 0.4} ${r * 0.85},${r * 0.6} Q0,${r * 1.0} ${-r * 0.85},${r * 0.6} Q${-r * 1.1},${-r * 0.4} 0,${-r * 0.9}Z`,
  'ice-membrane sac': (r) => `M0,${-r} L${r * 0.5},${-r * 0.5} L${r * 0.8},${r * 0.3} L${r * 0.3},${r} L${-r * 0.3},${r} L${-r * 0.8},${r * 0.3} L${-r * 0.5},${-r * 0.5}Z`,
  'antifreeze capsule': (r) => `M${-r * 0.5},${-r} Q${r * 0.5},${-r} ${r},0 Q${r * 0.5},${r} ${-r * 0.5},${r} Q${-r},${r * 0.5} ${-r},0 Q${-r},${-r * 0.5} ${-r * 0.5},${-r}Z`,
  'lipid bilayer cell': (r) => {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
      const rr = r * (0.85 + 0.15 * (i % 2));
      d += `${i === 0 ? 'M' : 'L'}${Math.cos(a) * rr},${Math.sin(a) * rr} `;
    }
    return d + 'Z';
  },
  'flexible membrane': (r) => `M0,${-r} Q${r * 1.2},${-r * 0.3} ${r * 0.7},${r * 0.8} Q0,${r * 0.5} ${-r * 0.7},${r * 0.8} Q${-r * 1.2},${-r * 0.3} 0,${-r}Z`,
  'hydrogel sphere': (r) => `M${-r},0 C${-r},${-r * 0.55} ${-r * 0.55},${-r} 0,${-r} C${r * 0.55},${-r} ${r},${-r * 0.55} ${r},0 C${r},${r * 0.55} ${r * 0.55},${r} 0,${r} C${-r * 0.55},${r} ${-r},${r * 0.55} ${-r},0Z`,
  'silicate shell': (r) => `M0,${-r} L${r * 0.7},${-r * 0.7} L${r},0 L${r * 0.7},${r * 0.7} L0,${r} L${-r * 0.7},${r * 0.7} L${-r},0 L${-r * 0.7},${-r * 0.7}Z`,
  'heat-resistant cyst': (r) => `M0,${-r} Q${r * 0.9},${-r * 0.5} ${r * 0.9},${r * 0.2} Q${r * 0.5},${r} 0,${r * 0.95} Q${-r * 0.5},${r} ${-r * 0.9},${r * 0.2} Q${-r * 0.9},${-r * 0.5} 0,${-r}Z`,
  'ceramic microbe': (r) => `M0,${-r} L${r * 0.5},${-r * 0.87} L${r},0 L${r * 0.5},${r * 0.87} L${-r * 0.5},${r * 0.87} L${-r},0 L${-r * 0.5},${-r * 0.87}Z`,
  'metalloprotein chain': (r) => `M${-r},${-r * 0.25} L${-r * 0.4},${-r * 0.6} L${r * 0.4},${-r * 0.6} L${r},${-r * 0.25} L${r},${r * 0.25} L${r * 0.4},${r * 0.6} L${-r * 0.4},${r * 0.6} L${-r},${r * 0.25}Z`,
  'plasma-film entity': (r) => {
    let d = '';
    for (let i = 0; i < 5; i++) {
      const a1 = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const a2 = (Math.PI * 2 * (i + 0.5)) / 5 - Math.PI / 2;
      d += `${i === 0 ? 'M' : 'L'}${Math.cos(a1) * r},${Math.sin(a1) * r} L${Math.cos(a2) * r * 0.38},${Math.sin(a2) * r * 0.38} `;
    }
    return d + 'Z';
  },
  'molten droplet': (r) => `M0,${-r} Q${r * 0.8},${-r * 0.6} ${r * 0.9},${r * 0.1} Q${r * 0.5},${r * 1.1} 0,${r} Q${-r * 0.5},${r * 1.1} ${-r * 0.9},${r * 0.1} Q${-r * 0.8},${-r * 0.6} 0,${-r}Z`,
  'volcanic tube weaver': (r) => `M${-r * 0.3},${-r} L${r * 0.3},${-r} L${r * 0.5},${-r * 0.3} L${r},0 L${r * 0.5},${r * 0.3} L${r * 0.3},${r} L${-r * 0.3},${r} L${-r * 0.5},${r * 0.3} L${-r},0 L${-r * 0.5},${-r * 0.3}Z`,
  'magma-crust symbiont': (r) => `M0,${-r} Q${r * 0.6},${-r * 0.8} ${r},${-r * 0.2} Q${r * 1.1},${r * 0.4} ${r * 0.4},${r} L${-r * 0.4},${r} Q${-r * 1.1},${r * 0.4} ${-r},${-r * 0.2} Q${-r * 0.6},${-r * 0.8} 0,${-r}Z`,
};

const METAB_COLORS = {
  chemosynthesis: ['#44cc88', '#226644'],
  thermosynthesis: ['#ff8844', '#993311'],
  phototrophy: ['#66dd55', '#338822'],
  radiosynthesis: ['#cc66ff', '#662299'],
  methanotrophy: ['#88bbff', '#334488'],
  'sulfur': ['#ffcc33', '#886611'],
  cryosynthesis: ['#66eeff', '#2288aa'],
  osmotrophy: ['#55aadd', '#224466'],
  heterotrophy: ['#cc9966', '#664422'],
  mixotrophy: ['#88cc88', '#336644'],
  'iron oxidation': ['#cc6644', '#882211'],
  'plasma harvesting': ['#ff66cc', '#882266'],
  'volcanic': ['#ff5522', '#881100'],
  'ice-catalytic': ['#88eeff', '#3399bb'],
}

function getSpeciesColors(species) {
  const m = (species.traits?.metabolism || '').toLowerCase();
  for (const [key, cols] of Object.entries(METAB_COLORS)) {
    const k = key.toLowerCase().replace('_', ' ');
    if (m.includes(k)) return cols;
  }
  const rng = seededRand(hashStr(species.id || species.name || ''));
  const h = Math.floor(rng() * 360);
  return [`hsl(${h}, 65%, 55%)`, `hsl(${h}, 50%, 30%)`];
}

function CivSpeciesIcon({ species, size = 28, civ }) {
  // Special icon for civilization-tier species
  const extinct = species.extinctAt != null;
  const kLevel = civ?.kardashevLevel ?? 0;
  const stageIcon = kLevel >= 3 ? '✨' : kLevel >= 2 ? '🌐' : kLevel >= 1 ? '🚀' : '🏙️';
  return (
    <span
      className="species-svg-icon civ-species-icon"
      style={{
        width: size, height: size, fontSize: size * 0.65,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        opacity: extinct ? 0.4 : 1, lineHeight: 1,
      }}
    >
      {stageIcon}
    </span>
  );
}

function SpeciesIcon({ species, size = 28, civ }) {
  const stage = species.stage || 'simple';

  // Civilization species get a special icon
  if (stage === 'civilization') {
    return <CivSpeciesIcon species={species} size={size} civ={civ} />;
  }

  const seed = hashStr(species.id || species.name || '');
  const rng = seededRand(seed);

  const bodyType = species.traits?.bodyType || 'amorphous blob';
  const shapeFn = BODY_SHAPES[bodyType] || BODY_SHAPES['amorphous blob'];
  const [fill, stroke] = getSpeciesColors(species);
  const extinct = species.extinctAt != null;

  const r = size * 0.36;
  const bodyPath = shapeFn(r);

  const appendages = [];
  if (stage === 'complex' || stage === 'intelligent') {
    const count = stage === 'intelligent' ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const angle = (rng() * Math.PI * 2);
      const len = r * (0.5 + rng() * 0.4);
      const x1 = Math.cos(angle) * r * 0.7;
      const y1 = Math.sin(angle) * r * 0.7;
      const x2 = Math.cos(angle) * (r + len);
      const y2 = Math.sin(angle) * (r + len);
      appendages.push(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={stroke} strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
      );
    }
  }

  const eyeCount = stage === 'intelligent' ? 2 : stage === 'complex' ? 1 : 0;
  const eyes = [];
  for (let i = 0; i < eyeCount; i++) {
    const ex = (i === 0 ? -1 : 1) * r * 0.3 * (eyeCount > 1 ? 1 : 0);
    const ey = -r * 0.25;
    eyes.push(
      <circle key={`e${i}`} cx={ex} cy={ey} r={r * 0.12}
        fill="#fff" stroke={stroke} strokeWidth={0.5} />
    );
  }

  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      className="species-svg-icon" style={{ opacity: extinct ? 0.4 : 1 }}>
      {appendages}
      <path d={bodyPath} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {eyes}
      {extinct && (
        <g>
          <line x1={-r * 0.6} y1={-r * 0.6} x2={r * 0.6} y2={r * 0.6} stroke="#ff4444" strokeWidth={2} opacity={0.6} />
          <line x1={r * 0.6} y1={-r * 0.6} x2={-r * 0.6} y2={r * 0.6} stroke="#ff4444" strokeWidth={2} opacity={0.6} />
        </g>
      )}
    </svg>
  );
}

function buildTreeStructure(flatList) {
  const nodeMap = new Map();
  const roots = [];

  for (const sp of flatList) {
    nodeMap.set(sp.id, { ...sp, children: [] });
  }

  for (const sp of flatList) {
    const node = nodeMap.get(sp.id);
    if (sp.parentId && nodeMap.has(sp.parentId)) {
      nodeMap.get(sp.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const SpeciesCard = ({ species, isSelected, onClick, civ }) => {
  const alive = species.extinctAt == null;
  const stageColor = STAGE_COLORS[species.stage] || '#888';
  return (
    <button
      type="button"
      className={`evo-species-node ${alive ? 'alive' : 'extinct'} ${isSelected ? 'selected' : ''} stage-${species.stage || 'simple'}`}
      onClick={(e) => { e.stopPropagation(); onClick(species); }}
      title={species.description}
      style={{ '--stage-color': stageColor }}
    >
      <SpeciesIcon species={species} size={22} civ={civ} />
      <span className="evo-species-name">{species.name}</span>
    </button>
  );
};

const TreeBranch = ({ node, selectedId, onSelect, depth, civ }) => {
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div className="evo-branch" data-depth={depth}>
      <SpeciesCard
        species={node}
        isSelected={selectedId === node.id}
        onClick={onSelect}
        civ={civ}
      />
      {hasChildren && (
        <div className="evo-children">
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
              civ={civ}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const EvolutionTreeModal = ({ evolutionTree, lifeStage, planetName, civilization, onClose }) => {
  const [selectedSpecies, setSelectedSpecies] = useState(null);

  // Merge civilization node into tree if applicable
  const fullTree = useMemo(() => {
    const base = evolutionTree || [];
    if (!civilization || civilization.collapsed) return base;
    // Add a synthetic "civilization" node descending from dominant intelligent species
    const dominantIntelligent = [...base]
      .filter(s => s.stage === 'intelligent' && s.extinctAt === null)
      .sort((a, b) => (b.fitness || 0) - (a.fitness || 0))[0];
    const civNode = {
      id: `civ_node_${civilization.id}`,
      name: civilization.name,
      description: `${civilization.name} — ${CIV_STAGES[civilization.stage]?.description ?? ''}`,
      parentId: dominantIntelligent?.id ?? null,
      traits: {
        bodyType: 'civilization',
        metabolism: 'technology',
        locomotion: civilization.stage === 'interstellar' ? 'ftl-capable' : civilization.stage === 'space' ? 'spacefaring' : 'planetary',
        size: 'civilizational',
        intelligence: 'sapient-civilized',
      },
      fitness: Math.min(1, (civilization.techPoints ?? 0) / 5000 + 0.3),
      population: Math.min(1, (civilization.population ?? 0) / 100),
      stage: 'civilization',
      appearedAt: civilization.discoveredAt ?? 0,
      extinctAt: civilization.collapsed ? 1 : null,
      extinctReason: civilization.collapseReason ?? null,
    };
    return [...base, civNode];
  }, [evolutionTree, civilization]);

  const treeRoots = useMemo(
    () => buildTreeStructure(fullTree),
    [fullTree],
  );

  const stats = useMemo(() => {
    const list = fullTree;
    const byStage = { simple: 0, complex: 0, intelligent: 0, civilization: 0 };
    const alive = list.filter(s => s.extinctAt === null);
    const extinct = list.filter(s => s.extinctAt !== null);
    for (const s of list) if (byStage[s.stage] !== undefined) byStage[s.stage]++;
    return { total: list.length, alive: alive.length, extinct: extinct.length, byStage };
  }, [fullTree]);

  const handleSelect = useCallback((sp) => {
    setSelectedSpecies((prev) => (prev?.id === sp.id ? null : sp));
  }, []);

  const noLife = !evolutionTree || evolutionTree.length === 0;

  return (
    <div className="evo-modal-backdrop" onClick={onClose}>
      <div className="evo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="evo-modal-header">
          <h2 className="evo-modal-title">
            🌿 Evolution Tree — {planetName || 'Unknown World'}
          </h2>
          {!noLife && (
            <span className="evo-modal-counts">
              {stats.alive} living · {stats.extinct} extinct
            </span>
          )}
          <button className="evo-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Stage tier summary bar */}
        {!noLife && (
          <div className="evo-stage-bar">
            {Object.entries(stats.byStage).map(([stage, count]) => count > 0 && (
              <span key={stage} className={`evo-stage-chip stage-${stage}`}
                style={{ '--stage-color': STAGE_COLORS[stage] }}>
                {STAGE_TIER_ICON[stage]} {STAGE_LABELS[stage]} ×{count}
              </span>
            ))}
            {civilization && !civilization.collapsed && (
              <span className="evo-civ-banner"
                style={{ background: KARDASHEV_LEVELS[civilization.kardashevLevel ?? 0]?.color + '33',
                         borderColor: KARDASHEV_LEVELS[civilization.kardashevLevel ?? 0]?.color }}>
                ⭐ {CIV_STAGES[civilization.stage]?.icon ?? '🏙️'} {civilization.name}
                · K-{civilization.kardashevLevel ?? 0}
              </span>
            )}
          </div>
        )}

        <div className="evo-modal-body">
          {noLife ? (
            <div className="evo-tree-empty">
              <span className="evo-empty-icon">🌑</span>
              <p>
                {lifeStage === 'prebiotic'
                  ? `Prebiotic chemistry detected — life has not yet emerged.`
                  : `No life has evolved on ${planetName || 'this world'} yet.`}
              </p>
            </div>
          ) : (
            <div className="evo-modal-split">
              <div className="evo-modal-tree">
                <div className="evo-tree-graph">
                  {treeRoots.map((root) => (
                    <TreeBranch
                      key={root.id}
                      node={root}
                      selectedId={selectedSpecies?.id}
                      onSelect={handleSelect}
                      depth={0}
                      civ={civilization}
                    />
                  ))}
                </div>
              </div>

              <div className="evo-modal-detail">
                {selectedSpecies ? (
                  <div className={`evo-detail-card ${selectedSpecies.extinctAt != null ? 'extinct' : 'alive'} stage-${selectedSpecies.stage}`}
                    style={{ '--stage-color': STAGE_COLORS[selectedSpecies.stage] || '#888' }}>
                    <div className="evo-detail-header">
                      <SpeciesIcon species={selectedSpecies} size={48} civ={civilization} />
                      <div>
                        <div className="evo-detail-name">{selectedSpecies.name}</div>
                        <div className="evo-detail-stage" style={{ color: STAGE_COLORS[selectedSpecies.stage] }}>
                          {STAGE_TIER_ICON[selectedSpecies.stage] || ''}{' '}
                          {STAGE_LABELS[selectedSpecies.stage] || selectedSpecies.stage}
                          {selectedSpecies.extinctAt != null && (
                            <span className="evo-extinct-badge">EXTINCT</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="evo-detail-desc">{selectedSpecies.description}</p>

                    {/* Civilization extra info */}
                    {selectedSpecies.stage === 'civilization' && civilization && (
                      <div className="evo-civ-detail-extra">
                        <div className="evo-civ-detail-row">
                          <span>Stage</span>
                          <strong>{CIV_STAGES[civilization.stage]?.icon} {CIV_STAGES[civilization.stage]?.label}</strong>
                        </div>
                        <div className="evo-civ-detail-row">
                          <span>Kardashev</span>
                          <strong style={{ color: KARDASHEV_LEVELS[civilization.kardashevLevel ?? 0]?.color }}>
                            Type {civilization.kardashevLevel ?? 0}
                          </strong>
                        </div>
                        <div className="evo-civ-detail-row">
                          <span>Population</span>
                          <strong>{(civilization.population ?? 0).toFixed(3)} B</strong>
                        </div>
                        <div className="evo-civ-detail-row">
                          <span>Tech Points</span>
                          <strong>{Math.round(civilization.techPoints ?? 0)}</strong>
                        </div>
                        {(civilization.megastructures ?? []).length > 0 && (
                          <div className="evo-civ-detail-row">
                            <span>Megastructures</span>
                            <strong>{civilization.megastructures.join(', ')}</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedSpecies.traits && selectedSpecies.stage !== 'civilization' && (
                      <div className="evo-detail-traits">
                        <TraitRow label="Body" value={selectedSpecies.traits.bodyType} />
                        <TraitRow label="Metabolism" value={selectedSpecies.traits.metabolism} />
                        <TraitRow label="Locomotion" value={selectedSpecies.traits.locomotion} />
                        <TraitRow label="Size" value={selectedSpecies.traits.size} />
                        <TraitRow label="Intelligence" value={selectedSpecies.traits.intelligence} />
                      </div>
                    )}
                    {selectedSpecies.stage !== 'civilization' && (
                      <div className="evo-detail-metrics">
                        <Metric label="Fitness" value={selectedSpecies.fitness} />
                        <Metric label="Population" value={selectedSpecies.population} />
                      </div>
                    )}
                    {selectedSpecies.extinctAt != null && selectedSpecies.extinctReason && (
                      <div className="evo-detail-reason">
                        Cause: {selectedSpecies.extinctReason}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="evo-detail-placeholder">
                    Select a species to view details
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EvolutionTreeButton = ({ evolutionTree, lifeStage, planetName, civilization }) => {
  const [isOpen, setIsOpen] = useState(false);
  const count = (evolutionTree || []).length;
  const alive = (evolutionTree || []).filter(s => s.extinctAt === null).length;
  const hasCiv = civilization && !civilization.collapsed;

  return (
    <>
      <button
        className={`evo-tree-open-btn ${hasCiv ? 'has-civilization' : ''}`}
        onClick={() => setIsOpen(true)}
        title="View evolution tree"
      >
        {hasCiv ? '🏙️' : '🌿'} Evolution Tree
        {count > 0 && <span className="evo-tree-btn-count">{alive} alive</span>}
        {hasCiv && (
          <span className="evo-civ-badge"
            style={{ background: KARDASHEV_LEVELS[civilization.kardashevLevel ?? 0]?.color }}>
            K-{civilization.kardashevLevel ?? 0}
          </span>
        )}
      </button>
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <EvolutionTreeModal
            evolutionTree={evolutionTree}
            lifeStage={lifeStage}
            planetName={planetName}
            civilization={civilization}
            onClose={() => setIsOpen(false)}
          />,
          document.body,
        )}
    </>
  );
};

const TraitRow = ({ label, value }) => (
  <div className="evo-trait-row">
    <span className="evo-trait-label">{label}</span>
    <span className="evo-trait-value">{value}</span>
  </div>
);

const Metric = ({ label, value }) => (
  <div className="evo-metric">
    <span className="evo-metric-label">{label}</span>
    <div className="evo-metric-bar">
      <div className="evo-metric-fill" style={{ width: `${(value || 0) * 100}%` }} />
    </div>
    <span className="evo-metric-val">{((value || 0) * 100).toFixed(0)}%</span>
  </div>
);

export default EvolutionTreeButton;

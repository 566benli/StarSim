import React, { useState, useMemo, useCallback } from 'react';
import './EvolutionTree.css';

const STAGE_LABELS = {
  simple: 'Single-cell',
  complex: 'Multicellular',
  intelligent: 'Sapient',
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
};

const METAB_COLORS = {
  chemosynthesis: ['#44cc88', '#226644'],
  thermosynthesis: ['#ff8844', '#993311'],
  phototrophy: ['#66dd55', '#338822'],
  radiosynthesis: ['#cc66ff', '#662299'],
  methanotrophy: ['#88bbff', '#334488'],
  sulfur_oxidation: ['#ffcc33', '#886611'],
  cryosynthesis: ['#66eeff', '#2288aa'],
};

function getSpeciesColors(species) {
  const m = species.traits?.metabolism || '';
  for (const [key, cols] of Object.entries(METAB_COLORS)) {
    if (m.includes(key) || m.includes(key.replace('_', ' '))) return cols;
  }
  const rng = seededRand(hashStr(species.id || species.name || ''));
  const h = Math.floor(rng() * 360);
  return [`hsl(${h}, 65%, 55%)`, `hsl(${h}, 50%, 30%)`];
}

function SpeciesIcon({ species, size = 28 }) {
  const seed = hashStr(species.id || species.name || '');
  const rng = seededRand(seed);

  const bodyType = species.traits?.bodyType || 'amorphous blob';
  const shapeFn = BODY_SHAPES[bodyType] || BODY_SHAPES['amorphous blob'];
  const [fill, stroke] = getSpeciesColors(species);
  const stage = species.stage || 'simple';
  const extinct = species.extinctAt !== null;

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

const SpeciesCard = ({ species, isSelected, onClick }) => {
  const alive = species.extinctAt === null;
  return (
    <button
      type="button"
      className={`evo-species-node ${alive ? 'alive' : 'extinct'} ${isSelected ? 'selected' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(species); }}
      title={species.description}
    >
      <SpeciesIcon species={species} size={22} />
      <span className="evo-species-name">{species.name}</span>
    </button>
  );
};

const TreeBranch = ({ node, selectedId, onSelect, depth }) => {
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div className="evo-branch" data-depth={depth}>
      <SpeciesCard
        species={node}
        isSelected={selectedId === node.id}
        onClick={onSelect}
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

const EvolutionTreeModal = ({ evolutionTree, lifeStage, planetName, onClose }) => {
  const [selectedSpecies, setSelectedSpecies] = useState(null);

  const treeRoots = useMemo(
    () => buildTreeStructure(evolutionTree || []),
    [evolutionTree],
  );

  const stats = useMemo(() => {
    const list = evolutionTree || [];
    const alive = list.filter(s => s.extinctAt === null);
    const extinct = list.filter(s => s.extinctAt !== null);
    return { total: list.length, alive: alive.length, extinct: extinct.length };
  }, [evolutionTree]);

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
                    />
                  ))}
                </div>
              </div>

              <div className="evo-modal-detail">
                {selectedSpecies ? (
                  <div className={`evo-detail-card ${selectedSpecies.extinctAt !== null ? 'extinct' : 'alive'}`}>
                    <div className="evo-detail-header">
                      <SpeciesIcon species={selectedSpecies} size={48} />
                      <div>
                        <div className="evo-detail-name">{selectedSpecies.name}</div>
                        <div className="evo-detail-stage">
                          {STAGE_LABELS[selectedSpecies.stage] || selectedSpecies.stage}
                          {selectedSpecies.extinctAt !== null && (
                            <span className="evo-extinct-badge">EXTINCT</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="evo-detail-desc">{selectedSpecies.description}</p>
                    {selectedSpecies.traits && (
                      <div className="evo-detail-traits">
                        <TraitRow label="Body" value={selectedSpecies.traits.bodyType} />
                        <TraitRow label="Metabolism" value={selectedSpecies.traits.metabolism} />
                        <TraitRow label="Locomotion" value={selectedSpecies.traits.locomotion} />
                        <TraitRow label="Size" value={selectedSpecies.traits.size} />
                        <TraitRow label="Intelligence" value={selectedSpecies.traits.intelligence} />
                      </div>
                    )}
                    <div className="evo-detail-metrics">
                      <Metric label="Fitness" value={selectedSpecies.fitness} />
                      <Metric label="Population" value={selectedSpecies.population} />
                    </div>
                    {selectedSpecies.extinctAt !== null && selectedSpecies.extinctReason && (
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

const EvolutionTreeButton = ({ evolutionTree, lifeStage, planetName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const count = (evolutionTree || []).length;
  const alive = (evolutionTree || []).filter(s => s.extinctAt === null).length;

  return (
    <>
      <button
        className="evo-tree-open-btn"
        onClick={() => setIsOpen(true)}
        title="View evolution tree"
      >
        🌿 Evolution Tree
        {count > 0 && <span className="evo-tree-btn-count">{alive} species</span>}
      </button>
      {isOpen && (
        <EvolutionTreeModal
          evolutionTree={evolutionTree}
          lifeStage={lifeStage}
          planetName={planetName}
          onClose={() => setIsOpen(false)}
        />
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

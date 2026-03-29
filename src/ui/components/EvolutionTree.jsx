import React, { useState, useMemo, useCallback } from 'react';
import './EvolutionTree.css';

const STAGE_ICONS = {
  simple: '🦠',
  complex: '🐛',
  intelligent: '🧠',
};

const STAGE_LABELS = {
  simple: 'Single-cell',
  complex: 'Multicellular',
  intelligent: 'Sapient',
};

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
      <span className="evo-species-icon">
        {alive ? (STAGE_ICONS[species.stage] || '🦠') : '💀'}
      </span>
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

const EvolutionTree = ({ evolutionTree, lifeStage, planetName }) => {
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
    <div className="evo-tree-container">
      <h3 className="evo-tree-title">
        <span className="evo-tree-title-text">Evolution Tree</span>
        {!noLife && (
          <span className="evo-tree-counts">
            {stats.alive} living · {stats.extinct} extinct
          </span>
        )}
      </h3>

      {noLife ? (
        <div className="evo-tree-empty">
          <span className="evo-empty-icon">🌑</span>
          <p>
            {lifeStage === 'prebiotic'
              ? `Prebiotic chemistry detected on ${planetName || 'this world'} — life has not yet emerged.`
              : `No life has evolved on ${planetName || 'this world'} yet.`}
          </p>
        </div>
      ) : (
        <>
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

          {selectedSpecies && (
            <div className={`evo-detail-card ${selectedSpecies.extinctAt !== null ? 'extinct' : 'alive'}`}>
              <div className="evo-detail-header">
                <span className="evo-detail-icon">
                  {selectedSpecies.extinctAt === null
                    ? (STAGE_ICONS[selectedSpecies.stage] || '🦠')
                    : '💀'}
                </span>
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
          )}
        </>
      )}
    </div>
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

export default EvolutionTree;

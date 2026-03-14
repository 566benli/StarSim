/**
 * HRDiagram - Hertzsprung–Russell diagram (Luminosity vs Temperature)
 * Reference curves: Hurley+2000/SSE-style, Mamajek empirical (stellarReference.js)
 */
import React, { useMemo } from 'react';
import { MAIN_SEQUENCE_REF, RED_GIANT_BRANCH, WHITE_DWARF_COOLING } from '@data/stellarReference';
import './HRDiagram.css';

const W = 400;
const H = 280;
const PAD = { left: 50, right: 20, top: 20, bottom: 45 };

const log10 = Math.log10;

const HRDiagram = ({ star, allStars = [], onClose }) => {
  const { xScale, yScale } = useMemo(() => {
    const logTMin = 3.4;  // ~2500 K
    const logTMax = 4.9;  // ~80000 K
    const logLMin = -2.5;
    const logLMax = 6.5;

    const xScale = (logT) => PAD.left + ((logTMax - logT) / (logTMax - logTMin)) * (W - PAD.left - PAD.right);
    const yScale = (logL) => PAD.top + (1 - (logL - logLMin) / (logLMax - logLMin)) * (H - PAD.top - PAD.bottom);

    return { xScale, yScale };
  }, []);

  const starPoint = star ? {
    logT: log10(star.temperature || 5778),
    logL: log10(star.luminosity || 1),
    name: star.name,
  } : null;

  return (
    <div className="hr-diagram-overlay" onClick={onClose}>
      <div className="hr-diagram-modal" onClick={e => e.stopPropagation()}>
        <div className="hr-diagram-header">
          <h3>Hertzsprung–Russell Diagram</h3>
          <button className="hr-diagram-close" onClick={onClose}>✕</button>
        </div>
        <p className="hr-diagram-subtitle">Reference: Hurley+2000 / SSE-style relations</p>

        <svg className="hr-diagram-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {[3.5, 3.7, 3.9, 4.0, 4.2, 4.4, 4.6, 4.8].map(logT => (
            <line key={logT} className="hr-grid" x1={xScale(logT)} y1={PAD.top} x2={xScale(logT)} y2={H - PAD.bottom} />
          ))}
          {[-2, -1, 0, 1, 2, 3, 4, 5, 6].map(logL => (
            <line key={logL} className="hr-grid" x1={PAD.left} y1={yScale(logL)} x2={W - PAD.right} y2={yScale(logL)} />
          ))}

          {/* Red giant branch */}
          <path
            className="hr-giant-branch"
            d={RED_GIANT_BRANCH.map((p, i) =>
              `${i === 0 ? 'M' : 'L'} ${xScale(p.logT)} ${yScale(p.logL)}`
            ).join(' ')}
          />
          {/* White dwarf cooling */}
          <path
            className="hr-wd-cooling"
            d={WHITE_DWARF_COOLING.map((p, i) =>
              `${i === 0 ? 'M' : 'L'} ${xScale(p.logT)} ${yScale(p.logL)}`
            ).join(' ')}
          />
          {/* Main sequence */}
          <path
            className="hr-main-seq"
            d={MAIN_SEQUENCE_REF.map((p, i) =>
              `${i === 0 ? 'M' : 'L'} ${xScale(p.logT)} ${yScale(p.logL)}`
            ).join(' ')}
          />

          {/* All stars (small dots) */}
          {allStars.filter(s => s.type === 'star' && s.alive).map(s => (
            <circle
              key={s.id}
              className="hr-star-dot"
              cx={xScale(log10(s.temperature || 5778))}
              cy={yScale(log10(s.luminosity || 1))}
              r={3}
            />
          ))}

          {/* Selected star (highlighted) */}
          {starPoint && (
            <g className="hr-selected-star">
              <circle
                cx={xScale(starPoint.logT)}
                cy={yScale(starPoint.logL)}
                r={10}
                className="hr-selected-glow"
              />
              <circle
                cx={xScale(starPoint.logT)}
                cy={yScale(starPoint.logL)}
                r={6}
                className="hr-selected-dot"
              />
              <text
                x={xScale(starPoint.logT)}
                y={yScale(starPoint.logL) - 14}
                textAnchor="middle"
                className="hr-selected-label"
              >
                {starPoint.name}
              </text>
            </g>
          )}
        </svg>

        <div className="hr-diagram-footer">
          <div className="hr-diagram-legend">
            <span className="hr-legend-ms">— Main sequence</span>
            <span className="hr-legend-giant">- - Red giant</span>
            <span className="hr-legend-wd">· · White dwarf</span>
          </div>
          <div className="hr-diagram-axes">
            <span className="hr-axis-x">Temperature (K) →</span>
            <span className="hr-axis-y">Luminosity (L☉) ↑</span>
          </div>
        </div>
        <div className="hr-diagram-legend">
          <span><em style={{ color: 'rgba(100,150,255,0.9)' }}>—</em> Main seq</span>
          <span><em style={{ color: 'rgba(255,120,80,0.9)' }}>- -</em> Giant</span>
          <span><em style={{ color: 'rgba(200,220,255,0.9)' }}>· ·</em> WD</span>
        </div>
      </div>
    </div>
  );
};

export default HRDiagram;

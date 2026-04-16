/**
 * HRDiagram - Hertzsprung–Russell diagram (Luminosity vs Temperature)
 * Renders inline inside the InfoPanel for the selected star.
 * Reference curves: Hurley+2000/SSE-style, Mamajek empirical (stellarReference.js)
 */
import React, { useMemo } from 'react';
import { MAIN_SEQUENCE_REF, RED_GIANT_BRANCH, WHITE_DWARF_COOLING } from '@data/stellarReference';
import './HRDiagram.css';

const W = 340;
const H = 240;
const PAD = { left: 46, right: 12, top: 16, bottom: 42 };

const log10 = Math.log10;

const TEMP_TICKS = [
  { logT: 3.48, label: '3k' },
  { logT: 3.70, label: '5k' },
  { logT: 3.85, label: '7k' },
  { logT: 4.00, label: '10k' },
  { logT: 4.18, label: '15k' },
  { logT: 4.40, label: '25k' },
  { logT: 4.70, label: '50k' },
];
const LUM_TICKS = [-2, 0, 2, 4, 6];

const HRDiagram = ({ star, allStars = [], onClose }) => {
  const { xScale, yScale } = useMemo(() => {
    const logTMin = 3.4;
    const logTMax = 4.85;
    const logLMin = -2.5;
    const logLMax = 6.5;

    const xScale = (logT) => PAD.left + ((logTMax - logT) / (logTMax - logTMin)) * (W - PAD.left - PAD.right);
    const yScale = (logL) => PAD.top + (1 - (logL - logLMin) / (logLMax - logLMin)) * (H - PAD.top - PAD.bottom);

    return { xScale, yScale };
  }, []);

  const starPoint = star ? {
    logT: log10(Math.max(star.temperature || 5778, 1)),
    logL: log10(Math.max(star.luminosity || 1, 1e-4)),
    name: star.name,
    temp: star.temperature,
    lum: star.luminosity,
  } : null;

  return (
    <div className="hr-diagram-inline">
      <div className="hr-diagram-header">
        <span className="hr-diagram-title">HR Diagram</span>
        <span className="hr-diagram-subtitle-inline">Hertzsprung–Russell</span>
        {onClose && (
          <button className="hr-diagram-close" onClick={onClose} title="Close">✕</button>
        )}
      </div>

      <svg className="hr-diagram-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Temperature axis label */}
        <text x={W / 2} y={H - 4} textAnchor="middle" className="hr-axis-label">
          ← Temperature (K) (hot left)
        </text>
        {/* Luminosity axis label (rotated) */}
        <text
          x={10}
          y={PAD.top + (H - PAD.top - PAD.bottom) / 2}
          textAnchor="middle"
          className="hr-axis-label"
          transform={`rotate(-90, 10, ${PAD.top + (H - PAD.top - PAD.bottom) / 2})`}
        >
          Luminosity (L☉)
        </text>

        {/* Grid lines */}
        {TEMP_TICKS.map(({ logT, label }) => (
          <g key={logT}>
            <line className="hr-grid" x1={xScale(logT)} y1={PAD.top} x2={xScale(logT)} y2={H - PAD.bottom} />
            <text x={xScale(logT)} y={H - PAD.bottom + 12} textAnchor="middle" className="hr-tick-label">{label}</text>
          </g>
        ))}
        {LUM_TICKS.map(logL => (
          <g key={logL}>
            <line className="hr-grid" x1={PAD.left} y1={yScale(logL)} x2={W - PAD.right} y2={yScale(logL)} />
            <text x={PAD.left - 4} y={yScale(logL) + 4} textAnchor="end" className="hr-tick-label">
              {logL === 0 ? '1' : logL > 0 ? `10^${logL}` : `10^${logL}`}
            </text>
          </g>
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

        {/* All other stars (small dots) */}
        {allStars.filter(s => s.type === 'star' && s.alive && s.id !== star?.id).map(s => (
          <circle
            key={s.id}
            className="hr-star-dot"
            cx={xScale(log10(Math.max(s.temperature || 5778, 1)))}
            cy={yScale(log10(Math.max(s.luminosity || 1, 1e-4)))}
            r={3}
          />
        ))}

        {/* Selected star (highlighted) */}
        {starPoint && (
          <g className="hr-selected-star">
            <circle cx={xScale(starPoint.logT)} cy={yScale(starPoint.logL)} r={11} className="hr-selected-glow" />
            <circle cx={xScale(starPoint.logT)} cy={yScale(starPoint.logL)} r={6}  className="hr-selected-dot" />
            <text
              x={xScale(starPoint.logT)}
              y={yScale(starPoint.logL) - 15}
              textAnchor="middle"
              className="hr-selected-label"
            >
              {starPoint.name}
            </text>
          </g>
        )}
      </svg>

      {/* Live readout */}
      {starPoint && (
        <div className="hr-live-readout">
          <span>T: <strong>{Math.round(starPoint.temp).toLocaleString()} K</strong></span>
          <span>L: <strong>{starPoint.lum >= 1000
            ? `${(starPoint.lum / 1000).toFixed(1)}k L☉`
            : `${starPoint.lum.toFixed(2)} L☉`}</strong></span>
        </div>
      )}

      <div className="hr-diagram-legend-row">
        <span className="hr-legend-ms">— Main seq</span>
        <span className="hr-legend-giant">- - Giant</span>
        <span className="hr-legend-wd">· · WD</span>
      </div>
    </div>
  );
};

export default HRDiagram;

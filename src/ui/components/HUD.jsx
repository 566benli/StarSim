/**
 * HUD - Heads-Up Display overlay
 * Shows simulation stats, FPS, body count, and explorer info
 */
import React from 'react';
import { useStore } from '../store';
import { formatTime, formatNumber } from '@utils/math';
import './HUD.css';

const HUD = ({ onExitExplorer }) => {
  const { stats, simState, explorerInfo, fps } = useStore();

  return (
    <div className="hud">
      {/* Top-left: System Info */}
      <div className="hud-top-left">
        <div className="hud-stat">
          <span className="hud-label">Bodies</span>
          <span className="hud-value">{stats.bodyCount || 0}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Stars</span>
          <span className="hud-value">{stats.stars || 0}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Planets</span>
          <span className="hud-value">{stats.planets || 0}</span>
        </div>
        {(stats.blackHoles || 0) > 0 && (
          <div className="hud-stat">
            <span className="hud-label">Black Holes</span>
            <span className="hud-value">{stats.blackHoles}</span>
          </div>
        )}
      </div>

      {/* Top-right: Performance */}
      <div className="hud-top-right">
        <div className="hud-stat">
          <span className="hud-label">FPS</span>
          <span className={`hud-value ${fps < 30 ? 'warn' : ''}`}>
            {Math.round(fps)}
          </span>
        </div>
        <div className="hud-stat">
          <span className="hud-label">Energy</span>
          <span className="hud-value">{formatNumber(stats.totalEnergy || 0)}</span>
        </div>
      </div>

      {/* Explorer Mode HUD */}
      {simState === 'explorer' && explorerInfo && (
        <div className="explorer-hud">
          <button
            className="explorer-exit-btn"
            onClick={onExitExplorer}
            title="Exit to original view (Esc)"
          >
            ←
          </button>
          <div className="explorer-header">🔭 EXPLORER MODE</div>
          <div className="explorer-region">{explorerInfo.region}</div>

          <div className="explorer-stats">
            <div className="explorer-stat">
              <span className="stat-icon">🌡️</span>
              <span className="stat-label">Temperature</span>
              <span className="stat-value">{formatNumber(explorerInfo.localTemp)} K</span>
            </div>
            <div className="explorer-stat">
              <span className="stat-icon">⚖️</span>
              <span className="stat-label">Density</span>
              <span className="stat-value">{formatNumber(explorerInfo.localDensity || 0)} g/cm³</span>
            </div>
            {explorerInfo.depth > 0 && (
              <div className="explorer-stat">
                <span className="stat-icon">📏</span>
                <span className="stat-label">Depth</span>
                <span className="stat-value">{(explorerInfo.depth * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>

          <div className="explorer-controls-hint">
            WASD - Move | Right-drag - Look | Space/Shift - Up/Down | Ctrl - Sprint | Esc - Exit
          </div>
        </div>
      )}
    </div>
  );
};

export default HUD;

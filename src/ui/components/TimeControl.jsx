/**
 * TimeControl - The time arrow control bar
 * Beautiful scrubber with speed presets, play/pause, and time display.
 * Supports fast-forward mode: above the physics cap, orbits stay smooth
 * while stellar evolution runs at the full requested rate (up to 1 Gyr/s).
 */
import React from 'react';
import { useStore } from '../store';
import { formatTime } from '@utils/math';
import './TimeControl.css';

const TIME_PRESETS = [
  { label: '1s/s',     value: 3.17e-8, icon: '⏸️' },
  { label: '1 hr/s',   value: 1.14e-4, icon: '▶' },
  { label: '1 day/s',  value: 2.74e-3, icon: '▶▶' },
  { label: '1 yr/s',   value: 1,       icon: '⏩' },
  { label: '100 yr/s', value: 100,     icon: '⏩⏩' },
  { label: '1 Myr/s',  value: 1e6,     icon: '🚀' },
  { label: '1 Gyr/s',  value: 1e9,     icon: '💫' },
];

const TimeControl = ({ engine, onResumeFromExplorer }) => {
  const {
    simState,
    simulationTime,
    timeScale,
    setTimeScale,
    setSimState,
  } = useStore();

  const togglePlay = () => {
    if (!engine) return;
    if (simState === 'explorer') return;
    if (simState === 'running') {
      engine.pause();
      setSimState('paused');
    } else {
      if (simState === 'explorer' && onResumeFromExplorer) {
        onResumeFromExplorer();
      }
      engine.resume();
      setSimState('running');
    }
  };

  const maxTimeScale = engine?.getMaxTimeScale?.() ?? 1e9;
  const physicsMax = engine?.getMaxPhysicsTimeScale?.() ?? 100;
  const effectiveScale = engine ? engine.timeScale : timeScale;
  const isFastForward = effectiveScale > physicsMax;

  const setSpeed = (preset) => {
    if (!engine) return;
    if (simState === 'explorer') return;
    engine.setTimeScale(preset.value);
    setTimeScale(engine.timeScale);
    if (simState !== 'running') {
      if (simState === 'explorer' && onResumeFromExplorer) {
        onResumeFromExplorer();
      }
      engine.resume();
      setSimState('running');
    }
  };

  const handleSliderChange = (e) => {
    if (!engine) return;
    if (simState === 'explorer') return;
    const logValue = parseFloat(e.target.value);
    engine.setTimeScale(Math.pow(10, logValue));
    setTimeScale(engine.timeScale);
  };

  const formatTimeScale = (scale) => {
    if (scale < 1e-6) return `${(scale * 3.154e7).toFixed(1)} sec/s`;
    if (scale < 1e-3) return `${(scale * 365.25).toFixed(1)} days/s`;
    if (scale < 1) return `${(scale * 12).toFixed(1)} months/s`;
    if (scale < 1e3) return `${scale.toFixed(1)} yr/s`;
    if (scale < 1e6) return `${(scale / 1e3).toFixed(1)} Kyr/s`;
    if (scale < 1e9) return `${(scale / 1e6).toFixed(1)} Myr/s`;
    return `${(scale / 1e9).toFixed(1)} Gyr/s`;
  };

  const sliderMin = -8;
  const sliderMax = Math.log10(Math.max(maxTimeScale, 1));
  const physicsMaxLog = Math.log10(Math.max(physicsMax, 1));
  const sliderValue = Math.log10(Math.max(Math.min(effectiveScale, maxTimeScale), 1e-8));
  const physicsThresholdPercent = ((physicsMaxLog - sliderMin) / (sliderMax - sliderMin)) * 100;

  return (
    <div className={`time-control ${isFastForward ? 'fast-forward-active' : ''}`}>
      <div className="time-display">
        <div className="time-label">Simulation Time</div>
        <div className="time-value">{formatTime(simulationTime)}</div>
      </div>

      <div className="time-controls">
        <button
          className={`time-btn play-btn ${simState === 'running' ? 'playing' : ''}`}
          onClick={togglePlay}
          disabled={simState === 'explorer'}
        >
          {simState === 'running' ? '⏸' : '▶'}
        </button>

        <div className="speed-presets">
          {TIME_PRESETS.map((preset, i) => {
            const abovePhysics = preset.value > physicsMax;
            return (
              <button
                key={i}
                className={`speed-btn ${abovePhysics ? 'warp' : ''} ${Math.abs(effectiveScale - preset.value) < preset.value * 0.1 ? 'active' : ''}`}
                onClick={() => setSpeed(preset)}
                title={`${preset.label}${abovePhysics ? ' (Fast-Forward)' : ''}`}
                disabled={simState === 'explorer'}
              >
                {preset.icon}
              </button>
            );
          })}
        </div>

        <div className="speed-slider">
          <div className="slider-track-wrapper">
            <div
              className="physics-zone-marker"
              style={{ width: `${physicsThresholdPercent}%` }}
              title={`N-body physics up to ${formatTimeScale(physicsMax)}`}
            />
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step="0.1"
              value={sliderValue}
              onChange={handleSliderChange}
              className={`time-slider ${isFastForward ? 'warp-slider' : ''}`}
              title={isFastForward
                ? `Fast-Forward: orbits at ${formatTimeScale(physicsMax)}, evolution at ${formatTimeScale(effectiveScale)}`
                : formatTimeScale(effectiveScale)}
            />
          </div>
          <div className="speed-display">
            {formatTimeScale(effectiveScale)}
            {isFastForward && <span className="warp-badge">WARP</span>}
          </div>
        </div>
      </div>

      <div className={`state-indicator ${simState} ${isFastForward ? 'fast-forward' : ''}`}>
        {simState === 'running' && !isFastForward && '● LIVE'}
        {simState === 'running' && isFastForward && '⚡ WARP'}
        {simState === 'paused' && '⏸ PAUSED'}
        {simState === 'explorer' && '🔭 EXPLORER'}
        {simState === 'setup' && '🔧 SETUP'}
      </div>
    </div>
  );
};

export default TimeControl;

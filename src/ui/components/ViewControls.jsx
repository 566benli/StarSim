/**
 * ViewControls - Draggable zoom/scale ruler and view control buttons
 * Lets the user manually adjust the visual size of celestial bodies
 * and control the camera framing
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';

/** Close fit menu when clicking outside */
function useClickOutside(ref, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, ref]);
}
import './ViewControls.css';

const ViewControls = ({ sceneManager, getBodies }) => {
  const [viewScale, setViewScale] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showFitMenu, setShowFitMenu] = useState(false);
  const fitWrapperRef = useRef(null);
  useClickOutside(fitWrapperRef, showFitMenu, () => setShowFitMenu(false));
  const sliderRef = useRef(null);
  const trackRef = useRef(null);

  // Logarithmic scale: slider position (0-1) maps to viewScale (0.1 - 10)
  const scaleToSlider = (scale) => {
    // log10(0.1) = -1, log10(10) = 1, mapped to 0-1
    return (Math.log10(scale) + 1) / 2;
  };

  const sliderToScale = (sliderVal) => {
    // 0 -> 0.1, 0.5 -> 1.0, 1.0 -> 10.0
    return Math.pow(10, sliderVal * 2 - 1);
  };

  const sliderPosition = scaleToSlider(viewScale);

  const updateScale = useCallback((newScale) => {
    const clamped = Math.max(0.1, Math.min(10, newScale));
    setViewScale(clamped);
    if (sceneManager) {
      sceneManager.setViewScale(clamped);
    }
  }, [sceneManager]);

  const handleSliderChange = useCallback((e) => {
    const val = parseFloat(e.target.value) / 100;
    updateScale(sliderToScale(val));
  }, [updateScale]);

  // Drag on the visual ruler track
  const handleTrackPointerDown = useCallback((e) => {
    setIsDragging(true);
    e.target.setPointerCapture(e.pointerId);
    handleTrackPointerMove(e);
  }, []);

  const handleTrackPointerMove = useCallback((e) => {
    if (!isDragging && e.type === 'pointermove') return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    // Vertical slider: top = max (10x), bottom = min (0.1x)
    const fraction = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    updateScale(sliderToScale(fraction));
  }, [isDragging, updateScale]);

  const handleTrackPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFitAll = useCallback(() => {
    if (sceneManager) {
      const bodies = getBodies?.() ?? [];
      if (bodies.length > 0) {
        sceneManager.computeSystemMetrics(bodies);
      }
      sceneManager.fitAllBodies();
    }
  }, [sceneManager, getBodies]);

  const handleFitFiltered = useCallback((filter) => {
    if (!sceneManager || !getBodies) return;
    const bodies = getBodies().filter(filter);
    sceneManager.fitBodiesFiltered(bodies);
    setShowFitMenu(false);
  }, [sceneManager, getBodies]);

  const handleFitOnStar = useCallback((star) => {
    if (sceneManager && star) {
      sceneManager.fitOnBody(star, 5);
    }
    setShowFitMenu(false);
  }, [sceneManager]);

  const bodies = (getBodies?.() ?? []).filter(b => b.alive);
  const stars = bodies.filter(b => b.type === 'star');

  const VIEW_PROJECTIONS = [
    { id: 'isometric', label: '3D', icon: '◇', title: 'Isometric 3D view' },
    { id: 'top', label: 'Top', icon: '⬆', title: 'Top-down (orbits as circles)' },
    { id: 'side', label: 'Side', icon: '▬', title: 'Side / edge-on view' },
    { id: 'front', label: 'Front', icon: '◐', title: 'Front view' },
  ];

  const handleResetScale = useCallback(() => {
    updateScale(1.0);
  }, [updateScale]);

  const handleZoomIn = useCallback(() => {
    updateScale(viewScale * 1.3);
  }, [viewScale, updateScale]);

  const handleZoomOut = useCallback(() => {
    updateScale(viewScale / 1.3);
  }, [viewScale, updateScale]);

  // Mouse wheel on the ruler
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    updateScale(viewScale * delta);
  }, [viewScale, updateScale]);

  // Scale display text
  const getScaleLabel = () => {
    if (viewScale >= 2) return `${viewScale.toFixed(1)}x`;
    if (viewScale >= 0.5) return `${viewScale.toFixed(2)}x`;
    return `${viewScale.toFixed(2)}x`;
  };

  // Ruler tick marks
  const ticks = [
    { value: 0.1, label: '0.1x' },
    { value: 0.25, label: '' },
    { value: 0.5, label: '0.5x' },
    { value: 1.0, label: '1x' },
    { value: 2.0, label: '2x' },
    { value: 5.0, label: '5x' },
    { value: 10.0, label: '10x' },
  ];

  return (
    <div className="view-controls">
      {/* Scale Label */}
      <div className="view-scale-label" title="Current body scale">
        🔭 {getScaleLabel()}
      </div>

      {/* Vertical Ruler Track */}
      <div
        className="view-ruler-track"
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerLeave={handleTrackPointerUp}
        onWheel={handleWheel}
      >
        {/* Tick marks */}
        {ticks.map((tick) => {
          const pos = (1 - scaleToSlider(tick.value)) * 100;
          return (
            <div
              key={tick.value}
              className="ruler-tick"
              style={{ top: `${pos}%` }}
            >
              <div className="tick-line" />
              {tick.label && <div className="tick-label">{tick.label}</div>}
            </div>
          );
        })}

        {/* Thumb / Handle */}
        <div
          className={`ruler-thumb ${isDragging ? 'dragging' : ''}`}
          style={{ top: `${(1 - sliderPosition) * 100}%` }}
        >
          <div className="thumb-indicator" />
        </div>

        {/* Fill bar (from bottom to current) */}
        <div
          className="ruler-fill"
          style={{ height: `${sliderPosition * 100}%` }}
        />
      </div>

      {/* View Projection Presets (Universe Sandbox style) */}
      <div className="view-projections">
        {VIEW_PROJECTIONS.map((p) => (
          <button
            key={p.id}
            className="view-proj-btn"
            onClick={() => sceneManager?.setViewProjection?.(p.id)}
            title={p.title}
          >
            {p.icon}
          </button>
        ))}
      </div>

      {/* Control Buttons */}
      <div className="view-buttons">
        <button
          className="view-btn"
          onClick={handleZoomIn}
          title="Increase body size (+)"
        >
          +
        </button>
        <button
          className="view-btn"
          onClick={handleResetScale}
          title="Reset to 1x (R)"
        >
          ⟲
        </button>
        <button
          className="view-btn"
          onClick={handleZoomOut}
          title="Decrease body size (-)"
        >
          −
        </button>
        <div className="view-fit-wrapper" ref={fitWrapperRef}>
          <button
            className="view-btn fit-all"
            onClick={() => setShowFitMenu(v => !v)}
            title="Fit view – choose center (F)"
          >
            ⊞ Fit
          </button>
          {showFitMenu && (
            <div className="view-fit-menu">
              <button
                className="view-fit-item"
                onClick={() => handleFitFiltered(() => true)}
              >
                ⭐🪐 All objects
              </button>
              <button
                className="view-fit-item"
                onClick={() => handleFitFiltered(b => b.type === 'star')}
              >
                ⭐ Stars only
              </button>
              <button
                className="view-fit-item"
                onClick={() => handleFitFiltered(b => b.type === 'star' || b.type === 'planet')}
              >
                ⭐🪐 Stars + Planets
              </button>
              <div className="view-fit-divider" />
              <div className="view-fit-subtitle">Fit on star:</div>
              {stars.map((star) => (
                <button
                  key={star.id}
                  className="view-fit-item"
                  onClick={() => handleFitOnStar(star)}
                >
                  ⭐ {star.name}
                </button>
              ))}
              {stars.length === 0 && (
                <div className="view-fit-hint">No stars in simulation</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewControls;

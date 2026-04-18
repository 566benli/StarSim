import React, { useEffect, useMemo, useRef } from 'react';
import './UniverseCoordinatePanel.css';

export default function UniverseCoordinatePanel({ coords, screenPos, onGoToCoordinate, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const timer = setTimeout(() => window.addEventListener('pointerdown', handleClick), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handleClick);
    };
  }, [onClose]);

  const clampedPos = useMemo(() => {
    const pw = 320;
    const ph = 210;
    const x = Math.max(12, Math.min((screenPos?.x ?? 220) - pw / 2, window.innerWidth - pw - 12));
    const y = Math.max(54, Math.min((screenPos?.y ?? 220) - ph - 18, window.innerHeight - ph - 12));
    return { x, y };
  }, [screenPos]);

  if (!coords) return null;

  const coordText = [
    coords.x.toFixed(2),
    coords.y.toFixed(2),
    coords.z.toFixed(2),
  ].join(', ');

  return (
    <div
      className="universe-coordinate-panel"
      ref={panelRef}
      style={{ left: clampedPos.x, top: clampedPos.y }}
    >
      <div className="ucp-header">
        <div className="ucp-title-block">
          <h3>Universe Coordinate</h3>
          <span>Click-to-create at Mly scale</span>
        </div>
        <button className="ucp-close" onClick={onClose}>×</button>
      </div>

      <div className="ucp-grid">
        <div className="ucp-row">
          <span className="ucp-key">X</span>
          <span className="ucp-val">{coords.x.toFixed(2)} Mly</span>
        </div>
        <div className="ucp-row">
          <span className="ucp-key">Y</span>
          <span className="ucp-val">{coords.y.toFixed(2)} Mly</span>
        </div>
        <div className="ucp-row">
          <span className="ucp-key">Z</span>
          <span className="ucp-val">{coords.z.toFixed(2)} Mly</span>
        </div>
      </div>

      <p className="ucp-copy">
        Go here to open an empty system at this coordinate. If a nearby galaxy already exists,
        Genesis Error will add a new system there; otherwise it creates a new galaxy first.
      </p>

      <div className="ucp-actions">
        <button className="ucp-btn secondary" onClick={onClose}>Close</button>
        <button
          className="ucp-btn primary"
          onClick={() => onGoToCoordinate?.(coords)}
          title={coordText}
        >
          Go Here
        </button>
      </div>
    </div>
  );
}

/**
 * ClusterInfoPanel - Popup panel when clicking a cluster (diamond) in universe view.
 * Shows cluster name, type, system/body summary, a mini orbital preview, and "Go to System".
 */
import React, { useMemo, useRef, useEffect } from 'react';
import { formatNumber } from '@utils/math';
import './ClusterInfoPanel.css';

const ClusterInfoPanel = ({ cluster, systems, bodies, screenPos, onGoToSystem, onClose }) => {
  const panelRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const timer = setTimeout(() => window.addEventListener('pointerdown', handleClick), 50);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', handleClick); };
  }, [onClose]);

  const summary = useMemo(() => {
    const alive = bodies.filter(b => b.alive);
    return {
      stars: alive.filter(b => b.type === 'star'),
      planets: alive.filter(b => b.type === 'planet'),
      blackHoles: alive.filter(b => b.type === 'black_hole'),
      totalMass: alive.reduce((s, b) => s + b.mass, 0),
    };
  }, [bodies]);

  const clampedPos = useMemo(() => {
    const pw = 300, ph = 380;
    const x = Math.max(10, Math.min((screenPos?.x ?? 200) - pw / 2, window.innerWidth - pw - 10));
    const y = Math.max(50, Math.min((screenPos?.y ?? 200) - ph - 20, window.innerHeight - ph - 10));
    return { x, y };
  }, [screenPos]);

  return (
    <div
      className="cluster-info-panel"
      ref={panelRef}
      style={{ left: clampedPos.x, top: clampedPos.y }}
    >
      <div className="cip-header">
        <span className="cip-color-dot" style={{ background: cluster.color || '#6688ff' }} />
        <div className="cip-title-block">
          <h3 className="cip-name">{cluster.name}</h3>
          <span className="cip-type">{cluster.type || 'spiral'} cluster</span>
        </div>
        <button className="cip-close" onClick={onClose}>&#x2715;</button>
      </div>

      {/* Mini orbital preview canvas */}
      <MiniOrbitalPreview bodies={bodies} cluster={cluster} />

      <div className="cip-stats">
        <div className="cip-stat-row">
          <span className="cip-stat-icon">&#x2B50;</span>
          <span className="cip-stat-label">Stars</span>
          <span className="cip-stat-value">{summary.stars.length}</span>
        </div>
        <div className="cip-stat-row">
          <span className="cip-stat-icon">&#x1F30D;</span>
          <span className="cip-stat-label">Planets</span>
          <span className="cip-stat-value">{summary.planets.length}</span>
        </div>
        {summary.blackHoles.length > 0 && (
          <div className="cip-stat-row">
            <span className="cip-stat-icon">&#x26AB;</span>
            <span className="cip-stat-label">Black Holes</span>
            <span className="cip-stat-value">{summary.blackHoles.length}</span>
          </div>
        )}
        <div className="cip-stat-row">
          <span className="cip-stat-icon">&#x2696;</span>
          <span className="cip-stat-label">Total Mass</span>
          <span className="cip-stat-value">{formatNumber(summary.totalMass)} M&#x2609;</span>
        </div>
        <div className="cip-stat-row">
          <span className="cip-stat-icon">&#x2699;</span>
          <span className="cip-stat-label">Systems</span>
          <span className="cip-stat-value">{systems.length}</span>
        </div>
      </div>

      {/* Body list (top 6) */}
      {bodies.length > 0 && (
        <div className="cip-body-list">
          {bodies.filter(b => b.alive).slice(0, 6).map(b => (
            <div key={b.id} className="cip-body-chip">
              <span className="cip-body-icon">
                {b.type === 'star' ? '\u2B50' : b.type === 'black_hole' ? '\u26AB' : '\uD83C\uDF0D'}
              </span>
              <span className="cip-body-name">{b.name}</span>
            </div>
          ))}
          {bodies.filter(b => b.alive).length > 6 && (
            <div className="cip-body-chip cip-more">+{bodies.filter(b => b.alive).length - 6} more</div>
          )}
        </div>
      )}

      <button className="cip-go-btn" onClick={() => onGoToSystem?.(cluster.id)}>
        &#x1F680; Go to System
      </button>
    </div>
  );
};

/**
 * Tiny animated canvas showing a simplified top-down orbital sketch.
 */
const MiniOrbitalPreview = ({ bodies, cluster }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    const alive = bodies.filter(b => b.alive);
    const stars = alive.filter(b => b.type === 'star');
    const planets = alive.filter(b => b.type === 'planet');

    if (alive.length === 0) {
      ctx.fillStyle = '#0a0a1e';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#334';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No bodies', cx, cy);
      return;
    }

    const maxDist = Math.max(
      ...planets.map(p => p.orbitalDistance || p.position?.distanceTo?.(stars[0]?.position) || 5),
      3
    );
    const scale = (Math.min(W, H) / 2 - 14) / maxDist;

    let t = 0;
    const draw = () => {
      t += 0.02;
      ctx.fillStyle = 'rgba(8, 8, 24, 0.35)';
      ctx.fillRect(0, 0, W, H);

      // Orbit rings
      ctx.strokeStyle = 'rgba(80, 120, 200, 0.15)';
      ctx.lineWidth = 0.5;
      for (const p of planets) {
        const r = (p.orbitalDistance || 2) * scale;
        if (r > 2 && r < W / 2) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Stars
      for (let i = 0; i < stars.length; i++) {
        const pulse = 3.5 + Math.sin(t * 2 + i) * 0.8;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulse * 2.5);
        glow.addColorStop(0, 'rgba(255, 220, 100, 0.9)');
        glow.addColorStop(0.4, 'rgba(255, 180, 60, 0.4)');
        glow.addColorStop(1, 'rgba(255, 140, 30, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, pulse * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffdd66';
        ctx.beginPath();
        ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      // Planets
      for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        const orb = (p.orbitalDistance || (2 + i * 1.5)) * scale;
        const speed = 0.5 / Math.sqrt(Math.max(0.5, p.orbitalDistance || 2));
        const angle = t * speed + (i * Math.PI * 2 / Math.max(1, planets.length));
        const px = cx + orb * Math.cos(angle);
        const py = cy + orb * Math.sin(angle);
        const pr = Math.max(1.5, Math.min(3.5, 2 + (p.mass || 0.001) * 500));

        ctx.fillStyle = p.color || '#5599dd';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(px - pr * 0.3, py - pr * 0.3, pr * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, W, H);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [bodies, cluster]);

  return (
    <div className="cip-preview">
      <canvas ref={canvasRef} width={260} height={130} className="cip-canvas" />
    </div>
  );
};

export default ClusterInfoPanel;

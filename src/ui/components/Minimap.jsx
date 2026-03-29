/**
 * Minimap - Context-aware overview map.
 * - Universe view: shows clusters as colored dots
 * - System view: shows bodies (stars, planets) within the focused system
 * - Body view: shows nearby bodies around the focused body
 * Always draggable. Click to navigate/select.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStore } from '../store';
import { VIEW_LEVEL } from '@utils/constants';
import './Minimap.css';

const STORAGE_KEY = 'starsim-minimap-position';

const loadPosition = () => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const { x, y } = JSON.parse(s);
      if (typeof x === 'number' && typeof y === 'number') return { x, y };
    }
  } catch (_) {}
  return null;
};

const savePosition = (pos) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch (_) {}
};

const clampPosition = (left, top) => {
  const w = typeof window !== 'undefined' ? window.innerWidth : 800;
  const h = typeof window !== 'undefined' ? window.innerHeight : 600;
  return {
    left: Math.max(4, Math.min(w - 132, left)),
    top: Math.max(4, Math.min(h - 156, top)),
  };
};

const Minimap = ({
  getBodies,
  sceneManager,
  selectedBodyId,
  simState,
  onBodySelected,
  engine,
  onNavigateToCluster,
  onNavigateToBody,
}) => {
  const canvasRef = useRef(null);
  const isMapDragging = useRef(false);
  const isPanelDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pointerDownPos = useRef(null);
  const hasDragged = useRef(false);
  const { viewLevel, focusedSystemId } = useStore();

  const [position, setPosition] = useState(() => {
    const saved = loadPosition();
    if (saved) return clampPosition(saved.x, saved.y);
    return clampPosition(
      (typeof window !== 'undefined' ? window.innerWidth : 800) - 148,
      40
    );
  });

  const getVisibleBodies = useCallback(() => {
    const bodies = getBodies ? getBodies() : [];
    let aliveBodies = (bodies || []).filter(b => b.alive);

    if (viewLevel === VIEW_LEVEL.SYSTEM && focusedSystemId) {
      aliveBodies = aliveBodies.filter(b => b.systemId === focusedSystemId);
    }
    if (viewLevel === VIEW_LEVEL.BODY && selectedBodyId) {
      const focused = aliveBodies.find(b => b.id === selectedBodyId);
      const sysId = focused?.systemId;
      if (sysId) {
        aliveBodies = aliveBodies.filter(b => b.systemId === sysId);
      }
    }
    return aliveBodies;
  }, [getBodies, viewLevel, focusedSystemId, selectedBodyId]);

  const worldToMap = useCallback((wx, wz, com, extent, size) => {
    const padding = 8;
    const r = (size - padding * 2) / 2;
    const sx = (wx - com.x) / extent * r + size / 2;
    const sy = -(wz - (com.z ?? 0)) / extent * r + size / 2;
    return { x: sx, y: sy };
  }, []);

  const mapToWorld = useCallback((mx, my, com, extent, size) => {
    const padding = 8;
    const r = (size - padding * 2) / 2;
    const wx = (mx - size / 2) / r * extent + com.x;
    const wz = -(my - size / 2) / r * extent + (com.z ?? 0);
    return { x: wx, z: wz };
  }, []);

  const drawUniverse = useCallback((ctx, size) => {
    if (!engine?.universe) return;
    const clusters = engine.universe.clusters.filter(c => c.alive);
    const rogueBodies = (engine.getBodies?.() || []).filter((b) => b.alive && b.escapedSystem);
    if (clusters.length === 0) {
      ctx.fillStyle = '#556';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rogueBodies.length > 0 ? 'Rogue bodies tracked' : 'Empty Universe', size / 2, size / 2);
      if (rogueBodies.length === 0) return;
    }

    let maxDist = 1;
    for (const c of clusters) {
      const d = c.position.length() * 0.4;
      if (d > maxDist) maxDist = d;
    }
    for (const body of rogueBodies) {
      const up = engine.getBodyUniversePosition?.(body);
      const d = Math.hypot((up?.x || 0) * 0.4, (up?.z || 0) * 0.4);
      if (d > maxDist) maxDist = d;
    }
    const extent = maxDist * 1.3;

    for (const cluster of clusters) {
      const pos = worldToMap(
        cluster.position.x * 0.4,
        cluster.position.z * 0.4,
        { x: 0, z: 0 }, extent, size
      );

      const dx = pos.x - size / 2;
      const dy = pos.y - size / 2;
      const r = (size - 16) / 2;
      const dist = Math.hypot(dx, dy);
      if (dist > r - 2) {
        const scale = (r - 2) / dist;
        pos.x = size / 2 + dx * scale;
        pos.y = size / 2 + dy * scale;
      }

      const clusterSize = Math.max(3, cluster.size / 20);
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, clusterSize * 2);
      glow.addColorStop(0, cluster.color || '#6688ff');
      glow.addColorStop(0.5, `${cluster.color || '#6688ff'}66`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, clusterSize * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cluster.color || '#6688ff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, clusterSize, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const body of rogueBodies) {
      const up = engine.getBodyUniversePosition?.(body);
      const pos = worldToMap(
        (up?.x || 0) * 0.4,
        (up?.z || 0) * 0.4,
        { x: 0, z: 0 }, extent, size
      );
      ctx.fillStyle = body.type === 'planet'
        ? 'rgba(110, 210, 255, 0.95)'
        : body.type === 'black_hole'
          ? 'rgba(210, 150, 255, 0.95)'
          : 'rgba(255, 220, 120, 0.95)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }, [engine, worldToMap]);

  const drawBodies = useCallback((ctx, size) => {
    if (!sceneManager) return;
    const aliveBodies = getVisibleBodies();

    if (aliveBodies.length === 0) return;

    let comX = 0, comZ = 0, totalMass = 0;
    for (const b of aliveBodies) {
      comX += b.position.x * b.mass;
      comZ += b.position.z * b.mass;
      totalMass += b.mass;
    }
    if (totalMass > 0) { comX /= totalMass; comZ /= totalMass; }

    let maxDist = 0.5;
    for (const b of aliveBodies) {
      const d = Math.hypot(b.position.x - comX, b.position.z - comZ);
      if (d > maxDist) maxDist = d;
    }

    const extent = Math.max(maxDist * 1.2, 0.1);
    const com = { x: comX, z: comZ };

    for (const body of aliveBodies) {
      let px = (body.position.x - com.x) / extent * ((size - 16) / 2) + size / 2;
      let py = -(body.position.z - (com.z ?? 0)) / extent * ((size - 16) / 2) + size / 2;

      const r = (size - 16) / 2;
      const dx = px - size / 2;
      const dy = py - size / 2;
      const dist = Math.hypot(dx, dy);
      if (dist > r - 2) {
        const scale = (r - 2) / dist;
        px = size / 2 + dx * scale;
        py = size / 2 + dy * scale;
      }

      const selected = body.id === selectedBodyId;

      if (body.type === 'star') {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 6);
        glow.addColorStop(0, selected ? '#00ffff' : 'rgba(255, 220, 150, 0.9)');
        glow.addColorStop(0.5, selected ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 180, 80, 0.4)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = selected ? '#00ffff' : '#ffcc66';
      } else if (body.type === 'planet') {
        ctx.fillStyle = selected ? '#00ff88' : 'rgba(100, 200, 255, 0.8)';
      } else {
        ctx.fillStyle = selected ? '#ff44aa' : 'rgba(150, 100, 255, 0.8)';
      }

      const dotSize = body.type === 'star' ? 3 : 2;
      ctx.beginPath();
      ctx.arc(px, py, dotSize, 0, Math.PI * 2);
      ctx.fill();

      if (selected) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const camTarget = sceneManager?.controls?.target;
    if (camTarget) {
      const tp = worldToMap(camTarget.x, camTarget.z ?? 0, com, extent, size);
      const r = (size - 16) / 2;
      if (Math.hypot(tp.x - size / 2, tp.y - size / 2) <= r) {
        ctx.strokeStyle = 'rgba(0, 204, 255, 0.8)';
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [getVisibleBodies, sceneManager, selectedBodyId, worldToMap]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const r = (size - 16) / 2;

    ctx.fillStyle = 'rgba(5, 5, 25, 0.9)';
    ctx.fillRect(0, 0, size, size);

    // Border circle
    ctx.strokeStyle = viewLevel === VIEW_LEVEL.UNIVERSE
      ? 'rgba(255, 68, 68, 0.3)'
      : 'rgba(68, 136, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(20, 20, 60, 0.8)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r - 1, 0, Math.PI * 2);
    ctx.fill();

    if (viewLevel === VIEW_LEVEL.UNIVERSE) {
      drawUniverse(ctx, size);
    } else {
      drawBodies(ctx, size);
    }

    // View level indicator
    ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'right';
    const labels = {
      [VIEW_LEVEL.UNIVERSE]: 'UNIVERSE',
      [VIEW_LEVEL.SYSTEM]: 'SYSTEM',
      [VIEW_LEVEL.BODY]: 'BODY',
    };
    ctx.fillText(labels[viewLevel] || '', size - 6, size - 4);
  }, [viewLevel, drawUniverse, drawBodies]);

  useEffect(() => {
    let id;
    const tick = () => {
      draw();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [draw]);

  const handleMapPointerDown = useCallback((e) => {
    if (!sceneManager) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    pointerDownPos.current = { x: mx, y: my };
    hasDragged.current = false;

    if (viewLevel !== VIEW_LEVEL.UNIVERSE) {
      const metrics = sceneManager.getSystemMetrics();
      const extent = Math.max(metrics?.extent || 1, 0.1);
      const com = metrics?.com || { x: 0, z: 0 };
      const world = mapToWorld(mx, my, com, extent, canvasRef.current?.width || 128);
      if (world) {
        sceneManager.setCameraTarget(world.x, world.z);
        isMapDragging.current = true;
        lastPos.current = { x: mx, y: my };
      }
    } else {
      isMapDragging.current = true;
      lastPos.current = { x: mx, y: my };
    }
  }, [sceneManager, viewLevel, mapToWorld]);

  const handleMapPointerMove = useCallback((e) => {
    if (!isMapDragging.current || !sceneManager) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - lastPos.current.x;
    const dy = my - lastPos.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDragged.current = true;

    if (viewLevel !== VIEW_LEVEL.UNIVERSE) {
      const metrics = sceneManager.getSystemMetrics();
      const extent = Math.max(metrics?.extent || 1, 0.1);
      const com = metrics?.com || { x: 0, z: 0 };
      const world = mapToWorld(mx, my, com, extent, canvasRef.current?.width || 128);
      if (world) {
        sceneManager.setCameraTarget(world.x, world.z);
      }
    }
    lastPos.current = { x: mx, y: my };
  }, [sceneManager, viewLevel, mapToWorld]);

  const handleMapPointerUp = useCallback(() => {
    if (
      !hasDragged.current &&
      pointerDownPos.current &&
      sceneManager
    ) {
      const mx = pointerDownPos.current.x;
      const my = pointerDownPos.current.y;
      const size = canvasRef.current?.width || 128;
      const r = (size - 16) / 2;

      if (viewLevel === VIEW_LEVEL.UNIVERSE && engine?.universe) {
        const clusters = engine.universe.clusters.filter(c => c.alive);
        const rogueBodies = (engine.getBodies?.() || []).filter((b) => b.alive && b.escapedSystem);
        let maxDist = 1;
        for (const c of clusters) {
          const d = c.position.length() * 0.4;
          if (d > maxDist) maxDist = d;
        }
        for (const body of rogueBodies) {
          const up = engine.getBodyUniversePosition?.(body);
          const d = Math.hypot((up?.x || 0) * 0.4, (up?.z || 0) * 0.4);
          if (d > maxDist) maxDist = d;
        }
        const extent = maxDist * 1.3;
        let nearest = null;
        let nearestDist = 16;
        let nearestRogue = null;
        let nearestRogueDist = 12;
        for (const cluster of clusters) {
          const pos = worldToMap(
            cluster.position.x * 0.4,
            cluster.position.z * 0.4,
            { x: 0, z: 0 }, extent, size
          );
          const d = Math.hypot(mx - pos.x, my - pos.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = cluster;
          }
        }
        for (const body of rogueBodies) {
          const up = engine.getBodyUniversePosition?.(body);
          const pos = worldToMap(
            (up?.x || 0) * 0.4,
            (up?.z || 0) * 0.4,
            { x: 0, z: 0 }, extent, size
          );
          const d = Math.hypot(mx - pos.x, my - pos.y);
          if (d < nearestRogueDist) {
            nearestRogueDist = d;
            nearestRogue = body;
          }
        }
        if (nearestRogue && onNavigateToBody) {
          onNavigateToBody(nearestRogue.id);
        } else if (nearest && onNavigateToCluster) {
          onNavigateToCluster(nearest.id);
        }
      } else if (viewLevel !== VIEW_LEVEL.UNIVERSE && getBodies && onBodySelected) {
        const metrics = sceneManager.getSystemMetrics();
        const extent = Math.max(metrics?.extent || 1, 0.1);
        const com = metrics?.com || { x: 0, z: 0 };
        const bodies = getVisibleBodies();
        let nearest = null;
        let nearestDist = 14;
        for (const body of bodies) {
          const px = (body.position.x - com.x) / extent * r + size / 2;
          const py = -(body.position.z - (com.z ?? 0)) / extent * r + size / 2;
          const inBounds = Math.hypot(px - size / 2, py - size / 2) <= r - 2;
          if (!inBounds) continue;
          const d = Math.hypot(mx - px, my - py);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = body;
          }
        }
        if (nearest) {
          onBodySelected(nearest.id);
        }
      }
    }
    pointerDownPos.current = null;
    isMapDragging.current = false;
  }, [onBodySelected, onNavigateToCluster, onNavigateToBody, sceneManager, viewLevel, engine, worldToMap, getVisibleBodies]);

  const positionRef = useRef(position);
  positionRef.current = position;

  const handlePanelPointerDown = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isPanelDragging.current = true;
    lastPos.current = { x: e.clientX - position.left, y: e.clientY - position.top };
  }, [position]);

  const handlePanelPointerMove = useCallback((e) => {
    if (!isPanelDragging.current) return;
    setPosition(clampPosition(
      e.clientX - lastPos.current.x,
      e.clientY - lastPos.current.y
    ));
  }, []);

  const handlePanelPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (isPanelDragging.current) {
      savePosition({ x: positionRef.current.left, y: positionRef.current.top });
      isPanelDragging.current = false;
    }
  }, []);

  useEffect(() => {
    const onUp = () => {
      if (isPanelDragging.current) {
        savePosition({ x: positionRef.current.left, y: positionRef.current.top });
        isPanelDragging.current = false;
      }
      isMapDragging.current = false;
    };
    const onResize = () => {
      setPosition(prev => clampPosition(prev.left, prev.top));
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  if (!sceneManager || simState === 'setup') return null;

  return (
    <div
      className="minimap-container minimap-draggable"
      style={{ left: position.left, top: position.top }}
    >
      <div
        className="minimap-drag-handle"
        onPointerDown={handlePanelPointerDown}
        onPointerMove={handlePanelPointerMove}
        onPointerUp={handlePanelPointerUp}
        onPointerCancel={handlePanelPointerUp}
      >
        &#x2261; Map
      </div>
      <canvas
        ref={canvasRef}
        width={128}
        height={128}
        className="minimap-canvas"
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerUp}
        onPointerCancel={handleMapPointerUp}
      />
    </div>
  );
};

export default Minimap;

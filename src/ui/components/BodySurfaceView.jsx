import React, { useCallback, useEffect, useRef, useState } from 'react';
import { hashString32, uvToCell } from '@engine/biosphereGrid.js';
import { composeCreatureDataUrl } from '@art/CreatureComposer.js';

function landNoise(surfaceSeed, bodyId, u, v) {
  const latI = Math.floor(v * 16);
  const lonI = Math.floor(u * 32);
  return hashString32(`${surfaceSeed}|${bodyId}|${latI}|${lonI}`) / 0xffffffff;
}

function speciesColor(speciesId) {
  const h = hashString32(String(speciesId)) % 360;
  return `hsla(${h}, 55%, 48%, 0.55)`;
}

/**
 * Body-mode surface map: atmosphere readout, land/sea, life occupation, click for dominant species.
 */
export default function BodySurfaceView({ engine, bodyId, onClose }) {
  const canvasRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState(null);
  const [portraitUrl, setPortraitUrl] = useState('');

  useEffect(() => {
    if (!bodyId || !engine) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, [bodyId, engine]);

  const body = engine?.getBody?.(bodyId);
  const isPlanet = body?.type === 'planet';

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !body || !isPlanet) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);

    const water = Math.max(0, Math.min(1, body.waterCoverage ?? (body.hasWater ? 0.65 : 0.08)));
    const landTh = 1 - water * 0.92;
    const surfaceSeed = body.surfaceSeed ?? hashString32(`surf|${body.id}`);

    const imgData = ctx.createImageData(w, h);
    const { data } = imgData;
    const grid = body.biosphereGrid;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const u = px / w;
        const v = py / h;
        const n = landNoise(surfaceSeed, body.id, u, v);
        const isLand = n > landTh;
        const latAbs = Math.abs(v - 0.5) * 2;
        let r; let g; let b;
        if (!isLand) {
          r = 12; g = 45; b = 110;
        } else if (latAbs > 0.85) {
          r = 220; g = 235; b = 250;
        } else {
          r = 35 + n * 40;
          g = 90 + n * 50;
          b = 40 + n * 25;
        }

        if (grid?.cells?.length) {
          const { i } = uvToCell(u, v, grid.lat, grid.lon);
          const cell = grid.cells[i];
          if (cell?.dominantSpeciesId && cell.biomass01 > 0.08) {
            const hue = hashString32(cell.dominantSpeciesId) % 360;
            const a = cell.biomass01 * 0.35;
            r = r * (1 - a) + ((hue * 0.3) % 255) * a;
            g = g * (1 - a) + ((hue * 0.7) % 255) * a;
            b = b * (1 - a) + ((hue * 1.1) % 255) * a;
          }
          if (cell?.civilizationInfluence01 > 0.12) {
            const c = cell.civilizationInfluence01 * 0.25;
            r = Math.min(255, r + 80 * c);
            g = Math.min(255, g + 60 * c);
            b = Math.min(255, b + 20 * c);
          }
        }

        const idx = (py * w + px) * 4;
        data[idx] = Math.min(255, r);
        data[idx + 1] = Math.min(255, g);
        data[idx + 2] = Math.min(255, b);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [body, isPlanet]);

  useEffect(() => {
    redraw();
  }, [redraw, tick]);

  const onCanvasClick = (e) => {
    if (!body || !isPlanet || !body.biosphereGrid) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    const { i, latIdx, lonIdx } = uvToCell(u, v, body.biosphereGrid.lat, body.biosphereGrid.lon);
    const cell = body.biosphereGrid.cells[i];
    const species = (body.evolutionTree || []).find((s) => s.id === cell?.dominantSpeciesId) || null;
    setPick({
      latIdx,
      lonIdx,
      cell,
      species,
      habitat: cell?.habitat,
      civInf: cell?.civilizationInfluence01,
    });
    if (species) {
      try {
        setPortraitUrl(composeCreatureDataUrl(species, body));
      } catch {
        setPortraitUrl('');
      }
    } else {
      setPortraitUrl('');
    }
  };

  if (!bodyId || !engine) return null;
  if (!body) return null;
  if (!isPlanet) {
    return (
      <div className="body-surface-overlay">
        <div className="body-surface-card">
          <p className="body-surface-muted">Surface map is available for planets.</p>
          {onClose && (
            <button type="button" className="body-surface-close" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    );
  }

  const comp = body.atmosphereComposition || {};
  const topGas = Object.entries(comp).sort((a, b) => b[1] - a[1])[0];
  const gasLine = topGas ? `${topGas[0]} ${(topGas[1] * 100).toFixed(1)}%` : '—';

  return (
    <div className="body-surface-overlay">
      <div className="body-surface-card">
        <div className="body-surface-header">
          <h3 className="body-surface-title">{body.name}</h3>
          {onClose && (
            <button type="button" className="body-surface-close" onClick={onClose} aria-label="Close surface view">×</button>
          )}
        </div>

        <div className="body-surface-atmo">
          <div>
            <span className="body-surface-label">Atmosphere</span>
            <strong>{(body.atmospherePressure ?? 0).toFixed(2)} atm</strong>
            <span className="body-surface-muted"> · {gasLine}</span>
          </div>
          <div
            className="body-surface-atmo-swatch"
            style={{ background: body.atmosphereColor || '#88aaff' }}
            title="Atmosphere tint"
          />
        </div>

        <div className="body-surface-meta">
          {body.biomeArchetype && (
            <span className="body-surface-chip">Biome: {body.biomeArchetype}</span>
          )}
          <span className="body-surface-chip">
            Water cover: {((body.waterCoverage ?? 0) * 100).toFixed(0)}%
          </span>
        </div>

        <canvas
          ref={canvasRef}
          className="body-surface-canvas"
          width={384}
          height={192}
          onClick={onCanvasClick}
          role="presentation"
        />
        <p className="body-surface-hint">Click a region for dominant life. Gold tint shows civilization influence.</p>

        {pick && (
          <div className="body-surface-detail">
            <div>
              <span className="body-surface-label">Cell</span> ({pick.latIdx}, {pick.lonIdx}) ·{' '}
              <span className="body-surface-label">Habitat</span> {pick.habitat || '—'}
              {(pick.civInf ?? 0) > 0.05 && (
                <>
                  {' '}· <span className="body-surface-label">Civ influence</span>{' '}
                  {((pick.civInf ?? 0) * 100).toFixed(0)}%
                </>
              )}
            </div>
            {pick.species ? (
              <div className="body-surface-species">
                {portraitUrl && (
                  <img className="body-surface-portrait" src={portraitUrl} alt="" width={160} height={200} />
                )}
                <div>
                  <strong>{pick.species.name}</strong>
                  <div className="body-surface-muted">{pick.species.stage}</div>
                  <p className="body-surface-desc">{pick.species.description}</p>
                  {pick.species.traits && (
                    <ul className="body-surface-traits">
                      {Object.entries(pick.species.traits).map(([k, v]) => (
                        <li key={k}><span className="body-surface-label">{k}</span>: {String(v)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="body-surface-muted">No dominant species in this cell (ocean / barren).</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

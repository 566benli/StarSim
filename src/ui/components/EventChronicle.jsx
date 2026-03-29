import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useStore } from '../store';
import { formatTime } from '@utils/math';
import './EventChronicle.css';

const CATEGORY_ICONS = {
  evolution: '⭐',
  life: '🌿',
  catastrophe: '💥',
  random: '🎲',
  cosmic_ray: '☄️',
  solar_flare: '🌞',
  meteor_impact: '🌠',
  tidal_disruption: '🌊',
  stellar_encounter: '🤝',
  default: '📜',
};

const CATEGORY_COLORS = {
  evolution: '#ffc107',
  life: '#55d88b',
  catastrophe: '#ff4444',
  random: '#8888ff',
  default: '#6688cc',
};

const EventChronicle = ({ engine }) => {
  const { eventHistory, showEventLog, toggleEventLog } = useStore();
  const bottomRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);

  const allEvents = useMemo(() => {
    const engineEvents = engine?.eventHistory || [];
    const storeEvents = eventHistory || [];
    const merged = new Map();
    for (const e of engineEvents) if (e.id) merged.set(e.id, e);
    for (const e of storeEvents) if (e.id) merged.set(e.id, e);
    return Array.from(merged.values()).sort((a, b) => (a.time || 0) - (b.time || 0));
  }, [engine?.eventHistory?.length, eventHistory]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    return allEvents.filter(e => e.category === filter);
  }, [allEvents, filter]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEvents.length, autoScroll]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  if (!showEventLog) {
    return (
      <button
        className="chronicle-toggle-btn"
        onClick={toggleEventLog}
        title="Open Universe Chronicle"
      >
        📖
        {allEvents.length > 0 && <span className="chronicle-badge">{allEvents.length}</span>}
      </button>
    );
  }

  const categories = ['all', ...new Set(allEvents.map(e => e.category).filter(Boolean))];

  return (
    <div className="chronicle-panel">
      <div className="chronicle-header">
        <div className="chronicle-title">
          <span className="chronicle-icon">📖</span>
          Universe Chronicle
        </div>
        <div className="chronicle-count">{filteredEvents.length} events</div>
        <button className="chronicle-close" onClick={toggleEventLog}>✕</button>
      </div>

      <div className="chronicle-filters">
        {categories.map(cat => (
          <button
            key={cat}
            className={`chronicle-filter ${filter === cat ? 'active' : ''}`}
            onClick={() => setFilter(cat)}
          >
            {cat === 'all' ? '📜 All' : `${CATEGORY_ICONS[cat] || CATEGORY_ICONS.default} ${cat}`}
          </button>
        ))}
      </div>

      <div className="chronicle-list" onScroll={handleScroll}>
        {filteredEvents.length === 0 ? (
          <div className="chronicle-empty">
            No events recorded yet. The universe is young...
          </div>
        ) : (
          filteredEvents.map((event, i) => (
            <ChronicleEntry key={event.id || i} event={event} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

const ChronicleEntry = React.memo(({ event }) => {
  const icon = CATEGORY_ICONS[event.category] || CATEGORY_ICONS[event.id] || CATEGORY_ICONS.default;
  const color = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.default;
  const title = event.notification?.title || event.name || 'Event';
  const body = event.notification?.body || event.description || '';
  const target = event.targetBody?.name || '';
  const time = event.time;

  return (
    <div className="chronicle-entry" style={{ borderLeftColor: color }}>
      <div className="chronicle-entry-icon">{icon}</div>
      <div className="chronicle-entry-content">
        <div className="chronicle-entry-top">
          <span className="chronicle-entry-title">{title}</span>
          {time != null && (
            <span className="chronicle-entry-time">{formatTime(time)}</span>
          )}
        </div>
        {body && <div className="chronicle-entry-body">{body}</div>}
        {target && <div className="chronicle-entry-target">{target}</div>}
      </div>
    </div>
  );
});

export default EventChronicle;

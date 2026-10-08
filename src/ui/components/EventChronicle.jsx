import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useStore } from '../store';
import { formatTime } from '@utils/math';
import { MAX_EVENT_LOG } from '@utils/constants';
import './EventChronicle.css';

const CATEGORY_ICONS = {
  evolution: '⭐',
  life: '🌿',
  civilization: '🏛',
  catastrophe: '💥',
  destruction: '🕳',
  universe: '🌌',
  system: '🌀',
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
  civilization: '#aa77ff',
  catastrophe: '#ff4444',
  destruction: '#8866aa',
  universe: '#ff6633',
  system: '#4488ff',
  random: '#8888ff',
  default: '#6688cc',
};

function eventBodyText(event) {
  const raw = event.notification?.body || event.description || '';
  const name = event.targetBody?.name || '???';
  return String(raw).replace(/\{(\w+)\}/g, name);
}

const EventChronicle = () => {
  const {
    eventHistory, showEventLog, toggleEventLog, unreadEventCount,
    showInfoPanel, selectedBody,
  } = useStore();
  const topRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [followLatest, setFollowLatest] = useState(true);
  const [peek, setPeek] = useState(null);

  const allEvents = useMemo(() => {
    const storeEvents = eventHistory || [];
    return storeEvents.slice(-MAX_EVENT_LOG).reverse();
  }, [eventHistory]);

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    return allEvents.filter(e => e.category === filter);
  }, [allEvents, filter]);

  const besideInfo = !!(selectedBody && showInfoPanel);
  const latest = allEvents[0] || null;

  useEffect(() => {
    if (followLatest && showEventLog && topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filteredEvents.length, followLatest, showEventLog]);

  useEffect(() => {
    if (showEventLog || !latest) {
      setPeek(null);
      return;
    }
    setPeek(latest);
  }, [latest, showEventLog]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    setFollowLatest(el.scrollTop < 40);
  }, []);

  const badgeCount = unreadEventCount > 0 ? unreadEventCount : allEvents.length;
  const badgeText = badgeCount >= MAX_EVENT_LOG ? String(MAX_EVENT_LOG) : String(badgeCount);
  const categories = ['all', ...new Set(allEvents.map(e => e.category).filter(Boolean))];
  const peekTitle = peek?.notification?.title || peek?.name || '';
  const peekBody = peek ? eventBodyText(peek) : '';

  return (
    <>
      <button
        type="button"
        className={`chronicle-toggle-btn${showEventLog ? ' active' : ''}${unreadEventCount > 0 ? ' has-unread' : ''}${besideInfo ? ' beside-info' : ''}`}
        onClick={toggleEventLog}
        title={showEventLog ? 'Close event log' : 'Open event log (latest 99 events)'}
        aria-label="Event log"
        aria-pressed={showEventLog}
      >
        <span className="chronicle-toggle-icon" aria-hidden="true">📜</span>
        <span className="chronicle-toggle-label">Events</span>
        {allEvents.length > 0 && (
          <span className={`chronicle-badge${unreadEventCount > 0 ? ' unread' : ''}`}>
            {badgeText}
          </span>
        )}
      </button>

      {peek && peekTitle && !showEventLog && (
        <button
          type="button"
          className={`chronicle-peek${besideInfo ? ' beside-info' : ''}`}
          onClick={toggleEventLog}
          title="Open event log"
        >
          <span className="chronicle-peek-kicker">Latest event</span>
          <span className="chronicle-peek-title">{peekTitle}</span>
          {peekBody && peekBody !== peekTitle && (
            <span className="chronicle-peek-body">{peekBody}</span>
          )}
        </button>
      )}

      {showEventLog && (
        <div className={`chronicle-panel${besideInfo ? ' beside-info' : ''}`} role="dialog" aria-label="Event log">
          <div className="chronicle-header">
            <div className="chronicle-title">
              <span className="chronicle-icon">📜</span>
              Event Log
            </div>
            <div className="chronicle-count">{filteredEvents.length}/{MAX_EVENT_LOG}</div>
            <button type="button" className="chronicle-close" onClick={toggleEventLog} aria-label="Close event log">✕</button>
          </div>

          <div className="chronicle-filters">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`chronicle-filter ${filter === cat ? 'active' : ''}`}
                onClick={() => setFilter(cat)}
              >
                {cat === 'all' ? 'All' : `${CATEGORY_ICONS[cat] || CATEGORY_ICONS.default} ${cat}`}
              </button>
            ))}
          </div>

          <div className="chronicle-list" onScroll={handleScroll}>
            <div ref={topRef} />
            {filteredEvents.length === 0 ? (
              <div className="chronicle-empty">
                No events recorded yet. The universe is young...
              </div>
            ) : (
              filteredEvents.map((event, i) => (
                <ChronicleEntry key={event.id || `${event.logSeq || i}`} event={event} newest={i === 0} />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};

const ChronicleEntry = React.memo(({ event, newest }) => {
  const icon = CATEGORY_ICONS[event.category] || CATEGORY_ICONS[event.id] || CATEGORY_ICONS.default;
  const color = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.default;
  const title = event.notification?.title || event.name || 'Event';
  const body = eventBodyText(event);
  const target = event.targetBody?.name || '';
  const time = event.time;

  return (
    <div className="chronicle-entry" style={{ borderLeftColor: color }} data-newest={newest ? 'true' : undefined}>
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

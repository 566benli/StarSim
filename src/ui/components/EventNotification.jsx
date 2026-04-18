/**
 * EventNotification - Toast-style notifications for random cosmic events
 */
import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import './EventNotification.css';

const EventNotification = () => {
  const { activeEvents, dismissEvent } = useStore();

  // Show only the most recent 3 notifications
  const visibleEvents = activeEvents.slice(-3);

  return (
    <div className="event-notifications">
      {visibleEvents.map((event) => (
        <EventToast
          key={event.id}
          event={event}
          onDismiss={() => dismissEvent(event.id)}
        />
      ))}
    </div>
  );
};

// Auto-dismiss durations per severity
const DISMISS_DELAY = {
  critical:     12000,
  warning:       9000,
  historic:      9000,
  catastrophic: 14000,
  major:         7000,
  notable:       6000,
};

const SEVERITY_ICON = {
  critical:     '🔴',
  warning:      '⚠️',
  historic:     '📜',
  catastrophic: '💥',
  major:        '⭐',
};

const EventToast = ({ event, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const notification = event.notification || {};
  const severity = notification.severity || 'notable';
  const delay = DISMISS_DELAY[severity] ?? 6000;

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 500);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const isEvolution    = event.category === 'evolution';
  const isLife         = event.category === 'life';
  const isCivilization = event.category === 'civilization';
  const isWarning      = severity === 'warning';
  const isCritical     = severity === 'critical' || severity === 'catastrophic';

  const borderColor = isCritical     ? '#ff4444'
    : isWarning                      ? '#ff9800'
    : isCivilization                 ? '#aa77ff'
    : isEvolution                    ? '#ffc107'
    : isLife                         ? '#55d88b'
    : (notification.color || '#4488ff');

  const classes = [
    'event-toast',
    visible ? 'visible' : '',
    exiting ? 'exiting' : '',
    isEvolution    ? 'evolution'    : '',
    isLife         ? 'life'         : '',
    isCivilization ? 'civilization' : '',
    isWarning      ? 'toast-warning' : '',
    isCritical     ? 'toast-critical' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{ borderLeftColor: borderColor }}
      onClick={() => { setExiting(true); setTimeout(onDismiss, 500); }}
    >
      <div className="toast-title">
        {SEVERITY_ICON[severity] && <span className="toast-severity-icon">{SEVERITY_ICON[severity]} </span>}
        {notification.title || event.name}
      </div>
      <div className="toast-body">
        {notification.body?.replace(/\{(\w+)\}/g, event.targetBody?.name || '???') || event.description}
      </div>
      {severity !== 'notable' && (
        <div className={`toast-severity-badge sev-${severity}`}>{severity}</div>
      )}
    </div>
  );
};

export default EventNotification;

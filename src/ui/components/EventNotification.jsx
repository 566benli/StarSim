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

const EventToast = ({ event, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Animate in
    setTimeout(() => setVisible(true), 50);

    // Auto dismiss after 6 seconds
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 500);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  const notification = event.notification || {};
  const isEvolution = event.category === 'evolution';
  const isLife = event.category === 'life';
  const borderColor = isEvolution
    ? '#ffc107'
    : isLife
      ? '#55d88b'
      : (notification.color || '#4488ff');

  return (
    <div
      className={`event-toast ${visible ? 'visible' : ''} ${exiting ? 'exiting' : ''} ${isEvolution ? 'evolution' : ''} ${isLife ? 'life' : ''}`}
      style={{ borderLeftColor: borderColor }}
      onClick={() => {
        setExiting(true);
        setTimeout(onDismiss, 500);
      }}
    >
      <div className="toast-title">{notification.title || event.name}</div>
      <div className="toast-body">
        {notification.body?.replace(/\{(\w+)\}/g, event.targetBody?.name || '???') || event.description}
      </div>
      {notification.severity && <div className="toast-severity">{notification.severity}</div>}
    </div>
  );
};

export default EventNotification;

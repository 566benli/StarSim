/**
 * SaveDialog - Unified save/load dialog with multi-slot management.
 * Each slot shows save, load, and delete actions as appropriate.
 */
import React, { useState, useEffect } from 'react';
import './SaveDialog.css';

const SaveDialog = ({ isOpen, onClose, onSave, onLoad, onGetSlots, onDelete, onSaveSuccess, mode = 'save' }) => {
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ message: null, type: null });

  useEffect(() => {
    if (isOpen) loadSlots();
  }, [isOpen]);

  const loadSlots = async () => {
    setLoading(true);
    setFeedback({ message: null, type: null });
    try {
      const slotsData = onGetSlots
        ? await onGetSlots()
        : (window.electronAPI?.getSaveSlots ? await window.electronAPI.getSaveSlots() : {});
      setSlots(slotsData || {});
    } catch (error) {
      console.error('Failed to load save slots:', error);
    }
    setLoading(false);
  };

  const showFeedback = (msg, type) => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback({ message: null, type: null }), 3500);
  };

  const handleSave = async (slotId) => {
    if (!onSave) return;
    setSaving(true);
    setFeedback({ message: null, type: null });
    try {
      const success = await onSave(slotId);
      if (success) {
        showFeedback(`Saved to slot ${slotId}!`, 'success');
        await loadSlots();
        if (onSaveSuccess) onSaveSuccess();
      } else {
        showFeedback('Save failed.', 'error');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      showFeedback('Failed: ' + (error?.message || 'Unknown error'), 'error');
    }
    setSaving(false);
  };

  const handleLoad = async (slotId) => {
    if (!onLoad) return;
    try {
      const success = await onLoad(slotId);
      if (success) {
        onClose();
      } else {
        showFeedback('Failed to load slot.', 'error');
      }
    } catch (error) {
      console.error('Failed to load:', error);
      showFeedback('Failed: ' + (error?.message || 'Unknown error'), 'error');
    }
  };

  const handleDelete = async (slotId) => {
    const deleteFn = onDelete || ((id) => window.electronAPI?.deleteSaveSlot?.(id));
    if (!deleteFn) return;
    if (!confirm(`Delete save slot ${slotId}?`)) return;
    try {
      await deleteFn(slotId);
      await loadSlots();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatSimTime = (years) => {
    if (years >= 1e9) return `${(years / 1e9).toFixed(1)} Byr`;
    if (years >= 1e6) return `${(years / 1e6).toFixed(1)} Myr`;
    if (years >= 1e3) return `${(years / 1e3).toFixed(1)} kyr`;
    if (years >= 1) return `${years.toFixed(1)} yr`;
    return `${years.toFixed(2)} yr`;
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>&#x1F4BE; Save &amp; Load</h2>
          <button className="close-btn" onClick={onClose}>&#x2715;</button>
        </div>

        <div className="dialog-content">
          {feedback.message && (
            <div className={`save-feedback ${feedback.type}`}>
              {feedback.type === 'success' ? '\u2713' : '\u2717'} {feedback.message}
            </div>
          )}
          {loading ? (
            <div className="loading">Loading save slots...</div>
          ) : (
            <div className="slots-grid">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(slotId => {
                const slot = slots[slotId] || { exists: false };
                return (
                  <div key={slotId} className={`slot-card ${slot.exists ? 'occupied' : 'empty'}`}>
                    <div className="slot-header">
                      <span className="slot-number">Slot {slotId}</span>
                      {slot.exists && (
                        <div className="slot-actions">
                          <button
                            className="action-btn save"
                            onClick={() => handleSave(slotId)}
                            disabled={saving}
                            title="Overwrite this slot"
                          >
                            &#x1F4BE;
                          </button>
                          <button
                            className="action-btn load"
                            onClick={() => handleLoad(slotId)}
                            title="Load this simulation"
                          >
                            &#x1F4C2;
                          </button>
                          <button
                            className="action-btn delete"
                            onClick={() => handleDelete(slotId)}
                            title="Delete this save"
                          >
                            &#x1F5D1;
                          </button>
                        </div>
                      )}
                    </div>

                    {slot.exists ? (
                      <div className="slot-info">
                        <div className="slot-detail">
                          <span className="label">Bodies:</span>
                          <span className="value">{slot.bodyCount}</span>
                        </div>
                        <div className="slot-detail">
                          <span className="label">Time:</span>
                          <span className="value">{formatSimTime(slot.simTime || 0)}</span>
                        </div>
                        <div className="slot-detail">
                          <span className="label">Saved:</span>
                          <span className="value">{formatDate(slot.savedAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="slot-empty">
                        <span>Empty Slot</span>
                        <button
                          className="save-empty-btn"
                          onClick={() => handleSave(slotId)}
                          disabled={saving}
                        >
                          &#x1F4BE; Save Here
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="dialog-btn cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SaveDialog;

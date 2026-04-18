/**
 * Save Service - Abstracts save/load for Electron and web (localStorage)
 */
const STORAGE_PREFIX = 'genesiserror_slot_';

async function getSlotsElectron() {
  if (!window.electronAPI?.getSaveSlots) return null;
  return window.electronAPI.getSaveSlots();
}

async function getSlotsLocalStorage() {
  const slots = {};
  for (let i = 1; i <= 10; i++) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + i);
      if (raw) {
        const data = JSON.parse(raw);
        slots[i] = {
          exists: true,
          savedAt: data.savedAt,
          bodyCount: (() => {
            const gs = data.gravitySystems;
            if (gs && typeof gs === 'object' && !gs.bodies) {
              return Object.values(gs).reduce((sum, s) => sum + (s.bodies?.length ?? 0), 0);
            }
            return data.gravitySystem?.bodies?.length ?? data.bodies?.length ?? 0;
          })(),
          simTime: data.simulationTime || 0,
        };
      } else {
        slots[i] = { exists: false };
      }
    } catch {
      slots[i] = { exists: false };
    }
  }
  return slots;
}

export async function getSaveSlots() {
  if (window.electronAPI?.getSaveSlots) {
    return getSlotsElectron();
  }
  return getSlotsLocalStorage();
}

export async function saveSlot(slotId, data) {
  const saveData = {
    ...data,
    savedAt: new Date().toISOString(),
    slotId,
  };

  if (window.electronAPI?.saveSimulationSlot) {
    try {
      const result = await window.electronAPI.saveSimulationSlot(slotId, data);
      return result?.success ?? false;
    } catch (e) {
      console.error('Electron save failed:', e);
      throw new Error(e?.message || 'Save failed');
    }
  }

  try {
    localStorage.setItem(STORAGE_PREFIX + slotId, JSON.stringify(saveData));
    return true;
  } catch (e) {
    console.error('LocalStorage save failed:', e);
    return false;
  }
}

export async function loadSlot(slotId) {
  if (window.electronAPI?.loadSimulationSlot) {
    return window.electronAPI.loadSimulationSlot(slotId);
  }

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slotId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteSlot(slotId) {
  if (window.electronAPI?.deleteSaveSlot) {
    await window.electronAPI.deleteSaveSlot(slotId);
    return;
  }
  localStorage.removeItem(STORAGE_PREFIX + slotId);
}

/**
 * Global state management using Zustand
 * Single source of truth for UI and simulation state
 */
import { create } from 'zustand';
import { VIEW_LEVEL } from '@utils/constants';

export const useStore = create((set, get) => ({
  // === Simulation State ===
  simState: 'setup', // 'setup', 'running', 'paused', 'explorer'
  setSimState: (state) => set({ simState: state }),

  // === Time ===
  simulationTime: 0,
  timeScale: 10,
  setSimulationTime: (t) => set({ simulationTime: t }),
  setTimeScale: (s) => set({ timeScale: s }),

  // === View Level ===
  viewLevel: VIEW_LEVEL.UNIVERSE, // 'universe', 'system', 'body'
  setViewLevel: (level) => set({ viewLevel: level }),

  // Currently focused cluster (when in system/body view)
  focusedClusterId: null,
  setFocusedClusterId: (id) => set({ focusedClusterId: id }),

  // Currently focused system (when in system/body view)
  focusedSystemId: null,
  setFocusedSystemId: (id) => set({ focusedSystemId: id }),

  // Currently focused body (when in body view)
  focusedBodyId: null,
  setFocusedBodyId: (id) => set({ focusedBodyId: id }),

  /**
   * Navigate to a specific view level, optionally specifying which object to focus on.
   */
  navigateTo: (level, { clusterId, systemId, bodyId } = {}) => set({
    viewLevel: level,
    focusedClusterId: clusterId ?? get().focusedClusterId,
    focusedSystemId: systemId ?? (level === VIEW_LEVEL.UNIVERSE ? null : get().focusedSystemId),
    focusedBodyId: bodyId ?? (level === VIEW_LEVEL.BODY ? get().focusedBodyId : null),
  }),

  // === Bodies ===
  bodies: [],
  setBodies: (bodies) => set({ bodies }),

  // === Universe Stats ===
  universeStats: {},
  setUniverseStats: (stats) => set({ universeStats: stats }),

  // === Selection ===
  selectedBodyId: null,
  selectedBody: null,
  setSelectedBody: (body) => set({
    selectedBodyId: body?.id || null,
    selectedBody: body,
  }),
  clearSelection: () => set({ selectedBodyId: null, selectedBody: null }),

  // === Creation Panel ===
  creationStep: 'choose_type', // 'choose_type', 'customize', 'place', 'ready'
  creationTarget: null,
  creationParams: {},
  setCreationStep: (step) => set({ creationStep: step }),
  setCreationTarget: (target) => set({ creationTarget: target, creationParams: {} }),
  updateCreationParam: (key, value) => set((state) => ({
    creationParams: { ...state.creationParams, [key]: value },
  })),
  resetCreation: () => set({
    creationStep: 'choose_type',
    creationTarget: null,
    creationParams: {},
  }),

  // === Created Bodies Queue (for setup phase) ===
  createdBodies: [],
  addCreatedBody: (bodyConfig) => set((state) => ({
    createdBodies: [...state.createdBodies, bodyConfig],
  })),
  removeCreatedBody: (index) => set((state) => ({
    createdBodies: state.createdBodies.filter((_, i) => i !== index),
  })),
  clearCreatedBodies: () => set({ createdBodies: [] }),

  // === Panels ===
  showInfoPanel: false,
  showAIChat: false,
  showEventLog: false,
  showSettings: false,
  showUniversePanel: true,
  showObjectPalette: true,
  toggleInfoPanel: () => set((s) => ({ showInfoPanel: !s.showInfoPanel })),
  toggleAIChat: () => set((s) => ({ showAIChat: !s.showAIChat })),
  toggleEventLog: () => set((s) => ({ showEventLog: !s.showEventLog })),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  toggleUniversePanel: () => set((s) => ({ showUniversePanel: !s.showUniversePanel })),
  toggleObjectPalette: () => set((s) => ({ showObjectPalette: !s.showObjectPalette })),

  // === Explorer Mode ===
  explorerInfo: null,
  setExplorerInfo: (info) => set({ explorerInfo: info }),

  // === Events ===
  activeEvents: [],
  eventHistory: [],
  addEvent: (event) => set((state) => ({
    activeEvents: [...state.activeEvents, event].slice(-5),
    eventHistory: [...state.eventHistory, event].slice(-100),
  })),
  dismissEvent: (id) => set((state) => ({
    activeEvents: state.activeEvents.filter(e => e.id !== id),
  })),

  // === AI Chat ===
  chatMessages: [],
  chatLoading: false,
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, msg],
  })),
  setChatLoading: (loading) => set({ chatLoading: loading }),

  // === Stats ===
  stats: {},
  setStats: (stats) => set({ stats }),

  // === FPS ===
  fps: 60,
  setFps: (fps) => set({ fps }),

  // === Drag-and-drop state ===
  draggingObject: null,
  setDraggingObject: (obj) => set({ draggingObject: obj }),
}));

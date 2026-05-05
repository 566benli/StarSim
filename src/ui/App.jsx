/**
 * App - Main application component
 * Orchestrates multi-scale universe simulation with three view levels.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from './store';
import SimEngine, { SIM_STATE } from '@engine/SimEngine';
import SceneManager from '@renderer/SceneManager';
import ExplorerCamera from '@renderer/ExplorerCamera';
import AIAgent from '@ai/AIAgent';
import { VIEW_LEVEL } from '@utils/constants';
import CreationPanel from './components/CreationPanel';
import TimeControl from './components/TimeControl';
import InfoPanel from './components/InfoPanel';
import HUD from './components/HUD';
import EventNotification from './components/EventNotification';
import EventChronicle from './components/EventChronicle';
import AIChat from './components/AIChat';
import ViewControls from './components/ViewControls';
import Minimap from './components/Minimap';
import SaveDialog from './components/SaveDialog';
import AuthModal from './components/AuthModal';
import ObjectPalette from './components/ObjectPalette';
import UniversePanel from './components/UniversePanel';
import ClusterInfoPanel from './components/ClusterInfoPanel';
import UniverseCoordinatePanel from './components/UniverseCoordinatePanel';
import WelcomeFlow from './components/WelcomeFlow';
import BodySurfaceView from './components/BodySurfaceView';
import { composeCreatureDataUrl, clearCreatureComposerCache } from '@art/CreatureComposer.js';
import { ONBOARDING_DONE_KEY } from '@utils/onboardingKeys';
import { getSaveSlots, saveSlot, loadSlot, deleteSlot } from '@services/saveService';
import cloud from '@services/cloudService';
import './styles/main.css';

const App = () => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const explorerRef = useRef(null);
  const aiAgentRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastTimeRef = useRef(0);

  const [showNewSimDialog, setShowNewSimDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveDialogMode, setSaveDialogMode] = useState('save');
  const [universeStats, setUniverseStats] = useState({});
  const [lifeTuning, setLifeTuning] = useState(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [cloudUser, setCloudUser] = useState(null);
  const authCheckedRef = useRef(false);

  const [showReturnToMenuDialog, setShowReturnToMenuDialog] = useState(false);
  const [showGoodbye, setShowGoodbye] = useState(false);
  const returnToMenuAfterSaveRef = useRef(false);

  const [bodySurfaceOpen, setBodySurfaceOpen] = useState(true);
  const [clusterPopup, setClusterPopup] = useState(null);
  const [clusterTooltip, setClusterTooltip] = useState(null);
  const [universeCoordinatePopup, setUniverseCoordinatePopup] = useState(null);

  const [welcomeFlowOpen, setWelcomeFlowOpen] = useState(() => {
    try {
      return !localStorage.getItem(ONBOARDING_DONE_KEY);
    } catch {
      return true;
    }
  });

  const {
    simState, setSimState,
    setSimulationTime, setTimeScale,
    setBodies, setSelectedBody, clearSelection,
    selectedBody, selectedBodyId,
    setStats, setFps,
    addEvent, setExplorerInfo,
    showAIChat, toggleAIChat,
    showInfoPanel, toggleInfoPanel,
    viewLevel, setViewLevel, navigateTo,
    focusedClusterId, focusedSystemId, focusedBodyId,
    setFocusedClusterId, setFocusedSystemId,
    showObjectPalette, showUniversePanel,
    draggingObject, setDraggingObject,
    showHabitableZone, toggleHabitableZone,
    showDistGrid, toggleDistGrid,
    setUniverseStats: setStoreUniverseStats,
  } = useStore();

  useEffect(() => {
    setBodySurfaceOpen(true);
  }, [focusedBodyId]);

  useEffect(() => {
    try { cloud.init(); } catch (e) { console.warn('Cloud init failed (offline mode):', e); }

    let hasToken = false;
    try { hasToken = !!cloud.getToken(); } catch {}

    if (hasToken) {
      cloud.verifySession().then(ok => {
        authCheckedRef.current = true;
        if (ok) {
          setCloudUser(cloud.getUser());
        } else {
          setShowAuthModal(true);
        }
      }).catch(() => {
        authCheckedRef.current = true;
      });
    } else {
      authCheckedRef.current = true;
      try {
        const dismissed = localStorage.getItem('genesiserror-auth-dismissed');
        if (!dismissed) setShowAuthModal(true);
      } catch {}
    }

    let unsub;
    try { unsub = cloud.subscribe(({ user }) => setCloudUser(user)); } catch {}
    return () => { if (unsub) unsub(); };
  }, []);

  const handleAppClose = useCallback(() => {
    setShowGoodbye(true);
    setTimeout(() => {
      if (window.electronAPI?.forceClose) {
        window.electronAPI.forceClose();
      } else {
        window.close();
      }
    }, 2500);
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onCloseRequested) return;
    const unsub = window.electronAPI.onCloseRequested(() => handleAppClose());
    return unsub;
  }, [handleAppClose]);

  const [initError, setInitError] = useState(null);

  const getBodiesForView = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return [];

    const allBodies = engine.getBodies();
    const state = useStore.getState();

    if (state.viewLevel === VIEW_LEVEL.SYSTEM && state.focusedSystemId) {
      const systemBodies = engine.getSystemBodies(state.focusedSystemId);
      return systemBodies;
    }

    if (state.viewLevel === VIEW_LEVEL.BODY && state.focusedBodyId) {
      const focusedBody = engine.getBody(state.focusedBodyId);
      if (focusedBody?.systemId) {
        const systemBodies = engine.getSystemBodies(focusedBody.systemId);
        return systemBodies.length > 0 ? systemBodies : [focusedBody];
      }
      if (focusedBody) return [focusedBody];
    }

    return allBodies;
  }, []);

  useEffect(() => {
    let engine, scene, explorer, ai;
    try {
      engine = new SimEngine();
      engineRef.current = engine;
      // Expose engine for browser console testing / debugging
      if (typeof window !== 'undefined') window.__starSimEngine = engine;
    } catch (e) {
      console.error('[GenesisError] Engine init failed:', e);
      setInitError('Simulation engine failed to initialize: ' + e.message);
      return;
    }

    try {
      scene = new SceneManager(canvasRef.current);
      sceneRef.current = scene;
    } catch (e) {
      console.error('[GenesisError] Renderer init failed:', e);
      setInitError(
        'Graphics initialization failed. Your system may not support WebGL.\n\n' +
        'Try:\n- Updating your GPU drivers\n- Enabling hardware acceleration in system settings\n- Using a device with a dedicated graphics card\n\n' +
        'Error: ' + e.message
      );
      return;
    }

    try {
      explorer = new ExplorerCamera(scene.camera, scene.controls);
      explorerRef.current = explorer;
    } catch (e) {
      console.error('[GenesisError] Camera init failed:', e);
      setInitError('Camera system failed: ' + e.message);
      return;
    }

    try {
      ai = new AIAgent({ engine });
      aiAgentRef.current = ai;
    } catch (e) {
      console.warn('[GenesisError] AI agent init failed (non-critical):', e);
    }

    engine.onEvent = (event) => {
      addEvent(event);
    };

    // Forward stellar VFX (supernova flashes, shockwaves) and phase-change
    // events to the renderer so it can play smooth visual transitions.
    engine.onVfxEvent = (vfx) => {
      try { sceneRef.current?.handleVfxEvent?.(vfx); }
      catch (err) { console.warn('[GenesisError] VFX dispatch failed:', err); }
    };
    engine.onPhaseChange = (body, newPhase) => {
      try { sceneRef.current?.handlePhaseChange?.(body, newPhase); }
      catch (err) { console.warn('[GenesisError] phase-change dispatch failed:', err); }
    };

    engine._boundaryHandler = (body, info) => {
      engine.markBodyEscaped(body, {
        systemId: body.systemId,
        com: info?.centerOfMass,
      });
      // Remove from local GravitySystem so it stops being integrated as a bound body
      const escGS = engine.getSystemGravity?.(body.systemId);
      if (escGS) escGS.removeBody(body);
      addEvent({
        id: `boundary_${Date.now()}`,
        name: 'System Escape',
        category: 'system',
        targetBody: body,
        time: engine.simulationTime,
        notification: {
          title: 'Object Escaped',
          body: `${body.name} left its star system and is now drifting in universe space.`,
          severity: 'notable',
        },
        effects: {},
      });
    };

    scene.onBodySelected = (bodyId) => {
      const body = engine.getBody(bodyId);
      if (body) {
        engine.getBodies().forEach(b => b.selected = false);
        body.selected = true;
        setSelectedBody(body);
        // Enable per-frame camera tracking on this body
        scene.selectedBody = body;
        // Stay in system view: show the InfoPanel and center camera on the body with
        // enough context to see its orbit. Clicking the InfoPanel "Focus" button will
        // switch to the full body-centred view.
        const extent = Math.max((body.orbitalDistance || 0) * 2.5, 5);
        scene.fitOnBody(body, extent);
      }
    };

    scene.onClusterSelected = (clusterId, screenPos) => {
      setUniverseCoordinatePopup(null);
      const cluster = engine.universe.getCluster(clusterId);
      if (!cluster) return;

      const clusterBodies = [];
      const clusterSystems = [];
      for (const sysId of cluster.systemIds) {
        const sys = engine.universe.getSystem(sysId);
        if (sys) clusterSystems.push(sys);
        clusterBodies.push(...engine.getSystemBodies(sysId));
      }

      setClusterPopup({
        cluster,
        systems: clusterSystems,
        bodies: clusterBodies,
        screenPos: screenPos || { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      });
    };

    scene.onUniverseCoordinateSelected = (coords, screenPos) => {
      setClusterPopup(null);
      setUniverseCoordinatePopup({
        coords,
        screenPos: screenPos || { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      });
    };

    scene.onClusterHover = (clusterId, screenPos) => {
      if (!clusterId) { setClusterTooltip(null); return; }
      const cluster = engine.universe.getCluster(clusterId);
      if (!cluster) { setClusterTooltip(null); return; }
      const bodyCount = cluster.systemIds.reduce((n, sysId) =>
        n + engine.getSystemBodies(sysId).filter(b => b.alive).length, 0);
      setClusterTooltip({
        name: cluster.name,
        bodyCount,
        x: screenPos.x,
        y: screenPos.y,
      });
    };

    scene.onBodyDeselected = () => {
      engine.getBodies().forEach(b => b.selected = false);
      clearSelection();
      scene.clearSelectedBody();
      // If we're in body view, return to system view so the screen isn't blank
      const lvl = useStore.getState().viewLevel;
      if (lvl === VIEW_LEVEL.BODY) {
        const cid = useStore.getState().focusedClusterId;
        const sysId = useStore.getState().focusedSystemId;
        navigateTo(VIEW_LEVEL.SYSTEM, { clusterId: cid, systemId: sysId });
        scene.transitionToSystem(engine.getBodies());
      }
    };

    let frameCount = 0;
    let fpsAccum = 0;
    let lastFpsUpdate = 0;

    const animate = (time) => {
      const rawDelta = lastTimeRef.current === 0 ? 0.016 : (time - lastTimeRef.current) / 1000;
      const deltaTime = Math.max(0.001, Math.min(rawDelta, 0.1));
      lastTimeRef.current = time;

      frameCount++;
      fpsAccum += deltaTime;
      if (time - lastFpsUpdate > 500) {
        const fps = Math.round(frameCount / fpsAccum);
        setFps(fps);
        frameCount = 0;
        fpsAccum = 0;
        lastFpsUpdate = time;

        setSimulationTime(engine.simulationTime);
        setStats(engine.getStats());
        setUniverseStats(engine.getUniverseStats());
        setLifeTuning(engine.getLifeTuning());
      }

      if (engine.state === SIM_STATE.RUNNING) {
        engine.update(deltaTime);
        scene._fastForwardMode = engine.fastForward;
      }

      if (engine.state === SIM_STATE.EXPLORER && explorer.enabled) {
        explorer.update(deltaTime, scene);
        setExplorerInfo({ ...explorer.explorerInfo });
      }

      engine.consumePendingEvents();

      if (scene.selectedBody && !scene.selectedBody.alive) {
        scene.clearSelectedBody();
        clearSelection();
      }

      // Get the current view level from the store
      const currentViewLevel = useStore.getState().viewLevel;
      const currentFocusedSystemId = useStore.getState().focusedSystemId;
      const currentFocusedBodyId = useStore.getState().focusedBodyId;

      // Sync scene view level
      if (scene._viewLevel !== currentViewLevel) {
        scene.setViewLevel(currentViewLevel);
      }

      // Sync habitable zone toggle
      const hzVisible = useStore.getState().showHabitableZone;
      if (scene._showHabitableZone !== hzVisible) {
        scene.setHabitableZoneVisible(hzVisible);
      }

      // Sync distance grid toggle
      const dgVisible = useStore.getState().showDistGrid;
      if (scene._showDistGrid !== dgVisible) {
        scene.setDistGridVisible(dgVisible, scene._comTarget);
      }

      // Determine which bodies to render based on view level
      // getAllBodies() merges bound bodies with _escapedBodies so rogue planets
      // are included in the list passed to renderUniverse.
      const allBodies = engine.getAllBodies();
      let bodiesToRender = allBodies;
      if (currentViewLevel === VIEW_LEVEL.SYSTEM && currentFocusedSystemId) {
        bodiesToRender = engine.getSystemBodies(currentFocusedSystemId);
      } else if (currentViewLevel === VIEW_LEVEL.BODY && currentFocusedBodyId) {
        const focusedBody = engine.getBody(currentFocusedBodyId);
        if (focusedBody?.systemId) {
          const systemBodies = engine.getSystemBodies(focusedBody.systemId);
          bodiesToRender = systemBodies.length > 0 ? systemBodies : [focusedBody];
        } else if (focusedBody) {
          bodiesToRender = [focusedBody];
        }
      }

      const cleanupBodies = (
        currentViewLevel === VIEW_LEVEL.SYSTEM &&
        currentFocusedSystemId &&
        bodiesToRender.length === 0
      ) ? [] : allBodies;

      scene._universeNebulas = engine.universe.nebulas;
      scene.render(bodiesToRender, engine.universe.clusters, cleanupBodies);

      animFrameRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      scene.dispose();
      explorer.disable();
    };
  }, []);

  const syncRuntimePanels = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return null;

    const stats = engine.getStats();
    const bodies = getBodiesForView();
    const universe = engine.getUniverseStats();
    setSimulationTime(engine.simulationTime);
    setTimeScale(engine.timeScale);
    setStats(stats);
    setBodies(bodies);
    setUniverseStats(universe);
    setStoreUniverseStats(universe);
    setLifeTuning(engine.getLifeTuning());
    return {
      stats,
      universe,
      bodyCount: bodies.length,
    };
  }, [getBodiesForView, setBodies, setSimulationTime, setStats, setStoreUniverseStats, setTimeScale]);

  const handleSetLifePreset = useCallback((preset) => {
    const engine = engineRef.current;
    if (!engine) return null;
    const next = engine.setLifePreset(preset);
    setLifeTuning(next);
    syncRuntimePanels();
    return next;
  }, [syncRuntimePanels]);

  const handleUpdateLifeTuning = useCallback((updates) => {
    const engine = engineRef.current;
    if (!engine) return null;
    const next = engine.updateLifeTuning(updates);
    setLifeTuning(next);
    syncRuntimePanels();
    return next;
  }, [syncRuntimePanels]);

  const handleResetLifeTuning = useCallback((preset) => {
    const engine = engineRef.current;
    if (!engine) return null;
    const next = engine.resetLifeTuning(preset);
    setLifeTuning(next);
    syncRuntimePanels();
    return next;
  }, [syncRuntimePanels]);

  useEffect(() => {
    const debugApi = {
      getEngine: () => engineRef.current,
      getStoreState: () => useStore.getState(),
      syncRuntimePanels,
      setLifePreset: handleSetLifePreset,
      updateLifeTuning: handleUpdateLifeTuning,
      resetLifeTuning: handleResetLifeTuning,
      seedLifeScenario: (config = {}) => {
        const engine = engineRef.current;
        const scene = sceneRef.current;
        if (!engine || !scene) return null;

        engine.reset();
        scene.clearSimulationVisuals({ clearClusters: true });
        clearSelection();

        const cluster = engine.createCluster({
          name: config.clusterName || 'Debug Cluster',
          type: config.clusterType || 'spiral',
          position: config.clusterPosition || { x: 0, y: 0, z: 0 },
        });
        const system = engine.createStarSystem(cluster.id, {
          name: config.systemName || 'Debug System',
          position: config.systemPosition || { x: 0, y: 0, z: 0 },
        });
        const star = engine.createStar(config.starPresetId || 'sun_like', {
          name: config.starName || 'Debug Star',
          systemId: system.id,
          position: { x: 0, y: 0, z: 0 },
          ...(config.starOverrides || {}),
        });

        for (const planetConfig of (config.planets || [])) {
          engine.createPlanet(planetConfig.presetId || 'earth_like', star, {
            name: planetConfig.name,
            systemId: system.id,
            ...(planetConfig.overrides || {}),
          });
        }

        if (config.lifePreset) engine.setLifePreset(config.lifePreset);
        if (config.lifeTuning) engine.updateLifeTuning(config.lifeTuning);
        if (config.timeScale) engine.setTimeScale(config.timeScale);

        engine.start();
        setSimState('running');
        navigateTo(VIEW_LEVEL.SYSTEM, { clusterId: cluster.id, systemId: system.id });
        const systemBodies = engine.getSystemBodies(system.id).filter((b) => b.alive);
        scene.transitionToSystem(systemBodies);
        syncRuntimePanels();

        return {
          clusterId: cluster.id,
          systemId: system.id,
          starId: star.id,
          planetIds: systemBodies.filter((b) => b.type === 'planet').map((b) => b.id),
        };
      },
      simulateYears: ({ years, stepYears = 1e5 } = {}) => {
        const engine = engineRef.current;
        if (!engine || !years || years <= 0) return null;

        const realDelta = 0.05;
        let remaining = years;
        if (engine.state !== SIM_STATE.RUNNING) engine.resume();

        while (remaining > 0) {
          const currentStep = Math.min(stepYears, remaining);
          engine.setTimeScale(currentStep / realDelta);
          engine.update(realDelta);
          remaining -= currentStep;
        }

        return syncRuntimePanels();
      },
      snapshotPlanets: () => {
        const engine = engineRef.current;
        if (!engine) return [];
        return engine.getBodies()
          .filter((b) => b.alive && b.type === 'planet')
          .map((b) => ({
            id: b.id,
            name: b.name,
            lifeStage: b.lifeStage,
            hasLife: b.hasLife,
            habitabilityScore: b.habitabilityScore,
            biosphereHealth: b.biosphereHealth,
            biodiversity: b.biodiversity,
            complexityScore: b.complexityScore,
            intelligencePotential: b.intelligencePotential,
            mutationPressure: b.mutationPressure,
            extinctionPressure: b.extinctionPressure,
            evolutionTree: (b.evolutionTree || []).map(s => ({ ...s })),
            biomeArchetype: b.biomeArchetype,
            hasBiosphereGrid: !!(b.biosphereGrid && b.biosphereGrid.cells?.length),
            hasCivCharacter: !!(b.civilization && b.civilization.character),
          }));
      },
      creatureComposerTest: () => {
        try {
          clearCreatureComposerCache();
          const fake = {
            id: 'test_sp_stable',
            name: 'Stabledon',
            stage: 'intelligent',
            traits: { metabolism: 'chemosynthesis', locomotion: 'bipedal' },
            description: 'Test species for composer determinism.',
          };
          const a = composeCreatureDataUrl(fake, { temperature: 280 });
          const b = composeCreatureDataUrl(fake, { temperature: 280 });
          return { sameTwice: a === b, prefixLen: a.length };
        } catch (e) {
          return { error: String(e?.message || e) };
        }
      },
      snapshotBodies: () => {
        const engine = engineRef.current;
        if (!engine) return [];
        return engine.getBodies()
          .filter((b) => b.alive)
          .map((b) => ({
            id: b.id,
            name: b.name,
            type: b.type,
            temperature: b.temperature,
            luminosity: b.luminosity,
            phase: b.phase,
          }));
      },
      /** Fire the body-selected pipeline (same as clicking a body in the canvas) */
      selectBody: (bodyId) => {
        const scene = sceneRef.current;
        if (scene?.onBodySelected) scene.onBodySelected(bodyId);
      },
    };

    window.__GENESIS_ERROR_DEBUG__ = debugApi;
    return () => {
      if (window.__GENESIS_ERROR_DEBUG__ === debugApi) {
        delete window.__GENESIS_ERROR_DEBUG__;
      }
    };
  }, [
    clearSelection,
    handleResetLifeTuning,
    handleSetLifePreset,
    handleUpdateLifeTuning,
    navigateTo,
    setBodies,
    setSimState,
    syncRuntimePanels,
  ]);

  /**
   * Handle starting the simulation from creation panel.
   * Creates a default cluster and system, then places bodies.
   */
  const handleStartSimulation = useCallback((createdBodies, universeParams) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine) return;

    if (!Array.isArray(createdBodies) || createdBodies.length !== 1) {
      return;
    }

    // Apply universe parameters if provided
    if (universeParams) {
      if (universeParams.boundaryRadius) {
        engine.universe._initialBoundaryRadius = universeParams.boundaryRadius;
        engine.universe.boundaryRadius = universeParams.boundaryRadius;
      }
      if (universeParams.gasH != null) {
        engine.universe.composition.H = universeParams.gasH;
        engine.universe.composition.He = universeParams.gasHe || (1 - universeParams.gasH);
      }
      engine._starFormRateMultiplier = universeParams.starFormRate ?? 1;
      engine._planetFormRateMultiplier = universeParams.planetFormRate ?? 1;
      if (universeParams.lifeEnabled === false) {
        engine.lifeEvolutionSystem.enabled = false;
      }
      if (universeParams.lifeDifficulty != null) {
        engine._lifeDifficultyMultiplier = universeParams.lifeDifficulty;
      }
      // Cosmological parameters
      if (universeParams.omega != null)          engine.universe.omega          = universeParams.omega;
      if (universeParams.hubbleConstant != null) engine.universe.hubbleParam    = universeParams.hubbleConstant;
      if (universeParams.initialTemperature != null) {
        engine.universe._initialTemperature = universeParams.initialTemperature;
        engine.universe.cosmicTemperature   = universeParams.initialTemperature;
      }
    }

    const first = createdBodies[0];
    const numClusters = universeParams?.initialClusters ?? 1;
    const galaxyNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const galaxyColors = ['#6688ff', '#ff8866', '#66ffaa', '#ffaa66', '#aa66ff'];
    const galaxyTypes = ['spiral', 'elliptical', 'irregular', 'spiral', 'elliptical'];
    const starPresets = ['sun_like', 'red_dwarf', 'blue_giant', 'orange_dwarf'];

    // Create the player's cluster at the origin
    const cluster = engine.createCluster({
      name: `Galaxy ${galaxyNames[0]}`,
      type: 'spiral',
      position: { x: 0, y: 0, z: 0 },
      color: galaxyColors[0],
    });

    const system = engine.createStarSystem(cluster.id, {
      name: 'Primary System',
      position: { x: 0, y: 0, z: 0 },
    });

    if (first.bodyType === 'planet') {
      const primaryStar = engine.createStar('sun_like', {
        name: 'Primary Star',
        systemId: system.id,
        position: { x: 0, y: 0, z: 0 },
      });
      engine.createPlanet(first.presetId, primaryStar, {
        name: first.name,
        systemId: system.id,
        ...first.params,
      });
    } else {
      engine.createStar(first.presetId, {
        name: first.name,
        systemId: system.id,
        position: { x: 0, y: 0, z: 0 },
        ...first.params,
      });
    }

    // Create additional initial clusters spread across the universe
    // Give each cluster a tangential (circular-orbit) velocity so they orbit
    // the origin stably instead of falling inward and getting ejected.
    const G_UNIVERSE = 4.5e-6; // must match Universe.updateClusterPhysics
    const CLUSTER_MASS_APPROX = 100;
    const boundary = engine.universe.boundaryRadius || 50;
    for (let i = 1; i < numClusters; i++) {
      const angle = (Math.PI * 2 * i) / numClusters + (Math.random() - 0.5) * 0.5;
      const dist = boundary * (0.15 + Math.random() * 0.35);
      // Circular-orbit speed around the origin (treats all other clusters as a point mass at origin)
      const vCirc = Math.sqrt(G_UNIVERSE * CLUSTER_MASS_APPROX * numClusters / Math.max(dist, 1));
      // Tangent direction in XZ plane (perpendicular to radial, 90° CCW)
      const tx = -Math.sin(angle);
      const tz = Math.cos(angle);
      const extraCluster = engine.createCluster({
        name: `Galaxy ${galaxyNames[i] || `G${i + 1}`}`,
        type: galaxyTypes[i % galaxyTypes.length],
        position: { x: dist * Math.cos(angle), y: 0, z: dist * Math.sin(angle) },
        velocity: { x: tx * vCirc, y: 0, z: tz * vCirc },
        color: galaxyColors[i % galaxyColors.length],
      });
      const extraSystem = engine.createStarSystem(extraCluster.id, {
        name: `${extraCluster.name} Primary`,
        position: { x: 0, y: 0, z: 0 },
      });
      const presetId = starPresets[Math.floor(Math.random() * starPresets.length)];
      engine.createStar(presetId, {
        name: `${extraCluster.name} Star`,
        systemId: extraSystem.id,
      });
    }

    // Seed initial nebulas
    const numNebulas = universeParams?.initialNebulas ?? 2;
    const nebulaColors = ['#cc88ff', '#88aaff', '#ff8866', '#66ffcc', '#ffdd66'];
    const nebulaTypes  = ['emission', 'reflection', 'dark', 'planetary', 'emission'];
    for (let i = 0; i < numNebulas; i++) {
      const angle = (Math.PI * 2 * i) / Math.max(numNebulas, 1) + Math.random() * 0.8;
      const dist  = (engine.universe.boundaryRadius || 50) * (0.2 + Math.random() * 0.55);
      engine.universe.addNebula({
        name: `Nebula ${String.fromCharCode(65 + i)}`,
        type: nebulaTypes[i % nebulaTypes.length],
        color: nebulaColors[i % nebulaColors.length],
        position: {
          x: dist * Math.cos(angle),
          y: (Math.random() - 0.5) * (engine.universe.boundaryRadius || 50) * 0.15,
          z: dist * Math.sin(angle),
        },
        velocity: { x: 0, y: 0, z: 0 },
        radius: 4 + Math.random() * 10,
        gasMass: 0.5 + Math.random() * 0.5,
        birthRate: 0.2 + Math.random() * 0.4,
        birthCooldown: 3e8 + Math.random() * 5e8,
      });
    }

    // Seed initial rogue stars
    const numRogues = universeParams?.initialRogueStars ?? 0;
    const rogueBoundary = engine.universe.boundaryRadius || 50;
    const roguePresets = ['red_dwarf', 'sun_like', 'orange_dwarf'];
    const rogueSysCluster = engine.createCluster({
      name: 'Rogue Cluster',
      type: 'irregular',
      isRogueFormation: true,
      position: { x: 0, y: 0, z: 0 },
    });
    for (let i = 0; i < numRogues; i++) {
      const rAngle = Math.random() * Math.PI * 2;
      const rDist  = rogueBoundary * (0.05 + Math.random() * 0.4);
      const rx = rDist * Math.cos(rAngle);
      const rz = rDist * Math.sin(rAngle);
      const rogueSystem = engine.createStarSystem(rogueSysCluster.id, {
        name: `Rogue System ${i + 1}`,
        position: { x: rx, y: 0, z: rz },
      });
      const roguePreset = roguePresets[Math.floor(Math.random() * roguePresets.length)];
      const rogueStar = engine.createStar(roguePreset, {
        name: `Rogue Star ${i + 1}`,
        systemId: rogueSystem.id,
      });
      // Mark them as escaped so they drift through universe space
      rogueStar.escapedSystem = true;
      if (rogueStar.universePosition) {
        rogueStar.universePosition.set(rx, 0, rz);
      } else {
        rogueStar.universePosition = { x: rx, y: 0, z: rz, length() { return Math.sqrt(this.x**2+this.y**2+this.z**2); }, addScaledVector(v,s) { this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; } };
      }
      rogueStar.universeVelocity = { x: (Math.random() - 0.5) * 0.02, y: 0, z: (Math.random() - 0.5) * 0.02 };
      engine._escapedBodies.push(rogueStar);
    }
    if (numRogues === 0) {
      // Remove the placeholder rogue cluster if unused
      rogueSysCluster.alive = false;
    }

    engine.start();
    setSimState('running');
    useStore.getState().clearCreatedBodies();

    navigateTo(VIEW_LEVEL.SYSTEM, {
      clusterId: cluster.id,
      systemId: system.id,
    });

    if (scene) {
      const systemBodies = engine.getSystemBodies(system.id).filter(b => b.alive);
      scene.transitionToSystem(systemBodies.length ? systemBodies : engine.getBodies().filter(b => b.alive));
    }
  }, []);

  const handleWelcomeScratch = useCallback(() => {
    setWelcomeFlowOpen(false);
  }, []);

  const handleWelcomeExample = useCallback((seedFn) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    setWelcomeFlowOpen(false);
    if (!engine || !scene || typeof seedFn !== 'function') return;

    engine.reset();
    scene.clearSimulationVisuals({ clearClusters: true });
    const ids = seedFn(engine);
    useStore.getState().clearCreatedBodies();
    setTimeScale(engine.timeScale);
    engine.start();
    setSimState('running');
    navigateTo(VIEW_LEVEL.SYSTEM, {
      clusterId: ids?.clusterId ?? null,
      systemId: ids?.systemId ?? null,
    });
    setTimeout(() => {
      for (const gs of engine.gravitySystems.values()) {
        gs.computeAccelerations(gs.getAliveBodies());
      }
      const sysId = ids?.systemId;
      const alive = (b) => b.alive;
      const bodies = sysId ? engine.getSystemBodies(sysId).filter(alive) : engine.getBodies().filter(alive);
      scene.transitionToSystem(bodies.length ? bodies : engine.getBodies().filter(alive));
    }, 100);
  }, [navigateTo, setSimState, setTimeScale]);

  const handleLaunchExample = useCallback((seedFn) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene || typeof seedFn !== 'function') return;

    engine.reset();
    scene.clearSimulationVisuals({ clearClusters: true });
    clearSelection();
    const ids = seedFn(engine);
    useStore.getState().clearCreatedBodies();
    setTimeScale(engine.timeScale);
    engine.start();
    setSimState('running');
    navigateTo(VIEW_LEVEL.SYSTEM, {
      clusterId: ids?.clusterId ?? null,
      systemId: ids?.systemId ?? null,
    });
    setTimeout(() => {
      for (const gs of engine.gravitySystems.values()) {
        gs.computeAccelerations(gs.getAliveBodies());
      }
      const sysId = ids?.systemId;
      const alive = (b) => b.alive;
      const bodies = sysId ? engine.getSystemBodies(sysId).filter(alive) : engine.getBodies().filter(alive);
      scene.transitionToSystem(bodies.length ? bodies : engine.getBodies().filter(alive));
    }, 100);
  }, [clearSelection, navigateTo, setSimState, setTimeScale]);

  const handleReplayWelcome = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_DONE_KEY);
    } catch (_) {}
    setWelcomeFlowOpen(true);
  }, []);

  const handleExplore = useCallback((body) => {
    const engine = engineRef.current;
    const explorer = explorerRef.current;
    const scene = sceneRef.current;
    if (!engine || !explorer || !scene) return;

    engine.enterExplorerMode(body);
    scene.enterExplorerMode(body);
    explorer.enable(body);
    setSimState('explorer');

    navigateTo(VIEW_LEVEL.BODY, { bodyId: body.id });
    scene.transitionToBody(body);
  }, []);

  const handleExitExplorer = useCallback(() => {
    const engine = engineRef.current;
    const explorer = explorerRef.current;
    const scene = sceneRef.current;
    if (!engine || !explorer || !scene) return;

    explorer.disable();
    scene.exitExplorerMode();
    engine.exitExplorerMode();
    setSimState('paused');

    const focusedSysId = useStore.getState().focusedSystemId;
    navigateTo(VIEW_LEVEL.SYSTEM, { systemId: focusedSysId });
    scene.transitionToSystem(engine.getBodies());
  }, []);

  const handleGoToUniverseCoordinate = useCallback((coords) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene || !coords) return;

    const aliveClusters = engine.universe.clusters.filter((c) => c.alive);
    let nearestCluster = null;
    let nearestDistance = Infinity;
    for (const cluster of aliveClusters) {
      const dx = cluster.position.x - coords.x;
      const dy = cluster.position.y - coords.y;
      const dz = cluster.position.z - coords.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestCluster = cluster;
      }
    }

    let cluster;
    let system;
    if (nearestCluster && nearestDistance < 20) {
      cluster = nearestCluster;
      system = engine.createStarSystem(cluster.id, {
        name: `${cluster.name} System ${engine.universe.getSystemsForCluster(cluster.id).length + 1}`,
        position: {
          x: coords.x - cluster.position.x,
          y: coords.y - cluster.position.y,
          z: coords.z - cluster.position.z,
        },
      });
    } else {
      cluster = engine.createCluster({
        name: `Galaxy ${engine.universe.clusters.length + 1}`,
        type: 'spiral',
        position: { x: coords.x, y: coords.y, z: coords.z },
      });
      system = engine.createStarSystem(cluster.id, {
        name: `${cluster.name} Primary`,
        position: { x: 0, y: 0, z: 0 },
      });
    }

    setUniverseCoordinatePopup(null);
    handleDeselectBody();
    navigateTo(VIEW_LEVEL.SYSTEM, { clusterId: cluster.id, systemId: system.id });
    scene.transitionToSystem([]);
  }, [handleDeselectBody, navigateTo]);

  /**
   * Navigate to universe view
   */
  const handleNavigateToUniverse = useCallback(() => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    setClusterPopup(null);
    setUniverseCoordinatePopup(null);
    navigateTo(VIEW_LEVEL.UNIVERSE);
    if (scene) {
      let focusTarget = null;
      const state = useStore.getState();
      const focusedBody = state.selectedBodyId ? engine?.getBody(state.selectedBodyId) : null;
      if (focusedBody) {
        focusTarget = engine?.getBodyUniversePosition?.(focusedBody) || null;
      } else if (state.focusedClusterId) {
        const cluster = engine?.universe?.getCluster(state.focusedClusterId);
        if (cluster) {
          focusTarget = { x: cluster.position.x, y: cluster.position.y, z: cluster.position.z };
        }
      } else if (state.focusedSystemId) {
        focusTarget = engine?.getSystemWorldPosition?.(state.focusedSystemId) || null;
      }
      scene.transitionToUniverse(focusTarget);
    }
  }, []);

  /**
   * Navigate to a cluster's system view.
   * If clusterId is null, uses the first alive cluster.
   */
  const handleNavigateToCluster = useCallback((clusterId) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene) return;

    let cluster = clusterId ? engine.universe.getCluster(clusterId) : null;
    if (!cluster) {
      const alive = engine.universe.clusters.filter(c => c.alive);
      cluster = alive[0] || null;
    }
    if (!cluster) {
      // No clusters at all — just switch to system view with all bodies
      navigateTo(VIEW_LEVEL.SYSTEM);
      scene.transitionToSystem(engine.getBodies());
      return;
    }

    // Try each system in the cluster until we find one with bodies
    let bestSystemId = null;
    let bestBodies = [];
    for (const sysId of cluster.systemIds) {
      const sysBodies = engine.getSystemBodies(sysId);
      if (sysBodies.length > bestBodies.length) {
        bestSystemId = sysId;
        bestBodies = sysBodies;
      }
    }
    if (!bestSystemId) bestSystemId = cluster.systemIds[0];

    navigateTo(VIEW_LEVEL.SYSTEM, { clusterId: cluster.id, systemId: bestSystemId });

    const bodiesToShow = bestSystemId ? bestBodies.filter((b) => b.alive) : engine.getBodies();
    scene.transitionToSystem(bodiesToShow);
  }, []);

  const handleGoToSystemFromPopup = useCallback((clusterId) => {
    setClusterPopup(null);
    handleNavigateToCluster(clusterId);
  }, [handleNavigateToCluster]);

  /**
   * Navigate to body view - centers on the body, isolates it, dark background, info panel beside
   */
  const handleNavigateToBody = useCallback((bodyId) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene) return;

    const body = engine.getBody(bodyId);
    if (!body) return;

    // Ensure system context
    let clusterId = null;
    if (body.systemId) {
      const sys = engine.universe.getSystem(body.systemId);
      if (sys) clusterId = sys.clusterId;
    }

    navigateTo(VIEW_LEVEL.BODY, {
      systemId: body.systemId,
      clusterId,
      bodyId,
    });

    engine.getBodies().forEach(b => b.selected = false);
    body.selected = true;
    setSelectedBody(body);
    scene.setSelectedBody(body);

    // Full body view: centered, dark background, habitable zone for stars
    scene.transitionToBody(body);
  }, []);

  const handleDeselectBody = useCallback(() => {
    const scene = sceneRef.current;
    if (scene?.onBodyDeselected) {
      scene.onBodyDeselected();
      return;
    }
    clearSelection();
  }, [clearSelection]);

  const handleAddBody = useCallback((config) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine) return;

    let newBody;
    let currentSystemId = useStore.getState().focusedSystemId;

    // Safety: ensure a cluster and system exist for body placement
    if (!currentSystemId || !engine.universe.getSystem(currentSystemId)) {
      let cluster = engine.universe.clusters.find(c => c.alive);
      if (!cluster) {
        cluster = engine.createCluster({ name: 'Galaxy Alpha', type: 'spiral', position: { x: 0, y: 0, z: 0 } });
      }
      let system = engine.universe.getSystemsForCluster(cluster.id).find(s => s.alive);
      if (!system) {
        system = engine.createStarSystem(cluster.id, { name: 'Primary System', position: { x: 0, y: 0, z: 0 } });
      }
      currentSystemId = system.id;
      navigateTo(useStore.getState().viewLevel, { clusterId: cluster.id, systemId: system.id });
    }

    if (config.bodyType === 'star') {
      const sysBodies = engine.getSystemBodies(currentSystemId).filter(b => b.alive && !b.escapedSystem);
      const gs = engine.getSystemGravity(currentSystemId);
      const com = gs ? gs.centerOfMass() : { position: { x: 0, y: 0, z: 0 }, totalMass: 0 };
      const refStar = config.referenceId ? sysBodies.find(b => b.id === config.referenceId) : null;
      const refPos = refStar ? refStar.position : com.position;

      // Compute current system CoM velocity (so the new star orbits in the right inertial frame)
      let comVx = 0, comVz = 0;
      if (com.totalMass > 0) {
        for (const b of sysBodies) {
          comVx += b.mass * b.velocity.x;
          comVz += b.mass * b.velocity.z;
        }
        comVx /= com.totalMass;
        comVz /= com.totalMass;
      }

      let starPos;
      if (config.params?.position) {
        starPos = config.params.position;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = config.distance || 5;
        starPos = {
          x: refPos.x + dist * Math.cos(angle),
          y: refPos.y,
          z: refPos.z + dist * Math.sin(angle),
        };
      }

      newBody = engine.createStar(config.presetId, {
        name: config.name,
        systemId: currentSystemId,
        position: starPos,
      });

      if (com.totalMass > 0) {
        const G_sim = 4 * Math.PI * Math.PI;
        const dx = newBody.position.x - com.position.x;
        const dz = newBody.position.z - com.position.z;
        const r = Math.sqrt(dx * dx + dz * dz) || 1;
        if (r > 0.01) {
          const M_total = com.totalMass + newBody.mass;
          // Relative circular orbit speed (two-body problem)
          const vRel = Math.sqrt(G_sim * M_total / r);
          // Unit tangent (perpendicular to separation in xz plane)
          const ux = -dz / r;
          const uz = dx / r;
          // New body: orbits at its fraction of the relative velocity
          const f2 = com.totalMass / M_total;
          newBody.velocity.set(comVx + f2 * vRel * ux, 0, comVz + f2 * vRel * uz);
          // Existing bodies: equal-and-opposite reaction kick (conserves CoM momentum)
          const f1 = newBody.mass / M_total;
          const dVx = -f1 * vRel * ux;
          const dVz = -f1 * vRel * uz;
          for (const b of sysBodies) {
            b.velocity.x += dVx;
            b.velocity.z += dVz;
          }
        }
      }
    } else if (config.bodyType === 'planet') {
      const sysBodies = engine.getSystemBodies(currentSystemId);
      const stars = sysBodies.filter(b => b.type === 'star' && b.alive);
      const parentStar = config.referenceId
        ? stars.find(s => s.id === config.referenceId)
        : (stars.length > 0 ? stars.reduce((best, s) => s.mass > best.mass ? s : best, stars[0]) : null);

      if (!parentStar) return;

      let orbitalDist = config.orbitalDistance || 1;
      if (config.params?.position && parentStar) {
        const dx = config.params.position.x - parentStar.position.x;
        const dz = config.params.position.z - parentStar.position.z;
        orbitalDist = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
      }
      newBody = engine.createPlanet(config.presetId, parentStar, {
        name: config.name,
        orbitalDistance: orbitalDist,
        systemId: currentSystemId,
        orbitalCenter: stars.length > 1 ? parentStar.position : undefined,
        orbitalMass: stars.length > 1 ? parentStar.mass : undefined,
      });
    }

    const sysGS = engine.getSystemGravity(currentSystemId);
    if (sysGS) sysGS.computeAccelerations(sysGS.getAliveBodies());

    if (engine.paused) {
      engine.resume();
      setSimState('running');
    }

    if (newBody && scene) {
      scene.pauseTrackingFor(2);
      const vl = useStore.getState().viewLevel;
      let framedByTransition = false;
      // If user was in universe view, enter system view so the edited system is centred on screen
      if (vl === VIEW_LEVEL.UNIVERSE && currentSystemId) {
        const sys = engine.universe.getSystem(currentSystemId);
        if (sys) {
          navigateTo(VIEW_LEVEL.SYSTEM, { clusterId: sys.clusterId, systemId: currentSystemId });
          const sb = engine.getSystemBodies(currentSystemId).filter(b => b.alive);
          scene.transitionToSystem(sb.length ? sb : engine.getBodies().filter(b => b.alive));
          framedByTransition = true; // already animates camera to this system’s COM + extent
        }
      }
      // Refit only when not already framed by transitionToSystem (avoids fighting the 700ms animation)
      if (!framedByTransition) {
        setTimeout(() => {
          const sysId = useStore.getState().focusedSystemId || currentSystemId;
          const sysBodies = sysId ? engine.getSystemBodies(sysId).filter(b => b.alive) : [];
          const toFrame = sysBodies.length > 0 ? sysBodies : engine.getBodies().filter(b => b.alive);
          scene.computeSystemMetrics(toFrame);
          scene.fitAllBodies();
        }, 80);
      }
    }
  }, [setSimState, navigateTo]);

  /**
   * Handle drag-and-drop from ObjectPalette into simulation
   */
  const handleCanvasDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const scene = sceneRef.current;
    const engine = engineRef.current;
    if (!scene || !engine) return;
    const worldPos = scene.screenToWorldPlane(e.clientX, e.clientY);
    const sysId = useStore.getState().focusedSystemId;
    const bodies = sysId ? engine.getSystemBodies(sysId) : engine.getBodies();
    const dragObj = useStore.getState().draggingObject;
    scene.updateDragHelpers(worldPos, bodies, dragObj);
  }, []);

  const handleCanvasDragLeave = useCallback(() => {
    sceneRef.current?.clearDragHelpers();
  }, []);

  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    sceneRef.current?.clearDragHelpers();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data && data.presetId) {
        const scene = sceneRef.current;
        if (scene) {
          const worldPos = scene.screenToWorldPlane(e.clientX, e.clientY);
          if (worldPos) {
            data.params = data.params || {};
            data.params.position = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
          }
        }
        handleAddBody(data);
      }
    } catch (_) {}
    setDraggingObject(null);
  }, [handleAddBody, setDraggingObject]);

  const handleSaveSlot = useCallback(async (slotId) => {
    const data = engineRef.current?.toJSON();
    if (!data) throw new Error('No simulation data.');
    const ok = await saveSlot(slotId, data);
    if (!ok) throw new Error('Save failed.');

    if (cloud.isLoggedIn()) {
      try {
        const bodyCount = engineRef.current?.getBodies?.()?.length ?? 0;
        const simTime = data.simulationTime ?? 0;
        await cloud.cloudSave(slotId, data, bodyCount, simTime);
      } catch (err) {
        console.warn('Cloud save failed (local save succeeded):', err.message);
      }
    }
    return true;
  }, [cloudUser]);

  const handleLoadSlot = useCallback(async (slotId) => {
    try {
      const savedData = await loadSlot(slotId);
      if (savedData) {
        const engine = engineRef.current;
        const scene = sceneRef.current;
        if (engine && scene) {
          engine.reset();
          scene.clearSimulationVisuals({ clearClusters: true });
          engine.fromJSON(savedData);
          setTimeScale(engine.timeScale);
          setSimState('paused');
          handleDeselectBody();

          for (const gs of engine.gravitySystems.values()) {
            gs.computeAccelerations(gs.getAliveBodies());
          }

          navigateTo(VIEW_LEVEL.SYSTEM);
          setTimeout(() => {
            scene.computeSystemMetrics(engine.getBodies());
            scene.transitionToSystem(engine.getBodies());
          }, 100);

          return true;
        }
      }
    } catch (error) {
      console.error('Failed to load simulation:', error);
    }
    return false;
  }, [setSimState, handleDeselectBody]);

  const handleGetSaveSlots = useCallback(() => getSaveSlots(), []);
  const handleDeleteSlot = useCallback(async (slotId) => deleteSlot(slotId), []);

  const showSaveDialogHandler = useCallback(() => {
    setSaveDialogMode('save');
    setShowSaveDialog(true);
  }, []);

  const showLoadDialogHandler = useCallback(() => {
    setSaveDialogMode('load');
    setShowSaveDialog(true);
  }, []);

  const handleNewSimulationRequest = useCallback(() => {
    if (simState !== 'setup') {
      setShowNewSimDialog(true);
    } else {
      handleNewSimulation();
    }
  }, [simState]);

  const handleNewSimulation = useCallback(() => {
    const engine = engineRef.current;
    const scene = sceneRef.current;

    if (engine && scene) {
      engine.reset();
      scene.clearSimulationVisuals({ clearClusters: true });
      setSimState('setup');
      handleDeselectBody();
      setShowNewSimDialog(false);
      setShowReturnToMenuDialog(false);
      navigateTo(VIEW_LEVEL.UNIVERSE);
    }
  }, [setSimState, handleDeselectBody]);

  const handleReturnToMenuRequest = useCallback(() => {
    setShowReturnToMenuDialog(true);
  }, []);

  const handleReturnToMenuWithSave = useCallback(() => {
    setShowReturnToMenuDialog(false);
    returnToMenuAfterSaveRef.current = true;
    setSaveDialogMode('save');
    setShowSaveDialog(true);
  }, []);

  const handleReturnToMenuWithoutSave = useCallback(() => {
    setShowReturnToMenuDialog(false);
    handleNewSimulation();
  }, [handleNewSimulation]);

  const handleSaveSuccess = useCallback(() => {
    if (returnToMenuAfterSaveRef.current) {
      returnToMenuAfterSaveRef.current = false;
      setShowSaveDialog(false);
      handleNewSimulation();
    }
  }, [handleNewSimulation]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const active = document.activeElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (simState !== 'setup') {
            if (simState === 'explorer') {
              handleExitExplorer();
              engineRef.current?.resume();
              setSimState('running');
            } else {
              engineRef.current?.togglePause();
              setSimState(engineRef.current?.paused ? 'paused' : 'running');
            }
          }
          break;
        case 'Escape':
          if (clusterPopup) {
            setClusterPopup(null);
          } else if (simState === 'explorer') {
            handleExitExplorer();
          } else if (viewLevel === VIEW_LEVEL.BODY) {
            handleNavigateToCluster(useStore.getState().focusedClusterId);
          } else if (viewLevel === VIEW_LEVEL.SYSTEM) {
            handleNavigateToUniverse();
          }
          break;
        case 'KeyC':
          toggleAIChat();
          break;
        case 'KeyI':
          toggleInfoPanel();
          break;
        case 'KeyF':
          sceneRef.current?.fitBodiesFiltered(getBodiesForView());
          break;
        case 'KeyU':
          handleNavigateToUniverse();
          break;
        case 'Equal':
        case 'NumpadAdd':
          if (sceneRef.current) {
            sceneRef.current.setViewScale(sceneRef.current.viewScale * 1.3);
          }
          break;
        case 'Minus':
        case 'NumpadSubtract':
          if (sceneRef.current) {
            sceneRef.current.setViewScale(sceneRef.current.viewScale / 1.3);
          }
          break;
        case 'KeyR':
          if (sceneRef.current) {
            sceneRef.current.setViewScale(1.0);
          }
          break;
        case 'KeyS':
          if (e.ctrlKey) {
            e.preventDefault();
            showSaveDialogHandler();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    simState, viewLevel, clusterPopup, handleExitExplorer, handleNavigateToCluster,
    handleNavigateToUniverse, showSaveDialogHandler, setSimState, toggleAIChat,
    toggleInfoPanel, getBodiesForView,
  ]);

  const isElectron = !!window.electronAPI;
  const userDisplayName = cloudUser?.username || null;

  if (initError) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: '#0a0a1a', color: '#e8e8ff', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, fontFamily: 'Segoe UI', textAlign: 'center', zIndex: 99999,
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>&#x2726;</div>
        <h1 style={{ fontSize: 24, marginBottom: 12, color: '#00ccff' }}>Genesis Error</h1>
        <pre style={{
          fontSize: 14, color: '#ffaa44', maxWidth: 550, marginBottom: 24,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
          textAlign: 'left', background: '#111', padding: 20, borderRadius: 8,
        }}>
          {initError}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px', fontSize: 14, background: 'linear-gradient(135deg, #4488ff, #00ccff)',
            border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Custom Titlebar */}
      {isElectron ? (
        <div className="titlebar">
          <div className="titlebar-title">STARSIM</div>
          {userDisplayName && (
            <div className="titlebar-user">
              <span className="user-badge">{userDisplayName}</span>
              <button className="titlebar-btn" onClick={() => { cloud.logout(); setCloudUser(null); }} title="Log out">&#x23FB;</button>
            </div>
          )}
          <div className="titlebar-controls">
            <button className="titlebar-btn" onClick={() => window.electronAPI?.minimize()}>&#x2500;</button>
            <button className="titlebar-btn" onClick={() => window.electronAPI?.maximize()}>&#x25A1;</button>
            <button className="titlebar-btn close" onClick={handleAppClose}>&#x2715;</button>
          </div>
        </div>
      ) : (
        <div className="titlebar web-titlebar">
          <div className="titlebar-title">STARSIM</div>
          {userDisplayName ? (
            <div className="titlebar-user">
              <span className="user-badge">{userDisplayName}</span>
              <button className="titlebar-btn" onClick={() => { cloud.logout(); setCloudUser(null); }} title="Log out">&#x23FB;</button>
            </div>
          ) : (
            <div className="titlebar-subtitle">Universe Simulator</div>
          )}
        </div>
      )}

      {/* Three.js Canvas with drag-and-drop support */}
      <div
        className="canvas-container"
        ref={canvasRef}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      />

      {/* View Level Navigation Bar */}
      {simState !== 'setup' && (
        <div className="view-nav-bar">
          <button
            className={`view-nav-btn ${viewLevel === VIEW_LEVEL.UNIVERSE ? 'active' : ''}`}
            onClick={handleNavigateToUniverse}
            title="Universe View (U)"
          >
            &#x1F30C; Universe
          </button>
          <span className="view-nav-sep">/</span>
          <button
            className={`view-nav-btn ${viewLevel === VIEW_LEVEL.SYSTEM ? 'active' : ''}`}
            onClick={() => handleNavigateToCluster(focusedClusterId)}
            title="System View - shows orbiting bodies"
          >
            &#x2B50; System
          </button>
          <span className="view-nav-sep">/</span>
          <button
            className={`view-nav-btn ${viewLevel === VIEW_LEVEL.BODY ? 'active' : ''}`}
            onClick={() => selectedBodyId && handleNavigateToBody(selectedBodyId)}
            title="Body View"
            disabled={!selectedBodyId}
          >
            &#x1F52D; Body
          </button>
        </div>
      )}

      {/* Cluster hover tooltip */}
      {clusterTooltip && !clusterPopup && viewLevel === VIEW_LEVEL.UNIVERSE && (
        <div
          className="cluster-tooltip"
          style={{ left: clusterTooltip.x + 16, top: clusterTooltip.y - 10 }}
        >
          <strong>{clusterTooltip.name}</strong>
          <span>{clusterTooltip.bodyCount} bodies &bull; Click for details</span>
        </div>
      )}

      {/* Cluster Info Popup (appears when clicking a cluster diamond in universe view) */}
      {clusterPopup && viewLevel === VIEW_LEVEL.UNIVERSE && (
        <ClusterInfoPanel
          cluster={clusterPopup.cluster}
          systems={clusterPopup.systems}
          bodies={clusterPopup.bodies}
          screenPos={clusterPopup.screenPos}
          onGoToSystem={handleGoToSystemFromPopup}
          onClose={() => setClusterPopup(null)}
        />
      )}

      {universeCoordinatePopup && viewLevel === VIEW_LEVEL.UNIVERSE && (
        <UniverseCoordinatePanel
          coords={universeCoordinatePopup.coords}
          screenPos={universeCoordinatePopup.screenPos}
          onGoToCoordinate={handleGoToUniverseCoordinate}
          onClose={() => setUniverseCoordinatePopup(null)}
        />
      )}

      {/* Object Palette (top panel - Universe Sandbox style) */}
      {simState !== 'setup' && showObjectPalette && (
        <ObjectPalette
          onAddBody={handleAddBody}
          viewLevel={viewLevel}
        />
      )}

      {/* Universe Info Panel (WorldBox style) */}
      {simState !== 'setup' && showUniversePanel && (
        <UniversePanel
          universeStats={universeStats}
          engine={engineRef.current}
          lifeTuning={lifeTuning}
          onNavigateToCluster={handleNavigateToCluster}
          onNavigateToSystem={(sysId) => {
            const engine = engineRef.current;
            const scene = sceneRef.current;
            if (!engine || !scene) return;
            const system = engine.universe.getSystem(sysId);
            if (!system) return;
            navigateTo(VIEW_LEVEL.SYSTEM, { systemId: sysId, clusterId: system.clusterId });
            const bodies = engine.getSystemBodies(sysId);
            scene.transitionToSystem(bodies);
          }}
          onNavigateToUniverse={handleNavigateToUniverse}
          onNavigateToBody={handleNavigateToBody}
          onSetLifePreset={handleSetLifePreset}
          onUpdateLifeTuning={handleUpdateLifeTuning}
          onResetLifeTuning={handleResetLifeTuning}
        />
      )}

      {/* Creation Panel (Setup Phase) */}
      {simState === 'setup' && welcomeFlowOpen && (
        <WelcomeFlow
          onChooseScratch={handleWelcomeScratch}
          onChooseExample={handleWelcomeExample}
        />
      )}

      {simState === 'setup' && (
        <CreationPanel
          onStartSimulation={handleStartSimulation}
          onLoadSimulation={showSaveDialogHandler}
          onLoadFromSlot={handleLoadSlot}
          onSaveSimulation={showSaveDialogHandler}
          onDeleteSlot={handleDeleteSlot}
          onReplayWelcome={handleReplayWelcome}
          onLaunchExample={handleLaunchExample}
        />
      )}

      {/* HUD Overlay */}
      {simState !== 'setup' && <HUD onExitExplorer={simState === 'explorer' ? handleExitExplorer : undefined} />}

      {simState !== 'setup' && viewLevel === VIEW_LEVEL.BODY && focusedBodyId && bodySurfaceOpen && (
        <BodySurfaceView
          engine={engineRef.current}
          bodyId={focusedBodyId}
          onClose={() => setBodySurfaceOpen(false)}
        />
      )}

      {/* Time Control Bar */}
      {simState !== 'setup' && (
        <TimeControl
          engine={engineRef.current}
          onResumeFromExplorer={handleExitExplorer}
        />
      )}

      {/* Info Panel (when body selected) */}
      {selectedBody && showInfoPanel && simState !== 'setup' && (
        <InfoPanel
          onExplore={handleExplore}
          onClose={handleDeselectBody}
          onFocusBody={handleNavigateToBody}
          getBodies={() => engineRef.current?.getBodies?.() ?? []}
          engine={engineRef.current}
          universeStats={universeStats}
        />
      )}

      {/* View Controls (Scale Ruler) */}
      {simState !== 'setup' && viewLevel !== VIEW_LEVEL.UNIVERSE && (
        <ViewControls
          sceneManager={sceneRef.current}
          getBodies={getBodiesForView}
        />
      )}

      {/* Minimap - Context-aware */}
      {simState !== 'setup' && (
        <Minimap
          getBodies={() => engineRef.current?.getBodies?.() ?? []}
          sceneManager={sceneRef.current}
          selectedBodyId={selectedBodyId}
          simState={simState}
          onBodySelected={(id) => sceneRef.current?.onBodySelected?.(id)}
          engine={engineRef.current}
          onNavigateToCluster={handleNavigateToCluster}
          onNavigateToBody={handleNavigateToBody}
        />
      )}

      {/* Event Notifications */}
      <EventNotification />

      {/* Universe Chronicle (WorldBox-style log book) */}
      {simState !== 'setup' && (
        <EventChronicle engine={engineRef.current} />
      )}

      {/* AI Chat */}
      {showAIChat && (
        <AIChat
          aiAgent={aiAgentRef.current}
          onClose={toggleAIChat}
        />
      )}

      {/* Save/Load Dialog */}
      <SaveDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveSlot}
        onSaveSuccess={handleSaveSuccess}
        onLoad={handleLoadSlot}
        onGetSlots={handleGetSaveSlots}
        onDelete={handleDeleteSlot}
        mode={saveDialogMode}
      />

      {/* Toolbar – fixed bottom-right, lifted above TimeControl when sim is active */}
      <div className={`toolbar${simState !== 'setup' ? ' toolbar--above-timebar' : ''}`}>
        {simState !== 'setup' && (
          <button
            className={`toolbar-btn hz-toggle-btn ${showHabitableZone ? 'active' : ''}`}
            onClick={toggleHabitableZone}
            title={showHabitableZone ? 'Hide Habitable Zones' : 'Show Habitable Zones'}
          >
            HZ
          </button>
        )}
        {simState !== 'setup' && (
          <button
            className={`toolbar-btn grid-toggle-btn ${showDistGrid ? 'active' : ''}`}
            onClick={toggleDistGrid}
            title={showDistGrid ? 'Hide Distance Grid' : 'Show Distance Grid'}
          >
            ⊞
          </button>
        )}
        {simState !== 'setup' && (
          <button
            className={`toolbar-btn ${showAIChat ? 'active' : ''}`}
            onClick={toggleAIChat}
            title="AI Assistant (C)"
          >
            AI
          </button>
        )}
        <button
          className={`toolbar-btn save-icon-btn ${simState === 'setup' ? 'setup-mode' : ''}`}
          onClick={showSaveDialogHandler}
          title="Save / Load (Ctrl+S)"
        >
          &#x1F4BE;
        </button>
        {simState !== 'setup' && (
          <button
            className="toolbar-btn menu-btn"
            onClick={handleReturnToMenuRequest}
            title="Return to menu"
          >
            &#x2630;
          </button>
        )}
        {simState === 'explorer' && (
          <button
            className="toolbar-btn"
            onClick={handleExitExplorer}
            title="Exit Explorer (Esc)"
          >
            Exit
          </button>
        )}
        {cloudUser ? (
          <div
            className="toolbar-user"
            onClick={() => { cloud.logout(); setCloudUser(null); localStorage.removeItem('genesiserror-auth-dismissed'); }}
            title={`Logged in as ${cloudUser.username} - click to log out`}
          >
            {cloudUser.username}
          </div>
        ) : (
          <div
            className="toolbar-user offline"
            onClick={() => setShowAuthModal(true)}
            title="Play offline - click to log in"
          >
            Offline
          </div>
        )}
      </div>

      {/* Return to Menu Dialog */}
      {showReturnToMenuDialog && (
        <div className="dialog-overlay" onClick={() => setShowReturnToMenuDialog(false)}>
          <div className="caution-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="caution-header">
              <span className="caution-icon">&#x2630;</span>
              <h3>Return to Menu</h3>
            </div>
            <p>Do you want to save your simulation before returning to the menu?</p>
            <div className="dialog-buttons">
              <button
                className="dialog-btn primary"
                onClick={handleReturnToMenuWithSave}
              >
                Save & Return
              </button>
              <button
                className="dialog-btn secondary"
                onClick={handleReturnToMenuWithoutSave}
              >
                Don&apos;t Save
              </button>
              <button
                className="dialog-btn cancel"
                onClick={() => setShowReturnToMenuDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Simulation Caution Dialog */}
      {showNewSimDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewSimDialog(false)}>
          <div className="caution-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="caution-header">
              <span className="caution-icon">&#x26A0;</span>
              <h3>Unsaved Changes</h3>
            </div>
            <p>You have an active simulation that hasn't been saved. Would you like to save it before creating a new one?</p>
            <div className="dialog-buttons">
              <button
                className="dialog-btn primary"
                onClick={() => {
                  setShowNewSimDialog(false);
                  setSaveDialogMode('save');
                  setShowSaveDialog(true);
                }}
              >
                Save First
              </button>
              <button
                className="dialog-btn secondary"
                onClick={handleNewSimulation}
              >
                Don't Save
              </button>
              <button
                className="dialog-btn cancel"
                onClick={() => setShowNewSimDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => {
            setShowAuthModal(false);
            localStorage.setItem('genesiserror-auth-dismissed', '1');
          }}
          onAuth={(user) => {
            setCloudUser(user);
            localStorage.removeItem('genesiserror-auth-dismissed');
          }}
        />
      )}

      {/* Goodbye Splash */}
      {showGoodbye && (
        <div className="goodbye-overlay">
          <div className="goodbye-stars" />
          <div className="goodbye-content">
            <div className="goodbye-icon">&#x2726;</div>
            <h1 className="goodbye-title">Goodbye, dear creator.</h1>
            <p className="goodbye-sub">See you next time in your own universe!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

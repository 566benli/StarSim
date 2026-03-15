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
import AIChat from './components/AIChat';
import ViewControls from './components/ViewControls';
import Minimap from './components/Minimap';
import SaveDialog from './components/SaveDialog';
import AuthModal from './components/AuthModal';
import ObjectPalette from './components/ObjectPalette';
import UniversePanel from './components/UniversePanel';
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

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [cloudUser, setCloudUser] = useState(null);
  const authCheckedRef = useRef(false);

  const [showReturnToMenuDialog, setShowReturnToMenuDialog] = useState(false);
  const [showGoodbye, setShowGoodbye] = useState(false);
  const returnToMenuAfterSaveRef = useRef(false);

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
    focusedClusterId, focusedSystemId,
    setFocusedClusterId, setFocusedSystemId,
    showObjectPalette, showUniversePanel,
    draggingObject, setDraggingObject,
    showHabitableZone, toggleHabitableZone,
    setUniverseStats: setStoreUniverseStats,
  } = useStore();

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
        const dismissed = localStorage.getItem('starsim-auth-dismissed');
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

  useEffect(() => {
    let engine, scene, explorer, ai;
    try {
      engine = new SimEngine();
      engineRef.current = engine;
    } catch (e) {
      console.error('[StarSim] Engine init failed:', e);
      setInitError('Simulation engine failed to initialize: ' + e.message);
      return;
    }

    try {
      scene = new SceneManager(canvasRef.current);
      sceneRef.current = scene;
    } catch (e) {
      console.error('[StarSim] Renderer init failed:', e);
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
      console.error('[StarSim] Camera init failed:', e);
      setInitError('Camera system failed: ' + e.message);
      return;
    }

    try {
      ai = new AIAgent({ engine });
      aiAgentRef.current = ai;
    } catch (e) {
      console.warn('[StarSim] AI agent init failed (non-critical):', e);
    }

    engine.onEvent = (event) => {
      addEvent(event);
    };

    engine._boundaryHandler = (body) => {
      addEvent({
        id: `boundary_${Date.now()}`,
        name: 'Boundary',
        category: 'system',
        targetBody: body,
        time: engine.simulationTime,
        notification: {
          title: 'Boundary exceeded',
          body: `${body.name} crossed the system boundary and was destroyed.`,
          severity: 'major',
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
        scene.setSelectedBody(body);
        // Auto-transition to body view: center on this body only
        const sys = body.systemId ? engine.universe.getSystem(body.systemId) : null;
        navigateTo(VIEW_LEVEL.BODY, {
          systemId: body.systemId,
          clusterId: sys?.clusterId ?? null,
          bodyId: body.id,
        });
        scene.transitionToBody(body);
      }
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

      // Sync scene view level
      if (scene._viewLevel !== currentViewLevel) {
        scene.setViewLevel(currentViewLevel);
      }

      // Sync habitable zone toggle
      const hzVisible = useStore.getState().showHabitableZone;
      if (scene._showHabitableZone !== hzVisible) {
        scene.setHabitableZoneVisible(hzVisible);
      }

      // Determine which bodies to render based on view level
      const allBodies = engine.getBodies();
      let bodiesToRender = allBodies;
      if (currentViewLevel === VIEW_LEVEL.SYSTEM && currentFocusedSystemId) {
        bodiesToRender = engine.getSystemBodies(currentFocusedSystemId);
        if (bodiesToRender.length === 0) bodiesToRender = allBodies;
      }

      scene.render(bodiesToRender, engine.universe.clusters, allBodies);

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

  /**
   * Handle starting the simulation from creation panel.
   * Creates a default cluster and system, then places bodies.
   */
  const handleStartSimulation = useCallback((createdBodies) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine) return;

    // Create default cluster and system
    const cluster = engine.createCluster({
      name: 'Galaxy Alpha',
      type: 'spiral',
      position: { x: 0, y: 0, z: 0 },
    });

    const system = engine.createStarSystem(cluster.id, {
      name: 'Primary System',
      position: { x: 0, y: 0, z: 0 },
    });

    let primaryStar = null;

    for (const bodyConfig of createdBodies) {
      if (bodyConfig.bodyType === 'star') {
        const star = engine.createStar(bodyConfig.presetId, {
          name: bodyConfig.name,
          systemId: system.id,
          ...bodyConfig.params,
        });
        if (!primaryStar) primaryStar = star;
      }
    }

    for (const bodyConfig of createdBodies) {
      if (bodyConfig.bodyType === 'planet') {
        engine.createPlanet(bodyConfig.presetId, primaryStar, {
          name: bodyConfig.name,
          systemId: system.id,
          ...bodyConfig.params,
        });
      }
    }

    engine.start();
    setSimState('running');
    useStore.getState().clearCreatedBodies();

    // Start in system view focused on this system
    navigateTo(VIEW_LEVEL.SYSTEM, {
      clusterId: cluster.id,
      systemId: system.id,
    });

    if (scene) {
      scene.computeSystemMetrics(engine.getBodies());
      scene.transitionToSystem(engine.getBodies());
    }
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

  /**
   * Navigate to universe view
   */
  const handleNavigateToUniverse = useCallback(() => {
    const scene = sceneRef.current;
    navigateTo(VIEW_LEVEL.UNIVERSE);
    if (scene) scene.transitionToUniverse();
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
    if (!cluster) return;

    const firstSystemId = cluster.systemIds[0];
    navigateTo(VIEW_LEVEL.SYSTEM, { clusterId: cluster.id, systemId: firstSystemId });

    const bodies = firstSystemId
      ? engine.getSystemBodies(firstSystemId)
      : engine.getBodies();
    scene.transitionToSystem(bodies.length > 0 ? bodies : engine.getBodies());
  }, []);

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
      const sysBodies = engine.getSystemBodies(currentSystemId);
      const gs = engine.getSystemGravity(currentSystemId);
      const com = gs ? gs.centerOfMass() : { position: { x: 0, y: 0, z: 0 }, totalMass: 0 };
      const refStar = config.referenceId ? sysBodies.find(b => b.id === config.referenceId) : null;
      const refPos = refStar ? refStar.position : com.position;

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
          const vOrb = Math.sqrt(G_sim * com.totalMass / r);
          const vx = -vOrb * dz / r;
          const vz = vOrb * dx / r;
          newBody.velocity.set(vx, 0, vz);
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
    }
  }, [setSimState]);

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
          scene.bodyMeshes.clear();
          engine.fromJSON(savedData);
          setTimeScale(engine.timeScale);
          setSimState('paused');
          clearSelection();

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
  }, [setSimState, clearSelection]);

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
      scene.bodyMeshes.clear();
      scene._clusterMeshes.forEach(g => { scene.scene.remove(g); });
      scene._clusterMeshes.clear();
      setSimState('setup');
      clearSelection();
      setShowNewSimDialog(false);
      setShowReturnToMenuDialog(false);
      navigateTo(VIEW_LEVEL.UNIVERSE);
    }
  }, [setSimState, clearSelection]);

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
            engineRef.current?.togglePause();
            setSimState(engineRef.current?.paused ? 'paused' : 'running');
          }
          break;
        case 'Escape':
          if (simState === 'explorer') {
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
          sceneRef.current?.fitAllBodies();
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
  }, [simState, viewLevel]);

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
        <h1 style={{ fontSize: 24, marginBottom: 12, color: '#00ccff' }}>StarSim</h1>
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
            onClick={() => handleNavigateToCluster(
              focusedClusterId || engineRef.current?.universe?.clusters?.find(c => c.alive)?.id
            )}
            title="System View - shows orbiting bodies"
            disabled={!(focusedClusterId || engineRef.current?.universe?.clusters?.some(c => c.alive))}
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
          onNavigateToCluster={handleNavigateToCluster}
          onNavigateToSystem={(sysId) => {
            const engine = engineRef.current;
            const scene = sceneRef.current;
            if (!engine || !scene) return;
            const system = engine.universe.getSystem(sysId);
            if (!system) return;
            navigateTo(VIEW_LEVEL.SYSTEM, { systemId: sysId, clusterId: system.clusterId });
            const bodies = engine.getSystemBodies(sysId);
            scene.transitionToSystem(bodies.length > 0 ? bodies : engine.getBodies());
          }}
          onNavigateToUniverse={handleNavigateToUniverse}
          onNavigateToBody={handleNavigateToBody}
        />
      )}

      {/* Creation Panel (Setup Phase) */}
      {simState === 'setup' && (
        <CreationPanel
          onStartSimulation={handleStartSimulation}
          onLoadSimulation={showSaveDialogHandler}
          onLoadFromSlot={handleLoadSlot}
          onSaveSimulation={showSaveDialogHandler}
        />
      )}

      {/* HUD Overlay */}
      {simState !== 'setup' && <HUD onExitExplorer={simState === 'explorer' ? handleExitExplorer : undefined} />}

      {/* Time Control Bar */}
      {simState !== 'setup' && (
        <TimeControl engine={engineRef.current} />
      )}

      {/* Info Panel (when body selected) */}
      {selectedBody && simState !== 'setup' && (
        <InfoPanel
          onExplore={handleExplore}
          onClose={clearSelection}
          getBodies={() => engineRef.current?.getBodies?.() ?? []}
        />
      )}

      {/* View Controls (Scale Ruler) */}
      {simState !== 'setup' && viewLevel !== VIEW_LEVEL.UNIVERSE && (
        <ViewControls
          sceneManager={sceneRef.current}
          getBodies={() => engineRef.current?.getBodies?.() ?? []}
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

      {/* Toolbar – fixed bottom-right horizontal strip */}
      <div className="toolbar">
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
            onClick={() => { cloud.logout(); setCloudUser(null); localStorage.removeItem('starsim-auth-dismissed'); }}
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
            localStorage.setItem('starsim-auth-dismissed', '1');
          }}
          onAuth={(user) => {
            setCloudUser(user);
            localStorage.removeItem('starsim-auth-dismissed');
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

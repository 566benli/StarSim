/**
 * SceneManager - Manages the Three.js scene, camera, renderer, and post-processing
 * This is the bridge between simulation data and visual representation
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CAMERA_NEAR, CAMERA_FAR, BLOOM_INTENSITY, ARENA_RADIUS_AU, VIEW_LEVEL, UNIVERSE_RADIUS_MLY } from '@utils/constants';
import { temperatureToColor } from '@utils/math';
import { encodeBiosphereToTexture } from '@engine/biosphereGrid.js';
import {
  PLANET_VERTEX_GLSL,
  PLANET_FRAGMENT_GLSL,
  STAR_VERTEX_GLSL,
  STAR_FRAGMENT_GLSL,
  ATMOSPHERE_VERTEX_GLSL,
  ATMOSPHERE_FRAGMENT_GLSL,
  PHASE_VALUES,
  planetTypeIndex,
} from './celestialShaders.js';

export default class SceneManager {
  constructor(container) {
    this.container = container;
    this.bodyMeshes = new Map(); // body.id -> mesh group
    this.trailLines = new Map(); // body.id -> trail line
    this.rogueMarkers = new Map(); // body.id -> universe-space marker for escaped bodies
    this.selectedBody = null;
    this.hoveredBody = null;

    // Lazily-loaded matcap texture for rocky planets (planetType == 0).
    // The loader returns a placeholder Texture immediately and fills in the
    // image data when the file finishes downloading, so every rocky-planet
    // material can share the same instance and pick up the photoreal look
    // as soon as the asset is available.
    this._rockyMatcap = null;

    // Visual orbit cap: at high time scales (fast-forward) the N-body integration
    // advances too many orbits per frame to visualise clearly.  We track a separate
    // visual angle per planet and advance it at a capped angular velocity so that
    // every orbit takes at least MIN_ORBIT_PERIOD_S seconds of real wall-clock time.
    this._visualOrbitPhases = new Map(); // bodyId -> current visual angle (radians)
    this._frameDelta = 1 / 60;           // last real-time frame duration (seconds)

    this.init();
  }

  init() {
    // Check WebGL availability before creating renderer
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!gl) {
      throw new Error(
        'WebGL is not available on this device. Genesis Error requires WebGL to render 3D graphics.\n\n' +
        'Possible fixes:\n' +
        '• Update your graphics drivers\n' +
        '• Enable hardware acceleration in your system settings\n' +
        '• Try running on a device with a dedicated GPU'
      );
    }

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020210);
    // No fog - we want to see distant stars clearly

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    // 3D viewpoint: moderately above the orbital plane for depth
    this.camera.position.set(5, 4, 8);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = Math.min(1000, ARENA_RADIUS_AU * 1.2);
    this.controls.zoomSpeed = 1.5;

    // Pause COM tracking while user is actively interacting
    this.controls.addEventListener('start', () => {
      this.pauseTrackingFor(1.5);
    });

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0x111122, 0.3);
    this.scene.add(this.ambientLight);

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.2,    // strength (reduced to prevent washing out bg)
      0.3,    // radius
      0.6     // threshold (lower = more things bloom, but less bg washout)
    );
    this.composer.addPass(this.bloomPass);

    // Background meshes (procedural starfield + orbital-plane grid helper) are
    // intentionally NOT created here.  Per the latest art direction the scene
    // should show only the planets, stars, and their immediate VFX against a
    // clean dark backdrop — no 10k-point dust field, no axis grid.  The grid
    // helper was already force-hidden in `_updateViewVisibility`; we now also
    // skip the starfield so nothing competes with the celestial bodies for
    // attention or bloom.

    // Raycaster for picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Drag-vs-click detection: track pointer movement
    this._pointerDownPos = null;
    this._pointerMoved = false;
    this._CLICK_THRESHOLD = 5; // px — movements smaller than this count as click

    // Store bound handlers so we can remove them in dispose()
    this._boundOnResize = this.onResize.bind(this);
    this._boundOnMouseMove = this.onMouseMove.bind(this);
    this._boundOnClick = this.onClick.bind(this);
    this._boundOnPointerDown = this._onPointerDown.bind(this);
    this._boundOnPointerUp = this._onPointerUp.bind(this);
    window.addEventListener('resize', this._boundOnResize);
    this.renderer.domElement.addEventListener('mousemove', this._boundOnMouseMove);
    this.renderer.domElement.addEventListener('pointerdown', this._boundOnPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this._boundOnPointerUp);

    // Clock
    this.clock = new THREE.Clock();
    this.elapsedTime = 0;

    // View controls
    this.viewScale = 1.0;       // User-controlled visual size multiplier
    this.trackCOM = true;       // Whether camera tracks center of mass
    this.autoFrame = false;     // Whether to auto-fit all bodies
    this._comTarget = new THREE.Vector3();
    this._comSmooth = new THREE.Vector3();
    this._systemExtent = 5;     // Estimated system size in AU
    this._trackingPausedUntil = 0; // Skip trackCOM until this time (elapsedTime)
    this._arenaRadius = ARENA_RADIUS_AU; // Camera and physics boundary
    this._tempClampVec = new THREE.Vector3();

    // Body-follow mode: when set, camera locks onto this body each frame
    this.selectedBody = null;
    this._fastForwardMode = false;
    this._cameraAnimating = false;

    // Multi-level view
    this._viewLevel = VIEW_LEVEL.UNIVERSE;
    this._clusterMeshes = new Map();
    this._universeBoundary = null;
    this._habitableZoneMesh = null;
    this._universeGridHelper = null;

    this.createUniverseBoundary();

    // Drag placement helpers
    this._dragHelpersGroup = new THREE.Group();
    this._dragHelpersGroup.visible = false;
    this.scene.add(this._dragHelpersGroup);
    this._dragDistLines = [];
    this._dragLabels = [];
    this._dragOrbitRing = null;
    this._dragAngleArc = null;
    this._dragRadialLine = null;
    this._dragAngleLabel = null;
    this._dragGhost = null;

    // HZ visibility flag (controlled by store toggle)
    this._showHabitableZone = true;

    // Distance grid visibility
    this._showDistGrid = false;
    this._distGridGroup = null;
  }

  /**
   * Pause camera tracking for N seconds (e.g. when adding a body, so view stays fixed)
   */
  pauseTrackingFor(seconds) {
    this._trackingPausedUntil = this.clock.getElapsedTime() + seconds;
  }

  /**
   * Set the user-controlled view scale (visual size of bodies)
   */
  setViewScale(scale) {
    const next = Math.max(0.1, Math.min(10, scale));
    if (next === this.viewScale) return;
    this.viewScale = next;
    if (this.onViewScaleChange) this.onViewScaleChange(this.viewScale);
  }

  _disposeObject(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }

  /**
   * Clear all body/trail/cluster visuals so a fresh simulation can render cleanly.
   */
  clearSimulationVisuals({ clearClusters = true } = {}) {
    this.selectedBody = null;
    this._focusedBody = null;
    this._explorerTarget = null;
    this._nearestStarPos = null;

    this.trailLines.forEach((line) => {
      this.scene.remove(line);
      this._disposeObject(line);
    });
    this.trailLines.clear();

    this.rogueMarkers.forEach((group) => {
      this.scene.remove(group);
      this._disposeObject(group);
    });
    this.rogueMarkers.clear();

    // Clean up system envelope ring
    if (this._systemEnvelopeRing) {
      this.scene.remove(this._systemEnvelopeRing);
      this._systemEnvelopeRing.geometry?.dispose();
      this._systemEnvelopeRing.material?.dispose();
      this._systemEnvelopeRing = null;
    }
    if (this._systemEnvelopeHalo) {
      this.scene.remove(this._systemEnvelopeHalo);
      this._systemEnvelopeHalo.geometry?.dispose();
      this._systemEnvelopeHalo.material?.dispose();
      this._systemEnvelopeHalo = null;
    }

    this.bodyMeshes.forEach((group) => {
      this.scene.remove(group);
      this._disposeObject(group);
    });
    this.bodyMeshes.clear();

    if (clearClusters) {
      this._clusterMeshes.forEach((group) => {
        this.scene.remove(group);
        this._disposeObject(group);
      });
      this._clusterMeshes.clear();
      this._hoveredClusterId = null;
      this.container.style.cursor = '';
    }

    this.hideHabitableZone();
    this.hideSystemHabitableZones();
    this.clearDragHelpers();
    this.removeDistanceGrid();
  }

  /** Get system extent and center of mass for minimap */
  getSystemMetrics() {
    return {
      extent: this._systemExtent,
      com: this._comTarget ? this._comTarget.clone() : new THREE.Vector3(0, 0, 0),
      target: this.controls?.target?.clone(),
    };
  }

  /** Set camera target from world xz coordinates (for minimap click/drag) */
  setCameraTarget(worldX, worldZ) {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(worldX, this.controls.target.y, worldZ);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  /**
   * Raycast from screen coordinates to the y=0 plane (orbital plane).
   * Returns world {x, y, z} or null if no intersection.
   */
  screenToWorldPlane(clientX, clientY) {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) return hit;
    return null;
  }

  /**
   * Animated camera transition to a target position + look-at point.
   * Uses smooth interpolation over `durationMs` milliseconds.
   */
  animateCamera(targetPos, lookAt, durationMs = 800) {
    this._cameraAnimating = true;
    this.pauseTrackingFor(durationMs / 1000 + 0.5);

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const endPos = targetPos.clone();
    const endTarget = lookAt.clone();
    const startTime = performance.now();

    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / durationMs);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, endPos, ease);
      this.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.controls.update();

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this._cameraAnimating = false;
      }
    };
    requestAnimationFrame(animate);
  }

  /**
   * Lock camera onto a body — camera follows it every frame until cleared.
   * Unlike explorer mode, this doesn't change control limits or pause COM.
   */
  setSelectedBody(body) {
    this.selectedBody = body;
    if (body) this.focusOnBody(body);
  }

  clearSelectedBody() {
    this.selectedBody = null;
  }

  /**
   * Calculate system center of mass and extent
   */
  computeSystemMetrics(bodies) {
    if (!bodies || bodies.length === 0) return;

    let totalMass = 0;
    this._comTarget.set(0, 0, 0);
    let maxDist = 0;

    const aliveBodies = bodies.filter(b => b.alive);
    const metricBodies = aliveBodies.filter(b => !b.escapedSystem);
    const basisBodies = metricBodies.length > 0 ? metricBodies : aliveBodies;
    if (basisBodies.length === 0) return;

    for (const body of basisBodies) {
      this._comTarget.addScaledVector(body.position, body.mass);
      totalMass += body.mass;
    }

    if (totalMass > 0) {
      this._comTarget.divideScalar(totalMass);
    }

    // Compute extent: max distance from center of mass (getVisualScale already includes viewScale)
    for (const body of basisBodies) {
      const d = body.position.distanceTo(this._comTarget);
      const vs = this.getVisualScale(body);
      if (d + vs > maxDist) maxDist = d + vs;
    }

    this._systemExtent = Math.max(maxDist, 0.5);
  }

  /**
   * View projections (Universe Sandbox style). Direction from target to camera.
   * Orbit plane: xz (y=0); +y = up.
   */
  static VIEW_PROJECTIONS = {
    isometric: new THREE.Vector3(0.5, 0.55, 0.65).normalize(),
    top: new THREE.Vector3(0, 1, 0),      // Top-down, orbits seen as circles
    side: new THREE.Vector3(1, 0.25, 0).normalize(),  // Side / edge-on
    front: new THREE.Vector3(0, 0.4, 1).normalize(),  // Front view
  };

  static _AXIS_Y = new THREE.Vector3(0, 1, 0);

  /**
   * Mean angular speed about +Y through COM (xz plane). Drives co-rotating camera in system view.
   */
  _estimateSystemCorotationOmega(bodies) {
    if (!bodies || bodies.length < 2) return 0;
    const com = this._comTarget;
    let M = 0;
    let cvx = 0; let cvy = 0; let cvz = 0;
    for (const b of bodies) {
      if (!b.alive) continue;
      M += b.mass;
      cvx += b.mass * b.velocity.x;
      cvy += b.mass * b.velocity.y;
      cvz += b.mass * b.velocity.z;
    }
    if (M < 1e-12) return 0;
    cvx /= M; cvy /= M; cvz /= M;

    let Ly = 0;
    let I = 0;
    for (const b of bodies) {
      if (!b.alive) continue;
      const rx = b.position.x - com.x;
      const rz = b.position.z - com.z;
      const vx = b.velocity.x - cvx;
      const vz = b.velocity.z - cvz;
      Ly += b.mass * (rx * vz - rz * vx);
      I += b.mass * (rx * rx + rz * rz);
    }
    if (I < 1e-18) return 0;
    return Ly / I;
  }

  /**
   * Set view projection and fit camera. Call with: 'isometric'|'top'|'side'|'front'
   */
  setViewProjection(name) {
    this._viewProjection = SceneManager.VIEW_PROJECTIONS[name] || SceneManager.VIEW_PROJECTIONS.isometric;
    this.fitAllBodies();
  }

  /**
   * Auto-frame camera to fit all bodies using current view projection
   */
  fitAllBodies() {
    if (!this._comTarget || this._systemExtent <= 0) return;

    const fov = this.camera.fov * (Math.PI / 180);
    const aspect = this.camera.aspect;
    const extent = Math.max(this._systemExtent, 0.5);

    const tanHalfFov = Math.tan(fov / 2);
    const scale = Math.min(aspect, 1);
    const dist = (extent / (tanHalfFov * scale)) * 1.5;

    const dir = (this._viewProjection || SceneManager.VIEW_PROJECTIONS.isometric).clone();

    this.controls.target.copy(this._comTarget);
    this.camera.position.copy(this._comTarget).addScaledVector(dir, Math.max(dist, 2));
  }

  /**
   * Fit camera to a subset of bodies (e.g. stars only, stars+planets, all objects)
   * @param {Array} bodies - Bodies to frame (should be alive)
   */
  fitBodiesFiltered(bodies) {
    if (!bodies || bodies.length === 0 || !this.controls) return;

    const alive = bodies.filter(b => b.alive);
    if (alive.length === 0) return;

    let totalMass = 0;
    const com = new THREE.Vector3(0, 0, 0);
    for (const body of alive) {
      com.addScaledVector(body.position, body.mass);
      totalMass += body.mass;
    }
    if (totalMass > 0) com.divideScalar(totalMass);

    let maxDist = 0;
    for (const body of alive) {
      const d = body.position.distanceTo(com);
      const vs = this.getVisualScale(body);
      if (d + vs > maxDist) maxDist = d + vs;
    }
    const extent = Math.max(maxDist, 0.5);

    const fov = this.camera.fov * (Math.PI / 180);
    const aspect = this.camera.aspect;
    const tanHalfFov = Math.tan(fov / 2);
    const scale = Math.min(aspect, 1);
    const dist = (extent / (tanHalfFov * scale)) * 1.5;

    const dir = (this._viewProjection || SceneManager.VIEW_PROJECTIONS.isometric).clone();
    this.controls.target.copy(com);
    this.camera.position.copy(com).addScaledVector(dir, Math.max(dist, 2));
  }

  /**
   * Frame camera centered on a specific body (e.g. a star)
   * @param {Object} body - Celestial body with position
   * @param {number} [extent=5] - View extent in AU (controls zoom level)
   */
  fitOnBody(body, extent = 5) {
    if (!body?.position || !this.controls) return;

    const center = body.position.clone();
    const ext = Math.max(extent, 0.5);

    const fov = this.camera.fov * (Math.PI / 180);
    const aspect = this.camera.aspect;
    const tanHalfFov = Math.tan(fov / 2);
    const scale = Math.min(aspect, 1);
    const dist = (ext / (tanHalfFov * scale)) * 1.5;

    const dir = (this._viewProjection || SceneManager.VIEW_PROJECTIONS.isometric).clone();

    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, Math.max(dist, 2));
  }

  // === Multi-level View Management ===

  setViewLevel(level) {
    this._viewLevel = level;
    this._updateViewVisibility();
  }

  setDistGridVisible(visible, center) {
    this._showDistGrid = visible;
    if (visible && this._viewLevel === VIEW_LEVEL.SYSTEM) {
      this.createDistanceGrid(center || this._comTarget);
    } else {
      this.removeDistanceGrid();
    }
  }

  setHabitableZoneVisible(visible) {
    this._showHabitableZone = visible;
    if (this._habitableZoneMesh) {
      this._habitableZoneMesh.visible = visible && (this._viewLevel === VIEW_LEVEL.BODY);
    }
    if (this._systemHZMeshes) {
      for (const m of this._systemHZMeshes) {
        m.visible = visible && (this._viewLevel === VIEW_LEVEL.SYSTEM);
      }
    }
  }

  _updateViewVisibility() {
    const level = this._viewLevel;

    if (this._universeBoundary) {
      this._universeBoundary.visible = (level === VIEW_LEVEL.UNIVERSE);
    }
    if (this._universeDisk) {
      this._universeDisk.visible = (level === VIEW_LEVEL.UNIVERSE);
    }

    this._clusterMeshes.forEach(mesh => {
      mesh.visible = (level === VIEW_LEVEL.UNIVERSE);
    });
    this.rogueMarkers.forEach((mesh) => {
      mesh.visible = (level === VIEW_LEVEL.UNIVERSE);
    });

    if (this._habitableZoneMesh) {
      this._habitableZoneMesh.visible = this._showHabitableZone && (level === VIEW_LEVEL.BODY);
    }
    if (this._systemHZMeshes) {
      for (const m of this._systemHZMeshes) {
        m.visible = this._showHabitableZone && (level === VIEW_LEVEL.SYSTEM);
      }
    }

    if (this.starfield) {
      this.starfield.visible = (level !== VIEW_LEVEL.BODY);
    }

    // Hide axis grid always — orbit trails are used as the visual reference instead
    this.scene.traverse(child => {
      if (child.isGridHelper) {
        child.visible = false;
      }
    });

    // Distance grid: only visible in system view when toggled on
    if (this._distGridGroup) {
      this._distGridGroup.visible = this._showDistGrid && (level === VIEW_LEVEL.SYSTEM);
    }

    // Show/hide body meshes based on view level
    this.bodyMeshes.forEach(group => {
      if (level === VIEW_LEVEL.UNIVERSE) {
        group.visible = false;
      } else if (level === VIEW_LEVEL.BODY) {
        group.visible = false; // will be selectively shown by transitionToBody
      } else {
        group.visible = true;
      }
    });
    // Orbit-trail visibility is set each frame in update() (_syncTrailVisibility)
    // so Body view can show trails for the focused body and its satellites.
  }

  /**
   * Universe: hide all trails. System: show all. Body: only focused subtree
   * (selected body, explorer target, children, bodies orbiting the selection).
   */
  _syncTrailVisibility(bodies) {
    if (!bodies || bodies.length === 0) {
      this.trailLines.forEach((trail) => { trail.visible = false; });
      return;
    }
    const lvl = this._viewLevel;
    const sel = this.selectedBody;

    const isFocusedBody = (b) => {
      if (!b || !b.alive) return false;
      if (b === sel || b === this._explorerTarget) return true;
      if (sel && b.parentBody === sel) return true;
      if (sel?.children?.includes(b)) return true;
      return false;
    };

    this.trailLines.forEach((trail, id) => {
      const b = bodies.find((x) => x.id === id);
      // Body not in the current render list (different galaxy system, or dead) → hide.
      // Previously this early-returned, leaving stale trails visible from other systems.
      if (!b || !b.alive) {
        trail.visible = false;
        return;
      }
      if (lvl === VIEW_LEVEL.UNIVERSE || b.escapedSystem) {
        trail.visible = false;
      } else if (lvl === VIEW_LEVEL.SYSTEM) {
        trail.visible = true;
      } else {
        trail.visible = isFocusedBody(b);
      }
    });
  }

  /**
   * Create the universe circular boundary visualization
   */
  createUniverseBoundary() {
    const radius = 200;
    const segments = 128;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.4,
      linewidth: 2,
    });
    this._universeBoundary = new THREE.LineLoop(geometry, material);
    this._universeBoundary.visible = false;
    this.scene.add(this._universeBoundary);

    // Filled boundary circle (very faint)
    const diskGeom = new THREE.CircleGeometry(radius, segments);
    diskGeom.rotateX(-Math.PI / 2);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a2a,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this._universeDisk = new THREE.Mesh(diskGeom, diskMat);
    this._universeDisk.position.y = -0.1;
    this._universeDisk.visible = false;
    this.scene.add(this._universeDisk);
  }

  /**
   * Create or update cluster visualization in universe view.
   * Rogue-formation clusters (spawned from intergalactic gas) get a small
   * distinct point marker instead of a full nebula blob.
   */
  updateClusterVisual(cluster) {
    if (cluster.isRogueFormation) {
      return this._updateRogueClusterMarker(cluster);
    }

    let group = this._clusterMeshes.get(cluster.id);

    if (!group) {
      group = new THREE.Group();
      group.userData.clusterId = cluster.id;

      const color = new THREE.Color(cluster.color || '#6688ff');

      // Glowing nebula sphere — large enough to see from universe camera
      const coreGeom = new THREE.SphereGeometry(8, 32, 32);
      const coreMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
      });
      const core = new THREE.Mesh(coreGeom, coreMat);
      group.add(core);
      group.userData.core = core;

      // Outer glow — much larger halo
      const glowGeom = new THREE.SphereGeometry(14, 32, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      group.add(glow);
      group.userData.glow = glow;

      // Label — non-attenuating sprite so it's always readable
      const labelCanvas = document.createElement('canvas');
      const lctx = labelCanvas.getContext('2d');
      labelCanvas.width = 512;
      labelCanvas.height = 64;
      lctx.clearRect(0, 0, 512, 64);
      lctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      lctx.fillStyle = '#ffffff';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText(cluster.name, 256, 32);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        sizeAttenuation: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(0.15, 0.02, 1);
      label.position.y = 14;
      label.renderOrder = 900;
      group.add(label);
      group.userData.label = label;

      // Pulsing diamond locator — always visible
      const locCanvas = document.createElement('canvas');
      locCanvas.width = 64;
      locCanvas.height = 64;
      const locCtx = locCanvas.getContext('2d');
      locCtx.fillStyle = `#${color.getHexString()}`;
      locCtx.beginPath();
      locCtx.moveTo(32, 2); locCtx.lineTo(62, 32);
      locCtx.lineTo(32, 62); locCtx.lineTo(2, 32);
      locCtx.closePath();
      locCtx.fill();
      locCtx.strokeStyle = '#ffffff';
      locCtx.lineWidth = 3;
      locCtx.stroke();
      const locTex = new THREE.CanvasTexture(locCanvas);
      const locMat = new THREE.SpriteMaterial({
        map: locTex, transparent: true, opacity: 0.85,
        depthTest: false, sizeAttenuation: false,
      });
      const locator = new THREE.Sprite(locMat);
      locator.scale.set(0.05, 0.05, 1);
      locator.renderOrder = 901;
      group.add(locator);
      group.userData.locator = locator;

      // Invisible hit proxy — large sphere for reliable click/raycast detection
      const hitGeom = new THREE.SphereGeometry(18, 16, 16);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      const hitProxy = new THREE.Mesh(hitGeom, hitMat);
      hitProxy.userData.clusterId = cluster.id;
      group.add(hitProxy);
      group.userData.hitProxy = hitProxy;

      // Point light — extended range for bloom
      const light = new THREE.PointLight(color, 4, 300);
      group.add(light);

      this._clusterMeshes.set(cluster.id, group);
      this.scene.add(group);
    }

    // Always ensure the group is visible when it is being actively updated (cluster is alive)
    if (!group.visible) group.visible = true;

    // Scale based on cluster size (relative to base 8-unit core)
    const scale = Math.max(1, cluster.size / 50);
    group.userData.core.scale.setScalar(scale);
    group.userData.glow.scale.setScalar(scale);
    if (group.userData.hitProxy) group.userData.hitProxy.scale.setScalar(scale);

    // Pulsing locator
    if (group.userData.locator) {
      const pulse = 0.6 + 0.3 * Math.sin(this.elapsedTime * 2);
      group.userData.locator.material.opacity = pulse;
    }

    // Position in universe coordinates
    const uScale = 0.4;
    group.position.set(
      cluster.position.x * uScale,
      cluster.position.y * uScale,
      cluster.position.z * uScale
    );

    group.rotation.y = cluster.rotationAngle;

    if (!cluster.alive) {
      this.scene.remove(group);
      this._clusterMeshes.delete(cluster.id);
    }

    return group;
  }

  /**
   * Small point-source marker for intergalactic rogue-formation clusters.
   * Looks like a dim wandering star, not a full galaxy nebula.
   */
  _updateRogueClusterMarker(cluster) {
    let group = this._clusterMeshes.get(cluster.id);

    if (!group) {
      group = new THREE.Group();
      group.userData.clusterId = cluster.id;

      const color = new THREE.Color(cluster.color || '#99bbdd');

      // Small glowing core — much smaller than a real galaxy
      const coreGeom = new THREE.SphereGeometry(1.4, 12, 12);
      const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.80 });
      const core = new THREE.Mesh(coreGeom, coreMat);
      group.add(core);
      group.userData.core = core;

      // Soft halo
      const haloGeom = new THREE.SphereGeometry(2.6, 12, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.18, side: THREE.BackSide,
      });
      group.add(new THREE.Mesh(haloGeom, haloMat));

      // Label — italicised to distinguish from main galaxies
      const labelCanvas = document.createElement('canvas');
      const lctx = labelCanvas.getContext('2d');
      labelCanvas.width = 512;
      labelCanvas.height = 64;
      lctx.clearRect(0, 0, 512, 64);
      lctx.font = 'italic 22px "Segoe UI", Arial, sans-serif';
      lctx.fillStyle = '#aaddff';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText(`${cluster.name} (rogue)`, 256, 32);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex, transparent: true, opacity: 0.80,
        depthTest: false, sizeAttenuation: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(0.13, 0.018, 1);
      label.position.y = 4;
      label.renderOrder = 900;
      group.add(label);
      group.userData.label = label;

      // Small crosshair locator
      const locCanvas = document.createElement('canvas');
      locCanvas.width = 32; locCanvas.height = 32;
      const locCtx = locCanvas.getContext('2d');
      locCtx.strokeStyle = '#aaddff';
      locCtx.lineWidth = 2;
      locCtx.beginPath();
      locCtx.moveTo(16, 4); locCtx.lineTo(16, 28);
      locCtx.moveTo(4, 16); locCtx.lineTo(28, 16);
      locCtx.stroke();
      const locTex = new THREE.CanvasTexture(locCanvas);
      const locMat = new THREE.SpriteMaterial({
        map: locTex, transparent: true, opacity: 0.70,
        depthTest: false, sizeAttenuation: false,
      });
      const locator = new THREE.Sprite(locMat);
      locator.scale.set(0.04, 0.04, 1);
      locator.renderOrder = 901;
      group.add(locator);
      group.userData.locator = locator;

      // Invisible hit proxy (small, matching visual size)
      const hitGeom = new THREE.SphereGeometry(4, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitProxy = new THREE.Mesh(hitGeom, hitMat);
      hitProxy.userData.clusterId = cluster.id;
      group.add(hitProxy);

      this._clusterMeshes.set(cluster.id, group);
      this.scene.add(group);
    }

    if (!group.visible) group.visible = true;

    // Gentle pulse on locator
    if (group.userData.locator) {
      group.userData.locator.material.opacity = 0.45 + 0.25 * Math.sin(this.elapsedTime * 1.8);
    }

    const uScale = 0.4;
    group.position.set(
      cluster.position.x * uScale,
      cluster.position.y * uScale,
      cluster.position.z * uScale,
    );

    if (!cluster.alive) {
      this.scene.remove(group);
      this._clusterMeshes.delete(cluster.id);
    }

    return group;
  }

  updateRogueMarker(body) {
    if (!body?.escapedSystem || !body.universePosition) return null;

    let group = this.rogueMarkers.get(body.id);
    if (!group) {
      group = new THREE.Group();
      group.userData.bodyId = body.id;

      const markerGeom = new THREE.SphereGeometry(1.6, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: body.type === 'planet' ? 0x66ccff : body.type === 'black_hole' ? 0xcc99ff : 0xffcc66,
        transparent: true,
        opacity: 0.85,
      });
      const marker = new THREE.Mesh(markerGeom, markerMat);
      group.add(marker);
      group.userData.marker = marker;

      const haloGeom = new THREE.SphereGeometry(2.8, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: markerMat.color,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeom, haloMat);
      group.add(halo);
      group.userData.halo = halo;

      const rogueColor = body.type === 'star' ? '#ffd88a' : '#88d8ff';
      const label = this.createLabel(`${body.name} @ ${body.escapeOriginClusterId ? 'rogue' : 'deep space'}`, { color: rogueColor });
      label.position.y = 4;
      label.scale.set(6, 1.5, 1);
      group.add(label);
      group.userData.label = label;

      this.rogueMarkers.set(body.id, group);
      this.scene.add(group);
    }

    const uScale = 0.4;
    group.position.set(
      body.universePosition.x * uScale,
      body.universePosition.y * uScale,
      body.universePosition.z * uScale,
    );
    if (group.userData.halo) {
      group.userData.halo.material.opacity = 0.1 + 0.06 * Math.sin(this.elapsedTime * 2.5);
    }
    return group;
  }

  /**
   * Show habitable zone ring around a star
   */
  showHabitableZone(star) {
    this.hideHabitableZone();
    if (!star || star.type !== 'star') return;

    const L = star.luminosity || 1;
    const inner = Math.sqrt(L / 1.1) * 0.95;
    const outer = Math.sqrt(L / 0.53) * 1.37;

    const ringGeom = new THREE.RingGeometry(inner, outer, 64);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    this._habitableZoneMesh = new THREE.Mesh(ringGeom, ringMat);
    this._habitableZoneMesh.position.copy(star.position);
    this.scene.add(this._habitableZoneMesh);
  }

  hideHabitableZone() {
    if (this._habitableZoneMesh) {
      this.scene.remove(this._habitableZoneMesh);
      this._habitableZoneMesh.geometry?.dispose();
      this._habitableZoneMesh.material?.dispose();
      this._habitableZoneMesh = null;
    }
  }

  /**
   * Show habitable zones for all stars in the current system view.
   * Creates multiple translucent green ring meshes.
   */
  showSystemHabitableZones(bodies) {
    this.hideSystemHabitableZones();
    if (!bodies) return;

    this._systemHZMeshes = [];
    for (const body of bodies) {
      if (!body.alive || body.type !== 'star' || !body.luminosity) continue;
      const L = body.luminosity;
      const inner = Math.sqrt(L / 1.1) * 0.95;
      const outer = Math.sqrt(L / 0.53) * 1.37;
      if (outer < 0.01) continue;

      const ringGeom = new THREE.RingGeometry(inner, outer, 64);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x44ff88,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeom, ringMat);
      mesh.position.copy(body.position);
      mesh.userData._trackBodyId = body.id;
      this.scene.add(mesh);
      this._systemHZMeshes.push(mesh);
    }
  }

  hideSystemHabitableZones() {
    if (this._systemHZMeshes) {
      for (const m of this._systemHZMeshes) {
        this.scene.remove(m);
        m.geometry?.dispose();
        m.material?.dispose();
      }
      this._systemHZMeshes = [];
    }
  }

  /**
   * Update positions of system habitable zone meshes to track their stars
   */
  updateSystemHabitableZones(bodies) {
    if (!this._systemHZMeshes || !bodies) return;
    for (const mesh of this._systemHZMeshes) {
      const bid = mesh.userData._trackBodyId;
      const body = bodies.find(b => b.id === bid);
      if (body && body.alive) {
        mesh.position.copy(body.position);
      }
    }
  }

  /**
   * Transition to universe view
   */
  transitionToUniverse(focusTarget = null) {
    this._viewLevel = VIEW_LEVEL.UNIVERSE;
    this._focusedBody = null;
    this.selectedBody = null;
    this.scene.background = new THREE.Color(0x020210);
    this.controls.maxDistance = 800;
    this.controls.minDistance = 2;
    this.controls.zoomSpeed = 2.0;
    this.controls.rotateSpeed = 0.8;
    this.controls.panSpeed = 1.5;
    this.hideHabitableZone();
    this.hideSystemHabitableZones();
    this.removeDistanceGrid();
    this._updateViewVisibility();
    if (this._universeBoundary) this._universeBoundary.visible = true;
    if (this._universeDisk) this._universeDisk.visible = true;

    const target = focusTarget
      ? new THREE.Vector3(
        (focusTarget.x || 0) * 0.4,
        (focusTarget.y || 0) * 0.4,
        (focusTarget.z || 0) * 0.4,
      )
      : new THREE.Vector3(0, 0, 0);
    // Camera closer to the current universe focus for a smoother scale transition
    const endPos = target.clone().add(new THREE.Vector3(0, 60, 90));
    const endTarget = target;
    this.animateCamera(endPos, endTarget, 800);
  }

  /**
   * Transition to system view centered on a star system's bodies
   */
  transitionToSystem(bodies) {
    this._viewLevel = VIEW_LEVEL.SYSTEM;
    this._focusedBody = null;
    this.selectedBody = null;
    this.scene.background = new THREE.Color(0x020210);
    this.controls.maxDistance = Math.min(1000, ARENA_RADIUS_AU * 1.2);
    this.controls.minDistance = 0.01;
    this.controls.zoomSpeed = 1.5;
    this.controls.rotateSpeed = 1.0;
    this.controls.panSpeed = 1.0;
    this._updateViewVisibility();
    this.hideHabitableZone();
    this.removeDistanceGrid();

    // Force-update body mesh positions immediately (they may be stale from universe view)
    if (bodies) {
      for (const body of bodies) {
        if (body.alive) this.updateBodyVisual(body);
      }
    }

    if (bodies && bodies.length > 0) {
      this.computeSystemMetrics(bodies);
      this.showSystemHabitableZones(bodies);

      const dir = (this._viewProjection || SceneManager.VIEW_PROJECTIONS.isometric).clone();
      const fov = this.camera.fov * (Math.PI / 180);
      const extent = Math.max(this._systemExtent, 0.5);
      const dist = (extent / Math.tan(fov / 2)) * 1.5;
      const endPos = this._comTarget.clone().addScaledVector(dir, Math.max(dist, 2));

      this.animateCamera(endPos, this._comTarget.clone(), 700);
    } else {
      // No bodies — reset camera to a reasonable default system view
      const endPos = new THREE.Vector3(5, 4, 8);
      const endTarget = new THREE.Vector3(0, 0, 0);
      this.animateCamera(endPos, endTarget, 700);
    }
  }

  /**
   * Transition to body view centered on a single body.
   * Isolates the body: dark background, no starfield, no grid.
   */
  transitionToBody(body) {
    this._viewLevel = VIEW_LEVEL.BODY;
    this._focusedBody = body;
    this.scene.background = new THREE.Color(0x010108);
    this._updateViewVisibility();

    // Show the focused body and its children
    const group = this.bodyMeshes.get(body.id);
    if (group) group.visible = true;
    if (body.children) {
      for (const child of body.children) {
        const cg = this.bodyMeshes.get(child.id);
        if (cg) cg.visible = true;
      }
    }

    // Show habitable zone if it's a star
    if (body.type === 'star') {
      this.showHabitableZone(body);
    }

    const scale = this.getVisualScale(body);
    const viewDist = Math.max(scale * 6, 0.5);
    const dir = (this._viewProjection || SceneManager.VIEW_PROJECTIONS.isometric).clone();
    const endPos = body.position.clone().addScaledVector(dir, viewDist);

    this.animateCamera(endPos, body.position.clone(), 600);
  }

  /**
   * Create a procedural starfield background
   */
  createStarfield() {
    const starCount = 10000;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      // Random position on a large sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 500 + Math.random() * 500;

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      // Slight color variation
      const temp = 3000 + Math.random() * 20000;
      const color = temperatureToColor(temp);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      sizes[i] = Math.random() * 2 + 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });

    this.starfield = new THREE.Points(geometry, material);
    this.scene.add(this.starfield);
  }

  /**
   * Create a subtle reference grid on the orbital plane
   */
  createGridPlane() {
    const grid = new THREE.GridHelper(100, 50, 0x222244, 0x111133);
    grid.material.transparent = true;
    grid.material.opacity = 0.15;
    this.scene.add(grid);
  }

  /**
   * Create or update the distance grid overlay — concentric circles with labels,
   * centered on the system's center of mass. Toggled via UI.
   */
  createDistanceGrid(center) {
    this.removeDistanceGrid();

    const cx = center ? center.x : 0;
    const cz = center ? center.z : 0;
    this._distGridGroup = new THREE.Group();
    this._distGridGroup.renderOrder = 800;

    const distances = [5, 10, 25, 50, 100, 200, 500];
    const segments = 128;

    for (const r of distances) {
      if (r > this._arenaRadius * 1.5) continue;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          cx + r * Math.cos(a),
          0.01,
          cz + r * Math.sin(a)
        ));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const isMajor = (r === 50 || r === 100 || r === 200 || r === 500);
      const mat = new THREE.LineDashedMaterial({
        color: isMajor ? 0x4466aa : 0x334488,
        transparent: true,
        opacity: isMajor ? 0.35 : 0.18,
        dashSize: isMajor ? 1.0 : 0.5,
        gapSize: isMajor ? 0.5 : 0.3,
        depthTest: false,
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      this._distGridGroup.add(line);

      // Distance label on the +X axis
      const label = this._createDragLabel(`${r} AU`, isMajor ? '#88aadd' : '#556688');
      label.position.set(cx + r, 0.4, cz);
      this._distGridGroup.add(label);
    }

    // Radial lines every 45°
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const maxR = Math.min(500, this._arenaRadius);
      const pts = [
        new THREE.Vector3(cx, 0.01, cz),
        new THREE.Vector3(cx + maxR * Math.cos(a), 0.01, cz + maxR * Math.sin(a)),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({
        color: 0x334488,
        transparent: true,
        opacity: 0.12,
        dashSize: 1.5,
        gapSize: 1.0,
        depthTest: false,
      });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      this._distGridGroup.add(line);
    }

    this.scene.add(this._distGridGroup);
  }

  removeDistanceGrid() {
    if (this._distGridGroup) {
      this._distGridGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(this._distGridGroup);
      this._distGridGroup = null;
    }
  }

  /**
   * Create or update the visual mesh for a celestial body
   */
  updateBodyVisual(body) {
    let group = this.bodyMeshes.get(body.id);

    if (!group) {
      group = this.createBodyMesh(body);
      this.bodyMeshes.set(body.id, group);
      this.scene.add(group);
    }

    // ── Visual orbit cap ──────────────────────────────────────────────────────
    // At very high time scales (fast-forward) the N-body integrator caps its
    // physics step, but may still advance many planet orbits per rendered frame.
    // To keep orbits legible we maintain a *visual* angle that advances at most
    // one full orbit per MIN_ORBIT_PERIOD_S seconds of real time — regardless of
    // how fast the simulation clock is running.
    const MIN_ORBIT_PERIOD_S = 1.5; // one orbit takes ≥ 1.5 s of real time
    const MAX_VISUAL_OMEGA   = (2 * Math.PI) / MIN_ORBIT_PERIOD_S; // rad / real-s

    if (
      this._fastForwardMode &&
      body.type === 'planet' &&
      body.parentBody?.alive &&
      body.orbitalDistance > 0
    ) {
      // Seed visual phase from current N-body true anomaly on first contact.
      if (!this._visualOrbitPhases.has(body.id)) {
        this._visualOrbitPhases.set(body.id, body.trueAnomaly ?? 0);
      }
      const va = this._visualOrbitPhases.get(body.id) + MAX_VISUAL_OMEGA * this._frameDelta;
      this._visualOrbitPhases.set(body.id, va);

      // Keplerian position (matches Planet.updateOrbit formula)
      const par = body.parentBody;
      const a   = body.orbitalDistance;
      const e   = Math.min(body.eccentricity || 0, 0.95);
      const r   = a * (1 - e * e) / (1 + e * Math.cos(va));
      const inc = body.inclination ?? 0.05;
      group.position.set(
        par.position.x + r * Math.cos(va),
        par.position.y + r * Math.sin(va) * Math.sin(inc),
        par.position.z + r * Math.sin(va) * Math.cos(inc),
      );
    } else {
      // Normal mode (or star/black hole): follow N-body position directly.
      // When returning from fast-forward, clear the stale visual phase so the
      // next fast-forward starts fresh from the N-body state.
      if (!this._fastForwardMode) this._visualOrbitPhases.delete(body.id);
      group.position.copy(body.position);
    }

    // Update rotation
    if (group.userData.mainMesh) {
      group.userData.mainMesh.rotation.y = body.rotationAngle;
    }

    // Update planet shader uniforms
    if (group.userData.isPlanetShader && group.userData.material?.uniforms) {
      const uniforms = group.userData.material.uniforms;
      uniforms.time.value = this.elapsedTime;
      // Update light direction toward nearest star
      if (this._nearestStarPos) {
        const dir = this._nearestStarPos.clone().sub(body.position).normalize();
        uniforms.lightDir.value.copy(dir);
      }
      // Live-update biosphere overlay texture
      if (body.biosphereGrid && group.userData._bioTex) {
        encodeBiosphereToTexture(body, group.userData._bioData);
        group.userData._bioTex.needsUpdate = true;
        uniforms.biosphereOpacity.value = Math.min(1.0, (body.biosphereHealth ?? 0) * 1.5);
      } else if (uniforms.biosphereOpacity) {
        uniforms.biosphereOpacity.value = 0.0;
      }
    }

    // Update star-specific uniforms (color, temperature, luminosity change during evolution)
    if (body.type === 'star' && group.userData.material?.uniforms) {
      const uniforms = group.userData.material.uniforms;
      uniforms.time.value = this.elapsedTime;
      const color = temperatureToColor(body.temperature);
      const hotColor = temperatureToColor(body.temperature * 1.3);
      uniforms.starColor.value.copy(color);
      uniforms.starColorHot.value.copy(hotColor);
      uniforms.luminosity.value = body.luminosity;
      uniforms.temperature.value = body.temperature;
      uniforms.flareActivity.value = body.flareActivity || 0.3;

      // ── Smooth phase-value interpolation ─────────────────────────────────
      // The star shader paints surfaces from a continuous phaseValue in
      // [-0.5, 5].  When the simulation announces a phase change we ramp the
      // shader uniform from the previous value to the new target across a few
      // seconds of real time, plus run a separate phaseBlend overlay (1 → 0)
      // to soften the moment of transition.
      const targetPhaseValue = this._phaseToValue(body.phase);
      const PHASE_VALUE_RATE = 0.5; // shader-units per real second
      const cur = uniforms.phaseValue.value;
      if (Math.abs(cur - targetPhaseValue) > 0.001) {
        const dir = Math.sign(targetPhaseValue - cur);
        const step = Math.min(Math.abs(targetPhaseValue - cur), PHASE_VALUE_RATE * this._frameDelta);
        uniforms.phaseValue.value = cur + dir * step;
      } else {
        uniforms.phaseValue.value = targetPhaseValue;
      }
      group.userData.phaseValueTarget = targetPhaseValue;

      if (typeof group.userData.phaseBlendTimeLeft === 'number'
          && group.userData.phaseBlendTimeLeft > 0) {
        const PHASE_BLEND_DURATION = group.userData.phaseBlendDuration || 4.0;
        group.userData.phaseBlendTimeLeft = Math.max(0,
          group.userData.phaseBlendTimeLeft - this._frameDelta);
        uniforms.phaseBlend.value = group.userData.phaseBlendTimeLeft / PHASE_BLEND_DURATION;
      } else {
        uniforms.phaseBlend.value = 0;
      }

      // Update corona glow color and opacity for evolved stars
      if (group.userData.glow) {
        group.userData.glow.material.color.copy(color);
        // Red giants have larger, dimmer glow; white dwarfs have tight bright glow
        const glowOpacity = body.phase === 'red_giant' || body.phase === 'red_supergiant'
          ? 0.08 : (body.phase === 'white_dwarf' ? 0.3 : 0.15);
        group.userData.glow.material.opacity = glowOpacity;
      }

      // Update point light intensity and color
      if (group.userData.pointLight) {
        group.userData.pointLight.intensity = Math.min(body.luminosity * 2, 50);
        group.userData.pointLight.color.copy(color);
      }
    }

    // Mesh-type drift: a star → black_hole transition leaves us with a star
    // mesh whose body is now type 'black_hole'.  Detect and rebuild.
    if (group.userData.bodyType
        && group.userData.bodyType !== body.type
        && (body.type === 'black_hole' || body.type === 'star')) {
      this._rebuildBodyMesh(body);
      return this.bodyMeshes.get(body.id);
    }

    // Update visual scale based on radius (includes viewScale)
    const visualScale = this.getVisualScale(body);
    const cameraDistance = Math.max(0.001, this.camera.position.distanceTo(group.position));
    const apparentSize = visualScale / cameraDistance;

    // ── Scale floor ──────────────────────────────────────────────────────────
    // Never let bodies vanish into sub-pixel noise. When the camera pulls back
    // far enough that a body would appear smaller than MIN_APPARENT_SIZE (≈2px
    // on a 1080p screen with a 60° FOV), clamp its rendered size to that floor
    // so it always reads as a small but findable dot.
    const MIN_APPARENT_SIZE = 0.0022;
    const isScaleFloored = apparentSize < MIN_APPARENT_SIZE;
    const effectiveScale = isScaleFloored
      ? Math.max(visualScale, MIN_APPARENT_SIZE * cameraDistance)
      : visualScale;
    // Factor by which the mesh had to be scaled up to hit the floor (1 = no boost)
    const scaleBoost = effectiveScale / Math.max(visualScale, 1e-9);

    if (group.userData.mainMesh) {
      group.userData.mainMesh.scale.setScalar(effectiveScale);
    }

    // Scale hit-proxy for planets (2x hit area for easier clicking)
    if (group.userData.hitProxy) {
      group.userData.hitProxy.scale.setScalar(effectiveScale);
    }

    // Scale glow with body (corona should be slightly larger).
    // When the scale floor is active, additionally boost glow radius + opacity
    // so stars read as glowing beacons rather than invisible points.
    if (group.userData.glow) {
      const glowBoost = isScaleFloored ? Math.min(5.0, scaleBoost * 1.4) : 1.0;
      group.userData.glow.scale.setScalar(effectiveScale * glowBoost);
      if (isScaleFloored && body.type === 'star') {
        const baseOp = body.phase === 'red_giant' || body.phase === 'red_supergiant'
          ? 0.08
          : body.phase === 'white_dwarf' ? 0.3 : 0.15;
        group.userData.glow.material.opacity = Math.min(0.65, baseOp * glowBoost * 0.75);
      }
    }

    // Scale label position to always be above the body
    if (group.userData.label) {
      group.userData.label.position.y = effectiveScale * 1.8 + 0.5;
      // Keep labels at a readable size — floor ensures they're always clear
      group.userData.label.scale.setScalar(Math.max(1.4, effectiveScale * 1.4));

      // Label fade: show clearly at normal zoom, fade gently at extreme zoom-out.
      // Thresholds tuned so labels are obvious for newly-placed and selected bodies.
      const LABEL_FADE_IN  = 0.0005; // apparent size below which label starts fading
      const LABEL_FADE_OUT = 0.0022; // apparent size above which label is fully on
      const rawAlpha = (apparentSize - LABEL_FADE_IN) / (LABEL_FADE_OUT - LABEL_FADE_IN);
      // Minimum opacity 0.45 so labels never fully vanish in system view (pill bg provides contrast)
      const labelAlpha = body.selected ? 1.0 : Math.max(0.45, Math.min(1, rawAlpha));
      const labelVisible = (body.showLabel !== false);
      group.userData.label.visible = labelVisible;
      if (group.userData.label.material && labelVisible) {
        group.userData.label.material.opacity = labelAlpha;
      }

      // Update label text or color if name/phase changed
      const phaseLabel = body.type === 'star' ? this.getPhaseDisplayName(body.phase) : null;
      const labelText = phaseLabel ? `${body.name} (${phaseLabel})` : body.name;
      const labelColor = body.type === 'star' ? '#ffd88a' : body.type === 'planet' ? '#88d8ff' : '#d0d0d0';
      if (labelText !== group.userData._lastLabelText || labelColor !== group.userData._labelColor) {
        group.userData._lastLabelText = labelText;
        group.userData._lastPhase = body.phase;
        group.userData._labelColor = labelColor;
        const newLabel = this.createLabel(labelText, { color: labelColor });
        newLabel.position.copy(group.userData.label.position);
        newLabel.scale.copy(group.userData.label.scale);
        newLabel.visible = group.userData.label.visible;
        group.remove(group.userData.label);
        group.add(newLabel);
        group.userData.label = newLabel;
      }
    }

    // Update selection indicator
    if (group.userData.selectionRing) {
      group.userData.selectionRing.visible = body.selected;
      group.userData.selectionRing.scale.setScalar(visualScale * 1.3);
      if (body.selected) {
        group.userData.selectionRing.rotation.z += 0.02;
      }
    }

    // Legacy saves may still have a vertical beacon line — keep it hidden (axis-free look)
    if (group.userData.beacon) {
      group.userData.beacon.visible = false;
    }
    if (group.userData.locator) {
      // Locator badge: a small fixed-screen-size icon that's shown at mid-range
      // (close enough that the flat sprite doesn't dominate the sphere mesh).
      // At far range the scale-floor keeps the body visible, so the locator is
      // hidden to avoid the "square marker smothering a round body" artifact.
      const isStarBeacon = body.type === 'star';
      const locPulse = isStarBeacon
        ? 0.5 + 0.3 * Math.sin(this.elapsedTime * 3)
        : 0.4 + 0.2 * Math.sin(this.elapsedTime * 2);
      group.userData.locator.material.opacity = locPulse;
      // Show only in a mid-range band: small enough that the mesh might be hard to
      // see, but not so small that the flat sprite looks bigger than the sphere.
      const locVisible = (this._viewLevel === VIEW_LEVEL.SYSTEM) &&
        (body.selected || (apparentSize > 0.0020 && apparentSize < 0.012));
      group.userData.locator.visible = locVisible;
    }

    return group;
  }

  /**
   * Create a Three.js mesh for a celestial body
   */
  createBodyMesh(body) {
    const group = new THREE.Group();
    group.userData.bodyId = body.id;

    switch (body.type) {
      case 'star':
        this.createStarMesh(body, group);
        break;
      case 'planet':
        this.createPlanetMesh(body, group);
        break;
      case 'black_hole':
        this.createBlackHoleMesh(body, group);
        break;
      default:
        this.createDefaultMesh(body, group);
    }

    // Selection ring (for all types)
    const ringGeom = new THREE.RingGeometry(1.2, 1.4, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const selectionRing = new THREE.Mesh(ringGeom, ringMat);
    selectionRing.visible = false;
    selectionRing.rotation.x = Math.PI / 2;
    group.add(selectionRing);
    group.userData.selectionRing = selectionRing;

    // Name label (using sprite)
    const labelText = body.type === 'star' ? `${body.name} (${this.getPhaseDisplayName(body.phase)})` : body.name;
    const labelColor = body.type === 'star' ? '#ffd88a' : body.type === 'planet' ? '#88d8ff' : '#d0d0d0';
    const label = this.createLabel(labelText, { color: labelColor });
    label.position.y = 2.0;
    group.add(label);
    group.userData.label = label;
    group.userData._lastLabelText = labelText;
    group.userData._lastPhase = body.phase;
    group.userData._labelColor = labelColor;

    return group;
  }

  /**
   * Create star visual with phase-aware shader material.
   *
   * The shader smoothly blends between phase styles (main sequence → subgiant
   * → red giant → supergiant → white dwarf → neutron star) via the continuous
   * `phaseValue` uniform.  When SceneManager.handlePhaseChange runs, it ramps
   * `phaseBlend` from 1 → 0 to overlay a brief warm flash on the surface.
   */
  createStarMesh(body, group) {
    // High-resolution star photosphere: 128×128 segments keeps the silhouette
    // perfectly round even at maximum zoom-in, where the previous 64×64 sphere
    // showed visible polygon facets along the limb.
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const color = temperatureToColor(body.temperature);
    const hotColor = temperatureToColor(body.temperature * 1.3);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time:           { value: 0 },
        starColor:      { value: color },
        starColorHot:   { value: hotColor },
        temperature:    { value: body.temperature },
        luminosity:     { value: body.luminosity },
        turbulence:     { value: 0.5 },
        flareActivity:  { value: body.flareActivity ?? 0.3 },
        phaseValue:     { value: this._phaseToValue(body.phase) },
        phaseBlend:     { value: 0 },
      },
      vertexShader:   STAR_VERTEX_GLSL,
      fragmentShader: STAR_FRAGMENT_GLSL,
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    group.userData.mainMesh = mesh;
    group.userData.material = material;
    group.userData.bodyType = 'star';
    group.userData.phaseValueTarget = material.uniforms.phaseValue.value;

    // Corona glow (additive sprite) — 64×64 keeps the back-side fresnel halo
    // smooth when the camera moves close to a star.
    const glowGeometry = new THREE.SphereGeometry(1.3, 64, 64);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: temperatureToColor(body.temperature),
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);
    group.userData.glow = glow;

    // Point light (for illuminating planets)
    const light = new THREE.PointLight(
      temperatureToColor(body.temperature),
      Math.min(body.luminosity * 2, 50),
      100
    );
    group.add(light);
    group.userData.pointLight = light;

    // Invisible hit-proxy sphere (2x size) - makes fast-orbiting stars easier to click
    const hitProxyGeom = new THREE.SphereGeometry(2, 24, 24);
    const hitProxyMat = new THREE.MeshBasicMaterial({
      visible: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitProxy = new THREE.Mesh(hitProxyGeom, hitProxyMat);
    group.add(hitProxy);
    group.userData.hitProxy = hitProxy;

    // (Removed vertical “beacon” line — read as an object axis; orbit trails + locator suffice.)

    // Pulsing diamond locator sprite — always visible from afar
    const locatorCanvas = document.createElement('canvas');
    locatorCanvas.width = 64;
    locatorCanvas.height = 64;
    const lctx = locatorCanvas.getContext('2d');
    const starColor = temperatureToColor(body.temperature);
    const hexColor = `#${starColor.getHexString()}`;
    lctx.fillStyle = hexColor;
    lctx.beginPath();
    lctx.moveTo(32, 4);
    lctx.lineTo(60, 32);
    lctx.lineTo(32, 60);
    lctx.lineTo(4, 32);
    lctx.closePath();
    lctx.fill();
    lctx.strokeStyle = '#ffffff';
    lctx.lineWidth = 2;
    lctx.stroke();
    const locTexture = new THREE.CanvasTexture(locatorCanvas);
    const locMat = new THREE.SpriteMaterial({
      map: locTexture,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      sizeAttenuation: false,
    });
    const locator = new THREE.Sprite(locMat);
    locator.scale.set(0.04, 0.04, 1); // fixed screen size
    locator.position.set(0, 0, 0);
    locator.renderOrder = 901;
    group.add(locator);
    group.userData.locator = locator;

    return group;
  }

  /**
   * Map planet subtype to shader planetType float.  Delegates to the
   * centralized lookup in celestialShaders.js so all renderers stay in sync.
   */
  _planetTypeIndex(subtype) {
    return planetTypeIndex(subtype);
  }

  /**
   * Map a stellar evolution phase string to the continuous shader phaseValue.
   * Unknown / pre-main-sequence phases fall through to MAIN_SEQUENCE.
   */
  _phaseToValue(phase) {
    return PHASE_VALUES[phase] ?? PHASE_VALUES.main_sequence;
  }

  /**
   * Lazy-load the rocky-planet matcap texture exactly once and reuse it for
   * every rocky body's shader material.  The loader hands back a usable
   * Texture immediately; the GPU bytes fill in once the image finishes
   * downloading from `assets/textures/rocky_matcap.png`.
   */
  _getRockyMatcap() {
    if (this._rockyMatcap) return this._rockyMatcap;
    const tex = new THREE.TextureLoader().load('assets/textures/rocky_matcap.png');
    tex.colorSpace      = THREE.SRGBColorSpace;
    tex.wrapS           = THREE.ClampToEdgeWrapping;
    tex.wrapT           = THREE.ClampToEdgeWrapping;
    tex.minFilter       = THREE.LinearMipmapLinearFilter;
    tex.magFilter       = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy      = this.renderer?.capabilities?.getMaxAnisotropy?.() || 4;
    this._rockyMatcap = tex;
    return tex;
  }

  /**
   * Pick reasonable secondary / accent palette colors for a planet body based
   * on its subtype.  Falls back to HSL-shifted variants of the primary color
   * for anything unrecognised.
   */
  _planetPalette(body) {
    const base = new THREE.Color(body.color || '#4488cc');
    let second, accent;
    switch (body.subtype) {
      case 'rocky_small':
      case 'rogue_planet':
      case 'asteroid':
      case 'dwarf_planet':
        second = new THREE.Color('#3c4046');         // slate
        accent = new THREE.Color('#f3eee5');         // frost / pale lichen
        break;
      case 'desert_world':
        second = new THREE.Color('#6b3a1f');         // rust outcrop
        accent = new THREE.Color('#f4d99b');         // dust haze
        break;
      case 'earth_like':
      case 'super_earth':
      case 'ocean_world':
        second = new THREE.Color('#1f3a6b');         // deep ocean
        accent = new THREE.Color('#fff0c8');         // warm sunlight
        break;
      case 'gas_giant':
        second = new THREE.Color(body.bandColors?.[1] || '#a8784a');
        accent = new THREE.Color(body.bandColors?.[2] || '#f4c07a');
        break;
      case 'ice_giant':
        second = new THREE.Color('#7eb6ff');
        accent = new THREE.Color('#cfe9ff');
        break;
      case 'lava_world':
        second = new THREE.Color('#1a0a06');
        accent = new THREE.Color('#ffb070');
        break;
      case 'hot_jupiter':
        second = new THREE.Color('#902a14');
        accent = new THREE.Color('#ffd28a');
        break;
      case 'comet':
        second = new THREE.Color('#5d6f80');
        accent = new THREE.Color('#cfe6ff');
        break;
      default:
        second = body.bandColors
          ? new THREE.Color(body.bandColors[1] || body.color)
          : base.clone().offsetHSL(0.05, -0.10, 0.10);
        accent = base.clone().offsetHSL(-0.04, 0.10, 0.20);
    }
    return { base, second, accent };
  }

  /**
   * Create planet visual with rich procedural shader.  See celestialShaders.js
   * for the per-type painting routines.  This function focuses on assembling
   * the three.js material/mesh and the auxiliary atmosphere / ring / locator
   * meshes that surround it.
   */
  createPlanetMesh(body, group) {
    // High-resolution planet body: 128×128 segments give a perfectly smooth
    // limb at any zoom and provide enough vertices for the displacement-based
    // terrain (rocky/earth/desert/lava/icy types) to read as continuous
    // landforms rather than faceted polygons.
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const { base: baseColor, second: secondColor, accent: accentColor } = this._planetPalette(body);

    const planetType = this._planetTypeIndex(body.subtype);

    // Solid surfaces (earth / desert / icy / lava) get displacement; gas /
    // hot-jupiter / ice giant remain perfectly spherical.  Rocky bodies
    // (type 0) also stay smooth — the matcap texture already encodes the
    // boulder relief, and any silhouette wobble would muddy the look.
    const SOLID_TYPES = new Set([1, 4, 6, 7]);
    const displaceAmount = SOLID_TYPES.has(planetType)
      ? (planetType === 4 ? 0.012 : 0.025)
      : 0.0;

    // Biosphere overlay DataTexture (32 lon × 16 lat, RGBA float)
    const bioData = new Float32Array(32 * 16 * 4);
    const bioTex = new THREE.DataTexture(bioData, 32, 16, THREE.RGBAFormat, THREE.FloatType);
    bioTex.needsUpdate = true;

    // Roughness / weathering hints driven by body properties so the same shader
    // gives perceptibly different results for similar planets.
    const cold = (body.temperature ?? 288) < 230;
    const weathering = body.subtype === 'rocky_small' || body.subtype === 'desert_world'
      ? 0.55
      : (cold ? 0.85 : 0.30);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time:             { value: 0 },
        baseColor:        { value: baseColor },
        secondColor:      { value: secondColor },
        accentColor:      { value: accentColor },
        planetType:       { value: planetType },
        seed:             { value: body.surfaceSeed != null ? (body.surfaceSeed % 100) + Math.random() * 0.01 : Math.random() * 100 },
        displaceAmount:   { value: displaceAmount },
        lightDir:         { value: new THREE.Vector3(1, 0.5, 0.5).normalize() },
        waterCoverage:    { value: body.waterCoverage ?? (body.hasWater ? 0.6 : 0.05) },
        iceCoverage:      { value: cold ? 0.7 : 0.1 },
        roughness:        { value: 0.55 },
        weathering:       { value: weathering },
        biosphereMap:     { value: bioTex },
        biosphereOpacity: { value: 0.0 },
        oceanGlow:        { value: (body.subtype === 'earth_like' || body.subtype === 'ocean_world') ? 1.0 : 0.0 },
        rockyMatcap:      { value: this._getRockyMatcap() },
      },
      vertexShader:   PLANET_VERTEX_GLSL,
      fragmentShader: PLANET_FRAGMENT_GLSL,
    });

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    group.userData.mainMesh = mesh;
    group.userData.material = material;
    group.userData.isPlanetShader = true;
    group.userData.bodyType = 'planet';
    group.userData._bioData = bioData;
    group.userData._bioTex  = bioTex;

    // Atmosphere glow: two-shell (outer Fresnel rim + inner haze).  Both shells
    // use the shared celestialShaders atmosphere program.
    if (body.hasAtmosphere) {
      const atmoColor  = new THREE.Color(body.atmosphereColor || '#88aaff');
      const skyColor   = atmoColor.clone().offsetHSL(0.02, -0.20, 0.10);
      const atmoOpacity = Math.min((body.atmospherePressure ?? 1.0) * 0.10, 0.55);

      const atmoGeom = new THREE.SphereGeometry(1.10, 64, 64);
      const atmoMat = new THREE.ShaderMaterial({
        uniforms: {
          atmoColor:    { value: atmoColor },
          atmoSkyColor: { value: skyColor },
          opacity:      { value: atmoOpacity },
          power:        { value: 2.2 },
        },
        vertexShader:   ATMOSPHERE_VERTEX_GLSL,
        fragmentShader: ATMOSPHERE_FRAGMENT_GLSL,
        transparent:  true,
        side:         THREE.BackSide,
        depthWrite:   false,
      });
      const atmosphere = new THREE.Mesh(atmoGeom, atmoMat);
      group.add(atmosphere);
      group.userData.atmosphere = atmosphere;

      const hazeGeom = new THREE.SphereGeometry(1.03, 64, 64);
      const hazeMat = new THREE.ShaderMaterial({
        uniforms: {
          atmoColor:    { value: atmoColor.clone().multiplyScalar(1.15) },
          atmoSkyColor: { value: skyColor },
          opacity:      { value: Math.min(atmoOpacity * 0.5, 0.20) },
          power:        { value: 1.4 },
        },
        vertexShader:   ATMOSPHERE_VERTEX_GLSL,
        fragmentShader: ATMOSPHERE_FRAGMENT_GLSL,
        transparent:  true,
        side:         THREE.BackSide,
        depthWrite:   false,
      });
      const hazeShell = new THREE.Mesh(hazeGeom, hazeMat);
      group.add(hazeShell);
      group.userData.hazeShell = hazeShell;
    }

    // Rings (improved with gradient)
    if (body.hasRings) {
      const ringGeom = new THREE.RingGeometry(1.5, 2.5, 128, 4);
      const ringColor = new THREE.Color(body.ringColor || '#ccaa88');
      const ringMat = new THREE.ShaderMaterial({
        uniforms: {
          ringColor: { value: ringColor },
        },
        vertexShader: /* glsl */`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          varying vec2 vUv;
          uniform vec3 ringColor;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float alpha = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.9, r);
            // Band structure
            float bands = sin(r * 40.0) * 0.15 + 0.85;
            float gap = smoothstep(0.48, 0.5, r) * smoothstep(0.54, 0.52, r);
            alpha *= bands * (1.0 - gap * 0.6);
            gl_FragColor = vec4(ringColor * (0.8 + 0.2 * bands), alpha * 0.55);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = Math.PI / 2 + 0.1;
      group.add(ring);
      group.userData.rings = ring;
    }

    // Invisible hit-proxy sphere (2x size)
    const hitProxyGeom = new THREE.SphereGeometry(2, 24, 24);
    const hitProxyMat = new THREE.MeshBasicMaterial({
      visible: true, transparent: true, opacity: 0, depthWrite: false,
    });
    const hitProxy = new THREE.Mesh(hitProxyGeom, hitProxyMat);
    group.add(hitProxy);
    group.userData.hitProxy = hitProxy;

    // Small circle locator for planets — visible from afar
    const pLocCanvas = document.createElement('canvas');
    pLocCanvas.width = 32;
    pLocCanvas.height = 32;
    const plctx = pLocCanvas.getContext('2d');
    const pColor = body.color || '#4488cc';
    plctx.beginPath();
    plctx.arc(16, 16, 12, 0, Math.PI * 2);
    plctx.fillStyle = pColor;
    plctx.fill();
    plctx.strokeStyle = '#ffffff';
    plctx.lineWidth = 2;
    plctx.stroke();
    const pLocTex = new THREE.CanvasTexture(pLocCanvas);
    const pLocMat = new THREE.SpriteMaterial({
      map: pLocTex, transparent: true, opacity: 0.6,
      depthTest: false, sizeAttenuation: false,
    });
    const pLocator = new THREE.Sprite(pLocMat);
    pLocator.scale.set(0.025, 0.025, 1);
    pLocator.renderOrder = 901;
    group.add(pLocator);
    group.userData.locator = pLocator;

    return group;
  }

  /**
   * Create black hole visual with accretion disk
   */
  createBlackHoleMesh(body, group) {
    // Event horizon (pure black sphere) — 128×128 keeps the silhouette
    // perfectly circular against the bright accretion disk at any zoom.
    const ehGeom = new THREE.SphereGeometry(1, 128, 128);
    const ehMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eventHorizon = new THREE.Mesh(ehGeom, ehMat);
    group.add(eventHorizon);
    group.userData.mainMesh = eventHorizon;
    group.userData.bodyType = 'black_hole';

    // Photon sphere ring
    const photonGeom = new THREE.TorusGeometry(1.5, 0.02, 16, 100);
    const photonMat = new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      transparent: true,
      opacity: 0.8,
    });
    const photonRing = new THREE.Mesh(photonGeom, photonMat);
    photonRing.rotation.x = Math.PI / 2;
    group.add(photonRing);
    group.userData.photonRing = photonRing;

    // Accretion disk
    if (body.accretionRate > 0) {
      const diskGeom = new THREE.RingGeometry(2, 8, 128, 8);
      const diskMat = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          spin: { value: body.spin },
          accretionRate: { value: body.accretionRate },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vRadius;
          void main() {
            vUv = uv;
            vRadius = length(position.xy);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          varying float vRadius;
          uniform float time;
          uniform float spin;
          uniform float accretionRate;

          void main() {
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
            float r = length(vUv - 0.5) * 2.0;

            // Temperature gradient (hotter closer in)
            float temp = 1.0 / (r * r + 0.1);

            // Spiral pattern
            float spiral = sin(angle * 4.0 + r * 10.0 - time * (2.0 + spin * 3.0)) * 0.5 + 0.5;

            // Color from temperature
            vec3 cool = vec3(0.8, 0.2, 0.05);
            vec3 hot = vec3(0.6, 0.7, 1.0);
            vec3 color = mix(cool, hot, clamp(temp, 0.0, 1.0));

            float brightness = temp * (0.5 + spiral * 0.5) * accretionRate;
            float alpha = brightness * smoothstep(0.0, 0.1, r) * smoothstep(1.0, 0.8, r);

            gl_FragColor = vec4(color * brightness, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const disk = new THREE.Mesh(diskGeom, diskMat);
      disk.rotation.x = Math.PI / 2;
      group.add(disk);
      group.userData.accretionDisk = disk;
      group.userData.diskMaterial = diskMat;
    }

    // Gravitational lensing distortion sphere (larger invisible sphere)
    const lensGeom = new THREE.SphereGeometry(5, 64, 64);
    const lensMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
    });
    const lensSphere = new THREE.Mesh(lensGeom, lensMat);
    group.add(lensSphere);

    // Invisible hit-proxy for easier clicking (4x size - black holes are often small)
    const hitProxyGeom = new THREE.SphereGeometry(4, 24, 24);
    const hitProxyMat = new THREE.MeshBasicMaterial({
      visible: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitProxy = new THREE.Mesh(hitProxyGeom, hitProxyMat);
    group.add(hitProxy);
    group.userData.hitProxy = hitProxy;

    return group;
  }

  /**
   * Create a default mesh for unknown body types
   */
  createDefaultMesh(body, group) {
    group.userData.bodyType = body.type || 'unknown';
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
    });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    group.userData.mainMesh = mesh;
    return group;
  }

  // ── Stellar evolution VFX ────────────────────────────────────────────────

  /**
   * Dispose of an entire body group (geometries, materials, textures) so we
   * can rebuild it cleanly when a body's type changes (e.g. star → black hole).
   */
  _disposeBodyGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose?.();
          m.dispose?.();
        }
      }
    });
  }

  /**
   * Tear down the existing mesh for a body and rebuild it from scratch.  Used
   * when a celestial body changes type at runtime (e.g. supernova collapses a
   * star into a black hole).  Preserves selection and visual scale state.
   */
  _rebuildBodyMesh(body) {
    const old = this.bodyMeshes.get(body.id);
    if (old) {
      const wasSelected = old.userData.selectionRing?.visible || false;
      this.scene.remove(old);
      this._disposeBodyGroup(old);
      this.bodyMeshes.delete(body.id);
      const fresh = this.createBodyMesh(body);
      fresh.position.copy(body.position);
      this.bodyMeshes.set(body.id, fresh);
      this.scene.add(fresh);
      if (fresh.userData.selectionRing) fresh.userData.selectionRing.visible = wasSelected;
    }
  }

  /**
   * Called by the simulation engine when a star transitions to a new
   * evolutionary phase.  Triggers a smooth visual blend overlay and, if the
   * body's type is changing (collapse to neutron star or black hole), spawns
   * a brief implosion + flash animation before the mesh is rebuilt.
   *
   * @param {object} body - The body that just changed phase.
   * @param {string} newPhase - The new phase identifier (matches PHASE_VALUES).
   */
  handlePhaseChange(body, newPhase) {
    if (!body) return;
    const group = this.bodyMeshes.get(body.id);
    if (!group) return;

    // Always run a 4-second phase-blend overlay so the transition reads
    // visually even when the underlying physics changes were already smooth.
    group.userData.phaseBlendDuration = 4.0;
    group.userData.phaseBlendTimeLeft = 4.0;

    // For collapse phases, spawn a short pre-collapse flash + shockwave.
    const dramatic = newPhase === 'neutron_star'
                  || newPhase === 'black_hole'
                  || newPhase === 'white_dwarf';
    if (dramatic) {
      const visualScale = this.getVisualScale(body);
      this._spawnTransitionFlash(group.position.clone(), visualScale, newPhase);
    }

    // For body-type changes the mesh-type drift detector in updateBodyVisual
    // will rebuild the mesh on the next frame; nothing to do here.
  }

  /**
   * Called by the simulation engine when a VFX event fires (supernova,
   * shockwave, collision burst, …).  Dispatches to per-type renderers.
   */
  handleVfxEvent(event) {
    if (!event || !event.type) return;
    if (event.type === 'supernova_explosion') {
      const pos = event.position
        ? new THREE.Vector3(event.position.x ?? 0, event.position.y ?? 0, event.position.z ?? 0)
        : null;
      this._spawnSupernova(pos, event);
    }
  }

  /**
   * Spawn a short-lived expanding shell + bright flash sprite for a stellar
   * transition collapse (white dwarf, neutron star, or pre-supernova
   * implosion).  The mesh self-disposes once the animation completes.
   */
  _spawnTransitionFlash(position, baseScale, kind) {
    const color = kind === 'neutron_star' ? 0xeaf3ff
                : kind === 'black_hole'   ? 0xffd2a0
                : 0xfff2c0;
    const geom = new THREE.SphereGeometry(1, 32, 32);
    const mat  = new THREE.MeshBasicMaterial({
      color,
      transparent:  true,
      opacity:      0.85,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
      side:         THREE.BackSide,
    });
    const flash = new THREE.Mesh(geom, mat);
    if (position) flash.position.copy(position);
    flash.scale.setScalar(Math.max(baseScale, 0.05));
    flash.renderOrder = 920;
    this.scene.add(flash);

    if (!this._activeVfx) this._activeVfx = [];
    this._activeVfx.push({
      kind: 'transitionFlash',
      mesh: flash,
      mat,
      startScale: flash.scale.x,
      endScale:   flash.scale.x * 4.5,
      duration:   2.4,
      elapsed:    0,
    });
  }

  /**
   * Spawn a full supernova: a brilliant central flash, expanding shockwave
   * shell, and a slow-fading nebula remnant.  Animations run in updateVfx().
   */
  _spawnSupernova(position, event) {
    if (!position) return;

    // Bright additive core flash
    const coreGeom = new THREE.SphereGeometry(1, 32, 32);
    const coreMat  = new THREE.MeshBasicMaterial({
      color:        0xfff4d0,
      transparent:  true,
      opacity:      1.0,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.copy(position);
    core.scale.setScalar(0.05);
    core.renderOrder = 930;
    this.scene.add(core);

    // Expanding shockwave shell (Fresnel-ish via BackSide additive sphere)
    const shellGeom = new THREE.SphereGeometry(1, 48, 48);
    const shellMat  = new THREE.MeshBasicMaterial({
      color:        0xff9e55,
      transparent:  true,
      opacity:      0.85,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
      side:         THREE.BackSide,
    });
    const shell = new THREE.Mesh(shellGeom, shellMat);
    shell.position.copy(position);
    shell.scale.setScalar(0.05);
    shell.renderOrder = 928;
    this.scene.add(shell);

    // Soft nebula remnant
    const remGeom = new THREE.SphereGeometry(1, 24, 24);
    const remMat  = new THREE.MeshBasicMaterial({
      color:        0x8d5cff,
      transparent:  true,
      opacity:      0.20,
      depthWrite:   false,
      blending:     THREE.AdditiveBlending,
      side:         THREE.BackSide,
    });
    const remnant = new THREE.Mesh(remGeom, remMat);
    remnant.position.copy(position);
    remnant.scale.setScalar(0.5);
    remnant.renderOrder = 925;
    this.scene.add(remnant);

    if (!this._activeVfx) this._activeVfx = [];
    this._activeVfx.push({
      kind:        'supernovaCore',
      mesh:        core,
      mat:         coreMat,
      startScale:  0.05,
      endScale:    1.4,
      duration:    1.2,
      elapsed:     0,
    });
    this._activeVfx.push({
      kind:        'supernovaShell',
      mesh:        shell,
      mat:         shellMat,
      startScale:  0.05,
      endScale:    Math.max(8.0, (event?.shockwaveRadius ?? 80) * 0.05),
      duration:    Math.max(4.0, event?.duration ?? 8.0),
      elapsed:     0,
    });
    this._activeVfx.push({
      kind:        'supernovaRemnant',
      mesh:        remnant,
      mat:         remMat,
      startScale:  0.5,
      endScale:    Math.max(6.0, (event?.shockwaveRadius ?? 80) * 0.04),
      duration:    Math.max(8.0, (event?.duration ?? 8.0) * 1.5),
      elapsed:     0,
    });
  }

  /**
   * Tick all active stellar/transition VFX.  Called once per render frame.
   */
  _updateVfx(dt) {
    if (!this._activeVfx || this._activeVfx.length === 0) return;
    const remaining = [];
    for (const fx of this._activeVfx) {
      fx.elapsed += dt;
      const t = Math.min(1.0, fx.elapsed / fx.duration);
      const ease = 1 - Math.pow(1 - t, 2);
      const scale = fx.startScale + (fx.endScale - fx.startScale) * ease;
      fx.mesh.scale.setScalar(scale);

      switch (fx.kind) {
        case 'transitionFlash':
          fx.mat.opacity = (1 - t) * 0.85;
          break;
        case 'supernovaCore':
          fx.mat.opacity = Math.max(0, 1 - t * 1.4);
          break;
        case 'supernovaShell':
          fx.mat.opacity = (1 - t) * 0.85;
          break;
        case 'supernovaRemnant':
          fx.mat.opacity = (1 - t) * 0.20;
          break;
        default:
          fx.mat.opacity = (1 - t) * 0.6;
      }

      if (t < 1.0) {
        remaining.push(fx);
      } else {
        this.scene.remove(fx.mesh);
        fx.mesh.geometry.dispose?.();
        fx.mat.dispose?.();
      }
    }
    this._activeVfx = remaining;
  }

  /**
   * Create a text label sprite.
   * @param {string} text
   * @param {{ color?: string }} [options]
   */
  createLabel(text, options = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 80;

    const textColor = options.color || '#ffffff';
    const font = 'bold 26px "Segoe UI", Arial, sans-serif';
    ctx.font = font;

    // Measure text for the background pill
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const padX = 22;
    const padY = 10;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const pillW = textW + padX * 2;
    const pillH = 34 + padY * 2;
    const pillX = cx - pillW / 2;
    const pillY = cy - pillH / 2;

    // Semi-transparent dark pill for contrast against any background
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(pillX, pillY, pillW, pillH, 9);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label text
    ctx.font = font;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      sizeAttenuation: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4.0, 0.62, 1);
    sprite.renderOrder = 950;
    return sprite;
  }

  /**
   * Get human-readable phase name for labels
   */
  getPhaseDisplayName(phase) {
    const names = {
      'main_sequence': 'Main Seq.',
      'subgiant': 'Subgiant',
      'red_giant': 'Red Giant',
      'red_supergiant': 'Supergiant',
      'white_dwarf': 'White Dwarf',
      'neutron_star': 'Neutron Star',
      'black_hole': 'Black Hole',
      'protostar': 'Protostar',
    };
    return names[phase] || phase;
  }

  /**
   * Draw (or update) the system envelope ring that encircles the full orbital
   * extent of the current system.  The ring becomes visible when the camera has
   * pulled back far enough that individual bodies would be hard to find without
   * it, and fades out again as the user zooms back in.
   *
   * Visibility trigger: when the system's orbital extent subtends less than
   * ~20 % of the camera distance (i.e. the whole system fits in a small patch
   * of screen), the ring fades in.
   */
  _updateSystemEnvelopeRing(bodies) {
    // Only in system view with at least some bodies
    if (this._viewLevel !== VIEW_LEVEL.SYSTEM || !bodies || bodies.length === 0) {
      if (this._systemEnvelopeRing) this._systemEnvelopeRing.visible = false;
      return;
    }

    // Lazy-create the ring mesh once
    if (!this._systemEnvelopeRing) {
      const ringGeom = new THREE.RingGeometry(0.96, 1.03, 192);
      ringGeom.rotateX(-Math.PI / 2); // lie flat in the orbital plane
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x4499ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.renderOrder = 50;
      ring.visible = false;
      this.scene.add(ring);
      this._systemEnvelopeRing = ring;

      // Second, slightly-larger halo ring for depth
      const haloGeom = new THREE.RingGeometry(1.04, 1.18, 192);
      haloGeom.rotateX(-Math.PI / 2);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x2266cc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeom, haloMat);
      halo.renderOrder = 49;
      halo.visible = false;
      this.scene.add(halo);
      this._systemEnvelopeHalo = halo;
    }

    const com  = this._comTarget;
    const extent = Math.max(this._systemExtent || 1, 0.5);
    const cameraDist = this.camera.position.distanceTo(com);

    // Fraction of camera distance that the system extent spans.
    // High values = zoomed in (system fills screen).
    // Low values  = zoomed out (system is tiny relative to view).
    const systemFraction = extent / cameraDist;

    // Envelope appears when system fills < 20 % of the view depth and
    // the camera is beyond 5× the system's orbital radius.
    const SHOW_THRESHOLD = 0.20;
    const FULL_THRESHOLD = 0.08; // fraction at which the ring is at max opacity

    if (systemFraction > SHOW_THRESHOLD) {
      this._systemEnvelopeRing.visible = false;
      if (this._systemEnvelopeHalo) this._systemEnvelopeHalo.visible = false;
      return;
    }

    // Smooth fade from 0 at SHOW_THRESHOLD → 1 at FULL_THRESHOLD
    const t = Math.max(0, Math.min(1,
      (SHOW_THRESHOLD - systemFraction) / (SHOW_THRESHOLD - FULL_THRESHOLD)
    ));
    const pulse = 0.7 + 0.3 * Math.sin(this.elapsedTime * 1.8);
    const ringOpacity  = t * 0.45 * pulse;
    const haloOpacity  = t * 0.18 * pulse;

    const ring = this._systemEnvelopeRing;
    ring.visible = true;
    ring.position.copy(com);
    ring.scale.setScalar(extent);
    ring.material.opacity = ringOpacity;

    if (this._systemEnvelopeHalo) {
      this._systemEnvelopeHalo.visible = true;
      this._systemEnvelopeHalo.position.copy(com);
      this._systemEnvelopeHalo.scale.setScalar(extent);
      this._systemEnvelopeHalo.material.opacity = haloOpacity;
    }
  }

  /**
   * Get BASE visual scale for a body (log scale for huge range)
   * Returns a visual radius in scene units (AU-scale)
   * Does NOT include viewScale - that's applied in updateBodyVisual
   *
   * Physical mapping (approximate):
   *   Sun (R=1 R☉)          → 0.15 scene units
   *   Red Giant (R=100 R☉)  → 0.45 scene units (3x sun)
   *   White Dwarf (R=0.01)  → 0.05 scene units (tiny!)
   *   Earth (1 R⊕)          → 0.04
   *   Jupiter (11 R⊕)       → 0.10
   */
  getBaseVisualScale(body) {
    if (body.type === 'star') {
      const R = Math.max(body.radius, 0.001);
      if (body.phase === 'white_dwarf') {
        // White dwarfs: very small but still visible
        return 0.04 + Math.log10(R + 1) * 0.05;
      }
      if (body.phase === 'neutron_star') {
        // Neutron stars: tiny point
        return 0.03;
      }
      // Main sequence, subgiant, red giant, supergiant:
      // Use log scale but with wider range to show red giant expansion
      // log10(1+1)=0.301→0.15, log10(100+1)=2.004→0.38, log10(1000+1)=3.0→0.50
      return 0.08 + Math.log10(R + 1) * 0.14;
    }
    if (body.type === 'planet') {
      // Planets: Earth ≈ 0.04, Jupiter ≈ 0.10 (exaggerated for visibility)
      return 0.02 + (body.radiusEarth || 1) * 0.02;
    }
    if (body.type === 'black_hole') {
      return 0.04 + Math.log10(body.mass + 1) * 0.04;
    }
    return 0.05;
  }

  /**
   * Get visual scale including user viewScale multiplier
   */
  getVisualScale(body) {
    return this.getBaseVisualScale(body) * this.viewScale;
  }

  /**
   * Update orbit trail with fade-out effect.
   * Reuses geometry buffers for performance; only reallocates when trail grows.
   */
  updateTrail(body) {
    const n = body.trail.length;
    if (n < 2) return;

    let trailObj = this.trailLines.get(body.id);
    const needsCreate = !trailObj || trailObj.userData._maxLen < n;

    if (needsCreate) {
      if (trailObj) {
        this.scene.remove(trailObj);
        trailObj.geometry?.dispose();
        trailObj.material?.dispose();
      }

      const maxLen = Math.max(n, body.maxTrailLength || 200);
      const positions = new Float32Array(maxLen * 3);
      const alphas = new Float32Array(maxLen);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
      geometry.setDrawRange(0, n);

      let trailColor;
      if (body.type === 'star') {
        trailColor = temperatureToColor(body.temperature).multiplyScalar(1.2);
      } else if (body.type === 'planet') {
        trailColor = new THREE.Color(body.color || '#4488cc');
        trailColor.r = Math.min(trailColor.r * 1.6 + 0.15, 1);
        trailColor.g = Math.min(trailColor.g * 1.6 + 0.15, 1);
        trailColor.b = Math.min(trailColor.b * 1.6 + 0.15, 1);
      } else if (body.type === 'black_hole') {
        trailColor = new THREE.Color(0xcc99ff).multiplyScalar(1.15);
      } else {
        trailColor = new THREE.Color(0x9999bb);
      }

      const material = new THREE.ShaderMaterial({
        uniforms: { trailColor: { value: trailColor } },
        vertexShader: /* glsl */`
          attribute float alpha;
          varying float vAlpha;
          void main() {
            vAlpha = alpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          uniform vec3 trailColor;
          varying float vAlpha;
          void main() {
            float a = vAlpha * vAlpha;
            vec3 col = trailColor * (0.45 + a * 0.65);
            gl_FragColor = vec4(col, a * 0.92);
          }
        `,
        transparent: true,
        depthWrite: false,
      });

      trailObj = new THREE.Line(geometry, material);
      trailObj.userData._maxLen = maxLen;
      trailObj.frustumCulled = false;
      this.scene.add(trailObj);
      this.trailLines.set(body.id, trailObj);
    }

    // Update position and alpha buffers in-place
    const posArr = trailObj.geometry.getAttribute('position').array;
    const alphaArr = trailObj.geometry.getAttribute('alpha').array;
    const invN = 1 / (n - 1);

    for (let i = 0; i < n; i++) {
      const p = body.trail[i];
      const i3 = i * 3;
      posArr[i3] = p.x;
      posArr[i3 + 1] = p.y;
      posArr[i3 + 2] = p.z;
      alphaArr[i] = i * invN;
    }

    trailObj.geometry.getAttribute('position').needsUpdate = true;
    trailObj.geometry.getAttribute('alpha').needsUpdate = true;
    trailObj.geometry.setDrawRange(0, n);
  }

  /**
   * Handle mouse move for hover effects
   */
  _onPointerDown(event) {
    this._pointerDownPos = { x: event.clientX, y: event.clientY };
    this._pointerMoved = false;
  }

  _onPointerUp(event) {
    if (!this._pointerDownPos) return;
    const dx = event.clientX - this._pointerDownPos.x;
    const dy = event.clientY - this._pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this._pointerMoved = dist > this._CLICK_THRESHOLD;

    if (!this._pointerMoved) {
      this.onClick(event);
    }
    this._pointerDownPos = null;
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (this._viewLevel === VIEW_LEVEL.UNIVERSE) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const targets = this._getClusterHitTargets();
      const hits = this.raycaster.intersectObjects(targets);
      const hoveredId = hits.length > 0 ? this._clusterIdFromHit(hits[0]) : null;
      const hoverChanged = hoveredId !== this._hoveredClusterId;

      if (hoverChanged) {
        this._hoveredClusterId = hoveredId;
        this.container.style.cursor = hoveredId ? 'pointer' : '';
      }
      // Keep tooltip position fresh while hovering the same cluster.
      if (this.onClusterHover) {
        if (hoveredId) {
          this.onClusterHover(hoveredId, { x: event.clientX, y: event.clientY });
        } else if (hoverChanged) {
          this.onClusterHover(null, { x: event.clientX, y: event.clientY });
        }
      }
    }
  }

  _getClusterHitTargets() {
    const targets = [];
    this._clusterMeshes.forEach((group) => {
      if (group.userData.hitProxy) targets.push(group.userData.hitProxy);
      if (group.userData.core) targets.push(group.userData.core);
      if (group.userData.glow) targets.push(group.userData.glow);
    });
    return targets;
  }

  _clusterIdFromHit(hit) {
    return hit.object.parent?.userData.clusterId
        || hit.object.userData?.clusterId
        || null;
  }

  /**
   * Handle click for selection (only called for genuine clicks, not drags)
   */
  onClick(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // In universe view: check cluster meshes for clicks
    if (this._viewLevel === VIEW_LEVEL.UNIVERSE) {
      const targets = this._getClusterHitTargets();
      const hits = this.raycaster.intersectObjects(targets);
      if (hits.length > 0) {
        const clusterId = this._clusterIdFromHit(hits[0]);
        if (clusterId && this.onClusterSelected) {
          this.onClusterSelected(clusterId, { x: event.clientX, y: event.clientY });
          return;
        }
      }
      const universePlaneHit = this.screenToWorldPlane(event.clientX, event.clientY);
      if (universePlaneHit && this.onUniverseCoordinateSelected) {
        this.onUniverseCoordinateSelected(
          {
            x: universePlaneHit.x / 0.4,
            y: universePlaneHit.y / 0.4,
            z: universePlaneHit.z / 0.4,
          },
          { x: event.clientX, y: event.clientY },
        );
      }
      return;
    }

    // System/Body view: check body meshes
    const meshes = [];
    this.bodyMeshes.forEach((group) => {
      if (group.userData.mainMesh) meshes.push(group.userData.mainMesh);
      if (group.userData.atmosphere) meshes.push(group.userData.atmosphere);
      if (group.userData.rings) meshes.push(group.userData.rings);
      if (group.userData.accretionDisk) meshes.push(group.userData.accretionDisk);
      if (group.userData.photonRing) meshes.push(group.userData.photonRing);
      if (group.userData.hitProxy) meshes.push(group.userData.hitProxy);
    });

    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      const bodyId = clickedMesh.parent?.userData.bodyId;
      if (bodyId && this.onBodySelected) {
        this.onBodySelected(bodyId);
      }
    } else {
      if (this.onBodyDeselected) this.onBodyDeselected();
    }
  }

  /**
   * Focus camera on a body
   */
  focusOnBody(body) {
    const target = body.position.clone();
    this.controls.target.copy(target);
    const scale = this.getVisualScale(body);
    this.camera.position.copy(target).add(new THREE.Vector3(scale * 5, scale * 3, scale * 5));
  }

  /**
   * Enter explorer mode: orbit camera around a body
   */
  enterExplorerMode(body) {
    this._explorerTarget = body;
    this._savedCameraState = {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
      minDist: this.controls.minDistance,
      maxDist: this.controls.maxDistance,
      trackCOM: this.trackCOM,
    };

    const scale = this.getVisualScale(body);
    const viewDist = Math.max(scale * 4, 0.15);

    this.controls.target.copy(body.position);
    const dir = this.camera.position.clone().sub(body.position);
    if (dir.length() < 0.001) dir.set(1, 0.5, 1);
    dir.normalize();
    this.camera.position.copy(body.position).addScaledVector(dir, viewDist);

    this.controls.minDistance = scale * 1.2;
    this.controls.maxDistance = scale * 30;
    this.trackCOM = false;
  }

  /**
   * Exit explorer mode: restore camera state
   */
  exitExplorerMode() {
    this._explorerTarget = null;
    if (this._savedCameraState) {
      this.camera.position.copy(this._savedCameraState.pos);
      this.controls.target.copy(this._savedCameraState.target);
      this.controls.minDistance = this._savedCameraState.minDist;
      this.controls.maxDistance = this._savedCameraState.maxDist;
      this.trackCOM = this._savedCameraState.trackCOM;
      this._savedCameraState = null;
    }
  }

  /**
   * Track explorer target each frame (body-centered reference frame)
   */
  _updateExplorerTracking() {
    const body = this._explorerTarget;
    if (!body || !body.alive) return;

    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(body.position);
    this.camera.position.copy(body.position).add(offset);
  }

  /**
   * Render universe-level cluster meshes
   */
  renderUniverse(clusters, allBodies, nebulas) {
    if (!clusters) return;
    for (const cluster of clusters) {
      if (cluster.alive) {
        this.updateClusterVisual(cluster);
      }
    }
    const rogueBodies = (allBodies || []).filter((body) => body.alive && body.escapedSystem);
    for (const body of rogueBodies) {
      this.updateRogueMarker(body);
    }
    // Nebula visuals
    if (nebulas) {
      for (const neb of nebulas) {
        if (neb.alive) this._updateNebulaVisual(neb);
      }
    }
    // Remove dead cluster meshes
    this._clusterMeshes.forEach((group, id) => {
      const cluster = clusters.find(c => c.id === id);
      if (!cluster || !cluster.alive) {
        this.scene.remove(group);
        this._clusterMeshes.delete(id);
      }
    });
    this.rogueMarkers.forEach((group, id) => {
      const body = rogueBodies.find((b) => b.id === id);
      if (!body || !body.alive) {
        this.scene.remove(group);
        this._disposeObject(group);
        this.rogueMarkers.delete(id);
      }
    });
    // Remove dead nebula meshes
    if (this._nebulaMeshes) {
      this._nebulaMeshes.forEach((mesh, id) => {
        if (!nebulas || !nebulas.find(n => n.id === id && n.alive)) {
          this.scene.remove(mesh);
          this._disposeObject(mesh);
          this._nebulaMeshes.delete(id);
        }
      });
    }
  }

  /** Render a universe-scale nebula as a semi-transparent soft glow sphere with a label */
  _updateNebulaVisual(neb) {
    if (!this._nebulaMeshes) this._nebulaMeshes = new Map();

    const UNIV_SCALE = this._universeScale || 10;
    const scaledPos = new THREE.Vector3(
      neb.position.x * UNIV_SCALE,
      (neb.position.y || 0) * UNIV_SCALE,
      neb.position.z * UNIV_SCALE,
    );
    const scaledR = neb.radius * UNIV_SCALE;

    let group = this._nebulaMeshes.get(neb.id);
    if (!group) {
      group = new THREE.Group();
      group.userData._nebulaId = neb.id;

      // Outer glow shell
      const geo = new THREE.SphereGeometry(1, 16, 12);
      const hexColor = neb.color || '#cc88ff';
      const col = new THREE.Color(hexColor);
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.06,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const outerMesh = new THREE.Mesh(geo, mat);
      outerMesh.scale.setScalar(scaledR * 1.2);
      group.add(outerMesh);

      // Inner brighter core
      const innerGeo = new THREE.SphereGeometry(1, 12, 8);
      const innerMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.scale.setScalar(scaledR * 0.55);
      group.add(innerMesh);

      // Label sprite
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = 'italic 18px sans-serif';
      ctx.fillStyle = hexColor;
      ctx.globalAlpha = 0.8;
      ctx.fillText(neb.name, 10, 40);
      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(scaledR * 1.8, scaledR * 0.45, 1);
      sprite.position.set(0, scaledR * 1.3, 0);
      group.add(sprite);

      this.scene.add(group);
      this._nebulaMeshes.set(neb.id, group);
    }

    group.position.copy(scaledPos);

    // Pulse the inner opacity gently
    const pulse = 0.09 + Math.sin(this.elapsedTime * 0.4 + neb.id.charCodeAt(0) * 0.1) * 0.02;
    group.children[1].material.opacity = pulse * neb.gasMass;
  }

  /**
   * Main render loop.
   * Supports three view levels: universe, system, body.
   */
  render(bodies, clusters, allBodies) {
    this.elapsedTime = this.clock.getElapsedTime();
    const frameDelta = Math.min(0.1, Math.max(0, this.clock.getDelta()));
    this._frameDelta = frameDelta; // make available to updateBodyVisual

    // Tick stellar evolution VFX (supernova flashes, transition shells, …).
    // Runs in every view level so explosions remain visible during a quick
    // pan to universe view.
    this._updateVfx(frameDelta);

    // Universe view: render clusters (but still keep body positions updated for smooth transitions)
    if (this._viewLevel === VIEW_LEVEL.UNIVERSE) {
      this.renderUniverse(clusters || [], allBodies || bodies || [], this._universeNebulas || []);

      // Silently update body positions so transition back to system is seamless
      if (bodies) {
        for (const body of bodies) {
          if (body.alive) {
            let group = this.bodyMeshes.get(body.id);
            if (group) {
              group.position.copy(body.position);
            }
          }
        }
      }

      // Orbit trails are for system/body context only — hide while in universe view
      if (bodies) {
        this._syncTrailVisibility(bodies);
      } else {
        this.trailLines.forEach((trail) => { trail.visible = false; });
      }

      this.controls.update();
      this.composer.render();
      return;
    }

    // System and Body views: render individual bodies
    if (bodies && bodies.length > 0) {
      this.computeSystemMetrics(bodies);

      if (this.selectedBody && this.selectedBody.alive) {
        const offset = this.camera.position.clone().sub(this.controls.target);
        // In system view, track the N-body physics position directly.
        // Body view tracking is deferred until AFTER updateBodyVisual (below)
        // so we use the already-rendered mesh position from the previous frame
        // as a close approximation; final correction happens post-update.
        if (this._viewLevel !== VIEW_LEVEL.BODY) {
          this.controls.target.copy(this.selectedBody.position);
          this.camera.position.copy(this.selectedBody.position).add(offset);
        }
      } else if (this._explorerTarget) {
        this._updateExplorerTracking();
      } else if (this.trackCOM && this.elapsedTime >= this._trackingPausedUntil && !this._cameraAnimating) {
        const lerpFactor = this._fastForwardMode ? 0.4 : 0.05;
        this._comSmooth.lerp(this._comTarget, lerpFactor);
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.copy(this._comSmooth);
        this.camera.position.copy(this._comSmooth).add(offset);

        // System co-rotating camera: cancel mean orbital spin about vertical axis so the system stays steadier on screen
        if (this._viewLevel === VIEW_LEVEL.SYSTEM && frameDelta > 0) {
          const omega = this._estimateSystemCorotationOmega(bodies);
          if (Math.abs(omega) > 1e-10) {
            const rel = this.camera.position.clone().sub(this._comSmooth);
            rel.applyAxisAngle(SceneManager._AXIS_Y, -omega * frameDelta);
            this.camera.position.copy(this._comSmooth).add(rel);
          }
        }
      }

      if (this.autoFrame) {
        this.fitAllBodies();
      }

      if (this._viewLevel === VIEW_LEVEL.SYSTEM) {
        const targetDist = this.controls.target.distanceTo(this._comTarget);
        if (targetDist > this._arenaRadius) {
          this._tempClampVec.copy(this.controls.target).sub(this._comTarget).normalize()
            .multiplyScalar(this._arenaRadius).add(this._comTarget);
          this.controls.target.copy(this._tempClampVec);
        }
      }
    }

    // Update habitable zone positions
    if (this._habitableZoneMesh && this.selectedBody && this.selectedBody.type === 'star') {
      this._habitableZoneMesh.position.copy(this.selectedBody.position);
    }
    if (this._viewLevel === VIEW_LEVEL.SYSTEM) {
      this.updateSystemHabitableZones(bodies);
    }

    this.controls.update();

    if (bodies) {
      this._nearestStarPos = null;
      for (const b of bodies) {
        if (b.alive && (b.type === 'star' || b.type === 'black_hole')) {
          this._nearestStarPos = b.position;
          break;
        }
      }
    }

    if (bodies) {
      // Build a fast-lookup set of the body IDs that belong to THIS render pass.
      // Any mesh / trail whose ID is absent must be hidden — it belongs to a
      // different galaxy system that is alive but not currently focused.
      // This prevents galaxy-1 bodies from bleeding into galaxy-2's viewport.
      const renderedBodyIds = new Set();
      for (const body of bodies) {
        if (body.alive) renderedBodyIds.add(body.id);
      }

      for (const body of bodies) {
        if (body.alive) {
          // In body view, only show the focused body (and maybe its children)
          if (this._viewLevel === VIEW_LEVEL.BODY) {
            const isFocused = body === this.selectedBody ||
              body === this._explorerTarget ||
              body.parentBody === this.selectedBody ||
              (this.selectedBody && this.selectedBody.children?.includes(body));
            const group = this.bodyMeshes.get(body.id);
            if (group) group.visible = isFocused;
            if (isFocused) {
              this.updateBodyVisual(body);
              this.updateTrail(body);
            }
          } else {
            const group = this.bodyMeshes.get(body.id);
            if (body.escapedSystem) {
              // Escaped bodies are no longer part of the local system;
              // hide their mesh here — they show as rogue markers in universe view.
              if (group) group.visible = false;
            } else {
              // Explicitly show, then update — ensures meshes hidden by a previous
              // cross-system pass become visible again when their system is focused.
              if (group) group.visible = true;
              this.updateBodyVisual(body);
              this.updateTrail(body);
            }
          }
        }
      }

      // ── Cross-system leak fix ────────────────────────────────────────────
      // Hide every mesh and trail whose body is alive but belongs to a
      // different galaxy system (not in this frame's render list).
      this.bodyMeshes.forEach((group, id) => {
        if (!renderedBodyIds.has(id)) {
          group.visible = false;
        }
      });
    }

    if (bodies) {
      this._syncTrailVisibility(bodies);
    }

    // ── Body-mode camera lock (post-update) ────────────────────────────────────
    // Run AFTER updateBodyVisual so we use this frame's mesh position, not the
    // previous frame's. This keeps the focused body pixel-perfectly centred even
    // at maximum fast-forward speed where the visual orbit drifts away from the
    // N-body physics position.
    if (this._viewLevel === VIEW_LEVEL.BODY && this.selectedBody?.alive) {
      const g = this.bodyMeshes.get(this.selectedBody.id);
      const trackPos = (g ? g.position : this.selectedBody.position);
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.copy(trackPos);
      this.camera.position.copy(trackPos).add(offset);
      this.controls.update(); // re-apply after repositioning
    }

    // System envelope ring — a pulsing halo drawn around the system's orbital
    // boundary so the user can find it when deeply zoomed out.
    this._updateSystemEnvelopeRing(bodies);

    this.bodyMeshes.forEach((group) => {
      if (group.userData.diskMaterial?.uniforms) {
        group.userData.diskMaterial.uniforms.time.value = this.elapsedTime;
      }
    });

    const cleanupList = allBodies || bodies;
    this.bodyMeshes.forEach((group, id) => {
      const body = cleanupList?.find(b => b.id === id);
      if (!body || !body.alive) {
        group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        });
        this.scene.remove(group);
        this.bodyMeshes.delete(id);
        const trail = this.trailLines.get(id);
        if (trail) {
          this.scene.remove(trail);
          trail.geometry?.dispose();
          trail.material?.dispose();
          this.trailLines.delete(id);
        }
      }
    });

    this.composer.render();
  }

  /**
   * Handle window resize
   */
  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  // === Drag Placement Helpers ===

  /**
   * Create a small sprite label for drag helper overlays.
   */
  _createDragLabel(text, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 192;
    canvas.height = 48;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.85, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  /**
   * Show drag placement helpers: distance lines, orbit ring, angle arc, ghost.
   * Called on every dragover event while the user drags an object onto the canvas.
   */
  updateDragHelpers(worldPos, bodies, draggingObj) {
    if (!worldPos) { this.clearDragHelpers(); return; }

    const group = this._dragHelpersGroup;
    group.visible = true;

    // Remove old helpers
    while (group.children.length) {
      const c = group.children[0];
      group.remove(c);
      c.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }

    if (!bodies || bodies.length === 0) return;

    const alive = bodies.filter(b => b.alive);
    if (alive.length === 0) return;

    // Sort by distance and take closest 5
    const withDist = alive.map(b => ({
      body: b,
      dist: Math.sqrt(
        (b.position.x - worldPos.x) ** 2 +
        (b.position.z - worldPos.z) ** 2
      ),
    }));
    withDist.sort((a, b) => a.dist - b.dist);
    const closest = withDist.slice(0, 5).filter(w => w.dist < 100);

    // --- Distance lines ---
    const dashMat = new THREE.LineDashedMaterial({
      color: 0xffffff, transparent: true, opacity: 0.35,
      dashSize: 0.3, gapSize: 0.15, depthTest: false,
    });

    for (const { body, dist } of closest) {
      const pts = [
        new THREE.Vector3(worldPos.x, 0.05, worldPos.z),
        new THREE.Vector3(body.position.x, 0.05, body.position.z),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geom, dashMat.clone());
      line.computeLineDistances();
      line.renderOrder = 998;
      group.add(line);

      const mid = new THREE.Vector3(
        (worldPos.x + body.position.x) / 2,
        0.5,
        (worldPos.z + body.position.z) / 2
      );
      const label = this._createDragLabel(`${dist.toFixed(1)} AU`);
      label.position.copy(mid);
      group.add(label);
    }

    // --- Find nearest star for orbit ring and angle ---
    const nearestStar = withDist.find(w => w.body.type === 'star');
    if (nearestStar && nearestStar.dist > 0.01) {
      const star = nearestStar.body;
      const orbitalR = nearestStar.dist;

      // Orbit preview ring (dashed circle on y=0)
      const ringSegs = 128;
      const ringPts = [];
      for (let i = 0; i <= ringSegs; i++) {
        const a = (i / ringSegs) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(
          star.position.x + orbitalR * Math.cos(a),
          0.03,
          star.position.z + orbitalR * Math.sin(a)
        ));
      }
      const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPts);
      const ringMat = new THREE.LineDashedMaterial({
        color: 0x00ccff, transparent: true, opacity: 0.3,
        dashSize: 0.5, gapSize: 0.25, depthTest: false,
      });
      const ring = new THREE.Line(ringGeom, ringMat);
      ring.computeLineDistances();
      ring.renderOrder = 997;
      group.add(ring);

      // --- Angle indicator ---
      const dx = worldPos.x - star.position.x;
      const dz = worldPos.z - star.position.z;
      const angle = Math.atan2(dz, dx);
      const angleDeg = ((angle * 180 / Math.PI) + 360) % 360;

      // Radial line from star to cursor
      const radPts = [
        new THREE.Vector3(star.position.x, 0.06, star.position.z),
        new THREE.Vector3(worldPos.x, 0.06, worldPos.z),
      ];
      const radGeom = new THREE.BufferGeometry().setFromPoints(radPts);
      const radMat = new THREE.LineBasicMaterial({
        color: 0xffcc44, transparent: true, opacity: 0.5, depthTest: false,
      });
      const radLine = new THREE.Line(radGeom, radMat);
      radLine.renderOrder = 998;
      group.add(radLine);

      // Arc from 0 to angle
      const arcSegs = Math.max(8, Math.round(Math.abs(angleDeg) / 5));
      const arcR = Math.min(orbitalR * 0.25, 2);
      const arcPts = [];
      for (let i = 0; i <= arcSegs; i++) {
        const a = (i / arcSegs) * angle;
        arcPts.push(new THREE.Vector3(
          star.position.x + arcR * Math.cos(a),
          0.06,
          star.position.z + arcR * Math.sin(a)
        ));
      }
      if (arcPts.length >= 2) {
        const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0xffcc44, transparent: true, opacity: 0.5, depthTest: false,
        });
        const arc = new THREE.Line(arcGeom, arcMat);
        arc.renderOrder = 998;
        group.add(arc);
      }

      // Angle label
      const labelR = arcR * 1.4;
      const labelAngle = angle / 2;
      const angleLabel = this._createDragLabel(`${angleDeg.toFixed(0)}\u00B0`, '#ffcc44');
      angleLabel.position.set(
        star.position.x + labelR * Math.cos(labelAngle),
        0.6,
        star.position.z + labelR * Math.sin(labelAngle)
      );
      group.add(angleLabel);
    }

    // --- Ghost sphere at cursor ---
    if (draggingObj) {
      const ghostColor = draggingObj.bodyType === 'star' ? 0xffcc44 : 0x4488ff;
      const ghostR = draggingObj.bodyType === 'star' ? 0.25 : 0.15;
      const ghostGeom = new THREE.SphereGeometry(ghostR, 16, 16);
      const ghostMat = new THREE.MeshBasicMaterial({
        color: ghostColor, transparent: true, opacity: 0.4, depthTest: false,
      });
      const ghost = new THREE.Mesh(ghostGeom, ghostMat);
      ghost.position.set(worldPos.x, ghostR, worldPos.z);
      ghost.renderOrder = 999;
      group.add(ghost);

      // Glow ring around ghost
      const glowGeom = new THREE.RingGeometry(ghostR * 1.5, ghostR * 1.8, 32);
      glowGeom.rotateX(-Math.PI / 2);
      const glowMat = new THREE.MeshBasicMaterial({
        color: ghostColor, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthTest: false,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.position.set(worldPos.x, 0.02, worldPos.z);
      glow.renderOrder = 998;
      group.add(glow);
    }
  }

  /**
   * Remove all drag placement helpers from the scene.
   */
  clearDragHelpers() {
    const group = this._dragHelpersGroup;
    if (!group) return;
    group.visible = false;
    while (group.children.length) {
      const c = group.children[0];
      group.remove(c);
      c.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    window.removeEventListener('resize', this._boundOnResize);
    this.renderer.domElement.removeEventListener('mousemove', this._boundOnMouseMove);
    this.renderer.domElement.removeEventListener('pointerdown', this._boundOnPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this._boundOnPointerUp);

    this.trailLines.forEach((line) => {
      line.geometry?.dispose();
      line.material?.dispose();
    });
    this.trailLines.clear();

    this.bodyMeshes.forEach((group) => {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    });
    this.bodyMeshes.clear();

    this._clusterMeshes.forEach((group) => {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this._clusterMeshes.clear();

    this.hideHabitableZone();
    this.hideSystemHabitableZones();
    this.clearDragHelpers();
    this.removeDistanceGrid();

    this.renderer.dispose();
    this.composer.dispose();
    this.scene.clear();
  }

  // Callbacks (set by the app)
  onBodySelected = null;
  onBodyDeselected = null;
  onClusterSelected = null;
  onClusterHover = null;
  onUniverseCoordinateSelected = null;
  onViewScaleChange = null;
  _hoveredClusterId = null;
}

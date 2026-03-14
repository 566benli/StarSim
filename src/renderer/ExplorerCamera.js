/**
 * ExplorerCamera - Body-inspection orbit mode
 * Centers the camera on a selected body and lets the user orbit around it.
 * Computes exploration info (region, temperature, density) based on camera distance.
 */
import * as THREE from 'three';
import { clamp } from '@utils/math';

export default class ExplorerCamera {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.enabled = false;
    this.targetBody = null;

    this.explorerInfo = {
      distance: 0,
      depth: 0,
      localTemp: 0,
      localDensity: 0,
      localPressure: 0,
      region: 'Space',
    };
  }

  /**
   * Enable explorer mode, centering on targetBody.
   * SceneManager handles the actual camera positioning; this class
   * computes the science info overlay each frame.
   */
  enable(body) {
    this.enabled = true;
    this.targetBody = body;
  }

  disable() {
    this.enabled = false;
    this.targetBody = null;
    this.explorerInfo = {
      distance: 0, depth: 0, localTemp: 0,
      localDensity: 0, localPressure: 0, region: 'Space',
    };
  }

  /**
   * Update exploration info based on current camera distance to target.
   * Called every frame by App's animation loop.
   */
  update(dt, sceneManager) {
    if (!this.enabled || !this.targetBody) return;

    const body = this.targetBody;
    const distance = this.camera.position.distanceTo(body.position);
    const visualScale = sceneManager ? sceneManager.getVisualScale(body) : 0.15;

    this.explorerInfo.distance = distance;

    const surfaceRatio = distance / visualScale;

    if (surfaceRatio > 5) {
      this.explorerInfo.region = `Near ${body.name}`;
      this.explorerInfo.localTemp = 2.7;
      this.explorerInfo.localDensity = 0;
      this.explorerInfo.localPressure = 0;
      this.explorerInfo.depth = 0;
    } else if (surfaceRatio > 1.3) {
      this.explorerInfo.region = `${body.name} — Upper Atmosphere`;
      this.explorerInfo.localTemp = body.temperature * 0.3;
      this.explorerInfo.localDensity = 0.001;
      this.explorerInfo.depth = 0;
    } else if (surfaceRatio > 0.9) {
      this.explorerInfo.region = `${body.name} — Surface`;
      this.explorerInfo.localTemp = body.temperature;
      this.explorerInfo.localDensity = body.type === 'star' ? 0.001 : 3;
      this.explorerInfo.depth = 0;
    } else {
      const progress = clamp(1.0 - surfaceRatio, 0, 1);
      this.explorerInfo.depth = progress;

      if (body.type === 'star') {
        this._updateStarInterior(progress, body);
      } else if (body.type === 'planet') {
        this._updatePlanetInterior(progress, body);
      } else {
        this.explorerInfo.region = `Inside ${body.name}`;
        this.explorerInfo.localTemp = 0;
      }
    }
  }

  _updateStarInterior(progress, body) {
    if (progress < 0.3) {
      this.explorerInfo.region = `${body.name} — Convection Zone`;
      this.explorerInfo.localTemp = body.temperature * (1 + progress * 10);
      this.explorerInfo.localDensity = 0.001 * (1 + progress * 100);
    } else if (progress < 0.7) {
      this.explorerInfo.region = `${body.name} — Radiative Zone`;
      this.explorerInfo.localTemp = body.temperature * (5 + progress * 20);
      this.explorerInfo.localDensity = 1 + progress * 50;
    } else {
      this.explorerInfo.region = `${body.name} — Core`;
      this.explorerInfo.localTemp = body.coreTemperature || 15e6;
      this.explorerInfo.localDensity = 150;
      this.explorerInfo.localPressure = 2.5e16;
    }
  }

  _updatePlanetInterior(progress, body) {
    if (progress < 0.05 && body.hasAtmosphere) {
      this.explorerInfo.region = `${body.name} — Atmosphere`;
      this.explorerInfo.localTemp = body.temperature;
      this.explorerInfo.localDensity = 0.001;
    } else if (progress < 0.4) {
      this.explorerInfo.region = `${body.name} — Crust / Mantle`;
      this.explorerInfo.localTemp = body.temperature + progress * 5000;
      this.explorerInfo.localDensity = 3 + progress * 5;
    } else if (progress < 0.7) {
      this.explorerInfo.region = `${body.name} — Outer Core`;
      this.explorerInfo.localTemp = 4000 + progress * 3000;
      this.explorerInfo.localDensity = 10 + progress * 3;
    } else {
      this.explorerInfo.region = `${body.name} — Inner Core`;
      this.explorerInfo.localTemp = 5000 + progress * 2000;
      this.explorerInfo.localDensity = 13;
      this.explorerInfo.localPressure = 3.6e11;
    }
  }
}

// Black hole fragment shader - Gravitational lensing + accretion disk
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

uniform float time;
uniform float mass;
uniform float spin;
uniform float accretionRate;
uniform vec3 blackHolePosition;
uniform float eventHorizonRadius;

// Accretion disk color from temperature
vec3 diskColor(float temp) {
  // Approximate blackbody in visible range
  vec3 cool = vec3(0.8, 0.2, 0.05);   // Red-orange (outer disk)
  vec3 mid = vec3(1.0, 0.8, 0.3);     // Yellow-white
  vec3 hot = vec3(0.6, 0.7, 1.0);     // Blue-white (inner disk)

  float t = clamp(temp / 50000.0, 0.0, 1.0);
  if (t < 0.5) {
    return mix(cool, mid, t * 2.0);
  }
  return mix(mid, hot, (t - 0.5) * 2.0);
}

void main() {
  // Distance from black hole center in UV space
  vec2 centered = vUv - vec2(0.5);
  float dist = length(centered);
  float angle = atan(centered.y, centered.x);

  // Event horizon: pure black
  if (dist < eventHorizonRadius * 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Photon sphere region: extreme lensing distortion
  float photonSphere = eventHorizonRadius * 0.75;
  if (dist < photonSphere) {
    // Faint photon ring
    float ringBrightness = exp(-pow((dist - photonSphere) / 0.01, 2.0));
    vec3 photonRing = vec3(1.0, 0.9, 0.7) * ringBrightness * 2.0;
    gl_FragColor = vec4(photonRing, ringBrightness);
    return;
  }

  // Accretion disk
  float diskInner = eventHorizonRadius * 1.5;
  float diskOuter = eventHorizonRadius * 10.0;

  if (accretionRate > 0.0 && dist > diskInner && dist < diskOuter) {
    float diskPosition = (dist - diskInner) / (diskOuter - diskInner);

    // Temperature decreases with distance (T ~ r^-3/4)
    float diskTemp = 50000.0 * pow(diskInner / dist, 0.75);

    // Rotating pattern
    float rotationAngle = angle + time * (3.0 / dist) + spin * 5.0;

    // Spiral structure
    float spiral = sin(rotationAngle * 3.0 + dist * 20.0 - time * 2.0) * 0.5 + 0.5;
    float turbulence = sin(rotationAngle * 7.0 + dist * 40.0 + time * 1.5) * 0.3;

    float brightness = (1.0 - diskPosition) * (0.7 + spiral * 0.3 + turbulence * 0.1);
    brightness *= accretionRate;

    // Doppler beaming (approaching side brighter)
    float doppler = 1.0 + 0.3 * spin * sin(rotationAngle);
    brightness *= doppler;

    vec3 color = diskColor(diskTemp) * brightness;

    // Fade at edges
    float edgeFade = smoothstep(diskOuter, diskOuter * 0.8, dist)
                   * smoothstep(diskInner, diskInner * 1.2, dist);

    gl_FragColor = vec4(color * edgeFade, edgeFade * brightness);
    return;
  }

  // Gravitational lensing distortion of background
  float lensStrength = mass * eventHorizonRadius / (dist * dist);
  vec2 lensedUV = centered * (1.0 + lensStrength);

  // Background stars (simple procedural)
  float starField = step(0.998, fract(sin(dot(lensedUV * 100.0, vec2(12.9898, 78.233))) * 43758.5453));
  vec3 bg = vec3(starField * 0.8);

  // Einstein ring effect near photon sphere
  float einsteinRing = exp(-pow((dist - photonSphere * 1.1) / 0.02, 2.0)) * 0.5;
  bg += vec3(0.8, 0.7, 0.5) * einsteinRing;

  gl_FragColor = vec4(bg, max(starField, einsteinRing));
}

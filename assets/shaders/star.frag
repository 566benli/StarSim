// Star fragment shader - Procedural stellar surface
precision highp float;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
varying float vDistanceFromCenter;

uniform float time;
uniform vec3 starColor;          // Base color from temperature
uniform vec3 starColorHot;       // Hotter spots color
uniform float temperature;       // Surface temperature
uniform float luminosity;        // Luminosity for brightness
uniform float turbulence;        // Surface turbulence
uniform float flareActivity;     // Solar flare activity

// Noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec3 viewDir = normalize(-vPosition);
  float NdotV = dot(vNormal, viewDir);

  // Multi-octave noise for surface detail
  float noise1 = snoise(vPosition * 4.0 + time * 0.3) * 0.5 + 0.5;
  float noise2 = snoise(vPosition * 8.0 + time * 0.5) * 0.5 + 0.5;
  float noise3 = snoise(vPosition * 16.0 + time * 0.8) * 0.5 + 0.5;

  // Combine noise octaves for granulation pattern
  float granulation = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
  granulation = pow(granulation, 1.5) * turbulence;

  // Mix base color with hot spots
  vec3 surfaceColor = mix(starColor, starColorHot, granulation * 0.4);

  // Sunspot-like dark regions
  float spotNoise = snoise(vPosition * 2.0 + time * 0.1);
  float spots = smoothstep(0.6, 0.8, spotNoise) * 0.3;
  surfaceColor *= (1.0 - spots);

  // Limb darkening (realistic for stars)
  float limbDarkening = pow(max(NdotV, 0.0), 0.4);
  surfaceColor *= limbDarkening;

  // Corona/glow at edges (Fresnel effect)
  float fresnel = pow(1.0 - max(NdotV, 0.0), 3.0);
  vec3 coronaColor = starColorHot * 1.5;
  surfaceColor += coronaColor * fresnel * 0.5;

  // Solar flare effect
  if (flareActivity > 0.0) {
    float flareNoise = snoise(vPosition * 1.5 + time * 2.0);
    float flare = smoothstep(0.7, 1.0, flareNoise) * flareActivity;
    surfaceColor += starColorHot * flare * 2.0;
  }

  // Brightness based on luminosity (clamped for display)
  float brightness = 0.8 + 0.2 * min(log(luminosity + 1.0), 5.0);
  surfaceColor *= brightness;

  gl_FragColor = vec4(surfaceColor, 1.0);
}

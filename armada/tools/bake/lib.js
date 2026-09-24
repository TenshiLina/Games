// Shared GLSL for the asset baker: noise, SDF primitives, materials and a
// physically based shading model. Each asset supplies map() and material().
window.GLSL_HEADER = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uPhase;   // animation phase 0..1 for frame-based assets
uniform int uPass;      // 0 = beauty, 1 = emissive only
uniform float uExtent;  // half-height of the view in world units
uniform vec3 uCamDir;   // orthographic view direction
uniform int uAA;
out vec4 outColor;

#define PI 3.14159265359
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float noise2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), f.x), mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
float fbm2(vec2 p, int oct){ float a = .5, s = 0.; for (int i = 0; i < 10; i++){ if (i >= oct) break; s += a * noise2(p); p = rot(.6) * p * 2.02 + vec2(3.1, 1.7); a *= .5; } return s; }

// --- SDF primitives (after Inigo Quilez) ---
float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdRoundBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdEllipsoid(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xy) - t.x, p.z); return length(q) - t.y; }
float sdCylZ(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
float sdCylY(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1. / l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2; vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv);
  float y2 = y * y * l2; float z2 = z * z * l2; float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }

// Panel-line pattern on a plane. Returns (distance to the nearest seam, panel id).
vec2 panels(vec2 p, vec2 cell){
  vec2 c = floor(p / cell); vec2 f = p / cell - c;
  float h = hash12(c);
  vec2 g = f, sc = cell, sub = vec2(0);
  // split some cells in two (either way), and some into four, so panels vary
  if (h > .6){ g.x = fract(f.x * 2.); sc.x *= .5; sub.x = floor(f.x * 2.); }
  else if (h > .3){ g.y = fract(f.y * 2.); sc.y *= .5; sub.y = floor(f.y * 2.); }
  else if (h > .18){ g = fract(f * 2.); sc *= .5; sub = floor(f * 2.); }
  vec2 e = min(g, 1. - g) * sc;
  return vec2(min(e.x, e.y), hash12(c * 7.1 + sub * 1.3 + 3.7));
}
float panelSeams(vec2 p, vec2 cell){ return panels(p, cell).x; }
// Weathering: soft streaks that run along the ship's flow axis (y).
float streaks(vec3 p){ return fbm(vec3(p.x * 38., p.y * 3., p.z * 38.)); }

struct Mat { vec3 albedo; float metal; float rough; vec3 emit; };
Mat M(vec3 a, float m, float r){ return Mat(a, m, r, vec3(0)); }
`;

window.GLSL_RENDER = `
// ---------- lighting rig shared by every sprite ----------
const vec3 SUN_DIR = normalize(vec3(-.55, .45, .75));
const vec3 SUN_COL = vec3(1., .95, .88) * 3.4;
const vec3 RIM_DIR = normalize(vec3(.75, .8, .25));
const vec3 RIM_COL = vec3(.55, .7, 1.) * 1.1;
const vec3 PLANET_DIR = normalize(vec3(.0, -1., .25));
const vec3 PLANET_COL = vec3(.18, .36, .75) * .9;

vec3 env(vec3 d){
  // mostly black space, a blue planet glow from below and the sun's disc
  vec3 c = vec3(.006, .008, .014);
  c += vec3(.10, .22, .50) * smoothstep(.1, -.9, d.y) * (.4 + .6 * smoothstep(-.3, .6, d.z));
  c += vec3(.35, .30, .45) * .08 * smoothstep(.2, 1., d.z);
  c += SUN_COL * 6. * pow(max(dot(d, SUN_DIR), 0.), 400.);
  c += SUN_COL * .12 * pow(max(dot(d, SUN_DIR), 0.), 12.);
  return c;
}

vec3 brdf(vec3 n, vec3 v, vec3 l, Mat m){
  vec3 h = normalize(v + l);
  float NoV = max(dot(n, v), 1e-3), NoL = max(dot(n, l), 0.), NoH = max(dot(n, h), 0.), VoH = max(dot(v, h), 0.);
  float a = max(m.rough * m.rough, .002); float a2 = a * a;
  float dd = NoH * NoH * (a2 - 1.) + 1.; float D = a2 / (PI * dd * dd);
  float k = (m.rough + 1.) * (m.rough + 1.) / 8.;
  float G = NoV / (NoV * (1. - k) + k) * NoL / (NoL * (1. - k) + k);
  vec3 F0 = mix(vec3(.04), m.albedo, m.metal);
  vec3 F = F0 + (1. - F0) * pow(1. - VoH, 5.);
  vec3 spec = D * G * F / (4. * NoV * NoL + 1e-3);
  vec3 kd = (1. - F) * (1. - m.metal);
  return (kd * m.albedo / PI + spec) * NoL;
}

vec2 mapScene(vec3 p);
Mat material(float id, vec3 p, vec3 n);

vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1, -1); const float e = .0008;
  return normalize(k.xyy * mapScene(p + k.xyy * e).x + k.yyx * mapScene(p + k.yyx * e).x +
                   k.yxy * mapScene(p + k.yxy * e).x + k.xxx * mapScene(p + k.xxx * e).x);
}
float softShadow(vec3 ro, vec3 rd){
  float res = 1., t = .01;
  for (int i = 0; i < 48; i++){
    float h = mapScene(ro + rd * t).x;
    res = min(res, 10. * h / t);
    t += clamp(h, .01, .2);
    if (res < .002 || t > 4.) break;
  }
  return clamp(res, 0., 1.);
}
float calcAO(vec3 p, vec3 n){
  float occ = 0., sca = 1.;
  for (int i = 0; i < 5; i++){
    float h = .01 + .06 * float(i);
    occ += (h - mapScene(p + n * h).x) * sca; sca *= .8;
  }
  return clamp(1. - 2.2 * occ, 0., 1.);
}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

vec4 renderSample(vec2 uv){
  vec3 f = normalize(uCamDir);
  vec3 r = normalize(cross(f, vec3(0, 1, 0)));
  vec3 u = cross(r, f);
  vec3 ro = (uv.x * r + uv.y * u) * uExtent - f * 8.;
  vec3 rd = f;
  float t = 0.; vec2 h = vec2(1e9, -1.);
  for (int i = 0; i < 220; i++){
    h = mapScene(ro + rd * t);
    if (h.x < .0004 * (1. + t * .1)) break;
    t += h.x * .9;
    if (t > 16.) break;
  }
  if (t > 16.) return vec4(0);
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  Mat m = material(h.y, p, n);
  if (uPass == 1) return vec4(m.emit, 1.);
  vec3 v = -rd;
  float ao = calcAO(p, n);
  vec3 col = m.emit;
  float sh = softShadow(p + n * .004, SUN_DIR);
  col += brdf(n, v, SUN_DIR, m) * SUN_COL * sh;
  col += brdf(n, v, RIM_DIR, m) * RIM_COL * mix(.4, 1., ao);
  col += brdf(n, v, PLANET_DIR, m) * PLANET_COL * ao;
  // image-based ambient: diffuse and a filtered reflection of the environment
  vec3 F0 = mix(vec3(.04), m.albedo, m.metal);
  float NoV = max(dot(n, v), 0.);
  vec3 F = F0 + (max(vec3(1. - m.rough), F0) - F0) * pow(1. - NoV, 5.);
  vec3 refl = reflect(rd, n);
  vec3 blurEnv = mix(env(refl), vec3(.03, .05, .1) + vec3(.1, .2, .4) * smoothstep(.2, -1., refl.y) * .5, clamp(m.rough * 1.4, 0., 1.));
  col += F * blurEnv * ao;
  col += (1. - F) * (1. - m.metal) * m.albedo * (vec3(.02, .025, .04) + PLANET_COL * .15 * (.5 - .5 * n.y)) * ao;
  return vec4(col, 1.);
}

void main(){
  vec4 acc = vec4(0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++){
    if (i >= uAA || j >= uAA) continue;
    vec2 o = (vec2(i, j) + .5) / float(uAA) - .5;
    vec2 uv = (2. * (gl_FragCoord.xy + o) - uRes) / uRes.y;
    vec4 s = renderSample(uv);
    vec3 c = pow(aces(s.rgb), vec3(1. / 2.2));
    acc += vec4(c * s.a, s.a);
  }
  outColor = acc / float(uAA * uAA);
}
`;

// Full-screen image shaders (backgrounds) supply vec4 image(vec2 fragCoord)
// returning linear premultiplied colour.
window.GLSL_IMAGE_MAIN = `
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec4 image(vec2 fc);
void main(){
  vec4 acc = vec4(0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++){
    if (i >= uAA || j >= uAA) continue;
    vec2 o = (vec2(i, j) + .5) / float(uAA) - .5;
    vec4 s = image(gl_FragCoord.xy + o);
    vec3 c = s.a > 0. ? pow(aces(s.rgb / s.a), vec3(1. / 2.2)) : vec3(0);
    acc += vec4(c * s.a, s.a);
  }
  outColor = acc / float(uAA * uAA);
}
`;

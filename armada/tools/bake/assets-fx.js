// Weapon bolts, impact flare and the volumetric explosion sheet.
// These are 'image' shaders: image() returns linear premultiplied colour.
ASSETS.push({
  name: 'bolt-player',
  kind: 'image',
  size: [48, 160],
  aa: 3,
  glsl: `
vec4 image(vec2 fc){
  vec2 p = (fc - uRes * .5) / uRes.x;               // x in [-.5,.5]
  float halfLen = uRes.y / uRes.x * .5 - .5;
  // distance to a vertical segment; the head (top) is brighter than the tail
  float y = clamp(p.y, -halfLen + .1, halfLen - .1);
  float d = length(vec2(p.x, p.y - y));
  float along = clamp((p.y + halfLen) / (2. * halfLen), 0., 1.);
  float core = exp(-d * d / .006) * mix(.35, 1., along);
  float halo = exp(-d / .11) * mix(.3, 1., along);
  vec3 col = vec3(.85, .95, 1.) * core * 5. + vec3(.15, .55, 1.) * halo * 2.2;
  float a = clamp(core * 1.5 + halo * .9, 0., 1.);
  return vec4(col, a);
}
`,
});

ASSETS.push({
  name: 'bolt-enemy',
  kind: 'image',
  size: [64, 128],
  frames: 4, loop: true,
  aa: 3,
  glsl: `
vec4 image(vec2 fc){
  vec2 p = (fc - vec2(uRes.x * .5, uRes.y * .28)) / uRes.x;
  float t = uPhase * 6.2831;
  // hot plasma ball at the bottom (leading end) with a writhing tail above it
  float ball = length(p * vec2(1., .9)) - .10;
  float tailY = clamp(p.y, 0., 1.2);
  float wob = sin(p.y * 14. - t * 2.) * .05 * smoothstep(0., .6, p.y) + sin(p.y * 23. + t * 3.) * .012 * smoothstep(0., .4, p.y);
  float tail = abs(p.x - wob) - mix(.08, .0, smoothstep(.0, 1.1, p.y));
  float n = fbm(vec3(p * 9., uPhase * 3.)) ;
  float dist = smin(ball, max(tail, -p.y), .05) + (n - .5) * .04;
  float body = smoothstep(.02, -.03, dist);
  float glow = exp(-max(dist, 0.) / .06);
  float hot = smoothstep(.0, -.09, ball);
  vec3 col = vec3(1., .20, .06) * glow * 1.4 + vec3(1., .55, .2) * body * 2.5 + vec3(1., .95, .8) * hot * 4.;
  float a = clamp(glow * .9 + body, 0., 1.);
  return vec4(col, a);
}
`,
});

ASSETS.push({
  name: 'flare',
  kind: 'image',
  size: [128, 128],
  aa: 2,
  glsl: `
vec4 image(vec2 fc){
  vec2 p = (fc - uRes * .5) / uRes.x * 2.;
  float r = length(p);
  float core = exp(-r * r / .004);
  float glow = exp(-r / .12) * .8;
  // four-point lens streaks
  float streak = (exp(-abs(p.y) / .012) * exp(-abs(p.x) / .35) + exp(-abs(p.x) / .012) * exp(-abs(p.y) / .35) * .6);
  float i = core * 4. + glow + streak * .9;
  vec3 col = mix(vec3(.5, .75, 1.), vec3(1.), clamp(core + streak * .3, 0., 1.)) * i;
  return vec4(col, clamp(i, 0., 1.) * smoothstep(1., .7, r));
}
`,
});

ASSETS.push({
  name: 'explosion',
  kind: 'image',
  size: [192, 192],
  frames: 16, cols: 4,
  phases: [0, .03, .06, .1, .14, .19, .25, .31, .38, .45, .53, .61, .69, .77, .85, .93],
  aa: 2,
  glsl: `
vec3 fireColor(float x){
  // approximate black-body ramp: deep red, orange, yellow, white
  vec3 c = mix(vec3(.25, .02, .0), vec3(1., .30, .03), smoothstep(.0, .35, x));
  c = mix(c, vec3(1., .72, .25), smoothstep(.35, .7, x));
  c = mix(c, vec3(1., .97, .88), smoothstep(.7, 1., x));
  return c;
}
float density(vec3 p, float R, float t, out float core){
  vec3 q = p / R;
  // domain-warped billows
  vec3 w = vec3(fbm(q * 1.8 + 11.), fbm(q * 1.8 + 23.), fbm(q * 1.8 + 37.)) - .5;
  vec3 qq = q + w * .9 + vec3(0., 0., t);
  float n = fbm(qq * 2.4);
  float b = 1. - abs(fbm(qq * 5.3 + 7.) * 2. - 1.);           // billow ridges
  float shape = 1. - length(q) * (1. + .15 * t) + (n - .5) * 1.2 + (b - .5) * .35;
  // the fireball hollows out into a smoke ring as it cools
  shape -= smoothstep(.4, 1., t) * smoothstep(.7, .0, length(q)) * .8;
  core = shape;
  return clamp(shape * 4., 0., 1.);
}
vec4 image(vec2 fc){
  vec2 uv = (2. * fc - uRes) / uRes.y;            // [-1,1]
  float t = uPhase;
  float R = mix(.22, .78, 1. - pow(1. - t, 2.6));  // fast expansion that slows down
  float heat = pow(1. - t, 1.3);
  vec3 col = vec3(0); float T = 1.;
  const int STEPS = 48;
  float ds = 2.4 / float(STEPS);
  vec3 L = normalize(vec3(-.5, .6, .6));
  for (int i = 0; i < STEPS; i++){
    vec3 p = vec3(uv, 1.2 - float(i) * ds);
    if (length(p) > R * 1.6) continue;
    float core;
    float dens = density(p, R, t, core);
    if (dens <= 0.) continue;
    // cool, sooty outer layers; the hot interior only shows through gaps
    float temp = clamp((core * 1.7 - .1) * heat * 1.3, 0., 1.);
    vec3 emit = fireColor(temp) * pow(temp, 2.2) * 5.;
    float c2; float occl = density(p + L * .12, R, t, c2);
    vec3 smoke = vec3(.07, .06, .055) * mix(1.3, .25, occl) + fireColor(.3) * .12 * heat;
    float absorb = dens * ds * 9.;
    col += T * (emit + smoke) * absorb;
    T *= exp(-absorb);
    if (T < .01) break;
  }
  // initial flash
  float flash = exp(-t * 16.) * exp(-dot(uv, uv) / .08) * 2.5;
  col += vec3(1., .85, .6) * flash;
  // embers thrown outward
  float emb = 0.;
  for (int k = 0; k < 10; k++){
    float fk = float(k);
    float a = hash12(vec2(fk, 3.)) * 6.2831;
    float sp = .55 + .5 * hash12(vec2(fk, 7.));
    vec2 dir = vec2(cos(a), sin(a));
    float head = sp * (1. - pow(1. - t, 2.5)) * 1.0;
    float along = dot(uv, dir);
    float perp = abs(dot(uv, vec2(-dir.y, dir.x)));
    float seg = smoothstep(head - .07, head, along) * step(along, head + .01);
    emb += seg * exp(-perp * perp / .0003) * smoothstep(.75, .3, t) * smoothstep(.02, .1, t);
  }
  col += vec3(1., .5, .15) * emb * 2.5;
  float fade = smoothstep(1., .7, t);
  return vec4(col, clamp(1. - T + flash * .4 + emb * .8, 0., 1.)) * fade;
}
`,
});

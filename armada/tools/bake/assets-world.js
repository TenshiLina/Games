// Mothership (the bonus "mystery ship") and the asteroid shields.
ASSETS.push({
  name: 'mothership',
  size: [320, 320],
  extent: 1.05,
  frames: 2, phases: [0, 1],
  bloom: [[3, 0.9], [10, 0.7], [26, 0.45]],
  glsl: `
vec2 polar(vec2 p, float n, out float idx){
  float a = atan(p.y, p.x), sec = 6.2831 / n;
  idx = floor((a + sec * .5) / sec);
  a -= idx * sec;
  return length(p) * vec2(cos(a), sin(a));
}
vec2 mapScene(vec3 p){
  float r = length(p.xy);
  // lens-shaped hull with a stepped upper deck
  float hull = sdEllipsoid(p, vec3(1., 1., .15));
  hull = smin(hull, sdEllipsoid(p - vec3(0, 0, .06), vec3(.66, .66, .14)), .04);
  // radial armour ribs
  float idx;
  vec2 pp = polar(p.xy, 16., idx);
  float rib = sdRoundBox(vec3(pp.x - .72, pp.y, p.z - .05), vec3(.22, .018, .05), .01);
  hull = smin(hull, rib, .02);
  // weapon pods between the ribs
  vec2 pw = polar(p.xy * rot(3.14159 / 8.), 8., idx);
  float pod = sdRoundBox(vec3(pw.x - .56, pw.y, p.z - .12), vec3(.06, .045, .035), .02);
  hull = min(hull, pod);
  // outer rim ring
  float rim = sdTorus(p, vec2(.97, .045));
  vec2 res = vec2(hull, 1.);
  res = opU(res, vec2(rim, 2.));
  // rim lights (they chase round between the two frames)
  vec2 pl = polar(p.xy * rot(uPhase * 3.14159 / 12.), 12., idx);
  res = opU(res, vec2(sdSphere(vec3(pl.x - .985, pl.y, p.z), .035), 4.));
  // central bridge dome and its collar
  res = opU(res, vec2(sdSphere(p - vec3(0, 0, -.06), .30), 3.));
  res = opU(res, vec2(sdTorus(p - vec3(0, 0, .12), vec2(.31, .035)), 2.));
  return res;
}
Mat material(float id, vec3 p, vec3 n){
  float r = length(p.xy);
  float a = atan(p.y, p.x);
  float g = fbm(p * 12.);
  if (id < 1.5){
    // dark alien alloy in radial sectors of plating
    vec2 pn = panels(vec2(a * 1.2, r * 1.6), vec2(.5, .2));
    vec3 base = mix(vec3(.10, .10, .11), vec3(.17, .16, .16), pn.y) * (.7 + .6 * g);
    base = mix(base, vec3(.20, .12, .10), smoothstep(.55, .8, fbm(p * 5.)) * .6); // oxidised patches
    base *= mix(.3, 1., smoothstep(.0, .012, pn.x));
    // glowing trench between the upper deck and the outer hull
    float trench = smoothstep(.016, .0, abs(r - .69));
    // heat vents at the rib ends
    float sec = 6.2831 / 16.;
    float ar = mod(a + sec * .5, sec) - sec * .5;
    float vent = smoothstep(.02, .0, abs(ar * r)) * smoothstep(.02, .0, abs(r - .93));
    vec3 e = vec3(1., .22, .1) * (trench * 1.0 + vent * 2.5) * mix(.8, 1.1, uPhase);
    e += vec3(1., .25, .15) * smoothstep(.86, .99, r) * smoothstep(.02, -.06, p.z) * 1.5;
    return Mat(base, .7, .42 + .2 * g, e);
  }
  if (id < 2.5) return Mat(vec3(.42, .43, .45) * (.8 + .3 * g), 1., .3, vec3(0));
  if (id < 3.5){
    // smoked glass dome over a honeycomb of lit bridge windows
    vec2 h = p.xy * 18.;
    vec2 hc = floor(h); float lit = step(.55, hash12(hc)) * smoothstep(.45, .3, length(fract(h) - .5));
    vec3 inner = vec3(1., .35, .18) * lit * smoothstep(.1, .8, n.z) * 1.4;
    return Mat(vec3(.02, .02, .025), .0, .06, inner * mix(.8, 1.1, uPhase));
  }
  return Mat(vec3(.1), 0., .3, vec3(1., .3, .18) * 6.);
}
`,
});

ASSETS.push({
  name: 'asteroid',
  size: [256, 192],
  extent: .75,
  frames: 4, cols: 4,
  phases: [0, .25, .5, .75],
  glsl: `
vec2 mapScene(vec3 p){
  float seed = uPhase * 40.;
  // squat rock, wider than tall, like the arcade bunkers
  float d = sdEllipsoid(p, vec3(.76, .48, .34));
  d += (fbm(p * 2.2 + seed) - .5) * .42;
  d += (fbm(p * 7. + seed * 2.) - .5) * .10;
  // craters
  for (int i = 0; i < 5; i++){
    vec3 c = (hash33(vec3(float(i), seed, 3.)) - .5) * vec3(1.4, .8, .1) + vec3(0, 0, .34);
    float cr = .06 + .10 * hash13(vec3(float(i), seed, 7.));
    float bowl = length(p - c) - cr;
    d = smax(d, -bowl, .05);
  }
  return vec2(d * .6, 1.);
}
Mat material(float id, vec3 p, vec3 n){
  float seed = uPhase * 40.;
  float g = fbm(p * 9. + seed);
  float fine = noise(p * 60.);
  vec3 base = mix(vec3(.13, .12, .11), vec3(.26, .23, .20), g) * (.8 + .4 * fine);
  // darker carbonaceous veins and bright ice/metal flecks
  base *= mix(.55, 1., smoothstep(.02, .07, abs(fbm(p * 4. + seed + 9.) - .5)));
  float fleck = step(.965, noise(p * 90. + seed));
  return Mat(mix(base, vec3(.75, .8, .85), fleck), fleck * .9, mix(.85, .25, fleck), vec3(0));
}
`,
});

// Armoured orbital bunker. Seen from above, its footprint is the arcade
// bunker's arch: chamfered top corners and a notch in the bottom edge.
ASSETS.push({
  name: 'bunker',
  size: [352, 256],
  extent: .78,
  bloom: [[3, 0.8], [9, 0.5]],
  glsl: `
float arch(vec2 p, float inset){
  float d = sdBox(vec3(p, 0), vec3(1. - inset, .70 - inset, 1.));
  d = max(d, (abs(p.x) + p.y - (1.70 - .38 - inset * .6)) * .7071);   // top chamfers
  float notch = max(abs(p.x) - (.42 + inset), p.y - (-.70 + .40 + inset));
  notch = max(notch, (abs(p.x) + p.y - (.42 - .70 + .40 - .14 + inset * 1.4)) * .7071);
  return max(d, -notch);
}
float slab(vec3 p, float d2, float h, float r){
  vec2 w = vec2(d2 + r, abs(p.z) - h + r);
  return min(max(w.x, w.y), 0.) + length(max(w, 0.)) - r;
}
vec2 mapScene(vec3 p){
  vec2 res = vec2(slab(p - vec3(0, 0, -.06), arch(p.xy, 0.), .16, .035), 1.);
  // raised upper armour plate
  res = opU(res, vec2(slab(p - vec3(0, 0, .08), arch(p.xy, .11), .07, .03), 2.));
  // low hatches with vent slats, and a row of status lights
  vec3 q = p; q.x = abs(q.x);
  float hatch = sdRoundBox(q - vec3(.52, .22, .15), vec3(.16, .11, .03), .02);
  vec3 sl = q - vec3(.52, .22, .18); sl.y = mod(sl.y + .02, .04) - .02;
  hatch = max(hatch, -max(sdBox(sl, vec3(.12, .008, .02)), abs(q.y - .22) - .08));
  res = opU(res, vec2(hatch, 3.));
  vec3 lp = p - vec3(0, .42, .15); lp.x = mod(lp.x + .06, .12) - .06;
  res = opU(res, vec2(max(sdSphere(lp, .022), abs(p.x) - .2), 4.));
  return res;
}
Mat material(float id, vec3 p, vec3 n){
  float g = fbm(p * 14.);
  float st = fbm(vec3(p.x * 30., p.y * 3., 1.));
  vec3 q = p; q.x = abs(q.x);
  if (id < 2.5){
    vec2 pn = panels(p.xy + .3, vec2(.30, .22));
    vec3 base = mix(vec3(.065, .07, .065), vec3(.10, .105, .095), pn.y) * (.75 + .45 * g);
    if (id > 1.5) base *= 1.1;
    base *= mix(1., .7, smoothstep(.5, .8, st));                // grime streaks
    base *= mix(.35, 1., smoothstep(.0, .008, pn.x));
    // hazard chevrons on the side walls and around the notch
    float wall = 1. - abs(n.z);
    float chev = step(.5, fract((p.x + p.y) * 7.));
    if (id < 1.5 && wall > .5) base = mix(vec3(.03), vec3(.55, .38, .04), chev) * (.7 + .4 * g);
    return Mat(base, .35, .5 + .2 * g, vec3(0));
  }
  if (id < 3.5) return Mat(vec3(.09, .095, .10) * (.8 + .4 * g), .85, .38, vec3(0));
  return Mat(vec3(.02), 0., .1, vec3(.2, 1., .4) * .9);
}
`,
});

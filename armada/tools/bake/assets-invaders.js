// The three invader classes, a nod to the arcade squid, crab and octopus:
// biomechanical craft with iridescent chitin armour and glowing veins.
// Each bakes two animation frames (limbs in two poses, veins pulsing).
(function () {
  const common = `
// Glossy organic armour: saturated tint, thin-film sheen at grazing angles.
Mat chitin(vec3 p, vec3 n, vec3 tint){
  float NoV = abs(dot(n, normalize(uCamDir)));
  float g = fbm(p * 16.);
  vec3 irid = .5 + .5 * cos(6.2831 * (NoV * 1.1 + vec3(0., .33, .67) + fbm(p * 4.) * .7));
  vec3 base = tint * (.22 + .5 * g) * (.8 + .4 * fbm(p * 5. + 2.));
  base = mix(base, irid * .35, pow(1. - NoV, 2.) * .8);
  return Mat(base, .25, .2 + .16 * g, vec3(0));
}
// thin organic light channels (sparse ridges of low-frequency noise)
float channels(vec3 p, float scale, float width){
  float v = abs(fbm(p * scale + 4.) - .5);
  return smoothstep(width, width * .3, v);
}
// bioluminescent spots on a jittered grid
float photophores(vec2 p, float cell, float r){
  vec2 c = floor(p / cell); vec2 f = p / cell - c;
  vec2 o = .25 + .5 * hash22(c);
  float keep = step(.45, hash12(c + 9.));
  return keep * smoothstep(r, r * .3, length(f - o) * cell);
}
// fine organic surface relief, added to SDF distances
float bumps(vec3 p, float amt){ return (noise(p * 26.) * .6 + noise(p * 63.) * .4 - .5) * amt; }
float pulse(){ return mix(.6, 1.1, uPhase); }
// Glossy eye: a hot pupil and glowing iris on the side that faces the viewer.
Mat eye(vec3 n, vec3 glow){
  float k = dot(n, normalize(-normalize(uCamDir) + vec3(0, -.35, 0)));
  vec3 e = glow * 1.6 * smoothstep(.35, .75, k) + vec3(1., .95, .9) * 2.2 * smoothstep(.88, .97, k);
  return Mat(vec3(.01), 0., .04, e * mix(.8, 1.15, uPhase));
}
`;

  ASSETS.push({
    name: 'invader-octopus',
    size: [256, 256], frames: 2, phases: [0, 1],
    extent: 1.0,
    bloom: [[3, 0.8], [10, 0.6], [22, 0.35]],
    glsl: common + `
const vec3 GLOW = vec3(.35, 1., .45);
vec2 mapScene(vec3 p){
  // dome body
  float body = sdEllipsoid(p - vec3(0, .05, .0), vec3(.42, .38, .26));
  body = smin(body, sdEllipsoid(p - vec3(0, .02, -.08), vec3(.52, .48, .10)), .08); // skirt
  // armour ridges across the dome
  float rid = abs(sin(atan(p.y - .05, p.x) * 6.)) * .012;
  body += rid * smoothstep(.0, .2, p.z);
  // brain crest
  body = smin(body, sdEllipsoid(p - vec3(0, .14, .2), vec3(.16, .22, .10)), .06);
  body += bumps(p, .018);
  vec2 res = vec2(body, 1.);
  // tentacle legs by polar repetition, each curling with the pose
  float N = 8.;
  float ang = atan(p.y - .02, p.x);
  float sec = 6.2831 / N;
  float idx = floor((ang + sec * .5) / sec);
  float a = ang - idx * sec;
  float r = length(p.xy - vec2(0, .02));
  vec3 lp = vec3(r * cos(a), r * sin(a), p.z);
  float curl = (mod(idx, 2.) == 0. ? 1. : -1.) * mix(-.6, 1., uPhase);
  vec3 A = vec3(.36, 0, -.06), B = vec3(.58, .05 * curl, -.14), C = vec3(.78, .15 * curl, -.24), D = vec3(.90, .30 * curl, -.34);
  float leg = sdRoundCone(lp, A, B, .075, .052);
  leg = smin(leg, sdRoundCone(lp, B, C, .052, .034), .02);
  leg = smin(leg, sdRoundCone(lp, C, D, .034, .012), .015);
  res = opU(res, vec2(leg + bumps(p, .01), 3.));
  // three eyes on the front face
  vec3 q = p; q.x = abs(q.x);
  res = opU(res, vec2(sdSphere(q - vec3(.0, -.30, .07), .075), 2.));
  res = opU(res, vec2(sdSphere(q - vec3(.17, -.26, .05), .05), 2.1));
  return res;
}
Mat material(float id, vec3 p, vec3 n){
  vec3 q = p; q.x = abs(q.x);
  if (id < 1.5){
    Mat m = chitin(p, n, vec3(.10, .30, .20));
    // glowing seams between the dome's armour ridges, and a ring under the skirt
    float ang = atan(p.y - .05, p.x);
    float seam = smoothstep(.10, .0, abs(sin(ang * 6.))) * smoothstep(.05, .2, p.z);
    float ring = smoothstep(.02, .0, abs(length((p.xy - vec2(0, .02)) / vec2(.52, .48)) - .93)) * smoothstep(0., -.1, p.z);
    m.albedo *= 1. - .5 * seam;
    m.emit = GLOW * (seam * .45 + ring * .8 + photophores(p.xy, .11, .014) * 1.1 * smoothstep(-.02, .1, p.z)) * pulse();
    return m;
  }
  if (id < 2.5) return eye(n, GLOW);
  Mat m = chitin(p, n, vec3(.08, .22, .15));
  float r = length(p.xy);
  float band = abs(fract(r * 16.) - .5) * 2.;
  m.albedo *= .6 + .4 * smoothstep(.2, .6, band);
  // suckers glow faintly along the tentacles
  m.emit = GLOW * smoothstep(.15, .0, band) * smoothstep(.95, .45, r) * .5 * pulse();
  return m;
}
`,
  });

  ASSETS.push({
    name: 'invader-crab',
    size: [256, 256], frames: 2, phases: [0, 1],
    extent: 1.0,
    bloom: [[3, 0.8], [10, 0.6], [22, 0.35]],
    glsl: common + `
const vec3 GLOW = vec3(1., .42, .10);
vec2 mapScene(vec3 p){
  vec3 q = p; q.x = abs(q.x);
  // wide carapace: domed shell, central keel, spiked flanks
  float body = sdEllipsoid(p - vec3(0, .10, 0), vec3(.46, .32, .16));
  body = smin(body, sdEllipsoid(p - vec3(0, .12, .09), vec3(.07, .28, .09)), .05);
  float spikes = sdRoundCone(q, vec3(.38, .0, .0), vec3(.56, -.06, -.01), .05, .01);
  spikes = min(spikes, sdRoundCone(q, vec3(.40, .16, .0), vec3(.58, .18, -.01), .045, .01));
  body = smin(body, spikes, .035);
  // front rim notched between the eyes
  body = smax(body, -sdEllipsoid(p - vec3(0, -.26, .08), vec3(.10, .06, .12)), .03);
  body += bumps(p, .016);
  vec2 res = vec2(body, 1.);
  // three walking legs per side, reaching sideways; they shuffle between frames
  float legs = 1e9;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float sw = (mod(fi, 2.) == 0. ? 1. : -1.) * (uPhase - .5) * .10;
    vec3 a = vec3(.34, .04 + fi * .14, -.03);
    vec3 b = vec3(.66, .04 + fi * .20 + sw, .06);
    vec3 c = vec3(.86, .12 + fi * .24 + sw * 1.6, -.14);
    legs = min(legs, sdRoundCone(q, a, b, .045, .034));
    legs = min(legs, sdRoundCone(q, b, c, .034, .010));
  }
  res = opU(res, vec2(legs, 3.));
  // heavy claws held forward; frame 0 open, frame 1 snapped shut
  vec3 sh = vec3(.26, -.14, 0), el = vec3(.46, -.30, .02);
  float arm = sdRoundCone(q, sh, el, .065, .05);
  vec3 hp = q - vec3(.40, -.50, .02); hp.xy = rot(-.35) * hp.xy;
  float hand = sdEllipsoid(hp, vec3(.11, .16, .075));
  arm = smin(arm, hand, .05);
  float open = mix(.45, .06, uPhase);
  vec3 tip = vec3(.36, -.64, .02);
  vec3 f1 = q - tip; f1.xy = rot(-.25) * f1.xy;
  float fixedF = sdRoundCone(f1, vec3(0), vec3(-.06, -.22, 0), .065, .012);
  vec3 f2 = q - (tip + vec3(-.07, .0, 0)); f2.xy = rot(-.6 - open) * f2.xy;
  float moveF = sdRoundCone(f2, vec3(0), vec3(.0, -.20, 0), .05, .01);
  res = opU(res, vec2(smin(arm, min(fixedF, moveF), .025) + bumps(p, .014), 3.5));
  // eyes on short stalks
  res = opU(res, vec2(sdCapsule(q, vec3(.11, -.16, .08), vec3(.14, -.26, .13), .024), 3.));
  res = opU(res, vec2(sdSphere(q - vec3(.145, -.28, .14), .046), 2.));
  return res;
}
Mat material(float id, vec3 p, vec3 n){
  vec3 q = p; q.x = abs(q.x);
  if (id < 1.5){
    Mat m = chitin(p, n, vec3(.42, .12, .06));
    // plated shell segments with light leaking from the seams
    float seg = abs(fract((p.y + .02) * 6.) - .5);
    float seam = smoothstep(.06, .0, seg) * smoothstep(.0, .06, p.z);
    m.albedo *= .55 + .45 * smoothstep(.0, .14, seg);
    m.emit = GLOW * (seam * .5 + photophores(p.xy, .13, .012) * .9) * pulse();
    return m;
  }
  if (id < 2.5) return eye(n, GLOW);
  Mat m = chitin(p, n, vec3(.36, .10, .05));
  float rings = abs(fract(length(q.xy) * 14.) - .5) * 2.;
  m.albedo *= .65 + .35 * smoothstep(.1, .4, rings);
  m.emit = GLOW * smoothstep(.12, .0, rings) * .35 * pulse();
  if (id > 3.25) m.albedo *= mix(1., .4, smoothstep(-.55, -.75, p.y)); // dark claw tips
  return m;
}
`,
  });

  ASSETS.push({
    name: 'invader-squid',
    size: [256, 256], frames: 2, phases: [0, 1],
    extent: 1.0,
    bloom: [[3, 0.8], [10, 0.6], [22, 0.35]],
    glsl: common + `
const vec3 GLOW = vec3(.80, .30, 1.);
vec2 mapScene(vec3 p){
  vec3 q = p; q.x = abs(q.x);
  // mantle pointing up the screen with a diamond fin at its tip
  vec3 mp = p; mp.z *= 1.4;
  float mantle = sdRoundCone(mp, vec3(0, -.05, 0), vec3(0, .74, 0), .24, .03);
  vec3 fp = p - vec3(0, .52, -.02); fp.y *= .75; fp.xy = rot(.785) * fp.xy;
  float fin = sdRoundBox(fp, vec3(.17, .17, .018), .015);
  mantle = smin(mantle, fin, .06);
  float head = sdEllipsoid(p - vec3(0, -.20, 0), vec3(.21, .16, .14));
  vec2 res = vec2(smin(mantle, head, .08) + bumps(p, .012), 1.);
  res = opU(res, vec2(sdSphere(q - vec3(.155, -.25, .05), .068), 2.));
  // six tentacles trailing toward the player, waving between frames
  float t = 1e9;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float x0 = (fi - 2.5) * .06;
    float sp = mix(1.0, 1.7, uPhase);
    float w = sin(fi * 2.1 + uPhase * 3.14159) * .06;
    vec3 a = vec3(x0, -.30, -.02);
    vec3 b = vec3(x0 * 1.3 * sp + w, -.52, -.06);
    vec3 c = vec3(x0 * 1.7 * sp - w, -.74, -.10);
    vec3 d = vec3(x0 * 2.1 * sp + w * 1.5, -.92, -.14);
    float ti = sdRoundCone(p, a, b, .042, .032);
    ti = smin(ti, sdRoundCone(p, b, c, .032, .022), .015);
    ti = smin(ti, sdRoundCone(p, c, d, .022, .008), .012);
    t = min(t, ti);
  }
  res = opU(res, vec2(t, 3.));
  return res;
}
Mat material(float id, vec3 p, vec3 n){
  vec3 q = p; q.x = abs(q.x);
  if (id < 1.5){
    Mat m = chitin(p, n, vec3(.28, .08, .36));
    float spots = smoothstep(.55, .75, noise(p * 34.));
    m.albedo *= .75 + .5 * spots;
    // two rows of photophores down the mantle
    float row = smoothstep(.02, .0, abs(q.x - .09 - .05 * (p.y + .1))) * step(-.1, p.y) * step(p.y, .55);
    float dots = smoothstep(.35, .15, abs(fract(p.y * 14.) - .5));
    m.emit = GLOW * (row * dots * 1.6 + photophores(q.xy + vec2(.03, 0.), .09, .01) * .8) * pulse();
    return m;
  }
  if (id < 2.5) return eye(n, GLOW);
  Mat m = chitin(p, n, vec3(.22, .06, .30));
  float band = abs(fract(p.y * 24.) - .5) * 2.;
  m.albedo *= .7 + .3 * smoothstep(.2, .6, band);
  m.emit = GLOW * smoothstep(.15, .0, band) * .4 * pulse() * smoothstep(-.95, -.4, p.y);
  return m;
}
`,
  });
})();

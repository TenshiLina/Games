// Player interceptor: white ceramic-armoured delta fighter, twin ion engines.
ASSETS.push({
  name: 'player',
  size: [256, 256],
  extent: 1.0,
  bloom: [[3, 0.9], [10, 0.7], [24, 0.45]],
  glsl: `
float wingSDF(vec3 p){
  float ax = abs(p.x);
  float lead = (p.y - (.30 - .78 * ax)) * .79;
  float trail = -(p.y + .50 - .10 * ax);
  float d = max(max(ax - .80, lead), trail);
  d = max(d, abs(p.z + .015 + .03 * ax) - (.034 - .024 * ax));
  return d - .004;
}
vec2 mapScene(vec3 p){
  vec3 q = p; q.x = abs(q.x);
  // fuselage: tapered body, flattened vertically, with a raised spine
  vec3 fp = p; fp.z *= 1.45;
  float body = sdRoundCone(fp, vec3(0, -.58, 0), vec3(0, .86, -.02), .17, .018);
  body = smin(body, sdEllipsoid(p - vec3(0, -.2, .04), vec3(.10, .45, .09)), .05);
  float intake = sdRoundBox(q - vec3(.14, .05, -.005), vec3(.045, .16, .04), .02);
  body = smin(body, intake, .04);
  // cooling vents cut into the spine
  vec3 vp = p - vec3(0, -.34, .125); vp.y = mod(vp.y + .02, .04) - .02;
  body = max(body, -max(sdBox(vp, vec3(.045, .008, .02)), abs(p.y + .34) - .09));
  vec2 res = vec2(body, 1.);
  res = opU(res, vec2(wingSDF(p), 1.5));
  // engine nacelles
  float nac = sdRoundCone(q, vec3(.21, -.66, -.01), vec3(.21, -.05, -.01), .088, .06);
  res = opU(res, vec2(nac, 2.));
  float bell = max(sdCylY(q - vec3(.21, -.70, -.01), .085, .05), -sdCylY(q - vec3(.21, -.74, -.01), .066, .06));
  res = opU(res, vec2(bell, 5.));
  res = opU(res, vec2(sdCylY(q - vec3(.21, -.70, -.01), .064, .02), 4.));
  // canopy glass and its frame
  float can = sdEllipsoid(p - vec3(0, .30, .085), vec3(.06, .19, .06));
  res = opU(res, vec2(can, 3.));
  float frame = max(abs(sdEllipsoid(p - vec3(0, .30, .085), vec3(.063, .193, .063))) - .006, abs(p.y - .22) - .008);
  res = opU(res, vec2(frame, 6.));
  // twin tail fins, canted outward
  vec3 fq = q - vec3(.24, -.50, .07); fq.xz = rot(-.45) * fq.xz;
  float fin = sdRoundBox(fq, vec3(.008, .12, .09), .006);
  fin = max(fin, (fq.y - .08 + fq.z * 1.2) * .7);
  res = opU(res, vec2(fin, 1.));
  // short wingtip cannons
  float gun = sdCapsule(q, vec3(.77, -.34, -.03), vec3(.77, .06, -.03), .026);
  gun = min(gun, sdCapsule(q, vec3(.77, .0, -.03), vec3(.77, .13, -.03), .011));
  res = opU(res, vec2(gun, 6.));
  // missiles slung under the wing, noses behind the leading edge
  float mis = sdCapsule(q, vec3(.50, -.30, -.07), vec3(.50, -.02, -.07), .024);
  res = opU(res, vec2(mis, 7.));
  // RCS thruster blocks near the nose
  res = opU(res, vec2(sdRoundBox(q - vec3(.075, .52, .0), vec3(.018, .03, .02), .006), 6.));
  return res;
}
Mat material(float id, vec3 p, vec3 n){
  vec3 q = p; q.x = abs(q.x);
  float grime = fbm(p * 14.);
  float st = streaks(p);
  if (id < 1.75){
    vec2 pn = panels(p.xy + vec2(.0, .013), vec2(.18, .15));
    // off-white armour with per-panel tone variation and flow streaks
    vec3 base = mix(vec3(.80, .80, .78), vec3(.70, .72, .74), pn.y) * (.9 + .16 * grime);
    base *= mix(1., .78, smoothstep(.45, .75, st));
    float rough = .38 + .18 * grime + .1 * pn.y;
    bool wing = id > 1.25;
    if (wing && q.x > .47 && q.x < .54) base = vec3(.80, .28, .06) * (.9 + .2 * grime);
    if (wing && q.x > .56 && q.x < .575) base = vec3(.80, .28, .06) * (.9 + .2 * grime);
    if (!wing && p.y > .44 && p.y < .64 && p.z > .02) base = vec3(.05, .055, .06);
    // leading-edge wear and scorching around the exhausts
    if (wing) base *= mix(.5, 1., smoothstep(0., .05, (.30 - .78 * q.x) - p.y - .02));
    base *= mix(.45, 1., smoothstep(-.8, -.45, p.y) * .5 + .5 * smoothstep(.3, .18, abs(q.x - .21) + .5 * (p.y + .6)));
    // squadron roundel
    float rd = length(vec2(q.x - .66, p.y + .24));
    if (wing && rd < .042) base = vec3(.08, .2, .62);
    if (wing && rd < .018) base = vec3(.85);
    base *= mix(.3, 1., smoothstep(.0, .005, pn.x));
    return Mat(base, .05, rough, vec3(0));
  }
  if (id < 2.5){
    vec3 base = vec3(.42, .43, .45) * (.8 + .3 * grime);
    float ring = smoothstep(.0, .004, abs(fract(p.y * 11.) - .5) * .09 - .002);
    // heat-blued titanium toward the exhaust
    base = mix(base, vec3(.28, .25, .42), smoothstep(-.4, -.66, p.y) * .6);
    return Mat(base * mix(.5, 1., ring), .95, .3 + .2 * grime, vec3(0));
  }
  if (id < 3.5){
    // tinted canopy with a gold-film sheen toward the rim
    float rim = 1. - abs(n.z);
    return Mat(mix(vec3(.02, .05, .09), vec3(.35, .25, .08), rim * .6), rim * .5, .05, vec3(0));
  }
  if (id < 4.5){
    float r = length(vec2(q.x - .21, p.z + .01)) / .064;
    vec3 hot = mix(vec3(1.), vec3(.25, .65, 1.), smoothstep(.1, .95, r));
    return Mat(vec3(.1), 0., .5, hot * 7.);
  }
  if (id < 5.5){
    float heat = smoothstep(-.66, -.75, p.y);
    return Mat(mix(vec3(.25, .24, .23), vec3(.12, .1, .12), heat), .9, .45, vec3(.2, .45, 1.) * heat * .6);
  }
  if (id < 6.5) return Mat(vec3(.16, .17, .19) * (.8 + .4 * grime), .9, .38, vec3(0));
  // missiles: pale body, dark seeker head, red band
  vec3 mc = vec3(.62, .62, .58);
  if (p.y > -.07) mc = vec3(.05);
  else if (p.y > -.1) mc = vec3(.7, .08, .05);
  return Mat(mc, .2, .45, vec3(0));
}
`,
});

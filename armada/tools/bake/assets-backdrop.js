// Backdrop layers: a deep-space starfield with nebula, and the planet the
// player defends, seen from orbit at the bottom of the screen.
(function () {
  const stars = `
vec3 starColor(float h){
  // spread of stellar colours, weighted toward white
  vec3 c = mix(vec3(1., .72, .45), vec3(1., .95, .88), smoothstep(.0, .35, h));
  return mix(c, vec3(.7, .82, 1.), smoothstep(.55, 1., h));
}
// one star per grid cell; returns light (not premultiplied)
vec3 starLayer(vec2 px, float cell, float density, float bright, float sigma){
  vec3 acc = vec3(0);
  vec2 c0 = floor(px / cell);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 c = c0 + vec2(i, j);
    if (hash12(c + 17.) > density) continue;
    vec2 sp = (c + hash22(c)) * cell;
    float d2 = dot(px - sp, px - sp);
    float b = pow(hash12(c + 5.3), 6.) * bright + bright * .04;
    acc += starColor(hash12(c + 9.1)) * b * exp(-d2 / (2. * sigma * sigma));
  }
  return acc;
}
`;

  ASSETS.push({
    name: 'bg-space',
    kind: 'image',
    format: 'jpg',
    size: [2048, 2048],
    aa: 1,
    strip: 32,
    glsl: stars + `
vec4 image(vec2 fc){
  vec2 uv = fc / uRes.y;          // 0..1
  vec2 c = uv - .5;
  // galactic band running diagonally
  float band = exp(-pow(dot(c, normalize(vec2(.55, -1.))) * 2.6 + .1, 2.));
  // domain-warped gas
  vec2 q = uv * 3.;
  vec2 w = vec2(fbm2(q + 1.3, 6), fbm2(q + 7.9, 6));
  float gas = fbm2(q + w * 2.2, 8);
  float gas2 = fbm2(q * 1.7 - w * 1.5 + 4., 8);
  vec3 col = vec3(.004, .005, .01);
  // hydrogen-alpha reds and oxygen teals, kept dim so sprites stay readable
  col += vec3(.42, .10, .14) * pow(smoothstep(.38, .9, gas), 2.) * .12 * (.35 + band);
  col += vec3(.07, .24, .38) * pow(smoothstep(.4, .95, gas2), 2.) * .16 * (.3 + band);
  col += vec3(.35, .30, .38) * band * .045 * fbm2(uv * 18., 5);
  // dark dust lanes
  float dust = smoothstep(.45, .75, fbm2(uv * 5. + w, 7));
  col *= 1. - .75 * dust * band;
  // stars: faint dense field (thicker in the band), mid stars, rare bright ones
  vec2 px = fc;
  vec3 s = starLayer(px, 8., .30 + .45 * band, .55, .55);
  s += starLayer(px + 331., 26., .5, 1.8, .7);
  s += starLayer(px + 911., 110., .5, 6., .9);
  s *= 1. - .6 * dust * band;
  col += s;
  // a few very bright stars with diffraction spikes and halos
  vec2 cell = floor(px / 380.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 cc = cell + vec2(i, j);
    if (hash12(cc + 51.) > .28) continue;
    vec2 sp = (cc + .15 + .7 * hash22(cc + 3.)) * 380.;
    vec2 d = px - sp;
    float b = .5 + 1.5 * hash12(cc + 8.);
    vec3 sc = starColor(hash12(cc + 2.));
    float r = length(d);
    float spikes = (exp(-abs(d.y) / .8) * exp(-abs(d.x) / 16.) + exp(-abs(d.x) / .8) * exp(-abs(d.y) / 16.));
    col += sc * b * (exp(-r * r / 3.) * 5. + exp(-r / 6.) * .35 + spikes * .5);
  }
  return vec4(col, 1.);
}
`,
  });

  ASSETS.push({
    name: 'bg-planet',
    kind: 'image',
    size: [2048, 448],
    aa: 2,
    strip: 32,
    glsl: `
vec4 image(vec2 fc){
  // units: 1 = layer height; x centred
  vec2 p = vec2((fc.x - uRes.x * .5) / uRes.y, fc.y / uRes.y);
  float R = 7.;
  vec2 C = vec2(0., -R + .66);
  vec2 d = (p - C) / R;
  float r = length(d);
  // the sun sits low beyond the left horizon: dusk on the left, night on the right
  vec3 L = normalize(vec3(-1., .05, .03));
  float h = (r - 1.) * R;                        // height above the limb, layer units
  if (r > 1.){
    vec3 n = vec3(d / r, 0.);
    float lit = smoothstep(-.25, .25, dot(n, L) * 4.);
    float haze = exp(-h / .012) * 1.3 + exp(-h / .06) * .3;
    vec3 sky = mix(vec3(1., .42, .15), vec3(.30, .58, 1.), smoothstep(.0, .12, dot(n, L)));
    vec3 col = sky * haze * (.03 + lit * 1.2);
    return vec4(col, clamp(haze * (.06 + lit * .9), 0., 1.));
  }
  vec3 n = vec3(d, sqrt(1. - r * r));
  vec3 g = n; g.yz = rot(.9) * g.yz; g.xz = rot(.4) * g.xz;
  float cont = fbm(g * 9. + fbm(g * 18.) * .8);
  float land = smoothstep(.52, .56, cont);
  vec3 ocean = mix(vec3(.01, .04, .10), vec3(.02, .08, .17), fbm(g * 60.));
  vec3 ground = mix(vec3(.09, .12, .05), vec3(.30, .24, .13), smoothstep(.3, .7, fbm(g * 36.)));
  vec3 alb = mix(ocean, ground, land);
  // patchy cloud decks: a coarse coverage mask breaks up finer cloud texture
  vec3 cw = vec3(fbm(g * 14. + 1.), fbm(g * 14. + 8.), fbm(g * 14. + 15.)) - .5;
  float cover = smoothstep(.4, .65, fbm(g * 7. + 20.));
  float cloud = smoothstep(.45, .75, fbm(g * 40. + cw * 1.5)) * cover * .9;
  float ndl = dot(n, L);
  float day = smoothstep(-.02, .06, ndl);
  // low sun: long light path, warm and dim near the terminator
  vec3 sunC = mix(vec3(1., .45, .2), vec3(1., .92, .82), smoothstep(.0, .25, ndl));
  vec3 surf = alb * max(ndl, 0.) * 5. * sunC;
  vec3 hv = normalize(L + vec3(0, 0, 1));
  surf += (1. - land) * (1. - cloud) * sunC * pow(max(dot(n, hv), 0.), 60.) * 1.5;
  surf = mix(surf, vec3(1.) * sunC * max(ndl, 0.) * 5.5, cloud);
  // city lights on the night side, clustered along coasts
  float coast = smoothstep(.52, .56, cont) * smoothstep(.66, .56, cont);
  float metro = smoothstep(.5, .75, fbm(g * 70. + 5.));
  float pts = smoothstep(.72, .9, noise(g * 1400.)) + .35 * smoothstep(.6, .9, noise(g * 700. + 3.));
  float cities = (pts * metro * 1.4 + metro * .12) * (coast * 1.4 + land * .35) * (1. - cloud * .85);
  surf += vec3(1., .62, .28) * cities * (1. - day) * .55;
  // moonlit clouds on the night side, very faint
  surf += vec3(.05, .07, .12) * cloud * (1. - day) * .5;
  // atmosphere: bright rim on the sunward side, deep blue elsewhere
  // atmosphere thickens toward the limb (measured in screen space)
  float depth = -h;                                  // distance below the limb
  float rim = exp(-depth / .05);
  float sunward = smoothstep(-.03, .12, dot(normalize(vec3(d, 0.)), L));
  surf += mix(vec3(1., .45, .2), vec3(.35, .6, 1.), sunward * .7) * rim * (.03 + .9 * sunward);
  surf = mix(surf, vec3(.05, .12, .3) * (.1 + day), .25 * exp(-depth / .25));
  return vec4(surf, 1.);
}
`,
  });
})();

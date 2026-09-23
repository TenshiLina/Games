/* Glassfall — Frutiger Aero backdrop, generated to fit the viewport.
 *
 * The scene is drawn in units where the height is always 1000 and the width
 * follows the viewport's aspect ratio. Static artwork goes into SVG layers;
 * anything that moves is its own element so the browser can animate it on
 * the compositor without repainting the whole landscape.
 */
(function (GF) {
  "use strict";

  const H = 1000;
  const SEED = 20070130; // fixed so resizing keeps the same scene
  const HORIZON = 612;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => r1(p[0]) + " " + r1(p[1]);

  function stops(list) {
    return list.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>').join("");
  }
  const vgrad = (id, list) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' + stops(list) + "</linearGradient>";
  const blur = (id, sd) => '<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' + sd + '"/></filter>';

  // Catmull-Rom spline through points, as cubic Bézier segments.
  function spline(pts) {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      segs.push([
        p1,
        [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
        [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
        p2,
      ]);
    }
    const d = "M" + pt(pts[0]) + segs.map((s) => " C" + pt(s[1]) + " " + pt(s[2]) + " " + pt(s[3])).join("");
    return { d, segs };
  }

  function pointAt(segs, u) {
    const f = Math.min(Math.max(u, 0), 0.99999) * segs.length;
    const i = Math.floor(f);
    const [a, b, c, d] = segs[i];
    const t = f - i;
    const m = 1 - t;
    const k0 = m * m * m, k1 = 3 * m * m * t, k2 = 3 * m * t * t, k3 = t * t * t;
    return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1]];
  }

  // A hill: its crest line plus the filled shape down past the bottom edge.
  function hill(pts) {
    const s = spline(pts);
    const first = pts[0];
    const last = pts[pts.length - 1];
    return {
      crest: s.d,
      segs: s.segs,
      fill: s.d + " L" + r1(last[0]) + " " + (H + 40) + " L" + r1(first[0]) + " " + (H + 40) + " Z",
    };
  }

  function layer(cls, W, body) {
    return '<svg class="layer ' + cls + '" viewBox="0 0 ' + r1(W) + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' + body + "</svg>";
  }

  // ───────────────────────── Sky ─────────────────────────

  function sky(W, sun) {
    const defs =
      vgrad("sk-air", [[0, "#0342c0"], [0.22, "#0f74e3"], [0.42, "#3aa9f4"], [0.55, "#8fdcff"], [0.61, "#e4fbff"], [1, "#e4fbff"]]) +
      '<radialGradient id="sk-sun">' +
      stops([[0, "#ffffff"], [0.06, "rgba(255,255,248,0.98)"], [0.16, "rgba(255,250,215,0.55)"], [0.45, "rgba(255,255,255,0.14)"], [1, "rgba(255,255,255,0)"]]) +
      "</radialGradient>" +
      vgrad("sk-haze", [[0, "rgba(255,255,255,0)"], [0.65, "rgba(255,255,255,0.8)"], [1, "rgba(255,255,255,0)"]]) +
      blur("sk-wisp", 9);
    const wisps = [
      [0.18, 60, 0.22, -3],
      [0.55, 38, 0.3, -2],
      [0.78, 300, 0.2, -5],
    ]
      .map((w) => '<ellipse cx="' + r1(w[0] * W) + '" cy="' + w[1] + '" rx="' + r1(w[2] * W) + '" ry="9" transform="rotate(' + w[3] + " " + r1(w[0] * W) + " " + w[1] + ')" fill="rgba(255,255,255,0.45)" filter="url(#sk-wisp)"/>')
      .join("");
    return layer(
      "sky",
      W,
      "<defs>" + defs + "</defs>" +
        '<rect width="' + r1(W) + '" height="' + H + '" fill="url(#sk-air)"/>' +
        wisps +
        '<rect y="470" width="' + r1(W) + '" height="170" fill="url(#sk-haze)"/>' +
        '<circle cx="' + r1(sun[0]) + '" cy="' + sun[1] + '" r="600" fill="url(#sk-sun)"/>'
    );
  }

  // ───────────────────────── Clouds ─────────────────────────

  function cloud(rand, cx, cy, s, alpha) {
    const span = 150;
    const n = 6 + Math.floor(rand() * 3);
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = 34 + 46 * Math.sin(t * Math.PI) * (0.75 + rand() * 0.5);
      puffs.push([(t - 0.5) * 2 * span * (0.9 + rand() * 0.15), 16 - r * 0.6, r]);
    }
    for (let i = 0; i < 2; i++) {
      const r = 30 + rand() * 20;
      puffs.push([(rand() - 0.5) * span * 0.9, -40 - r * 0.9 - rand() * 10, r]);
    }
    puffs.sort((a, b) => b[2] - a[2]);
    let g = '<ellipse cx="0" cy="22" rx="' + span * 1.2 + '" ry="26" fill="url(#cl-base)"/>';
    for (const p of puffs) g += '<circle cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="' + r1(p[2]) + '" fill="url(#cl-puff)"/>';
    return '<g transform="translate(' + r1(cx) + " " + cy + ") scale(" + s + ')" opacity="' + alpha + '" filter="url(#cl-soft)">' + g + "</g>";
  }

  function clouds(W, rand) {
    const defs =
      '<radialGradient id="cl-puff" cx="0.45" cy="0.33" r="0.68">' +
      stops([[0, "#ffffff"], [0.55, "#ffffff"], [0.8, "#edf6ff"], [1, "#c3daef"]]) +
      "</radialGradient>" +
      vgrad("cl-base", [[0, "rgba(240,248,255,0.95)"], [1, "rgba(176,205,233,0.95)"]]) +
      blur("cl-soft", 1.3);
    const far = [[0.12, 548, 0.34], [0.33, 560, 0.28], [0.52, 545, 0.4], [0.74, 558, 0.3], [0.94, 548, 0.38]]
      .map((c) => cloud(rand, c[0] * W, c[1], c[2], 0.92))
      .join("");
    const near = [[0.06, 170, 0.95], [0.32, 95, 0.62], [0.55, 230, 0.8], [0.8, 120, 1.05], [1.02, 300, 0.75]]
      .map((c) => cloud(rand, c[0] * W, c[1], c[2], 1))
      .join("");
    return {
      far: layer("clouds far", W, "<defs>" + defs + "</defs>" + far),
      near: layer("clouds near", W, near),
    };
  }

  // ───────────────── Mountains, lake and middle hills ─────────────────

  function tree(x, y, s) {
    return '<use href="#lb-tree" transform="translate(' + r1(x) + " " + r1(y) + ") scale(" + s + ')"/>';
  }

  function landBack(W, sun, rand) {
    const farPts = [];
    for (let i = 0; i <= 9; i++) farPts.push([(i / 9) * W * 1.2 - W * 0.1, 566 + Math.sin(i * 1.9) * 22 + rand() * 16]);
    const nearPts = [];
    for (let i = 0; i <= 8; i++) nearPts.push([(i / 8) * W * 1.2 - W * 0.1, 596 + Math.sin(i * 2.3 + 1) * 12 + rand() * 8]);
    const far = hill(farPts);
    const near = hill(nearPts);

    const leftMid = hill([[-0.12 * W, 722], [0.05 * W, 668], [0.22 * W, 650], [0.4 * W, 676], [0.55 * W, 732], [0.66 * W, 810]]);
    const rightMid = hill([[0.36 * W, 810], [0.5 * W, 714], [0.68 * W, 660], [0.86 * W, 650], [1.02 * W, 672], [1.14 * W, 702]]);

    const defs =
      vgrad("lb-far", [[0, "#8cc4e6"], [1, "#c4e9f7"]]) +
      vgrad("lb-near", [[0, "#6dbfa6"], [1, "#b5e5d6"]]) +
      vgrad("lb-lake", [[0, "#d2f5ff"], [0.06, "#86d4f6"], [0.4, "#2f9fe2"], [1, "#0c5fb5"]]) +
      vgrad("lb-mid", [[0, "#c2f37e"], [0.16, "#80d646"], [0.55, "#3da429"], [1, "#22721c"]]) +
      '<radialGradient id="lb-canopy" cx="0.38" cy="0.3" r="0.75">' +
      stops([[0, "#d8fb8e"], [0.45, "#62bf35"], [1, "#256c1b"]]) +
      "</radialGradient>" +
      blur("lb-b2", 2) +
      blur("lb-b8", 8) +
      '<clipPath id="lb-clip-l"><path d="' + leftMid.fill + '"/></clipPath>' +
      '<clipPath id="lb-clip-r"><path d="' + rightMid.fill + '"/></clipPath>' +
      '<g id="lb-tree">' +
      '<ellipse cx="0" cy="1" rx="16" ry="3.5" fill="rgba(20,80,20,0.35)"/>' +
      '<rect x="-2.2" y="-18" width="4.4" height="19" rx="2" fill="#7a5532"/>' +
      '<circle cx="-9" cy="-24" r="12" fill="url(#lb-canopy)"/>' +
      '<circle cx="9" cy="-26" r="13" fill="url(#lb-canopy)"/>' +
      '<circle cx="0" cy="-35" r="16" fill="url(#lb-canopy)"/>' +
      '<ellipse cx="-5" cy="-44" rx="8" ry="4.5" fill="rgba(255,255,255,0.55)"/>' +
      "</g>";

    // Sun glitter on the lake plus scattered ripples.
    let water = "";
    for (let i = 0; i < 26; i++) {
      const y = HORIZON + 6 + Math.pow(rand(), 1.4) * 150;
      const depth = (y - HORIZON) / 150;
      const x = sun[0] + (rand() - 0.5) * (50 + depth * 260);
      const w = 8 + depth * 40 * rand();
      water += '<rect x="' + r1(x - w / 2) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="' + r1(1 + depth * 1.6) + '" rx="1" fill="rgba(255,255,255,' + r1(0.5 + rand() * 0.45) + ')"/>';
    }
    for (let i = 0; i < 30; i++) {
      const y = HORIZON + 8 + rand() * 160;
      const depth = (y - HORIZON) / 160;
      const w = 12 + depth * 70 * rand();
      water += '<rect x="' + r1(rand() * W - w / 2) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="1.4" rx="0.7" fill="rgba(255,255,255,' + r1(0.18 + rand() * 0.25) + ')"/>';
    }

    const rim = (h, clip) =>
      '<g clip-path="url(#' + clip + ')"><path d="' + h.crest + '" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="24" filter="url(#lb-b8)"/></g>';

    let trees = "";
    for (const [h, u, s] of [[rightMid, 0.44, 0.75], [rightMid, 0.5, 0.95], [rightMid, 0.56, 0.7], [leftMid, 0.3, 0.8], [leftMid, 0.37, 0.6]]) {
      const p = pointAt(h.segs, u);
      trees += tree(p[0], p[1] + 4, s);
    }

    return layer(
      "land-back",
      W,
      "<defs>" + defs + "</defs>" +
        '<path d="' + far.fill + '" fill="url(#lb-far)"/>' +
        '<path d="' + far.crest + '" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2" filter="url(#lb-b2)"/>' +
        '<path d="' + near.fill + '" fill="url(#lb-near)"/>' +
        '<rect y="' + HORIZON + '" width="' + r1(W) + '" height="' + (H - HORIZON) + '" fill="url(#lb-lake)"/>' +
        '<rect y="' + (HORIZON - 1) + '" width="' + r1(W) + '" height="3" fill="rgba(255,255,255,0.8)" filter="url(#lb-b2)"/>' +
        '<ellipse cx="' + r1(sun[0]) + '" cy="' + (HORIZON + 14) + '" rx="110" ry="16" fill="rgba(255,255,255,0.7)" filter="url(#lb-b8)"/>' +
        water +
        '<path d="' + rightMid.fill + '" fill="url(#lb-mid)"/>' +
        rim(rightMid, "lb-clip-r") +
        '<path d="' + leftMid.fill + '" fill="url(#lb-mid)"/>' +
        rim(leftMid, "lb-clip-l") +
        trees
    );
  }

  // ───────────────────────── Aurora ribbons ─────────────────────────

  function aurora(W) {
    const x = (f) => r1(f * W);
    const hgrad = (id, list) => '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="' + r1(W) + '" y2="0">' + stops(list) + "</linearGradient>";
    const main = "M" + x(-0.1) + " 560 C" + x(0.2) + " 330 " + x(0.48) + " 620 " + x(0.74) + " 420 S" + x(1.04) + " 240 " + x(1.15) + " 290";
    const high = "M" + x(-0.1) + " 360 C" + x(0.24) + " 240 " + x(0.46) + " 450 " + x(0.7) + " 320 S" + x(1) + " 170 " + x(1.15) + " 200";
    const thin = "M" + x(-0.1) + " 600 C" + x(0.3) + " 480 " + x(0.62) + " 650 " + x(1.15) + " 450";
    const defs =
      hgrad("au-green", [[0, "rgba(90,255,190,0)"], [0.22, "rgba(120,255,170,0.9)"], [0.6, "rgba(60,235,255,0.85)"], [1, "rgba(80,200,255,0)"]]) +
      hgrad("au-cyan", [[0, "rgba(120,230,255,0)"], [0.35, "rgba(170,245,255,0.6)"], [0.75, "rgba(210,255,225,0.55)"], [1, "rgba(200,255,255,0)"]]) +
      hgrad("au-edge", [[0, "rgba(255,255,255,0)"], [0.3, "rgba(255,255,255,0.95)"], [0.7, "rgba(255,255,255,0.9)"], [1, "rgba(255,255,255,0)"]]) +
      blur("au-b24", 24) +
      blur("au-b6", 6) +
      blur("au-b1", 1);
    return layer(
      "aurora",
      W,
      "<defs>" + defs + "</defs>" +
        '<path d="' + main + '" fill="none" stroke="url(#au-green)" stroke-width="170" filter="url(#au-b24)"/>' +
        '<path d="' + main + '" fill="none" stroke="url(#au-green)" stroke-width="30" filter="url(#au-b6)"/>' +
        '<path d="' + main + '" transform="translate(0 -52)" fill="none" stroke="url(#au-edge)" stroke-width="2.5" filter="url(#au-b1)"/>' +
        '<path d="' + high + '" fill="none" stroke="url(#au-cyan)" stroke-width="100" filter="url(#au-b24)"/>' +
        '<path d="' + high + '" transform="translate(0 -26)" fill="none" stroke="url(#au-edge)" stroke-width="1.5" filter="url(#au-b1)"/>' +
        '<path d="' + thin + '" fill="none" stroke="url(#au-edge)" stroke-width="1.5" opacity="0.8"/>'
    );
  }

  // ───────────────── Foreground hills, grass, flowers, leaves ─────────────────

  const GRASS_BACK = ["#2e8e1c", "#379f22", "#2a7f1a"];
  const GRASS_FRONT = ["#5cc72e", "#79d93b", "#9ae556", "#48b526"];

  function grass(rand, h, W, palette, lift, density) {
    let out = "";
    const count = Math.round(density * W);
    for (let i = 0; i < count; i++) {
      const p = pointAt(h.segs, (i + rand()) / count);
      if (p[0] < -30 || p[0] > W + 30 || p[1] > H) continue;
      const x = p[0];
      const y = p[1] + lift + rand() * 4;
      const ht = 9 + rand() * 18;
      const lean = (rand() - 0.5) * 14;
      const w = 1.8 + rand() * 1.4;
      out +=
        '<path d="M' + r1(x - w) + " " + r1(y) + " Q" + r1(x + lean * 0.3) + " " + r1(y - ht * 0.6) + " " + r1(x + lean) + " " + r1(y - ht) +
        " Q" + r1(x + lean * 0.3 + w * 0.4) + " " + r1(y - ht * 0.5) + " " + r1(x + w) + " " + r1(y) + 'Z" fill="' + palette[Math.floor(rand() * palette.length)] + '"/>';
    }
    return out;
  }

  function flowers(rand, h, W, n) {
    let out = "";
    const kinds = ["#fg-daisy", "#fg-daisy", "#fg-daisy", "#fg-bloom", "#fg-cup"];
    for (let i = 0; i < n; i++) {
      const p = pointAt(h.segs, 0.04 + rand() * 0.92);
      const depth = 14 + Math.pow(rand(), 1.3) * 220;
      const y = p[1] + depth;
      if (y > H - 6 || p[0] < 0 || p[0] > W) continue;
      const s = 0.45 + depth / 170;
      out += '<use href="' + kinds[Math.floor(rand() * kinds.length)] + '" transform="translate(' + r1(p[0]) + " " + r1(y) + ") scale(" + r1(s * 10) / 10 + ')"/>';
    }
    return out;
  }

  function plant(x, y, s, flip, rand) {
    const leaves = [[-168, 0.95], [-140, 1.15], [-112, 1.35], [-88, 1.25], [-62, 1.1], [-34, 0.9]];
    let out = '<g transform="translate(' + r1(x) + " " + r1(y) + ") scale(" + flip * s + " " + s + ')">';
    for (const [a, len] of leaves) {
      out += '<use href="#fg-leaf" transform="rotate(' + a + ") scale(" + len + ')"/>';
      if (rand() < 0.5) {
        const d = 45 + rand() * 35;
        out += '<use href="#fg-drop" transform="rotate(' + a + ") translate(" + r1(d * len) + ' -3) scale(' + r1(0.7 + rand() * 0.6) + ')"/>';
      }
    }
    return out + "</g>";
  }

  function landFront(W, rand) {
    const left = hill([[-0.1 * W, 804], [0.06 * W, 758], [0.22 * W, 762], [0.38 * W, 812], [0.52 * W, 902], [0.6 * W, 1040]]);
    const right = hill([[0.42 * W, 1040], [0.53 * W, 906], [0.68 * W, 820], [0.84 * W, 774], [1.0 * W, 770], [1.12 * W, 792]]);

    const petals = [0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => '<ellipse cy="-5.4" rx="2.3" ry="5" transform="rotate(' + a + ')" fill="#ffffff" stroke="rgba(140,165,200,0.55)" stroke-width="0.5"/>')
      .join("");
    const bloom = [0, 72, 144, 216, 288]
      .map((a) => '<circle cy="-3.4" r="3.2" transform="rotate(' + a + ')" fill="url(#fg-pink)"/>')
      .join("");
    const cup = [0, 72, 144, 216, 288]
      .map((a) => '<circle cy="-3" r="2.9" transform="rotate(' + a + ')" fill="url(#fg-gold)"/>')
      .join("");
    const defs =
      vgrad("fg-hill", [[0, "#d6fb78"], [0.09, "#8ee340"], [0.42, "#41ad23"], [1, "#196414"]]) +
      '<radialGradient id="fg-eye">' + stops([[0, "#fff7a8"], [0.55, "#ffc400"], [1, "#d98300"]]) + "</radialGradient>" +
      '<radialGradient id="fg-pink" cx="0.4" cy="0.35">' + stops([[0, "#ffffff"], [0.45, "#ffb8d9"], [1, "#ea4d8c"]]) + "</radialGradient>" +
      '<radialGradient id="fg-gold" cx="0.4" cy="0.35">' + stops([[0, "#fffbe0"], [0.45, "#ffe066"], [1, "#f0a400"]]) + "</radialGradient>" +
      vgrad("fg-leafg", [[0, "#d0fa84"], [0.42, "#5fc632"], [1, "#1c7416"]]) +
      '<radialGradient id="fg-dropg" cx="0.36" cy="0.3" r="0.7">' + stops([[0, "#ffffff"], [0.28, "rgba(255,255,255,0.65)"], [1, "rgba(170,235,255,0.25)"]]) + "</radialGradient>" +
      blur("fg-b10", 10) +
      '<clipPath id="fg-clip-l"><path d="' + left.fill + '"/></clipPath>' +
      '<clipPath id="fg-clip-r"><path d="' + right.fill + '"/></clipPath>' +
      '<g id="fg-daisy">' + petals + '<circle r="2.8" fill="url(#fg-eye)"/><circle cx="-0.8" cy="-0.9" r="0.9" fill="rgba(255,255,255,0.85)"/></g>' +
      '<g id="fg-bloom">' + bloom + '<circle r="1.8" fill="#ffe066"/></g>' +
      '<g id="fg-cup">' + cup + '<circle r="1.5" fill="#e07b00"/></g>' +
      '<g id="fg-leaf">' +
      '<path d="M0 0 C30 -26 72 -24 100 0 C72 20 30 22 0 0Z" fill="url(#fg-leafg)" stroke="rgba(20,90,20,0.5)" stroke-width="0.8"/>' +
      '<path d="M4 0 Q50 -3 96 0" fill="none" stroke="rgba(235,255,200,0.75)" stroke-width="1.4"/>' +
      '<path d="M14 -7 C36 -19 64 -18 86 -5 C62 -11 36 -11 14 -7Z" fill="rgba(255,255,255,0.6)"/>' +
      "</g>" +
      '<g id="fg-drop"><circle r="4.2" fill="url(#fg-dropg)" stroke="rgba(255,255,255,0.8)" stroke-width="0.5"/><circle cx="-1.3" cy="-1.4" r="1.1" fill="#fff"/></g>';

    const rim = (h, clip) =>
      '<g clip-path="url(#' + clip + ')"><path d="' + h.crest + '" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="34" filter="url(#fg-b10)"/></g>';

    const scale = Math.min(1.7, 0.9 + W / 2400);
    return layer(
      "land-front",
      W,
      "<defs>" + defs + "</defs>" +
        '<path d="' + right.fill + '" fill="url(#fg-hill)"/>' +
        rim(right, "fg-clip-r") +
        grass(rand, right, W, GRASS_BACK, 2, 0.45) +
        grass(rand, right, W, GRASS_FRONT, 4, 0.4) +
        flowers(rand, right, W, 34) +
        '<path d="' + left.fill + '" fill="url(#fg-hill)"/>' +
        rim(left, "fg-clip-l") +
        grass(rand, left, W, GRASS_BACK, 2, 0.45) +
        grass(rand, left, W, GRASS_FRONT, 4, 0.4) +
        flowers(rand, left, W, 34) +
        plant(W * 0.015, H + 8, scale, 1, rand) +
        plant(W * 0.985, H + 8, scale * 0.9, -1, rand)
    );
  }

  // ───────────────── Animated overlays (HTML) ─────────────────

  function butterfly(id, a, b, still) {
    const flap = still ? "" : '<animateTransform attributeName="transform" type="scale" values="1 1;0.22 1;1 1" dur="0.3s" repeatCount="indefinite"/>';
    const wing =
      '<g>' +
      '<path d="M0 -2 C-6 -20 -26 -28 -28 -12 C-29 -2 -16 3 0 0Z" fill="url(#bf-' + id + ')" stroke="rgba(4,40,110,0.8)" stroke-width="0.8"/>' +
      '<path d="M0 1 C-8 3 -22 8 -18 19 C-13 26 -3 14 0 3Z" fill="url(#bf-' + id + ')" stroke="rgba(4,40,110,0.8)" stroke-width="0.8"/>' +
      '<ellipse cx="-16" cy="-14" rx="6" ry="2.6" transform="rotate(-32 -16 -14)" fill="rgba(255,255,255,0.7)"/>' +
      flap +
      "</g>";
    return (
      '<svg class="butterfly ' + id + '" viewBox="-30 -28 60 56" aria-hidden="true">' +
      '<defs><linearGradient id="bf-' + id + '" x1="0" y1="0" x2="1" y2="1">' + stops([[0, a], [0.4, b], [1, "#0a3db0"]]) + "</linearGradient></defs>" +
      wing +
      '<g transform="scale(-1 1)">' + wing + "</g>" +
      '<ellipse rx="2" ry="9" cy="2" fill="#16284a"/>' +
      '<path d="M-0.5 -6 Q-4 -14 -7 -16 M0.5 -6 Q4 -14 7 -16" stroke="#16284a" stroke-width="0.8" fill="none"/>' +
      "</svg>"
    );
  }

  function overlays(vw, vh, sunPx, rand, still) {
    let html = "";

    // Sun rays, centred on the sun.
    const D = 2.6 * Math.max(vw, vh);
    html += '<div class="rays" style="left:' + r1(sunPx[0] - D / 2) + "px;top:" + r1(sunPx[1] - D / 2) + "px;width:" + r1(D) + "px;height:" + r1(D) + 'px"></div>';

    // Glass orbs.
    const orbs = [
      [0.07, 0.34, 0.11, "90,220,120"],
      [0.93, 0.58, 0.08, "40,170,255"],
      [0.16, 0.76, 0.06, "0,210,230"],
      [0.86, 0.22, 0.05, "120,230,150"],
    ];
    for (const [x, y, s, c] of orbs) {
      const size = r1(s * vh);
      html += '<div class="orb" style="left:' + r1(x * vw - size / 2) + "px;top:" + r1(y * vh - size / 2) + "px;width:" + size + "px;height:" + size + "px;--c:" + c + ";animation-delay:" + r1(-rand() * 8) + 's"></div>';
    }

    // Lens flare, from the sun towards the lower left.
    const flare = [[0.28, 0.05, "150,255,210", 0.28], [0.5, 0.13, "140,210,255", 0.2], [0.68, 0.03, "255,240,170", 0.35], [0.95, 0.2, "170,255,230", 0.14]];
    const tx = vw * 0.3 - sunPx[0];
    const ty = vh * 0.78 - sunPx[1];
    for (const [t, s, c, a] of flare) {
      const size = r1(s * vh);
      html += '<div class="flare" style="left:' + r1(sunPx[0] + tx * t) + "px;top:" + r1(sunPx[1] + ty * t) + "px;width:" + size + "px;height:" + size + "px;--c:" + c + ";--a:" + a + '"></div>';
    }

    // Twinkling sparkles.
    for (let i = 0; i < 26; i++) {
      const size = r1(8 + rand() * 16);
      html += '<span class="sparkle" style="left:' + r1(rand() * 100) + "%;top:" + r1(4 + rand() * 80) + "%;width:" + size + "px;height:" + size + "px;animation-duration:" + r1(2.5 + rand() * 3) + "s;animation-delay:" + r1(-rand() * 5) + 's"></span>';
    }

    html += butterfly("bf1", "#c8f6ff", "#2ea6ff", still);
    html += butterfly("bf2", "#d8ffe8", "#20c7d8", still);

    // Soap bubbles.
    html += '<div class="bubbles">';
    for (let i = 0; i < 22; i++) {
      const size = r1(12 + rand() * 52);
      html += '<span style="left:' + r1(rand() * 100) + "%;width:" + size + "px;height:" + size + "px;animation-duration:" + r1(14 + rand() * 18) + "s;animation-delay:" + r1(-rand() * 30) + 's"></span>';
    }
    html += "</div>";
    return html;
  }

  // ───────────────────────── Build ─────────────────────────

  function build(host) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const W = (H * vw) / vh;
    const rand = mulberry32(SEED);
    const sun = [W * 0.8, 105];
    const px = vh / H;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const c = clouds(W, rand);
    host.innerHTML =
      sky(W, sun) +
      '<div class="rays-slot"></div>' +
      c.near +
      c.far +
      landBack(W, sun, rand) +
      aurora(W) +
      landFront(W, rand) +
      overlays(vw, vh, [sun[0] * px, sun[1] * px], rand, still);

    // Rays belong behind the clouds; move them into their slot.
    const rays = host.querySelector(".rays");
    host.querySelector(".rays-slot").replaceWith(rays);
  }

  function mount(host) {
    let last = "";
    let timer = 0;
    const rebuild = () => {
      const key = window.innerWidth + "x" + window.innerHeight;
      if (key === last) return;
      last = key;
      build(host);
    };
    rebuild();
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    });
  }

  GF.mountScenery = mount;
})((window.GF = window.GF || {}));

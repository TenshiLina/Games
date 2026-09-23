/* Glassfall — canvas rendering of gel bubbles, the well and previews. */
(function (GF) {
  "use strict";

  // Each gel colour: rim (dark edge), base, light (inner glow), glow (pop halo).
  const PALETTE = {
    aqua:   { rim: "#0a4aa8", base: "#1f8fff", light: "#9fe0ff", glow: "#7fd4ff" },
    lime:   { rim: "#23700b", base: "#4cc41c", light: "#c4f58a", glow: "#b9ff7a" },
    rose:   { rim: "#930d43", base: "#f0337c", light: "#ffabcc", glow: "#ff8ab8" },
    amber:  { rim: "#a35200", base: "#ff9a0d", light: "#ffe08a", glow: "#ffd060" },
    violet: { rim: "#471ca6", base: "#8a4dff", light: "#d2b8ff", glow: "#c29dff" },
  };

  // Size a canvas's backing store to its CSS box at device pixel ratio.
  function setupCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  // Rounded rectangle with independent corner radii (0 = square corner).
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    ctx.lineTo(x + r.bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.arcTo(x, y, x + r.tl, y, r.tl);
    ctx.closePath();
  }

  // Body rectangle and corner radii for a cell; linked sides reach the cell
  // edge with square corners so same-colour neighbours fuse into one blob.
  function bodyShape(px, py, s, links, inset) {
    const pad = s * 0.06;
    const R = s * 0.32;
    const x0 = px + (links.l ? 0 : pad + inset);
    const y0 = py + (links.u ? 0 : pad + inset);
    const x1 = px + s - (links.r ? 0 : pad + inset);
    const y1 = py + s - (links.d ? 0 : pad + inset);
    const rr = Math.max(0, R - inset);
    return {
      x: x0, y: y0, w: x1 - x0, h: y1 - y0,
      r: {
        tl: links.u || links.l ? 0 : rr,
        tr: links.u || links.r ? 0 : rr,
        br: links.d || links.r ? 0 : rr,
        bl: links.d || links.l ? 0 : rr,
      },
    };
  }

  const NO_LINKS = { u: false, d: false, l: false, r: false };

  // One glossy gel cell in the Aqua style.
  function drawGel(ctx, px, py, s, color, links, opts) {
    const c = PALETTE[color];
    if (!c) return;
    links = links || NO_LINKS;
    opts = opts || {};
    ctx.save();
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;

    // Rim (dark outer edge, only visible on unlinked sides).
    const outer = bodyShape(px, py, s, links, 0);
    roundRectPath(ctx, outer.x, outer.y, outer.w, outer.h, outer.r);
    ctx.fillStyle = c.rim;
    if (opts.glow) {
      // Stacked halos so a ready-to-pop group clearly shines.
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = s * 0.9;
      ctx.fill();
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = s * 0.35;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Body: radial light pooling near the bottom, like an Aqua gel button.
    const inner = bodyShape(px, py, s, links, s * 0.045);
    const cx = px + s / 2;
    const body = ctx.createRadialGradient(cx, py + s * 0.78, s * 0.05, cx, py + s * 0.5, s * 0.72);
    body.addColorStop(0, c.light);
    body.addColorStop(0.55, c.base);
    body.addColorStop(1, c.rim);
    roundRectPath(ctx, inner.x, inner.y, inner.w, inner.h, inner.r);
    ctx.fillStyle = body;
    ctx.fill();

    // Specular cap across the upper half.
    const hx = px + s * 0.17;
    const hy = py + s * 0.11;
    const hw = s * 0.66;
    const hh = s * 0.36;
    const cap = ctx.createLinearGradient(0, hy, 0, hy + hh);
    cap.addColorStop(0, "rgba(255,255,255,0.92)");
    cap.addColorStop(1, "rgba(255,255,255,0.08)");
    const hr = s * 0.17;
    roundRectPath(ctx, hx, hy, hw, hh, { tl: hr, tr: hr, br: hr * 0.8, bl: hr * 0.8 });
    ctx.fillStyle = cap;
    ctx.fill();

    // Tiny sparkle.
    ctx.beginPath();
    ctx.arc(px + s * 0.3, py + s * 0.22, s * 0.045, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();

    ctx.restore();
  }

  // Translucent outline showing where the falling piece will land.
  function drawGhost(ctx, px, py, s, color, links) {
    const c = PALETTE[color];
    const shape = bodyShape(px, py, s, links || NO_LINKS, s * 0.04);
    ctx.save();
    roundRectPath(ctx, shape.x, shape.y, shape.w, shape.h, shape.r);
    ctx.fillStyle = hexA(c.light, 0.14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hexA(c.light, 0.7);
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.restore();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // Links for a cell given a lookup function colourAt(x, y).
  function linksFor(colourAt, x, y, color) {
    return {
      u: colourAt(x, y - 1) === color,
      d: colourAt(x, y + 1) === color,
      l: colourAt(x - 1, y) === color,
      r: colourAt(x + 1, y) === color,
    };
  }

  function drawGrid(ctx, cols, rows, s) {
    ctx.save();
    ctx.strokeStyle = "rgba(160, 215, 255, 0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < cols; x++) {
      ctx.moveTo(x * s + 0.5, 0);
      ctx.lineTo(x * s + 0.5, rows * s);
    }
    for (let y = 1; y < rows; y++) {
      ctx.moveTo(0, y * s + 0.5);
      ctx.lineTo(cols * s, y * s + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  const NONE = new Set();

  // Pop animation: swell, then shrink away while fading. t runs 0 → 1.
  function drawPopping(ctx, cells, s) {
    const at = cellLookup(cells);
    for (const c of cells) {
      const t = c.t;
      const k = t < 0.3 ? 1 + 0.22 * (t / 0.3) : 1.22 * (1 - (t - 0.3) / 0.7);
      if (k <= 0.02) continue;
      ctx.save();
      ctx.translate(c.x * s + s / 2, c.y * s + s / 2);
      ctx.scale(k, k);
      drawGel(ctx, -s / 2, -s / 2, s, c.color, linksFor(at, c.x, c.y, c.color), {
        glow: true,
        alpha: t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7,
      });
      ctx.restore();
    }
  }

  function drawRowFlash(ctx, y, t, cols, s) {
    const a = Math.max(0, 1 - t);
    const grad = ctx.createLinearGradient(0, y * s, 0, (y + 1) * s);
    grad.addColorStop(0, "rgba(255,255,255," + 0.95 * a + ")");
    grad.addColorStop(0.5, "rgba(200,240,255," + 0.6 * a + ")");
    grad.addColorStop(1, "rgba(255,255,255," + 0.9 * a + ")");
    ctx.save();
    ctx.shadowColor = "rgba(160,230,255," + a + ")";
    ctx.shadowBlur = s * 0.8;
    ctx.fillStyle = grad;
    const inset = s * 0.12 * t;
    ctx.fillRect(0, y * s + inset, cols * s, s - inset * 2);
    ctx.restore();
  }

  function drawParticles(ctx, particles) {
    for (const p of particles) {
      const c = PALETTE[p.color];
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (p.life / p.maxLife) * 1.4));
      ctx.shadowColor = c ? c.glow : "#ffffff";
      ctx.shadowBlur = p.r * 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = c ? c.light : "#ffffff";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTexts(ctx, texts, s) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.round(s * 0.62) + 'px "Lucida Grande", "Helvetica Neue", Helvetica, Arial, sans-serif';
    for (const t of texts) {
      const k = t.age / t.life;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const y = t.y - k * s * 1.4;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,40,100,0.55)";
      ctx.strokeText(t.text, t.x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(t.text, t.x, y);
    }
    ctx.restore();
  }

  // view: {
  //   grid: rows × cols of colour keys or null, s: cell size in px,
  //   hide: Set of "x,y" grid cells not to draw (they are animating),
  //   ghost, piece: [{x,y,color}], glow: Set of "x,y",
  //   falling: [{x, y (fractional), color, tx, ty, d}],
  //   popping: [{x,y,color,t}], flash: [{y,t}],
  //   particles, texts
  // }
  function drawBoard(ctx, view) {
    const grid = view.grid;
    const s = view.s;
    const rows = grid.length;
    const cols = grid[0].length;
    const hide = view.hide || NONE;
    ctx.clearRect(0, 0, cols * s, rows * s);
    drawGrid(ctx, cols, rows, s);

    const at = (x, y) =>
      y >= 0 && y < rows && x >= 0 && x < cols && !hide.has(x + "," + y) ? grid[y][x] : null;

    if (view.ghost && view.ghost.length) {
      const gAt = cellLookup(view.ghost);
      for (const g of view.ghost) {
        drawGhost(ctx, g.x * s, g.y * s, s, g.color, linksFor(gAt, g.x, g.y, g.color));
      }
    }

    const glow = view.glow || NONE;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const color = at(x, y);
        if (!color) continue;
        drawGel(ctx, x * s, y * s, s, color, linksFor(at, x, y, color), { glow: glow.has(x + "," + y) });
      }
    }

    if (view.falling) {
      // Cells falling together by the same distance stay fused.
      const byTarget = new Map(view.falling.map((f) => [f.tx + "," + f.ty, f]));
      for (const f of view.falling) {
        const same = (x, y) => {
          const o = byTarget.get(x + "," + y);
          return o && o.d === f.d && o.color === f.color;
        };
        const links = { u: same(f.tx, f.ty - 1), d: same(f.tx, f.ty + 1), l: same(f.tx - 1, f.ty), r: same(f.tx + 1, f.ty) };
        drawGel(ctx, f.x * s, f.y * s, s, f.color, links);
      }
    }

    if (view.flash) for (const f of view.flash) drawRowFlash(ctx, f.y, f.t, cols, s);
    if (view.popping) drawPopping(ctx, view.popping, s);

    if (view.piece && view.piece.length) {
      const pAt = cellLookup(view.piece);
      for (const p of view.piece) {
        if (p.y < 0) continue;
        drawGel(ctx, p.x * s, p.y * s, s, p.color, linksFor(pAt, p.x, p.y, p.color));
      }
    }

    if (view.particles) drawParticles(ctx, view.particles);
    if (view.texts) drawTexts(ctx, view.texts, s);
  }

  function cellLookup(cells) {
    const map = new Map(cells.map((c) => [c.x + "," + c.y, c.color]));
    return (x, y) => map.get(x + "," + y) || null;
  }

  // Draw a piece centred in a box. cells: [{x,y,color}] in piece-local coords.
  function drawPieceCentered(ctx, cells, cx, cy, s, alpha) {
    if (!cells.length) return;
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const ox = cx - ((maxX - minX + 1) * s) / 2 - minX * s;
    const oy = cy - ((maxY - minY + 1) * s) / 2 - minY * s;
    const at = cellLookup(cells);
    for (const c of cells) {
      drawGel(ctx, ox + c.x * s, oy + c.y * s, s, c.color, linksFor(at, c.x, c.y, c.color), { alpha });
    }
  }

  GF.PALETTE = PALETTE;
  GF.setupCanvas = setupCanvas;
  GF.drawGel = drawGel;
  GF.drawBoard = drawBoard;
  GF.drawPieceCentered = drawPieceCentered;
})((window.GF = window.GF || {}));

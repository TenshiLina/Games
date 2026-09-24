/* Armada — drawing: baked sprites plus runtime effects (glow, sparks,
 * scorched bunker craters, engine flicker, screen shake). */
(function (AR) {
  "use strict";

  const C = AR.C;
  const FILES = {
    space: "bg-space.jpg",
    planet: "bg-planet.png",
    player: "player.png",
    squid: "invader-squid.png",
    crab: "invader-crab.png",
    octopus: "invader-octopus.png",
    mothership: "mothership.png",
    bunker: "bunker.png",
    explosion: "explosion.png",
    boltPlayer: "bolt-player.png",
    boltEnemy: "bolt-enemy.png",
    flare: "flare.png",
  };
  // On-screen widths in world units.
  const ALIEN_SIZE = { octopus: 84, crab: 80, squid: 70 };
  const GLOW = { octopus: "120,255,150", crab: "255,150,60", squid: "210,110,255" };
  const PLAYER_SIZE = 96;
  const UFO_SIZE = 132;
  const BUNKER_PX = 352 / C.BUNKER_W; // bunker canvas pixels per world unit

  const img = {};

  AR.loadArt = function (base = "assets/") {
    return Promise.all(
      Object.entries(FILES).map(
        ([key, file]) =>
          new Promise((ok, fail) => {
            const i = new Image();
            i.onload = () => ok((img[key] = i));
            i.onerror = () => fail(new Error("Could not load " + file));
            i.src = base + file;
          })
      )
    );
  };

  // The bunker's collision footprint, read from the sprite's alpha.
  AR.bunkerShapeFromArt = function () {
    const c = document.createElement("canvas");
    c.width = img.bunker.width;
    c.height = img.bunker.height;
    const x = c.getContext("2d");
    x.drawImage(img.bunker, 0, 0);
    let data;
    try {
      data = x.getImageData(0, 0, c.width, c.height).data;
    } catch (e) {
      return null; // file:// pages can't read pixels; the game falls back to the arch shape
    }
    return (lx, ly) => {
      const px = Math.floor(lx * BUNKER_PX), py = Math.floor(ly * BUNKER_PX);
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) return false;
      return data[(py * c.width + px) * 4 + 3] > 140;
    };
  };

  AR.createRenderer = function (canvas) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, scale = 1, ox = 0, oy = 0, dpr = 1;
    let time = 0;
    let shake = 0;
    const fx = { explosions: [], flares: [], sparks: [], texts: [], smoke: [] };
    let bunkerCanvases = [];
    const disp = new Map(); // tweened alien positions
    let playerVx = 0, lastPlayerX = null;
    let banner = null;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.round(canvas.clientWidth * dpr);
      H = canvas.height = Math.round(canvas.clientHeight * dpr);
      scale = Math.min(W / C.W, H / C.H);
      ox = (W - C.W * scale) / 2;
      oy = (H - C.H * scale) / 2;
    }

    // screen px (CSS) → world units
    function toWorld(cx, cy) {
      return [(cx * dpr - ox) / scale, (cy * dpr - oy) / scale];
    }

    // ───────────── bunkers ─────────────

    function resetBunkers(game) {
      bunkerCanvases = game.bunkers.map(() => {
        const c = document.createElement("canvas");
        c.width = img.bunker.width;
        c.height = img.bunker.height;
        c.getContext("2d").drawImage(img.bunker, 0, 0);
        return c;
      });
    }

    function paintCrater(e) {
      const c = bunkerCanvases[e.bunker];
      if (!c) return;
      const x = c.getContext("2d");
      const k = BUNKER_PX;
      const cx = e.x * k, cy = e.y * k;
      const rAt = (ang) => {
        const t = ((ang / (Math.PI * 2)) * 12 + 12) % 12;
        const k0 = Math.floor(t), f = t - k0;
        return e.radii[k0] * (1 - f) + e.radii[(k0 + 1) % 12] * f;
      };
      x.save();
      x.globalCompositeOperation = "destination-out";
      x.beginPath();
      let maxR = 0;
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * Math.PI * 2 - Math.PI;
        let r = rAt(a) * k;
        const dx = Math.cos(a) * r;
        let dy = Math.sin(a) * r;
        if (dy > 0) dy *= 1 + e.stretchDown;
        maxR = Math.max(maxR, Math.hypot(dx, dy));
        i ? x.lineTo(cx + dx, cy + dy) : x.moveTo(cx + dx, cy + dy);
      }
      x.fill();
      // scorch the metal around the hole
      x.globalCompositeOperation = "source-atop";
      const g = x.createRadialGradient(cx, cy, maxR * 0.6, cx, cy, maxR * 2.1);
      g.addColorStop(0, "rgba(10,6,4,0.95)");
      g.addColorStop(0.35, "rgba(40,22,10,0.6)");
      g.addColorStop(1, "rgba(40,22,10,0)");
      x.fillStyle = g;
      x.fillRect(cx - maxR * 2.2, cy - maxR * 2.2, maxR * 4.4, maxR * 4.4);
      x.restore();
    }

    function paintErase(e) {
      const c = bunkerCanvases[e.bunker];
      if (!c) return;
      const x = c.getContext("2d");
      const k = BUNKER_PX;
      x.save();
      x.globalCompositeOperation = "destination-out";
      x.fillRect(e.x0 * k, e.y0 * k, (e.x1 - e.x0) * k, (e.y1 - e.y0) * k);
      x.globalCompositeOperation = "source-atop";
      x.fillStyle = "rgba(15,10,8,0.5)";
      x.fillRect(e.x0 * k - 6, e.y0 * k - 6, (e.x1 - e.x0) * k + 12, (e.y1 - e.y0) * k + 12);
      x.restore();
    }

    // ───────────── effects ─────────────

    function explosion(x, y, size, dur = 0.75, delay = 0) {
      fx.explosions.push({ x, y, size, t: -delay, dur, rot: Math.random() * Math.PI * 2 });
    }
    function flare(x, y, size, dur = 0.25, color = null) {
      fx.flares.push({ x, y, size, t: 0, dur, color });
    }
    function sparks(x, y, n, rgb, speed = 420, life = 0.6, up = 0) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.9);
        fx.sparks.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - up,
          life: life * (0.5 + Math.random() * 0.7),
          age: 0,
          rgb,
          w: 1.5 + Math.random() * 2,
        });
      }
    }
    function floatText(x, y, text, rgb) {
      fx.texts.push({ x, y, text, rgb, t: 0, dur: 1.4 });
    }

    function handle(e, game) {
      switch (e.type) {
        case "wave":
          resetBunkers(game);
          disp.clear();
          banner = { text: "WAVE " + e.wave, t: 0, dur: 1.6 };
          break;
        case "crater":
          paintCrater(e);
          break;
        case "erase":
          paintErase(e);
          break;
        case "fire":
          flare(e.x, e.y + 6, 54, 0.12);
          break;
        case "kill":
          explosion(e.x, e.y, 120, 0.6);
          flare(e.x, e.y, 150, 0.22, GLOW[e.kind]);
          sparks(e.x, e.y, 18, GLOW[e.kind], 380, 0.55);
          shake = Math.max(shake, 3);
          break;
        case "impact":
          if (e.on === "bunker") {
            explosion(e.x, e.y, e.alien ? 64 : 52, 0.45);
            sparks(e.x, e.y, 10, "255,170,80", 260, 0.45, e.alien ? -60 : 60);
            flare(e.x, e.y, 70, 0.18, "255,170,90");
          } else if (e.on === "shot") {
            flare(e.x, e.y, 110, 0.25);
            sparks(e.x, e.y, 14, "200,230,255", 320, 0.4);
          } else if (e.on === "ground") {
            flare(e.x, e.y, 60, 0.3, "255,120,60");
            sparks(e.x, e.y, 8, "255,140,60", 200, 0.5, 120);
          } else {
            flare(e.x, e.y, 60, 0.2);
          }
          break;
        case "playerDeath":
          explosion(e.x, e.y, 190, 1.0);
          explosion(e.x - 30, e.y + 8, 120, 0.8, 0.18);
          explosion(e.x + 34, e.y - 6, 110, 0.8, 0.32);
          flare(e.x, e.y, 320, 0.5, "255,190,120");
          sparks(e.x, e.y, 46, "255,170,90", 520, 1.1);
          sparks(e.x, e.y, 18, "160,210,255", 380, 0.8);
          shake = 14;
          break;
        case "ufoKill":
          explosion(e.x, e.y, 220, 1.0);
          explosion(e.x - 40, e.y, 130, 0.8, 0.12);
          explosion(e.x + 44, e.y + 4, 130, 0.8, 0.22);
          flare(e.x, e.y, 360, 0.45, "255,120,90");
          sparks(e.x, e.y, 40, "255,110,80", 520, 1.0);
          floatText(e.x, e.y, String(e.points), "255,190,160");
          shake = 10;
          break;
        case "extraLife":
          floatText(C.W / 2, C.PLAYER_Y - 80, "EXTRA SHIP", "150,210,255");
          break;
        case "waveCleared":
          banner = { text: "WAVE CLEARED", t: 0, dur: 1.8 };
          break;
      }
    }

    function updateFx(dt) {
      for (const e of fx.explosions) e.t += dt;
      fx.explosions = fx.explosions.filter((e) => e.t < e.dur);
      for (const f of fx.flares) f.t += dt;
      fx.flares = fx.flares.filter((f) => f.t < f.dur);
      for (const s of fx.sparks) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 1 - 1.8 * dt;
        s.vy *= 1 - 1.8 * dt;
      }
      fx.sparks = fx.sparks.filter((s) => s.age < s.life);
      for (const t of fx.texts) t.t += dt;
      fx.texts = fx.texts.filter((t) => t.t < t.dur);
      if (banner && (banner.t += dt) > banner.dur) banner = null;
      shake *= Math.exp(-dt * 7);
    }

    // ───────────── drawing ─────────────

    function sprite(im, frame, frames, x, y, w, cols = frames) {
      const fw = im.width / cols, fh = im.height / Math.ceil(frames / cols);
      const h = (w * fh) / fw;
      ctx.drawImage(im, (frame % cols) * fw, Math.floor(frame / cols) * fh, fw, fh, x - w / 2, y - h / 2, w, h);
    }

    function drawBackdrop() {
      const s = img.space;
      // slow drift keeps the sky alive
      const k = Math.max(W / s.width, H / s.height) * 1.06;
      const dx = Math.sin(time * 0.013) * W * 0.02, dy = Math.cos(time * 0.009) * H * 0.015;
      ctx.drawImage(s, (W - s.width * k) / 2 + dx, (H - s.height * k) / 2 + dy, s.width * k, s.height * k);
      const p = img.planet;
      const ph = Math.max((W / p.width) * p.height, 260 * scale);
      const pw = (ph / p.height) * p.width;
      ctx.drawImage(p, (W - pw) / 2, H - ph, pw, ph);
    }

    function drawBunkers(game) {
      game.bunkers.forEach((b, i) => {
        if (bunkerCanvases[i]) ctx.drawImage(bunkerCanvases[i], b.x, b.y, C.BUNKER_W, C.BUNKER_H);
      });
    }

    function drawAliens(game, dt) {
      const k = 1 - Math.exp(-dt * 30);
      for (const a of game.aliens) {
        const key = a.row * C.COLS + a.col;
        if (!a.alive) {
          disp.delete(key);
          continue;
        }
        let d = disp.get(key);
        if (!d) disp.set(key, (d = { x: a.x, y: a.y }));
        d.x += (a.x - d.x) * k;
        d.y += (a.y - d.y) * k;
        const bob = Math.sin(time * 2.2 + a.col * 0.7 + a.row * 1.3) * 2;
        sprite(img[a.kind], a.frame, 2, d.x, d.y + bob, ALIEN_SIZE[a.kind]);
      }
    }

    function drawPlayer(game, dt) {
      const p = game.player;
      if (lastPlayerX !== null) playerVx += ((p.x - lastPlayerX) / Math.max(dt, 1e-3) - playerVx) * Math.min(1, dt * 12);
      lastPlayerX = p.x;
      if (!p.alive) return;
      const bank = Math.max(-1, Math.min(1, playerVx / C.PLAYER_SPEED));
      if (game.respawning && game.state === "intro" && game.frame % 20 < 7) return; // respawn blink
      ctx.save();
      ctx.translate(p.x, C.PLAYER_Y);
      // engine plumes, under the hull
      ctx.globalCompositeOperation = "lighter";
      for (const side of [-1, 1]) {
        const nx = side * 10 * (1 - Math.abs(bank) * 0.15), ny = 33;
        const len = 26 + Math.random() * 10;
        const gr = ctx.createLinearGradient(0, ny, 0, ny + len);
        gr.addColorStop(0, "rgba(190,230,255,0.9)");
        gr.addColorStop(0.3, "rgba(80,160,255,0.45)");
        gr.addColorStop(1, "rgba(40,90,255,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.ellipse(nx, ny + len / 2, 5.5, len / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.scale(1 - Math.abs(bank) * 0.1, 1); // roll into turns
      sprite(img.player, 0, 1, 0, 0, PLAYER_SIZE);
      ctx.restore();
    }

    function drawUfo(game) {
      if (!game.ufo) return;
      const f = Math.floor(time * 8) % 2;
      sprite(img.mothership, f, 2, game.ufo.x, C.UFO_Y, UFO_SIZE);
    }

    function drawShots(game) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      if (game.shot) {
        sprite(img.boltPlayer, 0, 1, game.shot.x, game.shot.y, 18);
        ctx.globalAlpha = 0.5;
        sprite(img.flare, 0, 1, game.shot.x, game.shot.y - 20, 40);
        ctx.globalAlpha = 1;
      }
      for (const s of game.alienShots) {
        const w = s.type === "rolling" ? 26 : s.type === "plunger" ? 23 : 29;
        sprite(img.boltEnemy, Math.floor(s.age / 4) % 4, 4, s.x, s.y - 8, w);
      }
      ctx.restore();
    }

    function drawFx() {
      for (const e of fx.explosions) {
        if (e.t < 0) continue;
        const f = Math.min(15, Math.floor((e.t / e.dur) * 16));
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - e.t / e.dur) / 0.4); // smoke thins out at the end
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        sprite(img.explosion, f, 16, 0, 0, e.size, 4);
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const f of fx.flares) {
        const k = 1 - f.t / f.dur;
        ctx.globalAlpha = k;
        if (f.color) {
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size / 2);
          g.addColorStop(0, `rgba(${f.color},0.55)`);
          g.addColorStop(1, `rgba(${f.color},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
        } else sprite(img.flare, 0, 1, f.x, f.y, f.size * (0.7 + 0.3 * k));
      }
      ctx.globalAlpha = 1;
      for (const s of fx.sparks) {
        const k = 1 - s.age / s.life;
        ctx.strokeStyle = `rgba(${s.rgb},${k})`;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
        ctx.stroke();
      }
      ctx.restore();
    }

    function text(str, x, y, size, align = "left", alpha = 0.88, rgb = "210,225,255", weight = 600) {
      ctx.font = `${weight} ${size}px "Segoe UI", "Helvetica Neue", system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.fillText(str, x, y);
    }

    const pad = (n, len = 6) => String(n).padStart(len, "0").replace(/(\d{3})$/, " $1");

    function drawHud(game) {
      ctx.save();
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 6;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      text("SCORE  " + pad(game.score), 40, 26, 22);
      text("HI  " + pad(game.hiScore), C.W / 2, 26, 22, "center");
      text("WAVE " + game.wave, C.W - 40, 26, 22, "right");
      // reserve ships, bottom left, as in the arcade
      ctx.textBaseline = "middle";
      text(String(game.lives), 30, 978, 22);
      for (let i = 0; i < Math.min(game.lives - (game.player.alive ? 1 : 0), 6); i++)
        sprite(img.player, 0, 1, 70 + i * 36, 978, 30);
      for (const t of fx.texts) {
        const k = t.t / t.dur;
        text(t.text, t.x, t.y - k * 40, 30, "center", 1 - k * k, t.rgb, 700);
      }
      if (banner) {
        const k = banner.t / banner.dur;
        const a = Math.min(1, banner.t * 4) * Math.min(1, (1 - k) * 4);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "12px";
        text(banner.text, C.W / 2, 620, 44, "center", a * 0.95, "225,235,255", 600);
      }
      ctx.restore();
    }

    function drawVignette() {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    return {
      resize,
      toWorld,
      handle,
      reset(game) {
        resetBunkers(game);
        disp.clear();
        fx.explosions = [];
        fx.flares = [];
        fx.sparks = [];
        fx.texts = [];
        banner = null;
        lastPlayerX = null;
      },
      draw(game, dt, { hud = true } = {}) {
        time += dt;
        updateFx(dt);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingQuality = "high";
        drawBackdrop();
        const sx = (Math.random() - 0.5) * shake * scale, sy = (Math.random() - 0.5) * shake * scale;
        ctx.setTransform(scale, 0, 0, scale, ox + sx, oy + sy);
        drawBunkers(game);
        drawAliens(game, dt);
        drawUfo(game);
        drawPlayer(game, dt);
        drawShots(game);
        drawFx();
        if (hud) drawHud(game);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawVignette();
      },
    };
  };
})(window.AR);

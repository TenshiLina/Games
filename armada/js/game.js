/* Armada — rules and simulation. No DOM here, so it runs headless in tests.
 *
 * The game advances in fixed 60 Hz steps and follows the 1978 arcade closely:
 * invaders move one at a time (a "ripple" through the rack), which is what
 * makes the march speed up as they thin out; the rack freezes while a hit
 * invader explodes; aliens fire three kinds of shot from fixed column tables;
 * the mothership's value depends on how many shots you have fired.
 */
(function (root) {
  "use strict";

  const AR = (root.AR = root.AR || {});

  // World units: the playfield is 1600 × 1000.
  const C = (AR.C = {
    W: 1600,
    H: 1000,
    COLS: 11,
    ROWS: 5,
    COL_DX: 96,
    ROW_DY: 72,
    STEP: 20, // sideways move of one invader
    DROP: 31, // move down at the edge
    EDGE_L: 80,
    EDGE_R: 1520,
    EDGE_HALF: 40, // half-width used for the edge test
    FIRST_X: 160, // x of the leftmost column at the start of a wave (the rack starts at the left, as in the arcade)
    BOTTOM_ROW_Y: 488, // y of the bottom row in wave 1
    WAVE_DROPS: [0, 2, 3, 4, 4, 4, 5, 5, 5], // later waves start this many drops lower
    PLAYER_Y: 900,
    PLAYER_MIN_X: 70,
    PLAYER_MAX_X: 1530,
    PLAYER_SPEED: 480, // units per second
    PLAYER_HALF: [40, 28],
    INVASION_Y: 850, // an invader's lower edge reaching this line ends the game
    SHOT_SPEED: 1150,
    ALIEN_SHOT_SPEED: 330,
    ALIEN_SHOT_SPEED_FAST: 400, // when 8 or fewer invaders remain
    UFO_Y: 110,
    UFO_SPEED: 300,
    UFO_HALF: [58, 26],
    UFO_INTERVAL: 1536, // frames between mothership passes
    BUNKER_XS: [320, 640, 960, 1280],
    BUNKER_Y: 780,
    BUNKER_W: 160,
    BUNKER_H: 116,
    CELL: 4, // bunker mask resolution in world units
    EXTRA_LIFE_AT: 1500,
    LIVES: 3,
    KILL_FREEZE: 16, // frames the rack pauses while an invader explodes
    DEATH_FRAMES: 110,
    RESPAWN_FRAMES: 50,
    WAVE_INTRO_FRAMES: 80,
    WAVE_CLEAR_FRAMES: 110,
  });
  const DT = (AR.DT = 1 / 60);

  // Invader classes by row (row 0 is the bottom of the rack).
  const KINDS = (AR.KINDS = {
    octopus: { points: 10, half: [36, 26] },
    crab: { points: 20, half: [34, 26] },
    squid: { points: 30, half: [27, 28] },
  });
  const ROW_KIND = ["octopus", "octopus", "crab", "crab", "squid"];

  // Arcade tables.
  const UFO_SCORES = (AR.UFO_SCORES = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100]);
  const PLUNGER_COLS = [1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8];
  const SQUIGGLY_COLS = [11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10];
  // Frames between alien shots, by score.
  AR.reloadFrames = (score) => (score < 200 ? 48 : score < 1000 ? 16 : score < 2000 ? 11 : score < 3000 ? 8 : 7);
  AR.ufoScore = (shots) => UFO_SCORES[shots % 15];

  // The arcade bunker's footprint, in bunker-local units (0..W, 0..H from the
  // top left). Mirrors arch() in tools/bake/assets-world.js; the game builds
  // the real mask from the sprite's alpha when the art is loaded.
  AR.archShape = function (lx, ly) {
    const x = (lx / C.BUNKER_W - 0.5) * 2 * 1.0725;
    const y = (0.5 - ly / C.BUNKER_H) * 2 * 0.78;
    const ax = Math.abs(x);
    if (ax > 1 || Math.abs(y) > 0.7) return false;
    if (ax + y > 1.32) return false; // chamfered top corners
    if (ax < 0.42 && y < -0.3 && ax + y < -0.02) return false; // the notch
    return true;
  };

  function makeRandom(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  AR.createGame = function (opts = {}) {
    const random = opts.random || Math.random;
    const bunkerShape = opts.bunkerShape || AR.archShape;
    const MW = Math.round(C.BUNKER_W / C.CELL), MH = Math.round(C.BUNKER_H / C.CELL);

    const g = {
      score: 0,
      hiScore: opts.hiScore || 0,
      lives: C.LIVES,
      wave: 0,
      frame: 0,
      state: "intro", // intro | playing | dying | cleared | over
      timer: 0,
      aliens: [],
      cursor: 0,
      dir: 1,
      dropping: false,
      freeze: 0,
      marchNote: 0,
      player: { x: 200, alive: true },
      respawning: false, // true during the post-death intro, when the ship blinks
      shot: null, // the player's single shot
      shotsFired: 0,
      alienShots: [],
      alienShotTimer: 0,
      plungerIdx: 0,
      squigglyIdx: 0,
      ufo: null,
      ufoTimer: C.UFO_INTERVAL,
      bunkers: [],
      extraLifeGiven: false,
      events: [],
      maskW: MW,
      maskH: MH,
    };

    const emit = (type, data) => g.events.push(Object.assign({ type }, data));

    // ───────────── setup ─────────────

    function buildBunkers() {
      g.bunkers = C.BUNKER_XS.map((x) => {
        const mask = new Uint8Array(MW * MH);
        for (let j = 0; j < MH; j++)
          for (let i = 0; i < MW; i++) mask[j * MW + i] = bunkerShape((i + 0.5) * C.CELL, (j + 0.5) * C.CELL) ? 1 : 0;
        return { x: x - C.BUNKER_W / 2, y: C.BUNKER_Y - C.BUNKER_H / 2, mask };
      });
    }

    function buildRack() {
      const drops = C.WAVE_DROPS[Math.min(g.wave - 1, C.WAVE_DROPS.length - 1)];
      const bottom = C.BOTTOM_ROW_Y + drops * C.DROP;
      g.aliens = [];
      for (let r = 0; r < C.ROWS; r++)
        for (let c = 0; c < C.COLS; c++) {
          const kind = ROW_KIND[r];
          g.aliens.push({ row: r, col: c, kind, x: C.FIRST_X + c * C.COL_DX, y: bottom - r * C.ROW_DY, alive: true, frame: 0 });
        }
      g.cursor = 0;
      g.dir = 1;
      g.dropping = false;
      g.freeze = 0;
    }

    function startWave() {
      g.wave++;
      buildRack();
      buildBunkers();
      g.shot = null;
      g.alienShots = [];
      g.ufo = null;
      g.ufoTimer = C.UFO_INTERVAL;
      g.shotsFired = 0;
      g.alienShotTimer = 0;
      g.player.x = 200;
      g.player.alive = true;
      g.respawning = false;
      g.state = "intro";
      g.timer = C.WAVE_INTRO_FRAMES;
      emit("wave", { wave: g.wave });
    }

    // ───────────── helpers ─────────────

    const aliveAliens = () => g.aliens.filter((a) => a.alive);
    g.aliveCount = () => g.aliens.reduce((n, a) => n + (a.alive ? 1 : 0), 0);

    function addScore(n) {
      g.score += n;
      if (!g.extraLifeGiven && g.score >= C.EXTRA_LIFE_AT) {
        g.extraLifeGiven = true;
        g.lives++;
        emit("extraLife", {});
      }
      if (g.score > g.hiScore) g.hiScore = g.score;
    }

    const overlaps = (ax, ay, ahw, ahh, bx, by, bhw, bhh) =>
      Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;

    // Is there solid bunker at world point (x, y)? Returns [bunker, i, j] or null.
    function bunkerAt(x, y) {
      for (const b of g.bunkers) {
        const i = Math.floor((x - b.x) / C.CELL), j = Math.floor((y - b.y) / C.CELL);
        if (i >= 0 && i < MW && j >= 0 && j < MH && b.mask[j * MW + i]) return b;
      }
      return null;
    }

    // Blast a ragged crater into a bunker and tell the renderer its exact shape.
    function crater(b, x, y, radius, stretchDown) {
      const radii = [];
      for (let k = 0; k < 12; k++) radii.push(radius * (0.55 + 0.6 * random()));
      const lx = x - b.x, ly = y - b.y;
      const r = (ang) => {
        const t = ((ang / (Math.PI * 2)) * 12 + 12) % 12;
        const k0 = Math.floor(t), f = t - k0;
        return radii[k0] * (1 - f) + radii[(k0 + 1) % 12] * f;
      };
      const reach = radius * 1.2 * (1 + stretchDown);
      for (let j = Math.max(0, Math.floor((ly - reach) / C.CELL)); j < Math.min(MH, Math.ceil((ly + reach) / C.CELL)); j++)
        for (let i = Math.max(0, Math.floor((lx - reach) / C.CELL)); i < Math.min(MW, Math.ceil((lx + reach) / C.CELL)); i++) {
          const dx = (i + 0.5) * C.CELL - lx;
          let dy = (j + 0.5) * C.CELL - ly;
          if (dy > 0) dy /= 1 + stretchDown;
          if (Math.hypot(dx, dy) < r(Math.atan2(dy, dx))) b.mask[j * MW + i] = 0;
        }
      emit("crater", { bunker: g.bunkers.indexOf(b), x: lx, y: ly, radii, stretchDown });
    }

    // Walk a moving point along its path this step; stop at the first solid cell.
    function sweepBunkers(x, y0, y1) {
      const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / (C.CELL * 0.75)));
      for (let k = 1; k <= n; k++) {
        const y = y0 + ((y1 - y0) * k) / n;
        const b = bunkerAt(x, y);
        if (b) return { b, y };
      }
      return null;
    }

    // ───────────── the rack ─────────────

    function stepRack() {
      if (g.freeze > 0) {
        g.freeze--;
        return;
      }
      const n = g.aliens.length;
      let i = g.cursor;
      while (i < n && !g.aliens[i].alive) i++;
      if (i >= n) {
        endOfPass();
        i = 0;
        while (i < n && !g.aliens[i].alive) i++;
        if (i >= n) return;
      }
      const a = g.aliens[i];
      if (g.dropping) a.y += C.DROP;
      else a.x += g.dir * C.STEP * (g.dir > 0 && g.aliveCount() === 1 ? 1.5 : 1);
      a.frame ^= 1;
      g.cursor = i + 1;
      // invaders plough through bunkers they touch
      for (const b of g.bunkers) eraseRect(b, a);
      if (a.y + KINDS[a.kind].half[1] >= C.INVASION_Y) invade();
    }

    function endOfPass() {
      emit("march", { note: g.marchNote });
      g.marchNote = (g.marchNote + 1) % 4;
      if (g.dropping) {
        g.dropping = false;
        g.dir = -g.dir;
        return;
      }
      const hit = aliveAliens().some((a) =>
        g.dir > 0 ? a.x + C.EDGE_HALF >= C.EDGE_R : a.x - C.EDGE_HALF <= C.EDGE_L
      );
      if (hit) g.dropping = true;
    }

    function eraseRect(b, a) {
      const [hw, hh] = KINDS[a.kind].half;
      const x0 = a.x - hw - b.x, x1 = a.x + hw - b.x, y0 = a.y - hh - b.y, y1 = a.y + hh - b.y;
      if (x1 < 0 || y1 < 0 || x0 > C.BUNKER_W || y0 > C.BUNKER_H) return;
      let any = false;
      for (let j = Math.max(0, Math.floor(y0 / C.CELL)); j < Math.min(MH, Math.ceil(y1 / C.CELL)); j++)
        for (let i = Math.max(0, Math.floor(x0 / C.CELL)); i < Math.min(MW, Math.ceil(x1 / C.CELL)); i++)
          if (b.mask[j * MW + i]) {
            b.mask[j * MW + i] = 0;
            any = true;
          }
      if (any) emit("erase", { bunker: g.bunkers.indexOf(b), x0, y0, x1, y1 });
    }

    function invade() {
      if (g.state === "over") return;
      g.lives = 0;
      killPlayer(true);
    }

    // ───────────── alien fire ─────────────

    function lowestInColumn(col) {
      let best = null;
      for (const a of g.aliens) if (a.alive && a.col === col && (!best || a.y > best.y)) best = a;
      return best;
    }

    function stepAlienFire() {
      g.alienShotTimer++;
      const type = ["rolling", "plunger", "squiggly"][g.frame % 3];
      if (g.alienShots.some((s) => s.type === type)) return;
      if (g.alienShotTimer < AR.reloadFrames(g.score)) return;
      const alive = g.aliveCount();
      let col;
      if (type === "rolling") {
        // aimed: the column closest to the player
        let bestD = Infinity;
        for (const a of g.aliens)
          if (a.alive && Math.abs(a.x - g.player.x) < bestD) {
            bestD = Math.abs(a.x - g.player.x);
            col = a.col;
          }
      } else if (type === "plunger") {
        if (alive === 1) return;
        col = PLUNGER_COLS[g.plungerIdx] - 1;
        g.plungerIdx = (g.plungerIdx + 1) % PLUNGER_COLS.length;
      } else {
        if (g.ufo) return; // the squiggly shot shares its slot with the mothership
        col = SQUIGGLY_COLS[g.squigglyIdx] - 1;
        g.squigglyIdx = (g.squigglyIdx + 1) % SQUIGGLY_COLS.length;
      }
      const a = col === undefined ? null : lowestInColumn(col);
      if (!a) return;
      g.alienShots.push({ type, x: a.x, y: a.y + KINDS[a.kind].half[1], age: 0 });
      g.alienShotTimer = 0;
      emit("alienFire", { type, x: a.x, y: a.y });
    }

    function stepAlienShots() {
      const speed = (g.aliveCount() <= 8 ? C.ALIEN_SHOT_SPEED_FAST : C.ALIEN_SHOT_SPEED) * DT;
      for (const s of g.alienShots) {
        const y0 = s.y;
        s.y += speed;
        s.age++;
        const hit = sweepBunkers(s.x, y0, s.y + 16);
        if (hit) {
          crater(hit.b, s.x, hit.y, 13, 0.6);
          emit("impact", { x: s.x, y: hit.y, on: "bunker", alien: true });
          s.dead = true;
          continue;
        }
        if (g.player.alive && g.state === "playing" &&
            overlaps(s.x, s.y, 6, 16, g.player.x, C.PLAYER_Y, C.PLAYER_HALF[0], C.PLAYER_HALF[1])) {
          s.dead = true;
          killPlayer(false);
          continue;
        }
        if (s.y > C.H - 30) {
          s.dead = true;
          emit("impact", { x: s.x, y: C.H - 30, on: "ground", alien: true });
        }
      }
      g.alienShots = g.alienShots.filter((s) => !s.dead);
    }

    // ───────────── the player ─────────────

    function stepPlayer(input) {
      const p = g.player;
      if (!p.alive) return;
      const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (input.targetX != null) {
        const d = input.targetX - p.x;
        p.x += Math.sign(d) * Math.min(Math.abs(d), C.PLAYER_SPEED * DT);
      } else p.x += dx * C.PLAYER_SPEED * DT;
      p.x = Math.max(C.PLAYER_MIN_X, Math.min(C.PLAYER_MAX_X, p.x));
      if (input.fire && !g.shot && g.state === "playing") {
        g.shot = { x: p.x, y: C.PLAYER_Y - 44 };
        g.shotsFired++;
        emit("fire", { x: p.x, y: g.shot.y });
      }
    }

    function stepShot() {
      const s = g.shot;
      if (!s) return;
      const y0 = s.y;
      s.y -= C.SHOT_SPEED * DT;
      // alien shots can be shot down
      for (const a of g.alienShots)
        if (Math.abs(a.x - s.x) < 10 && a.y + 16 > s.y && a.y - 16 < y0) {
          a.dead = true;
          g.alienShots = g.alienShots.filter((q) => !q.dead);
          g.shot = null;
          emit("impact", { x: s.x, y: a.y, on: "shot" });
          return;
        }
      const hit = sweepBunkers(s.x, y0, s.y - 16);
      if (hit) {
        crater(hit.b, s.x, hit.y, 11, 0);
        emit("impact", { x: s.x, y: hit.y, on: "bunker" });
        g.shot = null;
        return;
      }
      for (const a of g.aliens) {
        if (!a.alive) continue;
        const [hw, hh] = KINDS[a.kind].half;
        if (Math.abs(a.x - s.x) < hw + 3 && s.y - 16 < a.y + hh && y0 > a.y - hh) {
          a.alive = false;
          g.shot = null;
          g.freeze = C.KILL_FREEZE;
          addScore(KINDS[a.kind].points);
          emit("kill", { x: a.x, y: a.y, kind: a.kind, points: KINDS[a.kind].points });
          if (g.aliveCount() === 0) {
            g.state = "cleared";
            g.timer = C.WAVE_CLEAR_FRAMES;
            g.alienShots = [];
            emit("waveCleared", { wave: g.wave });
          }
          return;
        }
      }
      if (g.ufo && overlaps(s.x, s.y, 3, 16, g.ufo.x, C.UFO_Y, C.UFO_HALF[0], C.UFO_HALF[1])) {
        const pts = AR.ufoScore(g.shotsFired);
        addScore(pts);
        emit("ufoKill", { x: g.ufo.x, y: C.UFO_Y, points: pts });
        g.ufo = null;
        g.shot = null;
        return;
      }
      if (s.y < 70) {
        emit("impact", { x: s.x, y: 70, on: "top" });
        g.shot = null;
      }
    }

    function killPlayer(invasion) {
      if (!g.player.alive) return;
      g.player.alive = false;
      g.lives = Math.max(0, invasion ? 0 : g.lives - 1);
      g.state = "dying";
      g.timer = C.DEATH_FRAMES;
      g.shot = null;
      emit("playerDeath", { x: g.player.x, y: C.PLAYER_Y, invasion });
    }

    // ───────────── mothership ─────────────

    function stepUfo() {
      if (g.ufo) {
        g.ufo.x += g.ufo.dir * C.UFO_SPEED * DT;
        if (g.ufo.x < -80 || g.ufo.x > C.W + 80) {
          g.ufo = null;
          emit("ufoGone", {});
        }
        return;
      }
      if (--g.ufoTimer > 0) return;
      g.ufoTimer = C.UFO_INTERVAL;
      if (g.aliveCount() < 8) return;
      // which side it enters from follows the parity of shots fired
      const dir = g.shotsFired % 2 === 0 ? 1 : -1;
      g.ufo = { x: dir > 0 ? -70 : C.W + 70, dir };
      emit("ufo", { dir });
    }

    // ───────────── main step ─────────────

    g.step = function (input = {}) {
      g.frame++;
      switch (g.state) {
        case "intro":
          stepPlayer(input);
          if (--g.timer <= 0) g.state = "playing";
          break;
        case "playing":
          stepPlayer(input);
          stepShot();
          if (g.state !== "playing") break;
          stepRack();
          if (g.state !== "playing") break;
          stepAlienFire();
          stepAlienShots();
          stepUfo();
          break;
        case "dying":
          // everything holds still while the ship burns, as in the arcade
          if (--g.timer <= 0) {
            g.alienShots = [];
            if (g.lives <= 0) {
              g.state = "over";
              emit("gameOver", { score: g.score });
            } else {
              g.player.alive = true;
              g.player.x = 200;
              g.respawning = true;
              g.state = "intro";
              g.timer = C.RESPAWN_FRAMES;
              emit("respawn", {});
            }
          }
          break;
        case "cleared":
          stepPlayer(input); // free to move, but no new shots
          stepShot();
          if (g.ufo) stepUfo();
          if (--g.timer <= 0) startWave();
          break;
        case "over":
          break;
      }
    };

    g.random = random;
    startWave();
    return g;
  };

  AR.makeRandom = makeRandom;
})(typeof window !== "undefined" ? window : globalThis);

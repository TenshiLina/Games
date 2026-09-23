/* Glassfall — game loop, input, animation and HUD. */
(function (GF) {
  "use strict";

  const COLS = 8;
  const ROWS = 16;
  const DAS = 0.15; // delay before a held move starts repeating
  const ARR = 0.045; // repeat interval once it does
  const CLEAR_TIME = 0.42;
  const BEST_KEY = "glassfall.highScore";

  const $ = (id) => document.getElementById(id);
  const ui = {
    board: $("board"),
    hold: $("hold"),
    next: $("next"),
    well: $("well"),
    badge: $("chain-badge"),
    overlay: $("overlay"),
    overlayTitle: $("overlay-title"),
    overlayText: $("overlay-text"),
    overlayBtn: $("overlay-btn"),
    primary: $("btn-primary"),
    restart: $("btn-restart"),
    score: $("score"),
    level: $("level"),
    lines: $("lines"),
    popped: $("popped"),
    bestChain: $("best-chain"),
    highScore: $("high-score"),
  };

  const touchFirst = window.matchMedia("(pointer: coarse)").matches;

  let game = GF.createGame({ cols: COLS, rows: ROWS });
  let mode = "ready"; // ready | playing | resolving | paused | over
  let pausedFrom = null;
  let steps = [];
  let stepIndex = 0;
  let stepTime = 0;
  let particles = [];
  let texts = [];
  let cell = 34;
  let boardCtx = null;
  let holdCanvas = null;
  let nextCanvas = null;
  let highScore = loadHighScore();

  const keys = { left: false, right: false, down: false };
  let dasDir = 0;
  let dasTimer = 0;
  let arrTimer = 0;

  // ───────────────────────── Persistence ─────────────────────────

  function loadHighScore() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveHighScore() {
    if (game.score <= highScore) return;
    highScore = game.score;
    try {
      localStorage.setItem(BEST_KEY, String(highScore));
    } catch (e) {
      /* storage unavailable: keep it for this session only */
    }
  }

  // ───────────────────────── Game flow ─────────────────────────

  function startGame() {
    game = GF.createGame({ cols: COLS, rows: ROWS });
    particles = [];
    texts = [];
    steps = [];
    game.spawn();
    mode = "playing";
    updateHud(game);
    syncUi();
  }

  function pause() {
    if (mode !== "playing" && mode !== "resolving") return;
    pausedFrom = mode;
    mode = "paused";
    keys.left = keys.right = keys.down = false;
    dasDir = 0;
    syncUi();
  }

  function resume() {
    if (mode !== "paused") return;
    mode = pausedFrom;
    syncUi();
  }

  function gameOver() {
    mode = "over";
    saveHighScore();
    updateHud(game);
    syncUi();
  }

  function primaryAction() {
    if (mode === "ready" || mode === "over") startGame();
    else if (mode === "paused") resume();
    else pause();
  }

  function beginResolve(result) {
    if (!result) return;
    mode = "resolving";
    steps = result.steps;
    stepIndex = -1;
    nextStep();
  }

  function nextStep() {
    stepIndex++;
    stepTime = 0;
    if (stepIndex >= steps.length) {
      finishResolve();
      return;
    }
    const st = steps[stepIndex];
    if (st.type === "fall") {
      const maxDist = Math.max(...st.moves.map((m) => m.to - m.from));
      st.duration = Math.min(0.32, 0.08 + maxDist * 0.03);
    } else {
      st.duration = CLEAR_TIME;
      celebrate(st);
      updateHud(st.totals);
    }
  }

  function finishResolve() {
    steps = [];
    updateHud(game);
    if (game.over || !game.spawn()) {
      gameOver();
      return;
    }
    mode = "playing";
  }

  function celebrate(st) {
    let cx = 0;
    let cy = 0;
    for (const c of st.cells) {
      cx += c.x;
      cy += c.y;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = cell * (2 + Math.random() * 4);
        particles.push({
          x: (c.x + 0.5) * cell,
          y: (c.y + 0.5) * cell,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - cell * 3,
          r: cell * (0.07 + Math.random() * 0.08),
          color: c.color,
          life: 0.5 + Math.random() * 0.35,
          maxLife: 0.85,
        });
      }
    }
    const n = st.cells.length;
    texts.push({
      x: (cx / n + 0.5) * cell,
      y: (cy / n + 0.5) * cell,
      text: "+" + st.points.toLocaleString(),
      age: 0,
      life: 1,
    });
    if (st.chain >= 2) {
      ui.badge.innerHTML = '<span class="n">' + st.chain + "</span> Chain!";
      ui.badge.classList.remove("show");
      void ui.badge.offsetWidth; // restart the animation
      ui.badge.classList.add("show");
    }
  }

  // ───────────────────────── Per-frame updates ─────────────────────────

  function updatePlaying(dt) {
    if (dasDir) {
      dasTimer += dt;
      if (dasTimer >= DAS) {
        arrTimer += dt;
        while (arrTimer >= ARR) {
          arrTimer -= ARR;
          if (!game.move(dasDir)) {
            arrTimer = 0;
            break;
          }
        }
      }
    }
    beginResolve(game.step(dt, keys.down));
  }

  function updateResolving(dt) {
    stepTime += dt;
    if (stepTime >= steps[stepIndex].duration) nextStep();
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.vy += cell * 22 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const t of texts) t.age += dt;
    texts = texts.filter((t) => t.age < t.life);
  }

  // ───────────────────────── Drawing ─────────────────────────

  function boardView() {
    const view = { grid: game.grid, s: cell, particles, texts };
    if (mode === "playing" || (mode === "paused" && pausedFrom === "playing")) {
      view.piece = game.activeCells();
      view.ghost = game.ghostCells();
    } else if ((mode === "resolving" || mode === "paused") && steps[stepIndex]) {
      const st = steps[stepIndex];
      const t = Math.min(1, stepTime / st.duration);
      view.grid = st.grid;
      if (st.type === "fall") {
        const e = t * t; // accelerate like gravity
        view.hide = new Set(st.moves.map((m) => m.x + "," + m.from));
        view.falling = st.moves.map((m) => ({
          x: m.x,
          y: m.from + (m.to - m.from) * e,
          color: m.color,
          tx: m.x,
          ty: m.to,
          d: m.to - m.from,
        }));
      } else {
        view.hide = new Set(st.cells.map((c) => c.x + "," + c.y));
        view.popping = st.cells.map((c) => ({ x: c.x, y: c.y, color: c.color, t }));
        view.flash = st.rows.map((y) => ({ y, t }));
      }
    }
    return view;
  }

  function draw() {
    GF.drawBoard(boardCtx, boardView());

    const h = holdCanvas;
    h.ctx.clearRect(0, 0, h.w, h.h);
    const hs = Math.min(26, h.h / 3, h.w / 5);
    GF.drawPieceCentered(h.ctx, game.previewCells(game.hold), h.w / 2, h.h / 2, hs, game.holdUsed ? 0.4 : 1);

    const n = nextCanvas;
    n.ctx.clearRect(0, 0, n.w, n.h);
    const upcoming = game.queue.slice(0, 3).map((p) => game.previewCells(p));
    if (window.innerWidth <= 760) {
      const ns = Math.min(14, n.h / 3.4);
      upcoming.forEach((cells, i) => GF.drawPieceCentered(n.ctx, cells, (n.w / 3) * (i + 0.5), n.h / 2, ns));
    } else {
      const slot = n.h / 3;
      upcoming.forEach((cells, i) => GF.drawPieceCentered(n.ctx, cells, n.w / 2, slot * (i + 0.5), i === 0 ? 24 : 20));
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === "playing") updatePlaying(dt);
    else if (mode === "resolving") updateResolving(dt);
    if (mode !== "paused") updateEffects(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ───────────────────────── HUD and overlay ─────────────────────────

  function updateHud(t) {
    ui.score.textContent = t.score.toLocaleString();
    ui.level.textContent = t.level;
    ui.lines.textContent = t.lines;
    ui.popped.textContent = t.popped;
    ui.bestChain.textContent = t.bestChain;
    ui.highScore.textContent = Math.max(highScore, t.score).toLocaleString();
  }

  const HELP_KEYS = "Clear full rows, or pop 4+ touching bubbles of one colour. Drops can set off chains!<br>← → move · ↑ rotate · Space drop · C hold";
  const HELP_TOUCH = "Clear full rows, or pop 4+ touching bubbles of one colour. Drops can set off chains!<br>Drag to move · Tap to rotate · Swipe down to drop · Swipe up to hold";

  function syncUi() {
    const labels = { ready: "Start", playing: "Pause", resolving: "Pause", paused: "Resume", over: "Play again" };
    ui.primary.textContent = labels[mode];
    if (mode === "playing" || mode === "resolving") {
      ui.overlay.hidden = true;
      return;
    }
    ui.overlay.hidden = false;
    ui.overlayBtn.textContent = labels[mode];
    if (mode === "ready") {
      ui.overlayTitle.textContent = "Glassfall";
      ui.overlayText.innerHTML = touchFirst ? HELP_TOUCH : HELP_KEYS;
    } else if (mode === "paused") {
      ui.overlayTitle.textContent = "Paused";
      ui.overlayText.textContent = "";
    } else {
      ui.overlayTitle.textContent = "Game Over";
      ui.overlayText.innerHTML =
        "Score <b>" + game.score.toLocaleString() + "</b><br>High score " + highScore.toLocaleString() +
        (game.score >= highScore && game.score > 0 ? " · New best!" : "");
    }
  }

  // ───────────────────────── Keyboard ─────────────────────────

  const GAME_KEYS = new Set([
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space",
    "KeyA", "KeyD", "KeyS", "KeyW", "KeyX", "KeyZ", "KeyC", "KeyP",
    "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Escape", "Enter",
  ]);

  function pressHorizontal(dir) {
    if (dir < 0) keys.left = true;
    else keys.right = true;
    dasDir = dir;
    dasTimer = 0;
    arrTimer = 0;
    if (mode === "playing") game.move(dir);
  }

  function releaseHorizontal(dir) {
    if (dir < 0) keys.left = false;
    else keys.right = false;
    if (dasDir === dir) {
      dasDir = keys.left ? -1 : keys.right ? 1 : 0;
      dasTimer = 0;
      arrTimer = 0;
    }
  }

  function hardDrop() {
    beginResolve(game.hardDrop());
  }

  function hold() {
    game.holdPiece();
    if (game.over) gameOver();
  }

  window.addEventListener("keydown", (e) => {
    if (!GAME_KEYS.has(e.code) || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (e.code === "KeyP" || e.code === "Escape") {
      if (mode === "paused") resume();
      else pause();
      return;
    }
    if (mode === "ready" || mode === "over" || mode === "paused") {
      if (!e.repeat && (e.code === "Enter" || e.code === "Space")) primaryAction();
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        pressHorizontal(-1);
        break;
      case "ArrowRight":
      case "KeyD":
        pressHorizontal(1);
        break;
      case "ArrowDown":
      case "KeyS":
        keys.down = true;
        break;
      default:
        if (mode !== "playing") break;
        if (e.code === "ArrowUp" || e.code === "KeyX" || e.code === "KeyW") game.rotate(1);
        else if (e.code === "KeyZ" || e.code.startsWith("Control")) game.rotate(-1);
        else if (e.code === "Space") hardDrop();
        else if (e.code === "KeyC" || e.code.startsWith("Shift")) hold();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") releaseHorizontal(-1);
    else if (e.code === "ArrowRight" || e.code === "KeyD") releaseHorizontal(1);
    else if (e.code === "ArrowDown" || e.code === "KeyS") keys.down = false;
  });

  // ───────────────────────── Touch / pointer gestures ─────────────────────────

  // Drag sideways to move, drag down slowly to soft drop, flick down to hard
  // drop, flick up to hold, tap to rotate (right half clockwise, left half back).
  const FLICK_SPEED = 0.8; // px per ms
  let gesture = null;

  function recentVelocity(g, now) {
    const old = g.samples.find((s) => now - s.t <= 120) || g.samples[0];
    const last = g.samples[g.samples.length - 1];
    const dt = Math.max(1, last.t - old.t);
    return { vx: (last.x - old.x) / dt, vy: (last.y - old.y) / dt };
  }

  ui.well.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || mode !== "playing") return;
    try {
      ui.well.setPointerCapture(e.pointerId);
    } catch (err) {
      /* pointer already gone; the gesture still works without capture */
    }
    const t = performance.now();
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, moved: false, samples: [{ t, x: e.clientX, y: e.clientY }] };
  });

  ui.well.addEventListener("pointermove", (e) => {
    if (!gesture || e.pointerId !== gesture.id || mode !== "playing") return;
    const now = performance.now();
    gesture.samples.push({ t: now, x: e.clientX, y: e.clientY });
    if (gesture.samples.length > 12) gesture.samples.shift();
    const step = cell * 0.9;
    while (e.clientX - gesture.ax >= step) {
      game.move(1);
      gesture.ax += step;
      gesture.moved = true;
    }
    while (gesture.ax - e.clientX >= step) {
      game.move(-1);
      gesture.ax -= step;
      gesture.moved = true;
    }
    // Slow downward drags soft-drop a row per cell dragged; a fast flick waits for release.
    const fast = recentVelocity(gesture, now).vy > FLICK_SPEED;
    while (e.clientY - gesture.ay >= step) {
      if (!fast) game.softDrop();
      gesture.ay += step;
      gesture.moved = true;
    }
  });

  function endGesture(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (mode !== "playing" || e.type === "pointercancel") return;
    g.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    const v = recentVelocity(g, performance.now());
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.5;
    if (vertical && dy > cell && v.vy > FLICK_SPEED) {
      hardDrop();
    } else if (vertical && -dy > cell && -v.vy > FLICK_SPEED) {
      hold();
    } else if (!g.moved && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const rect = ui.well.getBoundingClientRect();
      game.rotate(e.clientX >= rect.left + rect.width / 2 ? 1 : -1);
    }
  }
  ui.well.addEventListener("pointerup", endGesture);
  ui.well.addEventListener("pointercancel", endGesture);

  // ───────────────────────── Buttons, focus, layout ─────────────────────────

  function onButton(btn, fn) {
    btn.addEventListener("click", () => {
      fn();
      btn.blur(); // keep Space for hard drop, not for re-clicking the button
    });
  }
  onButton(ui.primary, primaryAction);
  onButton(ui.overlayBtn, primaryAction);
  onButton(ui.restart, startGame);

  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  function cellSize() {
    const narrow = window.innerWidth <= 760;
    const byH = (window.innerHeight - (narrow ? 250 : 190)) / ROWS;
    const byW = (window.innerWidth - (narrow ? 52 : 500)) / COLS;
    return Math.max(16, Math.min(38, Math.floor(Math.min(byH, byW))));
  }

  function layout() {
    const s = cellSize();
    // Rescale in-flight effects so they stay attached to the board.
    const k = s / cell;
    for (const p of particles) {
      p.x *= k;
      p.y *= k;
    }
    for (const t of texts) {
      t.x *= k;
      t.y *= k;
    }
    cell = s;
    document.documentElement.style.setProperty("--cell", s + "px");
    boardCtx = GF.setupCanvas(ui.board).ctx;
    holdCanvas = GF.setupCanvas(ui.hold);
    nextCanvas = GF.setupCanvas(ui.next);
  }

  function spawnBubbles() {
    const host = document.getElementById("bubbles");
    for (let i = 0; i < 16; i++) {
      const b = document.createElement("span");
      const size = 14 + Math.random() * 46;
      b.style.width = b.style.height = size + "px";
      b.style.left = Math.random() * 100 + "%";
      b.style.animationDuration = 14 + Math.random() * 18 + "s";
      b.style.animationDelay = -Math.random() * 30 + "s";
      host.appendChild(b);
    }
  }

  spawnBubbles();
  layout();
  window.addEventListener("resize", layout);
  updateHud(game);
  syncUi();
  requestAnimationFrame(frame);

  // Exposed for automated checks.
  GF.debug = {
    get game() { return game; },
    get mode() { return mode; },
    // Settle whatever is on the board, animating it like a lock.
    resolveNow() {
      game.active = null;
      beginResolve({ steps: game.resolve(), lockOut: false });
    },
  };
})(window.GF);

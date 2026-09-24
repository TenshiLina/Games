/* Armada — game loop, input, overlays and high score. */
(function (AR) {
  "use strict";

  const HI_KEY = "armada.hiScore";
  const $ = (id) => document.getElementById(id);
  const ui = {
    canvas: $("game"),
    overlay: $("overlay"),
    card: document.querySelector(".card"),
    title: $("overlay-title"),
    text: $("overlay-text"),
    btn: $("overlay-btn"),
    hi: $("overlay-hi"),
    pause: $("btn-pause"),
  };

  let mode = "loading"; // loading | ready | playing | paused | over
  let game = null;
  let renderer = null;
  let bunkerShape = null;
  let last = 0;
  let acc = 0;

  const keys = { left: false, right: false, fire: false };
  const touch = { id: null, x: null };

  // ───────────── persistence ─────────────

  function loadHi() {
    try {
      return Number(localStorage.getItem(HI_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }
  function saveHi() {
    try {
      if (game.hiScore > loadHi()) localStorage.setItem(HI_KEY, String(game.hiScore));
    } catch (e) {
      /* storage unavailable: keep it for this session only */
    }
  }

  // ───────────── flow ─────────────

  function newGame() {
    game = AR.createGame({ bunkerShape: bunkerShape || undefined, hiScore: loadHi() });
    renderer.reset(game);
    flushEvents();
  }

  function showOverlay(kind) {
    ui.overlay.classList.remove("hidden");
    ui.card.classList.toggle("compact", kind !== "ready");
    const hi = loadHi();
    ui.hi.textContent = hi ? "HIGH SCORE  " + hi : "";
    if (kind === "ready") {
      ui.title.textContent = "ARMADA";
      ui.text.textContent = "Hold the orbit line.";
      ui.btn.textContent = "Start";
    } else if (kind === "paused") {
      ui.title.textContent = "PAUSED";
      ui.text.textContent = "Wave " + game.wave + " · score " + game.score;
      ui.btn.textContent = "Resume";
    } else {
      const best = game.score >= hi && game.score > 0;
      ui.title.textContent = "GAME OVER";
      ui.text.textContent = (best ? "New high score: " : "Score: ") + game.score + " · wave " + game.wave;
      if (best) ui.hi.textContent = "";
      ui.btn.textContent = "Play again";
    }
    setTimeout(() => ui.btn.focus({ preventScroll: true }), 30);
  }

  function hideOverlay() {
    ui.overlay.classList.add("hidden");
    ui.btn.blur();
  }

  function setMode(m) {
    mode = m;
    document.body.classList.toggle("playing", m === "playing");
  }

  function start() {
    AR.audio.init();
    if (mode === "over") newGame();
    setMode("playing");
    hideOverlay();
    last = performance.now();
    acc = 0;
  }

  function pause() {
    if (mode !== "playing") return;
    setMode("paused");
    saveHi();
    AR.audio.stopAll();
    showOverlay("paused");
  }

  function resume() {
    if (mode !== "paused") return;
    AR.audio.init();
    setMode("playing");
    hideOverlay();
    if (game.ufo) AR.audio.play({ type: "ufo" });
    last = performance.now();
  }

  function primary() {
    if (mode === "ready" || mode === "over") start();
    else if (mode === "paused") resume();
  }

  function flushEvents() {
    for (const e of game.events) {
      renderer.handle(e, game);
      if (mode === "playing") AR.audio.play(e);
      if (e.type === "gameOver") {
        saveHi();
        setMode("over");
        setTimeout(() => mode === "over" && showOverlay("over"), 900);
      }
    }
    game.events.length = 0;
  }

  // ───────────── loop ─────────────

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (mode === "playing" || mode === "over") {
      acc += dt;
      const input = {
        left: keys.left,
        right: keys.right,
        fire: keys.fire || touch.id !== null,
        targetX: touch.id !== null ? touch.x : null,
      };
      let n = 0;
      while (acc >= AR.DT && n++ < 8) {
        game.step(input);
        acc -= AR.DT;
        flushEvents();
      }
      if (n >= 8) acc = 0;
    }
    if (game) renderer.draw(game, mode === "paused" ? 0 : dt, { hud: mode !== "ready" });
    requestAnimationFrame(frame);
  }

  // ───────────── input ─────────────

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    Space: "fire", ArrowUp: "fire", KeyW: "fire", KeyZ: "fire", KeyX: "fire",
  };

  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (k && mode === "playing") {
      keys[k] = true;
      e.preventDefault();
      return;
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      mode === "playing" ? pause() : mode === "paused" && resume();
      e.preventDefault();
    } else if (e.code === "KeyM") {
      AR.audio.toggleMute();
    } else if ((e.code === "Enter" || e.code === "Space") && mode !== "playing" && mode !== "loading") {
      primary();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });

  // Touch (or mouse drag): fly toward the finger, fire while it is down.
  ui.canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "playing" || touch.id !== null) return;
    touch.id = e.pointerId;
    touch.x = renderer.toWorld(e.clientX, e.clientY)[0];
    ui.canvas.setPointerCapture(e.pointerId);
  });
  ui.canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId === touch.id) touch.x = renderer.toWorld(e.clientX, e.clientY)[0];
  });
  const endTouch = (e) => {
    if (e.pointerId === touch.id) touch.id = null;
  };
  ui.canvas.addEventListener("pointerup", endTouch);
  ui.canvas.addEventListener("pointercancel", endTouch);

  ui.btn.addEventListener("click", primary);
  ui.pause.addEventListener("click", () => (mode === "playing" ? pause() : resume()));
  window.addEventListener("blur", () => {
    keys.left = keys.right = keys.fire = false;
    touch.id = null;
    pause();
  });
  document.addEventListener("visibilitychange", () => document.hidden && pause());
  window.addEventListener("resize", () => renderer && renderer.resize());

  // ───────────── boot ─────────────

  renderer = AR.createRenderer(ui.canvas);
  renderer.resize();
  AR.loadArt()
    .then(() => {
      bunkerShape = AR.bunkerShapeFromArt();
      newGame();
      setMode("ready");
      showOverlay("ready");
      last = performance.now();
      requestAnimationFrame(frame);
    })
    .catch((err) => {
      ui.title.textContent = "ARMADA";
      ui.text.textContent = err.message + ".";
      ui.btn.hidden = true;
    });

  // hook for automated checks
  window.__armada = {
    get game() { return game; },
    get mode() { return mode; },
    start,
    pause,
  };
})(window.AR);

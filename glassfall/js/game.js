/* Glassfall — game rules: pieces, movement, locking and board resolution.
 *
 * Pure logic with no DOM access, so it can be exercised headlessly. Time is
 * passed in explicitly through step(dt).
 */
(function (GF) {
  "use strict";

  const COLORS = ["aqua", "lime", "rose", "amber", "violet"];
  const LOCK_DELAY = 0.5;
  const MAX_LOCK_RESETS = 15;
  const SOFT_DROP_INTERVAL = 0.035;

  // Spawn orientation of each tetromino inside its rotation box.
  const SHAPES = {
    I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  const TYPES = Object.keys(SHAPES);

  // SRS wall kicks, written with y pointing up as in the guideline tables.
  const KICKS = {
    "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };

  const LINE_POINTS = [0, 100, 300, 500, 800];
  const CHAIN_MULT = [1, 2, 4, 8, 16];

  function lineBase(n) {
    return n <= 4 ? LINE_POINTS[n] : 800 + (n - 4) * 400;
  }

  function groupBonus(size) {
    if (size >= 7) return 50;
    if (size === 6) return 30;
    if (size === 5) return 20;
    return 0;
  }

  function createGame(opts) {
    opts = opts || {};
    const cols = opts.cols || 8;
    const rows = opts.rows || 16;
    const random = opts.random || Math.random;

    const g = {
      cols,
      rows,
      grid: emptyGrid(),
      active: null,
      hold: null,
      holdUsed: false,
      queue: [],
      score: 0,
      lines: 0,
      popped: 0,
      level: 1,
      bestChain: 0,
      over: false,
    };

    let bag = [];
    let fallAcc = 0;
    let lockTimer = 0;
    let lockResets = 0;
    let lowestY = 0;

    function emptyGrid() {
      return Array.from({ length: rows }, () => Array(cols).fill(null));
    }

    function copyGrid(grid) {
      return grid.map((row) => row.slice());
    }

    function shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    function colorCount() {
      return g.level >= 5 ? 5 : 4;
    }

    // Two colours per piece, split 2–2 or 3–1, so a piece never pops alone.
    function makePiece(type) {
      const shape = SHAPES[type];
      const palette = COLORS.slice(0, colorCount());
      const a = palette[Math.floor(random() * palette.length)];
      let b = a;
      while (b === a) b = palette[Math.floor(random() * palette.length)];
      const paint = shuffle(random() < 0.5 ? [a, a, b, b] : [a, a, a, b]);
      return {
        type,
        size: shape.size,
        base: shape.cells.map((c, i) => ({ x: c[0], y: c[1], color: paint[i] })),
        rot: 0,
        x: 0,
        y: 0,
      };
    }

    function refillQueue() {
      while (g.queue.length < 5) {
        if (!bag.length) bag = shuffle(TYPES.slice());
        g.queue.push(makePiece(bag.pop()));
      }
    }

    function cellsOf(piece, rot, px, py) {
      const n = piece.size;
      return piece.base.map((c) => {
        let x = c.x;
        let y = c.y;
        for (let i = 0; i < rot; i++) {
          const t = x;
          x = n - 1 - y;
          y = t;
        }
        return { x: px + x, y: py + y, color: c.color };
      });
    }

    function collides(cells) {
      for (const c of cells) {
        if (c.x < 0 || c.x >= cols || c.y >= rows) return true;
        if (c.y >= 0 && g.grid[c.y][c.x]) return true;
      }
      return false;
    }

    function placeAtSpawn(piece) {
      piece.rot = 0;
      piece.x = Math.floor((cols - piece.size) / 2);
      piece.y = -Math.min(...piece.base.map((c) => c.y));
      g.active = piece;
      fallAcc = 0;
      lockTimer = 0;
      lockResets = 0;
      lowestY = piece.y;
      if (collides(g.activeCells())) {
        g.over = true;
        return false;
      }
      return true;
    }

    function grounded() {
      const p = g.active;
      return collides(cellsOf(p, p.rot, p.x, p.y + 1));
    }

    // A successful move or rotation on the ground buys more lock time, up to a limit.
    function onShift() {
      if (grounded() && lockResets < MAX_LOCK_RESETS) {
        lockResets++;
        lockTimer = 0;
      }
    }

    function tryShift(dx, dy) {
      const p = g.active;
      if (!p || collides(cellsOf(p, p.rot, p.x + dx, p.y + dy))) return false;
      p.x += dx;
      p.y += dy;
      if (p.y > lowestY) {
        lowestY = p.y;
        lockResets = 0;
        lockTimer = 0;
      }
      return true;
    }

    function applyGravity() {
      const moves = [];
      for (let x = 0; x < cols; x++) {
        let write = rows - 1;
        for (let y = rows - 1; y >= 0; y--) {
          const color = g.grid[y][x];
          if (!color) continue;
          if (y !== write) {
            g.grid[write][x] = color;
            g.grid[y][x] = null;
            moves.push({ x, from: y, to: write, color });
          }
          write--;
        }
      }
      return moves;
    }

    function findClears() {
      const full = [];
      for (let y = 0; y < rows; y++) {
        if (g.grid[y].every(Boolean)) full.push(y);
      }
      const groups = [];
      const seen = new Set();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const color = g.grid[y][x];
          const key = y * cols + x;
          if (!color || seen.has(key)) continue;
          const group = [];
          const stack = [[x, y]];
          seen.add(key);
          while (stack.length) {
            const [cx, cy] = stack.pop();
            group.push({ x: cx, y: cy, color });
            for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              const k = ny * cols + nx;
              if (seen.has(k) || g.grid[ny][nx] !== color) continue;
              seen.add(k);
              stack.push([nx, ny]);
            }
          }
          if (group.length >= 4) groups.push(group);
        }
      }
      return { rows: full, groups };
    }

    // Settle the board after a lock: gravity, then clears, repeated as a chain.
    // Returns animation steps; each carries the board as it was before the step.
    function resolve() {
      const steps = [];
      let chain = 0;
      for (;;) {
        const beforeFall = copyGrid(g.grid);
        const moves = applyGravity();
        if (moves.length) steps.push({ type: "fall", grid: beforeFall, moves });

        const found = findClears();
        if (!found.rows.length && !found.groups.length) break;
        chain++;

        const snapshot = copyGrid(g.grid);
        const cleared = new Map();
        for (const y of found.rows) {
          for (let x = 0; x < cols; x++) cleared.set(y * cols + x, { x, y, color: g.grid[y][x] });
        }
        let popped = 0;
        let bonus = 0;
        for (const group of found.groups) {
          bonus += groupBonus(group.length);
          for (const c of group) {
            popped++;
            cleared.set(c.y * cols + c.x, c);
          }
        }
        const mult = CHAIN_MULT[Math.min(chain, CHAIN_MULT.length) - 1];
        const points = (lineBase(found.rows.length) + popped * 10 + bonus) * mult * g.level;

        for (const c of cleared.values()) g.grid[c.y][c.x] = null;
        g.score += points;
        g.lines += found.rows.length;
        g.popped += popped;
        g.bestChain = Math.max(g.bestChain, chain);
        g.level = 1 + Math.floor((g.lines * 4 + g.popped) / 40);

        steps.push({
          type: "clear",
          grid: snapshot,
          rows: found.rows,
          groups: found.groups,
          cells: [...cleared.values()],
          chain,
          points,
          totals: { score: g.score, lines: g.lines, popped: g.popped, level: g.level, bestChain: g.bestChain },
        });
      }
      return steps;
    }

    function lock() {
      let lockOut = false;
      for (const c of g.activeCells()) {
        if (c.y < 0) lockOut = true;
        else g.grid[c.y][c.x] = c.color;
      }
      g.active = null;
      g.holdUsed = false;
      const steps = resolve();
      if (lockOut) g.over = true;
      return { steps, lockOut };
    }

    g.activeCells = function () {
      const p = g.active;
      return p ? cellsOf(p, p.rot, p.x, p.y) : [];
    };

    g.ghostCells = function () {
      const p = g.active;
      if (!p) return [];
      let d = 0;
      while (!collides(cellsOf(p, p.rot, p.x, p.y + d + 1))) d++;
      return cellsOf(p, p.rot, p.x, p.y + d);
    };

    // Piece cells in spawn orientation, for previews.
    g.previewCells = function (piece) {
      return piece ? cellsOf(piece, 0, 0, 0) : [];
    };

    g.gravityInterval = function () {
      return Math.max(0.03, Math.pow(0.8 - (g.level - 1) * 0.007, g.level - 1));
    };

    g.spawn = function () {
      if (g.over) return false;
      refillQueue();
      const ok = placeAtSpawn(g.queue.shift());
      refillQueue();
      return ok;
    };

    g.move = function (dx) {
      if (!tryShift(dx, 0)) return false;
      onShift();
      return true;
    };

    g.rotate = function (dir) {
      const p = g.active;
      if (!p) return false;
      const to = (p.rot + (dir > 0 ? 1 : 3)) % 4;
      const kicks = p.type === "O" ? [[0, 0]] : (p.type === "I" ? KICKS_I : KICKS)[p.rot + ">" + to];
      for (const [kx, ky] of kicks) {
        if (!collides(cellsOf(p, to, p.x + kx, p.y - ky))) {
          p.rot = to;
          p.x += kx;
          p.y -= ky;
          if (p.y > lowestY) {
            lowestY = p.y;
            lockResets = 0;
            lockTimer = 0;
          }
          onShift();
          return true;
        }
      }
      return false;
    };

    g.softDrop = function () {
      if (!tryShift(0, 1)) return false;
      g.score += 1;
      return true;
    };

    g.hardDrop = function () {
      if (!g.active) return null;
      let d = 0;
      while (tryShift(0, 1)) d++;
      g.score += d * 2;
      return lock();
    };

    g.holdPiece = function () {
      if (!g.active || g.holdUsed) return false;
      const current = g.active;
      if (g.hold) {
        const next = g.hold;
        g.hold = current;
        placeAtSpawn(next);
      } else {
        g.hold = current;
        refillQueue();
        placeAtSpawn(g.queue.shift());
        refillQueue();
      }
      g.holdUsed = true;
      return true;
    };

    // Advance gravity and the lock timer. Returns a lock result when the piece locks.
    g.step = function (dt, softDrop) {
      if (!g.active || g.over) return null;
      const interval = softDrop ? Math.min(g.gravityInterval(), SOFT_DROP_INTERVAL) : g.gravityInterval();
      fallAcc += dt;
      while (fallAcc >= interval) {
        fallAcc -= interval;
        if (!tryShift(0, 1)) {
          fallAcc = 0;
          break;
        }
        if (softDrop) g.score += 1;
      }
      if (grounded()) {
        lockTimer += dt;
        if (lockTimer >= LOCK_DELAY) return lock();
      }
      return null;
    };

    // Test hook: replace the board contents.
    g.setGrid = function (grid) {
      g.grid = copyGrid(grid);
    };
    g.resolve = resolve;

    refillQueue();
    return g;
  }

  GF.COLORS = COLORS;
  GF.createGame = createGame;
})((globalThis.GF = globalThis.GF || {}));

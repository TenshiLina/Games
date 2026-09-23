/* Checkpoint 1: static visual mockup. Replaced by the real game loop later. */
(function (GF) {
  "use strict";

  const COLS = 8;
  const ROWS = 16;
  const KEY = { a: "aqua", l: "lime", r: "rose", m: "amber", v: "violet" };

  const LAYOUT = [
    "........", "........", "........", "........",
    "........", "........", "........", "........",
    "........", "........", "........",
    "......a.",
    "r.....am",
    "rrl..mma",
    "llla.mrr",
    "aalaalr.",
  ];

  const grid = LAYOUT.map((row) => [...row].map((ch) => KEY[ch] || null));

  // Falling T piece (two colours) and its landing ghost.
  const piece = [
    { x: 3, y: 1, color: "aqua" },
    { x: 4, y: 1, color: "aqua" },
    { x: 5, y: 1, color: "rose" },
    { x: 4, y: 2, color: "rose" },
  ];

  function dropDistance(cells) {
    let d = 0;
    const free = (c, k) => c.y + k < ROWS && !grid[c.y + k][c.x];
    while (cells.every((c) => free(c, d + 1))) d++;
    return d;
  }
  const dist = dropDistance(piece);
  const ghost = piece.map((c) => ({ x: c.x, y: c.y + dist, color: c.color }));

  // Highlight groups of 4+ that are about to pop.
  function poppableGroups() {
    const seen = new Set();
    const glow = new Set();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = grid[y][x];
        if (!color || seen.has(x + "," + y)) continue;
        const group = [];
        const stack = [[x, y]];
        seen.add(x + "," + y);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          group.push(cx + "," + cy);
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
            const k = nx + "," + ny;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(k)) continue;
            if (grid[ny][nx] !== color) continue;
            seen.add(k);
            stack.push([nx, ny]);
          }
        }
        if (group.length >= 4) group.forEach((k) => glow.add(k));
      }
    }
    return glow;
  }
  const glow = poppableGroups();

  const HOLD = [
    { x: 0, y: 0, color: "lime" }, { x: 1, y: 0, color: "lime" },
    { x: 2, y: 0, color: "amber" }, { x: 3, y: 0, color: "amber" },
  ];
  const NEXT = [
    [{ x: 1, y: 0, color: "rose" }, { x: 2, y: 0, color: "rose" }, { x: 0, y: 1, color: "lime" }, { x: 1, y: 1, color: "lime" }],
    [{ x: 0, y: 0, color: "amber" }, { x: 1, y: 0, color: "aqua" }, { x: 0, y: 1, color: "amber" }, { x: 1, y: 1, color: "amber" }],
    [{ x: 0, y: 0, color: "aqua" }, { x: 0, y: 1, color: "aqua" }, { x: 0, y: 2, color: "rose" }, { x: 1, y: 2, color: "aqua" }],
  ];

  function cellSize() {
    const narrow = window.innerWidth <= 760;
    const byH = (window.innerHeight - (narrow ? 250 : 190)) / ROWS;
    const byW = (window.innerWidth - (narrow ? 52 : 500)) / COLS;
    return Math.max(16, Math.min(38, Math.floor(Math.min(byH, byW))));
  }

  function render() {
    const s = cellSize();
    document.documentElement.style.setProperty("--cell", s + "px");

    const board = GF.setupCanvas(document.getElementById("board"));
    GF.drawBoard(board.ctx, grid, s, { piece, ghost, glow });

    const hold = GF.setupCanvas(document.getElementById("hold"));
    const ps = Math.min(26, hold.h / 3, hold.w / 5);
    GF.drawPieceCentered(hold.ctx, HOLD, hold.w / 2, hold.h / 2, ps);

    const next = GF.setupCanvas(document.getElementById("next"));
    const narrow = window.innerWidth <= 760;
    if (narrow) {
      // Horizontal strip of the next three on small screens.
      const ns = Math.min(14, next.h / 3.4);
      NEXT.forEach((p, i) => GF.drawPieceCentered(next.ctx, p, (next.w / 3) * (i + 0.5), next.h / 2, ns));
    } else {
      const slot = next.h / 3;
      NEXT.forEach((p, i) => GF.drawPieceCentered(next.ctx, p, next.w / 2, slot * (i + 0.5), i === 0 ? 24 : 20));
    }
  }

  GF.mountScenery(document.getElementById("scenery"));
  render();
  window.addEventListener("resize", render);
})(window.GF);

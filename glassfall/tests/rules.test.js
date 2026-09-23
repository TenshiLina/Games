// Headless checks for the game rules. Run with: node glassfall/tests/rules.test.js
"use strict";
require("../js/game.js");
const assert = require("assert");

const KEY = { a: "aqua", l: "lime", r: "rose", m: "amber", ".": null };
const board = (rows) =>
  Array(16 - rows.length).fill("........").concat(rows).map((r) => [...r].map((c) => KEY[c]));

let seed = 1;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Gravity fills the gaps, completing a row and a colour group in one step.
{
  const g = GF.createGame();
  g.setGrid(board(["a.......", "a.......", "lmlmlmlm", "aa.rrmm."]));
  const steps = g.resolve();
  assert.deepStrictEqual(steps.map((s) => s.type), ["fall", "clear", "fall"]);
  assert.strictEqual(g.lines, 1);
  assert.strictEqual(g.popped, 4);
  assert.strictEqual(g.score, (100 + 4 * 10) * 1 * 1);
}

// A pop that drops a colour onto its group scores as a two-step chain.
{
  const g = GF.createGame();
  g.setGrid(board(["r.......", "llll....", "rrrm...."]));
  // "llll" pops (chain 1); the rose above falls onto "rrr" and pops (chain 2).
  const steps = g.resolve();
  const clears = steps.filter((s) => s.type === "clear");
  assert.deepStrictEqual(clears.map((s) => s.chain), [1, 2]);
  assert.strictEqual(clears[1].points, 4 * 10 * 2);
  assert.strictEqual(g.bestChain, 2);
}

// Every piece has exactly two colours and never four of one.
{
  const g = GF.createGame({ random });
  for (let i = 0; i < 2000; i++) {
    g.grid.forEach((row) => row.fill(null));
    g.over = false;
    g.spawn();
    const counts = {};
    for (const c of g.activeCells()) counts[c.color] = (counts[c.color] || 0) + 1;
    assert.strictEqual(Object.keys(counts).length, 2);
    assert.ok(Math.max(...Object.values(counts)) <= 3);
  }
}

// Random play never leaves floating cells, full rows or poppable groups.
{
  let pieces = 0;
  for (let n = 0; n < 200; n++) {
    const g = GF.createGame({ random });
    g.spawn();
    while (!g.over && pieces < 1e6) {
      for (let i = Math.floor(random() * 4); i > 0; i--) g.rotate(random() < 0.5 ? 1 : -1);
      const dx = Math.floor(random() * 9) - 4;
      for (let i = 0; i < Math.abs(dx); i++) g.move(Math.sign(dx));
      if (random() < 0.1) g.holdPiece();
      if (g.over) break;
      g.hardDrop();
      pieces++;
      for (let x = 0; x < 8; x++) {
        let gap = false;
        for (let y = 15; y >= 0; y--) {
          if (!g.grid[y][x]) gap = true;
          else assert.ok(!gap, "floating cell");
        }
      }
      for (const row of g.grid) assert.ok(!row.every(Boolean), "full row left behind");
      if (!g.over) g.spawn();
    }
  }
  assert.ok(pieces > 1000);
}

console.log("rules ok");

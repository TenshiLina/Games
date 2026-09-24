// Headless checks for the game rules. Run with: node armada/tests/rules.test.js
"use strict";
require("../js/game.js");
const assert = require("assert");
const { C } = AR;

const newGame = (opts = {}) => AR.createGame(Object.assign({ random: AR.makeRandom(7) }, opts));
function toPlay(g) {
  while (g.state !== "playing") g.step({});
  g.events.length = 0;
}
const alive = (g) => g.aliens.filter((a) => a.alive);
const snapshot = (g) => g.aliens.map((a) => [a.x, a.y]);
// keep alien fire out of tests that only look at the rack
const noFire = (g) => { g.alienShotTimer = -1e9; };
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  " + name);
}

test("wave 1 starts with 55 invaders in the arcade's rows", () => {
  const g = newGame();
  assert.strictEqual(g.aliens.length, 55);
  const kinds = [0, 1, 2, 3, 4].map((r) => g.aliens.find((a) => a.row === r).kind);
  assert.deepStrictEqual(kinds, ["octopus", "octopus", "crab", "crab", "squid"]);
  assert.strictEqual(g.lives, 3);
});

test("invaders move one at a time, starting at the bottom left", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  const before = snapshot(g);
  g.step({});
  const moved = snapshot(g).map((p, i) => (p[0] !== before[i][0] || p[1] !== before[i][1] ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(moved, [0]);
  assert.strictEqual(g.aliens[0].x - before[0][0], C.STEP);
});

test("a full pass takes one step per living invader and plays a march note", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  for (let i = 0; i < 55; i++) g.step({});
  g.aliens.forEach((a) => assert.strictEqual(a.x, C.FIRST_X + a.col * C.COL_DX + C.STEP));
  g.step({}); // wraps: the pass ends and the next begins
  assert.ok(g.events.some((e) => e.type === "march"));
  // with fewer invaders, a pass is shorter, so the rack speeds up
  g.aliens.slice(1).forEach((a) => (a.alive = false));
  const x0 = g.aliens[0].x;
  for (let i = 0; i < 3; i++) g.step({});
  assert.strictEqual(g.aliens[0].x, x0 + 3 * C.STEP * 1.5); // the last invader is quicker going right
});

test("the rack drops and reverses at the edge", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  const y0 = g.aliens.map((a) => a.y);
  let passes = 0;
  while (!g.dropping && passes < 3000) {
    g.step({});
    passes++;
  }
  assert.ok(g.dropping, "rack should reach the right edge");
  const rightmost = Math.max(...alive(g).map((a) => a.x));
  assert.ok(rightmost + C.EDGE_HALF >= C.EDGE_R);
  const n = alive(g).length;
  for (let i = 0; i < n + 1; i++) g.step({});
  g.aliens.forEach((a, i) => assert.strictEqual(a.y, y0[i] + C.DROP));
  assert.strictEqual(g.dir, -1);
});

test("shooting an invader scores its points and freezes the rack", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  const squid = g.aliens.find((a) => a.kind === "squid");
  g.shot = { x: squid.x, y: squid.y + 20 };
  const before = snapshot(g);
  g.step({});
  assert.strictEqual(squid.alive, false);
  assert.strictEqual(g.score, 30);
  assert.ok(g.events.some((e) => e.type === "kill" && e.points === 30));
  for (let i = 0; i < C.KILL_FREEZE - 1; i++) g.step({});
  assert.deepStrictEqual(snapshot(g), before, "rack holds still while the invader explodes");
});

test("only one player shot at a time", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.step({ fire: true });
  const first = g.shot;
  assert.ok(first);
  g.step({ fire: true });
  assert.strictEqual(g.shot, first);
  assert.strictEqual(g.shotsFired, 1);
});

test("mothership value follows the shot-count table (23rd shot is 300)", () => {
  assert.strictEqual(AR.ufoScore(23), 300);
  assert.strictEqual(AR.ufoScore(38), 300);
  assert.strictEqual(AR.ufoScore(1), 50);
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.ufo = { x: 600, dir: 1 };
  g.shotsFired = 22;
  g.step({ fire: true }); // shot 23
  g.shot.x = g.ufo.x;
  g.shot.y = C.UFO_Y + 10;
  g.step({});
  assert.ok(g.events.some((e) => e.type === "ufoKill" && e.points === 300));
  assert.strictEqual(g.score, 300);
});

test("aliens fire faster as the score rises", () => {
  assert.deepStrictEqual([0, 199, 200, 999, 1000, 2000, 3000].map(AR.reloadFrames), [48, 48, 16, 16, 11, 8, 7]);
});

test("at most one alien shot of each type", () => {
  const g = newGame();
  toPlay(g);
  for (let i = 0; i < 600; i++) {
    g.player.alive = true; // keep the player out of harm's way
    g.step({});
    const types = g.alienShots.map((s) => s.type);
    assert.strictEqual(new Set(types).size, types.length);
    assert.ok(types.length <= 3);
    if (g.state !== "playing") break;
  }
});

test("bunkers have the arcade arch: solid top, notch at the bottom", () => {
  const g = newGame();
  const b = g.bunkers[0];
  const at = (lx, ly) => b.mask[Math.floor(ly / C.CELL) * g.maskW + Math.floor(lx / C.CELL)];
  assert.strictEqual(at(C.BUNKER_W / 2, 20), 1);
  assert.strictEqual(at(C.BUNKER_W / 2, C.BUNKER_H - 8), 0); // the notch
  assert.strictEqual(at(20, C.BUNKER_H - 8), 1); // a leg
  assert.strictEqual(at(2, 2), 0); // chamfered corner
});

test("shots blast craters out of bunkers", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  const b = g.bunkers[1];
  const solid = () => b.mask.reduce((n, v) => n + v, 0);
  const n0 = solid();
  g.shot = { x: b.x + 30, y: b.y + C.BUNKER_H + 10 };
  g.step({});
  assert.strictEqual(g.shot, null);
  assert.ok(solid() < n0);
  assert.ok(g.events.some((e) => e.type === "crater" && e.bunker === 1 && e.radii.length === 12));
});

test("an alien shot kills the player; the last life ends the game", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.lives = 1;
  g.alienShots.push({ type: "plunger", x: g.player.x, y: C.PLAYER_Y - 30, age: 0 });
  g.step({});
  assert.strictEqual(g.state, "dying");
  assert.strictEqual(g.lives, 0);
  while (g.state === "dying") g.step({});
  assert.strictEqual(g.state, "over");
  assert.ok(g.events.some((e) => e.type === "gameOver"));
});

test("losing a life with ships in reserve respawns the player", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.alienShots.push({ type: "plunger", x: g.player.x, y: C.PLAYER_Y - 30, age: 0 });
  g.step({});
  while (g.state === "dying") g.step({});
  assert.strictEqual(g.state, "intro");
  assert.strictEqual(g.lives, 2);
  assert.ok(g.player.alive);
});

test("invaders reaching the bottom end the game at once", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.aliens.forEach((a) => (a.y += C.INVASION_Y - C.BOTTOM_ROW_Y - 20)); // bottom row just past the line
  for (let i = 0; i < 60 && g.state === "playing"; i++) g.step({});
  assert.strictEqual(g.lives, 0);
  while (g.state === "dying") g.step({});
  assert.strictEqual(g.state, "over");
});

test("invaders plough through bunkers they touch", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  const b = g.bunkers[0];
  const a = g.aliens[0];
  a.x = b.x + C.BUNKER_W / 2 - C.STEP;
  a.y = b.y + 20;
  const n0 = b.mask.reduce((n, v) => n + v, 0);
  g.step({});
  assert.ok(b.mask.reduce((n, v) => n + v, 0) < n0);
  assert.ok(g.events.some((e) => e.type === "erase"));
});

test("an extra ship at 1500 points, once", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.score = 1490;
  const squid = g.aliens.find((a) => a.kind === "squid");
  g.shot = { x: squid.x, y: squid.y + 20 };
  g.step({});
  assert.strictEqual(g.lives, 4);
  g.score = 2990;
  const other = g.aliens.find((a) => a.kind === "squid" && a.alive);
  g.shot = { x: other.x, y: other.y + 20 };
  g.step({});
  assert.strictEqual(g.lives, 4);
});

test("clearing a wave brings a lower rack and fresh bunkers", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  const bottom1 = Math.max(...g.aliens.map((a) => a.y));
  g.bunkers[0].mask.fill(0);
  g.aliens.slice(1).forEach((a) => (a.alive = false));
  g.shot = { x: g.aliens[0].x, y: g.aliens[0].y + 20 };
  g.step({});
  assert.strictEqual(g.state, "cleared");
  while (g.state === "cleared") g.step({});
  assert.strictEqual(g.wave, 2);
  assert.strictEqual(alive(g).length, 55);
  assert.strictEqual(Math.max(...g.aliens.map((a) => a.y)), bottom1 + 2 * C.DROP);
  assert.ok(g.bunkers[0].mask.some((v) => v));
});

test("the mothership only appears while 8 or more invaders remain", () => {
  const g = newGame();
  toPlay(g);
  noFire(g);
  g.ufoTimer = 1;
  g.step({});
  assert.ok(g.ufo);
  const h = newGame();
  toPlay(h);
  noFire(h);
  h.aliens.slice(7).forEach((a) => (a.alive = false));
  h.ufoTimer = 1;
  h.step({});
  assert.strictEqual(h.ufo, null);
});

console.log(`\n${passed} tests passed`);

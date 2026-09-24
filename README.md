# Games

## Glassfall

A browser falling-block puzzle that mixes Tetris line clears with Puyo Puyo
colour chains, styled after Aqua-era Mac OS X, Frutiger Aero and Liquid Glass.

Open `glassfall/index.html` in a browser. There is no build step and nothing
to install.

- Design notes and open questions: [`glassfall/DESIGN.md`](glassfall/DESIGN.md)
- Rules tests: `node glassfall/tests/rules.test.js`
- Status: **checkpoint 2**, the playable core (keyboard and touch).

![Glassfall mid-chain](glassfall/docs/chain.png)

## Armada

A remaster of Space Invaders with realistic graphics: raymarched 3D art
baked to sprites, on top of faithful arcade rules.

Open `armada/index.html` in a browser. There is no build step and nothing
to install.

- Design notes, rules, asset list and how to rebuild the art: [`armada/DESIGN.md`](armada/DESIGN.md)
- Rules tests: `node armada/tests/rules.test.js`
- Status: **checkpoint 2**, the playable prototype (keyboard and touch).

![Armada in play](armada/docs/play.png)

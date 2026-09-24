# Armada — design notes

A **Space Invaders**-style shooter with realistic, rendered graphics: an alien
armada descends on a planet and you hold the orbit line in a lone interceptor.

![Scene mockup](docs/mockup.png)

## Status

**Checkpoint 1: core art.** The sprites and backdrops are baked, and a static
scene mockup shows them together at game scale. The playable prototype comes
next, after the art has been reviewed.

## Art direction

- **Rendered, not drawn.** Every ship and creature is a 3D model built from
  signed distance fields and raymarched with physically based shading (GGX
  specular, soft shadows, ambient occlusion, ACES tone mapping). Glowing parts
  get bloom. The results are baked to transparent PNG sprites.
- **One lighting rig for everything:** a warm key sun from the upper left
  (the same sun that lights the planet), a cool rim light from the upper
  right, and blue bounce light from the planet below. The camera looks down
  with a slight tilt, so you see the player's engines and the invaders'
  faces.
- **Invaders nod to the arcade's squid, crab and octopus**, but as
  biomechanical creatures: glossy chitin with a thin-film sheen, fine surface
  relief, glowing eyes, photophores and light leaking from armour seams. Each
  class has its own glow colour (violet, amber, green), and each bakes two
  animation frames, as in the original.
- **The player** flies a white ceramic-armoured delta fighter with orange flight
  stripes and twin blue ion engines. It is the brightest, cleanest shape on
  screen, so you can always find it.
- **The shields** are asteroid chunks (4 variants). In play, hits will chip
  craters out of them.
- **The backdrop** is kept dim so the sprites stand out: a Milky Way band
  with faint hydrogen and oxygen nebulae, dust lanes, and a few bright stars
  with short diffraction spikes. At the bottom is an Earth-like planet at
  dusk: the lit limb and oceans on the left, city lights on the night side on
  the right.

## Asset list

| File | Size | Frames | Use |
|---|---|---|---|
| `player.png` | 256² | 1 | Player interceptor |
| `invader-squid.png` | 256² × 2 | 2 | Top row (30 pts) |
| `invader-crab.png` | 256² × 2 | 2 | Middle rows (20 pts) |
| `invader-octopus.png` | 256² × 2 | 2 | Bottom rows (10 pts) |
| `mothership.png` | 320² × 2 | 2 | Bonus ship (rim lights chase) |
| `asteroid.png` | 256×192 × 4 | 4 variants | Shields |
| `explosion.png` | 192² × 16 (4×4) | 16 | Kills and impacts |
| `bolt-player.png` | 48×160 | 1 | Player shot |
| `bolt-enemy.png` | 64×128 × 4 | 4 (loop) | Alien plasma |
| `flare.png` | 128² | 1 | Muzzle and impact flare |
| `bg-space.jpg` | 2048² | 1 | Starfield backdrop (drawn to cover the screen) |
| `bg-planet.png` | 2048×448 | 1 | Planet horizon (fits the screen width, sits on the bottom edge) |

Sprites are baked at about 3–4× their on-screen size, so they stay sharp on
high-DPI screens.

## Rebuilding the art

The art is generated from code in `tools/bake/`:

- `lib.js`: shared GLSL (noise, SDF primitives, panel patterns, the lighting rig)
- `gl.js`: the WebGL2 harness (strip rendering into a float framebuffer, bloom, sheet packing)
- `assets-*.js`: one shader per asset
- `run.js`: drives headless Chromium and writes the files to `assets/`

```sh
NODE_PATH=$(npm root -g) node armada/tools/bake/run.js            # everything
NODE_PATH=$(npm root -g) node armada/tools/bake/run.js player     # one asset
```

Everything bakes in about a minute with Chromium's software GPU. For review,
`tools/preview.html?img=player,invader-crab&scale=1,0.5` shows single assets
on dark and checkerboard backgrounds, `tools/sheet.html` is the contact sheet
and `tools/mockup.html` is the composed scene.

## Plan for the prototype

- Classic rules: an 11 × 5 formation that marches sideways, steps down at the
  edges and speeds up as it thins out. Invaders drop plasma, a mothership
  crosses the top now and then, and the game ends when the formation reaches
  the shield line or you lose your last ship.
- Asteroid shields are eroded per pixel, with scorched crater stamps.
- Runtime effects on top of the baked art: additive glow, engine flicker,
  sparks, screen shake on big hits and slow parallax drift of the backdrop.
- Keyboard and touch controls, as in Glassfall. No build step.

## Open questions

- Is the realism level right, or should the look go further in either
  direction (grittier and more photographic, or more stylised)?
- Keep asteroids as the shields, or use armoured orbital bunkers that echo the
  arcade's arch shape?
- Playfield shape: landscape (as mocked up), or portrait like the arcade
  cabinet (better on phones)?

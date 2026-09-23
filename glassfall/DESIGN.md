# Glassfall — design notes

A falling-block puzzle that crosses **Tetris** piece control with **Puyo Puyo**
colour matching and chain reactions, dressed in the Aqua / Frutiger Aero /
Liquid Glass look.

## Core loop

1. A **tetromino** (I, O, T, S, Z, J, L) falls into an **8 × 16** well.
   Each of its four cells is a coloured gel bubble. A piece uses **two
   colours** (split 2–2 or 3–1), so it can never pop on its own.
2. You move, rotate (with wall kicks), soft/hard drop and hold, just like Tetris.
3. When the piece locks, the board **resolves**:
   1. **Line clear.** Every full row shatters (Tetris rule).
   2. **Gel gravity.** Every unsupported bubble falls straight down on its own,
      so tetrominoes break apart (Puyo rule).
   3. **Colour pop.** Any orthogonally connected group of **4 or more** bubbles
      of the same colour pops (Puyo rule).
   4. If step 1 or 3 removed anything, go back to step 2. Each extra pass is
      one **chain** step.
4. Same-colour neighbours are drawn **fused together**, so you can always see
   the groups that are forming.

## Scoring (first pass, to tune later)

| Event | Points |
|---|---|
| Line clear (1 / 2 / 3 / 4 rows) | 100 / 300 / 500 / 800 (+400 per extra row) |
| Bubbles popped | 10 per bubble |
| Group bonus (5, 6, 7+ in one group) | +20 / +30 / +50 |
| Soft / hard drop | 1 / 2 per row |

Each chain step scores `(lines + pops + group bonus) × chain multiplier × level`,
where the chain multiplier for step 1, 2, 3, 4 and 5+ is ×1, ×2, ×4, ×8, ×16.

Every 10 cleared lines or 40 popped bubbles (4 bubbles count the same as one
line) raises the level by 1, and pieces fall faster at each level. A fifth
colour (violet) joins at level 5.

## Game over

The game ends when a new piece can't spawn because the spawn area is blocked,
or when a piece locks partly above the top of the well.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | ← → (or A D), hold to repeat | Drag sideways |
| Rotate | ↑ / X (or W) clockwise, Z / Ctrl back | Tap the right / left half |
| Soft drop | ↓ (or S) | Drag down slowly |
| Hard drop | Space | Flick down |
| Hold | C / Shift | Flick up |
| Pause | P / Esc | Pause button |

Rotation uses the standard SRS wall kicks. A 0.5 s lock delay gives you time to
slide or spin a piece once it lands; each move or rotation on the ground resets
the delay, up to 15 times. Rotating the O piece cycles its colours.

## Visual language

- **Frutiger Aero backdrop:** saturated sky gradient, sun glare, soft clouds,
  aurora swooshes, a glossy green hill and floating soap bubbles.
- **Aqua chrome:** pinstriped title bar, traffic-light window buttons, pill
  buttons with a glossy top highlight and a glowing bottom (the default
  button pulses), and Lucida Grande-style type.
- **Liquid Glass surfaces:** translucent panels with backdrop blur and
  saturation, a specular rim, and a darker, deeper glass well for the board.
- **Gel pieces:** each cell has a dark rim, a radial inner glow and a glossy
  specular cap. Same-colour neighbours merge into one shape. A group that is
  about to pop glows.

## Later ideas

- Nuisance "ice" bubbles that rise from the bottom (as in Puyo garbage), for a
  survival or endless mode.
- Sound: synthesised glassy "plink" and pop effects with Web Audio.

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
| Line clear (1 / 2 / 3 / 4 rows) | 100 / 300 / 500 / 800 × level |
| Bubbles popped | 10 × bubbles × chain multiplier |
| Group bonus (5, 6, 7+ in one group) | +2 / +3 / +5 × 10 |
| Chain multiplier (step 1, 2, 3, 4, 5+) | ×1, ×2, ×4, ×8, ×16 |
| Soft / hard drop | 1 / 2 per row |

The level goes up every 10 cleared lines *or* every 40 popped bubbles, and each
level makes pieces fall faster. A fifth colour (violet) joins at level 5.

## Game over

The game ends when a new piece can't spawn: the spawn area is blocked.

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

## Open questions (for feedback)

- Board size: 8 × 16 (a middle ground), 10 × 20 (Tetris) or 6 × 12 (Puyo)?
- Pieces: 2 colours per tetromino, or Puyo-style falling pairs/triples mixed in?
- Nuisance "ice" bubbles that rise from the bottom (as in Puyo garbage), for a
  survival or endless mode?
- Sound: synthesised glassy "plink" and pop effects with Web Audio?

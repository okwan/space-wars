// Gamepad: the standard mapping. Left stick or d-pad turns (or, with aim-steer on, the nose
// turns toward where the stick points), A or right trigger thrusts,
// X fires the guns, right bumper fires a bomb, left bumper or left trigger afterburns, B drops a mine,
// Y reverses, Start pauses. Menus: d-pad or stick to move, A to choose, B to go back.

/** What the first connected pad is pressing, in game terms. */
export interface PadState {
  left: boolean; right: boolean; up: boolean; down: boolean;
  thrust: boolean; rev: boolean; fire: boolean; bomb: boolean; burn: boolean; mine: boolean;
  a: boolean; b: boolean; start: boolean; x: boolean; y: boolean; lb: boolean; rb: boolean;
  /** The left stick itself, for aim-steer: x and y in -1..1 and how far it is pushed. */
  sx: number; sy: number; mag: number;
}
const DEAD = 0.35;
export function readPad(): PadState | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const p = Array.from(pads).find(x => x && x.connected);
  if (!p) return null;
  const btn = (i: number) => !!p.buttons[i]?.pressed;
  const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
  return {
    left: ax < -DEAD || btn(14), right: ax > DEAD || btn(15), up: ay < -DEAD || btn(12), down: ay > DEAD || btn(13),
    thrust: btn(0) || btn(7), rev: btn(3), fire: btn(2), bomb: btn(5), burn: btn(4) || btn(6), mine: btn(1),
    a: btn(0), b: btn(1), start: btn(9), x: btn(2), y: btn(3), lb: btn(4), rb: btn(5),
    sx: ax, sy: ay, mag: Math.hypot(ax, ay),
  };
}

/** Aim-steer: which way to turn so the nose (angle a) swings toward the stick (sx, sy).
 *  Inside `slack` radians of the stick it holds still, so the nose does not jitter. */
export function aimTurn(a: number, sx: number, sy: number, slack: number): { left: boolean; right: boolean } {
  const want = Math.atan2(sy, sx), off = Math.atan2(Math.sin(want - a), Math.cos(want - a));
  return { left: off < -slack, right: off > slack };
}

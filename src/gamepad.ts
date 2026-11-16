// Gamepad: the standard mapping. Left stick or d-pad turns, A or right trigger thrusts,
// X or right bumper fires, left bumper or left trigger afterburns, B drops a mine,
// Y reverses, Start pauses. Menus: d-pad or stick to move, A to choose, B to go back.

/** What the first connected pad is pressing, in game terms. */
export interface PadState {
  left: boolean; right: boolean; up: boolean; down: boolean;
  thrust: boolean; rev: boolean; fire: boolean; burn: boolean; mine: boolean;
  a: boolean; b: boolean; start: boolean; x: boolean; y: boolean; lb: boolean; rb: boolean;
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
    thrust: btn(0) || btn(7), rev: btn(3), fire: btn(2) || btn(5), burn: btn(4) || btn(6), mine: btn(1),
    a: btn(0), b: btn(1), start: btn(9), x: btn(2), y: btn(3), lb: btn(4), rb: btn(5),
  };
}

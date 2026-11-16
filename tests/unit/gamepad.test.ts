// Vitest: the aim-steer gamepad scheme turns the nose toward the stick and holds still near it.
import { describe, expect, it } from 'vitest';
import { aimTurn } from '../../src/gamepad';

describe('aim-steer', () => {
  it('turns right (angle up) when the stick points clockwise of the nose', () => {
    expect(aimTurn(0, 0, 1, 0.06)).toEqual({ left: false, right: true });
  });
  it('turns left when the stick points anticlockwise of the nose', () => {
    expect(aimTurn(0, 0, -1, 0.06)).toEqual({ left: true, right: false });
  });
  it('holds still when the nose already points along the stick', () => {
    expect(aimTurn(Math.PI / 4, 1, 1, 0.06)).toEqual({ left: false, right: false });
  });
  it('takes the short way round across the angle wrap', () => {
    expect(aimTurn(Math.PI - 0.2, -1, -0.3, 0.06).right).toBe(true);
  });
});

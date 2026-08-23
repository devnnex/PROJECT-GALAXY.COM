import { describe, expect, it } from 'vitest';
import { createConstellation } from '../src/components/ConstellationAvatar';

describe('Constellation avatar', () => {
  it('is stable for the same user and different across users', () => {
    const first = createConstellation('user-a');
    expect(createConstellation('user-a')).toEqual(first);
    expect(createConstellation('user-b')).not.toEqual(first);
  });

  it('keeps every generated star inside the avatar canvas', () => {
    for (const point of createConstellation('user-a').points) {
      expect(point.x).toBeGreaterThanOrEqual(16);
      expect(point.x).toBeLessThanOrEqual(84);
      expect(point.y).toBeGreaterThanOrEqual(16);
      expect(point.y).toBeLessThanOrEqual(84);
    }
  });

  it('creates a stable portrait variation within safe visual bounds', () => {
    const { portrait } = createConstellation('user-a');
    expect(portrait.haloTilt).toBeGreaterThanOrEqual(-14);
    expect(portrait.haloTilt).toBeLessThanOrEqual(14);
    expect(portrait.faceShift).toBeGreaterThanOrEqual(-2.5);
    expect(portrait.faceShift).toBeLessThanOrEqual(2.5);
  });
});

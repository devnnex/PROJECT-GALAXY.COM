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
});

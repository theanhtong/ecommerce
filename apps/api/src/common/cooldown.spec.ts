import { withinChangeCooldown } from './cooldown.js';

const DAY = 24 * 60 * 60 * 1000;

describe('withinChangeCooldown', () => {
  const now = new Date('2026-10-23T00:00:00Z');

  it('allows the first change', () => {
    expect(withinChangeCooldown(null, now)).toBe(false);
  });

  it('blocks changes inside 30 days and allows them after', () => {
    expect(withinChangeCooldown(new Date(now.getTime() - 29 * DAY), now)).toBe(
      true,
    );
    expect(withinChangeCooldown(new Date(now.getTime() - 30 * DAY), now)).toBe(
      false,
    );
  });
});

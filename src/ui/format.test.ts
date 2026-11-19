import { describe, expect, it } from 'vitest';
import { formatTime, formatTimeForAria } from './format.js';

describe('formatTime', () => {
  it.each([
    [0, undefined, '0:00'],
    [5, undefined, '0:05'],
    [65.9, undefined, '1:05'],
    [3725, undefined, '1:02:05'],
    [5, 7200, '0:00:05'],
    [NaN, undefined, '0:00'],
    [-3, undefined, '0:00'],
    [Infinity, undefined, '0:00'],
  ])('formatTime(%s, %s) → %s', (seconds, reference, expected) => {
    expect(formatTime(seconds, reference)).toBe(expected);
  });
});

describe('formatTimeForAria', () => {
  it.each([
    [0, '0 seconds'],
    [1, '1 second'],
    [65, '1 minute 5 seconds'],
    [3600, '1 hour'],
    [7325, '2 hours 2 minutes 5 seconds'],
  ])('%s → %s', (seconds, expected) => expect(formatTimeForAria(seconds)).toBe(expected));
});

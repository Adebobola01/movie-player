const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Formats seconds as m:ss or h:mm:ss. Pass the video duration as `reference`
 * so all times in one player use the same format (0:05 vs 0:00:05).
 */
export function formatTime(seconds: number, reference: number = seconds): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const withHours = h > 0 || (Number.isFinite(reference) && reference >= 3600);
  return withHours ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Screen-reader friendly time, e.g. "1 hour 2 minutes 5 seconds". */
export function formatTimeForAria(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const parts: [number, string][] = [
    [Math.floor(total / 3600), 'hour'],
    [Math.floor((total % 3600) / 60), 'minute'],
    [total % 60, 'second'],
  ];
  const words = parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`);
  return words.length ? words.join(' ') : '0 seconds';
}

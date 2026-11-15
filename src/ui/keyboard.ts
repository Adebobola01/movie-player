import type { PlayerController } from '../core/controller.js';

/**
 * A shortcut runs an action and may return a short label (e.g. "+10s") that
 * the player briefly shows as feedback.
 */
export type ShortcutHandler = (controller: PlayerController) => string | void;
export type ShortcutMap = Record<string, ShortcutHandler>;

const seekBy =
  (seconds: number): ShortcutHandler =>
  (c) => {
    if (c.state.live) return;
    c.seekBy(seconds);
    return `${seconds > 0 ? '+' : '−'}${Math.abs(seconds)}s`;
  };

const changeVolume =
  (delta: number): ShortcutHandler =>
  (c) => {
    if (!c.state.capabilities.volumeControl) return;
    const base = c.state.muted ? 0 : c.state.volume;
    const volume = Math.round(Math.min(1, Math.max(0, base + delta)) * 100) / 100;
    c.setVolume(volume);
    return `Volume ${Math.round(volume * 100)}%`;
  };

const seekToPercent =
  (pct: number): ShortcutHandler =>
  (c) => {
    const { duration, live } = c.state;
    if (live || !Number.isFinite(duration)) return;
    c.seek((duration * pct) / 100);
    return `${pct}%`;
  };

const togglePlay: ShortcutHandler = (c) => {
  c.togglePlay();
};

/**
 * Default shortcuts. Keys are KeyboardEvent.key values; single letters are
 * matched case-insensitively. Customise with
 * `player.keyboardShortcuts = { ...DEFAULT_SHORTCUTS, s: (c) => … }`.
 */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  ' ': togglePlay,
  k: togglePlay,
  ArrowLeft: seekBy(-5),
  ArrowRight: seekBy(5),
  j: seekBy(-10),
  l: seekBy(10),
  ArrowUp: changeVolume(0.05),
  ArrowDown: changeVolume(-0.05),
  m: (c) => {
    const willMute = !c.state.muted;
    c.toggleMute();
    return willMute ? 'Muted' : 'Unmuted';
  },
  f: (c) => {
    void c.toggleFullscreen();
  },
  p: (c) => {
    if (c.state.capabilities.pip) void c.togglePip();
  },
  Home: seekToPercent(0),
  End: (c) => {
    if (!c.state.live && Number.isFinite(c.state.duration)) c.seek(c.state.duration);
  },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i), seekToPercent(i * 10)] as const),
  ),
};

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'time',
]);

function isTypingTarget(target: EventTarget | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

function isActivationOfFocusedControl(event: KeyboardEvent, target: EventTarget | undefined) {
  // Space/Enter on a focused button already clicks it; don't also run a shortcut.
  if (event.key !== ' ' && event.key !== 'Enter') return false;
  return (
    target instanceof HTMLButtonElement ||
    (target instanceof HTMLElement && target.getAttribute('role') === 'button')
  );
}

/**
 * Runs the shortcut for `event`, if any. Returns the feedback label (or ''
 * when the shortcut has none), or null when the event was not handled.
 */
export function handleShortcut(
  event: KeyboardEvent,
  controller: PlayerController,
  shortcuts: ShortcutMap,
): string | null {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.composedPath()[0];
  if (isTypingTarget(target) || isActivationOfFocusedControl(event, target)) return null;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const handler = shortcuts[key];
  if (!handler) return null;
  event.preventDefault(); // stop Space/arrows from scrolling the page
  return handler(controller) ?? '';
}

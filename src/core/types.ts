import type { PlayerError } from './errors.js';

export type PlaybackStatus =
  'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'waiting' | 'ended' | 'error';

export type TimeRange = [start: number, end: number];

export interface Capabilities {
  fullscreen: boolean;
  pip: boolean;
  /** False on iOS, where volume is read-only from JavaScript. */
  volumeControl: boolean;
}

export interface PlayerState {
  src: string;
  status: PlaybackStatus;
  currentTime: number;
  /** NaN before metadata loads, Infinity for live streams. */
  duration: number;
  live: boolean;
  buffered: TimeRange[];
  volume: number;
  muted: boolean;
  playbackRate: number;
  fullscreen: boolean;
  pip: boolean;
  controlsVisible: boolean;
  error: PlayerError | null;
  capabilities: Capabilities;
}

export function createInitialState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    src: '',
    status: 'idle',
    currentTime: 0,
    duration: NaN,
    live: false,
    buffered: [],
    volume: 1,
    muted: false,
    playbackRate: 1,
    fullscreen: false,
    pip: false,
    controlsVisible: true,
    error: null,
    capabilities: { fullscreen: false, pip: false, volumeControl: true },
    ...overrides,
  };
}

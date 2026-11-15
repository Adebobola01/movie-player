import type { PlayerError } from '../errors.js';

/**
 * A playback engine feeds a source into a <video> element. Playback state
 * (time, paused, volume…) is always read from the video element itself; the
 * engine only handles loading, streaming and its own error recovery.
 *
 * Phase 2 adds quality levels; Phase 3 adds subtitle tracks.
 */
export interface Engine {
  readonly name: 'hls.js' | 'native';
  attach(video: HTMLVideoElement): void;
  load(src: string): void;
  destroy(): void;
  /** Subscribe to errors the engine could not recover from (or non-fatal warnings). */
  onError(callback: (error: PlayerError) => void): () => void;
}

/** Shared error-listener bookkeeping for engines. */
export class ErrorEmitter {
  private listeners = new Set<(error: PlayerError) => void>();

  on(callback: (error: PlayerError) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(error: PlayerError): void {
    for (const listener of [...this.listeners]) listener(error);
  }

  clear(): void {
    this.listeners.clear();
  }
}

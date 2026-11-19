import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerError } from '../errors.js';
import { HlsEngine } from './hls-engine.js';
import { NativeEngine } from './native-engine.js';
import { isHlsSource, selectEngine } from './select-engine.js';
import { createMockHls } from './test-utils.js';

function fakeVideo(nativeHls: boolean) {
  const video = document.createElement('video');
  video.canPlayType = () => (nativeHls ? 'maybe' : '');
  return video;
}

describe('isHlsSource', () => {
  it.each([
    ['https://x.com/a/master.m3u8', true],
    ['https://x.com/a/master.m3u8?token=1', true],
    ['https://x.com/a/movie.mp4', false],
    ['https://x.com/stream/42', false],
  ])('%s → %s', (src, expected) => expect(isHlsSource(src)).toBe(expected));

  it('honours a MIME type hint', () => {
    expect(isHlsSource('https://x.com/stream/42', 'application/x-mpegURL')).toBe(true);
    expect(isHlsSource('https://x.com/a.m3u8', 'video/mp4')).toBe(false);
  });
});

describe('selectEngine', () => {
  it('uses native for non-HLS sources without loading hls.js', async () => {
    const load = vi.fn();
    const engine = await selectEngine('movie.mp4', fakeVideo(false), {}, load);
    expect(engine).toBeInstanceOf(NativeEngine);
    expect(load).not.toHaveBeenCalled();
  });

  it('uses hls.js when supported', async () => {
    const { Hls } = createMockHls(true);
    const engine = await selectEngine('a.m3u8', fakeVideo(true), {}, async () => Hls);
    expect(engine).toBeInstanceOf(HlsEngine);
  });

  it('uses native HLS when preferNative is set and supported', async () => {
    const load = vi.fn();
    const engine = await selectEngine('a.m3u8', fakeVideo(true), { preferNative: true }, load);
    expect(engine).toBeInstanceOf(NativeEngine);
    expect(load).not.toHaveBeenCalled();
  });

  it('falls back to native HLS when hls.js is unsupported', async () => {
    const { Hls } = createMockHls(false);
    const engine = await selectEngine('a.m3u8', fakeVideo(true), {}, async () => Hls);
    expect(engine).toBeInstanceOf(NativeEngine);
  });

  it('returns null when HLS cannot play at all', async () => {
    const { Hls } = createMockHls(false);
    expect(await selectEngine('a.m3u8', fakeVideo(false), {}, async () => Hls)).toBeNull();
  });
});

describe('HlsEngine error recovery', () => {
  let errors: PlayerError[];
  let engine: HlsEngine;
  let hls: ReturnType<typeof createMockHls>['instances'][number];

  beforeEach(() => {
    vi.useFakeTimers();
    const mock = createMockHls();
    engine = new HlsEngine(mock.Hls);
    hls = mock.instances[0];
    errors = [];
    engine.onError((e) => errors.push(e));
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  const fire = (type: string, details = 'other', fatal = true) =>
    hls.emit('hlsError', { type, details, fatal });

  it('applies the default capLevelToPlayerSize config', () => {
    expect(hls.config).toMatchObject({ capLevelToPlayerSize: true });
  });

  it('ignores non-fatal errors', () => {
    fire('networkError', 'fragLoadError', false);
    expect(errors).toEqual([]);
  });

  it('retries fatal network errors with backoff, then fails', () => {
    for (const delay of [1000, 2000, 4000]) {
      fire('networkError', 'fragLoadError');
      expect(errors.at(-1)?.fatal).toBe(false);
      vi.advanceTimersByTime(delay);
    }
    expect(hls.startLoad).toHaveBeenCalledTimes(3);
    fire('networkError', 'fragLoadError');
    expect(errors.at(-1)).toMatchObject({ code: 'NETWORK', fatal: true });
  });

  it('resets network retries after a fragment buffers', () => {
    fire('networkError', 'fragLoadError');
    fire('networkError', 'fragLoadError');
    hls.emit('hlsFragBuffered');
    fire('networkError', 'fragLoadError');
    vi.advanceTimersByTime(1000); // back to the first delay
    expect(hls.startLoad).toHaveBeenCalledTimes(1);
  });

  it('fails immediately on manifest load errors', () => {
    fire('networkError', 'manifestLoadError');
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(errors).toMatchObject([{ code: 'NETWORK', fatal: true }]);
  });

  it('escalates media error recovery', () => {
    fire('mediaError');
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(hls.swapAudioCodec).not.toHaveBeenCalled();
    fire('mediaError');
    expect(hls.swapAudioCodec).toHaveBeenCalledTimes(1);
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(2);
    fire('mediaError');
    expect(errors.at(-1)).toMatchObject({ code: 'MEDIA', fatal: true });
  });

  it('treats media errors far apart as fresh', () => {
    fire('mediaError');
    vi.advanceTimersByTime(11_000);
    fire('mediaError');
    expect(hls.swapAudioCodec).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(2);
  });

  it('reports live status changes once', () => {
    const live = vi.fn();
    engine.onLiveChange(live);
    hls.emit('hlsLevelLoaded', { details: { live: true } });
    hls.emit('hlsLevelLoaded', { details: { live: true } });
    expect(live).toHaveBeenCalledTimes(1);
    expect(live).toHaveBeenCalledWith(true);
  });

  it('cancels pending retries on destroy', () => {
    fire('networkError', 'fragLoadError');
    engine.destroy();
    vi.advanceTimersByTime(5000);
    expect(hls.startLoad).not.toHaveBeenCalled();
    expect(hls.destroy).toHaveBeenCalled();
  });
});

describe('NativeEngine', () => {
  it('sets the source and reports media errors', () => {
    const video = document.createElement('video');
    video.load = vi.fn();
    const engine = new NativeEngine();
    const errors: PlayerError[] = [];
    engine.onError((e) => errors.push(e));
    engine.attach(video);
    engine.load('https://x.com/movie.mp4');
    expect(video.src).toBe('https://x.com/movie.mp4');
    Object.defineProperty(video, 'error', { value: { code: 4, message: '' } });
    video.dispatchEvent(new Event('error'));
    expect(errors).toMatchObject([{ code: 'UNSUPPORTED', fatal: true }]);
    engine.destroy();
    expect(video.hasAttribute('src')).toBe(false);
  });
});

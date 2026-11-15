import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerController, type ControllerOptions } from './controller.js';
import { ErrorEmitter, type Engine } from './engines/engine.js';
import { createError } from './errors.js';

class FakeEngine implements Engine {
  readonly name = 'native' as const;
  errors = new ErrorEmitter();
  liveListeners: ((live: boolean) => void)[] = [];
  attach = vi.fn();
  load = vi.fn();
  destroy = vi.fn();
  onError(cb: Parameters<Engine['onError']>[0]) {
    return this.errors.on(cb);
  }
  onLiveChange(cb: (live: boolean) => void) {
    this.liveListeners.push(cb);
    return () => {};
  }
}

/** A <video> whose playback properties are controllable from tests. */
function createVideo() {
  const video = document.createElement('video');
  const props = { paused: true, ended: false, duration: NaN, currentTime: 0 };
  Object.defineProperties(video, {
    paused: { get: () => props.paused },
    ended: { get: () => props.ended },
    duration: { get: () => props.duration },
    currentTime: {
      get: () => props.currentTime,
      set: (t: number) => {
        props.currentTime = t;
      },
    },
  });
  video.play = vi.fn(async () => {
    props.paused = false;
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('playing'));
  });
  video.pause = vi.fn(() => {
    props.paused = true;
    video.dispatchEvent(new Event('pause'));
  });
  const fire = (type: string) => video.dispatchEvent(new Event(type));
  return { video, props, fire };
}

describe('PlayerController', () => {
  let host: HTMLElement;
  let v: ReturnType<typeof createVideo>;
  let engine: FakeEngine;
  let controller: PlayerController;

  const create = (options: ControllerOptions = {}) => {
    controller = new PlayerController(host, v.video, {
      persistVolume: false,
      selectEngine: async () => engine,
      ...options,
    });
    controller.connect();
    return controller;
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    v = createVideo();
    engine = new FakeEngine();
    localStorage.clear();
  });

  afterEach(() => {
    controller?.disconnect();
    host.remove();
  });

  describe('loading', () => {
    it('attaches and loads the selected engine', async () => {
      create();
      await controller.load('a.m3u8');
      expect(engine.attach).toHaveBeenCalledWith(v.video);
      expect(engine.load).toHaveBeenCalledWith('a.m3u8');
      expect(controller.state).toMatchObject({ src: 'a.m3u8', status: 'loading' });
    });

    it('becomes ready when metadata loads', async () => {
      create();
      await controller.load('a.m3u8');
      v.props.duration = 120;
      v.fire('loadedmetadata');
      expect(controller.state).toMatchObject({ status: 'ready', duration: 120, live: false });
    });

    it('marks live streams', async () => {
      create();
      await controller.load('live.m3u8');
      engine.liveListeners.forEach((cb) => cb(true));
      expect(controller.state.live).toBe(true);
    });

    it('treats an infinite duration as live', async () => {
      create();
      await controller.load('live.m3u8');
      v.props.duration = Infinity;
      v.fire('durationchange');
      expect(controller.state.live).toBe(true);
    });

    it('discards a stale load when src changes mid-selection', async () => {
      const first = new FakeEngine();
      let resolveFirst!: (e: Engine) => void;
      create({
        selectEngine: (src) =>
          src === 'first.m3u8' ? new Promise((r) => (resolveFirst = r)) : Promise.resolve(engine),
      });
      const firstLoad = controller.load('first.m3u8');
      await controller.load('second.m3u8');
      resolveFirst(first);
      await firstLoad;
      expect(first.destroy).toHaveBeenCalled();
      expect(first.attach).not.toHaveBeenCalled();
      expect(controller.state.src).toBe('second.m3u8');
    });

    it('destroys the previous engine on a new load', async () => {
      create();
      await controller.load('a.m3u8');
      const old = engine;
      engine = new FakeEngine();
      await controller.load('b.m3u8');
      expect(old.destroy).toHaveBeenCalled();
    });

    it('reports unsupported sources', async () => {
      create({ selectEngine: async () => null });
      const onError = vi.fn();
      controller.addEventListener('error', onError);
      await controller.load('a.m3u8');
      expect(controller.state.status).toBe('error');
      expect(controller.state.error?.code).toBe('UNSUPPORTED');
      expect(onError).toHaveBeenCalledOnce();
    });

    it('goes to error state on fatal engine errors only', async () => {
      create();
      await controller.load('a.m3u8');
      engine.errors.emit(createError('NETWORK', 'retrying', { fatal: false }));
      expect(controller.state.status).toBe('loading');
      engine.errors.emit(createError('NETWORK', 'failed'));
      expect(controller.state).toMatchObject({ status: 'error', error: { code: 'NETWORK' } });
    });
  });

  describe('playback status', () => {
    beforeEach(async () => {
      create();
      await controller.load('a.m3u8');
      v.props.duration = 100;
      v.fire('loadedmetadata');
    });

    it('tracks play, pause, waiting and ended', async () => {
      await controller.play();
      expect(controller.state.status).toBe('playing');
      v.fire('waiting');
      expect(controller.state.status).toBe('waiting');
      v.fire('canplay');
      expect(controller.state.status).toBe('playing');
      controller.pause();
      expect(controller.state.status).toBe('paused');
      v.props.ended = true;
      v.fire('pause');
      v.fire('ended');
      expect(controller.state.status).toBe('ended');
    });

    it('togglePlay alternates play and pause', async () => {
      controller.togglePlay();
      await Promise.resolve();
      expect(v.video.play).toHaveBeenCalled();
      controller.togglePlay();
      expect(v.video.pause).toHaveBeenCalled();
    });

    it('updates currentTime from media events', () => {
      v.props.currentTime = 12.5;
      v.fire('timeupdate');
      expect(controller.state.currentTime).toBe(12.5);
    });

    it('re-dispatches media events', async () => {
      const onPlaying = vi.fn();
      controller.addEventListener('playing', onPlaying);
      await controller.play();
      expect(onPlaying).toHaveBeenCalledOnce();
    });
  });

  describe('autoplay', () => {
    const blocked = () => Object.assign(new Error('blocked'), { name: 'NotAllowedError' });

    it('retries muted when autoplay is blocked', async () => {
      create();
      v.video.play = vi.fn().mockRejectedValueOnce(blocked()).mockResolvedValueOnce(undefined);
      const onMuted = vi.fn();
      controller.addEventListener('autoplay-muted', onMuted);
      await controller.play({ autoplay: true });
      expect(v.video.muted).toBe(true);
      expect(onMuted).toHaveBeenCalledOnce();
    });

    it('restores sound and stays paused if muted autoplay also fails', async () => {
      create();
      v.video.play = vi.fn().mockRejectedValue(blocked());
      await controller.play({ autoplay: true });
      expect(v.video.muted).toBe(false);
    });

    it('does not mute on a blocked manual play', async () => {
      create();
      v.video.play = vi.fn().mockRejectedValue(blocked());
      await controller.play();
      expect(v.video.muted).toBe(false);
      expect(v.video.play).toHaveBeenCalledOnce();
    });

    it('plays after load when the autoplay option is set', async () => {
      create({ autoplay: true });
      await controller.load('a.m3u8');
      expect(v.video.play).toHaveBeenCalled();
    });
  });

  describe('seeking', () => {
    beforeEach(async () => {
      create();
      await controller.load('a.m3u8');
      v.props.duration = 100;
      v.fire('loadedmetadata');
    });

    it('clamps to the video length', () => {
      controller.seek(150);
      expect(v.video.currentTime).toBe(100);
      controller.seek(-5);
      expect(v.video.currentTime).toBe(0);
    });

    it('seeks relative to the current time', () => {
      v.props.currentTime = 50;
      controller.seekBy(10);
      expect(v.video.currentTime).toBe(60);
    });

    it('ignores seeks on live streams', () => {
      engine.liveListeners.forEach((cb) => cb(true));
      v.props.currentTime = 50;
      controller.seek(10);
      expect(v.video.currentTime).toBe(50);
    });
  });

  describe('volume', () => {
    it('clamps volume and unmutes when raised', () => {
      create();
      v.video.muted = true;
      controller.setVolume(1.5);
      expect(v.video.volume).toBe(1);
      expect(v.video.muted).toBe(false);
    });

    it('unmuting at zero volume restores an audible level', () => {
      create();
      v.video.volume = 0;
      v.video.muted = true;
      controller.toggleMute();
      expect(v.video.muted).toBe(false);
      expect(v.video.volume).toBe(0.5);
    });

    it('persists and restores volume', () => {
      create({ persistVolume: true });
      controller.setVolume(0.3);
      controller.setMuted(true);
      controller.disconnect();

      const next = createVideo();
      const restored = new PlayerController(host, next.video, { persistVolume: true });
      restored.connect();
      expect(next.video.volume).toBeCloseTo(0.3);
      expect(next.video.muted).toBe(true);
      expect(restored.state).toMatchObject({ muted: true });
      restored.disconnect();
    });

    it('does not persist automatic autoplay muting', async () => {
      create({ persistVolume: true });
      v.video.play = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error(), { name: 'NotAllowedError' }))
        .mockResolvedValueOnce(undefined);
      await controller.play({ autoplay: true });
      expect(localStorage.getItem('movie-player:volume')).toBeNull();
    });
  });

  describe('fullscreen', () => {
    it('requests fullscreen on the host element, not the video', async () => {
      create();
      host.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      await controller.toggleFullscreen();
      expect(host.requestFullscreen).toHaveBeenCalled();
    });

    it('falls back to video fullscreen on iPhone', async () => {
      create();
      Object.defineProperty(host, 'requestFullscreen', { value: undefined });
      const enter = vi.fn();
      Object.assign(v.video, { webkitEnterFullscreen: enter });
      await controller.toggleFullscreen();
      expect(enter).toHaveBeenCalled();
    });

    it('tracks iOS video fullscreen events', () => {
      create();
      const onChange = vi.fn();
      controller.addEventListener('fullscreenchange', onChange);
      v.fire('webkitbeginfullscreen');
      expect(controller.state.fullscreen).toBe(true);
      v.fire('webkitendfullscreen');
      expect(controller.state.fullscreen).toBe(false);
      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('picture-in-picture', () => {
    it('tracks PiP events', () => {
      create();
      v.fire('enterpictureinpicture');
      expect(controller.state.pip).toBe(true);
      v.fire('leavepictureinpicture');
      expect(controller.state.pip).toBe(false);
    });

    it('uses the Safari presentation mode API as a fallback', async () => {
      create();
      Object.defineProperty(v.video, 'requestPictureInPicture', { value: undefined });
      const setMode = vi.fn();
      Object.assign(v.video, { webkitSetPresentationMode: setMode });
      await controller.togglePip();
      expect(setMode).toHaveBeenCalledWith('picture-in-picture');
    });
  });

  it('disconnect destroys the engine and stops listening', async () => {
    create();
    await controller.load('a.m3u8');
    controller.disconnect();
    expect(engine.destroy).toHaveBeenCalled();
    v.props.currentTime = 30;
    v.fire('timeupdate');
    expect(controller.state.currentTime).toBe(0);
  });
});

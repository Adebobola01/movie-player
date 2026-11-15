import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LitElement, html } from 'lit';
import '../../index.js';
import type { MoviePlayer } from '../../movie-player.js';
import { PlayerConsumer } from '../player-consumer.js';

let el: MoviePlayer;

const root = () => el.shadowRoot!;
async function control<T extends Element = HTMLElement>(tag: string): Promise<T> {
  const c = root().querySelector(tag) as unknown as LitElement;
  await c.updateComplete;
  return c as unknown as T;
}
const inner = (c: Element, selector: string) =>
  c.shadowRoot!.querySelector(selector) as HTMLElement;
const settle = async () => {
  await el.updateComplete;
  for (const c of root().querySelectorAll('*')) await (c as LitElement).updateComplete;
};

beforeEach(async () => {
  el = document.createElement('movie-player') as MoviePlayer;
  el.setAttribute('no-persist-volume', '');
  document.body.append(el);
  await settle();
});

afterEach(() => {
  el.remove();
});

describe('controls', () => {
  it('renders the default control layout', () => {
    for (const tag of [
      'mp-spinner',
      'mp-big-play',
      'mp-control-bar',
      'mp-seek-bar',
      'mp-play-button',
      'mp-volume',
      'mp-time-display',
      'mp-pip-button',
      'mp-fullscreen-button',
      'mp-error-overlay',
    ]) {
      expect(root().querySelector(tag), tag).not.toBeNull();
    }
    expect(root().querySelector('video')!.controls).toBe(false);
  });

  it('play button toggles playback and reflects status', async () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    const button = await control('mp-play-button');
    const inner_ = () => inner(button, 'button');
    expect(inner_().getAttribute('aria-label')).toBe('Play');
    inner_().click();
    expect(toggle).toHaveBeenCalled();

    el.controller.store.set({ status: 'playing' });
    await settle();
    expect(inner_().getAttribute('aria-label')).toBe('Pause');

    el.controller.store.set({ status: 'ended' });
    await settle();
    expect(inner_().getAttribute('aria-label')).toBe('Replay');
  });

  it('time display shows current time and duration, or LIVE', async () => {
    el.controller.store.set({ currentTime: 65.4, duration: 3725 });
    await settle();
    const display = await control('mp-time-display');
    expect(display.shadowRoot!.textContent!.replace(/\s+/g, ' ').trim()).toBe('0:01:05 / 1:02:05');
    el.controller.store.set({ live: true });
    await settle();
    expect(inner(display, '[part="live"]').textContent).toBe('LIVE');
  });

  it('seek bar exposes slider semantics and seeks with the keyboard', async () => {
    const seekBy = vi.spyOn(el.controller, 'seekBy').mockImplementation(() => {});
    const seek = vi.spyOn(el.controller, 'seek').mockImplementation(() => {});
    el.controller.store.set({ currentTime: 65, duration: 600 });
    await settle();
    const bar = inner(await control('mp-seek-bar'), '[role="slider"]');
    expect(bar.getAttribute('aria-valuemax')).toBe('600');
    expect(bar.getAttribute('aria-valuetext')).toBe('1 minute 5 seconds of 10 minutes');

    const press = (key: string) =>
      bar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
    press('ArrowRight');
    expect(seekBy).toHaveBeenLastCalledWith(5);
    press('PageDown');
    expect(seekBy).toHaveBeenLastCalledWith(-60);
    press('End');
    expect(seek).toHaveBeenLastCalledWith(600);
  });

  it('seek bar hides for live streams', async () => {
    el.controller.store.set({ live: true });
    await settle();
    expect((await control('mp-seek-bar')).hidden).toBe(true);
  });

  it('volume button toggles mute; slider sets volume', async () => {
    const toggleMute = vi.spyOn(el.controller, 'toggleMute').mockImplementation(() => {});
    const setVolume = vi.spyOn(el.controller, 'setVolume').mockImplementation(() => {});
    const volume = await control('mp-volume');
    inner(volume, 'button').click();
    expect(toggleMute).toHaveBeenCalled();

    const slider = inner(volume, 'input') as HTMLInputElement;
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    expect(setVolume).toHaveBeenCalledWith(0.3);
  });

  it('volume slider is hidden where volume is read-only (iOS)', async () => {
    el.controller.store.set({
      capabilities: { ...el.controller.state.capabilities, volumeControl: false },
    });
    await settle();
    expect(inner(await control('mp-volume'), 'input')).toBeNull();
  });

  it('fullscreen and PiP buttons hide when unsupported and act when supported', async () => {
    const caps = el.controller.state.capabilities;
    el.controller.store.set({ capabilities: { ...caps, fullscreen: false, pip: false } });
    await settle();
    expect((await control('mp-fullscreen-button')).hidden).toBe(true);
    expect((await control('mp-pip-button')).hidden).toBe(true);

    const toggleFs = vi.spyOn(el.controller, 'toggleFullscreen').mockResolvedValue();
    el.controller.store.set({ capabilities: { ...caps, fullscreen: true, pip: true } });
    await settle();
    inner(await control('mp-fullscreen-button'), 'button').click();
    expect(toggleFs).toHaveBeenCalled();
  });

  it('big play button shows only when ready, paused or ended', async () => {
    const bigPlay = await control('mp-big-play');
    const statuses = ['idle', 'loading', 'ready', 'playing', 'paused', 'ended'] as const;
    const visible: string[] = [];
    for (const status of statuses) {
      el.controller.store.set({ status });
      await settle();
      if (inner(bigPlay, 'button')) visible.push(status);
    }
    expect(visible).toEqual(['ready', 'paused', 'ended']);
  });

  it('spinner shows while loading or buffering', async () => {
    const spinner = await control('mp-spinner');
    el.controller.store.set({ status: 'waiting' });
    await settle();
    expect(inner(spinner, '[role="status"]')).not.toBeNull();
    el.controller.store.set({ status: 'playing' });
    await settle();
    expect(inner(spinner, '[role="status"]')).toBeNull();
  });

  it('error overlay shows the message and retries', async () => {
    const retry = vi.spyOn(el.controller, 'retry').mockImplementation(() => {});
    el.controller.store.set({
      status: 'error',
      error: { code: 'NETWORK', message: 'Network down', fatal: true },
    });
    await settle();
    const overlay = await control('mp-error-overlay');
    expect(inner(overlay, '[role="alert"]').textContent).toContain('Network down');
    inner(overlay, 'button').click();
    expect(retry).toHaveBeenCalled();
  });

  it('unsupported errors offer no retry', async () => {
    el.controller.store.set({
      status: 'error',
      error: { code: 'UNSUPPORTED', message: 'Nope', fatal: true },
    });
    await settle();
    expect(inner(await control('mp-error-overlay'), 'button')).toBeNull();
  });

  it('control bar hides when controls are not visible', async () => {
    const bar = await control('mp-control-bar');
    el.controller.setControlsVisible(false);
    await settle();
    expect(bar.hasAttribute('data-hidden')).toBe(true);
  });
});

describe('custom controls via PlayerConsumer', () => {
  class CustomStatus extends LitElement {
    player = new PlayerConsumer(this, (s) => s.status);
    render() {
      return html`<span>${this.player.value}</span>`;
    }
  }
  customElements.define('test-custom-status', CustomStatus);

  it('a slotted light-DOM element receives the controller and state', async () => {
    const custom = document.createElement('test-custom-status') as CustomStatus;
    el.append(custom);
    await custom.updateComplete;
    expect(custom.player.controller).toBe(el.controller);
    el.controller.store.set({ status: 'paused' });
    await custom.updateComplete;
    expect(custom.shadowRoot!.textContent).toBe('paused');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LitElement } from 'lit';
import '../index.js';
import type { MoviePlayer } from '../movie-player.js';
import { AUTO_HIDE_DELAY_MS } from './auto-hide.js';
import { DEFAULT_SHORTCUTS } from './keyboard.js';

let el: MoviePlayer;
const root = () => el.shadowRoot!;
const settle = async () => {
  await el.updateComplete;
  for (const c of root().querySelectorAll('*')) await (c as LitElement).updateComplete;
};

async function mount(attrs: Record<string, string> = {}) {
  el = document.createElement('movie-player') as MoviePlayer;
  el.setAttribute('no-persist-volume', '');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  await settle();
  return el;
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element = el) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

const pointer = (type: string, pointerType: string, target: Element = el) =>
  target.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, composed: true }), { pointerType, button: 0 }),
  );

afterEach(() => {
  vi.useRealTimers();
  el?.remove();
  localStorage.clear();
});

describe('keyboard shortcuts', () => {
  beforeEach(async () => {
    await mount();
    el.controller.store.set({ duration: 200, status: 'paused' });
  });

  it('makes the player focusable', () => {
    expect(el.tabIndex).toBe(0);
  });

  it('Space and K toggle playback and prevent page scrolling', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    expect(press(' ').defaultPrevented).toBe(true);
    press('K');
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('arrows and J/L seek, with feedback', async () => {
    const seekBy = vi.spyOn(el.controller, 'seekBy').mockImplementation(() => {});
    press('ArrowLeft');
    expect(seekBy).toHaveBeenLastCalledWith(-5);
    press('l');
    expect(seekBy).toHaveBeenLastCalledWith(10);
    await settle();
    expect(root().querySelector('.indicator')!.textContent!.trim()).toBe('+10s');
  });

  it('number keys jump to a percentage', () => {
    const seek = vi.spyOn(el.controller, 'seek').mockImplementation(() => {});
    press('5');
    expect(seek).toHaveBeenCalledWith(100);
  });

  it('up/down change volume in 5% steps', () => {
    const setVolume = vi.spyOn(el.controller, 'setVolume').mockImplementation(() => {});
    el.controller.store.set({ volume: 0.5, muted: false });
    press('ArrowDown');
    expect(setVolume).toHaveBeenCalledWith(0.45);
  });

  it('M, F and P call mute, fullscreen and PiP', () => {
    const mute = vi.spyOn(el.controller, 'toggleMute').mockImplementation(() => {});
    const fs = vi.spyOn(el.controller, 'toggleFullscreen').mockResolvedValue();
    const pip = vi.spyOn(el.controller, 'togglePip').mockResolvedValue();
    el.controller.store.set({
      capabilities: { ...el.controller.state.capabilities, pip: true },
    });
    press('m');
    press('f');
    press('p');
    expect(mute).toHaveBeenCalled();
    expect(fs).toHaveBeenCalled();
    expect(pip).toHaveBeenCalled();
  });

  it('ignores keys with modifiers', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    expect(press('k', { ctrlKey: true }).defaultPrevented).toBe(false);
    press('k', { metaKey: true });
    expect(toggle).not.toHaveBeenCalled();
  });

  it('ignores typing in text inputs inside the player', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    const input = document.createElement('input');
    el.append(input);
    press('k', {}, input);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('does not double-toggle when Space activates a focused button', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    const button = root().querySelector('mp-play-button')!.shadowRoot!.querySelector('button')!;
    press(' ', {}, button);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('seek bar arrow keys are not also handled by the player', () => {
    const seekBy = vi.spyOn(el.controller, 'seekBy').mockImplementation(() => {});
    const slider = root()
      .querySelector('mp-seek-bar')!
      .shadowRoot!.querySelector('[role="slider"]')!;
    press('ArrowRight', {}, slider);
    expect(seekBy).toHaveBeenCalledTimes(1);
  });

  it('can be disabled or customised', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    el.keyboardShortcuts = false;
    press('k');
    expect(toggle).not.toHaveBeenCalled();

    const custom = vi.fn(() => 'Custom!');
    el.keyboardShortcuts = { ...DEFAULT_SHORTCUTS, s: custom };
    press('s');
    expect(custom).toHaveBeenCalledWith(el.controller);
  });
});

describe('auto-hide', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await mount();
  });

  const visible = () => el.controller.state.controlsVisible;

  it('hides controls after inactivity while playing', () => {
    el.controller.store.set({ status: 'playing' });
    expect(visible()).toBe(true);
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS);
    expect(visible()).toBe(false);
    expect(el.hasAttribute('data-idle')).toBe(true);
  });

  it('mouse movement shows them again', () => {
    el.controller.store.set({ status: 'playing' });
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS);
    pointer('pointermove', 'mouse');
    expect(visible()).toBe(true);
    expect(el.hasAttribute('data-idle')).toBe(false);
  });

  it('never hides while paused', () => {
    el.controller.store.set({ status: 'playing' });
    el.controller.store.set({ status: 'paused' });
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS * 2);
    expect(visible()).toBe(true);
  });

  it('pausing shows hidden controls', () => {
    el.controller.store.set({ status: 'playing' });
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS);
    el.controller.store.set({ status: 'paused' });
    expect(visible()).toBe(true);
  });

  it('stays visible while the mouse is over the control bar', () => {
    el.controller.store.set({ status: 'playing' });
    pointer('pointerover', 'mouse', root().querySelector('mp-control-bar')!);
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS * 2);
    expect(visible()).toBe(true);
  });

  it('hides immediately when the mouse leaves the player', () => {
    el.controller.store.set({ status: 'playing' });
    pointer('pointerleave', 'mouse');
    expect(visible()).toBe(false);
  });

  it('a key press shows the controls', () => {
    el.controller.store.set({ status: 'playing' });
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS);
    press('Shift');
    expect(visible()).toBe(true);
  });
});

describe('clicks on the video area', () => {
  beforeEach(async () => {
    await mount();
  });

  const area = () => root().querySelector('.click-area')!;

  it('a mouse click toggles playback; a double click toggles fullscreen', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    const fs = vi.spyOn(el.controller, 'toggleFullscreen').mockResolvedValue();
    pointer('pointerdown', 'mouse', area());
    area().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggle).toHaveBeenCalledOnce();
    area().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(fs).toHaveBeenCalledOnce();
  });

  it('a touch tap toggles control visibility instead of playback', () => {
    const toggle = vi.spyOn(el.controller, 'togglePlay').mockImplementation(() => {});
    el.controller.store.set({ status: 'playing' });
    pointer('pointerdown', 'touch', area());
    area().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggle).not.toHaveBeenCalled();
    expect(el.controller.state.controlsVisible).toBe(false);
  });
});

describe('volume persistence attributes', () => {
  it('no-persist-volume prevents restoring a saved volume', async () => {
    localStorage.setItem('movie-player:volume', JSON.stringify({ volume: 0.2, muted: true }));
    await mount();
    const video = root().querySelector('video')!;
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
  });

  it('the muted attribute wins over a saved unmuted setting', async () => {
    localStorage.setItem('movie-player:volume', JSON.stringify({ volume: 0.2, muted: false }));
    el = document.createElement('movie-player') as MoviePlayer;
    el.setAttribute('muted', '');
    document.body.append(el);
    await settle();
    const video = root().querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video.volume).toBeCloseTo(0.2);
  });
});

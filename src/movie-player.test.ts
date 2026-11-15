import { afterEach, describe, expect, it, vi } from 'vitest';
import './index.js';
import type { MoviePlayer } from './movie-player.js';

async function mount(attrs: Record<string, string> = {}) {
  const el = document.createElement('movie-player') as MoviePlayer;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const videoOf = (el: MoviePlayer) => el.shadowRoot!.querySelector('video')!;

describe('<movie-player>', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('registers the custom element', () => {
    expect(customElements.get('movie-player')).toBeDefined();
  });

  it('renders an inline video element in its shadow root', async () => {
    const el = await mount();
    const video = videoOf(el);
    expect(video).not.toBeNull();
    expect(video.playsInline).toBe(true);
    expect(video.getAttribute('part')).toBe('video');
  });

  it('applies media attributes to the video', async () => {
    const el = await mount({ poster: 'p.jpg', loop: '', crossorigin: 'anonymous' });
    const video = videoOf(el);
    expect(video.getAttribute('poster')).toBe('p.jpg');
    expect(video.loop).toBe(true);
    expect(video.getAttribute('crossorigin')).toBe('anonymous');
  });

  it('the muted attribute mutes the video', async () => {
    const el = await mount({ muted: '' });
    expect(videoOf(el).muted).toBe(true);
    expect(el.muted).toBe(true);
  });

  it('loads src through the controller', async () => {
    const el = document.createElement('movie-player') as MoviePlayer;
    const load = vi.spyOn(el.controller, 'load').mockResolvedValue();
    el.src = 'https://x.com/movie.mp4';
    document.body.append(el);
    await el.updateComplete;
    expect(load).toHaveBeenCalledWith('https://x.com/movie.mp4');
  });

  it('re-dispatches controller events with an mp- prefix that cross shadow DOM', async () => {
    const el = await mount();
    const handler = vi.fn();
    document.body.addEventListener('mp-volumechange', handler);
    el.volume = 0.4;
    videoOf(el).dispatchEvent(new Event('volumechange'));
    expect(handler).toHaveBeenCalled();
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.composed).toBe(true);
    expect(event.detail.volume).toBeCloseTo(0.4);
  });

  it('exposes state and fine-grained subscriptions', async () => {
    const el = await mount();
    const cb = vi.fn();
    el.subscribe((s) => s.muted, cb);
    el.muted = true;
    videoOf(el).dispatchEvent(new Event('volumechange'));
    expect(cb).toHaveBeenCalledWith(true, false);
    expect(el.state.muted).toBe(true);
  });

  it('disconnecting tears down the controller', async () => {
    const el = await mount();
    const disconnect = vi.spyOn(el.controller, 'disconnect');
    el.remove();
    expect(disconnect).toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import './index.js';

describe('<movie-player>', () => {
  it('registers the custom element', () => {
    expect(customElements.get('movie-player')).toBeDefined();
  });

  it('renders a video element in its shadow root', async () => {
    const el = document.createElement('movie-player');
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('video')).not.toBeNull();
    el.remove();
  });
});

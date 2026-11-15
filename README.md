# movie-player

Embeddable HLS movie player web component: adaptive bitrate streaming, quality selection, subtitles (provider fetch and upload) and custom theming. Works in any framework or plain HTML.

See [Plan.md](Plan.md) for the roadmap. **Status:** Phase 1 (core playback and controls) is done; quality selection, subtitles and theme presets are next.

## Usage

```html
<script type="module" src="movie-player.cdn.js"></script>
<movie-player src="https://example.com/movie/master.m3u8" poster="poster.jpg"></movie-player>
```

With a bundler:

```ts
import 'movie-player'; // registers <movie-player>
```

### Attributes

| Attribute                                 | Description                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src`                                     | HLS (`.m3u8`) or plain video URL                                                           |
| `type`                                    | MIME type hint when the URL has no `.m3u8` extension, e.g. `application/x-mpegURL`         |
| `poster`                                  | Image shown before playback                                                                |
| `autoplay`                                | Start automatically; if the browser blocks it, retries muted and fires `mp-autoplay-muted` |
| `muted`, `loop`, `preload`, `crossorigin` | As on `<video>`                                                                            |
| `prefer-native`                           | Use Safari's built-in HLS even where hls.js works                                          |
| `no-persist-volume`                       | Don't remember volume/mute between visits                                                  |

### JavaScript API

```ts
const player = document.querySelector('movie-player');

player.play();
player.pause();
player.currentTime = 30;
player.volume = 0.5;
player.muted = true;
player.playbackRate = 1.5;
player.duration;
player.paused;
player.ended;
player.toggleFullscreen();
player.togglePictureInPicture();

player.state; // read-only snapshot: status, currentTime, duration, live, buffered, volume, …
player.subscribe(
  (s) => s.status,
  (status, previous) => console.log(previous, '→', status),
);
```

### Events

All events are `CustomEvent`s that bubble out of the shadow DOM, with the player state (or error) as `detail`:

`mp-loadedmetadata`, `mp-play`, `mp-pause`, `mp-playing`, `mp-ended`, `mp-timeupdate`, `mp-seeking`, `mp-seeked`, `mp-waiting`, `mp-volumechange`, `mp-ratechange`, `mp-fullscreenchange`, `mp-pipchange`, `mp-statechange` (`{ status, previous }`), `mp-error` (`{ code, message, fatal }`), `mp-autoplay-muted`.

### Keyboard shortcuts

Active while the player has focus: <kbd>Space</kbd>/<kbd>K</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> ∓5s, <kbd>J</kbd>/<kbd>L</kbd> ∓10s, <kbd>↑</kbd>/<kbd>↓</kbd> volume, <kbd>M</kbd> mute, <kbd>F</kbd> fullscreen, <kbd>P</kbd> picture-in-picture, <kbd>0</kbd>–<kbd>9</kbd> jump to 0–90%, <kbd>Home</kbd>/<kbd>End</kbd>.

```ts
import { DEFAULT_SHORTCUTS } from 'movie-player';
player.keyboardShortcuts = {
  ...DEFAULT_SHORTCUTS,
  s: (c) => {
    c.setPlaybackRate(2);
    return '2×';
  },
};
player.keyboardShortcuts = false; // disable
```

### Styling

CSS variables (set on `movie-player` or any ancestor):

| Variable                                                    | Default                 |
| ----------------------------------------------------------- | ----------------------- |
| `--mp-accent`                                               | `#4f8cff`               |
| `--mp-control-color`                                        | `#fff`                  |
| `--mp-font`                                                 | `system-ui, sans-serif` |
| `--mp-background`                                           | `#000`                  |
| `--mp-aspect-ratio`                                         | `16 / 9`                |
| `--mp-control-size` / `--mp-icon-size`                      | `40px` / `24px`         |
| `--mp-control-radius`                                       | `8px`                   |
| `--mp-control-bar-bg`                                       | dark gradient           |
| `--mp-seek-height`, `--mp-seek-track`, `--mp-seek-buffered` |                         |

Parts, for anything variables don't cover: `movie-player::part(control-bar)`, `::part(play-button)`, `::part(seek-progress)`, `::part(big-play)`, `::part(error)`, and more.

### Custom controls

Any element nested inside `<movie-player>` can connect to it with `PlayerConsumer`, which gives it the controller and re-renders it when its slice of state changes:

```ts
import { LitElement, html } from 'lit';
import { PlayerConsumer } from 'movie-player';

class SpeedButton extends LitElement {
  private player = new PlayerConsumer(this, (s) => s.playbackRate);
  render() {
    return html`<button @click=${() => this.player.controller?.setPlaybackRate(2)}>
      ${this.player.value}×
    </button>`;
  }
}
```

The connection already works, but elements placed inside `<movie-player>` are not displayed yet: the slots that position them in the player (and a `controls` layout option) come in Phase 5.

## Development

| Command                                                 | What it does                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`                                           | Playground at http://localhost:5173 (source presets, live state, event log)               |
| `npm test`                                              | Unit tests (Vitest)                                                                       |
| `npm run test:e2e`                                      | Browser tests in Chromium, Firefox and WebKit (run `npx playwright install` once first)   |
| `npm run build`                                         | Library build (`dist/movie-player.js`), CDN build (`dist/movie-player.cdn.js`) and types  |
| `npm run lint` / `npm run typecheck` / `npm run format` | Code quality                                                                              |
| `npm run streams`                                       | Generate a local 360p/720p/1080p HLS test stream into `public/streams/` (requires ffmpeg) |

Browser tests use the public Mux test stream by default; set `STREAM_URL=/streams/master.m3u8` to use the local one.

# Movie Player: Project Plan

An embeddable movie player that can be imported into any web project, with:

1. Adaptive bitrate streaming (HLS)
2. User-selectable resolution
3. Subtitles: fetched from a provider, or uploaded by the viewer
4. Custom designs: themes plus replaceable controls

## Decisions

| Question         | Decision                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Who imports it   | Any framework: a Web Component (`<movie-player>`) usable in React, Vue, Angular, Svelte or plain HTML        |
| Streaming format | HLS (`.m3u8`)                                                                                                |
| Subtitle sources | In-manifest tracks, sidecar files, viewer upload (`.srt`/`.vtt`), and provider fetch (OpenSubtitles first)   |
| Custom designs   | Themes (CSS variables, presets) plus custom/rearranged controls (slots, parts, layout config, headless mode) |

## 1. Tech stack

| Concern         | Choice                                                      | Why                                                                            |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Language        | TypeScript                                                  | Ships type definitions to the projects that use it                             |
| Component model | Web Component built with **Lit** (~5 KB)                    | Works in React, Vue, Angular, Svelte and plain HTML                            |
| HLS engine      | **hls.js**, loaded only when needed; native HLS as fallback | hls.js gives control over quality levels; native HLS covers old iOS            |
| Build           | Vite library mode                                           | Outputs ESM for bundlers, a single file for `<script>` tags, and `.d.ts` types |
| Tests           | Vitest (unit) + Playwright (real browsers)                  |                                                                                |
| Demo/docs       | Vite playground site                                        | Lets you test themes and streams side by side                                  |

## 2. Architecture

```
<movie-player>                    ← public custom element (the only thing most users touch)
 ├── Core (no UI)
 │    ├── PlayerController        state store + public API + events
 │    ├── Engine interface        load(), levels, setLevel(), subtitleTracks…
 │    │    ├── HlsJsEngine        hls.js on Chrome/Firefox/Edge/iOS 17.1+
 │    │    └── NativeEngine       Safari fallback (quality is "Auto" only, see risks)
 │    └── SubtitleManager         track registry, parsing, timing offset
 │         ├── sources: manifest | sidecar URL | file upload | provider
 │         └── SubtitleProvider interface → OpenSubtitlesProvider
 └── UI layer
      ├── Controls as separate elements: <mp-play>, <mp-seek-bar>, <mp-volume>,
      │   <mp-quality-menu>, <mp-subtitle-menu>, <mp-fullscreen>, …
      ├── Subtitle renderer (custom overlay, so captions can be themed)
      └── Theme: CSS variables + ::part() + slots
```

Keeping the core separate from the UI is what makes custom designs possible. Every control reads state and calls actions on `PlayerController`, so a developer's own button can do anything a built-in one does.

## 3. The four requirements

### 3.1 Adaptive bitrate streaming

- hls.js handles ABR automatically. The engine exposes `levels`, `currentLevel` and an `autoLevelEnabled` flag.
- Settings: starting level, ABR limits (`capLevelToPlayerSize` so a 300px player never downloads 4K), and bandwidth estimate settings.
- Events: `levelswitched` and `bandwidthestimate`, so projects can show or log the current quality.

### 3.2 Resolution selection

- The quality menu lists **Auto (currently 720p)**, 1080p, 720p, and so on, built from the manifest's renditions.
- Choosing a level calls `hls.nextLevel` for a smooth switch at the next segment, or `currentLevel` for an immediate switch (configurable).
- The viewer's choice is remembered in `localStorage` (can be turned off).
- API: `player.setQuality(720)`, `player.qualities`, `player.quality = 'auto'`.

### 3.3 Subtitles

Sources, all handled by one `SubtitleManager`:

1. **Inside the HLS manifest** (WebVTT subtitle tracks), detected automatically.
2. **Separate URLs** passed by the developer: `<mp-track src="en.vtt" lang="en">`.
3. **User upload**: the viewer picks a local `.srt` or `.vtt` file. It's parsed in the browser, and the text encoding is detected because many SRT files are Windows-1252 or UTF-16 rather than UTF-8.
4. **Provider fetch**: a pluggable `SubtitleProvider` interface (`search(query) → results`, `download(id) → cues`), with an OpenSubtitles implementation shipped first.

Shared features:

- SRT→VTT conversion and a VTT parser
- **Timing offset control** (±0.1s steps), which is essential because downloaded subtitles are often out of sync
- Caption styling: size, colour, background, position
- A custom caption renderer instead of the browser's native one, because browsers barely let you style native captions

### 3.4 Custom designs (three levels)

1. **Themes**: CSS variables such as `--mp-accent`, `--mp-font`, `--mp-control-bg` and `--mp-radius`, plus built-in presets (`default`, `minimal`, `netflix-like dark`). Icons can be replaced through slots.
2. **Styling individual parts**: `::part(seek-bar)`, `::part(control-bar)` and so on let developers style the inside of the component from their own CSS.
3. **Replacing or rearranging controls**: a `controls` layout setting (`['play','seek','time','spacer','subtitles','quality','fullscreen']`), named slots to drop in your own elements, or `no-default-ui` to build a whole UI from the `mp-*` elements or your own.

## 4. Public API (draft)

```html
<script type="module" src="movie-player.js"></script>
<movie-player
  src="https://cdn.example.com/movie/master.m3u8"
  poster="poster.jpg"
  theme="minimal"
  autoplay
  muted
>
  <mp-track src="/subs/en.vtt" lang="en" label="English" default></mp-track>
  <button slot="control-bar-end">My custom button</button>
</movie-player>
```

```ts
import { MoviePlayer, OpenSubtitlesProvider } from 'movie-player';

player.subtitleProviders = [new OpenSubtitlesProvider({ proxyUrl: '/api/subs' })];
player.addEventListener('mp-quality-change', (e) => console.log(e.detail));
player.setQuality(1080);
player.loadSubtitleFile(file);
player.setSubtitleOffset(-1.5);
```

## 5. Phases

| Phase                     | Deliverable                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Setup**              | Repo, TypeScript, Vite library build, Lit, lint, Vitest, Playwright, demo page, and test HLS streams made with ffmpeg (360p/720p/1080p ladder) |
| **1. Core playback**      | `PlayerController`, engine interface, hls.js + native engines, play/pause/seek/volume/fullscreen/PiP, keyboard shortcuts, events               |
| **2. ABR + quality menu** | Level list, Auto/manual switching, remembered choice, size-based quality cap                                                                   |
| **3. Subtitles (local)**  | Manifest tracks, separate URLs, SRT/VTT parser, upload, custom renderer, offset, caption styling                                               |
| **4. Subtitle provider**  | `SubtitleProvider` interface, OpenSubtitles implementation, search UI in the subtitle menu, example proxy server                               |
| **5. Theming**            | CSS variables, parts, slots, layout setting, 2–3 preset themes, headless mode                                                                  |
| **6. Hardening**          | Accessibility (ARIA, focus order, screen reader labels), mobile touch gestures, error handling and retry, bundle size budget                   |
| **7. Release**            | Docs site, framework examples (React/Vue/plain HTML), npm publish, semantic versioning, changelog                                              |

## 6. Risks

- **Safari before iOS 17.1 can't select quality.** Native HLS has no API to pick a rendition, so on those devices the quality menu will show only "Auto". hls.js works on iOS 17.1+, so this affects older devices only.
- **The OpenSubtitles API key shouldn't be put in browser code.** It also has daily download limits per user. The provider calls **the host project's backend proxy**, which holds the key; a small example proxy will be included. Calling the API directly from the browser will be possible but documented as for development only.
- **Subtitle licensing.** Fetched subtitles are user-contributed, so whether to enable this per project is up to whoever uses the player.
- **Cross-origin requests.** Streams and subtitle files must be served with the right CORS headers, or the player can't load them from another domain.

## 7. Open questions (current defaults)

1. **DRM** (Widevine/FairPlay for protected content): assumed **out of scope**. Needing it would change the engine choice.
2. **Browser support**: latest 2 versions of evergreen browsers, plus iOS 15+ with the limitation above.
3. **Package name / npm scope**: placeholder `movie-player`.
4. **Casting** (Chromecast/AirPlay), **thumbnail previews on the seek bar**, **analytics hooks**: left out of v1, but the core is designed so they can be added later.

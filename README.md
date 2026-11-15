# movie-player

Embeddable HLS movie player web component: adaptive bitrate streaming, quality selection, subtitles (provider fetch and upload) and custom theming. Works in any framework or plain HTML.

See [Plan.md](Plan.md) for the roadmap.

## Usage (planned API)

```html
<script type="module" src="movie-player.cdn.js"></script>
<movie-player src="https://example.com/movie/master.m3u8"></movie-player>
```

## Development

| Command                                                 | What it does                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`                                           | Playground at http://localhost:5173                                                       |
| `npm test`                                              | Unit tests (Vitest)                                                                       |
| `npm run test:e2e`                                      | Browser tests (Playwright; run `npx playwright install` once first)                       |
| `npm run build`                                         | Library build (`dist/movie-player.js`), CDN build (`dist/movie-player.cdn.js`) and types  |
| `npm run lint` / `npm run typecheck` / `npm run format` | Code quality                                                                              |
| `npm run streams`                                       | Generate a local 360p/720p/1080p HLS test stream into `public/streams/` (requires ffmpeg) |

Without generated streams, the playground falls back to a public HLS test stream.

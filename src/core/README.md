# src/core

Playback logic with no UI. Nothing in this folder imports from `ui/` or renders anything, so it can be tested without a browser and reused by a completely different UI.

## Files

| File                       | What it holds                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `types.ts`                 | `PlayerState`, `PlaybackStatus`, `Capabilities`, `createInitialState()`                      |
| `store.ts`                 | `Store<T>`: a minimal immutable store with selector subscriptions, plus `shallowEqual`       |
| `errors.ts`                | `PlayerError` (one error shape for every engine), `createError()`, `fromMediaError()`        |
| `controller.ts`            | `PlayerController`: actions, media-event → state mapping, fullscreen/PiP, volume persistence |
| `engines/engine.ts`        | The `Engine` interface and the shared `ErrorEmitter`                                         |
| `engines/hls-engine.ts`    | hls.js engine with error recovery and live detection                                         |
| `engines/native-engine.ts` | Plain `<video src>` engine (MP4, Safari HLS)                                                 |
| `engines/select-engine.ts` | `selectEngine()`: picks an engine for a source; `isHlsSource()`                              |
| `engines/test-utils.ts`    | `createMockHls()` for unit tests (excluded from the type build)                              |

## The one rule: state follows the video

Actions never write playback state directly. `controller.play()` calls `video.play()`, and `status` becomes `'playing'` only when the video fires `playing`. This is enforced by `onMediaEvent` being the only place that writes playback fields.

The rule exists because the browser can contradict any action. Autoplay can be blocked, seeks are clamped, playback can stall, and the OS can pause media. If the UI updated optimistically, it would eventually drift from what the video is really doing.

The exceptions are UI-only fields that no media event covers: `controlsVisible` (set by `setControlsVisible`) and the load reset at the start of `load()`.

## PlayerController

**Lifecycle.** You construct it with the host element (the fullscreen target) and the `<video>`. Then:

- `connect()` attaches listeners and restores the saved volume on the first call.
- `disconnect()` removes listeners and destroys the engine.
- `<movie-player>` calls these from its own connected/disconnected callbacks.

**Loading.** `load(src)` does the following:

1. Bumps `loadToken`, destroys the old engine and resets state to `loading`.
2. Awaits `selectEngine()`, which may download hls.js.
3. If `loadToken` changed meanwhile (a newer `load()` started), destroys the engine it just got and stops.
4. Otherwise attaches and loads the engine, then plays if the `autoplay` option is set.

Any new async step in `load()` must re-check the token after each `await`.

**Status transitions** (all in `onMediaEvent`):

```
idle ──load()──► loading ──loadedmetadata──► ready ──playing──► playing ◄──canplay── waiting
                    │                                             │  ▲                  ▲
                    │                                        pause│  │playing   waiting  │
                    ▼                                             ▼  │                   │
                  error ◄── fatal engine error / unsupported    paused        playing ───┘
                                                                  │
                                                     ended ◄──────┘ (pause + ended at the end)
```

**Behaviours worth knowing:**

- **Autoplay fallback.** Only `play({ autoplay: true })` retries muted after a `NotAllowedError`, and then it dispatches `autoplay-muted`. A blocked manual `play()` is left alone.
- **Volume persistence.** Only user actions (`setVolume`, `setMuted`, `toggleMute`) save to `localStorage`. The automatic autoplay mute must never be remembered.
- **Fullscreen.** Requests fullscreen on the host, not the video, so the custom controls stay visible. iPhone falls back to `video.webkitEnterFullscreen()`, which shows iOS's native controls.
- **PiP.** Uses the standard API, with Safari's `webkitSetPresentationMode` as a fallback.
- **Smooth time.** `timeupdate` fires only about 4 times a second, so while playing (and the tab is visible) a `requestAnimationFrame` loop also samples `currentTime`.
- **Capabilities.** These are detected once, on a throwaway `<video>`. For example, `volumeControl` is false on iOS, where volume is read-only from JavaScript. Tests override them with the `capabilities` option.

**Events.** The controller is an `EventTarget`, and `CONTROLLER_EVENTS` lists what it dispatches. The `detail` is the current state, except for `error` (a `PlayerError`) and `statechange` (`{ status, previous }`). `<movie-player>` re-dispatches every one as `mp-<type>`. To add an event, add it to `CONTROLLER_EVENTS`. If it maps directly from a media event, also add it to `MEDIA_EVENTS`.

## Store

```ts
const store = new Store(createInitialState());
store.subscribe((s) => s.status, (status, prev) => …);           // fires only when status changes
store.subscribe((s) => s.buffered, cb, shallowEqual);            // custom equality for arrays/objects
store.set({ currentTime: 12 });                                  // no-op (no notifications) if nothing changed
```

`set` compares each field with `Object.is`, so `NaN` → `NaN` doesn't count as a change. Selectors that build new objects need `shallowEqual` (UI consumers use it by default), or they will fire on every update.

## Engines

An engine only feeds a source into the `<video>`. It never tracks time, volume or play state.

```ts
interface Engine {
  name: 'hls.js' | 'native';
  attach(video): void;
  load(src): void;
  destroy(): void;
  onError(cb): unsubscribe; // fatal errors and non-fatal warnings (error.fatal tells which)
  onLiveChange?(cb): unsubscribe; // optional: engines that know a stream is live before duration does
}
```

**Selection order** (`selectEngine`):

1. Not HLS → native.
2. `preferNative` and native HLS available → native.
3. hls.js supported → hls.js. This includes iOS 17.1+ via ManagedMediaSource.
4. Native HLS available → native (older iOS).
5. Otherwise `null` → `UNSUPPORTED` error.

A source counts as HLS if it ends in `.m3u8` or its `type` hint contains `mpegurl`.

**hls.js recovery** (`HlsEngine.handleError`, fatal errors only):

| Error              | Response                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Network (segments) | `startLoad()` after 1s, 2s, 4s; the counter resets when a fragment buffers               |
| Network (manifest) | Fail immediately; hls.js has already retried with its own policy                         |
| Media              | `recoverMediaError()`; second time within 10s: `swapAudioCodec()` + recover; third: fail |
| Other              | Fail                                                                                     |

Each retry emits a non-fatal warning first. The controller passes warnings on as `error` events with `fatal: false` and only enters the `error` state on fatal ones.

**Adding an engine** (for example, DASH or a casting target):

1. Implement `Engine` (use `ErrorEmitter` for `onError`).
2. Add a branch to `selectEngine`, keeping heavy libraries behind a dynamic `import()`.
3. Add cases to `engines.test.ts`.

Later phases will extend the interface: quality levels in Phase 2 and subtitle tracks in Phase 3.

## Testing

- `controller.test.ts` uses a `<video>` whose `paused`, `ended`, `duration` and `currentTime` are controllable, plus a `FakeEngine`, and fires media events by hand.
- `engines.test.ts` uses `createMockHls()` to fire hls.js errors, with fake timers for the backoff.

Real playback is covered by the Playwright tests in [`e2e/`](../../e2e).

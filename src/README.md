# src

Source for the `<movie-player>` web component. For how to _use_ the player, see the [root README](../README.md). This folder's READMEs explain how the code is organised so you can change it.

## Layout

```
src/
├── index.ts            Public entry point: everything the package exports
├── movie-player.ts     <movie-player>: wires the core and UI together
├── core/               Playback logic, no UI (see core/README.md)
└── ui/                 Controls and interaction (see ui/README.md)
```

## Architecture

The code is split into two layers that depend in one direction only: **`ui` depends on `core`, never the reverse.**

```
                 ┌──────────────────────────────── <movie-player> ───────────────────────────────┐
                 │                                                                               │
  attributes ───►│  willUpdate ──► PlayerController.updateOptions / load                         │
                 │                                                                               │
                 │  ┌──────── core ────────┐  context  ┌──────────── ui ────────────┐            │
                 │  │ PlayerController     │──────────►│ controls (PlayerConsumer)  │            │
                 │  │   ├─ Store<State>    │◄──────────│   call controller actions  │            │
                 │  │   └─ Engine ─► video │  actions  │ keyboard, auto-hide        │            │
                 │  └──────────────────────┘           └────────────────────────────┘            │
                 │            │ events                                                           │
                 └────────────┼──────────────────────────────────────────────────────────────────┘
                              ▼
                     mp-* CustomEvents to the page
```

1. **`movie-player.ts`** creates the `<video>` element and a `PlayerController` in its constructor. It maps HTML attributes onto them, and re-dispatches controller events to the page as `mp-*` events.
2. **`core/`** owns the state. Actions such as `play()` and `seek()` act on the `<video>`, and state only changes when the video fires its own events.
3. **`ui/`** gets the controller through Lit context. Each control subscribes to only the slice of state it renders, and calls controller actions on user input.

## `movie-player.ts` in brief

| Concern                                                        | Where                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| Attributes → video/controller                                  | `willUpdate`, `syncControllerOptions`                           |
| Loading a new `src`                                            | `updated` (and `connectedCallback` when re-attached to the DOM) |
| Controller events → `mp-*` events                              | constructor loop over `CONTROLLER_EVENTS`                       |
| Default control layout                                         | `render`                                                        |
| Keyboard shortcuts, click/double-click/tap                     | `onKeyDown`, `onAreaClick`, `onAreaDoubleClick`                 |
| Public JS API (`play`, `currentTime`, `state`, `subscribe`, …) | bottom of the class                                             |

Two timing details are easy to get wrong:

- **Options must be pushed before the controller connects.** `connectedCallback` runs before Lit's first `willUpdate`, so it calls `syncControllerOptions()` before `controller.connect()`. Otherwise `connect()` would restore the saved volume without knowing about `no-persist-volume`.
- **The `muted` attribute overrides a saved setting.** It's re-applied after `connect()` restores the remembered volume.

## Public API surface

`index.ts` is the only file whose exports are public. Anything not exported from it can change freely. When you add a public type, function or element, export it here and document it in the root README.

## Conventions

- **TypeScript, strict.** Imports use `.js` extensions (`./core/store.js`), as ESM output requires.
- **Lit** with legacy decorators (`experimentalDecorators`, `useDefineForClassFields: false` in `tsconfig.json`).
- **Tests sit next to the code** as `*.test.ts` and run in happy-dom (`npm test`). happy-dom can't play media and is missing a few DOM APIs. For example, `element.part` doesn't exist, so the code uses `setAttribute('part', …)`. Prefer APIs that work in both.
- **Test helpers** live in `test-utils.ts` files, which are excluded from the type build (`tsconfig.build.json`).
- **Third-party libraries** (`lit`, `@lit/context`, `hls.js`) stay external in the ESM build and are bundled only into the CDN build (`vite.config.ts`).
- `hls.js` is ~200 KB gzipped, so it is only ever loaded with a dynamic `import()`. Never import it statically outside type positions.

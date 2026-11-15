# src/ui

Everything the viewer sees and interacts with: the control elements, keyboard shortcuts, auto-hiding controls, and the helpers that connect controls to the player. Code here reads state and calls actions on the `PlayerController` from [`core/`](../core/README.md). It never touches the `<video>` element directly.

## Files

| File                 | What it holds                                                                          |
| -------------------- | -------------------------------------------------------------------------------------- |
| `context.ts`         | `playerContext`: the Lit context that carries the `PlayerController`                   |
| `player-consumer.ts` | `PlayerConsumer`: connects an element to the player and re-renders it on a state slice |
| `keyboard.ts`        | `DEFAULT_SHORTCUTS`, `handleShortcut()`, and the rules for when a key press is ignored |
| `auto-hide.ts`       | `AutoHide`: shows/hides the controls based on activity                                 |
| `format.ts`          | `formatTime()` (`1:05`, `1:02:05`) and `formatTimeForAria()` (`1 minute 5 seconds`)    |
| `icons.ts`           | Inline SVG icons (`icons.play`, `icons.pause`, …)                                      |
| `styles.ts`          | `buttonStyles`, shared by all icon buttons                                             |
| `controls/`          | One custom element per control (below)                                                 |

## How a control works

Every control is a small Lit element that follows the same pattern:

```ts
@customElement('mp-play-button')
export class PlayButton extends LitElement {
  static styles = buttonStyles;
  // Subscribe to only what this control renders.
  private player = new PlayerConsumer(this, (s) => s.status);

  render() {
    const playing = this.player.value === 'playing';
    return html`<button
      part="button"
      aria-label=${playing ? 'Pause' : 'Play'}
      @click=${() => this.player.controller?.togglePlay()}
    >
      …
    </button>`;
  }
}
```

**`PlayerConsumer`** does two jobs:

1. **Finds the controller.** It uses a `ContextConsumer`. `<movie-player>` provides `playerContext`, and the request bubbles up through shadow roots, so this works for the built-in controls in the player's shadow DOM and for elements a developer places inside `<movie-player>`.
2. **Subscribes to a slice of state.** It re-renders the host only when that slice changes, comparing with `shallowEqual` by default, so selectors may return small objects.

Both `value` and `controller` are `undefined` until the context arrives, so render code must handle that case (`this.player.value?.…`, `this.player.controller?.…`).

**Selectors control how often a control re-renders.** While playing, `currentTime` changes every animation frame. So:

- `mp-time-display` selects `Math.floor(currentTime)` and re-renders once a second.
- `mp-seek-bar` selects raw `currentTime`, because it has to move smoothly.

Only select what you render.

## Controls

| Element                | Selects                                     | Notes                                                                    |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `mp-control-bar`       | `controlsVisible`                           | Container with a `<slot>`; sets `data-hidden` to fade out                |
| `mp-play-button`       | `status`                                    | Play / Pause / Replay                                                    |
| `mp-seek-bar`          | time, duration, buffered, live              | See below; hidden for live streams                                       |
| `mp-time-display`      | whole seconds, duration, live               | `0:42 / 10:34` or a LIVE badge                                           |
| `mp-volume`            | volume, muted, `capabilities.volumeControl` | Mute button + range slider; slider hidden on iOS                         |
| `mp-pip-button`        | pip, `capabilities.pip`                     | Hidden where unsupported                                                 |
| `mp-fullscreen-button` | fullscreen, `capabilities.fullscreen`       | Hidden where unsupported                                                 |
| `mp-big-play`          | `status`                                    | Centre button when `ready`, `paused` or `ended`                          |
| `mp-spinner`           | `status`                                    | When `loading`/`waiting`; fades in after 300ms to avoid flicker          |
| `mp-error-overlay`     | `error`                                     | Message + "Try again" (`controller.retry()`); no retry for `UNSUPPORTED` |

**Seek bar specifics:**

- **Drag.** `pointerdown` captures the pointer, and `pointermove` updates a local `previewTime`. The seek is committed only on `pointerup`, so dragging doesn't flood the network with segment requests.
- **Hover.** The tooltip shows for mouse pointers only.
- **Accessibility.** `role="slider"` with `aria-valuetext` in words. Arrow keys move ±5s, Page Up/Down ±10%, and Home/End jump to the ends.
- **Key handling.** Keys it handles call `stopPropagation()`, so the player-level shortcuts don't handle them a second time. The volume slider does the same for arrow keys.

**Adding a control:**

1. Create `controls/<name>.ts` following the pattern above, and add `declare global { interface HTMLElementTagNameMap … }`.
2. Export it from `controls/index.ts`, which also makes it public through `src/index.ts`.
3. Place it in `<movie-player>`'s `render()`, with `exportparts` so page CSS can style it (`movie-player::part(...)`).
4. Add tests to `controls/controls.test.ts`.

## Styling conventions

- **Expose every visual value as a CSS variable with a fallback**: `var(--mp-accent, #4f8cff)`. Variables pass through shadow DOM, so pages can theme the player without touching parts. Reuse the existing names (`--mp-accent`, `--mp-control-color`, `--mp-control-size`, `--mp-font`, …) before inventing new ones.
- **Give meaningful inner elements a `part`.** `<movie-player>` re-exports them with `exportparts`. The parts and variables together form the theming API that Phase 5 builds on, so treat renames as breaking changes.
- **Interactive elements need** an `aria-label`, a visible `:focus-visible` outline (`--mp-focus-ring`), and a `title` that shows the shortcut where there is one.
- **Respect `prefers-reduced-motion`** for anything that animates continuously (see `spinner.ts`).

## Keyboard shortcuts (`keyboard.ts`)

`handleShortcut(event, controller, shortcuts)` is called from `<movie-player>`'s `keydown` listener, so shortcuts only work while focus is inside the player. It returns:

- a label (for example `"+10s"`) that the player shows briefly,
- `''` for a handled key with no label,
- `null` when it ignored the event.

A key press is ignored when:

- a modifier is held (Ctrl/Cmd/Alt), so browser shortcuts keep working;
- the target is a text input, textarea, select or contenteditable (for example, the future subtitle search box);
- it's Space/Enter on a focused button, which the browser already clicks; handling it too would toggle twice;
- an inner control already called `preventDefault()`.

Single-letter keys match case-insensitively. To add a default shortcut, add an entry to `DEFAULT_SHORTCUTS`, and return a label if feedback helps.

## Auto-hide (`auto-hide.ts`)

`AutoHide` is a Lit `ReactiveController` attached to `<movie-player>`. It shows the controls on mouse movement, any key press, keyboard focus or presses inside the control bar, and hides them after `AUTO_HIDE_DELAY_MS` (3s). It never hides them when:

- the status isn't `playing`;
- the mouse is over the control bar;
- keyboard focus is inside the control bar. Focus from a mouse click doesn't count, otherwise clicking Play would keep the controls up forever.

Moving the mouse out of the player hides them immediately. On touch screens, `<movie-player>` calls `toggle()` when the video area is tapped. When the controls are hidden, the player sets `data-idle`, which hides the cursor.

## Testing

| File                        | Covers                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `controls/controls.test.ts` | Each control's rendering and actions, plus a light-DOM custom element using `PlayerConsumer`                        |
| `interaction.test.ts`       | Shortcuts and their ignore rules, auto-hide timing (fake timers), click/tap handling, volume persistence attributes |
| `format.test.ts`            | Time formatting                                                                                                     |

Tests drive the UI by writing directly to `el.controller.store` and spying on controller actions. A `settle()` helper awaits `updateComplete` on every element, because nested Lit elements update asynchronously.

## Why

Pretty-printed JSON is readable until one object has 400 nested children and you're hunting for the one key you care about. Every dev-tool-grade JSON viewer (Chrome DevTools, Firefox, VS Code, JSONView, GitHub's blob renderer) lets the reader collapse objects and arrays on click to hide the noise and navigate. The extension already formats and highlights the output — the last piece standing between it and parity with those tools is an expandable tree. Adding it turns the extension from "a prettifier" into "a JSON viewer".

## What Changes

- Every object `{…}` and array `[…]` in a successfully highlighted `<pre>` is independently collapsible.
- Clicking an opener bracket (`{` or `[`) or its matching closer toggles that container between expanded and collapsed.
- Collapsed containers render on a single line as `{ … }` or `[ … ]` (a visible ellipsis placeholder); the inner content is DOM-hidden so it occupies zero vertical space.
- Default state: everything expanded. State is per-`<pre>` and does not persist across page loads.
- Toggle target has a visible hover state (so it's obviously interactive), the right keyboard role semantics (`role="button"`, `tabindex="0"`, `aria-expanded`), and responds to Space/Enter when focused.
- Line numbers still line up with the **visible** rows — when a container is collapsed the line gutter is recomputed so numbered rows remain 1:1 with rendered rows.
- Above-threshold payloads (where the content script already falls back to plain text and skips highlighting) do **not** get collapsibles in v1; they need structural info the fallback path doesn't have.

## Capabilities

### New Capabilities
- `collapsible-nodes`: interactive expand/collapse of object and array containers inside a formatted `<pre>`, including the toggle affordance, the collapsed placeholder, a11y semantics, and the rule for keeping the line-number gutter in sync with visible rows.

### Modified Capabilities
- `json-syntax-highlighting`: the content script's code-fragment builder now groups tokens inside each container into a wrapper element (with opener, content, placeholder, and closer children) instead of emitting a flat token/text sequence. The existing "token spans + plain-text punctuation" contract remains but is now nested structurally.
- `line-numbers`: the gutter is no longer a one-shot string built from `countNewlines(output)`. It is recomputed from the currently visible rows whenever a container is toggled, so the rule "one gutter number per visible row" is preserved.

## Impact

- `content.js` — the builder that today walks a flat token stream now produces a nested DOM tree with a small bracket-matching pass to pair openers and closers; adds a click/keyboard handler and a gutter-recompute helper.
- Injected stylesheet grows: hover affordance on toggle targets, collapsed-state styling, ellipsis placeholder, and the rule that hides content under a collapsed container.
- `e2e/` — new fixtures and Playwright assertions for click-to-collapse, keyboard toggle, gutter resync, and non-regression of the existing highlight / line-number tests.
- No changes to `src/` formatter internals. No new dependencies. No new Chrome permissions.
- Known limitation: copying a region that intersects collapsed containers yields the visible text (including the `{ … }` placeholder), which is not valid JSON. Users who want clean JSON should expand first. This matches how VS Code and GitHub already behave.

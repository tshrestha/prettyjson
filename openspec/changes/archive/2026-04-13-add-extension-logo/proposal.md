## Why

The Pretty JSON Chrome extension currently has no icon. `manifest.json` has no `icons` field, and there is no icon asset anywhere in the repository. On `chrome://extensions` and inside Chrome's extension management UI the extension appears with Chrome's default puzzle-piece placeholder, which is indistinguishable from any other unbranded extension. Adding a simple, unique mark gives the project an identity in those surfaces, in the README hero (if desired), and in any future Chrome Web Store listing.

The mark should be immediately recognizable at 16×16 pixels — the smallest size Chrome renders — and should visually connect to what the extension does: pretty-print JSON. It should also feel native to the extension's existing visual language (OneDark-Pro on `#282c34`, JetBrains Mono foreground) so that a user who sees the icon and then opens a formatted JSON page experiences a coherent brand.

## What Changes

- Add a new `icons/` directory at the repository root containing a single source SVG and four PNG exports at the Chrome-standard sizes: `16`, `32`, `48`, and `128` pixels square.
- The logo concept: **a pair of curly braces enclosing a four-row indent stack**, colored with the existing OneDark-Pro JSON token palette. The indent stack reads as a formatted JSON tree at a glance; the enclosing braces read as "JSON."
- Declare the four PNGs in `manifest.json` under a new `icons` field. Do **not** add a browser `action` — the extension is content-script-only and should remain so.
- Optional, scoped out of the minimum: referencing the 128px icon from `README.md` as a small hero image. Out of scope for this change to keep it focused on the extension-surface icon.
- No changes to content-script behavior, formatter code, tests, or any existing file other than `manifest.json`.

## Capabilities

### New Capabilities

- `extension-logo`: governs the extension's icon assets and their declaration in `manifest.json`. Establishes the source-SVG + PNG-export layout, the four required sizes (16/32/48/128), the concept (braces-enclosed indent stack in OneDark-Pro colors), and the rule that any future logo change re-exports all four PNGs from the same source SVG so they stay pixel-consistent.

### Modified Capabilities

_None. No existing capability spec describes the extension icon today._

## Impact

- **Affected files**:
  - `manifest.json` — add an `icons` field referencing the four PNGs.
  - `icons/logo.svg` (new) — source SVG.
  - `icons/logo-16.png`, `icons/logo-32.png`, `icons/logo-48.png`, `icons/logo-128.png` (new) — raster exports.
- **Affected code**: none. No source file under `src/`, no test, no build step, and no content-script behavior changes.
- **Affected users**:
  - Users viewing `chrome://extensions` — the puzzle-piece placeholder is replaced with the branded icon.
  - Users viewing Chrome's extension management UI and (once the icon is also referenced from the README) anyone landing on the GitHub repo.
- **Risk**: low. The only runtime surface that changes is the icon displayed by Chrome. If the PNG files are malformed or missing, Chrome falls back to the default puzzle piece — the extension continues to load and function. The e2e suite does not depend on the icon. The manifest schema change (`icons` object) is supported in every MV3 version.

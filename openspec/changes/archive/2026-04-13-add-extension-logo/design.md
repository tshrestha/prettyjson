## Context

Pretty JSON is a content-script-only Chrome MV3 extension that auto-formats JSON `<pre>` blocks on any page. It has no toolbar action, no popup, and no options page. The only surfaces where Chrome renders an extension icon for a content-script-only extension are:

- The `chrome://extensions` management page (uses the 48px icon).
- The Chrome extension details / management UI (uses 128px).
- The "Manage extensions" menu in Chrome's main toolbar (uses 16–32px).
- A future Chrome Web Store listing, if published (requires 128px minimum).
- The `chrome://extensions` page's small "enabled extensions" area (16px).

The repository has no existing icon assets, no `icons` entry in `manifest.json`, and no build step for assets. The visual language already established by the extension is the OneDark-Pro theme:

| Role                           | Hex       | Used for                                     |
| ------------------------------ | --------- | -------------------------------------------- |
| Background                     | `#282c34` | `pre.json-formatted` background              |
| Foreground / muted punctuation | `#abb2bf` | default text, braces `{` `}` `[` `]` `,` `:` |
| Key red                        | `#e06c75` | `pj-key`                                     |
| String green                   | `#98c379` | `pj-string`                                  |
| Number orange                  | `#d19a66` | `pj-number`                                  |
| Boolean / null cyan            | `#56b6c2` | `pj-boolean`, `pj-null`                      |

These values live in `content.js` and are the only palette the extension ships with, so the logo should reuse them exactly rather than introduce a second palette.

## Goals / Non-Goals

**Goals:**

- Produce a single mark that reads as "formatted JSON" at first glance and stays legible at 16×16 — the smallest rendered size.
- Use only OneDark-Pro palette values already present in `content.js`. No new colors.
- Ship both a hand-authored source SVG (`icons/logo.svg`) and four PNG exports (`16`, `32`, `48`, `128`) so Chrome has raster assets at every declared size. The SVG is the source of truth; the PNGs are regenerated from it.
- Declare the icon in `manifest.json` under a new top-level `icons` field so Chrome picks it up on load.
- Keep the design trivially reproducible: a future contributor can re-export the PNGs from the SVG using any SVG-to-PNG tool without special knowledge.

**Non-Goals:**

- No browser `action` (toolbar button). The extension is intentionally content-script-only and adding an action would change its surface area.
- No animated or dark/light theme variants. One mark, one color scheme.
- No favicon, social-share image, or Chrome Web Store promo art. Out of scope.
- No build-step automation for regenerating PNGs. Manual re-export is acceptable for a four-file asset set.
- No changes to `content.js`, the formatter, the worker, or any test. The logo lives entirely in `icons/` and `manifest.json`.
- No hero image in `README.md` in this change. Can be a follow-up.

## Decisions

### Decision: Concept — curly braces enclosing a four-row indent stack

**What**: The mark is a pair of curly braces `{` `}` with four short horizontal bars stacked between them. Each bar is indented slightly relative to its neighbors to suggest the nested structure of pretty-printed JSON. Each bar is colored to echo one of the extension's token colors: top bar red (`#e06c75`, keys), next green (`#98c379`, strings), next orange (`#d19a66`, numbers), bottom cyan (`#56b6c2`, booleans/null). The braces themselves are rendered in the foreground color `#abb2bf`. The whole mark sits on a rounded-square background of `#282c34`.

**Why**: Braces alone are generic — every JSON library uses them. Indent bars alone are abstract and don't read as "JSON" at small sizes. Combining the two is the smallest visual unit that says both "JSON" (braces) and "pretty" (indented bars). Colouring the bars with the existing token palette ties the logo to the extension's runtime appearance — a user who sees the icon and then opens a formatted JSON page immediately recognizes the four colors. Reusing the existing palette also eliminates every "what color should X be" debate in one stroke.

**Alternatives considered**:

- _Curly brace as a stylized J_: a single glyph where the lower curl of `{` becomes a J hook. Clever but requires custom glyph work that may not read at 16px and depends on type-rendering quality that varies across platforms.
- _Braces with a single centered dot `{·}`_: simpler but indistinguishable from generic "JSON library" marks used all over GitHub.
- _`PJ` monogram inside braces_: too literal and forces two letterforms into a 16×16 space. Would need custom kerning and would be unreadable at the smallest size.
- _Indent bars alone, no braces_: reads as an abstract "list" icon. Loses the JSON association.

### Decision: Four horizontal bars, with a specific indent pattern

**What**: Four horizontal bars stacked top-to-bottom. From top: bar 1 is the widest and starts closest to the left brace; bar 2 is narrower and indented further right; bar 3 is the narrowest and indented further right again; bar 4 matches bar 2's indent and width (it reads as a closing sibling). This mimics the visual rhythm of a pretty-printed JSON object with a nested object inside.

**Why**: A four-bar stack maps to a recognizable "opening key, nested key, nested value, closing key" pattern. Three bars would feel sparse at larger sizes; five bars would become a grey smear at 16×16. Four is the smallest count that clearly reads as "multiple indented lines" without looking like a fence or a hamburger menu.

**Alternatives considered**:

- _Three bars with uniform indent_: looks like a hamburger menu icon. Rejected.
- _Five or more bars_: becomes indistinguishable from a stripe pattern at 16×16.
- _Bars of equal length with no indent offset_: reads as text lines in a document, not as indented JSON. The indent offset is what makes the mark say "pretty-printed."

### Decision: SVG source + four PNG exports, all committed

**What**: `icons/logo.svg` is the hand-authored source of truth. `icons/logo-16.png`, `icons/logo-32.png`, `icons/logo-48.png`, and `icons/logo-128.png` are committed PNG exports at those exact pixel dimensions. The `manifest.json` `icons` field references the four PNGs by size.

**Why**: Chrome will accept an SVG in `icons`, but raster PNGs are the long-standing standard and render more predictably across Chrome versions and OS platforms. PNG also avoids any surprise anti-aliasing differences between the extension surface and the Web Store. Committing both the SVG and the PNGs lets a future contributor edit the source and re-export without needing a build step.

**Alternatives considered**:

- _SVG only in the manifest_: allowed by MV3 but introduces variability across rendering contexts; raster is safer.
- _Only PNGs, no SVG source_: makes future edits destructive — any pixel-hinting cleanup is thrown away.
- _Auto-generate PNGs in a build step_: overkill for four static files.

### Decision: Add `icons` to `manifest.json`, do not add an `action`

**What**: `manifest.json` gains a single new top-level field: `"icons": { "16": "icons/logo-16.png", "32": "icons/logo-32.png", "48": "icons/logo-48.png", "128": "icons/logo-128.png" }`. No `action` field is introduced. No `default_icon` anywhere.

**Why**: Chrome's MV3 `icons` field covers every surface where Chrome renders an icon for a content-script-only extension (extensions page, management UI, Web Store). Adding an `action` would create a new toolbar button and popup surface, which is a meaningful UX change and not the goal here — the extension deliberately runs silently in the background.

**Alternatives considered**:

- _Add an `action` with `default_icon`_: adds a toolbar button the user would have to dismiss. Out of scope for a "just give it a logo" change.

### Decision: Reuse exact hex values from `content.js`, do not define new constants

**What**: The SVG uses the hex values `#282c34`, `#abb2bf`, `#e06c75`, `#98c379`, `#d19a66`, and `#56b6c2` as inline `fill` attributes. These values are copied directly from `content.js` lines 34, 45, 74–78. No new constants file, no CSS-variable indirection, no JavaScript import.

**Why**: The logo is a static asset. Introducing a constants file or a build step to share colors between CSS and SVG adds ceremony for no benefit — the list is six colors long and changes roughly never. The spec requires the values match; a simple grep check in the verification tasks is enough to keep them in sync.

**Alternatives considered**:

- _Extract colors into a shared JSON/JS module_: over-engineered for six hex values.
- _Use CSS variables in the SVG_: CSS variables inside an SVG used as an `<img>` or as a Chrome extension icon don't cascade from the host page. Would not work.

## Risks / Trade-offs

- **[Risk] The logo looks muddy at 16×16** → Mitigation: the tasks phase explicitly requires a 16×16 legibility check — open `icons/logo-16.png` at 100% zoom and confirm all four bars are visually distinct and the braces are still recognizable. If the four-bar concept fails the check, drop to three bars and re-export; update the spec requirement for bar count in the same commit.

- **[Risk] PNG exports drift out of sync with the SVG** → Mitigation: the spec requires PNGs to be regenerated from the SVG whenever the SVG changes, and the tasks phase includes a "do the PNGs match the SVG" visual check. There is no automated guard against drift — that is an accepted trade-off to avoid a build step for four files.

- **[Risk] The OneDark-Pro palette in the logo drifts out of sync with `content.js`** → Mitigation: the spec requires the six hex values in `icons/logo.svg` to match the values in `content.js` exactly. The verification tasks include a grep to confirm the SVG's hex values are a subset of the values in `content.js`. If `content.js` ever repalettes, the logo must be updated in the same change.

- **[Trade-off] No animated or hover variants** → A simple static mark is the goal. Adding variants multiplies the asset count and raises the "how do you keep them in sync" problem without proportional benefit.

- **[Trade-off] Manual PNG export** → Accepting manual re-export means four extra steps any time the SVG changes. Acceptable because the SVG is expected to change rarely and the build complexity avoided is larger than the ongoing cost.

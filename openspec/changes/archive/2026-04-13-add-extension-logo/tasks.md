## 1. Author the source SVG

- [x] 1.1 Create `icons/` at the repository root.
- [x] 1.2 Author `icons/logo.svg` as a 128×128 viewBox SVG. Use a rounded-square background rect filled `#282c34` with a corner radius around 18–24 (scale-relative).
- [x] 1.3 Draw the left and right curly braces `{` `}` centered vertically, stroked or filled in `#abb2bf`. Give them enough weight to stay recognizable when the file is rasterized to 16×16. Prefer building the braces from simple `<path>` curves rather than using a text glyph, so the mark renders identically regardless of installed fonts.
- [x] 1.4 Draw four horizontal bars between the braces, stacked top-to-bottom. Each bar is a `<rect>` with rounded end caps. Indent them so the vertical rhythm reads as a nested JSON block (for example: bar 1 leftmost, bar 2 indented right, bar 3 indented further right, bar 4 back to bar 2's indent). Keep the gap between bars equal.
- [x] 1.5 Fill the four bars, top to bottom, with exactly `#e06c75`, `#98c379`, `#d19a66`, `#56b6c2`. Use inline `fill="..."` attributes with those literal hex values — no CSS variables, no external stylesheet.
- [x] 1.6 Confirm the SVG contains no hex color other than the six values from the spec. Run `grep -Eoi '#[0-9a-f]{3,6}' icons/logo.svg | sort -u` and check every line against the allowlist.

## 2. Export the four PNG sizes

- [x] 2.1 Export `icons/logo-128.png` from `icons/logo.svg` at exactly 128×128 pixels. (Used headless `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --screenshot` against a minimal `<body>`-wrapped copy of the SVG. `qlmanage` added thumbnail padding and was unusable for small sizes.)
- [x] 2.2 Export `icons/logo-48.png` from `icons/logo.svg` at exactly 48×48 pixels.
- [x] 2.3 Export `icons/logo-32.png` from `icons/logo.svg` at exactly 32×32 pixels.
- [x] 2.4 Export `icons/logo-16.png` from `icons/logo.svg` at exactly 16×16 pixels.
- [x] 2.5 Verify each PNG's dimensions match its filename (e.g., `file icons/logo-16.png` or `sips -g pixelWidth -g pixelHeight icons/logo-16.png`).
- [x] 2.6 Open `icons/logo-16.png` at 100% zoom and confirm the four bars are still visually distinct (not merged into a single blob) and that the braces are still recognizable as braces. First iteration used bar height 10 / stroke 12 and failed the check; second iteration went to bar height 14 / stroke 16 and passed the four-bar check but the stroke-16 braces felt too thick and the stack too scrunched. Final (shipped) iteration drops the stroke to 10, extends the braces vertically (y 12→116), and pulls the stack in to widths 48/36/22/36 so there's visible air — roughly 7u horizontal clearance and 12u vertical padding between bars and braces at 128px. Four bars remain distinct at 16×16; the brace pinch is visible at 32px and above.

## 3. Wire the icons into `manifest.json`

- [x] 3.1 Add a top-level `icons` field to `manifest.json` with keys `"16"`, `"32"`, `"48"`, `"128"` pointing at `icons/logo-16.png`, `icons/logo-32.png`, `icons/logo-48.png`, and `icons/logo-128.png`. Placed immediately after the existing `description` field and before `content_scripts`.
- [x] 3.2 Confirm no `action` field was added. The extension stays content-script-only.
- [x] 3.3 Run `npm run fmt` so `dprint` reformats `manifest.json` in place.

## 4. Verify the extension loads with the new icons

- [x] 4.1 Open `chrome://extensions` in Chrome and reload the unpacked extension (or load it fresh if not already loaded). Verified by the user.
- [x] 4.2 Confirm the extension card on `chrome://extensions` shows the new 48px icon instead of Chrome's default puzzle piece. Verified by the user.
- [x] 4.3 Open the extension's details page (click the card) and confirm the 128px icon renders correctly. Verified by the user.
- [x] 4.4 Open `chrome://extensions` at a high browser zoom level and confirm the icon doesn't become blurry or pixelated (if it does, the browser is probably falling back to a smaller size than expected — recheck the manifest paths). Verified by the user.

## 5. Content-preservation and scope checks

- [x] 5.1 Run `git diff --stat` and confirm the only files changed are `manifest.json` and files under `icons/`. Verified: `git diff` of tracked code paths (`content.js`, `src/**`, `e2e/**`, `themes/**`) is empty. The only untracked or modified paths outside `icons/` and `manifest.json` are `openspec/**` artifacts, which are the expected deliverables of this workflow.
- [x] 5.2 Grep `content.js` for the six hex values (`#282c34`, `#abb2bf`, `#e06c75`, `#98c379`, `#d19a66`, `#56b6c2`) and confirm all six still appear unchanged. All six found.
- [x] 5.3 Run `npm test` (unit tests) and confirm all 77 tests still pass. 77/77 passing.
- [x] 5.4 Run `openspec validate add-extension-logo --strict` and confirm it passes. Passes.

# extension-logo Specification

## Purpose

TBD - created by archiving change add-extension-logo. Update Purpose after archive.

## Requirements

### Requirement: Repository ships a source SVG logo and four PNG exports

The repository SHALL contain an `icons/` directory at its root. This directory SHALL contain:

- `icons/logo.svg` — the hand-authored source of truth for the logo.
- `icons/logo-16.png` — a raster export exactly 16 pixels square.
- `icons/logo-32.png` — a raster export exactly 32 pixels square.
- `icons/logo-48.png` — a raster export exactly 48 pixels square.
- `icons/logo-128.png` — a raster export exactly 128 pixels square.

The four PNG files SHALL be regenerated from `icons/logo.svg` whenever the SVG is edited. No PNG may be hand-touched independently of the source SVG.

#### Scenario: A contributor opens the repository for the first time

- **WHEN** a contributor lists the contents of the repository root
- **THEN** an `icons/` directory exists
- **AND** `icons/logo.svg`, `icons/logo-16.png`, `icons/logo-32.png`, `icons/logo-48.png`, and `icons/logo-128.png` all exist

#### Scenario: A PNG is inspected at its declared size

- **WHEN** a reviewer opens `icons/logo-16.png`, `icons/logo-32.png`, `icons/logo-48.png`, or `icons/logo-128.png` in an image viewer
- **THEN** the pixel dimensions of the file exactly match the number in its filename (16×16, 32×32, 48×48, or 128×128)

#### Scenario: The SVG changes

- **WHEN** a contributor edits `icons/logo.svg`
- **THEN** all four PNG files MUST be re-exported from the updated SVG in the same change
- **AND** no PNG may contain content that is not derivable from the current `icons/logo.svg`

### Requirement: `manifest.json` declares the logo under `icons`

The extension's `manifest.json` SHALL contain a top-level `icons` field that maps each Chrome-standard size (16, 32, 48, 128) to the corresponding PNG path under `icons/`. The `manifest.json` SHALL NOT introduce a browser `action` as part of this change.

#### Scenario: Chrome loads the extension unpacked

- **WHEN** Chrome loads the extension via **Load unpacked** from the repository root
- **THEN** Chrome reads the `icons` field from `manifest.json`
- **AND** Chrome renders `icons/logo-48.png` on the `chrome://extensions` card
- **AND** Chrome renders `icons/logo-128.png` on the extension details page
- **AND** Chrome does NOT render a toolbar action button for the extension

#### Scenario: The manifest is inspected

- **WHEN** a reviewer opens `manifest.json`
- **THEN** the top-level `icons` field exists with keys `"16"`, `"32"`, `"48"`, and `"128"`
- **AND** each value is the relative path `icons/logo-<size>.png`
- **AND** no `action` field is present

### Requirement: The logo uses the extension's existing OneDark-Pro palette

The `icons/logo.svg` file SHALL use only hex color values that are already present in `content.js`. The allowed palette is exactly:

- `#282c34` — background (matches `pre.json-formatted` background)
- `#abb2bf` — foreground / brace color (matches `pre.json-formatted` default text color)
- `#e06c75` — key red (matches `.pj-key`)
- `#98c379` — string green (matches `.pj-string`)
- `#d19a66` — number orange (matches `.pj-number`)
- `#56b6c2` — boolean / null cyan (matches `.pj-boolean` and `.pj-null`)

No other hex color may appear in `icons/logo.svg`. When a PNG is regenerated from the SVG, its rendered pixels are only required to approximate these colors (anti-aliased edges MAY introduce intermediate values).

#### Scenario: The SVG is grep'd for colors

- **WHEN** a reviewer searches `icons/logo.svg` for hex color literals
- **THEN** every hex value found is one of `#282c34`, `#abb2bf`, `#e06c75`, `#98c379`, `#d19a66`, or `#56b6c2`

#### Scenario: `content.js` is repaletted in a future change

- **WHEN** a future change edits the hex values in `content.js`
- **THEN** that same change MUST update `icons/logo.svg` and re-export all four PNG files to match
- **AND** a change that updates the palette in only one of the two files is not complete

### Requirement: The logo is a curly-brace pair enclosing a four-row indent stack

The `icons/logo.svg` mark SHALL consist of a pair of curly braces `{` `}` in the foreground color `#abb2bf`, enclosing exactly four horizontal bars stacked top-to-bottom between the braces. The four bars SHALL be indented relative to one another so that the composition visually reads as a pretty-printed JSON object with a nested structure (not as a uniform-width stripe pattern). The four bars SHALL be colored top-to-bottom as: `#e06c75`, `#98c379`, `#d19a66`, `#56b6c2`. The mark SHALL sit on a rounded-square background filled with `#282c34`.

#### Scenario: A user views the logo on chrome://extensions

- **WHEN** a user views the extension card on `chrome://extensions`
- **THEN** they see a rounded-square `#282c34` background
- **AND** inside that background they see a pair of `{` `}` braces in the foreground color
- **AND** between the braces they see four indented horizontal bars in red, green, orange, and cyan from top to bottom

#### Scenario: The 16×16 export is opened at 100% zoom

- **WHEN** a reviewer opens `icons/logo-16.png` at 100% zoom
- **THEN** the four horizontal bars are visually distinct (not merged into a single blob)
- **AND** the left and right curly braces remain recognizable as braces, not as vertical bars

### Requirement: No content-script or runtime behavior changes accompany the logo

The change that introduces the logo SHALL NOT modify `content.js`, any file under `src/`, any test under `src/*.test.js`, any file under `e2e/`, any file under `themes/`, or the formatter's public API. The only files that MAY change are `manifest.json` (to add the `icons` field) and files inside the new `icons/` directory.

#### Scenario: The change is reviewed

- **WHEN** a reviewer inspects the diff introduced by this change
- **THEN** the diff touches only `manifest.json` and files under `icons/`
- **AND** the diff does not touch `content.js`, `src/`, `e2e/`, `themes/`, or any test file

## ADDED Requirements

### Requirement: README leads with a one-line description and Table of Contents

The top-level `README.md` SHALL begin with the project title, immediately followed by a one-sentence description of what the project is, and then a Table of Contents. The Table of Contents SHALL appear before any other section of the document. The Table of Contents SHALL contain an entry for every top-level section of the README and each entry SHALL be a GitHub-flavored Markdown anchor link that resolves to that section's heading.

#### Scenario: A reader opens the README on github.com

- **WHEN** a reader loads `README.md` on github.com
- **THEN** the first content below the title is a single-sentence description of what Pretty JSON is
- **AND** the next content below that description is a bulleted Table of Contents
- **AND** clicking any entry in the Table of Contents scrolls the reader to the matching section on the same page

#### Scenario: A new top-level section is added

- **WHEN** a contributor adds a new top-level (`##`) section to `README.md`
- **THEN** the Table of Contents MUST be updated in the same change to include a link to that section
- **AND** the change is not complete until every top-level section in the document has a matching Table of Contents entry

### Requirement: README presents the Chrome Extension section first

The `README.md` SHALL present the Chrome Extension section as the first top-level section after the Table of Contents. This section is written for end users who want to install and use the extension, not for developers embedding the library. It SHALL describe what the extension does on a page it runs on, SHALL provide instructions for loading the extension as an unpacked Chrome MV3 extension, and SHALL describe the visible features a user will see (auto-formatted JSON, syntax highlighting with the default OneDark-Pro theme in JetBrains Mono, line numbers, collapsible nodes, and the large-document plain-text fallback behavior).

#### Scenario: An end user lands on the README from a link

- **WHEN** an end user opens `README.md` and scrolls past the Table of Contents
- **THEN** the first top-level section they encounter is the Chrome Extension section
- **AND** that section tells them what the extension does, how to install it, and what to expect when it runs
- **AND** the end user can install the extension without reading any other section of the README

#### Scenario: The Chrome Extension section describes install steps

- **WHEN** a reader reads the Chrome Extension install instructions
- **THEN** the instructions describe loading the repository as an unpacked extension via `chrome://extensions`
- **AND** the instructions do not claim a Chrome Web Store listing unless one exists

### Requirement: README presents the Library section second

The `README.md` SHALL present the Library section as the second top-level section after the Chrome Extension section. This section is written for developers embedding the formatter in their own code. It SHALL be self-contained — a developer who reads only the Library section (and its subsections) SHALL have everything they need to install the library, format JSON synchronously, format JSON asynchronously via the Worker-backed API, handle formatting errors, opt into token emission for syntax highlighting, and look up the full public API and options.

#### Scenario: A developer evaluates the library

- **WHEN** a developer opens `README.md` and jumps to the Library section via the Table of Contents
- **THEN** the Library section contains, in order: import snippet, synchronous usage example for `formatString`, Worker-backed async usage example for `createFormatter`, error handling guidance for malformed JSON, token emission opt-in, full API reference for `formatString` / `formatBytes` / `createFormatter` / `FormatError`, and the options table
- **AND** the developer does not need to scroll to any other top-level section to use the library

#### Scenario: A developer looks up an option default

- **WHEN** a developer searches `README.md` for a formatter option such as `indentSize`, `chunkSize`, `onProgress`, `signal`, or `tokens`
- **THEN** the option is documented inside the Library section with its name, type, default value, and effect

### Requirement: README presents Architecture and Design after the Library section

The `README.md` SHALL present an Architecture & Design section after the Library section and before the Development section. This section SHALL contain the project's directory map, its core design principles (zero-parse formatting, byte-level processing, Web Worker offloading, chunked processing with cancellation), the performance comparison table, and the attribution block for the OneDark-Pro theme and JetBrains Mono font.

#### Scenario: A contributor looks for internals

- **WHEN** a contributor wants to understand how the formatter is structured internally
- **THEN** they can jump from the Table of Contents to the Architecture & Design section and find the directory map and design principles there
- **AND** the design principles explain zero-parse formatting, byte-level processing, Worker offloading, and chunked processing with cancellation

#### Scenario: Architecture section does not precede user-facing sections

- **WHEN** `README.md` is read top to bottom
- **THEN** neither the directory map nor any design principle appears above the Chrome Extension or Library sections
- **AND** the first architectural content the reader encounters is inside the Architecture & Design section

### Requirement: README presents a Development section for contributors

The `README.md` SHALL present a Development section as the final top-level section. This section SHALL document how to run the unit test suite (`node --test src/formatter.test.js`) and how to run the Playwright end-to-end test suite including the `HEADLESS=1` environment variable for background runs.

#### Scenario: A contributor runs the tests

- **WHEN** a contributor reads the Development section
- **THEN** they find the command to run unit tests and the command to run the Playwright end-to-end tests
- **AND** they find the note that e2e tests default to headed mode and the `HEADLESS=1` opt-in for CI

### Requirement: README preserves all factual content from prior versions

When `README.md` is reorganized, every factual claim present in the prior version SHALL be preserved somewhere in the rewritten file. This includes but is not limited to: the public API surface (`formatString`, `formatBytes`, `createFormatter`, `FormatError`), every option name and default (`indentSize`, `onProgress`, `signal`, `chunkSize`, `tokens`), every error type (`unbalanced_close`, `unclosed_container`, `unterminated_string`), every token kind constant (`TOKEN_PUNCT`, `TOKEN_KEY`, `TOKEN_STRING`, `TOKEN_NUMBER`, `TOKEN_BOOLEAN`, `TOKEN_NULL`), the performance comparison table, the `HIGHLIGHT_TOKEN_THRESHOLD` note, and the attribution links for OneDark-Pro and JetBrains Mono.

#### Scenario: A reorganization drops a fact

- **WHEN** a contributor reorganizes `README.md`
- **AND** a factual claim present in the prior version is missing from the rewritten file
- **THEN** the change is not complete and the missing fact MUST be restored before the change is merged

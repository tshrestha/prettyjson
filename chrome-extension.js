/**
 * @module chrome-extension-example
 * @description Example integration for a Chrome extension.
 *
 * This shows the recommended pattern for using the formatter
 * in a Chrome extension's content script or side panel.
 *
 * File structure for a Chrome extension:
 *
 *   extension/
 *   ├── manifest.json
 *   ├── src/
 *   │   ├── constants.js
 *   │   ├── formatter.js
 *   │   ├── chunker.js
 *   │   ├── worker.js
 *   │   ├── client.js
 *   │   └── index.js
 *   ├── content.js          ← this file
 *   └── popup.html / panel.html
 */

// ── Setup ────────────────────────────────────────────────────────────

import { createFormatter } from "./src/index.js"

// Create a single formatter instance for the lifetime of the page.
// The Web Worker is lazily initialised on first use.
const formatter = createFormatter({
  workerURL: chrome.runtime.getURL("src/worker.js"),
})

// ── Format JSON with progress & cancellation ────────────────────────

/**
 * Format JSON content from the page, with full UX support.
 *
 * @param {string}  rawJson   - The raw JSON string to format.
 * @param {Object}  [opts]
 * @param {number}  [opts.indentSize=2]
 * @param {function} [opts.onProgress]  - Called with percent (0–100).
 * @returns {{ promise: Promise<{output: string, errors: Array}>, cancel: () => void }}
 */
export const formatWithCancel = (rawJson, opts = {}) => {
  const controller = new AbortController()

  const promise = formatter.format(rawJson, {
    indentSize: opts.indentSize ?? 2,
    signal: controller.signal,
    onProgress: opts.onProgress,
  })

  const cancel = () => controller.abort()

  return { promise, cancel }
}

// ── Example: format <pre> elements containing JSON ──────────────────

const formatPreElements = async () => {
  const preElements = document.querySelectorAll("pre")

  for (const el of preElements) {
    const text = el.textContent.trim()

    // Quick heuristic: does it look like JSON?
    if (!text.startsWith("{") && !text.startsWith("[")) continue

    try {
      const { promise } = formatWithCancel(text, {
        onProgress: (pct) => {
          el.dataset.formatProgress = `${pct}%`
        },
      })

      const { output, errors } = await promise
      el.textContent = output
      el.classList.add("json-formatted")

      // Surface structural errors to the UI without blocking display.
      // The formatted output is still shown — the user sees their JSON
      // alongside any problems found.
      if (errors.length > 0) {
        el.classList.add("json-has-errors")
        el.dataset.jsonErrors = JSON.stringify(errors)
        console.warn("JSON format: structural errors found", errors)
      }
    } catch (err) {
      if (err.name === "AbortError") return
      console.warn("JSON format failed:", err.message)
    }
  }
}

// ── Example manifest.json ────────────────────────────────────────────

/*
{
  "manifest_version": 3,
  "name": "JSON Formatter",
  "version": "1.0.0",
  "permissions": [],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/worker.js", "src/*.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
*/

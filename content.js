;(() => {
  const pres = document.querySelectorAll("pre")
  if (pres.length === 0) return

  const candidates = []
  for (const el of pres) {
    const text = el.textContent
    const len = text.length
    let i = 0
    while (i < len && text.charCodeAt(i) <= 32) i++
    if (i === len) continue
    const ch = text.charCodeAt(i)
    if (ch !== 0x7B && ch !== 0x5B) continue
    candidates.push(el)
  }
  if (candidates.length === 0) return

  const FONT_URL = chrome.runtime.getURL("themes/fonts/JetBrainsMono-Regular.woff2")
  const STYLE_MARKER = "data-pretty-json"

  /**
   * Inject the default-theme stylesheet once per page. No-op on
   * subsequent calls. Wrapped in try/catch so a restrictive page CSP
   * or DOM error falls through to plain-text rendering rather than
   * crashing the content script.
   */
  function ensureStylesheet() {
    if (document.querySelector(`style[${STYLE_MARKER}]`)) return
    try {
      const style = document.createElement("style")
      style.setAttribute(STYLE_MARKER, "")
      style.textContent = `
html {
  background: #282c34;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("${FONT_URL}") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
pre.json-formatted {
  background-color: #282c34;
  color: #abb2bf;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
pre.json-formatted :where(.pj-key)     { color: #e06c75; }
pre.json-formatted :where(.pj-string)  { color: #98c379; }
pre.json-formatted :where(.pj-number)  { color: #d19a66; }
pre.json-formatted :where(.pj-boolean) { color: #56b6c2; }
pre.json-formatted :where(.pj-null)    { color: #56b6c2; }
/* v2: @media (prefers-color-scheme: light) { ... } */
`
      document.head.appendChild(style)
    } catch (err) {
      console.warn("Pretty JSON: stylesheet injection failed:", err.message)
    }
  }

  /**
   * Ask the browser to load the bundled font before we start rendering
   * spans, so the first paint of any highlighted <pre> uses JetBrains
   * Mono instead of a fallback-then-swap. Silently degrades to the
   * fallback chain on failure.
   */
  async function preloadFont() {
    try {
      if (document.fonts && typeof document.fonts.load === "function") {
        await document.fonts.load("400 13px \"JetBrains Mono\"")
      }
    } catch {
      // Non-fatal — the CSS font-family fallback chain takes over.
    }
  }

  /**
   * Build a DocumentFragment for the formatted output and swap it into
   * `el`. Emits <span class="pj-..."> for the five non-punctuation token
   * kinds; punctuation and whitespace go in as plain text nodes and
   * inherit the default foreground color from pre.json-formatted.
   */
  function renderHighlighted(el, output, tokens, kindToClass, puncCode) {
    const frag = document.createDocumentFragment()
    const { offsets, kinds, count } = tokens
    let cursor = 0
    for (let t = 0; t < count; t++) {
      const start = offsets[t * 2]
      const end = offsets[t * 2 + 1]
      if (start > cursor) {
        frag.appendChild(document.createTextNode(output.substring(cursor, start)))
      }
      const kind = kinds[t]
      if (kind === puncCode) {
        // Punctuation: plain text node, inherits default fg color.
        frag.appendChild(document.createTextNode(output.substring(start, end)))
      } else {
        const span = document.createElement("span")
        span.className = kindToClass[kind]
        span.textContent = output.substring(start, end)
        frag.appendChild(span)
      }
      cursor = end
    }
    if (cursor < output.length) {
      frag.appendChild(document.createTextNode(output.substring(cursor)))
    }
    el.replaceChildren(frag)
  }

  import(chrome.runtime.getURL("src/index.js"))
    .then(async (mod) => {
      const {
        createFormatter,
        HIGHLIGHT_TOKEN_THRESHOLD,
        TOKEN_PUNCT,
        TOKEN_KEY,
        TOKEN_STRING,
        TOKEN_NUMBER,
        TOKEN_BOOLEAN,
        TOKEN_NULL,
      } = mod

      const kindToClass = new Array(6)
      kindToClass[TOKEN_KEY] = "pj-key"
      kindToClass[TOKEN_STRING] = "pj-string"
      kindToClass[TOKEN_NUMBER] = "pj-number"
      kindToClass[TOKEN_BOOLEAN] = "pj-boolean"
      kindToClass[TOKEN_NULL] = "pj-null"

      const formatter = createFormatter({
        workerURL: chrome.runtime.getURL("src/worker.js"),
      })

      // One-shot page setup: inject the stylesheet and preload the
      // default font before we start rendering. Either step failing is
      // non-fatal — the render path degrades to fallback typography.
      ensureStylesheet()
      await preloadFont()

      for (const el of candidates) {
        const text = el.textContent.trim()
        try {
          const result = await formatter.format(text, { indentSize: 2, tokens: true })
          if (result.errors.length > 0) continue

          el.classList.add("json-formatted")

          const tokens = result.tokens
          const underThreshold = tokens && tokens.count <= HIGHLIGHT_TOKEN_THRESHOLD

          if (underThreshold) {
            try {
              renderHighlighted(el, result.output, tokens, kindToClass, TOKEN_PUNCT)
            } catch (err) {
              // DOM/rendering failure — fall back to plain formatted
              // text. The theme background + font still apply via the
              // json-formatted class.
              console.warn("Pretty JSON: render failed, falling back:", err.message)
              el.textContent = result.output
            }
          } else {
            // Above HIGHLIGHT_TOKEN_THRESHOLD: the DOM cost of hundreds
            // of thousands of spans outweighs the readability win.
            // Render plain formatted text (still themed via the
            // json-formatted class).
            el.textContent = result.output
          }
        } catch (err) {
          if (err.name !== "AbortError") {
            console.warn("Pretty JSON: format failed:", err.message)
          }
        }
      }
    })
    .catch((err) => {
      console.error("Pretty JSON: failed to load formatter module:", err)
    })
})()

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

  // Dynamic import works from a classic content script as long as the
  // target module is listed in web_accessible_resources.
  import(chrome.runtime.getURL("src/index.js"))
    .then(({ createFormatter }) => {
      const formatter = createFormatter({
        workerURL: chrome.runtime.getURL("src/worker.js"),
      })

      for (const el of candidates) {
        const text = el.textContent.trim()
        formatter.format(text, { indentSize: 2 })
          .then(({ output, errors }) => {
            if (errors.length === 0) {
              el.textContent = output
              el.classList.add("json-formatted")
            }
          })
          .catch((err) => {
            if (err.name !== "AbortError") {
              console.warn("Pretty JSON: format failed:", err.message)
            }
          })
      }
    })
    .catch((err) => {
      console.error("Pretty JSON: failed to load formatter module:", err)
    })
})()

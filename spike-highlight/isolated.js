// ISOLATED world content script.
//
// Reads the target <pre>, formats + tokenizes inline, then dispatches a
// CustomEvent on document carrying the result. The MAIN-world script
// listens for that event and does the actual rendering + measurement.
//
// No worker here because the spike is measuring DOM render cost, not
// formatter cost. A worker only matters if it affects the numbers we
// care about — it doesn't.
;(() => {
  console.log("[spike isolated] booting")
  const KIND_PUNCT = 0
  const KIND_KEY = 1
  const KIND_STRING = 2
  const KIND_NUMBER = 3
  const KIND_BOOLEAN = 4
  const KIND_NULL = 5

  const pre = document.querySelector("pre#target")
  if (!pre) return

  const raw = pre.textContent
  if (!raw || raw.length === 0) return

  // Format via JSON round-trip. This is fine for the spike — we're
  // measuring the DOM path, not the formatter.
  const tFormatStart = performance.now()
  let formatted
  try {
    formatted = JSON.stringify(JSON.parse(raw), null, 2)
  } catch (err) {
    console.error("spike isolated: JSON parse failed", err)
    return
  }
  const tFormatEnd = performance.now()

  // Tokenize the formatted output in one pass. Token offsets are UTF-16
  // code unit offsets into `formatted`, which is what the main-world
  // renderer will use for both StaticRange (highlight) and substring
  // (span) rendering.
  const tTokenizeStart = performance.now()
  const len = formatted.length
  const offsetsArr = []
  const kindsArr = []
  let i = 0
  while (i < len) {
    const c = formatted.charCodeAt(i)
    if (c <= 32) {
      i++
      continue
    }
    if (c === 0x22) {
      const start = i
      i++
      while (i < len) {
        const cc = formatted.charCodeAt(i)
        if (cc === 0x5C) {
          i += 2
          continue
        }
        if (cc === 0x22) {
          i++
          break
        }
        i++
      }
      let j = i
      while (j < len && formatted.charCodeAt(j) <= 32) j++
      const kind = (j < len && formatted.charCodeAt(j) === 0x3A) ? KIND_KEY : KIND_STRING
      offsetsArr.push(start, i)
      kindsArr.push(kind)
      continue
    }
    if (c === 0x7B || c === 0x7D || c === 0x5B || c === 0x5D || c === 0x2C || c === 0x3A) {
      offsetsArr.push(i, i + 1)
      kindsArr.push(KIND_PUNCT)
      i++
      continue
    }
    const start = i
    while (i < len) {
      const cc = formatted.charCodeAt(i)
      if (cc <= 32 || cc === 0x2C || cc === 0x7D || cc === 0x5D) break
      i++
    }
    const first = formatted.charCodeAt(start)
    let kind
    if (first === 0x74 || first === 0x66) kind = KIND_BOOLEAN
    else if (first === 0x6E) kind = KIND_NULL
    else kind = KIND_NUMBER
    offsetsArr.push(start, i)
    kindsArr.push(kind)
  }
  const offsets = new Uint32Array(offsetsArr)
  const kinds = new Uint8Array(kindsArr)
  const tTokenizeEnd = performance.now()

  const detail = {
    formatted,
    offsets,
    kinds,
    tokenCount: kinds.length,
    formatMs: tFormatEnd - tFormatStart,
    tokenizeMs: tTokenizeEnd - tTokenizeStart,
  }

  // The main-world script is listening for this. detail is structured-
  // cloned across the world boundary — typed arrays survive the clone.
  console.log("[spike isolated] dispatching event, tokens=", detail.tokenCount)
  document.dispatchEvent(new CustomEvent("spike:formatted", { detail }))
  console.log("[spike isolated] dispatched")
})()

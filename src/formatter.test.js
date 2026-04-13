/**
 * @module formatter.test
 * @description Test suite for the JSON formatter.
 *
 * Runs in Node.js (v18+) with the built-in test runner:
 *   node --test src/formatter.test.js
 *
 * Tests are organised by concern:
 *   1. Primitives & simple values
 *   2. Objects
 *   3. Arrays
 *   4. Nesting
 *   5. Strings & escaping
 *   6. Whitespace handling (minified & already-formatted input)
 *   7. Edge cases
 *   8. Options
 *   9. Output buffer
 *   10. Performance sanity check
 */

import assert from "node:assert/strict"
import { getEventListeners } from "node:events"
import { after, before, describe, it } from "node:test"
import { processInChunks } from "./chunker.js"
import { createFormatter } from "./client.js"
import { TOKEN_BOOLEAN, TOKEN_KEY, TOKEN_NULL, TOKEN_NUMBER, TOKEN_PUNCT, TOKEN_STRING } from "./constants.js"
import {
  buildIndentCache,
  createFormatterState,
  createOutputBuffer,
  createTokenBuffer,
  formatBytes,
  formatChunk,
  formatString,
} from "./formatter.js"

// ── Helpers ──────────────────────────────────────────────────────────

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Format via the byte API and decode to string for easy assertions. */
const fmtBytes = (input, opts) => decoder.decode(formatBytes(encoder.encode(input), opts).output)

/** Reference formatter (uses JSON.parse → JSON.stringify). */
const reference = (input, indent = 2) => JSON.stringify(JSON.parse(input), null, indent)

/** Assert our formatter matches the reference for a given input. */
const assertMatchesReference = (input, opts) => {
  const { output, errors } = formatString(input, opts)
  const ref = reference(input, opts?.indentSize)
  assert.equal(output, ref, `Mismatch for input: ${input.slice(0, 80)}...`)
  assert.deepEqual(errors, [], `Unexpected errors for valid input: ${JSON.stringify(errors)}`)
}

// ── 1. Primitives ────────────────────────────────────────────────────

describe("Primitives", () => {
  it("formats null", () => assertMatchesReference("null"))
  it("formats true", () => assertMatchesReference("true"))
  it("formats false", () => assertMatchesReference("false"))
  it("formats integer", () => assertMatchesReference("42"))
  it("formats negative number", () => assertMatchesReference("-3.14"))
  it("formats exponent (preserves notation)", () => {
    // Our formatter preserves the original number representation,
    // unlike JSON.stringify which normalises exponents.
    assert.equal(formatString("1.5e10").output, "1.5e10")
  })
  it("formats string", () => assertMatchesReference("\"hello\""))
})

// ── 2. Objects ───────────────────────────────────────────────────────

describe("Objects", () => {
  it("formats empty object", () => assertMatchesReference("{}"))

  it("formats single-key object", () => assertMatchesReference("{\"a\":1}"))

  it("formats multi-key object", () => assertMatchesReference("{\"a\":1,\"b\":2,\"c\":3}"))

  it("formats object with string values", () => assertMatchesReference("{\"name\":\"Alice\",\"city\":\"NYC\"}"))

  it("formats object with mixed value types", () =>
    assertMatchesReference("{\"a\":1,\"b\":\"two\",\"c\":true,\"d\":null}"))
})

// ── 3. Arrays ────────────────────────────────────────────────────────

describe("Arrays", () => {
  it("formats empty array", () => assertMatchesReference("[]"))

  it("formats single-element array", () => assertMatchesReference("[1]"))

  it("formats multi-element array", () => assertMatchesReference("[1,2,3]"))

  it("formats array of strings", () => assertMatchesReference("[\"a\",\"b\",\"c\"]"))

  it("formats array of mixed types", () => assertMatchesReference("[1,\"two\",true,null]"))
})

// ── 4. Nesting ───────────────────────────────────────────────────────

describe("Nesting", () => {
  it("formats nested objects", () => assertMatchesReference("{\"a\":{\"b\":{\"c\":1}}}"))

  it("formats nested arrays", () => assertMatchesReference("[[[1,2],[3,4]],[[5]]]"))

  it("formats objects inside arrays", () => assertMatchesReference("[{\"a\":1},{\"b\":2}]"))

  it("formats arrays inside objects", () => assertMatchesReference("{\"list\":[1,2,3],\"nested\":{\"deep\":[4,5]}}"))

  it("handles deep nesting (20 levels)", () => {
    const open = "{\"k\":".repeat(20)
    const close = "}".repeat(20)
    const input = `${open}1${close}`
    assertMatchesReference(input)
  })
})

// ── 5. Strings & escaping ────────────────────────────────────────────

describe("Strings and escaping", () => {
  it("preserves escaped quotes", () => assertMatchesReference("{\"say\":\"he said \\\"hi\\\"\"}"))

  it("preserves escaped backslashes", () => assertMatchesReference("{\"path\":\"c:\\\\users\\\\file\"}"))

  it("preserves escaped newlines", () => assertMatchesReference("{\"text\":\"line1\\nline2\"}"))

  it("preserves unicode escapes", () => {
    // Our formatter preserves escape sequences verbatim.
    const { output } = formatString("{\"emoji\":\"\\u2603\"}")
    assert.ok(output.includes("\\u2603"))
  })

  it("handles strings with structural chars", () =>
    assertMatchesReference("{\"data\":\"contains { and [ and , and :\"}"))

  it("handles escaped backslash before closing quote", () =>
    assertMatchesReference("{\"val\":\"ends with backslash\\\\\"}"))

  it("handles consecutive escape sequences", () => assertMatchesReference("{\"val\":\"\\t\\n\\r\\b\\f\"}"))
})

// ── 6. Whitespace handling ───────────────────────────────────────────

describe("Whitespace handling", () => {
  it("formats already-minified JSON", () => assertMatchesReference("{\"a\":1,\"b\":[2,3]}"))

  it("re-formats already-pretty-printed JSON", () => {
    const pretty = "{\n  \"a\": 1,\n  \"b\": [\n    2,\n    3\n  ]\n}"
    assertMatchesReference(pretty)
  })

  it("handles irregular whitespace", () => {
    const messy = "{   \"a\" :   1 ,  \"b\" : [  2 , 3  ]  }"
    assertMatchesReference(messy)
  })

  it("handles tabs in whitespace", () => {
    const tabbed = "{\t\"a\":\t1}"
    assertMatchesReference(tabbed)
  })

  it("handles carriage returns", () => {
    const cr = "{\r\n\"a\":\r\n1\r\n}"
    assertMatchesReference(cr)
  })
})

// ── 7. Edge cases ────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("formats empty object with whitespace", () => assertMatchesReference("{  }"))

  it("formats empty array with whitespace", () => assertMatchesReference("[  ]"))

  it("formats empty string value", () => assertMatchesReference("{\"a\":\"\"}"))

  it("handles very long string values", () => {
    const longStr = "x".repeat(10_000)
    assertMatchesReference(`{"data":"${longStr}"}`)
  })

  it("handles many keys", () => {
    const pairs = Array.from({ length: 100 }, (_, i) => `"k${i}":${i}`)
    assertMatchesReference(`{${pairs.join(",")}}`)
  })

  it("handles empty nested containers", () => assertMatchesReference("{\"a\":{},\"b\":[],\"c\":{\"d\":[]}}"))

  it("formats byte-level (formatBytes) correctly", () => {
    const input = "{\"x\":1}"
    const result = fmtBytes(input)
    assert.equal(result, reference(input))
  })
})

// ── 8. Options ───────────────────────────────────────────────────────

describe("Options", () => {
  it("supports 4-space indent", () => {
    const { output } = formatString("{\"a\":1}", { indentSize: 4 })
    const ref = JSON.stringify(JSON.parse("{\"a\":1}"), null, 4)
    assert.equal(output, ref)
  })

  it("supports 1-space indent", () => {
    const { output } = formatString("{\"a\":{\"b\":2}}", { indentSize: 1 })
    const ref = JSON.stringify(JSON.parse("{\"a\":{\"b\":2}}"), null, 1)
    assert.equal(output, ref)
  })
})

// ── 9. Output buffer ────────────────────────────────────────────────

describe("OutputBuffer", () => {
  it("handles writes larger than initial capacity", () => {
    const buf = createOutputBuffer(8) // Tiny buffer to force growth
    const data = new Uint8Array(100)
    data.fill(65) // 'A'
    buf.writeBytes(data)
    const result = buf.flush()
    assert.equal(result.length, 100)
    assert.equal(result[0], 65)
    assert.equal(result[99], 65)
  })

  it("handles multiple flushes", () => {
    const buf = createOutputBuffer(16)
    buf.writeByte(65)
    const first = buf.flush()
    assert.equal(first.length, 1)

    buf.writeByte(66)
    const second = buf.flush()
    assert.equal(second.length, 1)
    assert.equal(second[0], 66)
  })
})

// ── 10. Indent cache ────────────────────────────────────────────────

describe("IndentCache", () => {
  it("produces correct indent widths", () => {
    const cache = buildIndentCache(2, 0x20, 5)
    assert.equal(cache[0].length, 0)
    assert.equal(cache[1].length, 2)
    assert.equal(cache[3].length, 6)
    assert.equal(cache[5].length, 10)
  })

  it("fills with the specified character", () => {
    const cache = buildIndentCache(1, 0x09, 2) // tab
    assert.equal(cache[2][0], 0x09)
    assert.equal(cache[2][1], 0x09)
  })
})

// ── 11. Performance sanity ───────────────────────────────────────────

describe("Performance", () => {
  it("formats 1 MB JSON in under 500ms", () => {
    // Generate a ~1 MB JSON array of objects.
    const items = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      name: `item_${i}`,
      value: Math.random(),
      active: i % 2 === 0,
      tags: ["alpha", "beta", "gamma"],
    }))
    const input = JSON.stringify(items)

    const start = performance.now()
    const { output } = formatString(input)
    const elapsed = performance.now() - start

    // Verify correctness.
    assert.equal(output, JSON.stringify(items, null, 2))

    // Verify performance.
    assert.ok(
      elapsed < 500,
      `Expected < 500ms, got ${elapsed.toFixed(1)}ms for ${(input.length / 1024 / 1024).toFixed(2)} MB`,
    )
  })
})

// ── 12. Malformed input ──────────────────────────────────────────────

describe("Malformed input", () => {
  it("valid input produces an empty errors array", () => {
    const { errors } = formatString("{\"a\":1,\"b\":[2,3]}")
    assert.deepEqual(errors, [])
  })

  it("surfaces unbalanced close brace", () => {
    const { output, errors } = formatString("{\"a\":1}}")
    // The valid portion is still formatted.
    assert.equal(output, "{\n  \"a\": 1\n}")
    assert.equal(errors.length, 1)
    assert.equal(errors[0].type, "unbalanced_close")
    assert.equal(errors[0].offset, 7)
  })

  it("surfaces unbalanced close bracket", () => {
    const { errors } = formatString("[1,2]]")
    assert.equal(errors.length, 1)
    assert.equal(errors[0].type, "unbalanced_close")
  })

  it("surfaces unclosed object", () => {
    const { output, errors } = formatString("{\"a\":1")
    // Output contains what we have so far, without a synthesized close.
    assert.ok(output.includes("\"a\": 1"))
    assert.ok(!output.endsWith("}"))
    assert.equal(errors.length, 1)
    assert.equal(errors[0].type, "unclosed_container")
  })

  it("surfaces unclosed array", () => {
    const { errors } = formatString("[1,2,3")
    assert.equal(errors.length, 1)
    assert.equal(errors[0].type, "unclosed_container")
  })

  it("surfaces unterminated string", () => {
    const { errors } = formatString("{\"a\":\"hello")
    // Both unterminated_string and unclosed_container are reported.
    const types = errors.map((e) => e.type)
    assert.ok(types.includes("unterminated_string"))
  })

  it("multiple stray closes each generate an error", () => {
    const { errors } = formatString("{}}]")
    assert.equal(errors.length, 2)
    assert.ok(errors.every((e) => e.type === "unbalanced_close"))
  })

  it("reports absolute offset across multiple chunks", () => {
    // Feed the formatter two chunks so we verify offsets account for the
    // running absoluteOffset, not just the chunk-local index.
    const state = createFormatterState()
    const out = createOutputBuffer()
    const chunk1 = encoder.encode("{\"a\":1}")
    const chunk2 = encoder.encode("}")
    formatChunk(chunk1, 0, chunk1.length, state, out)
    formatChunk(chunk2, 0, chunk2.length, state, out)
    assert.equal(state.errors.length, 1)
    assert.equal(state.errors[0].offset, 7) // absolute offset in combined stream
  })
})

// ── 13. Chunker ──────────────────────────────────────────────────────

describe("Chunker", () => {
  it("honors a pre-aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      processInChunks({
        input: encoder.encode("{\"a\":1}"),
        state: createFormatterState(),
        outputBuffer: createOutputBuffer(),
        processChunk: formatChunk,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    )
  })

  it("honors an abort between chunks", async () => {
    const controller = new AbortController()
    // Large input + tiny chunk size so there are many yields.
    const input = encoder.encode(JSON.stringify({ data: "x".repeat(100_000) }))
    const p = processInChunks({
      input,
      state: createFormatterState(),
      outputBuffer: createOutputBuffer(),
      processChunk: formatChunk,
      chunkSize: 1024,
      signal: controller.signal,
    })
    // Abort after the first yield.
    queueMicrotask(() => controller.abort())
    await assert.rejects(p, { name: "AbortError" })
  })

  it("calls onProgress with monotonic byte counts", async () => {
    const input = encoder.encode(JSON.stringify({ a: 1, b: [1, 2, 3], c: "hi" }))
    const progress = []
    await processInChunks({
      input,
      state: createFormatterState(),
      outputBuffer: createOutputBuffer(),
      processChunk: formatChunk,
      chunkSize: 5,
      onProgress: (bytesProcessed, totalBytes) => {
        progress.push({ bytesProcessed, totalBytes })
      },
    })
    assert.ok(progress.length >= 2, "expected multiple progress ticks")
    for (let i = 1; i < progress.length; i++) {
      assert.ok(progress[i].bytesProcessed >= progress[i - 1].bytesProcessed)
      assert.equal(progress[i].totalBytes, input.length)
    }
    // Last tick should reach the total.
    assert.equal(progress[progress.length - 1].bytesProcessed, input.length)
  })
})

// ── 14. Client (Worker-backed path) ──────────────────────────────────

/**
 * Minimal mock Worker that runs the formatter synchronously in place
 * of a real Web Worker. Mirrors the postMessage / onmessage protocol
 * used by worker.js.
 */
class MockWorker {
  static instances = []

  constructor(url, opts) {
    this.url = url
    this.opts = opts
    this.onmessage = null
    this.onerror = null
    this.terminated = false
    MockWorker.instances.push(this)
  }

  postMessage(msg, _transfer) {
    if (this.terminated) return

    if (msg.type === "cancel") {
      // Real worker would abort mid-stream. For the mock, cancellation
      // happens before the queued result is delivered — we just drop it.
      this._cancelled = true
      return
    }

    if (msg.type === "format") {
      queueMicrotask(() => {
        if (this.terminated || this._cancelled) return
        // Simulate a progress tick.
        this.onmessage?.({
          data: {
            type: "progress",
            id: msg.id,
            bytesProcessed: 50,
            totalBytes: 100,
          },
        })
        // Format synchronously using the real formatter core.
        const input = new Uint8Array(msg.payload)
        const { output, errors } = formatBytes(input, msg.options ?? {})
        const buf = output.buffer
        this.onmessage?.({
          data: { type: "result", id: msg.id, payload: buf, errors },
        })
      })
    }
  }

  terminate() {
    this.terminated = true
  }
}

// ── 15. Token emission ───────────────────────────────────────────────

/** Slice a token's [start, end) out of the decoded output string. */
const tokenText = (decoded, offsets, i) => decoded.substring(offsets[i * 2], offsets[i * 2 + 1])

describe("Token emission", () => {
  it("default calls do not return a tokens field", () => {
    const result = formatString("{\"a\":1}")
    assert.equal(result.tokens, undefined)
    assert.ok("output" in result)
    assert.ok("errors" in result)
  })

  it("default byte-level call is byte-identical with and without tokens", () => {
    const input = encoder.encode("{\"name\":\"Alice\",\"age\":30,\"tags\":[\"a\",\"b\"]}")
    const withTokens = formatBytes(input, { tokens: true })
    const withoutTokens = formatBytes(input)
    assert.deepEqual(withTokens.output, withoutTokens.output)
    assert.ok(withTokens.tokens, "withTokens.tokens should be present")
    assert.equal(withoutTokens.tokens, undefined)
  })

  it("opt-in returns parallel typed arrays", () => {
    const { tokens } = formatString("{\"a\":1}", { tokens: true })
    assert.ok(tokens.offsets instanceof Uint32Array)
    assert.ok(tokens.kinds instanceof Uint8Array)
    assert.equal(typeof tokens.count, "number")
    assert.equal(tokens.offsets.length, tokens.count * 2)
    assert.ok(tokens.kinds.length >= tokens.count)
  })

  it("emits every token kind on a representative input", () => {
    const { output, tokens } = formatString(
      "{\"s\":\"v\",\"n\":1,\"b\":true,\"z\":null,\"a\":[1,2]}",
      { tokens: true },
    )
    // Collect unique kinds.
    const kindsSeen = new Set()
    for (let i = 0; i < tokens.count; i++) kindsSeen.add(tokens.kinds[i])
    assert.ok(kindsSeen.has(TOKEN_KEY), "should see keys")
    assert.ok(kindsSeen.has(TOKEN_STRING), "should see strings")
    assert.ok(kindsSeen.has(TOKEN_NUMBER), "should see numbers")
    assert.ok(kindsSeen.has(TOKEN_BOOLEAN), "should see booleans")
    assert.ok(kindsSeen.has(TOKEN_NULL), "should see null")
    assert.ok(kindsSeen.has(TOKEN_PUNCT), "should see punctuation")
    // Sanity: output is still correct.
    assert.equal(
      output,
      "{\n  \"s\": \"v\",\n  \"n\": 1,\n  \"b\": true,\n  \"z\": null,\n  \"a\": [\n    1,\n    2\n  ]\n}",
    )
  })

  it("slicing by offsets reproduces each token's literal text", () => {
    const { output, tokens } = formatString(
      "{\"k\":42,\"s\":\"hi\",\"b\":true,\"z\":null}",
      { tokens: true },
    )
    for (let i = 0; i < tokens.count; i++) {
      const text = tokenText(output, tokens.offsets, i)
      const kind = tokens.kinds[i]
      switch (kind) {
        case TOKEN_KEY:
          assert.match(text, /^"[^"]*"$/, `key token "${text}" not quoted`)
          break
        case TOKEN_STRING:
          assert.match(text, /^"[^"]*"$/, `string token "${text}" not quoted`)
          break
        case TOKEN_NUMBER:
          assert.match(text, /^-?\d/, `number token "${text}" doesn't start with digit`)
          break
        case TOKEN_BOOLEAN:
          assert.ok(text === "true" || text === "false", `boolean "${text}"`)
          break
        case TOKEN_NULL:
          assert.equal(text, "null")
          break
        case TOKEN_PUNCT:
          assert.equal(text.length, 1, `punct "${text}" not single char`)
          assert.ok("{}[],:".includes(text), `punct "${text}" not recognized`)
          break
        default:
          assert.fail(`unknown kind ${kind}`)
      }
    }
  })

  it("object keys are distinguished from string values", () => {
    const { output, tokens } = formatString("{\"a\":\"b\"}", { tokens: true })
    const kindTexts = []
    for (let i = 0; i < tokens.count; i++) {
      kindTexts.push({ kind: tokens.kinds[i], text: tokenText(output, tokens.offsets, i) })
    }
    const keyTokens = kindTexts.filter((t) => t.kind === TOKEN_KEY)
    const stringTokens = kindTexts.filter((t) => t.kind === TOKEN_STRING)
    assert.equal(keyTokens.length, 1)
    assert.equal(keyTokens[0].text, "\"a\"")
    assert.equal(stringTokens.length, 1)
    assert.equal(stringTokens[0].text, "\"b\"")
  })

  it("grows the token buffer correctly past its initial capacity", () => {
    // Build a payload with well over the default INITIAL_TOKEN_CAPACITY of 1024 tokens.
    const pairs = Array.from({ length: 500 }, (_, i) => `"k${i}":${i}`)
    const input = `{${pairs.join(",")}}`
    const { output, tokens } = formatString(input, { tokens: true })
    // 500 keys + 500 numbers + 1 open + 500 colons + 499 commas + 1 close = 2001 tokens
    assert.ok(tokens.count > 1024, `expected > 1024 tokens, got ${tokens.count}`)
    // Verify the last key/value pair is classified correctly.
    const kinds = Array.from(tokens.kinds.slice(0, tokens.count))
    assert.ok(kinds.includes(TOKEN_KEY))
    assert.ok(kinds.includes(TOKEN_NUMBER))
    // Sanity: output is still the reference output.
    assert.equal(output, JSON.stringify(JSON.parse(input), null, 2))
  })

  it("handles nested objects and empty containers without misclassifying keys", () => {
    const { output, tokens } = formatString(
      "{\"outer\":{\"inner\":1},\"empty\":{},\"arr\":[]}",
      { tokens: true },
    )
    const kindTexts = []
    for (let i = 0; i < tokens.count; i++) {
      kindTexts.push({ kind: tokens.kinds[i], text: tokenText(output, tokens.offsets, i) })
    }
    const keys = kindTexts.filter((t) => t.kind === TOKEN_KEY).map((t) => t.text)
    assert.deepEqual(keys, ["\"outer\"", "\"inner\"", "\"empty\"", "\"arr\""])
    // No STRING tokens (all quoted scalars are keys here).
    const stringValues = kindTexts.filter((t) => t.kind === TOKEN_STRING)
    assert.equal(stringValues.length, 0)
    // Output still correct.
    assert.equal(
      output,
      "{\n  \"outer\": {\n    \"inner\": 1\n  },\n  \"empty\": {},\n  \"arr\": []\n}",
    )
  })

  it("classifies string values that look like keys as strings, not keys", () => {
    // "key_looking" is a string value, not a key — no `:` follows it.
    const { tokens } = formatString(
      "{\"k\":\"key_looking\",\"other\":\"v\"}",
      { tokens: true },
    )
    const kindCounts = { key: 0, string: 0 }
    for (let i = 0; i < tokens.count; i++) {
      if (tokens.kinds[i] === TOKEN_KEY) kindCounts.key++
      if (tokens.kinds[i] === TOKEN_STRING) kindCounts.string++
    }
    assert.equal(kindCounts.key, 2, "both keys should be keys")
    assert.equal(kindCounts.string, 2, "both values should be strings")
  })

  it("handles non-ASCII keys, non-ASCII string values, and surrogate-pair emoji", () => {
    const input = "{\"café\":\"日本語\",\"emoji\":\"🎉\"}"
    const { output, tokens } = formatString(input, { tokens: true })
    // Walk every token and verify that substring with its offsets
    // reproduces the exact token text. This is the whole point of
    // emitting UTF-16 code unit offsets instead of byte offsets.
    for (let i = 0; i < tokens.count; i++) {
      const text = tokenText(output, tokens.offsets, i)
      assert.ok(text.length > 0, `token ${i} is empty`)
    }
    // Specifically verify the tricky tokens.
    const kindTexts = []
    for (let i = 0; i < tokens.count; i++) {
      kindTexts.push({ kind: tokens.kinds[i], text: tokenText(output, tokens.offsets, i) })
    }
    const keys = kindTexts.filter((t) => t.kind === TOKEN_KEY).map((t) => t.text)
    assert.deepEqual(keys, ["\"café\"", "\"emoji\""])
    const strings = kindTexts.filter((t) => t.kind === TOKEN_STRING).map((t) => t.text)
    assert.deepEqual(strings, ["\"日本語\"", "\"🎉\""])
    // The emoji is a surrogate pair in UTF-16 — 2 code units. Its token
    // is 4 code units long: ", 🎉 (= 2 units), ".
    const emojiToken = kindTexts.find((t) => t.text === "\"🎉\"")
    assert.equal(emojiToken.text.length, 4)
  })
})

describe("Token buffer", () => {
  it("grows when capacity is exceeded", () => {
    const buf = createTokenBuffer(4)
    for (let i = 0; i < 100; i++) {
      buf.push(TOKEN_NUMBER, i * 2, i * 2 + 1)
    }
    const snap = buf.snapshot()
    assert.equal(snap.count, 100)
    assert.equal(snap.offsets.length, 200)
    assert.equal(snap.kinds.length, 100)
    assert.equal(snap.offsets[0], 0)
    assert.equal(snap.offsets[199], 199)
    assert.equal(snap.kinds[0], TOKEN_NUMBER)
  })

  it("flipLastKind rewrites the most recent token's kind", () => {
    const buf = createTokenBuffer()
    buf.push(TOKEN_STRING, 0, 5)
    buf.flipLastKind(TOKEN_KEY)
    const snap = buf.snapshot()
    assert.equal(snap.kinds[0], TOKEN_KEY)
  })
})

describe("Client (Worker-backed)", () => {
  before(() => {
    globalThis.Worker = MockWorker
  })
  after(() => {
    delete globalThis.Worker
  })

  it("formats via the worker path and returns {output, errors}", async () => {
    MockWorker.instances = []
    const formatter = createFormatter({ workerURL: "mock://worker" })
    const result = await formatter.format("{\"a\":1}")
    assert.equal(result.output, "{\n  \"a\": 1\n}")
    assert.deepEqual(result.errors, [])
    assert.equal(MockWorker.instances.length, 1, "worker should have been created")
    formatter.destroy()
  })

  it("surfaces structural errors from the worker", async () => {
    const formatter = createFormatter({ workerURL: "mock://worker" })
    const { errors } = await formatter.format("{\"a\":1}}")
    assert.equal(errors.length, 1)
    assert.equal(errors[0].type, "unbalanced_close")
    formatter.destroy()
  })

  it("fires onProgress callbacks", async () => {
    const formatter = createFormatter({ workerURL: "mock://worker" })
    const ticks = []
    await formatter.format("{\"a\":1}", {
      onProgress: (pct) => ticks.push(pct),
    })
    assert.ok(ticks.length >= 1)
    assert.equal(ticks[0], 50)
    formatter.destroy()
  })

  it("rejects when passed a pre-aborted signal", async () => {
    const formatter = createFormatter({ workerURL: "mock://worker" })
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      formatter.format("{\"a\":1}", { signal: controller.signal }),
      { name: "AbortError" },
    )
    formatter.destroy()
  })

  it("rejects when the signal is aborted mid-flight", async () => {
    const formatter = createFormatter({ workerURL: "mock://worker" })
    const controller = new AbortController()
    const p = formatter.format("{\"a\":1}", { signal: controller.signal })
    controller.abort()
    await assert.rejects(p, { name: "AbortError" })
    formatter.destroy()
  })

  it("removes the abort listener on normal completion (no leak)", async () => {
    const formatter = createFormatter({ workerURL: "mock://worker" })
    const controller = new AbortController()
    const baseline = getEventListeners(controller.signal, "abort").length

    // Run several formats with the same signal. If listeners leaked, the
    // count would grow linearly with invocations.
    for (let i = 0; i < 5; i++) {
      await formatter.format("{\"a\":1}", { signal: controller.signal })
    }

    const after = getEventListeners(controller.signal, "abort").length
    assert.equal(after, baseline, "abort listeners should not accumulate")
    formatter.destroy()
  })
})

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
import {
  buildIndentCache,
  createFormatterState,
  createOutputBuffer,
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

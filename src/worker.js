/**
 * @module worker
 * @description Web Worker entry point for off-main-thread JSON formatting.
 *
 * Message protocol (main → worker):
 *   { type: "format",  id, payload: ArrayBuffer, options? }
 *   { type: "cancel",  id }
 *
 * Message protocol (worker → main):
 *   { type: "result",   id, payload: ArrayBuffer, errors: FormatError[] }
 *   { type: "error",    id, message: string }
 *   { type: "progress", id, bytesProcessed, totalBytes }
 */

import { processInChunks } from "./chunker.js"
import { OUTPUT_BUFFER_SIZE } from "./constants.js"
import {
  createFormatterState,
  createOutputBuffer,
  createTokenBuffer,
  finalizeFormat,
  formatChunk,
} from "./formatter.js"

// ── Active job tracking (supports cancellation) ──────────────────────

/** @type {Map<string, AbortController>} */
const activeJobs = new Map()

// ── Message handler ──────────────────────────────────────────────────

self.onmessage = async (event) => {
  const { type, id, payload, options } = event.data

  if (type === "cancel") {
    const controller = activeJobs.get(id)
    if (controller) {
      controller.abort()
      activeJobs.delete(id)
    }
    return
  }

  if (type === "format") {
    await handleFormat(id, payload, options)
    return
  }

  postError(id ?? "unknown", `Unknown message type: "${type}"`)
}

// ── Format handler ───────────────────────────────────────────────────

/**
 * @param {string}      id       - Unique job identifier.
 * @param {ArrayBuffer} payload  - Raw JSON bytes (transferred).
 * @param {Object}      [options]
 */
const handleFormat = async (id, payload, options = {}) => {
  const controller = new AbortController()
  activeJobs.set(id, controller)

  try {
    const input = new Uint8Array(payload)
    const state = createFormatterState(options)
    const outputBuffer = createOutputBuffer(
      Math.max(input.length * 2, OUTPUT_BUFFER_SIZE),
    )
    const tokens = options.tokens === true ? createTokenBuffer() : null

    const result = await processInChunks({
      input,
      state,
      outputBuffer,
      processChunk: formatChunk,
      tokens,
      chunkSize: options.chunkSize,
      signal: controller.signal,
      onProgress: (bytesProcessed, totalBytes) => {
        postProgress(id, bytesProcessed, totalBytes)
      },
    })

    // Finalize: catches unclosed containers and unterminated strings
    // that can only be detected once we know there's no more input.
    // Also flushes any scalar token that was deferred across a chunk
    // boundary without reaching a delimiter.
    finalizeFormat(state, outputBuffer, tokens)

    // Transfer the result buffer to avoid copying.
    const resultBuffer = result.buffer
    const message = { type: "result", id, payload: resultBuffer, errors: state.errors }
    const transfer = [resultBuffer]

    if (tokens) {
      const snapshot = tokens.snapshot()
      message.tokens = {
        offsets: snapshot.offsets,
        kinds: snapshot.kinds,
        count: snapshot.count,
      }
      transfer.push(snapshot.offsets.buffer)
      transfer.push(snapshot.kinds.buffer)
    }

    self.postMessage(message, transfer)
  } catch (err) {
    if (err.name === "AbortError") {
      // Cancellation — no response needed, the caller already knows.
      return
    }
    postError(id, err.message ?? String(err))
  } finally {
    activeJobs.delete(id)
  }
}

// ── Outbound message helpers ─────────────────────────────────────────

const postProgress = (id, bytesProcessed, totalBytes) => {
  self.postMessage({ type: "progress", id, bytesProcessed, totalBytes })
}

const postError = (id, message) => {
  self.postMessage({ type: "error", id, message })
}

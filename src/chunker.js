/**
 * @module chunker
 * @description Non-blocking chunked processing for large JSON inputs.
 *
 * Splits a large byte array into chunks and processes each one in a
 * separate microtask, preventing the thread from blocking for too long.
 * This is essential when running in a Web Worker that needs to stay
 * responsive to cancellation messages, or when running on the main
 * thread as a fallback.
 *
 * The chunker is a higher-order function: it takes the core `formatChunk`
 * function as a dependency, keeping this module decoupled from the
 * formatter internals.
 */

import { DEFAULT_CHUNK_SIZE } from "./constants.js"

/**
 * @callback FormatChunkFn
 * @param {Uint8Array} input
 * @param {number}     start
 * @param {number}     end
 * @param {Object}     state
 * @param {Object}     outputBuffer
 */

/**
 * @callback ProgressCallback
 * @param {number} bytesProcessed
 * @param {number} totalBytes
 */

/**
 * Process a byte array in chunks, yielding between each chunk.
 *
 * @param {Object}           params
 * @param {Uint8Array}       params.input          - Full input bytes.
 * @param {Object}           params.state          - Formatter state object.
 * @param {Object}           params.outputBuffer   - Output buffer object.
 * @param {FormatChunkFn}    params.processChunk   - The core formatting function.
 * @param {Object}           [params.tokens]       - Optional token buffer, threaded into processChunk.
 * @param {number}           [params.chunkSize]    - Bytes per chunk.
 * @param {ProgressCallback} [params.onProgress]   - Optional progress callback.
 * @param {AbortSignal}      [params.signal]       - Optional abort signal.
 * @returns {Promise<Uint8Array>} The formatted output.
 */
export const processInChunks = async ({
  input,
  state,
  outputBuffer,
  processChunk,
  tokens = null,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress = null,
  signal = null,
}) => {
  const totalBytes = input.length
  let offset = 0

  while (offset < totalBytes) {
    // Check for cancellation before each chunk.
    if (signal?.aborted) {
      throw new DOMException("Formatting was cancelled.", "AbortError")
    }

    const end = Math.min(offset + chunkSize, totalBytes)
    processChunk(input, offset, end, state, outputBuffer, tokens)

    offset = end

    if (onProgress) {
      onProgress(offset, totalBytes)
    }

    // Yield to the event loop between chunks so the thread stays
    // responsive. Using a microtask (Promise) for minimal overhead.
    if (offset < totalBytes) {
      await yieldToEventLoop()
    }
  }

  return outputBuffer.flush()
}

/**
 * Yield to the event loop. Uses setTimeout(0) instead of
 * queueMicrotask to ensure the macrotask queue (message handlers,
 * timers) also gets a chance to run.
 *
 * @returns {Promise<void>}
 */
const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0))

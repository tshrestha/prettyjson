/**
 * @module formatter
 * @description Pure-functional, streaming JSON pretty-printer.
 *
 * Design principles:
 *   1. Zero allocations in the hot loop — all buffers pre-allocated.
 *   2. Operates on raw bytes (Uint8Array), not JS strings.
 *   3. Single-pass, constant-memory regardless of input size.
 *   4. No dependencies, no DOM, no side-effects — fully testable.
 *
 * The formatter is a state machine with only two bits of mutable state:
 *   - `depth`    (current nesting level)
 *   - `inString` (whether the cursor is inside a JSON string)
 *
 * Everything else is derived from the current byte.
 */

import {
  CHAR_BACKSLASH,
  CHAR_CLOSE_BRACE,
  CHAR_CLOSE_BRACKET,
  CHAR_COLON,
  CHAR_COMMA,
  CHAR_CR,
  CHAR_NEWLINE,
  CHAR_OPEN_BRACE,
  CHAR_OPEN_BRACKET,
  CHAR_QUOTE,
  CHAR_SPACE,
  CHAR_TAB,
  COLON_BYTE,
  DEFAULT_INDENT_CHAR,
  DEFAULT_INDENT_SIZE,
  MAX_CACHED_DEPTH,
  NEWLINE_BYTE,
  OUTPUT_BUFFER_SIZE,
  SPACE_BYTE,
} from "./constants.js"

// ── Indent cache ─────────────────────────────────────────────────────

/**
 * Build a lookup table of pre-encoded indent byte arrays.
 * Avoids string creation and encoding in the hot loop.
 *
 * @param {number} indentSize  - Spaces per indent level.
 * @param {number} indentChar  - Byte value of the indent character.
 * @param {number} maxDepth    - Maximum depth to pre-compute.
 * @returns {Uint8Array[]} Array where index = depth → indent bytes.
 */
export const buildIndentCache = (
  indentSize = DEFAULT_INDENT_SIZE,
  indentChar = DEFAULT_INDENT_CHAR,
  maxDepth = MAX_CACHED_DEPTH,
) => {
  const cache = new Array(maxDepth + 1)
  for (let d = 0; d <= maxDepth; d++) {
    const len = d * indentSize
    const buf = new Uint8Array(len)
    buf.fill(indentChar)
    cache[d] = buf
  }
  return cache
}

// ── Output buffer ────────────────────────────────────────────────────

/**
 * A simple growable byte buffer that avoids per-byte array resizing.
 * Flush semantics are left to the caller (write to disk, post to main
 * thread, etc.).
 *
 * @param {number} initialSize - Initial capacity in bytes.
 * @returns {{ write, writeByte, writeBytes, flush, getOutput }}
 */
export const createOutputBuffer = (initialSize = OUTPUT_BUFFER_SIZE) => {
  let buffer = new Uint8Array(initialSize)
  let position = 0
  const chunks = []

  const ensureCapacity = (needed) => {
    if (position + needed <= buffer.length) return
    // Flush current buffer and start a new one.
    chunks.push(buffer.slice(0, position))
    const nextSize = Math.max(initialSize, needed)
    buffer = new Uint8Array(nextSize)
    position = 0
  }

  const writeByte = (byte) => {
    ensureCapacity(1)
    buffer[position++] = byte
  }

  const writeBytes = (bytes) => {
    ensureCapacity(bytes.length)
    buffer.set(bytes, position)
    position += bytes.length
  }

  /** Copy a region of the *input* array directly to output. */
  const writeSlice = (src, start, end) => {
    const len = end - start
    if (len <= 0) return
    ensureCapacity(len)
    buffer.set(src.subarray(start, end), position)
    position += len
  }

  /** Concatenate all accumulated chunks into a single Uint8Array. */
  const flush = () => {
    chunks.push(buffer.slice(0, position))
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    // Reset state for potential reuse.
    chunks.length = 0
    buffer = new Uint8Array(initialSize)
    position = 0
    return result
  }

  return { writeByte, writeBytes, writeSlice, flush }
}

// ── Whitespace helpers ───────────────────────────────────────────────

const isWhitespace = (byte) =>
  byte === CHAR_SPACE
  || byte === CHAR_TAB
  || byte === CHAR_NEWLINE
  || byte === CHAR_CR

const isStructuralOpen = (byte) => byte === CHAR_OPEN_BRACE || byte === CHAR_OPEN_BRACKET

const isStructuralClose = (byte) => byte === CHAR_CLOSE_BRACE || byte === CHAR_CLOSE_BRACKET

// ── Core formatting engine ───────────────────────────────────────────

/**
 * @typedef {Object} FormatError
 * @property {string} type    - Error category: "unbalanced_close",
 *                              "unclosed_container", or "unterminated_string".
 * @property {string} message - Human-readable description.
 * @property {number} offset  - Absolute byte offset into the original input.
 */

/**
 * @typedef {Object} FormatterState
 * @property {number}        depth          - Current nesting depth.
 * @property {boolean}       inString       - Whether we're inside a JSON string.
 * @property {boolean}       escaped        - Whether the previous char was a backslash.
 * @property {number}        absoluteOffset - Byte offset at the start of the current chunk.
 * @property {FormatError[]} errors         - Accumulated structural errors.
 * @property {Uint8Array[]}  indents        - Pre-computed indent byte arrays.
 */

/**
 * Create an immutable-style formatter state.
 *
 * @param {Object} [options]
 * @param {number} [options.indentSize]
 * @param {number} [options.indentChar]
 * @returns {FormatterState}
 */
export const createFormatterState = ({
  indentSize = DEFAULT_INDENT_SIZE,
  indentChar = DEFAULT_INDENT_CHAR,
} = {}) => ({
  depth: 0,
  inString: false,
  escaped: false,
  absoluteOffset: 0,
  errors: [],
  indents: buildIndentCache(indentSize, indentChar),
})

/**
 * Write a newline followed by the indent for the given depth.
 */
const emitNewlineAndIndent = (out, indents, depth) => {
  out.writeByte(NEWLINE_BYTE)
  const indent = depth < indents.length
    ? indents[depth]
    : indents[indents.length - 1] // Graceful fallback for very deep JSON
  out.writeBytes(indent)
}

/**
 * Format a chunk of raw JSON bytes.
 *
 * This is the HOT PATH. Every micro-optimization here matters.
 * The function mutates `state` in place for performance (the public API
 * wraps this to preserve a clean functional interface).
 *
 * @param {Uint8Array}      input  - Raw JSON bytes.
 * @param {number}          start  - Start offset in `input`.
 * @param {number}          end    - End offset (exclusive) in `input`.
 * @param {FormatterState}  state  - Mutable formatter state.
 * @param {Object}          out    - Output buffer from createOutputBuffer.
 */
export const formatChunk = (input, start, end, state, out) => {
  let { depth, inString, escaped } = state
  const { indents, errors, absoluteOffset } = state

  // Local aliases to avoid repeated property lookups in the loop.
  const writeByte = out.writeByte
  const writeBytes = out.writeBytes

  let i = start

  while (i < end) {
    const byte = input[i]

    // ── Inside a JSON string ───────────────────────────────────
    if (inString) {
      if (escaped) {
        // Previous byte was a backslash — this byte is consumed
        // as part of the escape sequence regardless of its value.
        writeByte(byte)
        escaped = false
        i++
        continue
      }

      if (byte === CHAR_BACKSLASH) {
        writeByte(byte)
        escaped = true
        i++
        continue
      }

      if (byte === CHAR_QUOTE) {
        // Closing quote — leave string mode.
        writeByte(byte)
        inString = false
        i++
        continue
      }

      // Regular character inside a string — batch-copy to output.
      // Scan ahead for the next special character to copy a run at once.
      let runEnd = i + 1
      while (
        runEnd < end
        && input[runEnd] !== CHAR_QUOTE
        && input[runEnd] !== CHAR_BACKSLASH
      ) {
        runEnd++
      }
      out.writeSlice(input, i, runEnd)
      i = runEnd
      continue
    }

    // ── Outside a string ───────────────────────────────────────

    // Skip existing whitespace in the input.
    if (isWhitespace(byte)) {
      i++
      continue
    }

    // Opening brace/bracket.
    if (isStructuralOpen(byte)) {
      writeByte(byte)

      // Peek ahead (skipping whitespace) to see if the container is empty.
      let peek = i + 1
      while (peek < end && isWhitespace(input[peek])) peek++

      if (peek < end && isStructuralClose(input[peek])) {
        // Empty container — emit close immediately, no newline.
        writeByte(input[peek])
        i = peek + 1
      } else {
        depth++
        emitNewlineAndIndent(out, indents, depth)
        i++
      }
      continue
    }

    // Closing brace/bracket.
    if (isStructuralClose(byte)) {
      if (depth === 0) {
        // Stray close with no matching open — record an error and
        // skip the byte. Emitting it would produce malformed output.
        errors.push({
          type: "unbalanced_close",
          message: `Unexpected "${String.fromCharCode(byte)}" with no matching open`,
          offset: absoluteOffset + (i - start),
        })
        i++
        continue
      }
      depth--
      emitNewlineAndIndent(out, indents, depth)
      writeByte(byte)
      i++
      continue
    }

    // Comma — newline + indent after.
    if (byte === CHAR_COMMA) {
      writeByte(byte)
      emitNewlineAndIndent(out, indents, depth)
      i++
      continue
    }

    // Colon — emit ": ".
    if (byte === CHAR_COLON) {
      writeByte(COLON_BYTE)
      writeByte(SPACE_BYTE)
      i++
      continue
    }

    // Opening quote — enter string mode.
    if (byte === CHAR_QUOTE) {
      writeByte(byte)
      inString = true
      i++
      continue
    }

    // Everything else (digits, letters for true/false/null).
    // Batch-copy until we hit a structural or whitespace character.
    let valueEnd = i + 1
    while (valueEnd < end) {
      const vb = input[valueEnd]
      if (
        isWhitespace(vb)
        || vb === CHAR_COMMA
        || vb === CHAR_COLON
        || vb === CHAR_CLOSE_BRACE
        || vb === CHAR_CLOSE_BRACKET
        || vb === CHAR_OPEN_BRACE
        || vb === CHAR_OPEN_BRACKET
      ) {
        break
      }
      valueEnd++
    }
    out.writeSlice(input, i, valueEnd)
    i = valueEnd
  }

  // Write state back for the next chunk.
  state.depth = depth
  state.inString = inString
  state.escaped = escaped
  state.absoluteOffset = absoluteOffset + (end - start)
}

/**
 * Finalize formatting after the last chunk has been processed.
 * Records errors for any unclosed containers or unterminated strings.
 * Does not emit additional bytes — recovery is left to the caller so
 * that malformed output never masks a structural error.
 *
 * @param {FormatterState} state
 */
export const finalizeFormat = (state) => {
  if (state.inString) {
    state.errors.push({
      type: "unterminated_string",
      message: "Input ended while inside a string",
      offset: state.absoluteOffset,
    })
  }
  if (state.depth > 0) {
    state.errors.push({
      type: "unclosed_container",
      message: `Input ended with ${state.depth} unclosed container(s)`,
      offset: state.absoluteOffset,
    })
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * @typedef {Object} FormatBytesResult
 * @property {Uint8Array}    output - Formatted JSON bytes.
 * @property {FormatError[]} errors - Structural errors encountered. Empty on valid input.
 */

/**
 * @typedef {Object} FormatStringResult
 * @property {string}        output - Pretty-printed JSON string.
 * @property {FormatError[]} errors - Structural errors encountered. Empty on valid input.
 */

/**
 * Format an entire JSON byte array in one shot.
 *
 * @param {Uint8Array} input   - Raw JSON bytes (UTF-8 encoded).
 * @param {Object}     [opts]  - Formatting options.
 * @param {number}     [opts.indentSize=2]
 * @returns {FormatBytesResult}
 */
export const formatBytes = (input, opts = {}) => {
  const state = createFormatterState(opts)
  const out = createOutputBuffer(Math.max(input.length * 2, OUTPUT_BUFFER_SIZE))
  formatChunk(input, 0, input.length, state, out)
  finalizeFormat(state)
  return { output: out.flush(), errors: state.errors }
}

/**
 * Convenience wrapper: string in → string out.
 *
 * @param {string} jsonString - Raw JSON string.
 * @param {Object} [opts]     - Formatting options.
 * @returns {FormatStringResult}
 */
export const formatString = (jsonString, opts = {}) => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const input = encoder.encode(jsonString)
  const { output, errors } = formatBytes(input, opts)
  return { output: decoder.decode(output), errors }
}

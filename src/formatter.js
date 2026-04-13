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
  INITIAL_TOKEN_CAPACITY,
  MAX_CACHED_DEPTH,
  NEWLINE_BYTE,
  OUTPUT_BUFFER_SIZE,
  SPACE_BYTE,
  TOKEN_BOOLEAN,
  TOKEN_KEY,
  TOKEN_NULL,
  TOKEN_NUMBER,
  TOKEN_PUNCT,
  TOKEN_STRING,
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
  // UTF-16 code unit offset into the DECODED output string. Tracked
  // alongside the byte position so token offsets can be reported in
  // units that match JavaScript string indexing (which callers use to
  // slice tokens out of the decoded string via `substring`). For
  // pure-ASCII content — the vast majority of real JSON — this moves
  // in lockstep with `position`. Non-ASCII string values (CJK, emoji,
  // etc.) are the only case where they diverge.
  let utf16Cursor = 0
  const chunks = []

  const ensureCapacity = (needed) => {
    if (position + needed <= buffer.length) return
    // Flush current buffer and start a new one.
    chunks.push(buffer.slice(0, position))
    const nextSize = Math.max(initialSize, needed)
    buffer = new Uint8Array(nextSize)
    position = 0
  }

  // writeByte is only called by the formatter with ASCII bytes
  // (structural chars, indent, space, newline, quote). Each ASCII byte
  // contributes exactly one UTF-16 code unit.
  const writeByte = (byte) => {
    ensureCapacity(1)
    buffer[position++] = byte
    utf16Cursor++
  }

  // writeBytes is called with the pre-allocated indent arrays, which
  // are always ASCII space characters. Bulk increment is safe.
  const writeBytes = (bytes) => {
    ensureCapacity(bytes.length)
    buffer.set(bytes, position)
    position += bytes.length
    utf16Cursor += bytes.length
  }

  /** Copy a region of the *input* array directly to output. */
  const writeSlice = (src, start, end) => {
    const len = end - start
    if (len <= 0) return
    ensureCapacity(len)
    buffer.set(src.subarray(start, end), position)
    position += len
    // writeSlice is the only path that can see non-ASCII bytes — it
    // copies string content (and unquoted scalars) from the input.
    // Walk the bytes and increment utf16Cursor per UTF-8 code point:
    //   1-byte (0xxxxxxx) → +1
    //   2-byte lead (110xxxxx) → +1
    //   3-byte lead (1110xxxx) → +1
    //   4-byte lead (11110xxx) → +2 (surrogate pair in UTF-16)
    //   continuation (10xxxxxx) → +0
    for (let k = start; k < end; k++) {
      const b = src[k]
      if ((b & 0xC0) !== 0x80) {
        utf16Cursor += (b >= 0xF0) ? 2 : 1
      }
    }
  }

  /** Current UTF-16 code unit offset into the decoded output. */
  const getUtf16Cursor = () => utf16Cursor

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
    utf16Cursor = 0
    return result
  }

  return { writeByte, writeBytes, writeSlice, flush, getUtf16Cursor }
}

// ── Token buffer ─────────────────────────────────────────────────────

/**
 * A growable buffer of `(start, end, kind)` tuples stored as two
 * parallel typed arrays — `offsets: Uint32Array` (pairs of UTF-16
 * indices into the decoded output) and `kinds: Uint8Array` (one of the
 * `TOKEN_*` enum values). Zero per-token object allocation; buffers
 * double on overflow to mirror the output buffer growth policy.
 *
 * @param {number} initialCapacity - Initial token count capacity.
 */
export const createTokenBuffer = (initialCapacity = INITIAL_TOKEN_CAPACITY) => {
  let offsets = new Uint32Array(initialCapacity * 2)
  let kinds = new Uint8Array(initialCapacity)
  let count = 0

  const grow = () => {
    const newCapacity = kinds.length * 2
    const newOffsets = new Uint32Array(newCapacity * 2)
    const newKinds = new Uint8Array(newCapacity)
    newOffsets.set(offsets)
    newKinds.set(kinds)
    offsets = newOffsets
    kinds = newKinds
  }

  const push = (kind, start, end) => {
    if (count >= kinds.length) grow()
    offsets[count * 2] = start
    offsets[count * 2 + 1] = end
    kinds[count] = kind
    count++
  }

  /**
   * Overwrite the most recent token's kind. Used by the key-vs-string
   * disambiguation: the formatter emits every string as `TOKEN_STRING`
   * on the closing quote, then flips it to `TOKEN_KEY` when the next
   * meaningful byte turns out to be a `:`.
   */
  const flipLastKind = (kind) => {
    if (count > 0) kinds[count - 1] = kind
  }

  /**
   * Snapshot the buffer into tight-fitting typed arrays that can be
   * transferred across a Worker boundary. The returned arrays are
   * copies — the internal buffers continue to be usable.
   */
  const snapshot = () => ({
    offsets: offsets.slice(0, count * 2),
    kinds: kinds.slice(0, count),
    count,
  })

  const getCount = () => count

  return { push, flipLastKind, snapshot, getCount }
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
 * @property {number}        depth                    - Current nesting depth.
 * @property {boolean}       inString                 - Whether we're inside a JSON string.
 * @property {boolean}       escaped                  - Whether the previous char was a backslash.
 * @property {number}        absoluteOffset           - Byte offset at the start of the current chunk.
 * @property {FormatError[]} errors                   - Accumulated structural errors.
 * @property {Uint8Array[]}  indents                  - Pre-computed indent byte arrays.
 * @property {number}        stringTokenStart         - UTF-16 offset of the current string's opening quote, when inString.
 * @property {boolean}       pendingKey               - True if the most recent token is a string awaiting key/string disambiguation.
 * @property {number}        pendingScalarStart       - UTF-16 offset of an in-progress unquoted scalar that spilled across a chunk boundary; -1 if none.
 * @property {number}        pendingScalarFirstByte   - First byte of the in-progress scalar (for kind determination on flush).
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
  stringTokenStart: 0,
  pendingKey: false,
  pendingScalarStart: -1,
  pendingScalarFirstByte: 0,
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
 * Decide the token kind of an unquoted scalar from its first byte.
 * `t`/`f` → boolean, `n` → null, everything else → number.
 */
const scalarKindFromFirstByte = (first) => {
  if (first === 0x74 || first === 0x66) return TOKEN_BOOLEAN
  if (first === 0x6E) return TOKEN_NULL
  return TOKEN_NUMBER
}

/**
 * Format a chunk of raw JSON bytes.
 *
 * This is the HOT PATH. Every micro-optimization here matters.
 * The function mutates `state` in place for performance (the public API
 * wraps this to preserve a clean functional interface).
 *
 * @param {Uint8Array}      input    - Raw JSON bytes.
 * @param {number}          start    - Start offset in `input`.
 * @param {number}          end      - End offset (exclusive) in `input`.
 * @param {FormatterState}  state    - Mutable formatter state.
 * @param {Object}          out      - Output buffer from createOutputBuffer.
 * @param {Object}          [tokens] - Optional token buffer from createTokenBuffer.
 *                                     When provided, the formatter emits a token
 *                                     per JSON syntactic element alongside the
 *                                     output bytes. Omit to pay zero cost.
 */
export const formatChunk = (input, start, end, state, out, tokens = null) => {
  let { depth, inString, escaped } = state
  const { indents, errors, absoluteOffset } = state
  let { stringTokenStart, pendingKey, pendingScalarStart, pendingScalarFirstByte } = state

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
        if (tokens) {
          // Emit as TOKEN_STRING by default; the next meaningful byte
          // will flip this to TOKEN_KEY if it's a `:`.
          tokens.push(TOKEN_STRING, stringTokenStart, out.getUtf16Cursor())
          pendingKey = true
        }
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

    // At this point `byte` is the next meaningful (non-whitespace)
    // byte outside a string. Before branching on it, we resolve any
    // "pending" state carried across from a previous token:
    //
    // 1. Key/string disambiguation: if the most recent token is a
    //    string awaiting classification and this byte is a `:`, flip
    //    the token kind to TOKEN_KEY. Either way the pending flag is
    //    cleared.
    if (tokens && pendingKey) {
      if (byte === CHAR_COLON) tokens.flipLastKind(TOKEN_KEY)
      pendingKey = false
    }
    //
    // 2. Pending scalar: an unquoted scalar (number / true / false /
    //    null) that ran to the end of the previous chunk without
    //    reaching a delimiter is deferred so the two halves can be
    //    merged into a single token. If the current byte is NOT a
    //    scalar-continuation character, the deferred scalar really did
    //    end at the chunk boundary — flush it as a complete token now.
    if (tokens && pendingScalarStart >= 0) {
      // Scalar-continuation bytes are anything that isn't whitespace,
      // structural punctuation, or a quote. If the current byte is a
      // continuation, leave the deferred state alone — the scan below
      // will include it in the same token.
      if (
        isWhitespace(byte)
        || byte === CHAR_COMMA
        || byte === CHAR_COLON
        || byte === CHAR_CLOSE_BRACE
        || byte === CHAR_CLOSE_BRACKET
        || byte === CHAR_OPEN_BRACE
        || byte === CHAR_OPEN_BRACKET
        || byte === CHAR_QUOTE
      ) {
        tokens.push(
          scalarKindFromFirstByte(pendingScalarFirstByte),
          pendingScalarStart,
          out.getUtf16Cursor(),
        )
        pendingScalarStart = -1
      }
    }

    // Opening brace/bracket.
    if (isStructuralOpen(byte)) {
      const punctStart = tokens ? out.getUtf16Cursor() : 0
      writeByte(byte)
      if (tokens) tokens.push(TOKEN_PUNCT, punctStart, punctStart + 1)

      // Peek ahead (skipping whitespace) to see if the container is empty.
      let peek = i + 1
      while (peek < end && isWhitespace(input[peek])) peek++

      if (peek < end && isStructuralClose(input[peek])) {
        // Empty container — emit close immediately, no newline.
        const closeStart = tokens ? out.getUtf16Cursor() : 0
        writeByte(input[peek])
        if (tokens) tokens.push(TOKEN_PUNCT, closeStart, closeStart + 1)
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
      const punctStart = tokens ? out.getUtf16Cursor() : 0
      writeByte(byte)
      if (tokens) tokens.push(TOKEN_PUNCT, punctStart, punctStart + 1)
      i++
      continue
    }

    // Comma — newline + indent after.
    if (byte === CHAR_COMMA) {
      const punctStart = tokens ? out.getUtf16Cursor() : 0
      writeByte(byte)
      if (tokens) tokens.push(TOKEN_PUNCT, punctStart, punctStart + 1)
      emitNewlineAndIndent(out, indents, depth)
      i++
      continue
    }

    // Colon — emit ": ". The token covers only the `:`, not the space.
    if (byte === CHAR_COLON) {
      const punctStart = tokens ? out.getUtf16Cursor() : 0
      writeByte(COLON_BYTE)
      if (tokens) tokens.push(TOKEN_PUNCT, punctStart, punctStart + 1)
      writeByte(SPACE_BYTE)
      i++
      continue
    }

    // Opening quote — enter string mode.
    if (byte === CHAR_QUOTE) {
      if (tokens) stringTokenStart = out.getUtf16Cursor()
      writeByte(byte)
      inString = true
      i++
      continue
    }

    // Everything else (digits, letters for true/false/null).
    // Batch-copy until we hit a structural or whitespace character.
    const valueStartUtf16 = tokens ? out.getUtf16Cursor() : 0
    const valueFirstByte = input[i]
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

    if (tokens) {
      if (valueEnd === end) {
        // Ran out of chunk mid-scalar. Defer token emission so the
        // next chunk can extend the range; the start-of-loop pending
        // check will either flush it (if the next meaningful byte is
        // a delimiter) or the "everything else" branch will resume
        // scanning and produce a single merged token.
        pendingScalarStart = valueStartUtf16
        pendingScalarFirstByte = valueFirstByte
      } else {
        tokens.push(
          scalarKindFromFirstByte(valueFirstByte),
          valueStartUtf16,
          out.getUtf16Cursor(),
        )
        pendingScalarStart = -1
      }
    }

    i = valueEnd
  }

  // Write state back for the next chunk.
  state.depth = depth
  state.inString = inString
  state.escaped = escaped
  state.absoluteOffset = absoluteOffset + (end - start)
  state.stringTokenStart = stringTokenStart
  state.pendingKey = pendingKey
  state.pendingScalarStart = pendingScalarStart
  state.pendingScalarFirstByte = pendingScalarFirstByte
}

/**
 * Finalize formatting after the last chunk has been processed.
 * Records errors for any unclosed containers or unterminated strings.
 * Does not emit additional bytes — recovery is left to the caller so
 * that malformed output never masks a structural error.
 *
 * @param {FormatterState} state
 * @param {Object}         [out]    - Output buffer (required if tokens were emitted).
 * @param {Object}         [tokens] - Token buffer, if token emission was enabled.
 */
export const finalizeFormat = (state, out = null, tokens = null) => {
  // Flush any unquoted scalar that was deferred across chunk boundaries
  // and never followed by a delimiter — it ended with the input.
  if (tokens && state.pendingScalarStart >= 0) {
    tokens.push(
      scalarKindFromFirstByte(state.pendingScalarFirstByte),
      state.pendingScalarStart,
      out.getUtf16Cursor(),
    )
    state.pendingScalarStart = -1
  }
  // A string token that was pending key/string disambiguation at EOF
  // was never followed by a `:`, so it correctly stays as TOKEN_STRING.
  state.pendingKey = false

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
 * @typedef {Object} TokenStream
 * @property {Uint32Array} offsets - Flat pairs of [start, end) UTF-16 indices into the decoded output.
 * @property {Uint8Array}  kinds   - One TOKEN_* value per token. Length === count.
 * @property {number}      count   - Total number of tokens.
 */

/**
 * @typedef {Object} FormatBytesResult
 * @property {Uint8Array}    output - Formatted JSON bytes.
 * @property {FormatError[]} errors - Structural errors encountered. Empty on valid input.
 * @property {TokenStream}   [tokens] - Present only when `opts.tokens === true`.
 */

/**
 * @typedef {Object} FormatStringResult
 * @property {string}        output - Pretty-printed JSON string.
 * @property {FormatError[]} errors - Structural errors encountered. Empty on valid input.
 * @property {TokenStream}   [tokens] - Present only when `opts.tokens === true`.
 */

/**
 * Format an entire JSON byte array in one shot.
 *
 * @param {Uint8Array} input   - Raw JSON bytes (UTF-8 encoded).
 * @param {Object}     [opts]  - Formatting options.
 * @param {number}     [opts.indentSize=2]
 * @param {boolean}    [opts.tokens=false] - Emit token classification alongside the output.
 * @returns {FormatBytesResult}
 */
export const formatBytes = (input, opts = {}) => {
  const state = createFormatterState(opts)
  const out = createOutputBuffer(Math.max(input.length * 2, OUTPUT_BUFFER_SIZE))
  const tokens = opts.tokens === true ? createTokenBuffer() : null
  formatChunk(input, 0, input.length, state, out, tokens)
  finalizeFormat(state, out, tokens)
  const result = { output: out.flush(), errors: state.errors }
  if (tokens) result.tokens = tokens.snapshot()
  return result
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
  const result = formatBytes(input, opts)
  const decoded = { output: decoder.decode(result.output), errors: result.errors }
  if (result.tokens) decoded.tokens = result.tokens
  return decoded
}

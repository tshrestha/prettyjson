/**
 * @module constants
 * @description Shared constants for the JSON formatter.
 *
 * All character codes are pre-computed to avoid repeated charCodeAt calls
 * in the hot path. Grouping them here keeps the formatter module focused
 * on logic and makes it trivial to audit the character set.
 */

// ── Structural characters ────────────────────────────────────────────
export const CHAR_OPEN_BRACE = 0x7B // {
export const CHAR_CLOSE_BRACE = 0x7D // }
export const CHAR_OPEN_BRACKET = 0x5B // [
export const CHAR_CLOSE_BRACKET = 0x5D // ]
export const CHAR_COMMA = 0x2C // ,
export const CHAR_COLON = 0x3A // :

// ── String delimiters & escaping ─────────────────────────────────────
export const CHAR_QUOTE = 0x22 // "
export const CHAR_BACKSLASH = 0x5C // \

// ── Whitespace ───────────────────────────────────────────────────────
export const CHAR_SPACE = 0x20
export const CHAR_TAB = 0x09
export const CHAR_NEWLINE = 0x0A // \n
export const CHAR_CR = 0x0D // \r

// ── Output tokens (pre-encoded UTF-8 bytes) ──────────────────────────
export const NEWLINE_BYTE = 0x0A
export const SPACE_BYTE = 0x20
export const COLON_BYTE = 0x3A

// ── Defaults ─────────────────────────────────────────────────────────
export const DEFAULT_INDENT_SIZE = 2
export const DEFAULT_INDENT_CHAR = CHAR_SPACE
export const MAX_CACHED_DEPTH = 128
export const OUTPUT_BUFFER_SIZE = 65_536 // 64 KB write buffer
export const DEFAULT_CHUNK_SIZE = 2_097_152 // 2 MB per processing chunk

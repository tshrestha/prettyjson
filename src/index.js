/**
 * @module json-formatter
 * @description Public API surface for the JSON formatter library.
 *
 * Consumers should import from this file:
 *
 *   import { createFormatter, formatString, formatBytes } from "./src/index.js";
 *
 * - `createFormatter`  — Full async Worker-backed formatter (recommended).
 * - `formatString`     — Synchronous string→string formatting (small inputs).
 * - `formatBytes`      — Synchronous bytes→bytes formatting (advanced).
 */

export { createFormatter } from "./client.js"
export {
  HIGHLIGHT_TOKEN_THRESHOLD,
  TOKEN_BOOLEAN,
  TOKEN_KEY,
  TOKEN_NULL,
  TOKEN_NUMBER,
  TOKEN_PUNCT,
  TOKEN_STRING,
} from "./constants.js"
export { formatBytes, formatString } from "./formatter.js"

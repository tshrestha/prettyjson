/**
 * @module client
 * @description Main-thread API for the JSON formatter.
 *
 * Provides a clean Promise-based interface that hides all Web Worker
 * and message-passing details. Supports progress callbacks,
 * cancellation via AbortSignal, and automatic fallback to synchronous
 * formatting when Workers are unavailable.
 *
 * Usage:
 *   import { createFormatter } from "./client.js";
 *
 *   const formatter = createFormatter();
 *
 *   const result = await formatter.format(jsonString, {
 *     indentSize: 4,
 *     onProgress: (pct) => console.log(`${pct}% done`),
 *     signal: abortController.signal,
 *   });
 *
 *   formatter.destroy();
 */

import { formatBytes } from "./formatter.js";


// ── ID generator ─────────────────────────────────────────────────────

let nextId = 0;
const generateId = () => `fmt_${nextId++}`;


// ── Encoder / Decoder singletons ─────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();


// ── Factory ──────────────────────────────────────────────────────────

/**
 * @typedef  {Object} FormatterInstance
 * @property {function} format  - Format a JSON string.
 * @property {function} destroy - Terminate the worker and clean up.
 */

/**
 * @typedef  {Object} FormatOptions
 * @property {number}      [indentSize=2]   - Spaces per indent level.
 * @property {Function}    [onProgress]     - Called with (percent: number).
 * @property {AbortSignal} [signal]         - Abort signal for cancellation.
 * @property {number}      [chunkSize]      - Bytes per async chunk.
 */

/**
 * Create a formatter instance backed by a Web Worker.
 *
 * @param {Object}  [config]
 * @param {string}  [config.workerURL]  - URL to the worker script.
 * @returns {FormatterInstance}
 */
export const createFormatter = (config = {}) => {
  const workerURL = config.workerURL ?? new URL("./worker.js", import.meta.url).href;

  let worker = null;
  const pendingJobs = new Map();

  // ── Lazy worker initialization ───────────────────────────────
  const getWorker = () => {
    if (worker) return worker;
    try {
      worker = new Worker(workerURL, { type: "module" });
      worker.onmessage = handleWorkerMessage;
      worker.onerror = handleWorkerError;
      return worker;
    } catch {
      // Workers unavailable (e.g., file:// protocol, CSP).
      return null;
    }
  };

  // ── Worker message handling ──────────────────────────────────
  const handleWorkerMessage = (event) => {
    const { type, id, payload, errors, message, bytesProcessed, totalBytes } = event.data;
    const job = pendingJobs.get(id);
    if (!job) return;

    if (type === "result") {
      pendingJobs.delete(id);
      job.cleanup?.();
      const bytes = new Uint8Array(payload);
      job.resolve({ output: decoder.decode(bytes), errors: errors ?? [] });
    }

    if (type === "error") {
      pendingJobs.delete(id);
      job.cleanup?.();
      job.reject(new Error(message));
    }

    if (type === "progress" && job.onProgress) {
      const percent = Math.round((bytesProcessed / totalBytes) * 100);
      job.onProgress(percent);
    }
  };

  const handleWorkerError = (event) => {
    // Global worker error — reject all pending jobs.
    const error = new Error(event.message ?? "Worker encountered an error.");
    for (const [, job] of pendingJobs) {
      job.cleanup?.();
      job.reject(error);
    }
    pendingJobs.clear();
  };

  // ── Synchronous fallback ─────────────────────────────────────
  const formatSync = (jsonString, opts) => {
    const input = encoder.encode(jsonString);
    const { output, errors } = formatBytes(input, opts);
    return { output: decoder.decode(output), errors };
  };

  // ── Public: format ───────────────────────────────────────────
  /**
   * Format a JSON string, offloading work to a Web Worker.
   *
   * @param {string}        jsonString
   * @param {FormatOptions} [opts]
   * @returns {Promise<{output: string, errors: Array}>}
   */
  const format = (jsonString, opts = {}) => {
    const w = getWorker();

    // Fallback: if Workers aren't available, format synchronously.
    if (!w) {
      return Promise.resolve(formatSync(jsonString, opts));
    }

    const id = generateId();
    const inputBytes = encoder.encode(jsonString);

    // Transfer the underlying ArrayBuffer to avoid copying.
    const transferable = inputBytes.buffer;

    return new Promise((resolve, reject) => {
      const job = {
        resolve,
        reject,
        onProgress: opts.onProgress ?? null,
        cleanup: null,
      };
      pendingJobs.set(id, job);

      // Wire up external cancellation. Keep a reference to the listener
      // so we can remove it on normal completion — otherwise long-lived
      // AbortSignals accumulate listeners across many format() calls.
      if (opts.signal) {
        if (opts.signal.aborted) {
          pendingJobs.delete(id);
          reject(new DOMException("Formatting was cancelled.", "AbortError"));
          return;
        }
        const onAbort = () => {
          pendingJobs.delete(id);
          w.postMessage({ type: "cancel", id });
          reject(new DOMException("Formatting was cancelled.", "AbortError"));
        };
        opts.signal.addEventListener("abort", onAbort, { once: true });
        job.cleanup = () => opts.signal.removeEventListener("abort", onAbort);
      }

      w.postMessage(
        {
          type: "format",
          id,
          payload: transferable,
          options: {
            indentSize: opts.indentSize,
            chunkSize: opts.chunkSize,
          },
        },
        [transferable],
      );
    });
  };

  // ── Public: destroy ──────────────────────────────────────────
  const destroy = () => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    for (const [, job] of pendingJobs) {
      job.cleanup?.();
      job.reject(new Error("Formatter was destroyed."));
    }
    pendingJobs.clear();
  };

  return Object.freeze({ format, destroy });
};

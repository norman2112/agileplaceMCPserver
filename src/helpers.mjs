import fetch from "node-fetch";
import { z } from "zod";
import { CONFIG } from "./config.mjs";

const { FETCH_TIMEOUT_MS } = CONFIG;

export function nowIso() {
  return new Date().toISOString();
}

export function truncateString(value, max = 300) {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…(${value.length - max} more chars)`;
}

export function redactForLogs(value, depth = 0) {
  const MAX_DEPTH = 6;
  const MAX_ARRAY = 30;

  if (depth > MAX_DEPTH) return "[Truncated]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY).map(v => redactForLogs(v, depth + 1));
    return value.length > MAX_ARRAY ? [...sliced, `[+${value.length - MAX_ARRAY} more]`] : sliced;
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = String(k);
      if (/(token|secret|password|authorization|api[_-]?key)/i.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = redactForLogs(v, depth + 1);
    }
    return out;
  }

  return truncateString(String(value));
}

export function normalizeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause instanceof Error
        ? { name: err.cause.name, message: err.cause.message, stack: err.cause.stack }
        : err.cause,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

export function logError(context, err, meta) {
  const safeMeta = meta ? redactForLogs(meta) : undefined;
  const normalized = normalizeError(err);
  console.error(`[${nowIso()}] ERROR ${context}: ${normalized.message}`);
  if (safeMeta !== undefined) {
    try {
      console.error(`[${nowIso()}] META ${context}: ${JSON.stringify(safeMeta)}`);
    } catch {
      console.error(`[${nowIso()}] META ${context}: [unserializable]`);
    }
  }
  if (normalized.stack) console.error(normalized.stack);
  if (normalized.cause) {
    try {
      console.error(`[${nowIso()}] CAUSE ${context}: ${JSON.stringify(redactForLogs(normalized.cause))}`);
    } catch {
      console.error(`[${nowIso()}] CAUSE ${context}: [unserializable]`);
    }
  }
}

export function wrapToolHandler(toolName, handler) {
  return async (input, ...rest) => {
    try {
      return await handler(input, ...rest);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues?.map(i => ({
          path: i.path?.join("."),
          message: i.message,
          code: i.code,
        }));
        logError(`tool:${toolName}`, err, { input, zodIssues: issues });
        throw new Error(
          `Invalid tool input for ${toolName}: ${JSON.stringify(issues || err.issues || [], null, 2)}`,
          { cause: err }
        );
      }

      logError(`tool:${toolName}`, err, { input });
      throw err;
    }
  };
}

export async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    const name = err?.name ? String(err.name) : "";
    if (name === "AbortError") {
      throw new Error(`Request timed out after ${ms}ms for ${url}`, { cause: err });
    }
    throw new Error(`Request failed for ${url}: ${err?.message || err}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export function stripHtml(text) {
  return typeof text === "string" ? text.replace(/<[^>]*>/g, "") : "";
}

export function respondText(...parts) {
  // Convert all parts to strings and filter out empty ones
  const message = parts
    .map(part => {
      if (part === null || part === undefined) return "";
      return String(part);
    })
    .filter(part => part.trim().length > 0)
    .join("\n\n");

  const text = message && message.trim().length > 0 ? message : "Operation completed successfully.";

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}


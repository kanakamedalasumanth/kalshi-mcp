// ============================================
// src/logger.ts — Structured Logger
// ============================================
// A lightweight, levelled logger that writes structured JSON logs to
// stderr (NOT stdout). This is critical because MCP servers communicate
// with clients over stdout using JSON-RPC — if we logged to stdout we'd
// corrupt the protocol stream.
//
// WHY NOT USE A BIG LOGGING LIBRARY?
// MCP servers should be lightweight and have minimal dependencies. This
// logger gives us structured, levelled logging with timestamps, caller
// context, and request metadata — everything you need for debugging
// without pulling in winston/pino/bunyan.
//
// LOG LEVELS (ascending severity):
//   debug → info → warn → error
//
// Only messages at or above the configured level are emitted.
// ============================================

/** The four supported log levels, ordered from most to least verbose. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Numeric priority for each level — higher means more severe. */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Structured log entry written as a single JSON line to stderr.
 * Each entry contains enough context to filter and search in
 * any log aggregation system.
 */
interface LogEntry {
    timestamp: string;       // ISO-8601 timestamp
    level: LogLevel;         // Severity level
    logger: string;          // Name of the logger (e.g. "KalshiClient")
    message: string;         // Human-readable message
    data?: unknown;          // Optional structured payload (objects, arrays, etc.)
    durationMs?: number;     // Optional elapsed time for timed operations
}

/**
 * Logger — a named, levelled logger instance.
 *
 * Usage:
 * ```ts
 * const log = new Logger("MyModule");
 * log.info("Server started", { port: 3000 });
 * log.debug("Verbose detail here");
 * log.error("Something failed", { error: err.message });
 * ```
 *
 * Create one Logger per module/file for clear origin tracking.
 */
export class Logger {
    private name: string;
    private minLevel: LogLevel;

    /**
     * @param name     Identifies this logger in log output (e.g. "AuthSigner")
     * @param level    Minimum level to emit — defaults to "info"
     */
    constructor(name: string, level: LogLevel = "info") {
        this.name = name;
        this.minLevel = level;
    }

    // ── Public levelled methods ──────────────────────────────────

    /** Low-priority detail useful during development / troubleshooting. */
    debug(message: string, data?: unknown): void {
        this.log("debug", message, data);
    }

    /** Standard operational messages (startup, connections, tool calls). */
    info(message: string, data?: unknown): void {
        this.log("info", message, data);
    }

    /** Something unexpected that doesn't prevent operation but warrants attention. */
    warn(message: string, data?: unknown): void {
        this.log("warn", message, data);
    }

    /** A failure that prevents the requested operation from completing. */
    error(message: string, data?: unknown): void {
        this.log("error", message, data);
    }

    // ── Timing helper ────────────────────────────────────────────

    /**
     * Starts a timer and returns a function that, when called, emits
     * an info-level log with the elapsed duration.
     *
     * Usage:
     * ```ts
     * const done = log.time("Fetching markets");
     * const result = await fetchMarkets();
     * done({ count: result.length });
     * ```
     */
    time(message: string): (data?: unknown) => void {
        const start = performance.now();
        return (data?: unknown) => {
            const durationMs = Math.round(performance.now() - start);
            this.logEntry({
                timestamp: new Date().toISOString(),
                level: "info",
                logger: this.name,
                message: `${message} — completed`,
                data,
                durationMs,
            });
        };
    }

    // ── Internal ─────────────────────────────────────────────────

    /**
     * Core log method — checks level threshold, builds the structured
     * entry, and writes it as a single JSON line to stderr.
     */
    private log(level: LogLevel, message: string, data?: unknown): void {
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
            return; // Below configured threshold → skip
        }

        this.logEntry({
            timestamp: new Date().toISOString(),
            level,
            logger: this.name,
            message,
            data,
        });
    }

    /** Writes a structured LogEntry as a single JSON line to stderr. */
    private logEntry(entry: LogEntry): void {
        // Write to stderr so we don't interfere with MCP's stdout JSON-RPC
        process.stderr.write(JSON.stringify(entry) + "\n");
    }
}

/**
 * Factory function to create a logger with the app's configured log level.
 * Import this in every module:
 *
 * ```ts
 * import { createLogger } from "../logger.js";
 * const log = createLogger("ModuleName");
 * ```
 */
export function createLogger(name: string): Logger {
    // Read log level from env at creation time (config may not be loaded yet
    // during module init, so we fall back to "info")
    const level = (process.env.LOG_LEVEL || "info") as LogLevel;
    return new Logger(name, level);
}

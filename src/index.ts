#!/usr/bin/env node
// ============================================
// src/index.ts — Application Entry Point
// ============================================
// This is the main entry point for the Kalshi MCP server. When you
// run `node dist/index.js`, this file:
//
//   1. Loads environment config (API key, private key path, etc.)
//   2. Creates the MCP server with all 14 tools registered
//   3. Connects to stdio transport (for local agent communication)
//   4. Sets up graceful shutdown handlers
//
// STDIO TRANSPORT — WHY?
// MCP supports multiple transports (HTTP, WebSocket, stdio). We use
// stdio because:
//   - Zero latency: no TCP handshake, no HTTP overhead
//   - Zero config: no ports, firewalls, or TLS to worry about
//   - Standard pattern: Claude Desktop and OpenClaw both support it
//   - The agent spawns this process and pipes JSON-RPC through stdin/stdout
//
// IMPORTANT: All logs go to stderr (not stdout) because stdout is
// reserved for MCP's JSON-RPC protocol. If we logged to stdout,
// we'd corrupt the protocol and the agent would fail to parse responses.
// ============================================

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { kalshiConfig } from "./config.js";
import { createMcpServer } from "./server.js";
import { createLogger } from "./logger.js";

const log = createLogger("Main");

/**
 * Main startup function.
 *
 * Async because connecting the transport is an async operation.
 * Wrapped in a function so we can catch top-level errors cleanly.
 */
async function main(): Promise<void> {
    log.info("═══════════════════════════════════════════════");
    log.info("Kalshi MCP Server — Starting Up");
    log.info("═══════════════════════════════════════════════");
    log.info("Configuration loaded", {
        baseUrl: kalshiConfig.baseUrl,
        logLevel: kalshiConfig.logLevel,
        apiKeyId: kalshiConfig.apiKeyId.substring(0, 8) + "...",
    });

    // ── Create the server with all tools ─────────────────────────
    const server = createMcpServer(kalshiConfig);

    // ── Connect to stdio transport ───────────────────────────────
    // This makes the server listen on stdin for JSON-RPC requests
    // and respond on stdout. The process stays alive until the
    // agent disconnects or we receive a shutdown signal.
    const transport = new StdioServerTransport();

    log.info("Connecting to stdio transport...");
    await server.connect(transport);

    log.info("═══════════════════════════════════════════════");
    log.info("   Kalshi MCP Server — Ready");
    log.info("   14 tools available | Waiting for agent");
    log.info("═══════════════════════════════════════════════");
}

// ── Graceful Shutdown ──────────────────────────────────────────
// Clean up when the process is terminated. This ensures we don't
// leave any resources hanging.

process.on("SIGINT", () => {
    log.info("Received SIGINT — shutting down gracefully");
    process.exit(0);
});

process.on("SIGTERM", () => {
    log.info("Received SIGTERM — shutting down gracefully");
    process.exit(0);
});

process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on("unhandledRejection", (reason) => {
    log.error("Unhandled promise rejection", { reason: String(reason) });
    process.exit(1);
});

// ── Launch ─────────────────────────────────────────────────────
main().catch((error) => {
    log.error("Fatal startup error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
});

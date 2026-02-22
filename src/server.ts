// ============================================
// src/server.ts — MCP Server Setup
// ============================================
// This is the core MCP server. It creates the McpServer instance,
// initialises all the API clients, and registers every tool.
//
// The server uses STDIO transport — it reads JSON-RPC from stdin
// and writes responses to stdout. This is the simplest and fastest
// way for local AI agents (OpenClaw, Claude Desktop) to connect.
// No HTTP server, no ports, no latency — just piped I/O.
//
// HOW THE PIECES FIT:
//   1. Config loads env vars (API key, private key path, base URL)
//   2. Signer reads the RSA private key and can sign requests
//   3. Client wraps fetch() with automatic signing
//   4. API modules use the client to call specific endpoints
//   5. Tool modules wrap API calls as MCP tools
//   6. The server makes tools available to any connected agent
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KalshiSigner } from "./auth/signer.js";
import { KalshiClient } from "./auth/client.js";
import { EventsApi } from "./api/events.js";
import { MarketsApi } from "./api/markets.js";
import { TradingApi } from "./api/trading.js";
import { PortfolioApi } from "./api/portfolio.js";
import { ExchangeApi } from "./api/exchange.js";
import { SeriesApi } from "./api/series.js";
import { SearchApi } from "./api/search.js";
import { registerMarketTools } from "./tools/market-tools.js";
import { registerTradingTools } from "./tools/trading-tools.js";
import { registerPortfolioTools } from "./tools/portfolio-tools.js";
import { registerDiscoveryTools } from "./tools/discovery-tools.js";
import { registerCompositeTools } from "./tools/composite-tools.js";
import { createLogger } from "./logger.js";
import type { KalshiConfig } from "./config.js";

const log = createLogger("MCPServer");

/**
 * Creates and configures the MCP server with all Kalshi trading tools.
 *
 * This function:
 *   1. Creates the RSA signer from the config's private key
 *   2. Creates the authenticated HTTP client
 *   3. Initialises all 5 API domain modules
 *   4. Creates the MCP server instance
 *   5. Registers all 14 tools across 3 categories
 *
 * @param config  Validated KalshiConfig with API credentials
 * @returns       The configured McpServer, ready to connect to a transport
 */
export function createMcpServer(config: KalshiConfig): McpServer {
    log.info("Creating Kalshi MCP server", {
        baseUrl: config.baseUrl,
        logLevel: config.logLevel,
    });

    // ── Step 1: Set up authentication ────────────────────────────
    // The signer reads the RSA private key from disk (once) and can
    // produce signed headers for any request
    const signer = new KalshiSigner(config.apiKeyId, config.privateKeyPath);

    // ── Step 2: Create the HTTP client ───────────────────────────
    // The client wraps fetch() and automatically signs every request
    // using the signer - no manual header management needed
    const client = new KalshiClient(config.baseUrl, signer);

    // ── Step 3: Initialise API modules ───────────────────────────
    // Each module focuses on one domain of the Kalshi API
    const eventsApi = new EventsApi(client);
    const marketsApi = new MarketsApi(client);
    const tradingApi = new TradingApi(client);
    const portfolioApi = new PortfolioApi(client);
    const exchangeApi = new ExchangeApi(client);
    const seriesApi = new SeriesApi(client);
    const searchApi = new SearchApi(client);

    log.info("All API modules initialized");

    // ── Step 4: Create the MCP server ────────────────────────────
    // The server provides the tool registry and handles JSON-RPC
    // communication with the connected AI agent
    const server = new McpServer({
        name: "kalshi-mcp",
        version: "1.0.0",
    });

    log.info("MCP server instance created");

    // ── Step 5: Register all tools ───────────────────────────────
    // 7 market data tools (read-only, safe)
    registerMarketTools(server, eventsApi, marketsApi, exchangeApi);

    // 4 trading tools (write operations, uses real money)
    registerTradingTools(server, tradingApi);

    // 3 portfolio tools (read-only account queries)
    registerPortfolioTools(server, portfolioApi);

    // 3 discovery tools (series browsing & search)
    registerDiscoveryTools(server, seriesApi, searchApi);

    // 1 composite tool (multi-step workflow in one call)
    registerCompositeTools(server, seriesApi, eventsApi);

    log.info("Kalshi MCP server fully configured — tools registered!");

    return server;
}

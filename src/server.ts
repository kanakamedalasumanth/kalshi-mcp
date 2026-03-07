// ============================================
// src/server.ts — MCP Server Setup
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KalshiSigner } from "./auth/signer.js";
import { KalshiClient } from "./auth/client.js";
import { SearchApi } from "./api/search.js";
import { PortfolioApi } from "./api/portfolio.js";
import { TradingApi } from "./api/trading.js";
import { registerDiscoveryTools } from "./tools/discovery-tools.js";
import { registerPortfolioTools } from "./tools/portfolio-tools.js";
import { registerTradingTools } from "./tools/trading-tools.js";
import { createLogger } from "./logger.js";
import type { KalshiConfig } from "./config.js";

const log = createLogger("MCPServer");

export function createMcpServer(config: KalshiConfig): McpServer {
    log.info("Creating Kalshi MCP server", {
        baseUrl: config.baseUrl,
        logLevel: config.logLevel,
        publicBaseUrl: config.publicBaseUrl,
    });

    const signer = new KalshiSigner(config.apiKeyId, config.privateKeyPath);
    const client = new KalshiClient(config.baseUrl, config.publicBaseUrl, signer);

    const searchApi = new SearchApi(client);

    const server = new McpServer({
        name: "kalshi-mcp",
        version: "1.0.0",
    });

    const portfolioApi = new PortfolioApi(client);

    const tradingApi = new TradingApi(client);

    registerDiscoveryTools(server, searchApi);
    registerPortfolioTools(server, portfolioApi);
    registerTradingTools(server, tradingApi);

    log.info("Kalshi MCP server ready");
    return server;
}

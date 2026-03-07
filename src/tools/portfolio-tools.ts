// ============================================
// src/tools/portfolio-tools.ts — Portfolio MCP Tools
// ============================================
// Tools registered here:
//   get_balance      — Get account balance and portfolio value
//   get_positions    — Get current open positions
//   get_fills        — Get trade fill history
//   get_settlements  — Get settlement history

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PortfolioApi } from "../api/portfolio.js";
import { createLogger } from "../logger.js";

const log = createLogger("PortfolioTools");

// ── Tool registration ────────────────────────────────────────────

export function registerPortfolioTools(
    server: McpServer,
    portfolioApi: PortfolioApi
): void {
    log.info("Registering portfolio tools");

    // ── get_balance ─────────────────────────────────────────────
    server.tool(
        "get_balance",
        "Get your Kalshi account balance and portfolio value in dollars.",
        {},
        async () => {
            log.info("Tool called: get_balance");
            try {
                const result = await portfolioApi.getBalance();
                const output = {
                    balance_dollars: (result.balance / 100).toFixed(2),
                    portfolio_value_dollars: (result.portfolio_value / 100).toFixed(2),
                };
                log.info("Tool get_balance completed", output);
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_balance failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── get_positions ───────────────────────────────────────────
    server.tool(
        "get_positions",
        "Get your current open positions on Kalshi markets.",
        {
            ticker: z.string().optional().describe("Filter by market ticker"),
            event_ticker: z.string().optional().describe("Filter by event ticker"),
            limit: z.number().optional().describe("Maximum number of positions to return"),
            cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        },
        async (params) => {
            log.info("Tool called: get_positions", {
                ticker: params.ticker,
                event_ticker: params.event_ticker,
                limit: params.limit,
            });
            try {
                const result = await portfolioApi.getPositions({
                    ticker: params.ticker,
                    event_ticker: params.event_ticker,
                    limit: params.limit,
                    cursor: params.cursor,
                });
                const output = {
                    market_positions: result.market_positions,
                    cursor: result.cursor,
                };
                log.info("Tool get_positions completed", {
                    positionCount: result.market_positions?.length ?? 0,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_positions failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── get_fills ───────────────────────────────────────────────
    server.tool(
        "get_fills",
        "Get your trade fill history — completed order executions.",
        {
            ticker: z.string().optional().describe("Filter by market ticker"),
            limit: z.number().optional().describe("Maximum number of fills to return"),
            cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        },
        async (params) => {
            log.info("Tool called: get_fills", {
                ticker: params.ticker,
                limit: params.limit,
            });
            try {
                const result = await portfolioApi.getFills({
                    ticker: params.ticker,
                    limit: params.limit,
                    cursor: params.cursor,
                });
                const output = {
                    fills: result.fills,
                    cursor: result.cursor,
                };
                log.info("Tool get_fills completed", {
                    fillCount: result.fills?.length ?? 0,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_fills failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── get_settlements ─────────────────────────────────────────
    server.tool(
        "get_settlements",
        "Get your settlement history — markets that have resolved and paid out.",
        {
            ticker: z.string().optional().describe("Filter by market ticker"),
            limit: z.number().optional().describe("Maximum number of settlements to return"),
            cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        },
        async (params) => {
            log.info("Tool called: get_settlements", {
                ticker: params.ticker,
                limit: params.limit,
            });
            try {
                const result = await portfolioApi.getSettlements({
                    ticker: params.ticker,
                    limit: params.limit,
                    cursor: params.cursor,
                });
                const output = {
                    settlements: result.settlements,
                    cursor: result.cursor,
                };
                log.info("Tool get_settlements completed", {
                    settlementCount: result.settlements?.length ?? 0,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_settlements failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("Portfolio tools registered (4 tools)");
}

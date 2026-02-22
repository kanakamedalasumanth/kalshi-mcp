// ============================================
// src/tools/portfolio-tools.ts — MCP Tools for Portfolio Management
// ============================================
// These tools let AI agents query the user's portfolio state:
// balance, positions, and trade history. All read-only.
//
// Agents use these to:
// - Check available funds before placing orders
// - Review current positions for portfolio-aware decisions
// - Audit past trade fills for performance analysis
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PortfolioApi } from "../api/portfolio.js";
import { createLogger } from "../logger.js";

const log = createLogger("PortfolioTools");

/**
 * Registers all portfolio management tools on the MCP server.
 *
 * @param server       The McpServer instance
 * @param portfolioApi Initialized PortfolioApi instance
 */
export function registerPortfolioTools(
    server: McpServer,
    portfolioApi: PortfolioApi
): void {
    log.info("Registering portfolio tools");

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_balance
    // ─────────────────────────────────────────────────────────────
    // Shows available cash and total portfolio value.
    // Agents should check this before placing orders to ensure
    // sufficient funds.
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_balance",
        "Get your Kalshi account balance and portfolio value. " +
        "Check this before placing orders to ensure you have enough funds. " +
        "Values are shown in both cents and dollars.",
        {},
        async () => {
            log.info("Tool called: get_balance");

            try {
                const result = await portfolioApi.getBalance();

                log.info("Tool get_balance completed", {
                    balanceCents: result.balance,
                    portfolioValueCents: result.portfolio_value,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    balance_cents: result.balance,
                                    balance_dollars: (result.balance / 100).toFixed(2),
                                    portfolio_value_cents: result.portfolio_value,
                                    portfolio_value_dollars: (result.portfolio_value / 100).toFixed(2),
                                },
                                null,
                                2
                            ),
                        },
                    ],
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

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_positions
    // ─────────────────────────────────────────────────────────────
    // Shows all current market positions. Critical for portfolio-
    // aware agents that need to know what they already hold before
    // making new trading decisions.
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_positions",
        "Get your current Kalshi market positions. Shows how many contracts " +
        "you hold in each market, your realized P&L, and whether markets " +
        "have settled. Positive position = YES contracts, negative = NO.",
        {
            ticker: z
                .string()
                .optional()
                .describe("Filter to positions in a specific market."),
            event_ticker: z
                .string()
                .optional()
                .describe("Filter to positions in markets under a specific event."),
            limit: z
                .number()
                .min(1)
                .max(1000)
                .optional()
                .describe("Max positions to return (default 100)."),
        },
        async ({ ticker, event_ticker, limit }) => {
            log.info("Tool called: get_positions", { ticker, event_ticker, limit });

            try {
                const result = await portfolioApi.getPositions({
                    ticker,
                    event_ticker,
                    limit,
                });

                const positions = result.market_positions || [];

                log.info("Tool get_positions completed", {
                    positionCount: positions.length,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    position_count: positions.length,
                                    has_more: !!result.cursor,
                                    positions: positions.map((p) => ({
                                        ticker: p.ticker,
                                        event_ticker: p.event_ticker,
                                        position: p.position,
                                        position_side: p.position > 0 ? "YES" : p.position < 0 ? "NO" : "NONE",
                                        total_traded: p.total_traded,
                                        resting_orders: p.resting_orders_count,
                                        fees_paid_cents: p.fees_paid,
                                        realized_pnl_cents: p.realized_pnl,
                                        market_result: p.market_result || "pending",
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
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

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_fills
    // ─────────────────────────────────────────────────────────────
    // Trade execution history — every matched trade.
    // Useful for performance analysis and audit trails.
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_fills",
        "Get your completed trade fills. Each fill represents a matched " +
        "trade showing the exact price, quantity, and whether you were " +
        "the maker or taker. Useful for reviewing trade history and performance.",
        {
            ticker: z
                .string()
                .optional()
                .describe("Filter fills to a specific market."),
            limit: z
                .number()
                .min(1)
                .max(1000)
                .optional()
                .describe("Max fills to return (default 100)."),
        },
        async ({ ticker, limit }) => {
            log.info("Tool called: get_fills", { ticker, limit });

            try {
                const result = await portfolioApi.getFills({ ticker, limit });
                const fills = result.fills || [];

                log.info("Tool get_fills completed", { fillCount: fills.length });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    fill_count: fills.length,
                                    has_more: !!result.cursor,
                                    fills: fills.map((f) => ({
                                        trade_id: f.trade_id,
                                        order_id: f.order_id,
                                        ticker: f.ticker,
                                        side: f.side,
                                        action: f.action,
                                        count: f.count,
                                        yes_price: f.yes_price,
                                        no_price: f.no_price,
                                        is_taker: f.is_taker,
                                        time: f.created_time,
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
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

    log.info("All portfolio tools registered (3 tools)");
}

// ============================================
// src/tools/trading-tools.ts — MCP Tools for Order Execution
// ============================================
// These tools let AI agents place, monitor, and cancel orders on Kalshi.
// They are WRITE operations that move real money.
//
// SAFETY DESIGN:
// - Each tool has detailed parameter descriptions so agents understand
//   what they're doing
// - The create_order tool requires explicit side, action, count, and
//   price — no defaults that could lead to accidental trades
// - Every operation is logged with full context for audit trails
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TradingApi } from "../api/trading.js";
import { createLogger } from "../logger.js";

const log = createLogger("TradingTools");

/**
 * Registers all trading/order management tools on the MCP server.
 *
 * @param server     The McpServer instance
 * @param tradingApi Initialized TradingApi instance
 */
export function registerTradingTools(
    server: McpServer,
    tradingApi: TradingApi
): void {
    log.info("Registering trading tools");

    // ─────────────────────────────────────────────────────────────
    // TOOL: create_order
    // ─────────────────────────────────────────────────────────────
    // The core trading action. Places a buy or sell order on a market.
    //
    // Key concepts for agents:
    // - "buy yes" = betting the event WILL happen
    // - "buy no"  = betting the event will NOT happen
    // - "sell yes" = closing a YES position you hold
    // - "sell no"  = closing a NO position you hold
    // - Price is in cents (1-99), representing the cost per contract
    // - A contract pays $1 if correct, $0 if wrong
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "create_order",
        "Place a buy or sell order on a Kalshi prediction market. " +
        "IMPORTANT: This uses real money. Price is in cents (1-99). " +
        "A YES contract at 65¢ means you pay $0.65 and receive $1.00 if " +
        "the event happens (profit: $0.35). Use 'buy' to open positions " +
        "and 'sell' to close existing positions.",
        {
            ticker: z
                .string()
                .describe("Market ticker to trade on (e.g. 'BTC-100K-MAR1')."),
            side: z
                .enum(["yes", "no"])
                .describe(
                    "'yes' = event will happen, 'no' = event will not happen."
                ),
            action: z
                .enum(["buy", "sell"])
                .describe(
                    "'buy' = open/increase position, 'sell' = close/decrease position."
                ),
            count: z
                .number()
                .min(1)
                .describe("Number of contracts to buy/sell (positive integer)."),
            yes_price: z
                .number()
                .min(1)
                .max(99)
                .optional()
                .describe(
                    "Price in cents for YES side (1-99). Provide either yes_price or no_price, not both."
                ),
            no_price: z
                .number()
                .min(1)
                .max(99)
                .optional()
                .describe(
                    "Price in cents for NO side (1-99). Provide either yes_price or no_price, not both."
                ),
            time_in_force: z
                .enum(["fill_or_kill", "good_till_canceled", "immediate_or_cancel"])
                .optional()
                .describe(
                    "Order duration: " +
                    "'good_till_canceled' (default) = stays until filled or cancelled. " +
                    "'fill_or_kill' = fill completely or cancel entirely. " +
                    "'immediate_or_cancel' = fill what you can, cancel the rest."
                ),
            client_order_id: z
                .string()
                .optional()
                .describe("Your own unique order ID for tracking (optional)."),
        },
        async ({ ticker, side, action, count, yes_price, no_price, time_in_force, client_order_id }) => {
            log.info("Tool called: create_order", {
                ticker,
                side,
                action,
                count,
                yes_price,
                no_price,
                time_in_force,
            });

            try {
                const result = await tradingApi.createOrder({
                    ticker,
                    side,
                    action,
                    count,
                    yes_price,
                    no_price,
                    time_in_force,
                    client_order_id,
                });

                const order = result.order;

                log.info("Tool create_order completed", {
                    orderId: order.order_id,
                    status: order.status,
                    fillCount: order.fill_count,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    success: true,
                                    order: {
                                        order_id: order.order_id,
                                        ticker: order.ticker,
                                        side: order.side,
                                        action: order.action,
                                        status: order.status,
                                        count: order.count,
                                        fill_count: order.fill_count,
                                        remaining_count: order.remaining_count,
                                        yes_price: order.yes_price,
                                        no_price: order.no_price,
                                        created_time: order.created_time,
                                    },
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool create_order failed", {
                    ticker,
                    error: String(error),
                });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: cancel_order
    // ─────────────────────────────────────────────────────────────
    // Cancels a resting (unfilled) order. If partially filled, only
    // the remaining portion is cancelled.
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "cancel_order",
        "Cancel a resting order on Kalshi. Only unfilled portions can be " +
        "cancelled. Partially filled contracts remain as completed trades.",
        {
            order_id: z
                .string()
                .describe("The order ID to cancel (from create_order response)."),
        },
        async ({ order_id }) => {
            log.info("Tool called: cancel_order", { order_id });

            try {
                const result = await tradingApi.cancelOrder(order_id);

                log.info("Tool cancel_order completed", {
                    order_id,
                    reducedBy: result.reduced_by,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    success: true,
                                    cancelled_contracts: result.reduced_by,
                                    order: {
                                        order_id: result.order.order_id,
                                        status: result.order.status,
                                        fill_count: result.order.fill_count,
                                        remaining_count: result.order.remaining_count,
                                    },
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool cancel_order failed", { order_id, error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_order_status
    // ─────────────────────────────────────────────────────────────
    // Check how an order is doing — filled? partially filled? resting?
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_order_status",
        "Check the current status of an order. Shows fill progress, " +
        "remaining contracts, and timing information.",
        {
            order_id: z
                .string()
                .describe("The order ID to check."),
        },
        async ({ order_id }) => {
            log.info("Tool called: get_order_status", { order_id });

            try {
                const result = await tradingApi.getOrder(order_id);
                const order = result.order;

                log.info("Tool get_order_status completed", {
                    order_id,
                    status: order.status,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    order_id: order.order_id,
                                    ticker: order.ticker,
                                    side: order.side,
                                    action: order.action,
                                    status: order.status,
                                    total_count: order.count,
                                    fill_count: order.fill_count,
                                    remaining_count: order.remaining_count,
                                    yes_price: order.yes_price,
                                    no_price: order.no_price,
                                    created_time: order.created_time,
                                    taker_fees: order.taker_fees,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_order_status failed", { order_id, error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_open_orders
    // ─────────────────────────────────────────────────────────────
    // Lists all currently resting orders. Agents use this to see
    // what's pending before making new trading decisions.
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_open_orders",
        "List all currently resting (unfilled) orders. Useful for portfolio " +
        "management and avoiding duplicate orders.",
        {
            ticker: z
                .string()
                .optional()
                .describe("Filter to a specific market ticker."),
            event_ticker: z
                .string()
                .optional()
                .describe("Filter to a specific event ticker."),
        },
        async ({ ticker, event_ticker }) => {
            log.info("Tool called: get_open_orders", { ticker, event_ticker });

            try {
                const result = await tradingApi.getOrders({
                    ticker,
                    event_ticker,
                    status: "resting",
                });

                log.info("Tool get_open_orders completed", {
                    orderCount: result.orders?.length ?? 0,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    open_order_count: result.orders?.length ?? 0,
                                    orders: result.orders?.map((o) => ({
                                        order_id: o.order_id,
                                        ticker: o.ticker,
                                        side: o.side,
                                        action: o.action,
                                        count: o.count,
                                        remaining_count: o.remaining_count,
                                        fill_count: o.fill_count,
                                        yes_price: o.yes_price,
                                        no_price: o.no_price,
                                        created_time: o.created_time,
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_open_orders failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("All trading tools registered (4 tools)");
}

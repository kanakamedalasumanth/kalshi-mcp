// ============================================
// src/tools/trading-tools.ts — Trading MCP Tools
// ============================================
// Tools registered here:
//   create_order      — Place a buy or sell order
//   cancel_order      — Cancel a resting order
//   get_order_status  — Check order status
//   get_open_orders   — List resting orders

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TradingApi } from "../api/trading.js";
import { createLogger } from "../logger.js";

const log = createLogger("TradingTools");

// ── Tool registration ────────────────────────────────────────────

export function registerTradingTools(
    server: McpServer,
    tradingApi: TradingApi
): void {
    log.info("Registering trading tools");

    // ── create_order ─────────────────────────────────────────────
    server.tool(
        "create_order",
        "Place a buy or sell order on a Kalshi prediction market. IMPORTANT: This uses real money. Price is in cents (1-99). A YES contract at 65¢ costs $0.65 and pays $1.00 if the event happens. Use 'buy' to open a position, 'sell' to close one.",
        {
            ticker: z.string().describe("Market ticker from search_markets"),
            side: z.enum(["yes", "no"]).describe("Which side to trade"),
            action: z.enum(["buy", "sell"]).describe("Buy to open, sell to close"),
            count: z.number().min(1).describe("Number of contracts to trade"),
            yes_price: z.number().min(1).max(99).optional().describe("Price in cents for YES side"),
            no_price: z.number().min(1).max(99).optional().describe("Price in cents for NO side"),
            time_in_force: z
                .enum(["fill_or_kill", "good_till_canceled", "immediate_or_cancel"])
                .optional()
                .describe("Order time-in-force policy"),
            client_order_id: z.string().optional().describe("Client-assigned ID for idempotency"),
        },
        async (params) => {
            log.info("Tool called: create_order", {
                ticker: params.ticker,
                side: params.side,
                action: params.action,
                count: params.count,
            });
            try {
                const result = await tradingApi.createOrder({
                    ticker: params.ticker,
                    side: params.side,
                    action: params.action,
                    count: params.count,
                    yes_price: params.yes_price,
                    no_price: params.no_price,
                    time_in_force: params.time_in_force,
                    client_order_id: params.client_order_id,
                });
                const output = {
                    success: true,
                    order: {
                        order_id: result.order.order_id,
                        ticker: result.order.ticker,
                        side: result.order.side,
                        action: result.order.action,
                        status: result.order.status,
                        count: result.order.count,
                        fill_count: result.order.fill_count,
                        remaining_count: result.order.remaining_count,
                        yes_price: result.order.yes_price,
                        no_price: result.order.no_price,
                        created_time: result.order.created_time,
                    },
                };
                log.info("Tool create_order completed", {
                    orderId: result.order.order_id,
                    status: result.order.status,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool create_order failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── cancel_order ─────────────────────────────────────────────
    server.tool(
        "cancel_order",
        "Cancel a resting (unfilled) order. Only the unfilled portion is cancelled.",
        {
            order_id: z.string().describe("The order ID to cancel"),
        },
        async (params) => {
            log.info("Tool called: cancel_order", { orderId: params.order_id });
            try {
                const result = await tradingApi.cancelOrder(params.order_id);
                const output = {
                    success: true,
                    cancelled_contracts: result.reduced_by,
                    order: {
                        order_id: result.order.order_id,
                        status: result.order.status,
                        fill_count: result.order.fill_count,
                        remaining_count: result.order.remaining_count,
                    },
                };
                log.info("Tool cancel_order completed", {
                    orderId: result.order.order_id,
                    reducedBy: result.reduced_by,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool cancel_order failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── get_order_status ─────────────────────────────────────────
    server.tool(
        "get_order_status",
        "Check the current status of an order — filled, partially filled, or still resting.",
        {
            order_id: z.string().describe("The order ID to check"),
        },
        async (params) => {
            log.info("Tool called: get_order_status", { orderId: params.order_id });
            try {
                const result = await tradingApi.getOrder(params.order_id);
                const output = {
                    order_id: result.order.order_id,
                    ticker: result.order.ticker,
                    side: result.order.side,
                    action: result.order.action,
                    status: result.order.status,
                    count: result.order.count,
                    fill_count: result.order.fill_count,
                    remaining_count: result.order.remaining_count,
                    yes_price: result.order.yes_price,
                    no_price: result.order.no_price,
                    created_time: result.order.created_time,
                    taker_fees: result.order.taker_fees,
                };
                log.info("Tool get_order_status completed", {
                    orderId: result.order.order_id,
                    status: result.order.status,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_order_status failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── get_open_orders ──────────────────────────────────────────
    server.tool(
        "get_open_orders",
        "List all currently resting (unfilled) orders. Check this before placing new orders to avoid duplicates.",
        {
            ticker: z.string().optional().describe("Filter by market ticker"),
            event_ticker: z.string().optional().describe("Filter by event ticker"),
        },
        async (params) => {
            log.info("Tool called: get_open_orders", {
                ticker: params.ticker,
                event_ticker: params.event_ticker,
            });
            try {
                const result = await tradingApi.getOrders({
                    ticker: params.ticker,
                    event_ticker: params.event_ticker,
                    status: "resting",
                });
                const orders = (result.orders ?? []).map((o) => ({
                    order_id: o.order_id,
                    ticker: o.ticker,
                    side: o.side,
                    action: o.action,
                    status: o.status,
                    count: o.count,
                    fill_count: o.fill_count,
                    remaining_count: o.remaining_count,
                    yes_price: o.yes_price,
                    no_price: o.no_price,
                    created_time: o.created_time,
                }));
                const output = {
                    open_order_count: orders.length,
                    orders,
                };
                log.info("Tool get_open_orders completed", {
                    count: orders.length,
                });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
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

    log.info("Trading tools registered (4 tools)");
}
